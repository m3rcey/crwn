// Shared helpers for the direct-messaging feature.
// Gating rule: a fan may DM an artist only if they hold an ACTIVE subscription
// on a tier the artist has enabled the `direct_messaging` benefit for.
// Tier rank (0 = free/none, 1..N by price ascending) drives inbox priority sorting.

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
  const tier = await resolveFanTier(supabaseAdmin, artistId, fanId);
  if (!tier.tierId) return { ok: false, reason: 'not_subscribed', tierRank: 0, tierName: null };
  const enabled = await tierHasMessaging(supabaseAdmin, tier.tierId);
  if (!enabled) return { ok: false, reason: 'tier_locked', tierRank: tier.tierRank, tierName: tier.tierName };
  return { ok: true, reason: 'ok', tierRank: tier.tierRank, tierName: tier.tierName };
}

// The set of tier ids (for an artist) that have messaging enabled — used by the
// fan-facing gate UI to tell the fan which tier to upgrade to.
export async function messagingEnabledTierIds(supabaseAdmin: any, artistId: string): Promise<string[]> {
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
