import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// NEEDS YOU BOUNDARY.
//
// Needs You owns "what happened, what is due, what is waiting on me". It does NOT own "what
// matters most about my business" — the Constraint Engine does, Manager explains it, Rise Mode is
// where the work happens.
//
// Until 2026-08-11 this surface also turned a pre-signup calculator into a ranked recommendation
// ("Build Membership ($X/mo)") and hardcoded the top one to `high`, with a comment saying it "leads
// the whole plan". So an artist diagnosed FULFILLMENT could see "deliver your overdue promise" on
// Rise Mode and a growth mission ranked high here at the same moment. Manager is explicitly
// forbidden from contradicting the canonical priority (Z4); this path never received that rule.
//
// The calculator commitment was NOT deleted. It lives in Rise Mode, which is also what remembers
// progress against it.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'));
const raw = (p: string) => readFileSync(p, 'utf8');

const NEEDS_YOU = read('src/app/api/action-plan/route.ts');
const NEEDS_YOU_RAW = raw('src/app/api/action-plan/route.ts');
const QUESTS = read('src/app/api/quests/route.ts');
const MISSIONS = read('src/lib/leadResults/leadMagnetMissions.ts');
const PAGE = read('src/app/action-plan/page.tsx');
const STUDIO = read('src/app/(main)/studio/page.tsx');
const HUB = read('src/components/layout/AccountHub.tsx');

describe('calculator missions no longer appear in Needs You', () => {
  it('the route does not build or import them', () => {
    expect(NEEDS_YOU).not.toContain('buildLeadMagnetMissions');
    expect(NEEDS_YOU).not.toContain('leadMagnetMissions');
  });

  it('the strategic "high" ranking from calculator missions is gone', () => {
    expect(NEEDS_YOU).not.toContain('lead-magnet-mission-');
    // The specific construct that produced the conflict.
    expect(NEEDS_YOU).not.toMatch(/i === 0 \? 'high' : 'medium'/);
  });

  it('no remaining item is ranked by opportunity size rather than urgency', () => {
    expect(NEEDS_YOU).not.toMatch(/monthlyValue|opportunity|Start this mission/);
  });
});

describe('the calculator commitment is preserved, not deleted', () => {
  it('the shared generator still exists', () => {
    expect(existsSync('src/lib/leadResults/leadMagnetMissions.ts')).toBe(true);
    expect(MISSIONS).toContain('LEAD_MAGNET_MISSIONS');
  });

  it('Rise Mode still consumes it and still leads with the top mission', () => {
    expect(QUESTS).toContain('buildLeadMagnetMissions');
    expect(QUESTS).toMatch(/const top = missions\[0\]/);
  });

  it('Rise Mode is now the ONLY reader', () => {
    // If a second reader returns, it must not re-rank these against anything.
    const readers = ['src/app/api/quests/route.ts', 'src/app/api/action-plan/route.ts']
      .filter((p) => read(p).includes('buildLeadMagnetMissions'));
    expect(readers).toEqual(['src/app/api/quests/route.ts']);
  });
});

describe('the legitimate event and deadline rules still fire', () => {
  it('keeps every event rule', () => {
    for (const id of ['clip-window-closing', 'pending-fan-suggestions', 'proof-of-demand-met']) {
      expect(NEEDS_YOU, `${id} must survive`).toContain(id);
    }
  });

  it('still orders by urgency, which is legitimate for deadlines', () => {
    // The prohibition is on ranking strategy, not on ordering deadlines.
    expect(NEEDS_YOU).toMatch(/const high: NeedsYouItem\[\]/);
    expect(NEEDS_YOU).toMatch(/const medium: NeedsYouItem\[\]/);
    expect(NEEDS_YOU).toMatch(/const low: NeedsYouItem\[\]/);
  });

  it('every surviving item is triggered by a fact, not by a projection', () => {
    // Each rule reads a real row: a rate step-down date, a pending suggestion, a met demand goal.
    for (const table of ['mission_suggestions', 'proof_of_demand']) {
      expect(NEEDS_YOU).toContain(table);
    }
    expect(NEEDS_YOU).toContain('resolveClipperRateTimeline');
  });
});

describe('Needs You does not own strategic priority', () => {
  it('never reads the Constraint Engine', () => {
    // It must not diagnose, and it must not re-derive the canonical answer either.
    expect(NEEDS_YOU).not.toContain('readConstraint');
    expect(NEEDS_YOU).not.toContain('assembleConstraintEvidence');
  });

  it('issues no Z3 recommendation', () => {
    expect(NEEDS_YOU).not.toContain('recordIssuedRecommendation');
  });

  it('writes nothing and stays advisory', () => {
    expect(NEEDS_YOU).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });

  it('creates no Manager action', () => {
    expect(NEEDS_YOU).not.toContain('artist_agent_actions');
    expect(NEEDS_YOU).not.toContain('generateActions');
  });

  it('resolves the artist from the session, never a caller-supplied id', () => {
    expect(NEEDS_YOU).toMatch(/eq\('user_id', user\.id\)/);
    expect(NEEDS_YOU).not.toContain('searchParams');
  });
});

