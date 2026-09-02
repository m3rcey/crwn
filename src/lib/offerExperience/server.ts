// Server-side read of Tier Offer Experiences. Fail-soft: before the migration, or on any
// read fault, callers get an empty map and the drop funnel renders its compact offer
// cards exactly as it did before this feature existed.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { normalizeOfferExperience } from './normalize';
import type { TierOfferExperience } from './types';

export async function offerExperiencesForTiers(
  supabaseAdmin: any,
  artistId: string,
  tiers: Array<{ id: string; name: string }>,
): Promise<Record<string, TierOfferExperience>> {
  const out: Record<string, TierOfferExperience> = {};
  if (!tiers.length) return out;
  try {
    const { data, error } = await supabaseAdmin
      .from('tier_offer_experiences')
      .select('tier_id, config, is_active')
      .eq('artist_id', artistId)
      .in('tier_id', tiers.map((t) => t.id));
    if (error || !data) return out;
    for (const row of data) {
      if (row.is_active === false) continue;
      const tier = tiers.find((t) => t.id === row.tier_id);
      const parsed = normalizeOfferExperience(row.config, tier?.name);
      if (parsed) out[row.tier_id] = parsed;
    }
  } catch {
    /* pre-migration */
  }
  return out;
}
