import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { SYSTEM_PROMPT as INSIGHTS_PROMPT } from './generateInsights';
import { SYSTEM_PROMPT as ACTIONS_PROMPT } from './generateActions';
import { canonicalPriorityBrief, observedRatesBrief } from '../constraint/readership';
import { resolveOperatingFlow } from '../constraint/presentation';
import type { ConstraintResult } from '../constraint/types';

// Manager's boundaries, asserted against the SOURCE so a future change has to argue with a test
// rather than quietly reintroduce a second strategist.
//
// The rule this file makes mechanical (Z4/Z5): the Constraint Engine owns the diagnosis and the
// priority. Manager is a READER. It may re-word the priority, it may execute against it with the
// artist's approval, and it may never re-rank it, issue its own recommendation identity, invent a
// priority the engine refused to name, or claim it caused a money outcome.
//
// This was not theoretical. Z4 wired the canonical brief into `generateActions` and MISSED
// `generateInsights`, which renders the largest block on the Manager screen and carried its own
// priority policy in prose. That gap is what these tests exist to keep closed.

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const read = (p: string) => stripComments(readFileSync(p, 'utf8'));

const INSIGHTS_SRC = read('src/lib/ai/generateInsights.ts');
const ACTIONS_SRC = read('src/lib/ai/generateActions.ts');
const BRIEF_SRC = read('src/lib/ai/coachingBrief.ts');
const CRON_SRC = read('src/app/api/cron/ai-manager/route.ts');
const GENERATE_SRC = read('src/app/api/ai-manager/generate/route.ts');
const EXECUTE_SRC = read('src/app/api/ai-manager/execute/route.ts');
const CARD_SRC = read('src/components/artist/AiManagerCard.tsx');
const PAGE_SRC = read('src/app/(main)/studio/manager/page.tsx');
const ACCOUNT_HUB_SRC = read('src/components/layout/AccountHub.tsx');
const STUDIO_SRC = read('src/app/(main)/studio/page.tsx');

const MODEL_CALLERS: [string, string][] = [
  ['insight feed', INSIGHTS_SRC],
  ['action generator', ACTIONS_SRC],
];

describe('Manager reads the canonical priority, it does not own one', () => {
  it('every Manager model call accepts the canonical brief', () => {
    for (const [label, src] of MODEL_CALLERS) {
      expect(src, `${label} must accept a canonicalBrief`).toContain('canonicalBrief');
    }
  });

  it('every route that runs a Manager model builds the brief first', () => {
    for (const [label, src] of [['cron', CRON_SRC], ['artist refresh', GENERATE_SRC]] as const) {
      expect(src, `${label} must build the canonical brief`).toContain('buildCoachingBrief');
    }
  });

  it('the insight feed is actually handed the brief at both call sites', () => {
    // The specific regression this file was written for: `generateInsights(data)` with no
    // second argument is the ungoverned call.
    for (const [label, src] of [['cron', CRON_SRC], ['artist refresh', GENERATE_SRC]] as const) {
      expect(src, `${label} calls generateInsights without the brief`).not.toMatch(
        /generateInsights\(\s*data\s*\)/,
      );
      expect(src, `${label} must pass canonicalBrief to generateInsights`).toMatch(
        /generateInsights\(\s*data\s*,\s*canonicalBrief\s*\)/,
      );
    }
  });

  it('both Manager prompts state that the canonical diagnosis outranks their own framework', () => {
    for (const [label, prompt] of [
      ['insight feed', INSIGHTS_PROMPT],
      ['action generator', ACTIONS_PROMPT],
    ] as const) {
      expect(prompt, `${label} must name the canonical diagnosis`).toContain('CANONICAL DIAGNOSIS');
      expect(prompt.toUpperCase(), `${label} must say it OUTRANKS`).toContain('OUTRANK');
    }
  });

  it('insufficient evidence is never turned into invented advice', () => {
    // The brief is null when the engine declined. Both prompts must instruct the model to reason
    // as before rather than claim a confidence CRWN itself refused.
    for (const [label, prompt] of [
      ['insight feed', INSIGHTS_PROMPT],
      ['action generator', ACTIONS_PROMPT],
    ] as const) {
      expect(prompt, `${label} must handle an absent diagnosis honestly`).toContain(
        'do not claim a confidence CRWN itself refused to claim',
      );
    }
    // And the reader contract itself returns null rather than a fallback string.
    expect(canonicalPriorityBrief({ status: 'insufficient_evidence', reason: 'x', missingEvidence: [] })).toBeNull();
    expect(canonicalPriorityBrief(null)).toBeNull();
  });

  it('FULFILLMENT and RETENTION still forbid growth advice in the brief', () => {
    const diagnosed = (constraint: 'FULFILLMENT' | 'RETENTION' | 'REACH'): ConstraintResult => ({
      status: 'diagnosed',
      constraint,
      confidence: 'medium',
      title: 't',
      explanation: 'e',
      evidence: [{ label: 'l', metric: 'm', value: 1 }],
      action: { label: 'a', why: 'w', href: '/studio' },
      evaluatedAt: new Date(0).toISOString(),
    });

    for (const c of ['FULFILLMENT', 'RETENTION'] as const) {
      const brief = canonicalPriorityBrief(diagnosed(c))!;
      expect(brief, `${c} must forbid acquisition advice`).toContain('ALREADY been paid');
      expect(brief).toMatch(/Do NOT recommend acquisition/);
    }
    // A growth-stage constraint gets the ordinary instruction, not the earned-revenue guard.
    expect(canonicalPriorityBrief(diagnosed('REACH'))!).not.toContain('ALREADY been paid');
  });

  it('Manager never issues a Z3 recommendation record', () => {
    // Only /api/artist/constraint issues. A diagnosis rendered on Manager as well as Rise Mode is
    // still ONE logical recommendation with one durable identity.
    const sources: [string, string][] = [
      ['insight feed', INSIGHTS_SRC],
      ['action generator', ACTIONS_SRC],
      ['coaching brief', BRIEF_SRC],
      ['cron', CRON_SRC],
      ['artist refresh', GENERATE_SRC],
      ['execute', EXECUTE_SRC],
      ['card', CARD_SRC],
    ];
    for (const [label, src] of sources) {
      expect(src, `${label} must not issue a recommendation`).not.toContain('recordIssuedRecommendation');
    }
  });

  it('Manager does not re-rank the engine: no second ordering policy', () => {
    for (const [label, src] of [
      ['coaching brief', BRIEF_SRC],
      ['card', CARD_SRC],
    ] as const) {
      expect(src, `${label} must not build its own constraint ordering`).not.toContain('constraintRank');
      expect(src, `${label} must not re-implement precedence`).not.toContain('outranks(');
    }
  });
});

