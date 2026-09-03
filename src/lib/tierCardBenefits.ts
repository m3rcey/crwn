import { BENEFIT_CATALOG, getBenefitDisplayText } from '@/lib/benefitCatalog';

/**
 * The lines a public tier card shows, from the TWO places a benefit can live.
 *
 * A tier carries benefits in two shapes and both render:
 *   - STRUCTURED rows in `tier_benefits` (a `benefit_type` plus config, turned into words by
 *     `getBenefitDisplayText`). Some are enforced elsewhere (`shop_discount` at product
 *     checkout, `early_access.days_early` by the release waterfall); several are display only.
 *   - PROSE in `subscription_tiers.access_config.benefits`, written by the artist.
 *
 * Structured lines print FIRST, prose after. That order is why GB The G1ft's card led with
 * generic ladder defaults seeded at tier creation ("7-day early access to new music",
 * "Exclusive Albums", "20% shop discount", "Name on Supporter Wall") and showed his actual
 * approved offer underneath them. The fix was to delete HIS default rows, not to change this
 * order: other artists chose those structured benefits deliberately.
 *
 * Pure on purpose. The page passes rows in; nothing here queries or filters by artist. A
 * per-artist exception belongs in that artist's data, never in this function.
 */

export interface TierBenefitRow {
  benefit_type: string;
  config: Record<string, unknown> | null;
}

export function tierCardBenefitLines(
  structured: TierBenefitRow[] | null | undefined,
  prose: unknown,
): string[] {
  const structuredLines = (structured || []).map((row) => {
    const def = BENEFIT_CATALOG?.find((b) => b.type === row.benefit_type);
    const icon = def?.icon || '✓';
    return `${icon} ${getBenefitDisplayText(row.benefit_type, row.config ?? undefined)}`;
  });
  const proseLines = Array.isArray(prose) ? prose.filter((x): x is string => typeof x === 'string') : [];
  return [...structuredLines, ...proseLines];
}
