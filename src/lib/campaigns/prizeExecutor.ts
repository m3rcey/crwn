// fulfillCampaignPrize: the ONE operation that turns a campaign prize into a membership.
//
// SERVER ONLY. Takes a service-role client and the app's Stripe client by injection, so the
// tests run it against fakes and nothing here can be reached from a browser. Every fact it
// acts on is resolved from rows it reads itself: the caller supplies three POINTERS (campaign,
// fan, acting artist) and nothing else. Not the tier, not the duration, not the discount, not
// the price, not a date. A caller who could pass any of those could pass the wrong one.
//
// THE AUTHORIZATION CHAIN, in order, each step refusing on its own:
//   1. the campaign exists and belongs to the acting artist
//   2. the campaign has ended or is active (a draft has no winner to pay)
//   3. the fan is a participant of THIS campaign
//   4. the prize tier is configured on the campaign, belongs to the artist, and has a Stripe price
//   5. no OTHER fan already holds this campaign's prize (one prize per campaign)
//   6. the pure planner accepts the fan's current membership state
//
// WHAT IS DELIBERATELY NOT HERE. There is no "selected winner" check, because
// fan_campaign_participants cannot record one (see PRIZE_RAIL in prizeState.ts). That is why
// no HTTP endpoint calls this yet: an endpoint that let an artist name any participant would
// make the request itself the selection, with no durable record of it having been made.
//
// IDEMPOTENCY, three layers deep. The subscription row carrying `prize_campaign_id` is the
// durable "done" (the planner returns already_fulfilled on it). Beneath that, the Stripe
// schedule's metadata names the campaign, so a retry after a failed DB write finds the
// schedule instead of building a second one. Beneath THAT, every Stripe create carries a
// deterministic idempotency key, so even a retry inside Stripe's window cannot double-create.
// Twelve months can never become twenty-four.
//
// ORDER OF WRITES: Stripe first, then the row. A failure between them leaves a schedule that
// the next attempt recognises and repairs against; the reverse order would leave a row
// claiming a prize Stripe never built.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { planPrizeFulfillment, PRIZE_MONTHS, type CurrentSubscription } from './prizeFulfillment';
import { prizeTierIdOf } from './prizeState';
import {
  immediatePrizeScheduleParams,
  prizeCouponParams,
  prizeDefaultSettings,
  prizeIdempotencyKey,
  prizePhase,
  scheduledPrizeUpdateParams,
} from './prizeStripe';
import { recordTierTransition } from '@/lib/tierTransitionStore';

export interface PrizeExecutorDeps {
  db: SupabaseClient;
  stripe: Stripe;
  /** Reads through src/lib/stripe/connectAccount.ts in production; a stub in tests. */
  connectAccountFor: (artistId: string) => Promise<string | null>;
  feePercentFor: (artistId: string) => Promise<number>;
  now?: () => Date;
}

export interface FulfillPrizeInput {
  campaignId: string;
  fanId: string;
  /** The artist the AUTHENTICATED actor is authorised for. Never a value from a request body. */
  actorArtistId: string;
}

export type PrizeRefusal =
  | 'campaign_not_found'
  | 'not_owner'
  | 'campaign_not_awardable'
  | 'not_a_participant'
  | 'prize_tier_missing'
  | 'prize_tier_not_ready'
  | 'already_awarded_to_another_fan'
  | 'plan_refused'
  | 'stripe_failed'
  | 'db_failed';

export type PrizeOutcome =
  | {
      ok: true;
      action: 'already_fulfilled' | 'created_now' | 'scheduled';
      stripeSubscriptionId: string | null;
      stripeScheduleId: string | null;
      /** ISO. When the prize begins: now for an immediate prize, the renewal boundary otherwise. */
      startsAt: string | null;
      months: number;
    }
  | { ok: false; code: PrizeRefusal; reason: string };

const refuse = (code: PrizeRefusal, reason: string): PrizeOutcome => ({ ok: false, code, reason });

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function prizeMonthsOf(toolkit: Record<string, unknown> | null | undefined): number {
  const v = toolkit?.prize_months;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : PRIZE_MONTHS;
}

