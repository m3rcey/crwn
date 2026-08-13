import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readStripped } from './architecture/sourceScan';
import { resolveRiseNextMove } from './riseNextMove';
import { resolveOperatingFlow } from './constraint/presentation';
import { readConstraint } from './constraint/engine';
import { assembleRoadmap, buildRoadmapDefs, type RoadmapStepResult } from './artistRoadmap';
import type { ConstraintEvidence } from './constraint/types';

// ONE NEXT MOVE.
//
// Rise Mode is the presentation layer for a single resolved priority. These tests pin the two
// things that matter: the artist is never handed two competing instructions, and an overdue
// promise owed to supporters who already paid outranks a normal roadmap milestone.
//
// The override is asserted THROUGH the real engine (readConstraint) rather than against a
// hand-built flow, because the rule lives in the engine's stage order. A test that stubbed the
// diagnosis would pass even if someone moved FULFILLMENT below REACH.

const NOW = '2026-08-13T00:00:00.000Z';

/** A fully launched artist: past Stage 0, so the engine will actually evaluate performance. */
function evidence(over: Partial<ConstraintEvidence> = {}): ConstraintEvidence {
  return {
    now: NOW,
    launch: { pageLive: true, stripeConnected: true, tierPurchasable: true, hasTrack: true, daysLive: 60 },
    reach: { uniqueVisits: 400, lookbackDays: 30 },
    membership: {
      freeMembers: 40,
      paidMembers: 12,
      freeJoinsInWindow: 40,
      daysSinceFirstFreeMember: 40,
      hasFirstPaidConversion: true,
      mrrCents: 20000,
      premiumMrrShare: 0.9,
    },
    tiers: { interactionDataAvailable: false, paidRungs: [], lookbackDays: 30 },
    promises: {
      resolved: 0, completed: 0, missed: 0, completionRate: null,
      overdueNow: 0, oldestOverdue: null, lookbackDays: 90,
    },
    retention: { churnRatePct: 2, platformChurnRatePct: 5, cancelReasonResponses: 0 },
    slug: 'someone',
    ...over,
  };
}

/** A roadmap whose next step is the ordinary Foundation milestone "Complete your public profile". */
function roadmapWithOpenProfileStep() {
  const defs = buildRoadmapDefs({ slug: 'someone' });
  const results: Record<string, RoadmapStepResult> = {};
  for (const stage of defs) {
    for (const step of stage.steps) {
      // Everything done except the profile step and everything after it.
      const done = step.key !== 'foundation-profile' && stage.key === 'foundation';
      results[step.key] = { done, current: done ? 1 : 0, target: 1 };
    }
  }
  return assembleRoadmap(defs, results);
}

describe('an overdue promise to paying supporters beats a roadmap milestone', () => {
  const roadmap = roadmapWithOpenProfileStep();

  it('the roadmap milestone becomes "After this", not a second instruction', () => {
    const overdue = readConstraint(
      evidence({
        promises: {
          resolved: 0, completed: 0, missed: 0, completionRate: null,
          overdueNow: 2,
          oldestOverdue: { title: 'August vault drop', dueAt: '2026-08-01T00:00:00.000Z' },
          lookbackDays: 90,
        },
      }),
    );
    expect(overdue.status).toBe('diagnosed');

    const next = resolveRiseNextMove(resolveOperatingFlow(overdue), roadmap);
    expect(next.move?.owner).toBe('constraint');
    expect(next.move?.title).toContain('August vault drop');
    // The roadmap step the artist would otherwise have been told to do is demoted to a line.
    expect(next.afterThis).toBe('Complete your public profile');
    expect(next.stageTitle).toBe('Foundation');
  });

  it('the fact is stated ONCE, and the constraint headline that repeated it is gone', () => {
    const overdue = readConstraint(
      evidence({
        promises: {
          resolved: 0, completed: 0, missed: 0, completionRate: null,
          overdueNow: 2,
          oldestOverdue: { title: 'August vault drop', dueAt: '2026-08-01T00:00:00.000Z' },
          lookbackDays: 90,
        },
      }),
    );
    const next = resolveRiseNextMove(resolveOperatingFlow(overdue), roadmap);
    const rendered = [next.move?.title, next.move?.reason, next.move?.fact].filter(Boolean) as string[];
    const pastDueMentions = rendered.filter((s) => /past due/i.test(s));
    expect(pastDueMentions).toHaveLength(1);
  });

  it('with no constraint diagnosed, the ordinary roadmap milestone wins', () => {
    const clean = readConstraint(evidence());
    expect(clean.status).toBe('insufficient_evidence');
    const next = resolveRiseNextMove(resolveOperatingFlow(clean), roadmap);
    expect(next.phase).toBe('steady');
    expect(next.move?.owner).toBe('roadmap');
    expect(next.move?.title).toBe('Complete your public profile');
    expect(next.launchNote).toBeNull();
  });

  it('fulfillment outranks reach, so the engine order itself is what decides', () => {
    // Both problems at once: nobody is visiting AND a promise is overdue.
    const both = readConstraint(
      evidence({
        reach: { uniqueVisits: 1, lookbackDays: 30 },
        promises: {
          resolved: 0, completed: 0, missed: 0, completionRate: null,
          overdueNow: 1,
          oldestOverdue: { title: 'Members-only demo', dueAt: '2026-08-02T00:00:00.000Z' },
          lookbackDays: 90,
        },
      }),
    );
    expect(both.status === 'diagnosed' && both.constraint).toBe('FULFILLMENT');
  });
});

