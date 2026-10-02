/**
 * Queue rules for the playback engine. Pure: no DOM, no clock, no randomness except where a
 * caller passes one in, so every rule here is pinned by queue.test.ts.
 *
 * WHY THESE ARE SEPARATE FROM THE ENGINE
 * --------------------------------------
 * "What plays after this one" has to be answerable BEFORE the current track ends: that answer
 * is what the engine prepares (signed url + bytes in memory) while the current track plays, so
 * the `ended` handler can start the next track synchronously. A rule that only resolves at the
 * moment of `ended` (the old shuffle picked a random index right then) cannot be prepared for.
 */

export type RepeatMode = 'off' | 'all' | 'one';

/** A track the listener may play. The database decides: a NULL locator from tracks_public IS
 *  the refusal, so the client only reads it back (never re-derives entitlement). */
export interface Playable {
  id: string;
  audio_url_128: string | null;
}

export function isPlayable(t: Playable | undefined | null): boolean {
  return !!t && !!t.audio_url_128;
}

/**
 * The index that follows `index`, skipping tracks this listener cannot play. Null means the
 * queue is finished. `repeat: 'one'` is NOT handled here: replaying the same track is the
 * engine's `ended` decision, while an explicit Next press still moves forward.
 *
 * Bounded by queue.length, so an all-locked queue terminates.
 */
export function nextIndex(queue: Playable[], index: number, repeat: RepeatMode): number | null {
  const n = queue.length;
  if (n === 0) return null;
  for (let step = 1; step <= n; step++) {
    let i = index + step;
    if (i >= n) {
      if (repeat !== 'all') return null;
      i %= n;
    }
    if (isPlayable(queue[i])) return i;
  }
  return null;
}

/** The playable index before `index`, wrapping only on repeat-all. Null means none. */
export function previousIndex(queue: Playable[], index: number, repeat: RepeatMode): number | null {
  const n = queue.length;
  if (n === 0) return null;
  for (let step = 1; step <= n; step++) {
    let i = index - step;
    if (i < 0) {
      if (repeat !== 'all') return null;
      i = ((i % n) + n) % n;
    }
    if (isPlayable(queue[i])) return i;
  }
  return null;
}

/**
 * Shuffle `queue` keeping the track at `index` where it is, so turning shuffle on never moves
 * or restarts what is playing. Fisher-Yates over the others with an injectable random source.
 * After this, "next" is simply index + 1, which is what makes a shuffled queue preparable.
 */
export function shuffleAround<T>(queue: T[], index: number, random: () => number = Math.random): T[] {
  if (queue.length < 2 || index < 0 || index >= queue.length) return [...queue];
  const others = queue.filter((_, i) => i !== index);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  others.splice(index, 0, queue[index]);
  return others;
}

/** Where the current track sits after a drag from `from` to `to`. */
export function indexAfterMove(current: number, from: number, to: number): number {
  if (from === current) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
}

/** Move one entry; returns a new array. */
export function moveItem<T>(queue: T[], from: number, to: number): T[] {
  const next = [...queue];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
