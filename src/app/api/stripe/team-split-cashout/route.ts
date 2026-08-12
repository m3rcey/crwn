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

    // ---------------------------------------------------------------------
    // F-3 FUNDING GUARD. Do not remove without the funding change below.
    // ---------------------------------------------------------------------
    // Ratified rule: a Team Split is an ARTIST-funded revenue share, carved from
    // the artist's qualifying net. CRWN platform revenue must never fund it.
    //
    // Today the code cannot honour that rule. Trace it on a $100 sale, Launch plan:
    //   - checkout takes application_fee_percent = 12, so CRWN receives $12 and
    //     the remaining $88 is settled straight into the ARTIST's Connect account
    //     (destination charge).
    //   - earnings.net_amount records $88 for the artist.
    //   - a 50% split accrues $44 to the collaborator.
    //   - this route then calls stripe.transfers.create WITHOUT source_transaction,
    //     so the $44 leaves CRWN's OWN platform balance, which only ever held $12.
    //   - meanwhile /api/stripe/cashout still pays the artist their full $88.
    // Net effect: CRWN collects $12 and pays out $44 on that sale. The platform
    // subsidises every collaborator, silently, forever.
    //
    // The referral rail already solves this correctly and is the model to copy:
    // src/app/api/stripe/checkout/route.ts adds the commission to
    // application_fee_percent (effectiveFeePercent = platformFeePercent + attributedCut),
    // so the money is WITHHELD at charge time and CRWN pays out of funds it holds.
    // Applying that to splits changes what an artist receives per sale, and cannot
    // retroactively fund accruals from charges that already settled, so it is a
    // founder + Stripe topology decision, not a refactor. It is written up in
    // docs/CYBERSECURITY_AUDIT_2026-08-12.md (F-3) and TODO.md.
    //
    // Until that lands, this rail fails CLOSED. Verified safe to close: production
    // holds 0 team_split_deals, 0 team_split_earnings and 0 team_split_payouts, so
    // no collaborator is owed anything and nobody is harmed by refusing. A loud
    // refusal is strictly better than a silent transfer of CRWN's own money.
    // Annotated `boolean` rather than inferred as the literal `false` on purpose:
    // a literal would let TypeScript prove the rest of this handler unreachable, and
    // narrowing is discarded in unreachable code, which turns every already-guarded
    // value below into a "possibly null" error. Flip this to true in the same commit
    // that implements the funding change.
    const cashoutFundingReady: boolean = false;
    if (!cashoutFundingReady) {
      return NextResponse.json(
        {
          error:
            'Team Split cashout is temporarily unavailable while we finalise how collaborator payouts are funded. Your balance is safe and nothing has been lost. Please contact support and we will settle it manually.',
          code: 'TEAM_SPLIT_FUNDING_PENDING',
        },
        { status: 503 },
      );
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
