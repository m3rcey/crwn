// The loss-revelation result builder. ONE structure, every acquisition lead magnet.
//
// The brief: a lead magnet must not only tell an artist what to build, it must reveal what they
// are LOSING by not having the system in place. Every loss result carries the same ten elements,
// so this file encodes them once and every tool's adapter just supplies its own numbers. That
// keeps all ten tools visually and structurally identical, and it renders through the elegant
// shared result page (which already carries the "what CRWN is" showcase and the woven CTAs).
//
// CREDIBILITY RULE (also from the brief): never fabricate a precise dollar loss the artist's
// answers do not support. A tool with a real money model passes `headlineMoney`; a tool whose
// honest output is a score passes `score` instead, and the hero shows a leakage/opportunity/risk
// gauge rather than a fabricated figure. Ranges live in `scenarios`. Estimates, never guarantees.

import type { GeneratedResult, ResultSection } from '../leadMagnets/types';

export interface LossResultParams {
  generatorVersion: string;

  // 1. THE PRIMARY LOSS (the hero). Exactly one of these two:
  //    - headline: a money-framed loss sentence ("About $7,500 a month is leaking...").
  //    - score:    when a precise dollar figure is not responsible, a 0-100 leakage/opportunity/
  //                risk score, rendered as a gauge, with a plain-language band.
  headline: string;
  score?: { value: number; max?: number; label: string; band: string };

  /** One line of context under the hero number. */
  summary?: string;

  // 1b. HOW WE GOT TO THE NUMBER: an at-a-glance infographic chain (audience -> rate -> count ->
  //     dollars). The last row is the total and renders emphasized. Optional; when present it
  //     renders directly under the hero so the reader sees the math without reading prose.
  derivation?: { label: string; value: string; note?: string }[];

  // 2. THE BEHAVIOR / MISSING SYSTEM causing the loss.
  cause: string;

  // 3. PERSONALIZED ESTIMATE tiles (include 6: monthly + annual where the model is monetary).
  estimate: { label: string; value: string; note?: string }[];

  // 5. CONSERVATIVE / EXPECTED / HIGH scenarios (optional; three columns).
  scenarios?: { label: string; value: string; note?: string }[];

  // 4. ASSUMPTIONS behind the estimate.
  assumptions: string[];

  // 7. NON-FINANCIAL CONSEQUENCES.
  consequences: string[];

  // 8. WHAT FANS LOSE or miss because the system does not exist.
  fanLoss: string;

  // 9. THE CRWN FEATURE that closes the gap, as a short do-this list.
  fix: { title: string; steps: string[] };

  // HOW YOU GET IT BACK: a 3-4 node recovery flow (loss -> setup -> fan action -> recovered).
  // The last node is the recovered outcome and renders emphasized.
  flow: string[];

  // EMAIL-ONLY bonus. `monthlyLossCents`, when given, auto-prepends a computed "cost of waiting"
  // insight. `emailInsights` are tool-specific bonuses appended after it. Neither renders on the
  // free page; both go only into the emailed result.
  monthlyLossCents?: number;
  emailInsights?: { title: string; body: string }[];

  conversionPayload?: Record<string, unknown>;
  shareSummary: string;
}

/**
 * Assemble the standard loss-revelation sections in the order they should read:
 * cause -> estimate -> scenarios -> beyond-the-money -> fan loss -> how CRWN closes it -> assumptions.
 * (Element 6, monthly/annual, lives inside `estimate`; element 10, the disclaimer, is rendered by
 * the result page itself whenever the tool sets requiresEstimateDisclaimer.)
 */
