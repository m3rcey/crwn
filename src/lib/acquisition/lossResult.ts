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

  sections.push({ key: 'cause', title: 'Why this is leaking', kind: 'summary', text: p.cause });

  if (p.estimate.length) {
    sections.push({ key: 'estimate', title: 'What it adds up to', kind: 'projection', metrics: p.estimate });
  }

  if (p.scenarios && p.scenarios.length) {
    sections.push({ key: 'scenarios', title: 'Conservative to high', kind: 'scenarios', metrics: p.scenarios });
  }

  if (p.consequences.length) {
    sections.push({ key: 'consequences', title: 'Beyond the money', kind: 'list', items: p.consequences });
  }

  sections.push({ key: 'fanLoss', title: 'What your fans are missing', kind: 'fanLoss', text: p.fanLoss });

  sections.push({ key: 'fix', title: p.fix.title, kind: 'nextSteps', items: p.fix.steps });

  if (p.assumptions.length) {
    sections.push({ key: 'assumptions', title: 'Assumptions', kind: 'assumptions', items: p.assumptions });
  }

  return {
    generatorVersion: p.generatorVersion,
    headline: p.headline,
    summary: p.summary ?? '',
    sections,
    conversionPayload: p.conversionPayload ?? {},
    shareSummary: p.shareSummary,
  };
}

/** Whole dollars from cents, "$1,234", for loss copy. */
export function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
