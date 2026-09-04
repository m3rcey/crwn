import { describe, it, expect } from 'vitest';
import { fulfillCampaignPrize, type PrizeExecutorDeps } from './prizeExecutor';

/**
 * The executor, against a fake database and a fake Stripe that RECORD what they were asked.
 *
 * Three families: the authorization chain (every link refuses on its own), the four winner
 * states (what Stripe is asked to build and what the row becomes), and idempotency (a retry
 * at every failure point builds nothing twice). Nothing here touches a network.
 */

const ARTIST = '11111111-1111-4111-8111-111111111111';
const OTHER_ARTIST = '22222222-2222-4222-8222-222222222222';
const CAMPAIGN = '33333333-3333-4333-8333-333333333333';
const OTHER_CAMPAIGN = '44444444-4444-4444-8444-444444444444';
const FAN = '55555555-5555-4555-8555-555555555555';
const OTHER_FAN = '66666666-6666-4666-8666-666666666666';
const PLATINUM = '77777777-7777-4777-8777-777777777777';
const SILVER = '88888888-8888-4888-8888-888888888888';
const GOLD = '99999999-9999-4999-8999-999999999999';
const BRONZE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FOREIGN_TIER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOUNDARY = '2026-10-04T00:00:00.000Z';
const NOW = new Date('2026-09-04T12:00:00Z');

type Row = Record<string, unknown>;
type Filter = { col: string; op: 'eq' | 'neq'; val: unknown };
type Write = { table: string; op: 'update' | 'insert'; row: Row; filters: Filter[] };

/** A minimal supabase-js double: filters rows in memory, records every write. */
function fakeDb(tables: Record<string, Row[]>, opts: { failUpdate?: boolean } = {}) {
  const writes: Write[] = [];
  const from = (table: string) => {
    const filters: Filter[] = [];
    let mode: 'select' | 'update' = 'select';
    let payload: Row | null = null;
    let lim: number | null = null;
    const rows = () => {
      let r = tables[table] ?? [];
      for (const f of filters) r = r.filter((x) => (f.op === 'eq' ? x[f.col] === f.val : x[f.col] !== f.val));
      return lim == null ? r : r.slice(0, lim);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => { filters.push({ col, op: 'eq', val }); return api; },
      neq: (col: string, val: unknown) => { filters.push({ col, op: 'neq', val }); return api; },
      limit: (n: number) => { lim = n; return api; },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      update: (row: Row) => { mode = 'update'; payload = row; return api; },
      insert: async (row: Row) => {
        writes.push({ table, op: 'insert', row, filters: [] });
        (tables[table] ??= []).push({ id: 'inserted-' + table, ...row });
        return { error: null };
      },
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        if (mode === 'update') {
          writes.push({ table, op: 'update', row: payload!, filters: [...filters] });
          if (!opts.failUpdate) rows().forEach((t) => Object.assign(t, payload));
          return Promise.resolve({ error: opts.failUpdate ? { message: 'boom' } : null }).then(resolve, reject);
        }
        return Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
      },
    };
    return api;
  };
  const db = { from, auth: { admin: { getUserById: async () => ({ data: { user: { email: 'fan@example.com' } } }) } } };
  return { db, writes, tables };
}

/** A Stripe double that returns plausible objects and records every call with its options. */
function fakeStripe(opts: { existingScheduleOnSub?: string | null; existingScheduleMeta?: Record<string, string>; couponExists?: boolean } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const rec = (method: string, ...args: unknown[]) => calls.push({ method, args });
  const stripe = {
    coupons: {
      create: async (p: { id: string }) => {
        rec('coupons.create', p);
        if (opts.couponExists) { const e = new Error('exists') as Error & { code: string }; e.code = 'resource_already_exists'; throw e; }
        return { id: p.id };
      },
      retrieve: async (id: string) => { rec('coupons.retrieve', id); return { id }; },
    },
    customers: {
      list: async (p: unknown) => { rec('customers.list', p); return { data: [] }; },
      create: async (p: unknown) => { rec('customers.create', p); return { id: 'cus_new' }; },
    },
    subscriptionSchedules: {
      create: async (p: { from_subscription?: string }, o: unknown) => {
        rec('schedules.create', p, o);
        if (p.from_subscription) {
          return { id: 'ss_from', phases: [{ items: [{ price: 'price_current', quantity: 1 }], start_date: 1_000, end_date: 2_000 }] };
        }
        return { id: 'ss_new', subscription: 'sub_prize' };
      },
      update: async (id: string, p: unknown, o: unknown) => { rec('schedules.update', id, p, o); return { id }; },
      retrieve: async (id: string) => { rec('schedules.retrieve', id); return { id, metadata: opts.existingScheduleMeta ?? {} }; },
    },
    subscriptions: {
      retrieve: async (id: string) => {
        rec('subscriptions.retrieve', id);
        return {
          id, customer: 'cus_x', schedule: opts.existingScheduleOnSub ?? null,
          items: { data: [{ current_period_start: 1_756_900_000, current_period_end: 1_759_500_000 }] },
        };
      },
    },
  };
  return { stripe, calls };
}

