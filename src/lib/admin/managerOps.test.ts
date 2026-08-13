import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  deriveCronState,
  classifyFailure,
  summarizeActions,
  approvalFacts,
  lastMeaningfulActivity,
  NO_WORK_HEARTBEAT,
  RATE_SAMPLE_FLOOR,
  type ActionRow,
} from './managerOps';

// Manager admin observability. Operational truth only: no strategist, no outcome scoring, no
// ranking, no mutation.

const DAY = 86400000;
const NOW = new Date('2026-08-11T12:00:00.000Z');
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();
// The same 14-day boundary the execution gate uses. Passed in, never recomputed here.
const CUTOFF = new Date(NOW.getTime() - 14 * DAY).toISOString();

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'));
const raw = (p: string) => readFileSync(p, 'utf8');
const ROUTE = read('src/app/api/admin/manager-ops/route.ts');
const ROUTE_RAW = raw('src/app/api/admin/manager-ops/route.ts');
const VIEW = read('src/components/admin/ManagerOpsView.tsx');
const LIB = read('src/lib/admin/managerOps.ts');
const ADMIN_PAGE = read('src/app/admin/page.tsx');

// The comment stripper above is the repo's shared pattern and it has a known blind spot: a literal
// `/*` inside a LINE comment (e.g. writing a glob like admin/agent/<star>) opens a block-comment
// match that swallows everything up to the next `*/`, imports included. Import assertions
// therefore read the RAW file. A commented-out import would fail the build anyway.

const row = (o: Partial<ActionRow>): ActionRow => ({
  action_type: 'toggle_sequence',
  risk: 'low',
  status: 'pending',
  result_message: null,
  created_at: ago(1),
  executed_at: null,
  reviewed_at: null,
  ...o,
});

describe('health is meaningful WORK, not completion', () => {
  it('a completing cron that processes nothing is its own state, not healthy', () => {
    // The exact defect that hid a four-month outage: the heartbeat existed, so the health check
    // said healthy. Here that is `running_no_work`, which is neither healthy nor an outage.
    const hb = { detail: `${NO_WORK_HEARTBEAT}`, created_at: ago(0.1) };
    expect(deriveCronState(hb, NOW)).toBe('running_no_work');
  });

  it('distinguishes doing work from doing nothing from not running', () => {
    expect(deriveCronState({ detail: 'processed 3, insights 5, executed 0, escalated 1', created_at: ago(0.1) }, NOW))
      .toBe('running_with_work');
    expect(deriveCronState({ detail: NO_WORK_HEARTBEAT, created_at: ago(5) }, NOW)).toBe('not_running');
    expect(deriveCronState(null, NOW)).toBe('unknown');
    expect(deriveCronState({ detail: 'x', created_at: 'not-a-date' }, NOW)).toBe('unknown');
  });
});

describe('failures are classified from what CRWN actually recorded', () => {
  it('reads back the structured refusal written by the execution gate', () => {
    expect(classifyFailure('not_executed:expired — This suggestion is out of date.')).toBe('expired');
    expect(classifyFailure('not_executed:target_missing — That tier no longer exists.')).toBe('target_missing');
    expect(classifyFailure('not_executed:already_satisfied — Already at this price.')).toBe('already_satisfied');
  });

  it('recognises a coordination lock conflict', () => {
    expect(classifyFailure('Action blocked: another agent is already running: adjust_tier_price')).toBe('lock_conflict');
  });

  it('does not invent a category it cannot justify', () => {
    expect(classifyFailure(null)).toBe('unclassified');
    expect(classifyFailure('   ')).toBe('unclassified');
    expect(classifyFailure('not_executed:something_new')).toBe('unclassified');
    expect(classifyFailure('Stripe exploded')).toBe('handler_error');
  });
});

describe('valid and expired pending are never conflated', () => {
  const rows = [
    row({ status: 'pending', created_at: ago(130) }),           // the real production case
    row({ status: 'pending', created_at: ago(20) }),
    row({ status: 'pending', created_at: ago(3) }),
    row({ status: 'pending', created_at: ago(9) }),
    row({ status: 'executed', created_at: ago(40) }),
    row({ status: 'auto_executed', created_at: ago(41) }),
    row({ status: 'rejected', created_at: ago(42) }),
    row({ status: 'failed', created_at: ago(43), result_message: 'not_executed:expired — old' }),
  ];
  const s = summarizeActions(rows, CUTOFF, NOW);

  it('counts only in-window pending as awaiting approval', () => {
    expect(s.validPending).toBe(2);   // 3d and 9d
    expect(s.expiredPending).toBe(2); // 130d and 20d
  });

  it('measures oldest age from the oldest VALID pending, not the oldest row', () => {
    expect(s.oldestValidPendingDays).toBe(9);
  });

  it('separates artist-approved from auto-executed', () => {
    expect(s.approved).toBe(1);
    expect(s.autoExecuted).toBe(1);
    expect(s.rejected).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.failuresByKind.expired).toBe(1);
  });

  it('reports null oldest age when nothing valid is waiting', () => {
    const only = summarizeActions([row({ status: 'pending', created_at: ago(130) })], CUTOFF, NOW);
    expect(only.validPending).toBe(0);
    expect(only.oldestValidPendingDays).toBeNull();
  });

  it('an empty dataset is zeros, not an error', () => {
    const e = summarizeActions([], CUTOFF, NOW);
    expect(e.total).toBe(0);
    expect(e.validPending).toBe(0);
    expect(e.oldestValidPendingDays).toBeNull();
  });
});

