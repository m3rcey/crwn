// Phrase integrity: cut points are ACOUSTIC, never just ASR word times.
//
// The first real reel (script 23) audibly chopped phrase endings. Measured on the source,
// three causes: (1) a stop-consonant closure ("Dis|cord", a ~30ms dip mid-word) was read
// as silence, so the cut landed before the rest of the word; (2) the recognizer stamps a
// word's start late, so an in-point after the "start" still cut the onset off ("It");
// (3) the frame grid then rounded an out-point earlier. This module measures the source
// envelope so a word ends only when the voice has DECAYED (quiet held longer than any
// closure), a word starts where its onset actually begins, and QA can refuse an edit
// that removes audible voice at a boundary.

/** A 1-channel RMS envelope, {hop, rms}, with its speech peak and room-tone floor. */
export function withLevels(env) {
  const s = Array.from(env.rms).sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))] || 1e-9;
  return { ...env, peak: at(0.995), floor: at(0.2) };
}

const db = (v, ref) => 20 * Math.log10(Math.max(v, 1e-9) / ref);

/**
 * The level (dB under the speech peak) below which audio is "quiet": a few dB over the
 * measured room tone, never higher than `ceilDb`. Adaptive, because a quiet room and a
 * noisy one put the same breath at very different absolute levels.
 */
export function quietThreshold(env, { overFloorDb = 5, ceilDb = -24 } = {}) {
  return Math.min(ceilDb, db(env.floor, env.peak) + overFloorDb);
}

/** Loudest level (dB under the speech peak) in [a, b) seconds. -Infinity when empty. */
export function levelIn(env, a, b) {
  const i0 = Math.max(0, Math.floor(a / env.hop)), i1 = Math.min(env.rms.length, Math.ceil(b / env.hop));
  if (i1 <= i0) return -Infinity;
  let m = 0;
  for (let i = i0; i < i1; i++) m = Math.max(m, env.rms[i]);
  return db(m, env.peak);
}

const quietFrom = (env, thrDb) => {
  const thr = env.peak * Math.pow(10, thrDb / 20);
  return (i) => (env.rms[i] ?? 0) <= thr;
};

/**
 * Where the voice has DECAYED at or after `from`: the first instant that starts a run of
 * quiet at least `holdSec` long (longer than a consonant closure). Bounded by `limit`;
 * null when the voice never decays before it (continuous speech: no clean cut exists).
 */
export function decayPoint(env, from, limit, { thrDb, holdSec = 0.09 } = {}) {
  const q = quietFrom(env, thrDb);
  const hold = Math.max(1, Math.round(holdSec / env.hop));
  const end = Math.floor(limit / env.hop);
  let run = 0;
  for (let i = Math.max(0, Math.floor(from / env.hop)); i <= end + hold; i++) {
    run = q(i) ? run + 1 : 0;
    if (run >= hold) { const start = i - hold + 1; return start <= end ? start * env.hop : null; }
  }
  return null;
}

/**
 * Where a word's onset actually begins, searching BACK from `from` (the recognizer's start,
 * usually late): the end of the nearest run of quiet at least `holdSec` long. Bounded
 * below by `limit`; null when there is no quiet run (continuous speech).
 */
export function onsetPoint(env, from, limit, { thrDb, holdSec = 0.06 } = {}) {
  const q = quietFrom(env, thrDb);
  const hold = Math.max(1, Math.round(holdSec / env.hop));
  const low = Math.max(0, Math.floor(limit / env.hop));
  let run = 0;
  for (let i = Math.floor(from / env.hop); i >= low - hold; i--) {
    run = q(i) ? run + 1 : 0;
    if (run >= hold) { const end = i + hold; return end >= low ? end * env.hop : null; }
  }
  return null;
}

/** How long the quiet lasts from `t` onward (seconds), up to `max`. */
export function quietRunAfter(env, t, thrDb, max = 2) {
  const q = quietFrom(env, thrDb);
  let i = Math.floor(t / env.hop), n = 0;
  while (q(i) && n * env.hop < max) { i++; n++; }
  return n * env.hop;
}

/** How long the quiet lasts before `t` (seconds), up to `max`. */
export function quietRunBefore(env, t, thrDb, max = 2) {
  const q = quietFrom(env, thrDb);
  let i = Math.floor(t / env.hop) - 1, n = 0;
  while (i >= 0 && q(i) && n * env.hop < max) { i--; n++; }
  return n * env.hop;
}

/** The quietest instant in [a, b], smoothed over `winSec` (for continuous speech). */
export function quietestIn(env, a, b, winSec = 0.04) {
  const w = Math.max(1, Math.round(winSec / env.hop));
  let best = a, bestV = Infinity;
  for (let i = Math.floor(a / env.hop); i <= Math.ceil(b / env.hop); i++) {
    let s = 0;
    for (let k = i; k < i + w; k++) s += env.rms[k] ?? 0;
    if (s < bestV) { bestV = s; best = i * env.hop; }
  }
  return best;
}

/**
 * Audit every boundary of an EDL against the SOURCE envelope. A cut is clean only when it
 * sits inside a stretch of room tone at least `minQuietSec` long. A shorter quiet stretch
 * is a consonant closure or the gap between syllables ("Dis|cord", "conten|t"), and a
 * cut on voiced audio has none at all: both mean a word was chopped. A cut in room tone
 * just before a separate sound (a breath removed whole) is clean. Joins inside continuous
 * source audio (nothing removed) are not cuts and are skipped.
 */
export function auditBoundaries(edl, env, { thrDb, minQuietSec = 0.08, slackDb = 3 } = {}) {
  const e = env.floor ? env : withLevels(env);
  const t = (thrDb ?? quietThreshold(e)) + slackDb;
  const stretch = (x) => quietRunBefore(e, x, t, 1) + quietRunAfter(e, x, t, 1);
  const bad = [];
  edl.segments.forEach((s, i) => {
    const next = edl.segments[i + 1];
    if (next && next.srcIn > s.srcOut + 1e-3) {
      const q = stretch(s.srcOut);
      if (q < minQuietSec) bad.push({ seg: i, kind: "out", at: +s.outEnd.toFixed(3), src: +s.srcOut.toFixed(3), quietSec: +q.toFixed(3) });
    }
    const prev = edl.segments[i - 1];
    if (prev && s.srcIn > prev.srcOut + 1e-3) {
      const q = stretch(s.srcIn);
      if (q < minQuietSec) bad.push({ seg: i, kind: "in", at: +s.outStart.toFixed(3), src: +s.srcIn.toFixed(3), quietSec: +q.toFixed(3) });
    }
  });
  return bad;
}