describe('no unsupported cross-artist claim reaches an artist', () => {
  it('the Z10 injection point is gone from the tree', () => {
    expect(
      existsSync('src/lib/ai/crossArtistPatterns.ts'),
      'crossArtistPatterns.ts was the removed cross-artist injection and must stay deleted',
    ).toBe(false);
  });

  it('no Manager path imports cross-artist evidence', () => {
    const sources: [string, string][] = [
      ['insight feed', INSIGHTS_SRC],
      ['action generator', ACTIONS_SRC],
      ['coaching brief', BRIEF_SRC],
      ['cron', CRON_SRC],
      ['artist refresh', GENERATE_SRC],
      ['card', CARD_SRC],
    ];
    for (const [label, src] of sources) {
      expect(src, `${label} must not read cross-artist evidence`).not.toContain('crossArtistEvidence');
      expect(src, `${label} must not read cross-artist patterns`).not.toContain('crossArtistPatterns');
    }
  });

  it('neither Manager prompt ASSERTS a peer or benchmark number', () => {
    // "ARPU low relative to peers ($8-15/mo is typical)" shipped inside the insight prompt for
    // months: an unmeasured cross-artist claim hardcoded past every Z10 gate.
    //
    // Matched on the CLAIM, not the word. Both prompts now PROHIBIT peer comparison in prose, so
    // a bare `not.toContain('peers')` would fail on the prohibition and pass on the violation.
    const BANNED_CLAIMS = [
      /relative to peers/i,
      /is typical\)/i,
      /compared to (?:other|similar) artists/i,
      /artists like (?:you|yours|this)/i,
      /(?:industry|platform) average/i,
    ];
    for (const [label, prompt] of [
      ['insight feed', INSIGHTS_PROMPT],
      ['action generator', ACTIONS_PROMPT],
    ] as const) {
      for (const claim of BANNED_CLAIMS) {
        expect(prompt, `${label} must not assert ${claim}`).not.toMatch(claim);
      }
    }
  });

  it('the insight prompt forbids comparison and self-computed rates (Z9)', () => {
    // Whitespace-insensitive: these live in a wrapped template literal.
    const p = INSIGHTS_PROMPT.toLowerCase().replace(/\s+/g, ' ');
    expect(p).toContain('data about this artist only');
    expect(p).toContain('never compare them to other artists');
    expect(p).toContain('do not calculate a rate yourself');
    expect(p).toContain('never state or imply that a past action caused');
  });

  it('observedRatesBrief only ever describes this artist', () => {
    const brief = observedRatesBrief([
      { explanation: 'ELIGIBLE_RATE', active: true },
      { explanation: 'BELOW_SAMPLE_FLOOR', active: false },
    ])!;
    expect(brief).toContain('this artist own account only');
    expect(brief).toContain('ELIGIBLE_RATE');
    // A rate that did not clear its sample floor never reaches the prompt at all.
    expect(brief).not.toContain('BELOW_SAMPLE_FLOOR');
    // Nothing eligible means silence, not a modelled stand-in.
    expect(observedRatesBrief([{ explanation: 'ELIGIBLE_RATE', active: false }])).toBeNull();
  });
});

