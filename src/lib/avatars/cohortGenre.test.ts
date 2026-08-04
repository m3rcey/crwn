import { describe, it, expect } from 'vitest';
import {
  buildGenreBreakdown,
  parseGenreFilter,
  GENRE_KEYS,
  GENRE_MIN_SAMPLE,
  type CohortIdentity,
} from './cohortGenre';

const id = (n: number, genre: CohortIdentity['genre'], firstPaid = false, gmvCents = 0): CohortIdentity => ({
  id: `u${n}`,
  genre,
  firstPaid,
  gmvCents,
});

describe('buildGenreBreakdown', () => {
  it('always returns all four genres in a fixed order, so a gap is a visible zero', () => {
    const rows = buildGenreBreakdown([id(1, 'hiphop')]);
    expect(rows.map((r) => r.genre)).toEqual(GENRE_KEYS);
    expect(rows.find((r) => r.genre === 'rnb')?.identities).toBe(0);
  });

  it('NEVER folds "unknown" into "other": they are different facts', () => {
    const rows = buildGenreBreakdown([id(1, 'other'), id(2, 'unknown'), id(3, 'unknown')]);
    expect(rows.find((r) => r.genre === 'other')?.identities).toBe(1);
    expect(rows.find((r) => r.genre === 'unknown')?.identities).toBe(2);
  });

  it('counts an identity once however many events it produced', () => {
    const rows = buildGenreBreakdown([
      id(1, 'rnb', true, 5000),
      id(1, 'rnb', true, 5000),
      id(1, 'rnb', true, 5000),
    ]);
    const rnb = rows.find((r) => r.genre === 'rnb')!;
    expect(rnb.identities).toBe(1);
    expect(rnb.firstPaidArtists).toBe(1);
    expect(rnb.gmvCapturedCents).toBe(5000);
  });

  it('reports a within-genre rate only at or above the sample floor, else null', () => {
    const thin = buildGenreBreakdown(
      Array.from({ length: GENRE_MIN_SAMPLE - 1 }, (_, i) => id(i, 'hiphop', true)),
    );
    expect(thin.find((r) => r.genre === 'hiphop')?.firstPaidRate).toBeNull();

    const enough = buildGenreBreakdown(
      Array.from({ length: GENRE_MIN_SAMPLE }, (_, i) => id(i, 'hiphop', i < 2)),
    );
    expect(enough.find((r) => r.genre === 'hiphop')?.firstPaidRate).toBeCloseTo(2 / GENRE_MIN_SAMPLE);
  });

  it('a rate of zero is distinguishable from no data', () => {
    const nobodyPaid = buildGenreBreakdown(
      Array.from({ length: GENRE_MIN_SAMPLE }, (_, i) => id(i, 'rnb', false)),
    );
    expect(nobodyPaid.find((r) => r.genre === 'rnb')?.firstPaidRate).toBe(0);
    expect(nobodyPaid.find((r) => r.genre === 'hiphop')?.firstPaidRate).toBeNull();
  });

  it('sums refund-netted GMV per genre and ignores junk amounts', () => {
    const rows = buildGenreBreakdown([
      id(1, 'hiphop', true, 10_000),
      id(2, 'hiphop', false, -500),
      id(3, 'hiphop', false, Number.NaN),
    ]);
    expect(rows.find((r) => r.genre === 'hiphop')?.gmvCapturedCents).toBe(10_000);
  });

  it('is empty-safe', () => {
    const rows = buildGenreBreakdown([]);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.identities === 0 && r.firstPaidRate === null)).toBe(true);
  });
});

describe('parseGenreFilter', () => {
  it('accepts the four keys and refuses anything else', () => {
    expect(parseGenreFilter('hiphop')).toBe('hiphop');
    expect(parseGenreFilter('RNB')).toBe('rnb');
    expect(parseGenreFilter('unknown')).toBe('unknown');
    expect(parseGenreFilter('drill')).toBeNull();
    expect(parseGenreFilter('')).toBeNull();
    expect(parseGenreFilter(null)).toBeNull();
  });
});
