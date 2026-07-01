// Lead-magnet "money left on the table" model.
// PURE, framework-agnostic — the single source of truth for the /worth calculator.
// All money values are INTEGER CENTS (per CLAUDE.md), consistent with the rest of the app.
//
// First-principles frame (why the numbers look the way they do):
//   - Streaming pays ~$0.0035/stream. A monthly listener is worth pennies/mo.
//   - You can only sell to fans you can REACH. Raw monthly listeners are discounted
//     hard by `reachRate` when the artist hasn't given a real addressable-audience number.
//   - Superfans are a power law: a small % ever pay, and within that a whale segment
//     (Tier 3) drives outsized revenue. The tier split encodes that curve.
//   - The artist currently captures ~$0 of DIRECT fan revenue, so the CRWN net IS the
//     money left on the table. Streaming continues alongside it (additive, honest).

export interface CalcInputs {
  /** Required — the number every artist knows by heart. */
  monthlyListeners: number;
  /** Optional. Addressable/engaged audience (followers + email/SMS). 0 = unknown → derive from listeners. */
  engagedFollowers: number;
  /** Optional. Current monthly streaming revenue in CENTS. 0 = unknown → derive from listeners. */
  currentStreamingCents: number;
}

export interface CalcAssumptions {
  superfanRate: number;        // fraction of addressable audience that ever pays (0.03 = 3%)
  reachRate: number;           // fraction of monthly listeners that are addressable when followers unknown
  tier1PriceCents: number;     // Inner Circle
  tier2PriceCents: number;     // The Vault
  tier3PriceCents: number;     // Throne
  tier1Share: number;          // share of payers on tier 1
  tier2Share: number;          // share of payers on tier 2
  tier3Share: number;          // share of payers on tier 3 (whales)
  alacarteArpuCents: number;   // extra one-off spend per payer/mo (stems, sessions, custom work)
  streamsPerListener: number;  // avg streams per monthly listener
  perStreamCents: number;      // payout per stream, in cents (0.35 = $0.0035)
  platformFeePercent: number;  // CRWN fee on the recommended plan (Pro = 8)
}

// Recommended tier prices — the "ideal setup" the whole pitch rests on.
// Aligns with the 3-paid-tier structure that requires the Pro plan (maxFanTiers: 3).
export const RECOMMENDED_TIER_PRICES = {
  tier1PriceCents: 1000,   // $10  — Inner Circle
  tier2PriceCents: 2500,   // $25  — The Vault
  tier3PriceCents: 10000,  // $100 — Throne
} as const;

// Whale-curve split of paying fans across the three tiers.
const TIER_SPLIT = { tier1Share: 0.70, tier2Share: 0.22, tier3Share: 0.08 } as const;

// Streaming economics (kept conservative so the contrast number stays defensible).
const STREAMING = { streamsPerListener: 3, perStreamCents: 0.35 } as const;

export type AggressivenessPreset = 'conservative' | 'punchy' | 'aggressive';

// Presets only move the three "feel" knobs. Everything else stays fixed so the model
// can't be accused of being rigged. Default is conservative — a skeptic can't dismiss it.
const PRESET_KNOBS: Record<AggressivenessPreset, Pick<CalcAssumptions, 'superfanRate' | 'reachRate' | 'alacarteArpuCents'>> = {
  conservative: { superfanRate: 0.03, reachRate: 0.15, alacarteArpuCents: 300 },
  punchy:       { superfanRate: 0.04, reachRate: 0.20, alacarteArpuCents: 500 },
  aggressive:   { superfanRate: 0.05, reachRate: 0.25, alacarteArpuCents: 800 },
};

export function getAssumptions(preset: AggressivenessPreset = 'conservative'): CalcAssumptions {
  return {
    ...PRESET_KNOBS[preset],
    ...RECOMMENDED_TIER_PRICES,
    ...TIER_SPLIT,
    ...STREAMING,
    platformFeePercent: 8, // Pro plan — the plan the recommended 3-tier setup requires
  };
}

export interface CalcResult {
  addressable: number;
  payers: number;
  tier1Subs: number;
  tier2Subs: number;
  tier3Subs: number;
  subsMrrCents: number;
  alacarteMrrCents: number;
  grossMrrCents: number;
  feeCents: number;
  /** THE number: net monthly direct-fan revenue CRWN unlocks (currently $0 captured). */
  netMrrCents: number;
  netAnnualCents: number;
  streamingMrrCents: number;
  /** How many times bigger the CRWN net is vs. current streaming income (null if streaming is 0). */
  multipleVsStreaming: number | null;
}

export function calculate(inputs: CalcInputs, a: CalcAssumptions): CalcResult {
  const monthlyListeners = Math.max(0, inputs.monthlyListeners || 0);

  // Prefer a real addressable number; otherwise discount listeners by reach.
  const addressable = inputs.engagedFollowers > 0
    ? inputs.engagedFollowers
    : monthlyListeners * a.reachRate;

  const payers = addressable * a.superfanRate;

  const tier1Subs = payers * a.tier1Share;
  const tier2Subs = payers * a.tier2Share;
  const tier3Subs = payers * a.tier3Share;

  const subsMrrCents = Math.round(
    tier1Subs * a.tier1PriceCents +
    tier2Subs * a.tier2PriceCents +
    tier3Subs * a.tier3PriceCents
  );
  const alacarteMrrCents = Math.round(payers * a.alacarteArpuCents);
  const grossMrrCents = subsMrrCents + alacarteMrrCents;
  const feeCents = Math.round(grossMrrCents * (a.platformFeePercent / 100));
  const netMrrCents = grossMrrCents - feeCents;

  const streamingMrrCents = inputs.currentStreamingCents > 0
    ? inputs.currentStreamingCents
    : Math.round(monthlyListeners * a.streamsPerListener * a.perStreamCents);

  return {
    addressable,
    payers,
    tier1Subs,
    tier2Subs,
    tier3Subs,
    subsMrrCents,
    alacarteMrrCents,
    grossMrrCents,
    feeCents,
    netMrrCents,
    netAnnualCents: netMrrCents * 12,
    streamingMrrCents,
    multipleVsStreaming: streamingMrrCents > 0
      ? netMrrCents / streamingMrrCents
      : null,
  };
}

// Display helpers ------------------------------------------------------------

/** Whole-dollar money string, e.g. 310500 -> "$3,105". */
export function fmtDollars(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/** Round fan counts down to whole people. */
export function fmtCount(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}
