import { describe, it, expect } from 'vitest';
import { assembleConstraintEvidence } from './assembler';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const ARTIST = 'artist-1';
const OTHER = 'artist-2';

interface Fixture {
  artistRow?: { slug: string | null; created_at: string } | null;
  tiers?: { id: string; price: number; artist_id: string; is_active?: boolean }[];
  subscriptions?: {
    id?: string;
    artist_id: string;
    tier_id: string | null;
    status: string;
    created_at: string;
    canceled_at?: string | null;
  }[];
  earnings?: { artist_id: string; net_amount: number }[];
  fulfillment?: {
    artist_id: string;
    title: string;
    status: string;
    due_at: string | null;
    completed_at?: string | null;
  }[];
  tierEvents?: { artist_id: string; tier_id: string; event_type: string; event_date: string }[];
  cancelReasons?: { subscription_id: string; context: string }[];
  /** Tables that should behave as if missing (pre-migration). */
  missingTables?: string[];
}

/**
 * A query stub that ENFORCES artist filtering: every eq('artist_id', x) narrows the rows, so a
 * test can prove the assembler never reads another artist's data by seeding both and checking
 * the numbers.
 */
function makeDb(f: Fixture) {
  const missing = new Set(f.missingTables ?? []);

  function table(rows: Record<string, unknown>[], name: string) {
    const filters: { col: string; val: unknown }[] = [];
    const ins: { col: string; vals: unknown[] }[] = [];
    const gtes: { col: string; val: string }[] = [];
    const gts: { col: string; val: number }[] = [];
    let headCount = false;

    const apply = () => {
      let out = rows;
      for (const { col, val } of filters) out = out.filter((r) => r[col] === val);
      for (const { col, vals } of ins) out = out.filter((r) => vals.includes(r[col]));
      for (const { col, val } of gtes) out = out.filter((r) => String(r[col] ?? '') >= val);
      for (const { col, val } of gts) out = out.filter((r) => Number(r[col] ?? 0) > val);
      return out;
    };

    const err = missing.has(name) ? { message: `relation "${name}" does not exist` } : null;

    const chain: Record<string, unknown> = {
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        headCount = !!opts?.head;
        return chain;
      },
      eq(col: string, val: unknown) {
        filters.push({ col, val });
        return chain;
      },
      in(col: string, vals: unknown[]) {
        ins.push({ col, vals });
        return chain;
      },
      gte(col: string, val: string) {
        gtes.push({ col, val });
        return chain;
      },
      gt(col: string, val: number) {
        gts.push({ col, val });
        return chain;
      },
      lt() {
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        const out = apply();
        return Promise.resolve(err ? { data: null, error: err, count: null } : { data: out, error: null, count: out.length });
      },
      maybeSingle() {
        const out = apply();
        return Promise.resolve(err ? { data: null, error: err } : { data: out[0] ?? null, error: null });
      },
      then(resolve: (v: unknown) => unknown) {
        const out = apply();
        const payload = err
          ? { data: null, error: err, count: null }
          : { data: headCount ? null : out, error: null, count: out.length };
        return Promise.resolve(payload).then(resolve);
      },
    };
    return chain;
  }

  return {
    from(name: string) {
      switch (name) {
        case 'artist_profiles':
          return table(f.artistRow ? [{ id: ARTIST, ...f.artistRow }] : [], name);
        case 'subscription_tiers':
          return table((f.tiers ?? []) as unknown as Record<string, unknown>[], name);
        case 'subscriptions':
          return table((f.subscriptions ?? []) as unknown as Record<string, unknown>[], name);
        case 'earnings':
          return table((f.earnings ?? []) as unknown as Record<string, unknown>[], name);
        case 'fulfillment_events':
          return table((f.fulfillment ?? []) as unknown as Record<string, unknown>[], name);
        case 'tier_events':
          return table((f.tierEvents ?? []) as unknown as Record<string, unknown>[], name);
        case 'cancellation_reasons':
          return table((f.cancelReasons ?? []) as unknown as Record<string, unknown>[], name);
        case 'artist_page_visits':
          return table([], name);
        default:
          // Everything the quest evaluator reaches for: empty, so launch checks resolve false.
          return table([], name);
      }
    },
  };
}

