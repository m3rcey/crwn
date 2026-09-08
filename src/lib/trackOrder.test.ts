import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { orderTracksForDisplay } from './trackOrder';

const t = (title: string, position: number | null, created_at = '2026-01-01T00:00:00Z') => ({ title, position, created_at });
const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe('orderTracksForDisplay', () => {
  it('puts arranged tracks in the artist\'s order', () => {
    const out = orderTracksForDisplay([t('Go Bad', 2), t('Pivotal', 0), t('Maneuver', 1)]);
    expect(titles(out)).toEqual(['Pivotal', 'Maneuver', 'Go Bad']);
  });

  it('puts every arranged track ahead of every unarranged one', () => {
    // An artist who arranged only their first two gets those two at the top, not scattered
    // through a date-ordered list.
    const out = orderTracksForDisplay([
      t('unarranged new', null, '2026-05-01T00:00:00Z'),
      t('second', 1),
      t('unarranged old', null, '2020-01-01T00:00:00Z'),
      t('first', 0),
    ]);
    expect(titles(out)).toEqual(['first', 'second', 'unarranged new', 'unarranged old']);
  });

  it('falls back to newest first when nothing is arranged', () => {
    const out = orderTracksForDisplay([
      t('old', null, '2020-01-01T00:00:00Z'),
      t('new', null, '2026-01-01T00:00:00Z'),
      t('middle', null, '2023-01-01T00:00:00Z'),
    ]);
    expect(titles(out)).toEqual(['new', 'middle', 'old']);
  });

  it('does not mutate the input array', () => {
    // The page holds this array for other reads; an in-place sort would reorder those too.
    const input = [t('b', 1), t('a', 0)];
    const before = titles(input);
    orderTracksForDisplay(input);
    expect(titles(input)).toEqual(before);
  });

  it('handles position 0 as a real position, not a missing one', () => {
    // The classic falsy-zero bug: `position || null` would send the first track to the back.
    const out = orderTracksForDisplay([t('unarranged', null, '2026-06-01T00:00:00Z'), t('first', 0)]);
    expect(titles(out)).toEqual(['first', 'unarranged']);
  });

  it('survives missing fields rather than throwing on a partial row', () => {
    expect(() => orderTracksForDisplay([{}, { position: 1 }, { created_at: null }])).not.toThrow();
    expect(orderTracksForDisplay([])).toEqual([]);
  });
});

describe('the artist page actually USES the order it computes', () => {
  // The regression this file exists for: the page computed `sortedTracks` and then rendered the
  // unsorted array, so the running order silently did nothing. A discarded sort looks exactly
  // like a working one, which is why this is asserted against the source.
  const page = readFileSync(new URL('../app/[slug]/page.tsx', import.meta.url), 'utf8');

  it('orders through this module', () => {
    expect(page).toContain('orderTracksForDisplay');
  });

  it('passes the ORDERED array to the profile content, never the raw fetch result', () => {
    expect(page).toMatch(/tracks=\{sortedTracks\}/);
    expect(page).not.toMatch(/tracks=\{tracks \|\| \[\]\}/);
  });
});
