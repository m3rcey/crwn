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
// A SQL migration cannot fix this class: deciding whether a subscription is live
// requires asking Stripe. Hence code.
//
// SAFETY: this only ever downgrades when Stripe positively says there is no live
// subscription. Any API error that is not "this subscription does not exist"
// leaves the row untouched, because wrongly downgrading a paying artist is worse
// than briefly trusting a stale row.

import type { SupabaseClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** Stripe statuses that mean money is (or is about to be) moving. */
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid']);

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
        live = LIVE_STATUSES.has(sub.status);
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
      live = list.data.some((s) => LIVE_STATUSES.has(s.status));
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