const BASE: Fixture = {
  artistRow: { slug: 'm3rcey', created_at: daysAgo(120) },
  // is_active matters: both the assembler and readTierEvidence filter on it, so a fixture
  // without it silently produces an artist with no tiers and therefore no prices.
  tiers: [
    { id: 'free', price: 0, artist_id: ARTIST, is_active: true },
    { id: 'silver', price: 1000, artist_id: ARTIST, is_active: true },
    { id: 'gold', price: 2500, artist_id: ARTIST, is_active: true },
    { id: 'platinum', price: 10000, artist_id: ARTIST, is_active: true },
  ],
};

async function assemble(f: Fixture) {
  return assembleConstraintEvidence(makeDb({ ...BASE, ...f }), {
    artistId: ARTIST,
    userId: 'user-1',
    now: NOW,
  });
}

describe('assembler: artist identity and launch state', () => {
  it('reads the slug and days live from the artist row', async () => {
    const e = await assemble({});
    expect(e.slug).toBe('m3rcey');
    expect(e.launch.pageLive).toBe(true);
    expect(e.launch.daysLive).toBe(120);
  });

  it('reports pageLive false when there is no slug', async () => {
    const e = await assemble({ artistRow: { slug: null, created_at: daysAgo(10) } });
    expect(e.launch.pageLive).toBe(false);
  });

  it('stamps now from the injected clock, so the snapshot is deterministic', async () => {
    const e = await assemble({});
    expect(e.now).toBe(NOW.toISOString());
  });
});

describe('assembler: membership, free vs paid', () => {
  const subs = [
    { id: 's1', artist_id: ARTIST, tier_id: 'free', status: 'active', created_at: daysAgo(100) },
    { id: 's2', artist_id: ARTIST, tier_id: 'free', status: 'active', created_at: daysAgo(10) },
    { id: 's3', artist_id: ARTIST, tier_id: 'silver', status: 'active', created_at: daysAgo(50) },
    { id: 's4', artist_id: ARTIST, tier_id: 'gold', status: 'active', created_at: daysAgo(40) },
    // Another artist's members must never appear in these counts.
    { id: 's5', artist_id: OTHER, tier_id: 'silver', status: 'active', created_at: daysAgo(30) },
  ];

  it('distinguishes free from paid members by PRICE, never by name', async () => {
    const e = await assemble({ subscriptions: subs });
    expect(e.membership.freeMembers).toBe(2);
    expect(e.membership.paidMembers).toBe(2);
  });

  it('excludes another artist\'s subscriptions entirely', async () => {
    const e = await assemble({ subscriptions: subs });
    // 2 free + 2 paid for OUR artist; the fifth row belongs to someone else.
    expect((e.membership.freeMembers ?? 0) + (e.membership.paidMembers ?? 0)).toBe(4);
  });

  it('computes MRR from the authoritative tier prices, in cents', async () => {
    const e = await assemble({ subscriptions: subs });
    expect(e.membership.mrrCents).toBe(1000 + 2500);
  });

  it('counts free joins only inside the capture window', async () => {
    const e = await assemble({ subscriptions: subs });
    // Only the one from 10 days ago falls inside the 30-day capture lookback.
    expect(e.membership.freeJoinsInWindow).toBe(1);
  });

  it('dates the FIRST free member ever, not the most recent', async () => {
    const e = await assemble({ subscriptions: subs });
    expect(e.membership.daysSinceFirstFreeMember).toBe(100);
  });

  it('leaves daysSinceFirstFreeMember null when there are no free members', async () => {
    const e = await assemble({
      subscriptions: [{ id: 's3', artist_id: ARTIST, tier_id: 'silver', status: 'active', created_at: daysAgo(50) }],
    });
    expect(e.membership.daysSinceFirstFreeMember).toBeNull();
  });

  it('computes premium share from the TOP TWO rungs by price', async () => {
    const e = await assemble({
      subscriptions: [
        { id: 'a', artist_id: ARTIST, tier_id: 'silver', status: 'active', created_at: daysAgo(10) },
        { id: 'b', artist_id: ARTIST, tier_id: 'gold', status: 'active', created_at: daysAgo(10) },
        { id: 'c', artist_id: ARTIST, tier_id: 'platinum', status: 'active', created_at: daysAgo(10) },
      ],
    });
    // gold 2500 + platinum 10000 out of 13500 total
    expect(e.membership.mrrCents).toBe(13500);
    expect(e.membership.premiumMrrShare).toBeCloseTo(12500 / 13500);
  });

  it('leaves premium share null when there is no paid MRR', async () => {
    const e = await assemble({
      subscriptions: [{ id: 'a', artist_id: ARTIST, tier_id: 'free', status: 'active', created_at: daysAgo(10) }],
    });
    expect(e.membership.premiumMrrShare).toBeNull();
  });
});

