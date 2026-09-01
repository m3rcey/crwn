// Free-tier enrollment — the ONE writer for a $0 membership row.
//
// Production's subscriptions.stripe_subscription_id is NOT NULL (verified against the live
// schema 2026-08-20), and neither free path supplied it, so every free join since launch
// failed: /api/stripe/free-subscribe answered 500 and the artist-page free branch reported
// success while writing nothing (it never read the upsert error). Zero free subscription
// rows existed in production when this was found.
//
// The fix that ships without waiting on a migration: a DETERMINISTIC synthetic id,
// `free_{fanId}_{artistId}`. Deterministic so the (fan_id, artist_id) upsert always writes
// the same value and the column's UNIQUE constraint holds; prefixed so no Stripe code path
// can mistake it for a real subscription (Stripe ids start with `sub_`). Any route that
// forwards a subscription id to Stripe must branch on isFreeSubscriptionId first
// (cancel and pause do).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { enrollInSequence, FREE_JOIN_TRIGGER } from '@/lib/sequences/enroll';

export const FREE_SUB_PREFIX = 'free_';

export function syntheticFreeSubId(fanId: string, artistId: string): string {
  return `${FREE_SUB_PREFIX}${fanId}_${artistId}`;
}

/** Is this stored id a synthetic free-membership marker (never send it to Stripe)? */
export function isFreeSubscriptionId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(FREE_SUB_PREFIX);
}

export type FreeJoinResult =
  | { status: 'joined'; tierId: string; artistId: string }
  | { status: 'already_member'; tierId: string; artistId: string }
  | { status: 'error'; reason: 'tier_not_found' | 'tier_not_free' | 'write_failed' };

/**
 * Enroll a fan in a free tier through the canonical path. Validates the tier server-side
 * (active, price 0), reports an existing active membership instead of overwriting it, and
 * upserts on the UNIQUE(fan_id, artist_id) constraint so a resubscribe reuses the row.
 * Callers own notifications; this function only moves the data.
 */
export async function joinFreeTier(
  admin: any,
  fanId: string,
  tierId: string,
): Promise<FreeJoinResult> {
  const { data: tier, error: tierError } = await admin
    .from('subscription_tiers')
    .select('id, name, price, artist_id')
    .eq('id', tierId)
    .eq('is_active', true)
    .single();

  if (tierError || !tier) return { status: 'error', reason: 'tier_not_found' };
  if (tier.price > 0) return { status: 'error', reason: 'tier_not_free' };

  const { data: existing } = await admin
    .from('subscriptions')
    .select('id, tier_id')
    .eq('fan_id', fanId)
    .eq('artist_id', tier.artist_id)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    return { status: 'already_member', tierId: existing.tier_id, artistId: tier.artist_id };
  }

  const { error: insertError } = await admin
    .from('subscriptions')
    .upsert({
      fan_id: fanId,
      artist_id: tier.artist_id,
      tier_id: tier.id,
      stripe_subscription_id: syntheticFreeSubId(fanId, tier.artist_id),
      status: 'active',
      started_at: new Date().toISOString(),
    }, { onConflict: 'fan_id,artist_id' });

  if (insertError) {
    console.error('[freeJoin] subscriptions upsert failed:', insertError.message);
    return { status: 'error', reason: 'write_failed' };
  }

  // Nurture. Paid subscriptions have enrolled through the Stripe webhook since launch;
  // free joins enrolled in nothing, so the whole top of an artist's funnel ended after a
  // single delivery email. This is the one canonical free-membership writer, so it is the
  // one correct place to close that.
  //
  // OPT-IN: enrollInSequence looks for an ACTIVE sequence on the `free_join` trigger and
  // returns silently when the artist has none. No sequence carries that trigger until an
  // artist deliberately builds one, so no existing artist starts emailing their free
  // members because of this line.
  //
  // Fires only on a genuinely NEW membership, never on `already_member`, and the helper
  // additionally refuses to re-enrol a fan already active or completed on the sequence, so
  // a re-join or a resubscribe cannot produce a second run. Awaited but never able to
  // throw, so nurture can never fail the join itself.
  await enrollInSequence(admin, tier.artist_id, fanId, FREE_JOIN_TRIGGER);

  return { status: 'joined', tierId: tier.id, artistId: tier.artist_id };
}
