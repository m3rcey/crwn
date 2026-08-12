// managerOps.ts — the pure brain behind the admin's ARTIST MANAGER observability panel.
//
// WHAT THIS IS
// ------------
// Operational truth about the artist-facing Manager: is it being used, is anything stuck, is
// anything failing, and is anything waiting on an artist. Read-only, derived from rows that
// already exist. It adds no telemetry table and no new column.
//
// WHAT THIS IS NOT
// ----------------
//  - Not an admin strategist. It never says what an artist should do, and it cannot.
//  - Not an outcome scorer. `outcome_score`, POSITIVE/NEGATIVE/NEUTRAL, "worked", "no lift" and
//    MRR-delta-as-proof were retired on 2026-08-11 because they were causal claims CRWN cannot
//    support. The legacy JSONB columns still physically exist on `artist_agent_actions`; their
//    existence is not permission to render them. Nothing here reads them.
//  - Not a ranking. No artist is scored, compared or ordered by quality.
//  - Not a control panel. There is no execute, approve, unexpire or override.
//
// THE HEALTH RULE THIS FILE EXISTS TO ENFORCE
// -------------------------------------------
// CRWN has already been burned once by health-by-completion: the ai-manager cron wrote a heartbeat
// on every run, `agent-health` read that heartbeat as proof of life, and the cron spent four months
// returning "No active artists" while the whole system was dead. A run that completed is NOT a run
// that did something. `deriveCronState` therefore has THREE states, and the middle one is the one
// that outage needed: running-but-doing-nothing is its own answer, reported with the reason the
// cron itself recorded.

/** The exact string the ai-manager cron writes when its artist query returns nothing. */
export const NO_WORK_HEARTBEAT = 'No active artists';

/** A heartbeat older than this means the cron is not running at all. Daily cron, so 2 missed days. */
export const HEARTBEAT_STALE_MS = 48 * 60 * 60 * 1000;

export type CronState =
  /** No heartbeat inside the window: the job is not running. */
  | 'not_running'
  /** Running and completing, but doing no work. The state the old heartbeat could not express. */
  | 'running_no_work'
  /** Running and doing work. */
  | 'running_with_work'
  /** No heartbeat row has ever been written (table missing, or job never deployed). */
  | 'unknown';

export interface Heartbeat {
  detail: string | null;
  created_at: string;
}

