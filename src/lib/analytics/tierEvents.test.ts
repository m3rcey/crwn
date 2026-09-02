import { describe, it, expect } from 'vitest';
import {
  TIER_EVENT_TYPES,
  isTierEventType,
  sanitizeTierMetadata,
  buildTierEventRow,
  eventDateOf,
  recordTierEvent,
} from './tierEvents';

// A minimal stand-in for the supabase client shape the recorder uses. Records every upsert so
// a test can assert exactly what would have been written.
function makeDb(opts: {
  tier?: { id: string; artist_id: string; price: number; is_active?: boolean } | null;
  upsertError?: unknown;
}) {
  const upserts: { table: string; row: Record<string, unknown>; options: unknown }[] = [];
  const db = {
    from(table: string) {
      if (table === 'subscription_tiers') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.tier ?? null }),
            }),
          }),
        };
      }
      return {
        upsert: async (row: Record<string, unknown>, options: unknown) => {
          upserts.push({ table, row, options });
          return { error: opts.upsertError ?? null };
        },
      };
    },
  };
  return { db, upserts };
}

const TIER = { id: 'tier-1', artist_id: 'artist-1', price: 1000, is_active: true };
const FREE_TIER = { id: 'tier-free', artist_id: 'artist-1', price: 0, is_active: true };

describe('tier event types', () => {
  it('declares exactly the events the evidence layer needs, and no speculative ones', () => {
    // Grown from two to four with the Tier Offer Experience (2026-09-02, migration
    // schema-phase2-tier-events-offer-vocabulary.sql): a VSL play and an explicit decline
    // are the two offer signals that turn "viewed but never bought" from an inference
    // into facts. Still deliberately small; add a fifth only with the same chain
    // (founder decision, migration, registry, this pin).
    expect(TIER_EVENT_TYPES).toEqual([
      'tier_card_viewed',
      'tier_checkout_started',
      'tier_vsl_started',
      'tier_offer_declined',
    ]);
  });

  it('rejects anything outside the union', () => {
    expect(isTierEventType('tier_card_viewed')).toBe(true);
    expect(isTierEventType('tier_checkout_completed')).toBe(false);
    expect(isTierEventType(null)).toBe(false);
    expect(isTierEventType(42)).toBe(false);
  });
});

describe('sanitizeTierMetadata: no sensitive or unbounded values reach an analytics row', () => {
  it('keeps small scalars', () => {
    expect(sanitizeTierMetadata({ interval: 'year', price: 1000, annual: true })).toEqual({
      interval: 'year',
      price: 1000,
      annual: true,
    });
  });

  it('drops every known-sensitive key, case-insensitively', () => {
    const out = sanitizeTierMetadata({
      email: 'fan@example.com',
      Customer: 'cus_123',
      payment_intent: 'pi_123',
      CLIENT_SECRET: 'secret',
      checkout_session_id: 'cs_123',
      phone: '+15551234567',
      interval: 'month',
    });
    expect(out).toEqual({ interval: 'month' });
  });

  it('drops nested objects and arrays rather than storing unbounded shapes', () => {
    expect(sanitizeTierMetadata({ nested: { a: 1 }, list: [1, 2], ok: 'yes' })).toEqual({ ok: 'yes' });
  });

  it('drops non-finite numbers and empty strings', () => {
    expect(sanitizeTierMetadata({ n: NaN, i: Infinity, s: '   ', keep: 1 })).toEqual({ keep: 1 });
  });

  it('returns an empty object for non-objects', () => {
    expect(sanitizeTierMetadata(null)).toEqual({});
    expect(sanitizeTierMetadata('nope')).toEqual({});
    expect(sanitizeTierMetadata([1, 2])).toEqual({});
  });

  it('clips a long string rather than storing it whole', () => {
    const out = sanitizeTierMetadata({ note: 'x'.repeat(500) }) as { note: string };
    expect(out.note.length).toBe(200);
  });
});

