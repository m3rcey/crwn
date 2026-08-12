import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MANAGER_ACTION_TTL_MS,
  staleBefore,
  checkActionAge,
  validateManagerActionForExecution,
} from './actionValidity';

// Stale Manager action safety.
//
// The defect: `artist_agent_actions` had no expiry. `/api/ai-manager/execute` matched on
// `status = 'pending'` and nothing else, so three actions generated 2026-04-03 (one of them a
// risk=high `adjust_tier_price`) were still executable 130 days later against numbers they had
// never seen. Approval was treated as perpetual authorization.

const DAY = 86400000;
const NOW = new Date('2026-08-11T12:00:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'));
const EXECUTE_SRC = read('src/app/api/ai-manager/execute/route.ts');
const CARD_SRC = read('src/components/artist/AiManagerCard.tsx');
const CRON_SRC = read('src/app/api/cron/ai-manager/route.ts');
const HEALTH_SRC = read('src/app/api/cron/agent-health/route.ts');

/** Minimal stub of the two supabase-js chains this module uses. */
function stubDb(tables: Record<string, unknown | null>) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ['select', 'eq', 'limit']) chain[m] = self;
      chain.maybeSingle = async () => ({ data: tables[table] ?? null });
      return chain;
    },
  } as never;
}

describe('the TTL is inherited, not invented', () => {
  it('matches the ai_insights expiry window already shipped for Manager output', () => {
    expect(MANAGER_ACTION_TTL_MS).toBe(14 * DAY);
    // Same constant the Manager routes use for `ai_insights.expires_at`. If that policy ever
    // changes, this test is where the two are meant to be reconciled deliberately.
    expect(CRON_SRC).toContain('14 * 24 * 60 * 60 * 1000');
  });

  it('is NOT the 7-day dedup window, which is a different concept', () => {
    expect(MANAGER_ACTION_TTL_MS).not.toBe(7 * DAY);
  });
});

describe('age check (pure)', () => {
  it('allows a fresh action', () => {
    expect(checkActionAge(ago(1), NOW).valid).toBe(true);
    expect(checkActionAge(ago(13.9), NOW).valid).toBe(true);
  });

  it('refuses an action past the window', () => {
    const r = checkActionAge(ago(15), NOW);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('expired');
  });

  it('refuses the real production case: 130 days old', () => {
    const r = checkActionAge('2026-04-03T00:00:00.000Z', NOW);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('expired');
  });

  it('treats a missing timestamp as fresh (the autonomous path never stores one)', () => {
    expect(checkActionAge(undefined, NOW).valid).toBe(true);
    expect(checkActionAge(null, NOW).valid).toBe(true);
  });

  it('fails CLOSED on an undatable timestamp', () => {
    const r = checkActionAge('not-a-date', NOW);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('expired');
  });

  it('staleBefore is the same boundary the age check uses', () => {
    const cutoff = new Date(staleBefore(NOW)).getTime();
    expect(NOW.getTime() - cutoff).toBe(MANAGER_ACTION_TTL_MS);
  });
});