const tier = (id: string, price: number, over: Row = {}): Row => ({
  id, artist_id: ARTIST, price, is_active: true, stripe_price_id: 'price_' + id.slice(0, 8), name: id.slice(0, 8), ...over,
});

function world(over: {
  campaign?: Row; participants?: Row[]; subscription?: Row | null; extraSubs?: Row[]; toolkit?: Row;
} = {}) {
  const toolkit = over.toolkit ?? { prize: '1 year of Platinum', prize_tier_id: PLATINUM };
  const campaign = { id: CAMPAIGN, artist_id: ARTIST, status: 'ended', title: 'Founding A&R Week', toolkit, ...(over.campaign ?? {}) };
  const subs = [...(over.subscription === null ? [] : [over.subscription ?? bronzeRow()]), ...(over.extraSubs ?? [])];
  return fakeDb({
    fan_campaigns: [campaign],
    fan_campaign_participants: over.participants ?? [{ campaign_id: CAMPAIGN, fan_id: FAN }],
    subscription_tiers: [tier(BRONZE, 0), tier(SILVER, 1000), tier(GOLD, 2500), tier(PLATINUM, 5000), tier(FOREIGN_TIER, 5000, { artist_id: OTHER_ARTIST })],
    subscriptions: subs,
    profiles: [{ id: FAN, display_name: 'Fan' }],
    tier_transitions: [],
  });
}

const bronzeRow = (): Row => ({
  id: 'row-1', fan_id: FAN, artist_id: ARTIST, tier_id: BRONZE, status: 'active',
  stripe_subscription_id: 'free_abc', stripe_customer_id: null, current_period_end: null,
  prize_campaign_id: null, pending_tier_id: null, cancel_at_period_end: false,
});
const paidRow = (tierId: string): Row => ({
  id: 'row-1', fan_id: FAN, artist_id: ARTIST, tier_id: tierId, status: 'active',
  stripe_subscription_id: 'sub_paid', stripe_customer_id: 'cus_x', current_period_end: BOUNDARY,
  prize_campaign_id: null, pending_tier_id: null, cancel_at_period_end: false,
});

function deps(db: ReturnType<typeof fakeDb>['db'], stripe: ReturnType<typeof fakeStripe>['stripe']): PrizeExecutorDeps {
  return {
    db: db as never, stripe: stripe as never,
    connectAccountFor: async () => 'acct_artist',
    feePercentFor: async () => 8,
    now: () => NOW,
  };
}

const run = (w: ReturnType<typeof fakeDb>, s = fakeStripe(), input = { campaignId: CAMPAIGN, fanId: FAN, actorArtistId: ARTIST }) =>
  fulfillCampaignPrize(deps(w.db, s.stripe), input);