describe('Manager makes no causal money claim to the artist', () => {
  it('the artist card renders no outcome verdict', () => {
    // `snapshotArtistMetrics` self-derives MRR, zero-defaults missing metrics, uses a fixed 7-day
    // window and has no control. "Worked" on that basis is a causal claim CRWN cannot support.
    for (const banned of ['Worked', 'No lift', 'outcomeVerdict']) {
      expect(CARD_SRC, `card must not render "${banned}"`).not.toContain(banned);
    }
  });

  it('the artist card does not render the outcome delta as a result', () => {
    expect(CARD_SRC).not.toMatch(/delta\.mrr/);
    expect(CARD_SRC).not.toMatch(/delta\.activeSubs/);
    expect(CARD_SRC).not.toMatch(/delta\.churnRate/);
  });

  it('the quarantined measurement loop is not canonicalised', () => {
    // It stays exactly where it was: recorded, and fed only into Manager's own prompt. It must not
    // start reading or writing the canonical rails as part of any cleanup.
    expect(BRIEF_SRC).not.toContain('snapshotArtistMetrics');
    expect(INSIGHTS_SRC).not.toContain('snapshotArtistMetrics');
  });

  it('missing evidence is not converted into zero in the newly wired path', () => {
    // The brief builder passes through the constraint modules, which report null/absent rather
    // than 0. It must not introduce a numeric fallback of its own.
    expect(BRIEF_SRC).not.toMatch(/\|\|\s*0\b/);
    expect(BRIEF_SRC).not.toMatch(/\?\?\s*0\b/);
  });
});

describe('Manager stays distinct from the other canonical owners', () => {
  it('the Manager surface claims coaching, not priority ownership', () => {
    // "What to do next" is the Constraint Engine's answer, not Manager's chrome.
    expect(PAGE_SRC).not.toContain('What to do next');
    expect(CARD_SRC).not.toContain('24/7 assistant');
  });

  it('Manager renders the canonical priority above its own output', () => {
    expect(CARD_SRC).toContain('CanonicalPriorityBanner');
    expect(CARD_SRC).toContain('/api/artist/constraint');
  });

  it('Manager returns the artist to the operating flow', () => {
    // Rise Mode is where the priority is owned and where acting on it must land the artist back.
    expect(CARD_SRC).toContain('/profile/artist');
  });

  it('the priority banner renders nothing when the engine declined to diagnose', () => {
    // Steady state: nothing is blocking. CRWN does not manufacture a priority to fill a box.
    const steady: ConstraintResult = { status: 'insufficient_evidence', reason: 'r', missingEvidence: [] };
    expect(resolveOperatingFlow(steady).phase).toBe('steady');
    expect(resolveOperatingFlow(null).phase).toBe('unknown');
    // Launch-gated is a DIFFERENT answer and must stay distinguishable, or a half-launched artist
    // gets growth coaching.
    const gated: ConstraintResult = { status: 'insufficient_evidence', reason: 'r', missingEvidence: ['Connect Stripe'] };
    expect(resolveOperatingFlow(gated).phase).toBe('launch');
  });

  it('Manager is not duplicated in navigation', () => {
    const count = (src: string) => (src.match(/\/studio\/manager/g) || []).length;
    expect(count(ACCOUNT_HUB_SRC), 'AccountHub must list Manager exactly once').toBe(1);
    expect(count(STUDIO_SRC), 'Studio must list Manager exactly once').toBe(1);
  });
});

describe('Manager cannot bypass its approval or ownership gates', () => {
  it('execution is cron-authenticated or session-owned, never both-optional', () => {
    expect(EXECUTE_SRC).toContain('CRON_SECRET');
    expect(EXECUTE_SRC).toContain('auth.getUser()');
    // Ownership is proven against the session user, not a body parameter.
    expect(EXECUTE_SRC).toMatch(/eq\('user_id',\s*user\.id\)/);
  });

  it('only low-risk allowlisted actions may auto-execute', () => {
    expect(CRON_SRC).toMatch(/action\.risk === 'low' && SAFE_ACTION_TYPES\.includes\(action\.type\)/);
    // Everything else is stored pending and waits for the artist.
    expect(CRON_SRC).toContain('storePendingAction');
  });

  it('the artist refresh route never trusts a client-supplied identity', () => {
    expect(GENERATE_SRC).toContain('requireArtistOwner');
    // The evidence read must be keyed on the session user, never a body field.
    expect(GENERATE_SRC).not.toMatch(/body\.userId|\buserId\s*\}\s*=\s*await req\.json/);
  });
});
