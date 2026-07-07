// promiseTasks.ts — SERVER ONLY. New-subscriber auto-population for the Promise
// Calendar. Called from the Stripe webhook AFTER the money path has settled, so
// everything here is best-effort and must never throw into the webhook.

import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

// The only honest "VIP" signal in the schema is price. Tiers at/above this get a
// personal-welcome fulfillment task on the artist's Promise Calendar.
export const VIP_WELCOME_THRESHOLD_CENTS = 2500; // $25/mo

/**
 * When a high-ticket ("VIP") supporter joins, drop a 48h "send a personal welcome"
 * task onto the artist's Promise Calendar. One-off obligation + one event.
 * Idempotent per (artist, fan, tier) so a resubscribe doesn't stack duplicates.
 * Returns true if a task was created.
 */
export async function maybeCreateVipWelcomeTask(
  admin: Admin,
  args: {
    artistId: string;
    artistUserId: string;
    tierId: string;
    tierName: string;
    fanId: string;
    fanName: string;
    tierPriceCents: number;
  },
): Promise<boolean> {
  const { artistId, artistUserId, tierId, tierName, fanId, fanName, tierPriceCents } = args;
  if (!tierPriceCents || tierPriceCents < VIP_WELCOME_THRESHOLD_CENTS) return false;

  // Idempotency: skip if an unfinished welcome task for this fan+tier already exists.
  const { data: existing } = await admin
    .from('fulfillment_obligations')
    .select('id')
    .eq('artist_id', artistId)
    .eq('source_tier_id', tierId)
    .contains('metadata', { kind: 'vip_welcome', fan_id: fanId })
    .neq('status', 'archived')
    .limit(1);
  if (existing && existing.length > 0) return false;

  const dueAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const title = `Welcome ${fanName} to ${tierName}`;

  const { data: obligation } = await admin
    .from('fulfillment_obligations')
    .insert({
      artist_id: artistId,
      source_type: 'tier',
      source_tier_id: tierId,
      title,
      description: 'New VIP supporter — send a personal welcome (a quick video or message goes a long way).',
      fulfillment_type: 'custom_thankyou',
      recurrence: 'none',
      next_due_at: null,
      audience_kind: 'tier',
      audience_id: tierId,
      requires_completion: true,
      // A per-fan welcome is an artist task, not a fan-facing calendar item.
      auto_create_fan_items: false,
      metadata: { kind: 'vip_welcome', fan_id: fanId },
    })
    .select('id')
    .single();

  if (!obligation) return false;

  await admin.from('fulfillment_events').insert({
    obligation_id: obligation.id,
    artist_id: artistId,
    title,
    due_at: dueAt,
    status: 'pending',
    metadata: { kind: 'vip_welcome', fan_id: fanId },
  });

  // Nudge the artist. Reuse an existing notification type the schema already accepts.
  await admin.from('notifications').insert({
    user_id: artistUserId,
    type: 'new_subscriber',
    title: '👑 VIP welcome pending',
    message: `Send ${fanName} a personal welcome — due in 48h`,
    link: '/profile/artist?tab=promise',
  });

  return true;
}
