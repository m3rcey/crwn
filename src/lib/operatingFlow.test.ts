import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  confidenceLabel,
  decideNextAction,
  resolveOperatingFlow,
  withReturnTo,
} from './constraint/presentation';
import { readConstraint } from './constraint/engine';
import { CONSTRAINT_TYPES, type ConstraintEvidence, type ConstraintResult, type DiagnosedConstraint } from './constraint/types';
import { POPUPS } from './popups/registry';

// ONE OPERATING FLOW.
//
// The artist home used to render TWO visually identical gold primary buttons, both labelled
// "Do it now", pointing at different destinations: one from the Constraint Engine and one from the
// Roadmap. CRWN had already decided what mattered; the interface then asked the artist to decide
// again. These tests pin the composition so that cannot come back.
//
// Nothing here is a new priority engine. `resolveOperatingFlow` is a pure read of what the engine
// already returned.

const NOW = '2026-08-11T00:00:00.000Z';

function diagnosed(over: Partial<DiagnosedConstraint> = {}): DiagnosedConstraint {
  return {
    status: 'diagnosed',
    constraint: 'REACH',
    confidence: 'high',
    title: 'Almost nobody is seeing your page',
    explanation: 'x',
    evidence: [{ label: '4 visitors.', metric: 'unique_visits', value: 4, unit: 'count' }],
    action: { label: 'Import your fan contacts', why: 'y', href: '/studio/fans', verifiedBy: 'artist_has_fan_contacts' },
    evaluatedAt: NOW,
    ...over,
  };
}

const launchGated: ConstraintResult = {
  status: 'insufficient_evidence',
  reason: 'The artist has not finished launching.',
  missingEvidence: ['a live public artist page', 'Stripe connected with charges enabled'],
  evaluatedAt: NOW,
};

const nothingBlocking: ConstraintResult = {
  status: 'insufficient_evidence',
  reason: 'No constraint is blocking this artist right now.',
  missingEvidence: [],
  evaluatedAt: NOW,
};

describe('exactly one canonical owner holds the primary action', () => {
  it('a diagnosed artist: the CONSTRAINT owns it', () => {
    const flow = resolveOperatingFlow(diagnosed());
    expect(flow.phase).toBe('priority');
    expect(flow.primary).toBe('constraint');
    expect(flow.constraint).not.toBeNull();
  });

  it('a launch-gated artist: the ROADMAP owns it, and no constraint is shown', () => {
    const flow = resolveOperatingFlow(launchGated);
    expect(flow.phase).toBe('launch');
    expect(flow.primary).toBe('roadmap');
    expect(flow.constraint).toBeNull();
    // The artist is told WHY growth advice is withheld, using the engine's own words.
    expect(flow.launchBlockers).toEqual(launchGated.missingEvidence);
  });

  it('nothing blocking: the roadmap leads and NO fake priority is invented', () => {
    const flow = resolveOperatingFlow(nothingBlocking);
    expect(flow.phase).toBe('steady');
    expect(flow.primary).toBe('roadmap');
    expect(flow.constraint).toBeNull();
    expect(flow.launchBlockers).toEqual([]);
  });

  it('a failed or in-flight read behaves exactly as before', () => {
    for (const input of [null, undefined]) {
      const flow = resolveOperatingFlow(input);
      expect(flow.phase).toBe('unknown');
      expect(flow.primary).toBe('roadmap');
      expect(flow.constraint).toBeNull();
    }
  });

  it('never returns two primaries, for any engine output', () => {
    const inputs: (ConstraintResult | null)[] = [
      null,
      launchGated,
      nothingBlocking,
      ...CONSTRAINT_TYPES.map((c) => diagnosed({ constraint: c })),
    ];
    for (const input of inputs) {
      const flow = resolveOperatingFlow(input);
      expect(['constraint', 'roadmap']).toContain(flow.primary);
      // The constraint card only ever renders when the constraint IS the primary.
      if (flow.constraint) expect(flow.primary).toBe('constraint');
    }
  });

  it('distinguishes the engine two very different refusals', () => {
    // Stage 0 (cannot take money yet) and "nothing is blocking you" are both
    // insufficient_evidence and must not produce the same screen.
    expect(resolveOperatingFlow(launchGated).phase).not.toBe(resolveOperatingFlow(nothingBlocking).phase);
  });
});