describe('target-state validation', () => {
  const fresh = ago(1);

  it('a stale HIGH-RISK price change is refused on age before anything else is read', async () => {
    // Empty db: if age were checked second, this would read as target_missing instead.
    const r = await validateManagerActionForExecution(stubDb({}), 'artist-1', {
      action_type: 'adjust_tier_price',
      action_params: { tier_id: 't1', new_price_cents: 2500 },
      created_at: ago(130),
    }, NOW);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('expired');
  });

  it('refuses a price change whose tier no longer exists', async () => {
    const r = await validateManagerActionForExecution(stubDb({ subscription_tiers: null }), 'artist-1', {
      action_type: 'adjust_tier_price',
      action_params: { tier_id: 't1', new_price_cents: 2500 },
      created_at: fresh,
    }, NOW);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('target_missing');
  });

  it('refuses a price change that is already applied, rather than rewriting the same value', async () => {
    const r = await validateManagerActionForExecution(
      stubDb({ subscription_tiers: { id: 't1', price: 2500 } }), 'artist-1',
      { action_type: 'adjust_tier_price', action_params: { tier_id: 't1', new_price_cents: 2500 }, created_at: fresh },
      NOW,
    );
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('already_satisfied');
  });

  it('allows a fresh price change against a tier at a different price', async () => {
    const r = await validateManagerActionForExecution(
      stubDb({ subscription_tiers: { id: 't1', price: 1000 } }), 'artist-1',
      { action_type: 'adjust_tier_price', action_params: { tier_id: 't1', new_price_cents: 2500 }, created_at: fresh },
      NOW,
    );
    expect(r.valid).toBe(true);
  });

  it('refuses a sequence toggle that is already in the desired state', async () => {
    const r = await validateManagerActionForExecution(
      stubDb({ sequences: { id: 's1', is_active: true } }), 'artist-1',
      { action_type: 'toggle_sequence', action_params: { sequence_id: 's1', enable: true }, created_at: fresh },
      NOW,
    );
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('already_satisfied');
  });

  it('refuses a toggle whose sequence is gone', async () => {
    const r = await validateManagerActionForExecution(stubDb({ sequences: null }), 'artist-1', {
      action_type: 'toggle_sequence', action_params: { sequence_id: 's1', enable: true }, created_at: fresh,
    }, NOW);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('target_missing');
  });

  it('refuses gating a track that is already gated, and ungating one already free', async () => {
    const gated = await validateManagerActionForExecution(
      stubDb({ tracks: { id: 'tr1', is_free: false } }), 'artist-1',
      { action_type: 'gate_track', action_params: { track_id: 'tr1', tier_ids: ['x'] }, created_at: fresh }, NOW,
    );
    expect(gated.valid).toBe(false);
    if (!gated.valid) expect(gated.reason).toBe('already_satisfied');

    const free = await validateManagerActionForExecution(
      stubDb({ tracks: { id: 'tr1', is_free: true } }), 'artist-1',
      { action_type: 'ungate_track', action_params: { track_id: 'tr1' }, created_at: fresh }, NOW,
    );
    expect(free.valid).toBe(false);
    if (!free.valid) expect(free.reason).toBe('already_satisfied');
  });

  it('refuses re-engagement when no active sequence exists to enrol fans into', async () => {
    const r = await validateManagerActionForExecution(stubDb({ sequences: null }), 'artist-1', {
      action_type: 'send_reengagement', action_params: {}, created_at: fresh,
    }, NOW);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('target_missing');
  });

  it('allows fresh self-contained content actions, which name no external target', async () => {
    for (const t of ['create_discount_code', 'schedule_campaign', 'create_community_post']) {
      const r = await validateManagerActionForExecution(stubDb({}), 'artist-1', {
        action_type: t, action_params: { content: 'x' }, created_at: fresh,
      }, NOW);
      expect(r.valid, `${t} should pass on age alone`).toBe(true);
    }
  });

  it('still expires self-contained content actions', async () => {
    const r = await validateManagerActionForExecution(stubDb({}), 'artist-1', {
      action_type: 'schedule_campaign', action_params: {}, created_at: ago(130),
    }, NOW);
    expect(r.valid).toBe(false);
  });

  it('fails OPEN on a read error, leaving the handler existing checks to refuse', async () => {
    const throwingDb = { from() { throw new Error('db down'); } } as never;
    const r = await validateManagerActionForExecution(throwingDb, 'artist-1', {
      action_type: 'adjust_tier_price', action_params: { tier_id: 't1', new_price_cents: 1 }, created_at: fresh,
    }, NOW);
    expect(r.valid).toBe(true);
  });
});

