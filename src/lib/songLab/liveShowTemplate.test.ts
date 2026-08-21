import { describe, it, expect } from 'vitest';
import {
  artistFirstName,
  liveShowDefaults,
  validateShowWindows,
  DEFAULT_SHOW_TIMES,
} from './liveShowTemplate';

describe('artistFirstName', () => {
  it('takes the first word, and never renders an empty gap in copy', () => {
    expect(artistFirstName('Julius Williams')).toBe('Julius');
    expect(artistFirstName('GB The G1ft')).toBe('GB');
    expect(artistFirstName('Prince')).toBe('Prince');
    expect(artistFirstName('')).toBe('the artist');
    expect(artistFirstName(null)).toBe('the artist');
  });
});

describe('liveShowDefaults', () => {
  const d = liveShowDefaults('Julius Williams', 'St. James Live Sept 26');

  it('prefills every field that repeats night after night', () => {
    expect(d.headline).toBe('YOU PICK THE FINALE');
    expect(d.question).toBe('What should Julius sing for the finale?');
    expect(d.description).toContain('part of the show');
    expect(d.description).toContain('Julius Williams');
    expect(d.benefitKind).toBe('vote');
    expect(d.stageLabels).toEqual(['Show 1', 'Show 2']);
  });

  it('derives the internal name and the link from the show, so neither is typed twice', () => {
    expect(d.offerName).toBe('St. James Live Sept 26 Finale Vote');
    // Punctuation in a venue name must not break the link.
    expect(d.offerSlug).toBe('st-james-live-sept-26');
  });

  it('carries no artist hardcoding: another artist gets their own copy', () => {
    const other = liveShowDefaults('Nina Simone', 'Blue Note Oct 3');
    expect(other.question).toBe('What should Nina sing for the finale?');
    expect(other.offerSlug).toBe('blue-note-oct-3');
    expect(JSON.stringify(other)).not.toContain('Julius');
  });

  it('leaves the variable things empty: songs and the venue/date are never prefilled', () => {
    const empty = liveShowDefaults('Julius Williams', '');
    expect(empty.offerName).toBe('');
    expect(empty.offerSlug).toBe('');
    // The template names no songs anywhere.
    expect(JSON.stringify(empty).toLowerCase()).not.toContain('never too much');
  });

  it('has no em dash in any generated copy (copy rule)', () => {
    expect(JSON.stringify(d).includes('—')).toBe(false);
  });

  it('defaults the two sets to 8pm and 11pm local, as editable event values', () => {
    expect(DEFAULT_SHOW_TIMES[0]).toEqual({ label: 'Show 1', closesAt: '20:00' });
    expect(DEFAULT_SHOW_TIMES[1]).toEqual({ label: 'Show 2', closesAt: '23:00' });
  });
});

describe('validateShowWindows', () => {
  const s1 = { label: 'Show 1', options: ['A', 'B'], opensAt: null, closesAt: '20:00' };
  const s2 = { label: 'Show 2', options: ['C', 'D'], opensAt: '20:00', closesAt: '23:00' };

  it('accepts the standard two-set night', () => {
    expect(validateShowWindows([s1, s2])).toBeNull();
  });

  it('accepts a single-show night, so nothing forces two polls', () => {
    expect(validateShowWindows([s1])).toBeNull();
  });

  it('refuses overlapping windows: two open polls behind one link is unresolvable', () => {
    const overlapping = { ...s2, opensAt: '19:30' };
    expect(validateShowWindows([s1, overlapping])).toContain('opens before');
  });

  it('refuses a second show with no opening time', () => {
    expect(validateShowWindows([s1, { ...s2, opensAt: null }])).toContain('needs an opening time');
  });

  it('requires a real ballot in every show', () => {
    expect(validateShowWindows([{ ...s1, options: ['only one'] }])).toContain('at least 2 songs');
    expect(validateShowWindows([{ ...s1, options: ['a', 'b', 'c', 'd', 'e'] }])).toContain('at most 4');
    expect(validateShowWindows([{ ...s1, options: ['A', '   '] }])).toContain('at least 2 songs');
  });

  it('refuses an empty night and an implausible number of sets', () => {
    expect(validateShowWindows([])).toContain('at least one show');
    expect(validateShowWindows([s1, s1, s1, s1, s1])).toContain('maximum');
  });
});
