// Local deterministic audio analysis (§18): duration, BPM, beat timestamps,
// downbeat candidates, loudness, energy profile. Analyzed ONCE per file and cached
// by size+mtime; zero marginal API cost. Founder originals are never modified.

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { MUSIC, PATHS } from "../config.mjs";

const require = createRequire(import.meta.url);

function ffmpegPath() {
  return require("ffmpeg-static");
}

/** Decode a track to mono float PCM at the analysis sample rate. */
export function decodePcm(filePath, sampleRate = MUSIC.analysisSampleRate) {
  const res = spawnSync(
    ffmpegPath(),
    ["-v", "error", "-i", filePath, "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-"],
    { maxBuffer: 1024 * 1024 * 512 }
  );
  if (res.status !== 0) {
    throw new Error(`ffmpeg decode failed for ${filePath}: ${res.stderr?.toString().slice(0, 400)}`);
  }
  const buf = res.stdout;
  const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  return { samples, sampleRate };
}

/** RMS energy per window (coarse energy profile) + global peak/rms. */
export function energyProfile(samples, sampleRate, windowSec = 0.5) {
  const win = Math.floor(sampleRate * windowSec);
  const windows = [];
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += win) {
    let s = 0;
    const end = Math.min(i + win, samples.length);
    for (let j = i; j < end; j++) {
      const v = samples[j];
      s += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sumSq += v * v;
    }
    windows.push(Math.sqrt(s / Math.max(1, end - i)));
  }
  return {
    windows,
    windowSec,
    peak,
    rms: Math.sqrt(sumSq / Math.max(1, samples.length)),
  };
}

/** BPM + beat timestamps via music-tempo (pure JS, local). Returns null fields on
 * failure: beat sync then degrades gracefully instead of blocking the render. */
export function detectTempo(samples) {
  try {
    const MusicTempo = require("music-tempo");
    const mt = new MusicTempo(samples);
    const bpm = Number.parseFloat(mt.tempo);
    const beats = (mt.beats || []).map((b) => Number(b)).filter((b) => Number.isFinite(b));
    return { bpm: Number.isFinite(bpm) ? bpm : null, beats };
  } catch (err) {
    return { bpm: null, beats: [], error: String(err.message || err) };
  }
}

/** Downbeat candidates: with no bar-line detection, every 4th beat anchored at the
 * beat with the highest local energy is the deterministic approximation. */
export function downbeatCandidates(beats, energy) {
  if (!beats.length) return [];
  let anchor = 0;
  let best = -1;
  for (let i = 0; i < Math.min(beats.length, 16); i++) {
    const w = Math.floor(beats[i] / energy.windowSec);
    const e = energy.windows[w] || 0;
    if (e > best) {
      best = e;
      anchor = i % 4;
    }
  }
  return beats.filter((_, i) => i % 4 === anchor % 4);
}

function fingerprint(filePath) {
  const st = fs.statSync(filePath);
  return `${st.size}:${Math.floor(st.mtimeMs)}`;
}

export function loadAnalysisCache(cachePath = PATHS.musicAnalysisCache) {
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  } catch {
    return {};
  }
}

export function saveAnalysisCache(cache, cachePath = PATHS.musicAnalysisCache) {
  fs.mkdirSync(require("node:path").dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

/** Analyze one track, using the cache when the file is unchanged. */
export function analyzeTrack(filePath, cache = null) {
  const fp = fingerprint(filePath);
  if (cache && cache[filePath] && cache[filePath].fingerprint === fp) {
    return cache[filePath];
  }
  const { samples, sampleRate } = decodePcm(filePath);
  const durationSec = samples.length / sampleRate;
  const energy = energyProfile(samples, sampleRate);
  const tempo = detectTempo(samples);
  const downbeats = downbeatCandidates(tempo.beats, energy);
  const analysis = {
    fingerprint: fp,
    durationSec: round2(durationSec),
    bpm: tempo.bpm ? round2(tempo.bpm) : null,
    beats: tempo.beats.map(round2),
    downbeats: downbeats.map(round2),
    peak: round4(energy.peak),
    rms: round4(energy.rms),
    energyWindows: energy.windows.map(round4),
    energyWindowSec: energy.windowSec,
    tempoError: tempo.error || null,
    analyzedAt: new Date().toISOString(),
  };
  if (cache) cache[filePath] = analysis;
  return analysis;
}

/** Pick the strongest usable segment of `needSec` seconds: prefer a start on a
 * downbeat inside the highest sustained-energy region, never past the point where
 * the track runs out. Videos do not have to start at second 0 of a track (§20). */
export function selectSegment(analysis, needSec) {
  const dur = analysis.durationSec;
  if (needSec >= dur) return { start: 0, reason: "track shorter than video; using full track" };
  const w = analysis.energyWindowSec || 0.5;
  const windows = analysis.energyWindows || [];
  const needWindows = Math.ceil(needSec / w);
  let bestStart = 0;
  let bestScore = -1;
  const lastStart = Math.max(0, windows.length - needWindows);
  for (let i = 0; i <= lastStart; i++) {
    let s = 0;
    for (let j = i; j < i + needWindows && j < windows.length; j++) s += windows[j];
    if (s > bestScore) {
      bestScore = s;
      bestStart = i * w;
    }
  }
  // Snap to the nearest downbeat (then beat) at or before the chosen start.
  const anchors = (analysis.downbeats?.length ? analysis.downbeats : analysis.beats) || [];
  let start = bestStart;
  for (const b of anchors) {
    if (b <= bestStart + 0.05) start = b;
    else break;
  }
  if (start + needSec > dur) start = Math.max(0, dur - needSec - 0.5);
  return {
    start: round2(start),
    reason:
      start === 0
        ? "highest-energy region begins at the top of the track"
        : `highest sustained energy region, entry snapped to a ${analysis.downbeats?.length ? "downbeat" : "beat"}`,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
