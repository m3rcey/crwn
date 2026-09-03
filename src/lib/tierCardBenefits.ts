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

/**
 * `subscription_tiers.access_config.card_lines`. 'prose_only' means the artist wrote the card
 * themselves and the structured rows exist for DELIVERY (readiness, fast actions, the two
 * enforcement gates) rather than for print. Absent means both print, as they always have.
 * This is what lets GB carry structured benefits for the Promise to Delivery panel without
 * his approved offer gaining a second, differently worded copy of every line above it.
 */
export type CardLinesMode = 'prose_only' | undefined;

export function cardLinesModeOf(accessConfig: unknown): CardLinesMode {
  const v = (accessConfig as { card_lines?: unknown } | null | undefined)?.card_lines;
  return v === 'prose_only' ? 'prose_only' : undefined;
}

export function tierCardBenefitLines(
  structured: TierBenefitRow[] | null | undefined,
  prose: unknown,
  mode: CardLinesMode = undefined,
): string[] {
  const proseOnly = Array.isArray(prose) ? prose.filter((x): x is string => typeof x === 'string') : [];
  if (mode === 'prose_only' && proseOnly.length > 0) return proseOnly;
  const structuredLines = (structured || []).map((row) => {
    const def = BENEFIT_CATALOG?.find((b) => b.type === row.benefit_type);
    const icon = def?.icon || '✓';
    return `${icon} ${getBenefitDisplayText(row.benefit_type, row.config ?? undefined)}`;
  });
  const proseLines = Array.isArray(prose) ? prose.filter((x): x is string => typeof x === 'string') : [];
  return [...structuredLines, ...proseLines];
}
