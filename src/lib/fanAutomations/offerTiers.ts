// Which live tier is "Gold" and which is "Silver"? Derived on read, never stored.
//
// subscription_tiers has no rung column: the ladder is a naming convention
// (src/lib/tierTemplate.ts) that artists are free to rename away from. So the founder's
// "highlight the Gold tier, downsell to Silver" maps onto live rows like this:
//
//   Gold-equivalent  = the tier whose name alias-matches the vault rung
//                      (Gold / The Vault, per RECOMMENDED_LADDER legacyNames),
//                      else the HIGHEST-priced active paid tier. Price order is the
//                      fallback authority for the same reason the release waterfall
//                      staggers on price: names are the artist's, prices are the ladder.
//   Silver-equivalent = the alias match for inner_circle (Silver / Inner Circle),
//                      else the next paid tier priced BELOW the Gold pick.
//
// Both are re-derived on every render and every setup screen from the artist's live tiers,
// so a renamed or re-priced ladder is always answered from current truth.

import { TIER_TEMPLATE_MAP, normalizeTierName, tierNameAliases } from '@/lib/tierTemplate';

export interface OfferTierRow {
  id: string;
  name: string;
  /** Integer cents, as everywhere in the database. */
  price: number;
  description?: string | null;
  is_active?: boolean | null;
}

export interface DerivedOfferTiers {
  gold: OfferTierRow | null;
  silver: OfferTierRow | null;
}

function aliasMatch(tiers: OfferTierRow[], rungKey: 'vault' | 'inner_circle'): OfferTierRow | null {
  const aliases = tierNameAliases(TIER_TEMPLATE_MAP[rungKey]);
  return tiers.find((t) => aliases.includes(normalizeTierName(t.name))) ?? null;
}

/**
 * Derive the premium target and its downsell from an artist's live tiers.
 * Only active paid tiers participate; the free rung is never an offer.
 * With one paid tier, gold is that tier and silver is null (the setup wizard
 * tells the artist what is missing rather than inventing a rung).
 */
export function deriveOfferTiers(rows: OfferTierRow[]): DerivedOfferTiers {
  const paid = rows
    .filter((t) => (t.is_active ?? true) && t.price > 0)
    .sort((a, b) => b.price - a.price);
  if (paid.length === 0) return { gold: null, silver: null };

  const gold = aliasMatch(paid, 'vault') ?? paid[0];

  const silverAlias = aliasMatch(paid, 'inner_circle');
  const silver =
    silverAlias && silverAlias.id !== gold.id && silverAlias.price < gold.price
      ? silverAlias
      : paid.find((t) => t.id !== gold.id && t.price < gold.price) ?? null;

  return { gold, silver };
}

/** Validate a stored tier pointer against live rows; a stale or foreign id resolves to null. */
export function resolveTierPointer(rows: OfferTierRow[], tierId: string | null | undefined): OfferTierRow | null {
  if (!tierId) return null;
  return rows.find((t) => t.id === tierId && (t.is_active ?? true) && t.price > 0) ?? null;
}

// ── The generic domain layer ─────────────────────────────────────────────────────
//
// The engine's concepts are PRIMARY PAID OFFER and OPTIONAL DOWNSELL, for any artist and
// any ladder. The database columns keep their historical names (gold_tier_id /
// silver_tier_id: renaming a live table for vocabulary is churn without product gain),
// and this is the one place that maps them, so no caller reasons in rung words. GB's
// Platinum-first funnel is exactly this function with his pointers set; nothing anywhere
// branches on a rung name or an artist.

export interface FunnelOfferPointers {
  gold_tier_id: string | null;
  silver_tier_id: string | null;
}

export interface FunnelOffers {
  /** The paid tier this funnel leads with. Null only when the artist has no paid tier. */
  primary: OfferTierRow | null;
  /** The optional decline path. Always cheaper than primary, or absent. */
  downsell: OfferTierRow | null;
}

/**
 * Resolve a funnel's offers from the artist's LIVE tiers plus its stored pointers.
 * The explicit pointer wins; derivation fills silence. Every rule the engine promises
 * is enforced here:
 *   - both offers resolve only against rows the caller loaded for THIS artist, so a
 *     cross-artist or stale pointer resolves to null instead of leaking a foreign tier;
 *   - primary is always PAID (resolveTierPointer and deriveOfferTiers both refuse
 *     price = 0), and the free rung is never an offer;
 *   - the downsell must be strictly cheaper than the primary and different from it, or
 *     it is dropped: CRWN never presents an "alternative" costing the same or more.
 */
export function resolveFunnelOffers(
  artistTiers: OfferTierRow[],
  pointers: FunnelOfferPointers,
): FunnelOffers {
  const derived = deriveOfferTiers(artistTiers);
  const primary = resolveTierPointer(artistTiers, pointers.gold_tier_id) ?? derived.gold;
  let downsell = resolveTierPointer(artistTiers, pointers.silver_tier_id) ?? derived.silver;
  if (!primary) return { primary: null, downsell: null };
  if (downsell && (downsell.id === primary.id || downsell.price >= primary.price)) {
    downsell = null;
  }
  return { primary, downsell };
}
