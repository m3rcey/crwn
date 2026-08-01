// platformPlanReconcile.ts — SERVER ONLY. The ONE place that checks an artist's
// stored platform plan against Stripe and corrects it.
//
// Why this exists (Josh's live test, 2026-08-01): `artist_profiles` can claim a
// paid plan with nothing billing behind it. Production had exactly that: tier
// 'pro', status 'active', a platform_stripe_subscription_id pointing at a
// subscription that no longer exists in Stripe. Every platform webhook handler
// looks the artist up by that subscription id and RETURNS EARLY on a miss, so a
// subscription deleted in Stripe (or created in test mode) never downgrades the
// row. The result is an account that is treated as paying, cannot open the
// billing portal, cannot cancel, and shows its plan as "current" in the picker.
//
// Confirmed cause in production (Josh, 2026-08-01): he subscribed to Pro while
// Stripe was in TEST mode. The test webhook wrote platform_tier 'pro' and a
// TEST-mode subscription id, which the LIVE api answers with resource_missing
// forever. Test-mode traffic writing to the production database is exactly how a
// row ends up claiming a plan nobody is paying for.
//
// A SQL migration cannot fix this class: deciding whether a subscription is live
// requires asking Stripe. Hence code.
//
// SAFETY: this only ever downgrades when Stripe positively says there is no live
// subscription. Any API error that is not "this subscription does not exist"
// leaves the row untouched, because wrongly downgrading a paying artist is worse
// than briefly trusting a stale row.

import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { STRIPE_PRICE_IDS, TIER_PRICING } from '@/lib/platformTier';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** Stripe statuses that mean money is (or is about to be) moving. */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid']);

/**
 * Is this subscription one of CRWN's own PLATFORM PLANS (Pro/Scale), as opposed
 * to any other subscription sitting on the same Stripe customer?
 *
 * This distinction is the whole ballgame. Fan tier subscriptions live on the
 * SAME platform Stripe account, and in production one artist's platform customer
 * carried an active $10/month FAN tier subscription. Treating "has any live
 * subscription" as "is on a paid plan" made that artist permanently look like a
 * Pro subscriber: the reconciler refused to correct the row and checkout refused
 * to sell them a real plan.
 *
 * Matched by configured price id first, then by amount as a backstop so a plan
 * still resolves if an env var is momentarily unset.
 */
const PLAN_AMOUNTS = new Set<number>([
  TIER_PRICING.pro.monthly,
  TIER_PRICING.pro.annual,
  TIER_PRICING.scale.monthly,
  TIER_PRICING.scale.annual,
]);

export function isPlatformPlanSubscription(sub: Stripe.Subscription): boolean {
  const planPriceIds = new Set(Object.values(STRIPE_PRICE_IDS).filter(Boolean));
  return sub.items.data.some((item) => {
    const price = item.price;
    if (price?.id && planPriceIds.has(price.id)) return true;
    return typeof price?.unit_amount === 'number' && PLAN_AMOUNTS.has(price.unit_amount);
  });
}

export interface PlatformPlanState {
  tier: string;
  status: string | null;
  /** True when this call corrected a stale row. */
  reconciled: boolean;
}

export async function reconcilePlatformPlan(admin: Db, artistId: string): Promise<PlatformPlanState | null> {
  const { data: artist } = await admin
    .from('artist_profiles')
    .select('id, platform_tier, platform_subscription_status, platform_stripe_subscription_id, platform_stripe_customer_id')
    .eq('id', artistId)
    .maybeSingle();

  if (!artist) return null;

  const tier: string = artist.platform_tier || 'starter';
  const status: string | null = artist.platform_subscription_status ?? null;

  // Only a row CLAIMING a paid plan can be wrong in the direction that matters.
  // A 'starter' row that secretly has a live subscription is handled by the
  // checkout guard, which asks Stripe before selling anything.
  if (tier === 'starter') return { tier, status, reconciled: false };

  let live = false;
  try {
    if (artist.platform_stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(artist.platform_stripe_subscription_id as string);
        live = LIVE_STATUSES.has(sub.status) && isPlatformPlanSubscription(sub);
      } catch (err) {
        // resource_missing is the answer we want: the subscription is gone.
        // Anything else is an outage, and we must not act on it.
        const code = (err as { code?: string })?.code;
        if (code !== 'resource_missing') throw err;
      }
    }

    // Belt and braces: the stored id can be stale while a NEWER subscription
    // exists on the same customer (the webhook overwrites a single column).
    if (!live && artist.platform_stripe_customer_id) {
      const list = await stripe.subscriptions.list({
        customer: artist.platform_stripe_customer_id as string,
        status: 'all',
        limit: 10,
      });
      live = list.data.some((s) => LIVE_STATUSES.has(s.status) && isPlatformPlanSubscription(s));
    }
  } catch (err) {
    console.error('[platformPlanReconcile] Stripe unreachable, leaving the row alone', err);
    return { tier, status, reconciled: false };
  }

  if (live) return { tier, status, reconciled: false };

  // Stripe says nothing is billing. Clear the claim.
  const { error } = await admin
    .from('artist_profiles')
    .update({
      platform_tier: 'starter',
      platform_subscription_status: null,
      platform_stripe_subscription_id: null,
    })
    .eq('id', artistId);

  if (error) {
    console.error('[platformPlanReconcile] could not clear stale plan', error);
    return { tier, status, reconciled: false };
  }

  console.log('[platformPlanReconcile] cleared a plan with no live Stripe subscription', { artistId, was: tier });
  return { tier: 'starter', status: null, reconciled: true };
}