describe('approvals are facts, never a verdict on Manager', () => {
  it('abandoned is its own outcome, not a rejection', () => {
    const s = summarizeActions(
      [row({ status: 'pending', created_at: ago(130) }), row({ status: 'rejected' }), row({ status: 'executed' })],
      CUTOFF, NOW,
    );
    const a = approvalFacts(s);
    expect(a.abandoned).toBe(1);
    expect(a.rejected).toBe(1);
    expect(a.approved).toBe(1);
    expect(a.decided).toBe(2);
  });

  it('refuses to express a rate on a tiny sample', () => {
    const small = approvalFacts(summarizeActions([row({ status: 'executed' })], CUTOFF, NOW));
    expect(small.sampleTooSmallForRates).toBe(true);
    expect(RATE_SAMPLE_FLOOR).toBeGreaterThan(1);
    // And it never computes one at all: no percentage field exists to be misread.
    expect(Object.keys(small)).not.toContain('approvalRate');
  });
});

describe('last meaningful activity', () => {
  it('takes the most recent real timestamp and tolerates gaps', () => {
    expect(lastMeaningfulActivity([null, ago(10), undefined, ago(2), 'garbage'])).toBe(ago(2));
    expect(lastMeaningfulActivity([null, undefined])).toBeNull();
    expect(lastMeaningfulActivity([])).toBeNull();
  });
});

describe('retired learning must not return through admin', () => {
  const SOURCES: [string, string][] = [['lib', LIB], ['route', ROUTE], ['view', VIEW]];

  it('no outcome score, delta or causal verdict anywhere in the surface', () => {
    for (const [label, src] of SOURCES) {
      for (const banned of ['outcome_score', 'outcome_delta', 'outcome_metrics', 'baseline_metrics']) {
        expect(src, `${label} must not read ${banned}`).not.toContain(banned);
      }
      expect(src, `${label} must not verdict POSITIVE`).not.toMatch(/'POSITIVE'|"POSITIVE"/);
      expect(src, `${label} must not verdict NEGATIVE`).not.toMatch(/'NEGATIVE'|"NEGATIVE"/);
      // Match the CLAIM, not the word. The view's own copy says the page will NOT tell you whether
      // an action "worked"; a bare /worked/ would fail on that disclaimer and pass on a real
      // verdict. Same trap the Manager prompt tests hit.
      expect(src, `${label} must not compute an efficacy metric`).not.toMatch(/mrrLift|successRate|outcomeScore|efficacy|performanceScore/i);
      expect(src, `${label} must not assert an action produced a result`).not.toMatch(
        /(action|it)\s+(worked|improved|caused|lifted)\b/i,
      );
    }
  });

  it('the route selects explicit columns so retired ones cannot ride along', () => {
    // `select('*')` on artist_agent_actions would pull the legacy JSONB columns into an admin
    // payload. Their continued existence in the table is not permission to ship them.
    expect(ROUTE).not.toMatch(/from\('artist_agent_actions'\)[\s\S]{0,60}select\('\*'\)/);
    expect(ROUTE).toMatch(/select\('artist_id, action_type, action_label, risk, status, result_message/);
  });

  it('no cross-artist comparison, ranking or benchmarking', () => {
    for (const [label, src] of SOURCES) {
      expect(src, `${label} must not rank artists`).not.toMatch(/rank|leaderboard|percentile|topArtists|bestPerforming/i);
      expect(src, `${label} must not compare cohorts`).not.toContain('crossArtistEvidence');
    }
  });
});

describe('the surface is read-only and admin-only', () => {
  it('is guarded by requireAdmin and refuses non-admins', () => {
    expect(ROUTE).toContain('requireAdmin');
    expect(ROUTE).toMatch(/if \(!admin\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 403 \}\)/);
  });

  it('exposes no mutating handler at all', () => {
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(ROUTE, `manager-ops must not export ${verb}`).not.toMatch(new RegExp(`export async function ${verb}`));
    }
  });

  it('performs no write of any kind', () => {
    for (const w of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(ROUTE, `route must not ${w}`).not.toContain(w);
    }
  });

  it('takes no artist id from the caller: there is nothing to enumerate', () => {
    // No query params, no body. An admin sees the estate or nothing; there is no
    // ?artistId= to point at someone.
    expect(ROUTE).toMatch(/export async function GET\(\)/);
    expect(ROUTE).not.toContain('searchParams');
  });

  it('the view offers no control at all: no button, no form, no write', () => {
    // Assert on the MECHANISM, not on vocabulary. "Approved" and "Awaiting approval" are
    // legitimate read-only stat labels; what must not exist is anything clickable that mutates.
    expect(VIEW, 'view must render no button').not.toMatch(/<button/i);
    expect(VIEW, 'view must have no click handler').not.toMatch(/onClick/);
    expect(VIEW, 'view must have no form').not.toMatch(/<form/i);
    expect(VIEW, 'view must not POST anywhere').not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/);
    // The only fetch it may perform is the read.
    const fetches = VIEW.match(/fetch\(/g) || [];
    expect(fetches.length).toBe(1);
    expect(VIEW).toContain("fetch('/api/admin/manager-ops')");
  });

  it('identifies artists by public slug, never by name or email', () => {
    expect(ROUTE).toContain("select('id, slug')");
    expect(ROUTE).not.toContain('display_name');
    expect(ROUTE).not.toContain('email');
  });
});

