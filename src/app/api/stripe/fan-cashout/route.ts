import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'fan-cashout', 60, 1);
    if (!allowed) {
      return NextResponse.json({ error: 'Please wait before trying again' }, { status: 429 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_connect_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_connect_id) {
      return NextResponse.json({ error: 'Stripe not connected. Set up payouts first.' }, { status: 400 });
    }

    // Atomic balance check + payout insert (prevents race condition)
    const { data: payoutId } = await supabaseAdmin.rpc('atomic_fan_cashout', {
      p_fan_id: user.id,
      p_min_amount: 2500,
    });

    if (!payoutId) {
      return NextResponse.json({
        error: 'Minimum cashout is $25.00 or cashout already in progress.'
      }, { status: 400 });
    }

    // Get the payout record to know the amount
    const { data: payout } = await supabaseAdmin
      .from('fan_payouts')
      .select('id, amount')
      .eq('id', payoutId)
      .single();

    if (!payout) {
      return NextResponse.json({ error: 'Payout record not found' }, { status: 500 });
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: payout.amount,
        currency: 'usd',
        destination: profile.stripe_connect_id,
        metadata: {
          fan_id: user.id,
          payout_id: payout.id,
          type: 'fan_referral_cashout',
        },
      });

      await supabaseAdmin
        .from('fan_payouts')
        .update({
          stripe_transfer_id: transfer.id,
          status: 'completed',
        })
        .eq('id', payout.id);

      return NextResponse.json({
        success: true,
        amount: payout.amount,
        transferId: transfer.id,
      });
    } catch (stripeErr) {
      // Stripe transfer failed — mark payout as failed so balance isn't stuck
      await supabaseAdmin
        .from('fan_payouts')
        .update({ status: 'failed' })
        .eq('id', payout.id);

      throw stripeErr;
    }
  } catch (error) {
    console.error('Fan cashout error:', error);
    return NextResponse.json({ error: 'Failed to process cashout' }, { status: 500 });
  }
}