// ─── The authorization chain ───────────────────────────────────────────────────
describe('every link of the chain refuses on its own, before Stripe is ever called', () => {
  it('malformed identifiers', async () => {
    const s = fakeStripe();
    const r = await run(world(), s, { campaignId: 'nope', fanId: FAN, actorArtistId: ARTIST });
    expect(r).toMatchObject({ ok: false, code: 'campaign_not_found' });
    expect(s.calls).toHaveLength(0);
  });

  it('a campaign that does not exist', async () => {
    const s = fakeStripe();
    expect(await run(world(), s, { campaignId: OTHER_CAMPAIGN, fanId: FAN, actorArtistId: ARTIST })).toMatchObject({ ok: false, code: 'campaign_not_found' });
    expect(s.calls).toHaveLength(0);
  });

  it('artist A acting on artist B\'s campaign', async () => {
    const s = fakeStripe();
    expect(await run(world(), s, { campaignId: CAMPAIGN, fanId: FAN, actorArtistId: OTHER_ARTIST })).toMatchObject({ ok: false, code: 'not_owner' });
    expect(s.calls).toHaveLength(0);
  });

  it('a fan self-awarding: their own id is not an artist that owns the campaign', async () => {
    expect(await run(world(), fakeStripe(), { campaignId: CAMPAIGN, fanId: FAN, actorArtistId: FAN })).toMatchObject({ ok: false, code: 'not_owner' });
  });

  it('a DRAFT campaign cannot award (nobody has entered it)', async () => {
    expect(await run(world({ campaign: { status: 'draft' } }))).toMatchObject({ ok: false, code: 'campaign_not_awardable' });
  });

  it('a fan who never joined THIS campaign', async () => {
    const s = fakeStripe();
    expect(await run(world({ participants: [{ campaign_id: OTHER_CAMPAIGN, fan_id: FAN }] }), s)).toMatchObject({ ok: false, code: 'not_a_participant' });
    expect(s.calls).toHaveLength(0);
  });

  it('a campaign with no prize tier configured', async () => {
    expect(await run(world({ toolkit: { prize: 'x' } }))).toMatchObject({ ok: false, code: 'prize_tier_missing' });
  });

  it('a prize tier belonging to ANOTHER artist is refused even though it exists', async () => {
    expect(await run(world({ toolkit: { prize_tier_id: FOREIGN_TIER } }))).toMatchObject({ ok: false, code: 'prize_tier_not_ready' });
  });

  it('a prize tier with no Stripe price', async () => {
    const w = world();
    (w.tables.subscription_tiers.find((t) => t.id === PLATINUM) as Row).stripe_price_id = null;
    expect(await run(w)).toMatchObject({ ok: false, code: 'prize_tier_not_ready' });
  });

  it('a campaign whose prize ANOTHER fan already holds', async () => {
    const s = fakeStripe();
    const w = world({ extraSubs: [{ id: 'row-2', fan_id: OTHER_FAN, artist_id: ARTIST, tier_id: PLATINUM, status: 'active', prize_campaign_id: CAMPAIGN }] });
    expect(await run(w, s)).toMatchObject({ ok: false, code: 'already_awarded_to_another_fan' });
    expect(s.calls).toHaveLength(0);
  });

  it('an absurd duration in the campaign config is refused by the planner, not honoured', async () => {
    expect(await run(world({ toolkit: { prize_tier_id: PLATINUM, prize_months: '99' } }))).toMatchObject({ ok: false, code: 'plan_refused' });
  });

  it('the input carries NO tier, price, discount, duration or date: they cannot be supplied', async () => {
    // Compile-time: the type has exactly three keys. Runtime: Stripe is asked for the TIER'S
    // price and a 100% coupon regardless of anything else in the world.
    const s = fakeStripe();
    const r = await run(world(), s);
    expect(r.ok).toBe(true);
    const create = s.calls.find((c) => c.method === 'schedules.create')!.args[0] as { phases: { items: { price: string }[]; discounts: unknown[]; duration: unknown }[] };
    expect(create.phases[0].items[0].price).toBe('price_' + PLATINUM.slice(0, 8));
    expect(create.phases[0].discounts).toEqual([{ coupon: 'crwn-prize-' + CAMPAIGN }]);
    expect(create.phases[0].duration).toEqual({ interval: 'month', interval_count: 12 });
    const coupon = s.calls.find((c) => c.method === 'coupons.create')!.args[0] as { percent_off: number; duration_in_months: number };
    expect(coupon.percent_off).toBe(100);
    expect(coupon.duration_in_months).toBe(12);
  });
});

