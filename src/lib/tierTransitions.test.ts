import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  countMovements,
  directionOf,
  isRealMovement,
  transitionKey,
  type TierTransition,
} from './tierTransitions';
import { recordTierTransition } from './tierTransitionStore';

const MIGRATION = readFileSync('supabase/schema-phase3-tier-transitions.sql', 'utf8');
const PRICES: Record<string, number> = { bronze: 0, silver: 1000, gold: 2500, platinum: 10000 };
const priceOf = (id: string) => PRICES[id];

const T = (over: Partial<TierTransition> = {}): TierTransition => ({
  artistId: 'a1', fanId: 'f1', subscriptionId: 's1',
  fromTierId: 'silver', toTierId: 'gold',
  occurredAt: '2026-08-11T10:00:00.000Z',
  source: 'stripe_subscription_update', evidence: 'observed', eventKey: 'k1',
  ...over,
});

describe('direction is derived from price, never stored', () => {
  it('uses the same ordering production charges on', () => {
    expect(directionOf(T(), priceOf)).toBe('deeper');
    expect(directionOf(T({ fromTierId: 'gold', toTierId: 'silver' }), priceOf)).toBe('shallower');
  });

  it('calls a same-price move lateral rather than an upgrade', () => {
    const prices: Record<string, number> = { a: 1000, b: 1000 };
    expect(directionOf(T({ fromTierId: 'a', toTierId: 'b' }), (id) => prices[id])).toBe('lateral');
  });

  it('distinguishes starting and ending a membership from moving within one', () => {
    expect(directionOf(T({ fromTierId: null, toTierId: 'silver' }), priceOf)).toBe('started');
    expect(directionOf(T({ fromTierId: 'gold', toTierId: null }), priceOf)).toBe('ended');
  });

  it('says unknown rather than guessing when a tier price is gone', () => {
    // A retired tier. An invented direction here would be a claim about history CRWN cannot support.
    expect(directionOf(T({ fromTierId: 'deleted' }), priceOf)).toBe('unknown');
  });
});

describe('an artist repricing a tier is not a fan moving', () => {
  it('refuses a same-tier movement', () => {
    expect(isRealMovement('gold', 'gold')).toBe(false);
    expect(isRealMovement(null, null)).toBe(false);
    expect(isRealMovement('silver', 'gold')).toBe(true);
  });

  it('is enforced by the database too, not just the writer', () => {
    expect(MIGRATION).toContain('tier_transitions_real_movement');
    expect(MIGRATION).toContain('from_tier_id IS DISTINCT FROM to_tier_id');
  });
});

describe('event identity survives retries', () => {
  it('collapses a redelivered Stripe webhook to one key', () => {
    const a = transitionKey({ stripeEventId: 'evt_1', fanId: 'f1', artistId: 'a1', toTierId: 'gold', occurredAt: '2026-08-11T10:00:00Z' });
    const b = transitionKey({ stripeEventId: 'evt_1', fanId: 'f1', artistId: 'a1', toTierId: 'gold', occurredAt: '2026-08-11T10:00:31Z' });
    expect(a).toBe(b); // same event, processed 31s apart on retry
  });

  it('falls back to the state change when there is no Stripe event id', () => {
    const k = transitionKey({ subscriptionId: 's1', fanId: 'f1', artistId: 'a1', toTierId: 'gold', occurredAt: '2026-08-11T10:00:59Z' });
    expect(k).toBe('sub:s1:to:gold:2026-08-11T10:00');
  });

  it('never relies on a timestamp alone', () => {
    const x = transitionKey({ subscriptionId: 's1', fanId: 'f1', artistId: 'a1', toTierId: 'gold', occurredAt: '2026-08-11T10:00:00Z' });
    const y = transitionKey({ subscriptionId: 's1', fanId: 'f1', artistId: 'a1', toTierId: 'silver', occurredAt: '2026-08-11T10:00:00Z' });
    expect(x).not.toBe(y);
  });

  it('is unique-indexed in the schema', () => {
    expect(MIGRATION).toContain('idx_tier_transitions_event_key');
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]*event_key/);
  });
});

describe('counting keeps events and fans distinct', () => {
  it('separates movement count from moving-fan count', () => {
    const r = countMovements(
      [
        T({ fanId: 'f1', fromTierId: 'silver', toTierId: 'gold' }),
        T({ fanId: 'f1', fromTierId: 'gold', toTierId: 'platinum' }),
        T({ fanId: 'f2', fromTierId: 'gold', toTierId: 'silver' }),
      ],
      priceOf,
    );
    expect(r.deeperEvents).toBe(2);
    expect(r.uniqueFansDeeper).toBe(1); // one fan moved twice
    expect(r.shallowerEvents).toBe(1);
    expect(r.uniqueFansShallower).toBe(1);
  });

  it('never counts a baseline or an import as movement CRWN witnessed', () => {
    const r = countMovements(
      [T({ evidence: 'baseline' }), T({ evidence: 'imported', fanId: 'f9' })],
      priceOf,
    );
    expect(r.deeperEvents).toBe(0);
    expect(r.uniqueFansDeeper).toBe(0);
  });
});

describe('the writer', () => {
  const db = (error: { code: string; message: string } | null) =>
    ({ from: () => ({ insert: async () => ({ error }) }) }) as never;
  const base = { artistId: 'a1', fanId: 'f1', fromTierId: 'silver', toTierId: 'gold', source: 'stripe_checkout' as const };

  afterEach(() => vi.restoreAllMocks());

  it('writes nothing for a same-tier event', async () => {
    let called = false;
    const watching = { from: () => ({ insert: async () => { called = true; return { error: null }; } }) } as never;
    await recordTierTransition(watching, { ...base, fromTierId: 'gold', toTierId: 'gold' });
    expect(called).toBe(false);
  });

  it('stays silent on a duplicate retry and pre-migration, and reports anything else', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await recordTierTransition(db({ code: '23505', message: 'dup' }), base);
    await recordTierTransition(db({ code: '42P01', message: 'no table' }), base);
    expect(spy).not.toHaveBeenCalled();
    await recordTierTransition(db({ code: '42501', message: 'denied' }), base);
    expect(spy).toHaveBeenCalled();
  });

  it('never throws, so history can never break a completed payment', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = { from: () => ({ insert: async () => { throw new Error('down'); } }) } as never;
    await expect(recordTierTransition(boom, base)).resolves.toBeUndefined();
  });
});

describe('the schema keeps its boundaries', () => {
  it('stores no money column', () => {
    for (const banned of ['gmv', 'mrr', 'revenue', 'earnings', 'amount_cents', 'fee']) {
      expect(MIGRATION.toLowerCase()).not.toMatch(new RegExp(`\\n\\s+${banned}\\b`));
    }
  });

  it('stores no derived direction label', () => {
    expect(MIGRATION).not.toMatch(/\n\s+direction\b/);
    expect(MIGRATION).not.toMatch(/'upgrade'|'downgrade'/);
  });

  it('is artist-read-only with no client write policy', () => {
    expect(MIGRATION).toContain('artist_reads_own_tier_transitions');
    expect(MIGRATION).toContain('FOR SELECT');
    expect(MIGRATION).toContain('must have no client write policy');
  });

  it('does not let a deleted fan or retired tier erase the artist history', () => {
    expect(MIGRATION).toContain('fan_id UUID REFERENCES profiles(id) ON DELETE SET NULL');
    expect(MIGRATION).toMatch(/from_tier_id[\s\S]*ON DELETE SET NULL/);
  });
});