describe('eventDateOf: the UTC day bucket that makes the dedupe grain', () => {
  it('buckets an instant to its UTC date', () => {
    expect(eventDateOf('2026-08-03T23:59:59.000Z')).toBe('2026-08-03');
    expect(eventDateOf('2026-08-04T00:00:00.000Z')).toBe('2026-08-04');
  });

  it('falls back to now for an unparseable value rather than writing a bad bucket', () => {
    expect(eventDateOf('not-a-date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('buildTierEventRow', () => {
  it('builds the row with the dedupe grain fields populated', () => {
    const row = buildTierEventRow({
      artistId: 'artist-1',
      tierId: 'tier-1',
      eventType: 'tier_card_viewed',
      visitorHash: 'hash-abc',
      occurredAt: '2026-08-03T10:00:00.000Z',
    });
    expect(row).toMatchObject({
      artist_id: 'artist-1',
      tier_id: 'tier-1',
      event_type: 'tier_card_viewed',
      event_date: '2026-08-03',
      visitor_hash: 'hash-abc',
      fan_id: null,
      source: null,
      metadata: {},
    });
  });

  it('refuses a row with no visitor hash, because it could never be deduplicated', () => {
    expect(
      buildTierEventRow({
        artistId: 'artist-1',
        tierId: 'tier-1',
        eventType: 'tier_card_viewed',
        visitorHash: '',
      }),
    ).toBeNull();
  });

  it('refuses an unknown event type and a missing artist or tier', () => {
    expect(
      buildTierEventRow({
        artistId: 'artist-1',
        tierId: 'tier-1',
        // @ts-expect-error deliberately invalid
        eventType: 'tier_hovered',
        visitorHash: 'h',
      }),
    ).toBeNull();
    expect(
      buildTierEventRow({ artistId: '', tierId: 'tier-1', eventType: 'tier_card_viewed', visitorHash: 'h' }),
    ).toBeNull();
    expect(
      buildTierEventRow({ artistId: 'a', tierId: '', eventType: 'tier_card_viewed', visitorHash: 'h' }),
    ).toBeNull();
  });
});

describe('recordTierEvent: artist is derived from the tier, never from the caller', () => {
  it('writes with the artist read off the tier row', async () => {
    const { db, upserts } = makeDb({ tier: TIER });
    const res = await recordTierEvent(db, {
      tierId: 'tier-1',
      eventType: 'tier_card_viewed',
      visitorHash: 'hash-abc',
    });
    expect(res.recorded).toBe(true);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe('tier_events');
    expect(upserts[0].row.artist_id).toBe('artist-1');
  });

  it('upserts on the full dedupe grain with duplicates ignored', async () => {
    const { db, upserts } = makeDb({ tier: TIER });
    await recordTierEvent(db, { tierId: 'tier-1', eventType: 'tier_card_viewed', visitorHash: 'h' });
    expect(upserts[0].options).toEqual({
      onConflict: 'artist_id,tier_id,event_type,visitor_hash,event_date',
      ignoreDuplicates: true,
    });
  });

  it('rejects a tier that does not belong to the expected artist', async () => {
    const { db, upserts } = makeDb({ tier: TIER });
    const res = await recordTierEvent(db, {
      tierId: 'tier-1',
      eventType: 'tier_checkout_started',
      visitorHash: 'h',
      expectArtistId: 'someone-else',
    });
    expect(res).toEqual({ recorded: false, reason: 'artist_mismatch' });
    expect(upserts).toHaveLength(0);
  });

  it('writes nothing for an unknown tier, so a forged id cannot create a row', async () => {
    const { db, upserts } = makeDb({ tier: null });
    const res = await recordTierEvent(db, {
      tierId: 'does-not-exist',
      eventType: 'tier_card_viewed',
      visitorHash: 'h',
    });
    expect(res).toEqual({ recorded: false, reason: 'unknown_tier' });
    expect(upserts).toHaveLength(0);
  });

  it('never records a checkout start for a free tier', async () => {
    const { db, upserts } = makeDb({ tier: FREE_TIER });
    const res = await recordTierEvent(db, {
      tierId: 'tier-free',
      eventType: 'tier_checkout_started',
      visitorHash: 'h',
    });
    expect(res).toEqual({ recorded: false, reason: 'free_tier' });
    expect(upserts).toHaveLength(0);
  });

  it('DOES record a view for a free tier: the free rung is part of the ladder', async () => {
    const { db, upserts } = makeDb({ tier: FREE_TIER });
    const res = await recordTierEvent(db, {
      tierId: 'tier-free',
      eventType: 'tier_card_viewed',
      visitorHash: 'h',
    });
    expect(res.recorded).toBe(true);
    expect(upserts).toHaveLength(1);
  });

  it('drops a bot (no visitor hash) before any lookup or write', async () => {
    const { db, upserts } = makeDb({ tier: TIER });
    const res = await recordTierEvent(db, {
      tierId: 'tier-1',
      eventType: 'tier_card_viewed',
      visitorHash: null,
    });
    expect(res).toEqual({ recorded: false, reason: 'bot_or_no_hash' });
    expect(upserts).toHaveLength(0);
  });

  it('reports a write failure without throwing', async () => {
    const { db } = makeDb({ tier: TIER, upsertError: { message: 'relation does not exist' } });
    const res = await recordTierEvent(db, {
      tierId: 'tier-1',
      eventType: 'tier_card_viewed',
      visitorHash: 'h',
    });
    expect(res).toEqual({ recorded: false, reason: 'write_failed' });
  });

  it('never throws even when the client itself blows up', async () => {
    const db = {
      from() {
        throw new Error('connection lost');
      },
    };
    await expect(
      recordTierEvent(db, { tierId: 't', eventType: 'tier_card_viewed', visitorHash: 'h' }),
    ).resolves.toEqual({ recorded: false, reason: 'write_failed' });
  });

  it('strips sensitive metadata on the way to the row', async () => {
    const { db, upserts } = makeDb({ tier: TIER });
    await recordTierEvent(db, {
      tierId: 'tier-1',
      eventType: 'tier_checkout_started',
      visitorHash: 'h',
      metadata: { interval: 'year', checkout_session_id: 'cs_live_123' },
    });
    expect(upserts[0].row.metadata).toEqual({ interval: 'year' });
  });
});