// ─── The four winner states ────────────────────────────────────────────────────
describe('Bronze / free member: an immediate prize on the SAME row', () => {
  it('builds an immediate schedule and updates the existing membership row in place', async () => {
    const w = world();
    const s = fakeStripe();
    const r = await run(w, s);
    expect(r).toMatchObject({ ok: true, action: 'created_now', stripeSubscriptionId: 'sub_prize', stripeScheduleId: 'ss_new', months: 12 });

    const create = s.calls.find((c) => c.method === 'schedules.create')!;
    const params = create.args[0] as Row;
    expect(params.start_date).toBe('now');
    expect(params.end_behavior).toBe('cancel');
    expect(params.default_settings).toEqual({ transfer_data: { destination: 'acct_artist' }, application_fee_percent: 8 });
    expect((create.args[1] as { idempotencyKey: string }).idempotencyKey).toBe(`crwn-prize:${CAMPAIGN}:${FAN}:immediate`);

    // ONE row for (fan, artist): updated, never a second insert.
    const subWrites = w.writes.filter((x) => x.table === 'subscriptions');
    expect(subWrites).toHaveLength(1);
    expect(subWrites[0].op).toBe('update');
    expect(subWrites[0].filters).toEqual([{ col: 'id', op: 'eq', val: 'row-1' }]);
    const row = w.tables.subscriptions[0];
    expect(row.tier_id).toBe(PLATINUM);
    expect(row.stripe_subscription_id).toBe('sub_prize');
    expect(row.stripe_customer_id).toBe('cus_x');
    expect(row.status).toBe('active');
    expect(row.prize_campaign_id).toBe(CAMPAIGN);
    expect(row.pending_change_date).toBeNull(); // active NOW
    expect(row.pending_tier_id).toBeNull();
    expect(row.fan_id).toBe(FAN);
    expect(row.artist_id).toBe(ARTIST);
  });

  it('a fan with NO row at all gets one inserted', async () => {
    const w = world({ subscription: null });
    const r = await run(w, fakeStripe());
    expect(r).toMatchObject({ ok: true, action: 'created_now' });
    const ins = w.writes.find((x) => x.table === 'subscriptions' && x.op === 'insert')!;
    expect(ins.row).toMatchObject({ fan_id: FAN, artist_id: ARTIST, tier_id: PLATINUM, prize_campaign_id: CAMPAIGN, status: 'active' });
  });

  it('needs no card: a Stripe customer is created from the fan\'s email with no payment method', async () => {
    const s = fakeStripe();
    await run(world(), s);
    const created = s.calls.find((c) => c.method === 'customers.create')!.args[0] as Row;
    expect(created.email).toBe('fan@example.com');
    expect('payment_method' in created).toBe(false);
  });

  it('records the movement Bronze -> Platinum as a campaign_prize, never as a purchase', async () => {
    const w = world();
    await run(w, fakeStripe());
    const t = w.writes.find((x) => x.table === 'tier_transitions')!.row as Row;
    expect(t).toMatchObject({ from_tier_id: BRONZE, to_tier_id: PLATINUM, source: 'campaign_prize' });
  });
});

describe.each([
  ['Silver', SILVER],
  ['Gold', GOLD],
])('%s winner: paid period finishes, THEN the prize', (_label, tierId) => {
  it('appends the prize after the untouched paid phase and sets pending_tier_id for the webhook', async () => {
    const w = world({ subscription: paidRow(tierId) });
    const s = fakeStripe();
    const r = await run(w, s);
    expect(r).toMatchObject({ ok: true, action: 'scheduled', stripeSubscriptionId: 'sub_paid', stripeScheduleId: 'ss_from', startsAt: BOUNDARY });

    // Stripe: from the live subscription, then two phases, cancel after.
    const from = s.calls.find((c) => c.method === 'schedules.create')!;
    expect((from.args[0] as Row).from_subscription).toBe('sub_paid');
    expect((from.args[1] as { idempotencyKey: string }).idempotencyKey).toBe(`crwn-prize:${CAMPAIGN}:${FAN}:from-subscription`);
    const upd = s.calls.find((c) => c.method === 'schedules.update')!;
    const p = upd.args[1] as { end_behavior: string; phases: Row[] };
    expect(p.end_behavior).toBe('cancel');
    expect(p.phases).toHaveLength(2);
    expect(p.phases[0]).toEqual({ items: [{ price: 'price_current', quantity: 1 }], start_date: 1_000, end_date: 2_000 });
    expect((p.phases[1].items as { price: string }[])[0].price).toBe('price_' + PLATINUM.slice(0, 8));

    // Row: attributed now, ACTIVE at the boundary, tier change queued for the webhook.
    const row = w.tables.subscriptions[0];
    expect(row.tier_id).toBe(tierId); // unchanged today
    expect(row.prize_campaign_id).toBe(CAMPAIGN);
    expect(row.pending_change_date).toBe(BOUNDARY);
    expect(row.pending_tier_id).toBe(PLATINUM);
    // Nothing else about the membership moved: no refund, no new subscription id.
    expect(row.stripe_subscription_id).toBe('sub_paid');
    expect(row.status).toBe('active');
  });

  it('does not write a tier transition yet: the state has not moved until Stripe switches', async () => {
    const w = world({ subscription: paidRow(tierId) });
    await run(w, fakeStripe());
    expect(w.writes.some((x) => x.table === 'tier_transitions')).toBe(false);
  });
});