describe('assembler: first paid conversion reads the money', () => {
  it('is true when a positive earning exists for this artist', async () => {
    const e = await assemble({ earnings: [{ artist_id: ARTIST, net_amount: 900 }] });
    expect(e.membership.hasFirstPaidConversion).toBe(true);
  });

  it('is false with no earnings', async () => {
    const e = await assemble({ earnings: [] });
    expect(e.membership.hasFirstPaidConversion).toBe(false);
  });

  it('ignores another artist\'s earnings', async () => {
    const e = await assemble({ earnings: [{ artist_id: OTHER, net_amount: 5000 }] });
    expect(e.membership.hasFirstPaidConversion).toBe(false);
  });

  it('is null, not false, when the earnings table cannot be read', async () => {
    const e = await assemble({ missingTables: ['earnings'] });
    expect(e.membership.hasFirstPaidConversion).toBeNull();
  });
});

describe('assembler: promises', () => {
  it('counts only STILL-PENDING past-due promises as overdue now', async () => {
    const e = await assemble({
      fulfillment: [
        { artist_id: ARTIST, title: 'Old drop', status: 'pending', due_at: daysAgo(20) },
        { artist_id: ARTIST, title: 'Recent drop', status: 'pending', due_at: daysAgo(2) },
        // Already swept: a verdict, not something still deliverable today.
        { artist_id: ARTIST, title: 'Long gone', status: 'missed', due_at: daysAgo(60) },
        // Not due yet.
        { artist_id: ARTIST, title: 'Next month', status: 'pending', due_at: new Date(NOW.getTime() + 5 * DAY).toISOString() },
      ],
    });
    expect(e.promises.overdueNow).toBe(2);
  });

  it('reports the OLDEST overdue promise for the action', async () => {
    const e = await assemble({
      fulfillment: [
        { artist_id: ARTIST, title: 'Old drop', status: 'pending', due_at: daysAgo(20) },
        { artist_id: ARTIST, title: 'Recent drop', status: 'pending', due_at: daysAgo(2) },
      ],
    });
    expect(e.promises.oldestOverdue?.title).toBe('Old drop');
  });

  it('summarizes completion through the shared health function', async () => {
    const e = await assemble({
      fulfillment: [
        { artist_id: ARTIST, title: 'a', status: 'completed', due_at: daysAgo(30), completed_at: daysAgo(30) },
        { artist_id: ARTIST, title: 'b', status: 'completed', due_at: daysAgo(20), completed_at: daysAgo(18) },
        { artist_id: ARTIST, title: 'c', status: 'missed', due_at: daysAgo(40) },
      ],
    });
    expect(e.promises.resolved).toBe(3);
    expect(e.promises.completed).toBe(2);
    expect(e.promises.missed).toBe(1);
    expect(e.promises.completionRate).toBeCloseTo(2 / 3);
  });

  it('excludes another artist\'s promises', async () => {
    const e = await assemble({
      fulfillment: [{ artist_id: OTHER, title: 'theirs', status: 'pending', due_at: daysAgo(30) }],
    });
    expect(e.promises.overdueNow).toBe(0);
  });

  it('returns nulls rather than zeros when the table cannot be read', async () => {
    const e = await assemble({ missingTables: ['fulfillment_events'] });
    expect(e.promises.resolved).toBeNull();
    expect(e.promises.overdueNow).toBeNull();
  });
});

