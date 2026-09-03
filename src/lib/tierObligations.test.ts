import { describe, it, expect } from 'vitest';
import { syncTierObligations } from './tierObligations';

// A benefit is OFFERED when selected and SCHEDULED only when the artist chose a cadence.
// These tests drive syncTierObligations against an in-memory Supabase double that records
// every write, so the rule "selecting a benefit alone creates no obligation" is proven at
// the write boundary, not inferred from the pure planner.

type Row = Record<string, unknown>;

function fakeClient(seed: { tiers: Row[]; obligations: Row[] }) {
  const tables: Record<string, Row[]> = {
    subscription_tiers: seed.tiers,
    fulfillment_obligations: seed.obligations.map((o) => ({ ...o })),
    fulfillment_events: [],
  };
  const writes: { table: string; op: string; payload: Row; where: Row }[] = [];
  let ids = 0;

  function query(table: string) {
    const where: Row = {};
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    const chain: Record<string, unknown> = {};
    const run = () => {
      const rows = tables[table] ?? [];
      const match = (r: Row) => Object.entries(where).every(([k, v]) => (v === '__notnull__' ? r[k] != null : r[k] === v));
      if (op === 'insert') {
        const row = { id: `id-${++ids}`, ...payload };
        rows.push(row);
        writes.push({ table, op, payload, where: {} });
        return { data: row, error: null };
      }
      if (op === 'update') {
        for (const r of rows.filter(match)) Object.assign(r, payload);
        writes.push({ table, op, payload, where: { ...where } });
        return { data: null, error: null };
      }
      return { data: rows.filter(match), error: null };
    };
    Object.assign(chain, {
      select: () => chain,
      eq: (k: string, v: unknown) => { where[k] = v; return chain; },
      not: (k: string) => { where[k] = '__notnull__'; return chain; },
      insert: (p: Row) => { op = 'insert'; payload = p; return chain; },
      update: (p: Row) => { op = 'update'; payload = p; return chain; },
      single: () => Promise.resolve(run()),
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject),
    });
    return chain;
  }

  return { client: { from: query } as never, tables, writes };
}

const ARTIST = 'artist-1';
const TIERS = [
  { id: 'bronze', price: 0, is_active: true },
  { id: 'silver', price: 1000, is_active: true },
  { id: 'gold', price: 2500, is_active: true },
];

describe('syncTierObligations: no fixed schedule unless chosen', () => {
  it('selecting behind-the-scenes with no frequency creates NO obligation', async () => {
    const f = fakeClient({ tiers: TIERS, obligations: [] });
    const out = await syncTierObligations(f.client, {
      tierId: 'silver',
      artistId: ARTIST,
      benefits: [{ benefit_type: 'exclusive_posts', config: {} }],
    });
    expect(out).toEqual({ created: 0, archived: 0, merged: 0 });
    expect(f.tables.fulfillment_obligations).toHaveLength(0);
    expect(f.tables.fulfillment_events).toHaveLength(0);
  });

  it('an empty frequency string is No fixed schedule, not monthly', async () => {
    const f = fakeClient({ tiers: TIERS, obligations: [] });
    await syncTierObligations(f.client, {
      tierId: 'silver',
      artistId: ARTIST,
      benefits: [
        { benefit_type: 'exclusive_posts', config: { frequency: '' } },
        { benefit_type: 'group_live_qa', config: { frequency: '' } },
        { benefit_type: 'creative_voting', config: null },
      ],
    });
    expect(f.tables.fulfillment_obligations).toHaveLength(0);
  });

  it('an explicit cadence still creates the canonical obligation and its first event', async () => {
    const f = fakeClient({ tiers: TIERS, obligations: [] });
    const out = await syncTierObligations(f.client, {
      tierId: 'silver',
      artistId: ARTIST,
      benefits: [{ benefit_type: 'exclusive_posts', config: { frequency: 'weekly' } }],
    });
    expect(out.created).toBe(1);
    const [o] = f.tables.fulfillment_obligations;
    expect(o.recurrence).toBe('weekly');
    expect(o.benefit_type).toBe('exclusive_posts');
    expect(o.source_tier_id).toBe('silver');
    expect(o.audience_id).toBe('silver');
    expect(f.tables.fulfillment_events).toHaveLength(1);
  });

  it('a benefit present without a frequency leaves its legacy obligation untouched', async () => {
    const legacy = {
      id: 'ob-legacy',
      artist_id: ARTIST,
      source_type: 'tier',
      source_tier_id: 'silver',
      benefit_type: 'exclusive_posts',
      status: 'active',
      title: 'Supporter-only post',
      recurrence: 'monthly',
      metadata: { source: 'tier_benefit_sync' },
    };
    const f = fakeClient({ tiers: TIERS, obligations: [legacy] });
    const out = await syncTierObligations(f.client, {
      tierId: 'silver',
      artistId: ARTIST,
      benefits: [{ benefit_type: 'exclusive_posts', config: {} }],
    });
    expect(out).toEqual({ created: 0, archived: 0, merged: 0 });
    expect(f.tables.fulfillment_obligations[0].status).toBe('active');
    expect(f.tables.fulfillment_obligations[0].recurrence).toBe('monthly');
    expect(f.writes.filter((w) => w.table === 'fulfillment_obligations')).toHaveLength(0);
  });

  it('removing the benefit still archives its obligation', async () => {
    const legacy = {
      id: 'ob-legacy',
      artist_id: ARTIST,
      source_type: 'tier',
      source_tier_id: 'silver',
      benefit_type: 'exclusive_posts',
      status: 'active',
      title: 'Supporter-only post',
      recurrence: 'monthly',
      metadata: { source: 'tier_benefit_sync' },
    };
    const f = fakeClient({ tiers: TIERS, obligations: [legacy] });
    const out = await syncTierObligations(f.client, { tierId: 'silver', artistId: ARTIST, benefits: [] });
    expect(out.archived).toBe(1);
    expect(f.tables.fulfillment_obligations[0].status).toBe('archived');
  });

  it('non-schedulable supported benefits never touch the calendar', async () => {
    const f = fakeClient({ tiers: TIERS, obligations: [] });
    await syncTierObligations(f.client, {
      tierId: 'gold',
      artistId: ARTIST,
      benefits: [
        { benefit_type: 'exclusive_tracks', config: {} },
        { benefit_type: 'stems', config: {} },
        { benefit_type: 'vault_collection', config: {} },
        { benefit_type: 'fan_submissions', config: {} },
        { benefit_type: 'member_recognition', config: {} },
        // A frequency on a non-schedulable key is ignored: it is not in PROMISE_BENEFITS.
        { benefit_type: 'stems', config: { frequency: 'monthly' } },
      ],
    });
    expect(f.tables.fulfillment_obligations).toHaveLength(0);
    expect(f.writes).toHaveLength(0);
  });
});
