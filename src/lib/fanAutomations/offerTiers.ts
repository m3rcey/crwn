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