describe('acting on the priority returns the artist to the flow', () => {
  it('appends a same-site returnTo', () => {
    expect(withReturnTo('/studio/fans')).toBe('/studio/fans?returnTo=%2Fprofile%2Fartist');
  });

  it('preserves an existing query string', () => {
    expect(withReturnTo('/studio/fans?view=campaigns')).toContain('view=campaigns&returnTo=');
  });

  it('never double-stacks a returnTo', () => {
    const once = withReturnTo('/studio/fans');
    expect(withReturnTo(once)).toBe(once);
  });

  it('refuses to rewrite an absolute or protocol-relative URL', () => {
    // An open redirect is a security bug, not a navigation convenience.
    expect(withReturnTo('https://evil.example/x')).toBe('https://evil.example/x');
    expect(withReturnTo('//evil.example/x')).toBe('//evil.example/x');
    expect(withReturnTo('')).toBe('');
  });

  it('every constraint action the engine can emit is a real internal route', () => {
    // Guards against the canonical action pointing somewhere vague or dead.
    const routes = new Set<string>();
    for (const c of CONSTRAINT_TYPES) routes.add(diagnosed({ constraint: c }).action.href);
    for (const href of routes) {
      expect(href.startsWith('/')).toBe(true);
      expect(withReturnTo(href)).toContain('returnTo=');
    }
  });
});