describe('boundaries with the rest of CRWN', () => {
  it('does not touch CRWN own business agent tables', () => {
    // artist Manager != the admin agent. Merging them is the confusion this tab is named to avoid.
    expect(ROUTE).not.toContain('autonomous_run_log');
    expect(ROUTE).not.toContain('admin/agent');
  });

  it('does not reactivate autonomy or touch the dormant cron', () => {
    // DELETED 2026-08-13, which is strictly stronger than the tripwire this line used to be.
    // The autonomous Manager was dormant only because of .eq('is_active', true) on a column that
    // does not exist, so any unrelated schema tidy-up could have re-armed auto-executing AI across
    // every artist account with no founder decision. The cron is gone; the artist-REQUESTED routes
    // under /api/ai-manager are untouched.
    expect(existsSync('src/app/api/cron/ai-manager/route.ts'), 'the autonomous Manager cron came back — that is a founder decision, not a cleanup').toBe(false);
    expect(ROUTE).not.toContain('runAutonomousAgent');
  });

  it('does not touch payouts', () => {
    for (const [, src] of [['route', ROUTE], ['view', VIEW]] as const) {
      expect(src).not.toMatch(/payouts|weekly-payout|stripe/i);
    }
  });

  it('reads the ONE validity cutoff rather than redefining expiry', () => {
    expect(ROUTE_RAW).toContain("from '@/lib/ai/actionValidity'");
    expect(ROUTE).toContain('staleBefore');
    // The pure summariser must not compute its own window.
    expect(LIB).not.toMatch(/14 \* 24|MANAGER_ACTION_TTL/);
  });

  it('adds no schema', () => {
    // Everything comes from tables that already exist.
    for (const t of ['artist_agent_actions', 'artist_agent_runs', 'ai_insights', 'cron_heartbeat', 'artist_profiles']) {
      expect(ROUTE, `expected existing table ${t}`).toContain(t);
    }
    expect(ROUTE).not.toMatch(/manager_ops_|_telemetry|CREATE TABLE/);
  });
});

describe('navigation', () => {
  it('is removed from admin navigation and stays removed', () => {
    // 2026-08-13 surface reduction: the Artist Manager tab reported on a system with 7 lifetime
    // actions whose scheduled half is deleted and whose artist-facing half is hidden. The VIEW
    // and its API survive in the repo (this file still pins their read-only contract above);
    // only the navigation entry is gone. If the tab returns, it returns as ONE tab.
    expect((ADMIN_PAGE.match(/'managerops'/g) || []).length).toBe(0);
    expect((ADMIN_PAGE.match(/<ManagerOpsView \/>/g) || []).length).toBe(0);
    expect(existsSync('src/components/admin/ManagerOpsView.tsx'), 'the view itself is HIDDEN, not deleted').toBe(true);
    expect(existsSync('src/app/api/admin/manager-ops/route.ts'), 'the API is HIDDEN, not deleted').toBe(true);
  });

  it('does not collide with the CRWN internal agent panel', () => {
    // AgentInsights (CRWN's own agent) was also hidden from admin navigation the same day.
    // Neither agent surface may quietly return under a name that confuses it with the other.
    expect(ADMIN_PAGE).not.toContain('Admin Manager');
    expect(ADMIN_PAGE).not.toContain('<AgentInsights');
  });
});
