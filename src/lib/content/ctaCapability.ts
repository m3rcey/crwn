// What each acquisition tool ACTUALLY hands the reader, in one place.
//
// This exists because the same defect shipped twice: marketing copy promising a figure the
// destination tool does not compute. The first time it was ten carousel captions selling "what
// underpricing is costing you" for a planner that returns a price band. The second time it was a
// Royalty CTA promising "what you're actually owed", from the one tool whose adapter says in
// capitals that it shows NO DOLLAR FIGURE, because an amount owed is a claim about the world CRWN
// cannot verify from six self-reported answers.
//
// WHY A DESCRIPTOR AND NOT A LINT RULE ON PROSE. You cannot test whether a sentence is true. You
// CAN test two much smaller things, and this file is what makes both cheap:
//   1. that the descriptor matches the code (ctaCapability.test.ts runs each adapter and checks
//      `showsDollar` against what actually comes back), so this file cannot quietly go stale; and
//   2. that no CTA line uses a phrase family a given tool's output cannot support.
//
// `showsDollar` IS NOT `usesLossEngine`. That flag only decides which renderer runs. Royalty sets
// it true and still returns a score, because `buildLossResult` accepts a `score` in place of the
// money tiles. Reading the flag instead of the output is exactly how the Royalty overclaim
// survived review.
//
// NOTE ON THE TWO VAULT PATHS. A tool can answer differently on the web and in the DM, and Vault
// does: `/tools/vault-revenue-planner` runs `generateResult('vaultRevenuePlan')` and returns a
// readiness score, an inventory, a price band and a 30-day plan with NO revenue total, while the
// ManyChat adapter runs `buildLossResult` and does show a monthly figure. Copy is judged against
// the WEB result, because that is what "I'll DM you the link" sends the reader to, and because the
// narrower of two true answers is the safe one to promise.

export type CtaOutput = 'money' | 'score' | 'plan' | 'test';

export interface CtaCapability {
  /** Registry slug, or 'worth' for the one external tool. */
  slug: string;
  /** The ManyChat comment keyword content tells the reader to post. */
  keyword: string;
  output: CtaOutput;
  /** True when the web result puts a dollar figure in front of the reader. */
  showsDollar: boolean;
  /** What the result is ABOUT. Royalty is the only one that is not about the artist's fans. */
  aboutFans: boolean;
  /**
   * What the reader actually receives, in the founder's voice, for copy that has to name it
   * (the abandoned-session follow-up). Never a figure, never a superlative.
   */
  promise: string;
}

export const CTA_CAPABILITIES: readonly CtaCapability[] = [
  {
    slug: 'vault-revenue-planner',
    keyword: 'VAULT',
    output: 'plan',
    showsDollar: false,
    aboutFans: true,
    promise: 'whether you got enough unreleased work to run a vault, and what to charge for it',
  },
  {
    slug: 'own-your-fans-calculator',
    keyword: 'OWN',
    output: 'money',
    showsDollar: true,
    aboutFans: true,
    promise: 'how much of your audience you can actually reach, and what that relationship is worth',
  },
  {
    slug: 'royalty-readiness-check',
    keyword: 'ROYALTY',
    output: 'score',
    showsDollar: false,
    aboutFans: false,
    promise: 'which royalty streams you have earned from that nobody is collecting',
  },
  {
    slug: 'proof-of-demand-test-builder',
    keyword: 'DEMAND',
    output: 'test',
    showsDollar: false,
    aboutFans: true,
    promise: 'the test that tells you whether your people will buy it, before you spend',
  },
  {
    slug: 'between-tour-calculator',
    keyword: 'TOUR',
    output: 'money',
    showsDollar: true,
    aboutFans: true,
    promise: 'what the months between your shows are worth once VIP buyers become members',
  },
  {
    slug: 'live-experience-calculator',
    keyword: 'LIVE',
    output: 'money',
    showsDollar: true,
    aboutFans: true,
    promise: 'what one real ticketed live a month is worth to your most committed fans',
  },
  {
    slug: 'executive-producer-session',
    keyword: 'PRODUCER',
    output: 'money',
    showsDollar: true,
    aboutFans: true,
    promise: 'what a seat in the room is worth to the highest-value end of your fanbase',
  },
  {
    slug: 'share-to-earn-planner',
    keyword: 'SHARE',
    output: 'money',
    showsDollar: true,
    aboutFans: true,
    promise: 'what the fans already doing your acquisition are worth once it is tracked',
  },
  {
    slug: 'opportunity-calculator',
    keyword: 'FREE',
    output: 'money',
    showsDollar: true,
    aboutFans: true,
    promise: 'the fan-revenue opportunity already sitting inside the business you built',
  },
  {
    slug: 'worth',
    keyword: 'WORTH',
    output: 'money',
    showsDollar: true,
    aboutFans: true,
    promise: 'what the direct side of your audience could be worth next to your streaming',
  },
] as const;

/** PROOF is a second registered keyword for the demand builder; both reach the same tool. */
const KEYWORD_ALIASES: Record<string, string> = { PROOF: 'DEMAND' };

export function capabilityForKeyword(keyword: string): CtaCapability | null {
  const k = (KEYWORD_ALIASES[keyword.toUpperCase()] ?? keyword).toUpperCase();
  return CTA_CAPABILITIES.find((c) => c.keyword === k) ?? null;
}

export function capabilityForSlug(slug: string): CtaCapability | null {
  return CTA_CAPABILITIES.find((c) => c.slug === slug) ?? null;
}

/**
 * Phrase families a given capability cannot support, as a claim.
 *
 * Deliberately SMALL and deliberately about phrase families rather than whole sentences: a list of
 * banned sentences rots the first time somebody rewords one, and a list that tries to cover every
 * false statement is the natural-language truth engine this is explicitly not.
 *
 * Applied ONLY to the lines that make the promise (the "I built a free X that Y" offer and the
 * Comment CTAs), never to the story, where an artist legitimately gets owed money.
 */
export function forbiddenClaims(cap: CtaCapability, requiresEstimateDisclaimer: boolean): RegExp[] {
  const out: RegExp[] = [];
  if (!cap.showsDollar) {
    // No dollar comes back, so no dollar may be promised.
    out.push(/\bowed\b/i, /\$\s?[\d]/, /\bhow much (?:money )?(?:you|your)\b/i);
  }
  if (!cap.aboutFans) {
    // Royalty recovers money earned elsewhere. Framing it as fan value is a category error the
    // adapter itself calls dishonest.
    out.push(/\byour fan(?:s|base)\b/i);
  }
  if (requiresEstimateDisclaimer) {
    // Every one of these tools ships an estimate disclaimer, so none of them may claim precision.
    out.push(/\bexactly how much\b/i, /\bexact number\b/i, /\bprices exactly\b/i);
  }
  return out;
}