export async function fulfillCampaignPrize(deps: PrizeExecutorDeps, input: FulfillPrizeInput): Promise<PrizeOutcome> {
  const { db, stripe } = deps;
  const now = deps.now ? deps.now() : new Date();

  if (!isUuid(input.campaignId) || !isUuid(input.fanId) || !isUuid(input.actorArtistId)) {
    return refuse('campaign_not_found', 'Malformed identifier.');
  }

  // 1. Campaign, and ownership. Read by id alone and then compared, so a mismatch is a
  //    refusal with a reason rather than a silent "not found".
  const { data: campaign } = await db
    .from('fan_campaigns')
    .select('id, artist_id, status, title, toolkit')
    .eq('id', input.campaignId)
    .maybeSingle();
  if (!campaign) return refuse('campaign_not_found', 'No such campaign.');
  if (campaign.artist_id !== input.actorArtistId) {
    return refuse('not_owner', 'This campaign belongs to a different artist.');
  }

  // 2. A draft has never run, so it has no participants and no winner. Awarding from one would
  //    be awarding from nothing. Every other state may award: `ended` is the normal case,
  //    `archived` is an ended campaign the artist tidied away, and a winner recorded before
  //    archiving is still owed their prize. `active` is reachable only by a direct caller,
  //    because the endpoint requires a RECORDED winner and a winner cannot be recorded while
  //    entries are open (winnerSelection.ts).
  if (campaign.status === 'draft') {
    return refuse('campaign_not_awardable', 'A draft campaign has no entrants, so it cannot award a prize.');
  }

  // 3. Participation in THIS campaign. A fan of the artist who never joined is not a candidate.
  const { data: participant } = await db
    .from('fan_campaign_participants')
    .select('fan_id')
    .eq('campaign_id', campaign.id)
    .eq('fan_id', input.fanId)
    .maybeSingle();
  if (!participant) return refuse('not_a_participant', 'This fan did not take part in the campaign.');

  // 4. The prize tier: configured on the campaign, owned by the artist, Stripe-priced.
  const toolkit = (campaign.toolkit ?? {}) as Record<string, unknown>;
  const prizeTierId = prizeTierIdOf(toolkit);
  if (!prizeTierId) return refuse('prize_tier_missing', 'The campaign has no prize tier configured.');
  const { data: tier } = await db
    .from('subscription_tiers')
    .select('id, name, price, stripe_price_id, artist_id, is_active')
    .eq('id', prizeTierId)
    .eq('artist_id', campaign.artist_id)
    .maybeSingle();
  if (!tier || !tier.is_active) return refuse('prize_tier_not_ready', 'The prize tier is not an active tier of this artist.');
  if (!tier.stripe_price_id) return refuse('prize_tier_not_ready', 'The prize tier has no Stripe price yet. Connect Stripe first.');
  const months = prizeMonthsOf(toolkit);

  // 5. One prize per campaign. Another fan already holding it is a hard stop.
  const { data: otherHolder } = await db
    .from('subscriptions')
    .select('fan_id')
    .eq('prize_campaign_id', campaign.id)
    .neq('fan_id', input.fanId)
    .limit(1)
    .maybeSingle();
  if (otherHolder) return refuse('already_awarded_to_another_fan', 'This campaign prize has already been awarded.');

  // 6. The fan's current membership with this artist, and the plan.
  const { data: currentRow } = await db
    .from('subscriptions')
    .select('id, tier_id, status, stripe_subscription_id, stripe_customer_id, current_period_end, prize_campaign_id, pending_tier_id, cancel_at_period_end')
    .eq('fan_id', input.fanId)
    .eq('artist_id', campaign.artist_id)
    .maybeSingle();

  let currentTierPriceCents = 0;
  if (currentRow?.tier_id) {
    const { data: curTier } = await db
      .from('subscription_tiers')
      .select('price')
      .eq('id', currentRow.tier_id)
      .maybeSingle();
    currentTierPriceCents = Number(curTier?.price) || 0;
  }

  const plan = planPrizeFulfillment({
    prizeTierId: tier.id,
    campaignId: campaign.id,
    current: (currentRow as CurrentSubscription | null) ?? null,
    currentTierPriceCents,
    months,
  });

  if (plan.action === 'already_fulfilled') {
    return {
      ok: true,
      action: 'already_fulfilled',
      stripeSubscriptionId: currentRow?.stripe_subscription_id ?? null,
      stripeScheduleId: null,
      startsAt: null,
      months,
    };
  }
  if (plan.action === 'refuse') return refuse('plan_refused', plan.reason);

  // Shared Stripe facts.
  const metadata = {
    crwn_prize_campaign_id: campaign.id,
    crwn_fan_id: input.fanId,
    crwn_artist_id: campaign.artist_id,
    crwn_tier_id: tier.id,
  };

  let couponId: string;
  try {
    couponId = await ensureCoupon(stripe, campaign.id, months, `Prize: ${campaign.title}`);
  } catch (e) {
    return refuse('stripe_failed', 'Could not prepare the prize discount: ' + message(e));
  }

  const phase = prizePhase({ stripePriceId: tier.stripe_price_id, couponId, months, metadata });

  // ── Immediate ───────────────────────────────────────────────────────────────
  if (plan.action === 'create_now') {
    let scheduleId: string;
    let stripeSub: Stripe.Subscription;
    try {
      const customerId = await ensureCustomer(deps, input.fanId, currentRow?.stripe_customer_id ?? null);
      const [connect, fee] = await Promise.all([
        deps.connectAccountFor(campaign.artist_id),
        deps.feePercentFor(campaign.artist_id),
      ]);
      const schedule = await stripe.subscriptionSchedules.create(
        immediatePrizeScheduleParams({
          customerId,
          phase,
          defaultSettings: prizeDefaultSettings(connect, fee),
          metadata,
        }) as Stripe.SubscriptionScheduleCreateParams,
        { idempotencyKey: prizeIdempotencyKey(campaign.id, input.fanId, 'immediate') },
      );
      scheduleId = schedule.id;
      const subId = typeof schedule.subscription === 'string' ? schedule.subscription : schedule.subscription?.id;
      if (!subId) return refuse('stripe_failed', 'Stripe created the schedule but no subscription behind it.');
      stripeSub = await stripe.subscriptions.retrieve(subId);
    } catch (e) {
      return refuse('stripe_failed', 'Stripe refused the prize subscription: ' + message(e));
    }

    // Captured BEFORE the row write, so the transition records where the fan actually came
    // from rather than what the row reads after it has been moved.
    const fromTierId = currentRow?.status === 'active' ? (currentRow.tier_id ?? null) : null;

    // The ONE membership row for (fan, artist). A free Bronze fan already holds it and it is
    // updated in place, never duplicated: same fan, same artist, uninterrupted entitlement.
    const item = stripeSub.items?.data?.[0] as unknown as { current_period_start?: number; current_period_end?: number } | undefined;
    const legacy = stripeSub as unknown as { current_period_start?: number; current_period_end?: number };
    const periodStart = item?.current_period_start ?? legacy.current_period_start;
    const periodEnd = item?.current_period_end ?? legacy.current_period_end;
    const row = {
      fan_id: input.fanId,
      artist_id: campaign.artist_id,
      tier_id: tier.id,
      stripe_subscription_id: stripeSub.id,
      stripe_customer_id: typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id ?? null,
      status: 'active',
      started_at: now.toISOString(),
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : now.toISOString(),
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: false,
      canceled_at: null,
      pending_tier_id: null,
      // Null means "active now": there is no boundary to wait for.
      pending_change_date: null,
      prize_campaign_id: campaign.id,
      updated_at: now.toISOString(),
    };

    const write = currentRow
      ? await db.from('subscriptions').update(row).eq('id', currentRow.id)
      : await db.from('subscriptions').insert(row);
    if (write.error) return refuse('db_failed', 'Stripe built the prize but the membership row failed: ' + write.error.message);

    await recordTierTransition(db, {
      artistId: campaign.artist_id,
      fanId: input.fanId,
      subscriptionId: currentRow?.id ?? null,
      fromTierId,
      toTierId: tier.id,
      source: 'campaign_prize',
      evidence: 'observed',
      occurredAt: now.toISOString(),
    });

    return { ok: true, action: 'created_now', stripeSubscriptionId: stripeSub.id, stripeScheduleId: scheduleId, startsAt: now.toISOString(), months };
  }

  // ── Scheduled at the paid boundary ───────────────────────────────────────────
  let scheduleId: string;
  try {
    const stripeSub = await stripe.subscriptions.retrieve(plan.fromStripeSubscriptionId);
    const existingScheduleId = typeof stripeSub.schedule === 'string' ? stripeSub.schedule : stripeSub.schedule?.id ?? null;

    if (existingScheduleId) {
      // A schedule already exists. Ours (a retry after a failed row write) is reused; anyone
      // else's is a hard stop, because appending to a schedule with unknown intentions is
      // exactly the "two intentions in one column" problem the planner refuses on.
      const existing = await stripe.subscriptionSchedules.retrieve(existingScheduleId);
      if (existing.metadata?.crwn_prize_campaign_id !== campaign.id) {
        return refuse('plan_refused', 'This subscription already carries a schedule that is not this prize.');
      }
      scheduleId = existing.id;
    } else {
      const created = await stripe.subscriptionSchedules.create(
        { from_subscription: plan.fromStripeSubscriptionId },
        { idempotencyKey: prizeIdempotencyKey(campaign.id, input.fanId, 'from-subscription') },
      );
      const ph0 = created.phases[0];
      const existingPhase = {
        items: ph0.items.map((i) => ({
          price: typeof i.price === 'string' ? i.price : (i.price as { id: string }).id,
          quantity: i.quantity ?? 1,
        })),
        start_date: ph0.start_date,
        end_date: ph0.end_date,
      };
      const updated = await stripe.subscriptionSchedules.update(
        created.id,
        scheduledPrizeUpdateParams({ existingPhase, phase, metadata }) as Stripe.SubscriptionScheduleUpdateParams,
        { idempotencyKey: prizeIdempotencyKey(campaign.id, input.fanId, 'append-prize') },
      );
      scheduleId = updated.id;
    }
  } catch (e) {
    return refuse('stripe_failed', 'Stripe refused to schedule the prize: ' + message(e));
  }

  // The row: the prize is attributed NOW (idempotency), but it is not ACTIVE until the boundary
  // (see prizeState.ts). pending_tier_id is set only when the tier actually changes; a
  // Platinum winner keeps Platinum, so the webhook's apply branch has nothing to apply and
  // the date alone turns the prize active.
  const tierChanges = currentRow?.tier_id !== tier.id;
  const patch = {
    prize_campaign_id: campaign.id,
    pending_change_date: plan.startsAt,
    ...(tierChanges ? { pending_tier_id: tier.id } : {}),
    updated_at: now.toISOString(),
  };
  const { error } = await db.from('subscriptions').update(patch).eq('id', currentRow!.id);
  if (error) return refuse('db_failed', 'Stripe scheduled the prize but the membership row failed: ' + error.message);

  return { ok: true, action: 'scheduled', stripeSubscriptionId: plan.fromStripeSubscriptionId, stripeScheduleId: scheduleId, startsAt: plan.startsAt, months };
}

