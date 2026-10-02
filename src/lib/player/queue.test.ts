import { describe, expect, it } from 'vitest';
import { indexAfterMove, moveItem, nextIndex, previousIndex, shuffleAround } from './queue';

const t = (id: string, playable = true) => ({ id, audio_url_128: playable ? `/storage/v1/object/public/audio/${id}.mp3` : null });

describe('nextIndex', () => {
  const q = [t('a'), t('b'), t('c')];
  it('moves forward and stops at the end without repeat', () => {
    expect(nextIndex(q, 0, 'off')).toBe(1);
    expect(nextIndex(q, 2, 'off')).toBeNull();
  });
  it('wraps only on repeat-all', () => {
    expect(nextIndex(q, 2, 'all')).toBe(0);
  });
  it('skips locked tracks, and an all-locked queue terminates', () => {
    expect(nextIndex([t('a'), t('b', false), t('c')], 0, 'off')).toBe(2);
    expect(nextIndex([t('a', false), t('b', false)], 0, 'all')).toBeNull();
  });
  it('is deterministic: the same queue always names the same next track (preparable)', () => {
    expect(nextIndex(q, 0, 'off')).toBe(nextIndex(q, 0, 'off'));
  });
  it('handles an empty queue and a removed-current index of -1', () => {
    expect(nextIndex([], 0, 'all')).toBeNull();
    expect(nextIndex(q, -1, 'off')).toBe(0);
  });
});

describe('previousIndex', () => {
  const q = [t('a'), t('b', false), t('c')];
  it('skips locked tracks and wraps only on repeat-all', () => {
    expect(previousIndex(q, 2, 'off')).toBe(0);
    expect(previousIndex(q, 0, 'off')).toBeNull();
    expect(previousIndex(q, 0, 'all')).toBe(2);
  });
});

describe('shuffleAround', () => {
  it('keeps the playing track in place and every track exactly once', () => {
    const q = ['a', 'b', 'c', 'd', 'e'];
    let seed = 0.37;
    const rnd = () => (seed = (seed * 9301 + 0.49297) % 1);
    const s = shuffleAround(q, 2, rnd);
    expect(s[2]).toBe('c');
    expect([...s].sort()).toEqual(q);
  });
});

describe('moves', () => {
  it('tracks the current entry through a drag', () => {
    expect(indexAfterMove(2, 2, 0)).toBe(0);
    expect(indexAfterMove(2, 0, 3)).toBe(1);
    expect(indexAfterMove(2, 4, 1)).toBe(3);
    expect(indexAfterMove(2, 3, 4)).toBe(2);
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });
});
