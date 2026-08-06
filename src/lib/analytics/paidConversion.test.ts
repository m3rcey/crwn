import { describe, it, expect } from 'vitest';
import {
  PAID_CONVERSION_KINDS,
  isPaidConversionKind,
  buildPaidConversionEvent,
} from './paidConversion';
import { buildFunnelRow } from './funnelEvents';

describe('paid conversion kinds', () => {
  it('covers every rail that can produce an artist\'s first dollar', () => {
    expect([...PAID_CONVERSION_KINDS].sort()).toEqual(
      ['booking', 'live_ticket', 'live_tip', 'product', 'subscription', 'track'].sort(),
    );
  });

  it('rejects anything outside the union', () => {
    expect(isPaidConversionKind('subscription')).toBe(true);
    expect(isPaidConversionKind('free_tier')).toBe(false);
    expect(isPaidConversionKind(undefined)).toBe(false);
  });
});

describe('buildPaidConversionEvent', () => {
  it('dedupes per ARTIST, which is what makes it fire exactly once ever', () => {
    const ev = buildPaidConversionEvent({ artistId: 'artist-1', kind: 'subscription' })!;
    expect(ev.stage).toBe('first_paid_conversion');
    expect(ev.dedupeKey).toBe('artist-1');
  });

  it('produces an identical dedupe key for a later conversion on a different rail', () => {
    const first = buildPaidConversionEvent({ artistId: 'artist-1', kind: 'subscription' })!;
    const later = buildPaidConversionEvent({ artistId: 'artist-1', kind: 'live_ticket' })!;
    expect(later.dedupeKey).toBe(first.dedupeKey);
    // The DB's unique dedupe_key + ON CONFLICT DO NOTHING is what collapses the second one.
    expect(buildFunnelRow(later)!.dedupe_key).toBe(buildFunnelRow(first)!.dedupe_key);
  });

  it('a webhook retry of the same event produces the same row key', () => {
    const a = buildPaidConversionEvent({ artistId: 'artist-1', kind: 'product' })!;
    const b = buildPaidConversionEvent({ artistId: 'artist-1', kind: 'product' })!;
    expect(buildFunnelRow(a)!.dedupe_key).toBe(buildFunnelRow(b)!.dedupe_key);
  });

  it('different artists never collide', () => {
    const a = buildPaidConversionEvent({ artistId: 'artist-1', kind: 'subscription' })!;
    const b = buildPaidConversionEvent({ artistId: 'artist-2', kind: 'subscription' })!;
    expect(buildFunnelRow(a)!.dedupe_key).not.toBe(buildFunnelRow(b)!.dedupe_key);
  });

  it('carries the calculator and result so the first dollar joins back to the funnel', () => {
    const ev = buildPaidConversionEvent({
      artistId: 'artist-1',
      kind: 'subscription',
      calculator: 'opportunity-calculator',
      resultId: 'result-9',
    })!;
    expect(ev.calculator).toBe('opportunity-calculator');
    expect(ev.resultId).toBe('result-9');
    const row = buildFunnelRow(ev)!;
    expect(row.calculator).toBe('opportunity-calculator');
    expect(row.result_id).toBe('result-9');
  });

  it('records the rail in metadata so a stricter reading stays possible later', () => {
    expect(buildPaidConversionEvent({ artistId: 'a', kind: 'live_tip' })!.metadata).toEqual({ kind: 'live_tip' });
  });

  it('carries the campaign attribution, which is what joins the first dollar to a VIDEO', () => {
    const ev = buildPaidConversionEvent({
      artistId: 'artist-1',
      kind: 'subscription',
      attribution: {
        campaign: 'kcamp_streaming_loss',
        referrer: 'instagram',
        video: 'kcamp_v1',
        metadata: { angle: 'streaming_loss', keyword: 'vault' },
      },
    })!;
    const row = buildFunnelRow(ev)!;
    expect(row.campaign).toBe('kcamp_streaming_loss');
    expect(row.referrer).toBe('instagram');
    expect(row.video).toBe('kcamp_v1');
    expect(row.metadata).toEqual({ angle: 'streaming_loss', keyword: 'vault', kind: 'subscription' });
  });

  it('an unattributed artist still produces a valid, recorded row', () => {
    const row = buildFunnelRow(buildPaidConversionEvent({ artistId: 'artist-1', kind: 'booking', attribution: {} })!)!;
    expect(row.campaign).toBeNull();
    expect(row.video).toBeNull();
    expect(row.metadata).toEqual({ kind: 'booking' });
  });

  it('is unattributed rather than unrecorded when the artist ran no calculator', () => {
    const row = buildFunnelRow(buildPaidConversionEvent({ artistId: 'artist-1', kind: 'track' })!)!;
    expect(row.calculator).toBeNull();
    expect(row.artist_id).toBe('artist-1');
  });

  it('refuses to build a row with no artist, which could never be attributed later', () => {
    expect(buildPaidConversionEvent({ artistId: '', kind: 'subscription' })).toBeNull();
    // @ts-expect-error deliberately invalid
    expect(buildPaidConversionEvent({ artistId: null, kind: 'subscription' })).toBeNull();
  });

  it('refuses an unknown kind rather than inventing one', () => {
    // @ts-expect-error deliberately invalid
    expect(buildPaidConversionEvent({ artistId: 'a', kind: 'free_membership' })).toBeNull();
  });

  it('the built event is a valid funnel row (the stage exists in the taxonomy)', () => {
    const row = buildFunnelRow(buildPaidConversionEvent({ artistId: 'a', kind: 'subscription' })!);
    expect(row).not.toBeNull();
    expect(row!.stage).toBe('first_paid_conversion');
  });
});