export function deriveCronState(latest: Heartbeat | null | undefined, now: Date = new Date()): CronState {
  if (!latest) return 'unknown';
  const at = new Date(latest.created_at).getTime();
  if (!Number.isFinite(at)) return 'unknown';
  if (now.getTime() - at > HEARTBEAT_STALE_MS) return 'not_running';
  return (latest.detail ?? '').startsWith(NO_WORK_HEARTBEAT) ? 'running_no_work' : 'running_with_work';
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

export type FailureKind =
  /** Refused by the validity gate: the action aged out. */
  | 'expired'
  /** Refused by the validity gate: tier/sequence/track gone or not this artist's. */
  | 'target_missing'
  /** Refused by the validity gate: the world already matches the intent. */
  | 'already_satisfied'
  /** Another agent held the coordination lock. */
  | 'lock_conflict'
  /** The action handler itself threw. */
  | 'handler_error'
  /** Recorded as failed with nothing usable to classify by. */
  | 'unclassified';

/**
 * Classify a failure from `result_message`, which is the only structured record CRWN keeps.
 *
 * The `not_executed:<reason>` prefix is written by the execution boundary's validity gate, so
 * these are read back rather than guessed. Anything else is a handler error or unclassified, and
 * saying "unclassified" is deliberate: inventing a category for a message we do not recognise is
 * how a dashboard starts lying.
 */
export function classifyFailure(resultMessage: string | null | undefined): FailureKind {
  const m = (resultMessage ?? '').trim();
  if (!m) return 'unclassified';
  const structured = m.match(/^not_executed:([a-z_]+)/);
  if (structured) {
    const r = structured[1];
    if (r === 'expired' || r === 'target_missing' || r === 'already_satisfied') return r;
    return 'unclassified';
  }
  if (/another agent is already running/i.test(m)) return 'lock_conflict';
  return 'handler_error';
}

/** Plain wording for the founder. No blame, no quality judgement. */
export const FAILURE_LABELS: Record<FailureKind, string> = {
  expired: 'Expired before approval',
  target_missing: 'Target no longer exists',
  already_satisfied: 'Already in that state',
  lock_conflict: 'Blocked by a concurrent action',
  handler_error: 'Handler error',
  unclassified: 'Unclassified',
};

// ---------------------------------------------------------------------------
// Action summary
// ---------------------------------------------------------------------------

export interface ActionRow {
  action_type: string;
  risk: string | null;
  status: string;
  result_message: string | null;
  created_at: string;
  executed_at: string | null;
  reviewed_at: string | null;
}

export interface ActionSummary {
  total: number;
  /** Pending AND still inside the validity window: the only ones an artist can act on. */
  validPending: number;
  /** Pending but aged out. Still rows, no longer offered, never counted as an approval queue. */
  expiredPending: number;
  /** Age in whole days of the oldest action an artist could still approve. Null when none. */
  oldestValidPendingDays: number | null;
  approved: number;
  rejected: number;
  autoExecuted: number;
  failed: number;
  byType: Record<string, number>;
  byRisk: Record<string, number>;
  failuresByKind: Record<string, number>;
}

const DAY_MS = 86400000;

/**
 * Summarize action rows. `staleBeforeIso` is passed IN rather than recomputed here so the panel
 * can never disagree with the execution boundary about what "expired" means: both read the one
 * cutoff from `ai/actionValidity.ts`.
 */
export function summarizeActions(
  rows: ActionRow[],
  staleBeforeIso: string,
  now: Date = new Date(),
): ActionSummary {
  const s: ActionSummary = {
    total: rows.length,
    validPending: 0,
    expiredPending: 0,
    oldestValidPendingDays: null,
    approved: 0,
    rejected: 0,
    autoExecuted: 0,
    failed: 0,
    byType: {},
    byRisk: {},
    failuresByKind: {},
  };

  let oldestValidPendingAt: number | null = null;

  for (const r of rows) {
    s.byType[r.action_type] = (s.byType[r.action_type] || 0) + 1;
    const risk = r.risk ?? 'unknown';
    s.byRisk[risk] = (s.byRisk[risk] || 0) + 1;

    switch (r.status) {
      case 'pending': {
        if (r.created_at < staleBeforeIso) {
          s.expiredPending++;
        } else {
          s.validPending++;
          const t = new Date(r.created_at).getTime();
          if (Number.isFinite(t) && (oldestValidPendingAt === null || t < oldestValidPendingAt)) {
            oldestValidPendingAt = t;
          }
        }
        break;
      }
      case 'executed':
        s.approved++;
        break;
      case 'auto_executed':
        s.autoExecuted++;
        break;
      case 'rejected':
        s.rejected++;
        break;
      case 'failed': {
        s.failed++;
        const kind = classifyFailure(r.result_message);
        s.failuresByKind[kind] = (s.failuresByKind[kind] || 0) + 1;
        break;
      }
      default:
        break;
    }
  }

  if (oldestValidPendingAt !== null) {
    s.oldestValidPendingDays = Math.floor((now.getTime() - oldestValidPendingAt) / DAY_MS);
  }

  return s;
}

/**
 * Approval counts as FACTS, never as a rate presented as judgement.
 *
 * `decided` is what an artist actually ruled on. `abandoned` is what aged out without a decision,
 * which is genuinely different from a rejection and must not be folded into one. No percentage is
 * computed here on purpose: CRWN's whole dataset is single digits, and a "17% approval rate" from
 * six rows is a number that reads as insight and carries none.
 */
export interface ApprovalFacts {
  awaiting: number;
  approved: number;
  rejected: number;
  abandoned: number;
  decided: number;
  /** True only when there is enough to say anything at all beyond the raw counts. */
  sampleTooSmallForRates: boolean;
}

export const RATE_SAMPLE_FLOOR = 20;

export function approvalFacts(s: ActionSummary): ApprovalFacts {
  const decided = s.approved + s.rejected;
  return {
    awaiting: s.validPending,
    approved: s.approved,
    rejected: s.rejected,
    abandoned: s.expiredPending,
    decided,
    sampleTooSmallForRates: decided < RATE_SAMPLE_FLOOR,
  };
}

/** The most recent moment Manager produced anything an artist could see. Null when never. */
export function lastMeaningfulActivity(
  timestamps: (string | null | undefined)[],
): string | null {
  let best: string | null = null;
  for (const t of timestamps) {
    if (!t) continue;
    if (!Number.isFinite(new Date(t).getTime())) continue;
    if (best === null || t > best) best = t;
  }
  return best;
}