describe('assembler: retention reuses the authoritative churn function', () => {
  it('computes artist churn and the platform benchmark', async () => {
    const monthStart = new Date(Date.UTC(2026, 7, 1)).toISOString();
    void monthStart;
    const e = await assemble({
      subscriptions: [
        // Existed at month start, cancelled this month -> churned
        { id: 'a', artist_id: ARTIST, tier_id: 'silver', status: 'canceled', created_at: daysAgo(60), canceled_at: daysAgo(5) },
        // Existed at month start, still active
        { id: 'b', artist_id: ARTIST, tier_id: 'silver', status: 'active', created_at: daysAgo(60) },
      ],
    });
    // 1 of 2 -> 50%
    expect(e.retention.churnRatePct).toBeCloseTo(50);
    expect(e.retention.platformChurnRatePct).not.toBeNull();
  });

  it('counts cancellation reasons for this artist\'s subscriptions only', async () => {
    const e = await assemble({
      subscriptions: [{ id: 's1', artist_id: ARTIST, tier_id: 'silver', status: 'canceled', created_at: daysAgo(60), canceled_at: daysAgo(5) }],
      cancelReasons: [
        { subscription_id: 's1', context: 'fan' },
        { subscription_id: 'someone-elses-sub', context: 'fan' },
      ],
    });
    expect(e.retention.cancelReasonResponses).toBe(1);
  });

  it('reports zero reasons when the artist has no subscriptions at all', async () => {
    const e = await assemble({ subscriptions: [] });
    expect(e.retention.cancelReasonResponses).toBe(0);
  });
});

describe('assembler: tier evidence and its stated limitations', () => {
  it('maps only PAID rungs, ascending by price, and drops the free tier', async () => {
    const e = await assemble({
      tierEvents: [
        { artist_id: ARTIST, tier_id: 'silver', event_type: 'tier_card_viewed', event_date: '2026-08-10' },
        { artist_id: ARTIST, tier_id: 'gold', event_type: 'tier_card_viewed', event_date: '2026-08-10' },
      ],
    });
    expect(e.tiers.paidRungs.map((r) => r.tierId)).toEqual(['silver', 'gold', 'platinum']);
    expect(e.tiers.paidRungs.every((r) => r.priceCents > 0)).toBe(true);
  });

  it('reports interaction data unavailable when tier_events cannot be read', async () => {
    const e = await assemble({ missingTables: ['tier_events'] });
    expect(e.tiers.interactionDataAvailable).toBe(false);
  });

  it('never attributes another artist\'s tier events', async () => {
    const e = await assemble({
      tierEvents: [{ artist_id: OTHER, tier_id: 'silver', event_type: 'tier_card_viewed', event_date: '2026-08-10' }],
    });
    const silver = e.tiers.paidRungs.find((r) => r.tierId === 'silver');
    expect(silver?.views).toBe(0);
  });
});

describe('assembler: reach', () => {
  it('leaves visits null when the visits table cannot be read', async () => {
    const e = await assemble({ missingTables: ['artist_page_visits'] });
    expect(e.reach.uniqueVisits).toBeNull();
  });
});
