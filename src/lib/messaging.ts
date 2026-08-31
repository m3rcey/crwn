// Shared helpers for the direct-messaging feature.
// Gating rule: a fan may DM an artist only if (a) the artist's PLATFORM tier allows
// DMs (Pro-only), AND (b) the fan holds an ACTIVE subscription on a tier the artist
// has enabled the `direct_messaging` benefit for.
// Tier rank (0 = free/none, 1..N by price ascending) drives inbox priority sorting.

import { getEffectiveLimits } from '@/lib/platformTier';

// Does the artist's PLATFORM tier permit offering DMs at all? (Pro-only.)
// A Pro->Free downgrade makes this false, which freezes their threads read-only:
// existing history stays readable, but no new messages can be sent either way.
export async function artistAllowsDMs(supabaseAdmin: any, artistId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('artist_profiles')
    // plan_feature_overrides carries a founder-comped capability. Selecting a column that
    // does not exist yet would 42703 the whole statement, so a missing column must read as
    // "no override" rather than as "no artist": the catch below keeps the plan answer.
    .select('platform_tier, plan_feature_overrides')
    .eq('id', artistId)
    .maybeSingle();
  if (data) return getEffectiveLimits(data.platform_tier, data.plan_feature_overrides).allowsDMs;

  const { data: planOnly } = await supabaseAdmin
    .from('artist_profiles')
    .select('platform_tier')
    .eq('id', artistId)
    .maybeSingle();
  return getEffectiveLimits(planOnly?.platform_tier).allowsDMs;
}

export interface MessageGate {
  ok: boolean;
  reason: 'ok' | 'not_subscribed' | 'tier_locked';
  tierRank: number;
  tierName: string | null;
}

// artist_profiles.id values owned by this auth user (usually 0 or 1).
export async function getOwnedArtistIds(supabaseAdmin: any, userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', userId);
  return (data || []).map((r: { id: string }) => r.id);
}

// The caller's role in a conversation, or null if they are not a participant.
// Shared by the thread route and the voice-note signer so both answer "may this
// user see this conversation?" from one place.
export async function conversationRole(
  supabaseAdmin: any,
  userId: string,
  conversationId: string
): Promise<'fan' | 'artist' | null> {
  const { data: convo } = await supabaseAdmin
    .from('dm_conversations')
    .select('fan_id, artist_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (!convo) return null;
  if (convo.fan_id === userId) return 'fan';
  const owned = await getOwnedArtistIds(supabaseAdmin, userId);
  return owned.includes(convo.artist_id) ? 'artist' : null;
}

// Resolve a fan's tier rank + name for an artist (rank 0 if no active sub).
export async function resolveFanTier(
  supabaseAdmin: any,
  artistId: string,
  fanId: string
): Promise<{ tierId: string | null; tierRank: number; tierName: string | null }> {
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('tier_id')
    .eq('fan_id', fanId)
    .eq('artist_id', artistId)
    .eq('status', 'active')
    .maybeSingle();

  if (!sub?.tier_id) return { tierId: null, tierRank: 0, tierName: null };

  const { data: tiers } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, name')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .order('price', { ascending: true });

  const idx = tiers?.findIndex((t: { id: string }) => t.id === sub.tier_id) ?? -1;
  if (idx < 0 || !tiers) return { tierId: sub.tier_id, tierRank: 0, tierName: null };
  return { tierId: sub.tier_id, tierRank: idx + 1, tierName: tiers[idx].name };
}

/**
 * Are fan replies currently switched off in this conversation?
 *
 * True when the NEWEST message is an announce-only broadcast. The lock is a
 * property of that message, not of the conversation, so the artist's next
 * repliable message reopens the thread and history stays readable throughout.
 * Only the artist can lock a thread: a fan's own message is never a broadcast.
 */
export async function repliesAreDisabled(supabaseAdmin: any, conversationId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('dm_messages')
    .select('replies_disabled, sender_is_artist')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!data?.sender_is_artist && !!data?.replies_disabled;
}

// Does a given tier have the direct_messaging benefit switched on?
export async function tierHasMessaging(supabaseAdmin: any, tierId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('tier_benefits')
    .select('id')
    .eq('tier_id', tierId)
    .eq('benefit_type', 'direct_messaging')
    .eq('is_active', true)
    .maybeSingle();
  return !!data;
}

// Full gate: can this fan message this artist right now?
export async function fanCanMessage(
  supabaseAdmin: any,
  artistId: string,
  fanId: string
): Promise<MessageGate> {
  // Platform gate first: if the artist isn't on a DM-capable tier, no one can message them.
  if (!(await artistAllowsDMs(supabaseAdmin, artistId))) {
    return { ok: false, reason: 'tier_locked', tierRank: 0, tierName: null };
  }
  const tier = await resolveFanTier(supabaseAdmin, artistId, fanId);
  if (!tier.tierId) return { ok: false, reason: 'not_subscribed', tierRank: 0, tierName: null };
  const enabled = await tierHasMessaging(supabaseAdmin, tier.tierId);
  if (!enabled) return { ok: false, reason: 'tier_locked', tierRank: tier.tierRank, tierName: tier.tierName };
  return { ok: true, reason: 'ok', tierRank: tier.tierRank, tierName: tier.tierName };
}

// The set of tier ids (for an artist) that have messaging enabled — used by the
// fan-facing gate UI to tell the fan which tier to upgrade to.
export async function messagingEnabledTierIds(supabaseAdmin: any, artistId: string): Promise<string[]> {
  // If the artist's platform tier can't offer DMs, no fan tier unlocks messaging.
  if (!(await artistAllowsDMs(supabaseAdmin, artistId))) return [];
  const { data: tiers } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id')
    .eq('artist_id', artistId)
    .eq('is_active', true);
  const ids = (tiers || []).map((t: { id: string }) => t.id);
  if (ids.length === 0) return [];
  const { data: benefits } = await supabaseAdmin
    .from('tier_benefits')
    .select('tier_id')
    .in('tier_id', ids)
    .eq('benefit_type', 'direct_messaging')
    .eq('is_active', true);
  return (benefits || []).map((b: { tier_id: string }) => b.tier_id);
}