describe('the guard sits at the execution boundary, not the UI', () => {
  it('execute validates BEFORE taking the coordination lock or running a handler', () => {
    // Match the CALL, not the identifier: `indexOf('validateManagerActionForExecution')` finds the
    // import statement at the top of the file, so it stays "before the lock" no matter where the
    // call actually sits. That version of this test passed with the guard moved after the lock.
    const validateAt = EXECUTE_SRC.indexOf('await validateManagerActionForExecution(');
    const lockAt = EXECUTE_SRC.indexOf('await acquireLock(');
    const handlerAt = EXECUTE_SRC.indexOf('await handler(');
    expect(validateAt, 'the validator must be CALLED, not merely imported').toBeGreaterThan(-1);
    expect(lockAt).toBeGreaterThan(-1);
    expect(handlerAt).toBeGreaterThan(-1);
    expect(validateAt, 'validation must precede the coordination lock').toBeLessThan(lockAt);
    expect(validateAt, 'validation must precede any mutation').toBeLessThan(handlerAt);
  });

  it('covers BOTH execution paths, because both funnel through executeAction', () => {
    // Autonomous and artist-approved both call executeAction; the guard is inside it, so the
    // dormant cron path inherits it if canonical-priority automation is ever enabled.
    expect(EXECUTE_SRC).toMatch(/executeAction\(artistId, action, 'autonomous'\)/);
    expect(EXECUTE_SRC).toMatch(/executeAction\(pendingAction\.artist_id, action, 'approved', actionId, pendingAction\.created_at\)/);
    expect((EXECUTE_SRC.match(/validateManagerActionForExecution\(/g) || []).length).toBe(1);
  });

  it('takes created_at from the stored row, never from the request body', () => {
    expect(EXECUTE_SRC).toContain('pendingAction.created_at');
    expect(EXECUTE_SRC).not.toMatch(/body\.created_at|body\.createdAt|body\.stillValid/);
  });

  it('records a structured reason and a terminal state rather than a generic failure', () => {
    expect(EXECUTE_SRC).toContain('not_executed:');
    expect(EXECUTE_SRC).toMatch(/reason: validity\.reason/);
  });

  it('preserves approval, ownership and the lock', () => {
    expect(EXECUTE_SRC).toContain('CRON_SECRET');
    expect(EXECUTE_SRC).toMatch(/eq\('user_id',\s*user\.id\)/);
    expect(EXECUTE_SRC).toContain('acquireLock');
    expect(EXECUTE_SRC).toContain('releaseLock');
    // Rejection still ends the action without executing it.
    expect(EXECUTE_SRC).toMatch(/status: 'rejected'/);
  });
});

describe('every surface uses the one cutoff', () => {
  it('the artist Manager page does not offer stale actions', () => {
    expect(CARD_SRC).toContain('staleBefore()');
    expect(CARD_SRC).toMatch(/eq\('status', 'pending'\)[\s\S]{0,120}gte\('created_at', cutoff\)/);
  });

  it('the teaser badge counts the same set the page offers', () => {
    // A badge saying "3 pending" over a page offering none is how a safety fix becomes a bug.
    expect((CARD_SRC.match(/staleBefore\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('the health cron does not alert on permanently expired rows', () => {
    expect(HEALTH_SRC).toContain('staleBefore()');
    expect(HEALTH_SRC).toContain('expiredPendingActions');
  });
});

describe('boundaries this task must not cross', () => {
  it('no schema: expiry is derived, no new status value is written', () => {
    const SCHEMA = readFileSync('supabase/schema-phase2-artist-agent.sql', 'utf8');
    expect(SCHEMA).not.toContain('expired');
    expect(EXECUTE_SRC).not.toMatch(/status: 'expired'/);
  });

  it('history is never deleted', () => {
    for (const [label, src] of [['execute', EXECUTE_SRC], ['card', CARD_SRC]] as const) {
      expect(src, `${label} must not delete action rows`).not.toMatch(
        /from\('artist_agent_actions'\)[\s\S]{0,80}\.delete\(/,
      );
    }
  });

  it('autonomous Manager remains dormant', () => {
    expect(CRON_SRC).toMatch(/from\('artist_profiles'\)[\s\S]{0,200}\.eq\('is_active',\s*true\)/);
  });

  it('no second constraint engine, no AI, no outcome score in the validator', () => {
    const SRC = read('src/lib/ai/actionValidity.ts');
    expect(SRC).not.toContain('readConstraint');
    expect(SRC).not.toContain('deepseek');
    expect(SRC).not.toContain('outcome_score');
    expect(SRC).not.toContain('recordIssuedRecommendation');
  });

  it('no pricing logic is decided here, only whether the stored action is still current', () => {
    const SRC = read('src/lib/ai/actionValidity.ts');
    // It may COMPARE the stored price to the current one; it may never compute a new one.
    expect(SRC).not.toMatch(/getArtistFeePercent|TIER_PRICING|application_fee/);
  });
});