/** One coupon per campaign, found again on retry by its deterministic id. */
async function ensureCoupon(stripe: Stripe, campaignId: string, months: number, label: string): Promise<string> {
  const params = prizeCouponParams(campaignId, months, label);
  try {
    const c = await stripe.coupons.create(params as Stripe.CouponCreateParams);
    return c.id;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'resource_already_exists') {
      const c = await stripe.coupons.retrieve(params.id);
      return c.id;
    }
    throw e;
  }
}

/** The fan's Stripe customer: the one on their row, else found by email, else created. */
async function ensureCustomer(deps: PrizeExecutorDeps, fanId: string, knownCustomerId: string | null): Promise<string> {
  if (knownCustomerId) return knownCustomerId;
  const { data: authUser } = await deps.db.auth.admin.getUserById(fanId);
  const email = authUser?.user?.email;
  if (!email) throw new Error('The fan has no email on their account.');
  const existing = await deps.stripe.customers.list({ email, limit: 1 });
  if (existing.data.length) return existing.data[0].id;
  const { data: profile } = await deps.db.from('profiles').select('display_name').eq('id', fanId).maybeSingle();
  const created = await deps.stripe.customers.create({
    email,
    name: profile?.display_name || undefined,
    metadata: { fan_id: fanId },
  });
  return created.id;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