describe('the resume prompt behaves', () => {
  const def = POPUPS.find((p) => p.key === 'artist_resume_rise');
  const ctx = (over: Record<string, unknown> = {}) =>
    ({
      userId: 'u',
      role: 'artist',
      isArtist: true,
      platformTier: 'starter',
      stripeConnected: true,
      supportCount: 1,
      hasSentBroadcast: true,
      gmv30dCents: 0,
      accountCreatedAt: NOW,
      featureFlags: { quest_engine: true },
      resumable: { title: 'Build the first 10', progressPercent: 40 },
      ...over,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  it('exists and goes through the shared registry, not an ad hoc modal', () => {
    expect(def).toBeTruthy();
    expect(def!.frequency).toEqual({ type: 'everyN', days: 4, max: 3 });
  });

  it('fires only when work is genuinely PART DONE', () => {
    expect(def!.audience(ctx())).toBe(true);
    expect(def!.audience(ctx({ resumable: null }))).toBe(false);
  });

  it('never fires when the Quest Engine is off', () => {
    expect(def!.audience(ctx({ featureFlags: { quest_engine: false } }))).toBe(false);
  });

  it('never fires for a fan', () => {
    expect(def!.audience(ctx({ isArtist: false }))).toBe(false);
  });

  it('never fires on the page it would send you to', () => {
    // The destination moved from /profile/artist to /quests on 2026-08-19, when the copy
    // started NAMING the goal. Rise Mode renders one CONSTRAINT-resolved move, not this
    // quest, so a prompt naming a task and landing there would name X and show Y. The
    // invariant itself is untouched: never interrupt someone on the page you are sending
    // them to. Detail and the copy contract live in riseResume.test.ts.
    expect(def!.pages).not.toContain('/quests');
    expect(def!.cta?.href).toBe('/quests');
  });

  it('ranks BELOW money that cannot reach the artist', () => {
    const stripe = POPUPS.find((p) => p.key === 'artist_connect_stripe')!;
    const broadcast = POPUPS.find((p) => p.key === 'artist_first_broadcast')!;
    expect(def!.priority).toBeLessThan(stripe.priority);
    expect(def!.priority).toBeLessThan(broadcast.priority);
  });

  it('is not an announcement, so it carries no announcedAt', () => {
    expect(def!.announcedAt).toBeUndefined();
  });

  it('stores no second progress system', () => {
    const route = readFileSync('src/app/api/popups/route.ts', 'utf8');
    expect(route).toContain("from('quest_instances')");
    // Derived from the Quest Engine's own rows: strictly part-done, never persisted anywhere new.
    expect(route).toContain("gt('progress_percent', 0)");
    expect(route).toContain("lt('progress_percent', 100)");
    for (const verb of ['.insert(', '.upsert(']) {
      expect(route.includes(`from('quest_instances')${verb}`)).toBe(false);
    }
  });
});

describe('the composition is wired, and nothing else became a priority engine', () => {
  // The three-card composition this block used to pin (ConstraintCard above RoadmapCard, one of
  // them handed `emphasis="primary"`) was replaced on 2026-08-13 by a single resolved move. Both
  // card files are gone; their content is absorbed by NextMoveCard, which renders whatever
  // `resolveRiseNextMove` hands it. The property being protected is unchanged and now stronger:
  // one instruction, from one canonical owner, with one button. The rendering assertions live in
  // riseNextMove.test.ts; what stays here is that the DECISION still comes from the engine.
  const page = readFileSync('src/app/(main)/profile/artist/page.tsx', 'utf8');
  const card = readFileSync('src/components/artist/NextMoveCard.tsx', 'utf8');
  const resolver = readFileSync('src/lib/riseNextMove.ts', 'utf8');

  it('the page reads the diagnosis ONCE and hands it down', () => {
    expect(page).toContain('resolveOperatingFlow');
    expect(page).toContain("fetch('/api/artist/constraint')");
    // The card must not fetch for itself: a component that decides it is important is how the
    // competing CTAs appeared in the first place.
    expect(card).not.toContain("fetch('/api/artist/constraint')");
    expect(card).not.toContain("fetch('/api/artist/roadmap')");
  });

  it('the resolver picks the owner from the flow, it does not re-rank anything', () => {
    expect(resolver).toContain("flow.primary === 'constraint'");
    // No threshold, no lookback, no comparison of one system's output against another's.
    expect(resolver).not.toMatch(/overdueNow|churnRate|uniqueVisits|CONSTRAINT_THRESHOLDS/);
  });

  it('the canonical CTA carries a returnTo', () => {
    expect(resolver).toContain('withReturnTo(c.action.href)');
    expect(resolver).toContain('withReturnTo(step.href)');
  });

  it('adds no persisted current-constraint state anywhere', () => {
    for (const src of [page, card, resolver]) {
      expect(src).not.toMatch(/current_constraint|active_priority|operating_state/);
    }
  });

  it('does not issue a second Z3 recommendation', () => {
    // Only /api/artist/constraint issues. The page READS the same route; it never records.
    expect(page).not.toContain('recordIssuedRecommendation');
    expect(card).not.toContain('recordIssuedRecommendation');
  });

  it('keeps the legacy decideNextAction contract working for any existing caller', () => {
    expect(decideNextAction(diagnosed()).showConstraintCard).toBe(true);
    expect(decideNextAction(launchGated).showConstraintCard).toBe(false);
    expect(decideNextAction(null).showRoadmap).toBe(true);
    expect(confidenceLabel('high')).toBe('Strong evidence');
  });
});

describe('the launch gate still comes from the engine, not from the UI', () => {
  it('an artist who cannot take money is launch-gated by readConstraint itself', () => {
    const evidence: ConstraintEvidence = {
      now: NOW,
      launch: { pageLive: true, stripeConnected: false, tierPurchasable: false, hasTrack: true, daysLive: 30 },
      reach: { uniqueVisits: 100, lookbackDays: 30 },
      membership: {
        freeMembers: 0, paidMembers: 0, freeJoinsInWindow: 0, daysSinceFirstFreeMember: null,
        hasFirstPaidConversion: false, mrrCents: 0, premiumMrrShare: null,
      },
      tiers: { interactionDataAvailable: false, paidRungs: [], lookbackDays: 30 },
      promises: {
        resolved: 0, completed: 0, missed: 0, completionRate: null, overdueNow: 0,
        oldestOverdue: null, lookbackDays: 90,
      },
      retention: { churnRatePct: null, platformChurnRatePct: null, cancelReasonResponses: null },
      slug: 'someone',
    };
    const flow = resolveOperatingFlow(readConstraint(evidence));
    expect(flow.phase).toBe('launch');
    expect(flow.launchBlockers.length).toBeGreaterThan(0);
  });
});
