import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  aggregateAcrossArtists,
  CROSS_ARTIST_EVIDENCE_VERSION,
  EVIDENCE_MIN_OBSERVATIONS,
  PRIVACY_MIN_ARTISTS,
  RELIABILITY_MAX_ARTIST_SHARE,
  type ArtistContribution,
} from './crossArtistEvidence';

const RAW = readFileSync('src/lib/crossArtistEvidence.ts', 'utf8');
/** CODE only. A comment explaining a prohibition is not the prohibited thing. */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const many = (n: number, obs = 100, rate = 0.05): ArtistContribution[] =>
  Array.from({ length: n }, (_, i) => ({ artistId: `a${i}`, rate, observations: obs }));
const agg = (contributions: ArtistContribution[]) =>
  aggregateAcrossArtists({ metric: 'free_capture_rate', cohort: 'all_qualifying', contributions });

describe('privacy floor', () => {
  it('never aggregates one artist', () => {
    const r = agg(many(1, 100_000));
    expect(r.status).toBe('below_privacy_floor');
    expect(r.medianArtistRate).toBeNull();
  });

  it('never aggregates two artists, however many events they have', () => {
    // The old cross-artist path shipped at n >= 2 counting ROWS. This is the guard against that.
    const r = agg(many(2, 500_000));
    expect(r.status).toBe('below_privacy_floor');
    expect(r.medianArtistRate).toBeNull();
  });

  it('refuses one below the floor and allows exactly the floor', () => {
    expect(agg(many(PRIVACY_MIN_ARTISTS - 1, 100)).status).toBe('below_privacy_floor');
    expect(agg(many(PRIVACY_MIN_ARTISTS, 100)).status).toBe('available');
  });

  it('counts DISTINCT artists, so one artist cannot impersonate a cohort', () => {
    const sameArtist = Array.from({ length: 50 }, () => ({ artistId: 'solo', rate: 0.9, observations: 100 }));
    const r = agg(sameArtist);
    expect(r.artistCount).toBe(1);
    expect(r.status).toBe('below_privacy_floor');
  });

  it('never returns an artist id, a list, or a per-artist value', () => {
    const r = agg(many(20, 100));
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/a0|a1\b|artistId/);
    expect(Object.keys(r)).not.toContain('contributions');
    expect(Object.keys(r)).not.toContain('artists');
  });
});

describe('evidence floor', () => {
  it('refuses enough artists with too little underlying data', () => {
    const r = agg(many(PRIVACY_MIN_ARTISTS, 1));
    expect(r.status).toBe('below_evidence_floor');
    expect(r.medianArtistRate).toBeNull();
    expect(r.artistCount).toBe(PRIVACY_MIN_ARTISTS);
  });

  it('keeps artist count and observation count as distinct facts', () => {
    const r = agg(many(10, 40));
    expect(r.artistCount).toBe(10);
    expect(r.observationCount).toBe(400);
    expect(r.observationCount).toBeGreaterThanOrEqual(EVIDENCE_MIN_OBSERVATIONS);
  });
});

describe('reliability gate', () => {
  it('refuses when one artist dominates the observations', () => {
    const contributions = [
      { artistId: 'whale', rate: 0.4, observations: 10_000 },
      ...many(9, 50, 0.02).map((c, i) => ({ ...c, artistId: `small${i}` })),
    ];
    const r = agg(contributions);
    expect(r.status).toBe('dominated_by_one_artist');
    expect(r.maxArtistShare).toBeGreaterThan(RELIABILITY_MAX_ARTIST_SHARE);
    expect(r.medianArtistRate).toBeNull();
    expect(r.explanation).toContain('describe them rather than the cohort');
  });

  it('allows a balanced cohort', () => {
    expect(agg(many(10, 100)).status).toBe('available');
  });
});

describe('aggregation method', () => {
  it('uses the MEDIAN of per-artist rates, not a pooled event rate', () => {
    // The whale has a huge denominator and a low rate. Pooled would be dragged toward it; the
    // median of artist rates is not. Kept under the dominance cap so it stays available.
    const contributions: ArtistContribution[] = [
      { artistId: 'big', rate: 0.01, observations: 400 },
      ...Array.from({ length: 9 }, (_, i) => ({ artistId: `s${i}`, rate: 0.10, observations: 100 })),
    ];
    const r = agg(contributions);
    expect(r.status).toBe('available');
    expect(r.medianArtistRate).toBeCloseTo(0.10); // pooled would be far lower
  });

  it('is even-count safe', () => {
    const r = agg([
      ...Array.from({ length: 5 }, (_, i) => ({ artistId: `l${i}`, rate: 0.02, observations: 100 })),
      ...Array.from({ length: 5 }, (_, i) => ({ artistId: `h${i}`, rate: 0.04, observations: 100 })),
    ]);
    expect(r.medianArtistRate).toBeCloseTo(0.03);
  });

  it('drops zero-denominator and non-finite contributions instead of counting them as zero', () => {
    const r = aggregateAcrossArtists({
      metric: 'm', cohort: 'c',
      contributions: [
        ...many(10, 100, 0.05),
        { artistId: 'nodata', rate: 0, observations: 0 },
        { artistId: 'nan', rate: Number.NaN, observations: 100 },
      ],
    });
    expect(r.artistCount).toBe(10); // the two junk rows are excluded, not zeroed
    expect(r.medianArtistRate).toBeCloseTo(0.05);
  });
});

describe('unavailable is a real answer', () => {
  it('always explains why, and never emits a number when unavailable', () => {
    for (const r of [agg(many(1)), agg(many(PRIVACY_MIN_ARTISTS, 1))]) {
      expect(r.status).not.toBe('available');
      expect(r.medianArtistRate).toBeNull();
      expect(r.explanation.toLowerCase()).toContain('unavailable');
    }
  });

  it('pins the methodology behind a version', () => {
    expect(agg(many(10, 100)).version).toBe(CROSS_ARTIST_EVIDENCE_VERSION);
    expect(CROSS_ARTIST_EVIDENCE_VERSION).toBe('crossArtistEvidence@1');
  });
});

describe('boundaries', () => {
  it('holds no database client, so it cannot widen its own cohort', () => {
    expect(SRC).not.toMatch(/SupabaseClient|createClient|\.from\(/);
  });

  it('aggregates no money and produces no score or ranking', () => {
    expect(SRC).not.toMatch(/mrr|revenue|earnings|gmv|payout|cents/i);
    expect(SRC).not.toMatch(/percentile|ranking|healthScore|successScore/i);
  });

  it('no longer reaches any artist-facing prompt', () => {
    // The old path injected a global benchmark into every artist's Manager prompt.
    // The cron that once injected cross-artist patterns into every artist's prompt was DELETED
    // on 2026-08-13, so the channel cannot be reopened by editing it. Z10 had already removed the
    // parameter; this removes the file.
    expect(existsSync('src/app/api/cron/ai-manager/route.ts')).toBe(false);
  });
});