export function buildLossResult(p: LossResultParams): GeneratedResult {
  const sections: ResultSection[] = [];

  if (p.score) {
    sections.push({
      key: 'leakage',
      title: p.score.label,
      kind: 'score',
      score: p.score.value,
      scoreMax: p.score.max ?? 100,
      scoreLabel: p.score.band,
    });
  }

  // Visual-first: lead with the math chain, then the tiles, then the range. The `cause` and
  // `consequences` prose are intentionally NOT rendered (they repeat the hero + derivation and
  // are a wall of text). They stay on the params for storage/other surfaces.
  if (p.derivation && p.derivation.length) {
    sections.push({ key: 'derivation', title: 'How we get to the number', kind: 'derivation', metrics: p.derivation });
  }

  if (p.estimate.length) {
    sections.push({ key: 'estimate', title: 'What it adds up to', kind: 'projection', metrics: p.estimate });
  }

  if (p.scenarios && p.scenarios.length) {
    sections.push({ key: 'scenarios', title: 'Conservative to high', kind: 'scenarios', metrics: p.scenarios });
  }

  sections.push({ key: 'fanLoss', title: 'What your fans miss', kind: 'fanLoss', text: p.fanLoss });

  if (p.flow.length) {
    sections.push({ key: 'flow', title: 'How you get it back', kind: 'flow', items: p.flow });
  }

  sections.push({ key: 'fix', title: p.fix.title, kind: 'nextSteps', items: p.fix.steps });

  if (p.assumptions.length) {
    sections.push({ key: 'assumptions', title: 'Assumptions', kind: 'assumptions', items: p.assumptions });
  }

  // Hero: the big number the reader sees first, worth-style. Pull the primary monthly (or yearly)
  // dollar out of the estimate tiles so both renderers can lead with a bold figure, not a sentence.
  const monthlyTile = p.estimate.find((m) => /^monthly/i.test(m.label));
  const yearlyTile = p.estimate.find((m) => /(per year|a year|overpaid)/i.test(m.label));
  let heroValue: string | undefined;
  let heroSuffix = '';
  let heroEyebrow = '';
  if (monthlyTile) {
    heroValue = monthlyTile.value;
    heroSuffix = '/mo';
    heroEyebrow = "You're leaving roughly";
  } else if (yearlyTile) {
    heroValue = yearlyTile.value;
    heroSuffix = '/yr';
    heroEyebrow = 'This is costing you';
  } else {
    const m = p.headline.match(/\$[\d,]+(?:\.\d+)?/);
    if (m) {
      heroValue = m[0];
      heroEyebrow = "Here's your number";
    }
  }

  // Email-only bonus: a computed "cost of waiting" (when a monthly loss exists) followed by the
  // tool's own tailored insights. Empty stays undefined so the email section simply does not render.
  const emailInsights = [...(p.emailInsights ?? [])];
  if (typeof p.monthlyLossCents === 'number' && p.monthlyLossCents > 0) {
    const m = p.monthlyLossCents;
    emailInsights.unshift({
      title: 'The cost of waiting',
      body: `Every month you sit on this is about ${usd(m)} gone. Six months is ${usd(
        m * 6,
      )} you cannot get back, and a full year is ${usd(m * 12)}.`,
    });
  }

  return {
    generatorVersion: p.generatorVersion,
    headline: p.headline,
    summary: p.summary ?? '',
    sections,
    conversionPayload: p.conversionPayload ?? {},
    shareSummary: p.shareSummary,
    heroValue,
    heroSuffix,
    heroEyebrow,
    emailInsights: emailInsights.length ? emailInsights : undefined,
    // Persist the numeric opportunity (cents) so the post-signup handoff can lead with a real
    // figure. monthlyLossCents is the canonical monthly opportunity; annual is 12x it. Score-only
    // tools pass no monthlyLossCents, so these stay undefined and the handoff falls back to copy.
    estimatedMonthlyCents:
      typeof p.monthlyLossCents === 'number' && p.monthlyLossCents > 0 ? p.monthlyLossCents : undefined,
    estimatedAnnualCents:
      typeof p.monthlyLossCents === 'number' && p.monthlyLossCents > 0 ? p.monthlyLossCents * 12 : undefined,
  };
}

/** Whole dollars from cents, "$1,234", for loss copy. */
export function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
