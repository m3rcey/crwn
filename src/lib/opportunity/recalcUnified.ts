// Re-run the unified model on the artist's EDITED plan.
//
// The calculator's headline was produced from the wizard answers. The builder then lets the artist
// pull the Vault out of the ladder, or sell it on its own. That changes the money, so continuing to
// show the original figure would be a stale claim: honest arithmetic, presented dishonestly.
//
// This takes the ORIGINAL audience answers (carried on the result's conversionPayload, which is
// where they were already persisted) and overlays the artist's edited structural choices, then
// re-runs the same model. It never re-derives the audience from the draft, because the draft has no
// audience fields; an artist who wants a different audience re-runs the calculator.
//
// Share-to-Earn, Clip-to-Earn and the premium session are no longer in this builder (founder
// decision, 2026-08-28): those systems are asked about and built only by their own calculators.
//
// Structurally typed on purpose: it takes plain draft values so it does not import the deliverable
// spec types that import it back.

import { calculateScenarioBand, type UnifiedInputs } from './unifiedModel';

type DraftLike = Record<string, string | number | string[] | undefined>;

export interface RecalcResult {
  value: string;
  label: string;
  note?: string;
  changed: boolean;
}

const usd = (cents: number): string => '$' + Math.round(cents / 100).toLocaleString('en-US');

function readString(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

/**
 * The structural choices the builder can change, mapped back onto model inputs. Anything the
 * builder cannot change (audience, catalog size, capacity) comes from the stored answers.
 */
export function recalcUnified(v: DraftLike, cp: Record<string, unknown>): RecalcResult | null {
  const stored = cp.modelInputs as Partial<UnifiedInputs> | undefined;
  if (!stored || typeof stored !== 'object') return null;

  const vaultPlacement = readString(v.vaultPlacement);

  const edited: Partial<UnifiedInputs> = {
    ...stored,
    ...(vaultPlacement === 'tier' || vaultPlacement === 'standalone' || vaultPlacement === 'none'
      ? { vaultPlacement }
      : {}),
  };

  const before = calculateScenarioBand(stored).expected.netNewMonthlyCents;
  const band = calculateScenarioBand(edited);
  const after = band.expected.netNewMonthlyCents;
  const changed = after !== before;

  return {
    value: `${usd(band.conservative.netNewMonthlyCents)} to ${usd(band.high.netNewMonthlyCents)}`,
    // Same figure as the headline, so it names the same three deductions. A builder that described
    // the number differently from the result page would reopen the question the page just closed.
    label: 'a month on top of what you already earn direct, after the platform fee and any commissions you pay',
    note: changed
      ? after < before
        ? `Your edits lowered this from about ${usd(before)} to about ${usd(after)} a month. Fewer moving parts, a smaller number, and a plan you will actually run.`
        : `Your edits raised this from about ${usd(before)} to about ${usd(after)} a month. Only commit to what you can keep up with.`
      : undefined,
    changed,
  };
}
