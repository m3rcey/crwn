// POST /api/fan-campaigns/[id]/fulfill-prize — deliver the prize to the RECORDED winner.
//
// THE REQUEST BODY IS IGNORED ENTIRELY. Everything that decides money is read server-side from
// canonical rows: the winner from `fan_campaign_participants.selected_winner_at`, the artist
// from the session, the prize tier / duration from the campaign's own configuration, the Stripe
// price from that tier, and the schedule and cancellation from the proven construction in
// prizeStripe.ts. A browser cannot name a fan, a tier, a duration, a discount, a price or a
// date, because there is nothing here that reads one. That is the whole attack surface, closed
// by having no inputs rather than by validating them.
//
// This is NOT a "grant a free tier" endpoint. It can only ever deliver the ONE tier the campaign
// configured, to the ONE participant a prior act recorded as the winner, once. With no recorded
// winner it refuses, so it cannot be used to hand anybody a membership.
//
// Fulfilment state is DERIVED, never stored twice: the planner reads
// `subscriptions.prize_campaign_id` and answers `already_fulfilled`, so a retry is safe and no
// "fulfilled" column exists to disagree with the subscription.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';
import { readCampaign, selectedWinner } from '@/lib/campaigns/store';
import { fulfillCampaignPrize } from '@/lib/campaigns/prizeExecutor';
import { getConnectAccountByArtistId } from '@/lib/stripe/connectAccount';
import { getArtistFeePercent } from '@/lib/platformTier';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** A refusal the artist can act on, mapped from the executor's machine-readable code. */
const STATUS: Record<string, number> = {
  campaign_not_found: 404,
  not_owner: 404,
  campaign_not_awardable: 409,
  not_a_participant: 409,
  prize_tier_missing: 409,
  prize_tier_not_ready: 409,
  already_awarded_to_another_fan: 409,
  plan_refused: 409,
  stripe_failed: 502,
  db_failed: 500,
};

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  // Not-found rather than forbidden: a 403 would confirm the campaign exists.
  const campaign = await readCampaign(supabaseAdmin, id);
  if (!campaign || campaign.artist_id !== artist.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // The winner is DERIVED. With none recorded there is nobody to pay, and this route has no
  // other way to learn a fan id, which is what stops it being a general grant capability.
  const winner = await selectedWinner(supabaseAdmin, campaign.id);
  if (!winner) {
    return NextResponse.json(
      { error: 'No winner has been recorded for this campaign yet.' },
      { status: 409 },
    );
  }

  const outcome = await fulfillCampaignPrize(
    {
      db: supabaseAdmin,
      stripe,
      connectAccountFor: getConnectAccountByArtistId,
      feePercentFor: getArtistFeePercent,
    },
    { campaignId: campaign.id, fanId: winner.fan_id, actorArtistId: artist.id },
  );

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.reason, code: outcome.code }, { status: STATUS[outcome.code] ?? 400 });
  }

  return NextResponse.json({
    fulfilled: true,
    action: outcome.action,
    startsAt: outcome.startsAt,
    months: outcome.months,
  });
}
