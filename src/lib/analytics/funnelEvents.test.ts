// Tests for the funnel recorder.
//
// The two things that must not silently break: the dedup key (the whole "no duplicate events"
// guarantee) and the stage guard (a typo'd stage must be dropped, not written as garbage). Plus
// the fail-safe contract: the recorder never throws, so analytics can never break the funnel.

import { describe, expect, it, vi } from 'vitest';

import {
  FUNNEL_STAGES,
  isFunnelStage,
  LM_EVENT_TO_STAGE,
  buildFunnelRow,
  recordFunnelEvent,
} from './funnelEvents';

describe('the stage taxonomy is exactly the twenty funnel stages', () => {
  it('has 20 stages including the endpoints', () => {
    expect(FUNNEL_STAGES).toHaveLength(20);
    expect(FUNNEL_STAGES[0]).toBe('page_viewed');
    expect(FUNNEL_STAGES[FUNNEL_STAGES.length - 1]).toBe('first_paid_conversion');
  });

  it('isFunnelStage accepts the canonical stages and rejects anything else', () => {
    expect(isFunnelStage('setup_completed')).toBe(true);
    expect(isFunnelStage('builder_published')).toBe(true);
    // The journey extension: through Stripe, launch, import, invite and first money.
    expect(isFunnelStage('call_requested')).toBe(true);
    expect(isFunnelStage('stripe_connected')).toBe(true);
    expect(isFunnelStage('fans_imported')).toBe(true);
    expect(isFunnelStage('fan_invited')).toBe(true);
    expect(isFunnelStage('first_paid_conversion')).toBe(true);
    expect(isFunnelStage('nonsense')).toBe(false);
    expect(isFunnelStage(undefined)).toBe(false);
    expect(isFunnelStage(42)).toBe(false);
  });

  it('maps the client lead-magnet beacon events to stages', () => {
    expect(LM_EVENT_TO_STAGE.lead_magnet_viewed).toBe('page_viewed');
    expect(LM_EVENT_TO_STAGE.lead_magnet_started).toBe('calculator_started');
    expect(LM_EVENT_TO_STAGE.lead_magnet_result_generated).toBe('calculator_completed');
    expect(LM_EVENT_TO_STAGE.lead_magnet_result_unlocked).toBe('result_revealed');
    expect(LM_EVENT_TO_STAGE.lead_magnet_signup_clicked).toBe('signup_clicked');
    // A non-funnel beacon event is not mapped (stays out of the funnel table).
    expect(LM_EVENT_TO_STAGE.lead_magnet_step_completed).toBeUndefined();
  });
});

describe('buildFunnelRow: dedup key and dimensions', () => {
  it('namespaces a provided dedupe key by stage (so setup_completed:<id> cannot collide with builder_opened:<id>)', () => {
    const row = buildFunnelRow({ stage: 'setup_completed', dedupeKey: 'artist-1' });
    expect(row?.dedupe_key).toBe('setup_completed:artist-1');
  });

  it('generates a UNIQUE key when none is given, so an inherently repeatable stage never collapses', () => {
    const a = buildFunnelRow({ stage: 'page_viewed' });
    const b = buildFunnelRow({ stage: 'page_viewed' });
    expect(a?.dedupe_key).not.toEqual(b?.dedupe_key);
    expect(String(a?.dedupe_key).length).toBeGreaterThan(10);
  });

  it('carries the five dimensions and clips overlong text', () => {
    const row = buildFunnelRow({
      stage: 'account_created',
      calculator: 'worth',
      campaign: 'summer',
      referrer: 'instagram',
      artistId: 'a1',
      userId: 'u1',
      resultId: 'r1',
    });
    expect(row).toMatchObject({
      stage: 'account_created',
      calculator: 'worth',
      campaign: 'summer',
      referrer: 'instagram',
      artist_id: 'a1',
      user_id: 'u1',
      result_id: 'r1',
    });
    const long = buildFunnelRow({ stage: 'page_viewed', referrer: 'x'.repeat(500) });
    expect(String(long?.referrer).length).toBe(200);
  });

  it('returns null for an unknown stage (never written)', () => {
    expect(buildFunnelRow({ stage: 'not_a_stage' })).toBeNull();
  });
});

describe('recordFunnelEvent: dedup at the DB, and fail-safe', () => {
  function fakeDb() {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    return { calls: upsert, db: { from: () => ({ upsert }) } };
  }

  it('upserts with ON CONFLICT (dedupe_key) DO NOTHING', async () => {
    const { calls, db } = fakeDb();
    await recordFunnelEvent(db, { stage: 'setup_completed', dedupeKey: 'a1' });
    expect(calls).toHaveBeenCalledTimes(1);
    const [row, opts] = calls.mock.calls[0];
    expect(row.dedupe_key).toBe('setup_completed:a1');
    expect(opts).toEqual({ onConflict: 'dedupe_key', ignoreDuplicates: true });
  });

  it('never writes an unknown stage', async () => {
    const { calls, db } = fakeDb();
    await recordFunnelEvent(db, { stage: 'bogus' });
    expect(calls).not.toHaveBeenCalled();
  });

  // Founder exclusion: an event attributed to an admin user id is never written. The device
  // cookie covers browser paths; this chokepoint covers webhooks and other server call sites.
  function roleDb(roleAnswer: () => Promise<{ data: { role: string } | null }>) {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const db = {
      from: (t: string) =>
        t === 'profiles'
          ? { select: () => ({ eq: () => ({ maybeSingle: roleAnswer }) }) }
          : { upsert },
    };
    return { upsert, db };
  }

  it('skips an event whose userId resolves to an admin profile', async () => {
    const { upsert, db } = roleDb(async () => ({ data: { role: 'admin' } }));
    await recordFunnelEvent(db, { stage: 'setup_completed', userId: 'josh', dedupeKey: 'x' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('records an event for a non-admin user', async () => {
    const { upsert, db } = roleDb(async () => ({ data: { role: 'artist' } }));
    await recordFunnelEvent(db, { stage: 'setup_completed', userId: 'artist-1', dedupeKey: 'x' });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('fails OPEN when the role read blows up (a real event is never dropped)', async () => {
    const { upsert, db } = roleDb(async () => {
      throw new Error('profiles unreachable');
    });
    await recordFunnelEvent(db, { stage: 'setup_completed', userId: 'artist-1', dedupeKey: 'x' });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('never throws, even if the DB blows up (pre-migration or otherwise)', async () => {
    const db = {
      from: () => ({
        upsert: () => {
          throw new Error('relation "funnel_events" does not exist');
        },
      }),
    };
    await expect(recordFunnelEvent(db, { stage: 'page_viewed' })).resolves.toBeUndefined();
  });
});
