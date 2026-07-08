import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';

// Collaborator cashout for Team Splits — the exact analogue of fan-cashout,
// but backed by team_split_earnings / team_split_payouts / atomic_team_split_cashout
// so a collaborator's split balance never mixes with their fan-referral balance.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const allowed = await checkRateLimit(user.id, 'team-split-cashout', 60, 1);
    if (!allowed) return NextResponse.json({ error: 'Please wait before trying again' }, { status: 429 });

    const { data: profile } = await supabase
      .from('profiles').select('stripe_connect_id').eq('id', user.id).single();
    if (!profile?.stripe_connect_id) {
      return NextResponse.json({ error: 'Stripe not connected. Set up payouts first.' }, { status: 400 });
    }

    const { data: payoutId } = await supabaseAdmin.rpc('atomic_team_split_cashout', {
      p_collaborator_id: user.id,
      p_min_amount: 2500,
    });
    if (!payoutId) {
      return NextResponse.json({ error: 'Minimum cashout is $25.00, or a cashout is already in progress.' }, { status: 400 });
    }

    const { data: payout } = await supabaseAdmin
      .from('team_split_payouts').select('id, amount').eq('id', payoutId).single();
    if (!payout) return NextResponse.json({ error: 'Payout record not found' }, { status: 500 });

    try {
      const transfer = await stripe.transfers.create({
        amount: payout.amount,
        currency: 'usd',
        destination: profile.stripe_connect_id,
        metadata: { collaborator_id: user.id, payout_id: payout.id, type: 'team_split_cashout' },
      });
      await supabaseAdmin.from('team_split_payouts')
        .update({ stripe_transfer_id: transfer.id, status: 'completed' })
        .eq('id', payout.id);

      // NOTE: we deliberately do NOT flip accrual rows to 'paid'. Exactly like
      // fan-cashout, the team_split_payouts table is the single source of truth
      // for "already paid" — the cashout RPC subtracts completed+pending payouts
      // from the cashable sum, so flipping accrual status would be redundant and
      // could desync the two accounting paths.
      return NextResponse.json({ success: true, amount: payout.amount, transferId: transfer.id });
    } catch (stripeErr) {
      await supabaseAdmin.from('team_split_payouts')
        .update({ status: 'failed', failure_reason: 'stripe_transfer_failed' })
        .eq('id', payout.id);
      throw stripeErr;
    }
  } catch (error) {
    console.error('Team split cashout error:', error);
    return NextResponse.json({ error: 'Failed to process cashout' }, { status: 500 });
  }
}