describe('urgency semantics are documented, not conflated with priority', () => {
  it('the type is named for urgency', () => {
    expect(NEEDS_YOU).toContain('NeedsYouUrgency');
    expect(NEEDS_YOU).toContain('NeedsYouItem');
  });

  it('the old strategic type names are gone', () => {
    expect(NEEDS_YOU).not.toContain('ActionPlanRecommendation');
    expect(NEEDS_YOU).not.toContain('ActionPlanPriority');
  });

  it('the header no longer describes a ranked plan of next best moves', () => {
    expect(NEEDS_YOU_RAW).not.toMatch(/next best moves/);
    expect(NEEDS_YOU_RAW).toContain('NEEDS YOU');
  });

  it('keeps the wire field `priority` for compatibility with the page', () => {
    // Renaming the wire field would be a compatibility break for terminology alone.
    expect(NEEDS_YOU).toMatch(/priority: NeedsYouUrgency/);
    expect(PAGE).toContain('priority');
  });
});

describe('route, label and analytics compatibility', () => {
  it('the legacy route still resolves', () => {
    expect(existsSync('src/app/action-plan/page.tsx')).toBe(true);
    expect(existsSync('src/app/api/action-plan/route.ts')).toBe(true);
    expect(PAGE).toContain("fetch('/api/action-plan')");
  });

  // The 2026-08-13 pre-PMF surface reduction removed the Needs You tile and hub entry: all three
  // of its rules read features that are now hidden (0 clip bounties, 0 fan suggestions, 1 proof of
  // demand), so the surface had nothing to say. The RENAME still has to hold wherever the surface
  // is presented, and the route still has to resolve, so those properties moved to the page.
  it('the user-facing label is the renamed one, and the retired name never comes back', () => {
    expect(PAGE).toContain('What needs you');
    for (const src of [PAGE, STUDIO, HUB]) {
      expect(src).not.toContain("title: 'Action Plan'");
      expect(src).not.toContain("label: 'Action Plan'");
    }
  });

  it('the legacy href is not resurrected in navigation while the surface is hidden', () => {
    // Hidden means hidden. If a nav entry comes back it must come back as 'Needs You', never as
    // the retired 'Action Plan' label (asserted above), and this test should be updated with it.
    expect(STUDIO).not.toContain("href: '/action-plan'");
    expect(HUB).not.toContain("href: '/action-plan'");
  });

  it('the tour id is unchanged, so no artist loses their dismissed-tour state', () => {
    // `usePageTour` persists completion keyed on tourId. Renaming it would replay the tour for
    // everyone who already dismissed it, which is a real cost for a cosmetic gain.
    expect(PAGE).toMatch(/tourId: 'action-plan'/);
  });

  it('surviving item ids are unchanged, so historical analytics still group', () => {
    for (const id of ['clip-window-closing', 'pending-fan-suggestions', 'proof-of-demand-met']) {
      expect(NEEDS_YOU).toContain(`id: '${id}'`);
    }
  });
});

describe('neighbouring boundaries are untouched', () => {
  it('Manager still reads the canonical priority and is still subordinate', () => {
    const PROMPT = read('src/lib/ai/generateActions.ts');
    expect(PROMPT).toContain('CANONICAL DIAGNOSIS, READ THIS FIRST');
    expect(PROMPT).toContain('OUTRANKS the decision framework');
  });

  it('autonomous Manager remains dormant', () => {
    // DELETED 2026-08-13, which is strictly stronger than the tripwire this line used to be.
    // The autonomous Manager was dormant only because of .eq('is_active', true) on a column that
    // does not exist, so any unrelated schema tidy-up could have re-armed auto-executing AI across
    // every artist account with no founder decision. The cron is gone; the artist-REQUESTED routes
    // under /api/ai-manager are untouched.
    expect(existsSync('src/app/api/cron/ai-manager/route.ts'), 'the autonomous Manager cron came back — that is a founder decision, not a cleanup').toBe(false);
  });

  it('Needs You does not import Manager or Rise Mode internals', () => {
    expect(NEEDS_YOU).not.toContain('lib/quests');
    expect(NEEDS_YOU).not.toContain('lib/ai/');
  });
});
