// Music library + selection (§14-§16): three intentional preference tiers with
// weighted rotation, repetition rules, and lightweight persisted usage metadata.
// Founder originals are read-only; Dropbox `name:com.dropbox.attrs` junk entries
// are excluded from the library scan.

import fs from "node:fs";
import path from "node:path";
import { MUSIC, PATHS } from "../config.mjs";

const AUDIO_EXTS = new Set([".mp3", ".wav"]);
export const TIERS = ["primary", "secondary", "tertiary"];

/** @typedef {{ name: string, tier: string, path: string }} Track */

/** @returns {Track[]} */
export function scanLibrary(musicDir = PATHS.musicDir) {
  const tracks = [];
  for (const tier of TIERS) {
    const dir = path.join(musicDir, tier);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.includes(":")) continue; // Dropbox ADS junk
      if (!AUDIO_EXTS.has(path.extname(f).toLowerCase())) continue;
      tracks.push({ name: f, tier, path: path.join(dir, f) });
    }
  }
  return tracks;
}

export function loadUsageState(statePath = PATHS.musicUsageState) {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch {
    return { recent: [], tracks: {} };
  }
}

export function saveUsageState(state, statePath = PATHS.musicUsageState) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Pick a track. Deterministic given (tracks, state, rand).
 * Rules, in order:
 *  1. weighted tier rotation (primary/secondary/tertiary weights from config);
 *  2. never the same track as the previous video when an alternative exists;
 *  3. never a track used twice within the last `noRepeatWindow` videos when
 *     alternatives exist;
 *  4. inside the chosen tier, favor relatively underused tracks.
 * @param {Track[]} tracks
 * @param {{recent: string[], tracks: Record<string,{useCount:number,lastUsed:string}>}} state
 * @param {() => number} rand
 */
export function pickTrack(tracks, state, rand = Math.random) {
  if (!tracks.length) throw new Error("music library is empty");
  const recent = state.recent || [];
  const lastUsed = recent[recent.length - 1] || null;
  const window = recent.slice(-MUSIC.noRepeatWindow);

  const eligible = (pool) => {
    let p = pool.filter((t) => t.path !== lastUsed);
    if (!p.length) p = pool;
    const notInWindow = p.filter((t) => !window.includes(t.path));
    return notInWindow.length ? notInWindow : p;
  };

  // Weighted tier pick among tiers that actually have eligible tracks.
  const tiersWithTracks = TIERS.filter((tier) => eligible(tracks.filter((t) => t.tier === tier)).length);
  if (!tiersWithTracks.length) throw new Error("no eligible tracks in any tier");
  const weights = tiersWithTracks.map((t) => MUSIC.tierWeights[t] ?? 0.1);
  const totalW = weights.reduce((a, b) => a + b, 0);
  let roll = rand() * totalW;
  let tier = tiersWithTracks[tiersWithTracks.length - 1];
  for (let i = 0; i < tiersWithTracks.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      tier = tiersWithTracks[i];
      break;
    }
  }

  const pool = eligible(tracks.filter((t) => t.tier === tier));
  // Favor underused: weight each track by 1/(1+useCount).
  const uw = pool.map((t) => 1 / (1 + (state.tracks?.[t.path]?.useCount || 0)));
  const uTotal = uw.reduce((a, b) => a + b, 0);
  let r2 = rand() * uTotal;
  let chosen = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    r2 -= uw[i];
    if (r2 <= 0) {
      chosen = pool[i];
      break;
    }
  }
  return chosen;
}

/** Record a use. Mutates and returns state; caller persists. */
export function recordUse(state, track, now = new Date()) {
  state.recent = [...(state.recent || []), track.path].slice(-10);
  state.tracks = state.tracks || {};
  const entry = state.tracks[track.path] || { useCount: 0, lastUsed: null, tier: track.tier };
  entry.useCount += 1;
  entry.lastUsed = now.toISOString();
  entry.tier = track.tier;
  state.tracks[track.path] = entry;
  return state;
}

/** Find a track by (partial, case-insensitive) name across all tiers, for
 * `rerender --music "<name>"`. */
export function findTrackByName(tracks, name) {
  const q = name.toLowerCase();
  const exact = tracks.find((t) => t.name.toLowerCase() === q);
  if (exact) return exact;
  const matches = tracks.filter((t) => t.name.toLowerCase().includes(q));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1)
    throw new Error(`"${name}" matches ${matches.length} tracks: ${matches.map((t) => t.name).join(", ")}`);
  throw new Error(`no track matching "${name}"`);
}
