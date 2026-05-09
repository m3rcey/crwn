import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { notifyCashout } from '@/lib/notifications';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { cashoutEmail } from '@/lib/emails/cashout';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const CASHOUT_FEE_CENTS = 200;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'cashout', 60, 1);
    if (!allowed) {
      return NextResponse.json({ error: 'Please wait before trying again' }, { status: 429 });
    }

    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id, stripe_connect_id')
      .eq('user_id', user.id)
      .single();

    if (!artist?.stripe_connect_id) {
      return NextResponse.json({ error: 'No Stripe account connected' }, { status: 400 });
    }

    const balance = await stripe.balance.retrieve({
      stripeAccount: artist.stripe_connect_id,
    });

    const availableBalance = balance.available.reduce((sum, b) => sum + b.amount, 0);

    if (availableBalance <= CASHOUT_FEE_CENTS) {
      return NextResponse.json({
        error: `Insufficient balance. You need more than $2.00 to cash out. Current balance: $${(availableBalance / 100).toFixed(2)}`,
      }, { status: 400 });
    }

    const payoutAmount = availableBalance - CASHOUT_FEE_CENTS;

    const payout = await stripe.payouts.create(
      {
        amount: payoutAmount,
        currency: 'usd',
      },
      {
        stripeAccount: artist.stripe_connect_id,
      }
    );

    // Best-effort: in-app notification + email receipt. Never block the response.
    try {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
      );

      await notifyCashout(supabaseAdmin, user.id, payoutAmount);

      if (user.email) {
        const { data: nameRow } = await supabaseAdmin
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        const displayName = nameRow?.display_name || 'there';

        await resend.emails.send({
          from: FROM_EMAIL,
          to: user.email,
          subject: `Cashout sent: $${(payoutAmount / 100).toFixed(2)}`,
          html: cashoutEmail({
            displayName,
            amount: payoutAmount,
            fee: CASHOUT_FEE_CENTS,
            payoutId: payout.id,
          }),
        });
      }
    } catch (notifyErr) {
      console.error('Cashout notification/email failed:', notifyErr);
    }

    return NextResponse.json({
      success: true,
      payoutId: payout.id,
      amount: payoutAmount,
      fee: CASHOUT_FEE_CENTS,
      total: availableBalance,
    });
  } catch (err: unknown) {
    console.error('Cashout error:', err);
    const message = err instanceof Error ? err.message : 'Cashout failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
