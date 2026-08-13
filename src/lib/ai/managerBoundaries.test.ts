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
// The autonomous cron (src/app/api/cron/ai-manager) was DELETED on 2026-08-13, surface
// reduction stage 6. Its dormancy rested on ONE accidental gate (an is_active filter on a
// column that does not exist), and it would have re-armed auto-executing AI across every
// artist account the moment anyone added that column for an unrelated reason. Deleting it is
// strictly stronger than every tripwire this file pointed at it. Assertions that read the
// cron now either read the surviving artist-REQUESTED routes or assert the file stays gone.
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
    for (const [label, src] of [['artist refresh', GENERATE_SRC]] as const) {
      expect(src, `${label} must build the canonical brief`).toContain('buildCoachingBrief');
    }
  });

  it('the insight feed is actually handed the brief at both call sites', () => {
    // The specific regression this file was written for: `generateInsights(data)` with no
    // second argument is the ungoverned call.
    for (const [label, src] of [['artist refresh', GENERATE_SRC]] as const) {
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
    expect(canonicalPriorityBrief({ status: 'insufficient_evidence', reason: 'x', missingEvidence: [], evaluatedAt: new Date(0).toISOString() })).toBeNull();
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

// ---------------------------------------------------------------------------
// PARTIAL RETIREMENT of the legacy outcome/learning loop (2026-08-11)
//
// KEPT: action telemetry (what Manager did, when, result, status).
// RETIRED: baseline capture, outcome_delta/metrics, outcome_score, the pastOutcomes prompt block,
//          and every causal verdict derived from them.
// ---------------------------------------------------------------------------
describe('the Manager outcome-scoring loop stays retired', () => {
  const MANAGER_SOURCES: [string, string][] = [
    ['action generator', ACTIONS_SRC],
    ['insight feed', INSIGHTS_SRC],
    ['coaching brief', BRIEF_SRC],
    ['artist refresh', GENERATE_SRC],
    ['execute', EXECUTE_SRC],
    ['card', CARD_SRC],
  ];

  it('no Manager path reads or ranks by outcome_score', () => {
    for (const [label, src] of MANAGER_SOURCES) {
      expect(src, `${label} must not read outcome_score`).not.toContain('outcome_score');
      expect(src, `${label} must not use a PastOutcome type`).not.toContain('PastOutcome');
      expect(src, `${label} must not build a pastOutcomes list`).not.toContain('pastOutcomes');
    }
  });

  it('the action prompt has no past-outcome block at all', () => {
    expect(ACTIONS_SRC).not.toContain('PAST ACTION OUTCOMES');
    // The scoring formula itself, in any of its three historical copies.
    expect(ACTIONS_SRC).not.toMatch(/activeSubs\s*\|\|\s*0\)\s*\*\s*100/);
  });

  it('no Manager prompt carries a POSITIVE/NEGATIVE/NEUTRAL action verdict mechanism', () => {
    for (const [label, prompt] of [
      ['insight feed', INSIGHTS_PROMPT],
      ['action generator', ACTIONS_PROMPT],
    ] as const) {
      expect(prompt, `${label} must not label outcomes POSITIVE`).not.toContain('POSITIVE');
      expect(prompt, `${label} must not label outcomes NEGATIVE`).not.toContain('NEGATIVE');
      expect(prompt, `${label} must not instruct repetition of "what worked"`).not.toMatch(
        /repeat what worked/i,
      );
      expect(prompt, `${label} must not instruct avoidance of "what failed"`).not.toMatch(
        /avoid what failed/i,
      );
      expect(prompt, `${label} must not frame history as learning input`).not.toMatch(
        /LEARNING FROM OUTCOMES/i,
      );
    }
  });

  it('both prompts explicitly forbid claiming a past action produced a result', () => {
    for (const [label, prompt] of [
      ['insight feed', INSIGHTS_PROMPT],
      ['action generator', ACTIONS_PROMPT],
    ] as const) {
      const p = prompt.toLowerCase().replace(/\s+/g, ' ');
      expect(p, `${label} must forbid the causal claim`).toMatch(
        /never (state or imply that|claim that) a past action (caused|produced)/,
      );
    }
  });

  it('no new Manager action writes baseline_metrics', () => {
    // Comments are stripped, so the retirement note explaining the column does not pass this.
    expect(EXECUTE_SRC, 'execute must not write a baseline').not.toContain('baseline_metrics');
  });

  it('no Manager path computes its own MRR for learning', () => {
    expect(
      existsSync('src/lib/ai/snapshotMetrics.ts'),
      'snapshotMetrics.ts had zero live callers after retirement and must stay deleted',
    ).toBe(false);
    for (const [label, src] of MANAGER_SOURCES) {
      expect(src, `${label} must not snapshot metrics`).not.toContain('snapshotArtistMetrics');
      expect(src, `${label} must not diff snapshots`).not.toContain('computeOutcomeDelta');
    }
  });

  it('the retired measurement no longer runs on the maintenance cron', () => {
    const outcomeCron = read('src/app/api/cron/outcome-measure/route.ts');
    expect(outcomeCron).not.toContain('snapshotArtistMetrics');
    expect(outcomeCron).not.toContain('outcome_delta');
    expect(outcomeCron).not.toContain('outcome_measured_at');
    // ...but its two live NON-Manager consumers must survive. One of them serves the admin agent.
    expect(outcomeCron, 'coordination lock cleanup must remain').toContain('expireStallLocks');
    expect(outcomeCron, 'opportunity ledger refresh must remain').toContain('refreshAllOpportunities');
  });

  it('Manager still records operational action telemetry', () => {
    // Retirement removed the SCORING, not the record of what Manager did.
    expect(EXECUTE_SRC).toContain('artist_agent_actions');
    expect(EXECUTE_SRC).toMatch(/result_message/);
    expect(EXECUTE_SRC).toMatch(/executed_at/);
    // artist_agent_runs was the AUTONOMOUS run log; its only writer was the deleted cron, so it
    // is historical data now (rows retained, nothing new written). The artist-facing telemetry
    // below is the record that still matters.
    expect(CARD_SRC, 'the artist can still see what Manager did').toContain('artist_agent_actions');
  });

  it('no historical Manager rows are deleted or migrated', () => {
    for (const [label, src] of MANAGER_SOURCES) {
      expect(src, `${label} must not delete action history`).not.toMatch(
        /from\('artist_agent_(actions|runs)'\)[\s\S]{0,80}\.delete\(/,
      );
    }
  });
});

describe('this task did NOT reactivate autonomous Manager', () => {
  // The cron selects artists with `.eq('is_active', true)` on artist_profiles, and that column
  // DOES NOT EXIST in production (42703). The query returns null, the cron early-returns, and
  // autonomous Manager has been dormant since 2026-04-03.
  //
  // Fixing that is a FOUNDER PRODUCT DECISION, not a cleanup: it would turn an auto-executing AI
  // back on across every artist account. This test exists so an unrelated tidy-up cannot silently
  // do it. If you are here because this test failed, that is the point. Confirm the reactivation
  // was intended and approved, then update this test deliberately.
  it('the autonomous cron stays deleted', () => {
    expect(
      existsSync('src/app/api/cron/ai-manager/route.ts'),
      'the autonomous Manager cron came back — reactivating scheduled autonomy is a founder decision, not a cleanup',
    ).toBe(false);
  });
});

describe('canonical evidence ownership is unchanged by the retirement', () => {
  it('Z3 remains the only recommendation-outcome linkage', () => {
    const z3 = read('src/lib/constraint/recommendationOutcome.ts');
    expect(z3).toBeTruthy();
    // Manager actions were NOT migrated into Z3, and Z3 gained no notion of a Manager action.
    expect(z3).not.toContain('artist_agent_actions');
    expect(z3).not.toContain('action_type');
  });

  it('Z9 evidence still reaches Manager through the coaching brief', () => {
    expect(BRIEF_SRC).toContain('activeObservedRates');
    expect(BRIEF_SRC).toContain('observedRatesBrief');
    // And Manager did not grow its own learned rates to replace what was retired.
    for (const [label, src] of [['action generator', ACTIONS_SRC], ['insight feed', INSIGHTS_SRC]] as const) {
      expect(src, `${label} must not compute learned rates`).not.toMatch(/learnedRate|learnedRates/);
    }
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
    const steady: ConstraintResult = { status: 'insufficient_evidence', reason: 'r', missingEvidence: [], evaluatedAt: new Date(0).toISOString() };
    expect(resolveOperatingFlow(steady).phase).toBe('steady');
    expect(resolveOperatingFlow(null).phase).toBe('unknown');
    // Launch-gated is a DIFFERENT answer and must stay distinguishable, or a half-launched artist
    // gets growth coaching.
    const gated: ConstraintResult = { status: 'insufficient_evidence', reason: 'r', missingEvidence: ['Connect Stripe'], evaluatedAt: new Date(0).toISOString() };
    expect(resolveOperatingFlow(gated).phase).toBe('launch');
  });

  it('Manager is not duplicated in navigation', () => {
    // The property is NOT DUPLICATED, so zero satisfies it. The 2026-08-13 pre-PMF surface
    // reduction hid Manager from both surfaces (7 actions and 7 insights all time; 1 approved,
    // 1 rejected, 3 abandoned for 130 days). The route and the on-demand API are untouched, and
    // the founder handles "why does this matter" by hand during the three-artist pilot. If it
    // comes back it comes back ONCE per surface, which is what this still enforces.
    const count = (src: string) => (src.match(/\/studio\/manager/g) || []).length;
    expect(count(ACCOUNT_HUB_SRC), 'AccountHub must not list Manager more than once').toBeLessThanOrEqual(1);
    expect(count(STUDIO_SRC), 'Studio must not list Manager more than once').toBeLessThanOrEqual(1);
  });

  it('the Manager route survives being hidden, so old links and analytics still resolve', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    expect(existsSync('src/app/(main)/studio/manager/page.tsx')).toBe(true);
  });
});

describe('Manager cannot bypass its approval or ownership gates', () => {
  it('execution is cron-authenticated or session-owned, never both-optional', () => {
    expect(EXECUTE_SRC).toContain('CRON_SECRET');
    expect(EXECUTE_SRC).toContain('auth.getUser()');
    // Ownership is proven against the session user, not a body parameter.
    expect(EXECUTE_SRC).toMatch(/eq\('user_id',\s*user\.id\)/);
  });

  it('nothing auto-executes at all any more', () => {
    // The low-risk auto-execute allowlist lived only in the deleted autonomous cron. With it
    // gone, EVERY Manager action waits for the artist through /api/ai-manager/execute, which is
    // the strongest form of the old "only low-risk may auto-execute" rule. If auto-execution is
    // ever rebuilt, this test is where the allowlist requirement must be reinstated.
    expect(existsSync('src/app/api/cron/ai-manager/route.ts')).toBe(false);
    expect(EXECUTE_SRC).toContain('auth.getUser()');
  });

  it('the artist refresh route never trusts a client-supplied identity', () => {
    expect(GENERATE_SRC).toContain('requireArtistOwner');
    // The evidence read must be keyed on the session user, never a body field.
    expect(GENERATE_SRC).not.toMatch(/body\.userId|\buserId\s*\}\s*=\s*await req\.json/);
  });
});