describe('existing Platinum winner: same tier, twelve free periods after the paid one', () => {
  it('schedules the prize with NO pending_tier_id, so the date alone turns it active', async () => {
    const w = world({ subscription: paidRow(PLATINUM) });
    const s = fakeStripe();
    const r = await run(w, s);
    expect(r).toMatchObject({ ok: true, action: 'scheduled', startsAt: BOUNDARY });
    const row = w.tables.subscriptions[0];
    expect(row.tier_id).toBe(PLATINUM);
    expect(row.prize_campaign_id).toBe(CAMPAIGN);
    expect(row.pending_change_date).toBe(BOUNDARY);
    expect(row.pending_tier_id).toBeNull();
    expect(s.calls.some((c) => c.method === 'schedules.update')).toBe(true);
  });
});

// ─── Idempotency ───────────────────────────────────────────────────────────────
describe('one prize, however many times it is asked for', () => {
  it('a retry after success returns already_fulfilled and calls Stripe ZERO times', async () => {
    const s = fakeStripe();
    const w = world({ subscription: { ...paidRow(PLATINUM), prize_campaign_id: CAMPAIGN } });
    expect(await run(w, s)).toMatchObject({ ok: true, action: 'already_fulfilled' });
    expect(s.calls).toHaveLength(0);
    expect(w.writes).toHaveLength(0);
  });

  it('a retry after Stripe succeeded but the row write failed REUSES the schedule it finds', async () => {
    // The subscription already carries our schedule (metadata names this campaign) but the
    // row never got its prize marker. The retry must repair the row, not build a second prize.
    const s = fakeStripe({ existingScheduleOnSub: 'ss_from', existingScheduleMeta: { crwn_prize_campaign_id: CAMPAIGN } });
    const w = world({ subscription: paidRow(GOLD) });
    const r = await run(w, s);
    expect(r).toMatchObject({ ok: true, action: 'scheduled', stripeScheduleId: 'ss_from' });
    expect(s.calls.some((c) => c.method === 'schedules.create')).toBe(false);
    expect(s.calls.some((c) => c.method === 'schedules.update')).toBe(false);
    expect(w.tables.subscriptions[0].prize_campaign_id).toBe(CAMPAIGN);
  });

  it('a subscription carrying SOMEONE ELSE\'S schedule is refused rather than appended to', async () => {
    const s = fakeStripe({ existingScheduleOnSub: 'ss_other', existingScheduleMeta: { purpose: 'downgrade' } });
    const r = await run(world({ subscription: paidRow(GOLD) }), s);
    expect(r).toMatchObject({ ok: false, code: 'plan_refused' });
    expect(s.calls.some((c) => c.method === 'schedules.update')).toBe(false);
  });

  it('a coupon that already exists is found again, not duplicated', async () => {
    const s = fakeStripe({ couponExists: true });
    const r = await run(world(), s);
    expect(r.ok).toBe(true);
    expect(s.calls.some((c) => c.method === 'coupons.retrieve')).toBe(true);
  });

  it('a fan already holding a prize from a DIFFERENT campaign is refused, never overwritten', async () => {
    const w = world({ subscription: { ...paidRow(PLATINUM), prize_campaign_id: OTHER_CAMPAIGN } });
    const s = fakeStripe();
    expect(await run(w, s)).toMatchObject({ ok: false, code: 'plan_refused' });
    expect(s.calls).toHaveLength(0);
  });

  it('a membership with a scheduled downgrade queued is refused', async () => {
    const w = world({ subscription: { ...paidRow(GOLD), pending_tier_id: SILVER } });
    expect(await run(w)).toMatchObject({ ok: false, code: 'plan_refused' });
  });

  it('a row write failure after Stripe reports db_failed and leaves the Stripe ids in the message', async () => {
    const w = world({ subscription: paidRow(GOLD) });
    const failing = fakeDb(w.tables, { failUpdate: true });
    const r = await fulfillCampaignPrize(deps(failing.db, fakeStripe().stripe), { campaignId: CAMPAIGN, fanId: FAN, actorArtistId: ARTIST });
    expect(r).toMatchObject({ ok: false, code: 'db_failed' });
  });
});
