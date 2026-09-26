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

/**
 * The EARLY-stamp case (prototype, 2026-09-25): a recognizer whose word times abut can
 * put a real pause INSIDE the next word ("nothing" 40.30 | "now" 40.30-41.22, one syllable
 * stamped 0.9s long). Searching back finds no quiet, so the cut would fall on the voiced
 * boundary and chop "nothing". This searches FORWARD from the stamped start for a pause
 * that begins within `nearSec` of it and holds at least `holdSec` (longer than any
 * consonant closure), and returns where the voice resumes after it with the pause length.
 * null when there is none (the word really starts at its stamp).
 */
export function onsetAfterPause(env, from, limit, { thrDb, holdSec = 0.12, nearSec = 0.15, voiceSec = 0.04, minQuietFrac = 0.7, slackDb = 3 } = {}) {
  const q = quietFrom(env, thrDb);
  const i0 = Math.max(0, Math.floor(from / env.hop));
  const end = Math.floor(limit / env.hop);
  const near = Math.min(end, i0 + Math.ceil(nearSec / env.hop));
  let s = -1;
  for (let i = i0; i <= near; i++) if (q(i)) { s = i; break; }
  if (s < 0) return null;
  // The voice resumes at the first `voiceSec` that is sound throughout: a breath or a
  // click inside a real pause (measured on script 23: 5ms blips) is not the word.
  const vn = Math.max(1, Math.round(voiceSec / env.hop));
  let v = -1;
  for (let i = s; i + vn <= end + 1 && v < 0; i++) {
    let loud = true;
    for (let k = i; k < i + vn; k++) if (q(k)) { loud = false; break; }
    if (loud) v = i;
  }
  if (v < 0 || (v - s) * env.hop < holdSec) return null;
  let quietN = 0;
  for (let i = s; i < v; i++) if (q(i)) quietN++;
  if (quietN / (v - s) < minQuietFrac) return null;
  // The in-point goes in the unbroken room tone right before the voice, judged with the
  // same 3 dB slack auditBoundaries uses: a blip at the threshold is room tone to the
  // audit, so it must be here too, or the two disagree about where the pause is.
  const q2 = quietFrom(env, thrDb + slackDb);
  let r = v;
  while (r > s && q2(r - 1)) r--;
  const quiet = (v - r) * env.hop;
  return quiet >= 0.06 ? { onset: v * env.hop, quiet } : null;
}

/** The longest unbroken quiet run (seconds) inside [a, b]. */
export function longestQuietRun(env, a, b, thrDb) {
  const q = quietFrom(env, thrDb);
  let best = 0, run = 0;
  for (let i = Math.max(0, Math.floor(a / env.hop)); i <= Math.ceil(b / env.hop); i++) { run = q(i) ? run + 1 : 0; if (run > best) best = run; }
  return best * env.hop;
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