describe('exactly one instruction, whatever the inputs', () => {
  const roadmap = roadmapWithOpenProfileStep();

  it('never returns a move that is also the "after this"', () => {
    const clean = resolveRiseNextMove(resolveOperatingFlow(readConstraint(evidence())), roadmap);
    expect(clean.afterThis).not.toBe(clean.move?.title);
  });

  it('the CTA always returns the artist to Rise Mode', () => {
    for (const roadmapArg of [roadmap, null]) {
      const next = resolveRiseNextMove(
        resolveOperatingFlow(
          readConstraint(
            evidence({
              promises: {
                resolved: 0, completed: 0, missed: 0, completionRate: null,
                overdueNow: 1, oldestOverdue: null, lookbackDays: 90,
              },
            }),
          ),
        ),
        roadmapArg,
      );
      expect(next.move?.href).toContain('returnTo=%2Fprofile%2Fartist');
    }
  });

  it('a launch-gated artist gets ONE sentence about why, not a bulleted list', () => {
    const gated = readConstraint(
      evidence({ launch: { pageLive: true, stripeConnected: false, tierPurchasable: false, hasTrack: true, daysLive: 30 } }),
    );
    const next = resolveRiseNextMove(resolveOperatingFlow(gated), roadmap);
    expect(next.phase).toBe('launch');
    expect(next.launchNote).toContain('Still missing');
    expect(next.move?.owner).toBe('roadmap');
  });

  it('survives a failed read of either side without blanking the screen', () => {
    const noConstraint = resolveRiseNextMove(resolveOperatingFlow(null), roadmap);
    expect(noConstraint.move?.owner).toBe('roadmap');

    const noRoadmap = resolveRiseNextMove(
      resolveOperatingFlow(
        readConstraint(
          evidence({
            promises: {
              resolved: 0, completed: 0, missed: 0, completionRate: null,
              overdueNow: 1, oldestOverdue: null, lookbackDays: 90,
            },
          }),
        ),
      ),
      null,
    );
    expect(noRoadmap.move?.owner).toBe('constraint');
    expect(noRoadmap.afterThis).toBeNull();
    expect(noRoadmap.stageTitle).toBeNull();
  });

  it('says so plainly when there is nothing left to do', () => {
    const defs = buildRoadmapDefs({ slug: 'someone' });
    const all: Record<string, RoadmapStepResult> = {};
    for (const s of defs) for (const step of s.steps) all[step.key] = { done: true, current: 1, target: 1 };
    const next = resolveRiseNextMove(resolveOperatingFlow(readConstraint(evidence())), assembleRoadmap(defs, all));
    expect(next.move).toBeNull();
    expect(next.allComplete).toBe(true);
  });
});

describe('the Rise Mode surface renders one decision and nothing that competes with it', () => {
  // Comments stripped: these files EXPLAIN what was removed and why, and a scan that counted
  // the explanation as the thing would either fail honest documentation or pressure it out.
  const page = readStripped('src/app/(main)/profile/artist/page.tsx');
  const card = readStripped('src/components/artist/NextMoveCard.tsx');
  const roadmapDisclosure = readStripped('src/components/artist/FullRoadmap.tsx');

  it('resolves ONE move from the canonical answers, and adds no engine of its own', () => {
    expect(page).toContain('resolveOperatingFlow');
    expect(page).toContain('resolveRiseNextMove');
    expect(page).toContain("fetch('/api/artist/constraint')");
    expect(page).toContain("fetch('/api/artist/roadmap')");
    // The presentation layer holds no rule: it renders `next.move` or it renders nothing.
    expect(card).not.toMatch(/overdue|constraint ===|FULFILLMENT|priority/i);
  });

  it('exposes no XP, level, artist build or Focus chrome', () => {
    for (const src of [page, card, roadmapDisclosure]) {
      expect(src).not.toMatch(/\bXP\b|percentToNext|levelTitle|ArtistBuildPicker|MovementMap|setFocusMode/);
    }
  });

  it('exposes no membership-strategy card, stat tiles or upcoming-promise list', () => {
    for (const src of [page, card, roadmapDisclosure]) {
      expect(src).not.toMatch(/StrategyCard|upcomingPromises|mrrCents|paidMembers|goalMonthlyCents/);
    }
  });

  it('drops the whole-roadmap percentage in favour of discrete milestones', () => {
    for (const src of [page, card, roadmapDisclosure]) expect(src).not.toContain('progressPercent');
    expect(card).toContain('stageProgress');
  });

  it('renders exactly one gold CTA on the surface', () => {
    const goldButtons = [...card.matchAll(/bg-crwn-gold text-crwn-bg/g)];
    expect(goldButtons).toHaveLength(1);
    expect(page).not.toContain('bg-crwn-gold text-crwn-bg');
  });

  it('keeps the full roadmap reachable as an escape hatch, with no primary button in it', () => {
    expect(card).toContain('View full roadmap');
    expect(roadmapDisclosure).not.toContain('bg-crwn-gold text-crwn-bg');
    expect(roadmapDisclosure).not.toContain('Do it now');
  });

  it('keeps the Quest Engine running even though its board is gone', () => {
    // /api/quests ASSIGNS and auto-completes server-side. Dropping the board without keeping
    // this call would freeze quests and XP for every artist who never opens /quests.
    expect(page).toContain('variant="driver"');
    const rise = readFileSync('src/components/artist/RiseMode.tsx', 'utf8');
    expect(rise).toContain("fetch('/api/quests'");
    const board = readFileSync('src/app/(main)/quests/page.tsx', 'utf8');
    expect(board).toContain('<RiseMode />');
  });

  it('stores no second progress or priority state anywhere on the surface', () => {
    for (const src of [page, card, roadmapDisclosure]) {
      expect(src).not.toMatch(/current_constraint|active_priority|operating_state/);
      expect(src).not.toContain('recordIssuedRecommendation');
    }
  });
});
