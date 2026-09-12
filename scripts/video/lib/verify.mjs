// Verification, in four levels, three of which are automatic.
//
//   1 STRUCTURAL  the file exists and is 1080x1920 / 30fps / the authored length
//   2 FACT        every string drawn traces to the source script; the CTA keyword
//                 is exact; required figures are present; nothing is malformed
//   3 VISUAL QA   machine checks (safe zone, blank frames, layer overlap) plus a
//                 contact sheet, because clipping and ugliness are judged by eye
//   4 FINAL       a person watches it against the script (nothing automates taste)
//
// Level 2 reads the render manifest, never the pixels. OCRing a finished video to
// find out whether it says $120,000 would make correctness depend on a model
// recognising glyphs; the manifest makes it depend on a string comparison.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import sharp from "sharp";
import { RENDER, MOTION } from "../config.mjs";
import { verifyTextManifest } from "./factLock.mjs";
import { screenNumberTokens } from "./scriptParse.mjs";

const require = createRequire(import.meta.url);

function ffmpegProbe(file) {
  const ffmpeg = require("ffmpeg-static");
  return new Promise((resolve, reject) => {
    // ffmpeg-static ships no ffprobe, and `ffmpeg -i` prints everything needed on
    // stderr before exiting 1 for "no output". Parsing that beats a new dependency.
    const proc = spawn(ffmpeg, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
    let out = "";
    proc.stderr.on("data", (d) => (out += d.toString()));
    proc.on("close", () => resolve(out));
    proc.on("error", reject);
  });
}

/** Pull dimensions, fps, duration and stream kinds out of ffmpeg's own report. */
export function parseProbe(text) {
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const durationSec = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null;
  const size = /Video:.*?,\s*(\d{2,5})x(\d{2,5})/.exec(text);
  const fps = /,\s*([\d.]+)\s*fps\b/.exec(text);
  return {
    durationSec,
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    fps: fps ? Number(fps[1]) : null,
    hasVideo: /Stream #\d+:\d+.*: Video:/.test(text),
    hasAudio: /Stream #\d+:\d+.*: Audio:/.test(text),
    codec: /Video:\s*(\w+)/.exec(text)?.[1] || null,
  };
}

/** LEVEL 1. `opts.probeText` injects ffmpeg's report so this is testable without
 * encoding a video; without it the real prober runs. */
export async function verifyStructure(file, spec, opts = {}) {
  const errors = [];
  const warnings = [];
  if (!opts.probeText && !fs.existsSync(file)) {
    return { ok: false, errors: [`no output file at ${file}`], warnings, probe: null };
  }
  const probe = parseProbe(opts.probeText ?? (await ffmpegProbe(file)));
  const expected = spec.scenes.reduce((a, s) => a + s.durationSec, 0);

  if (probe.width !== RENDER.width || probe.height !== RENDER.height) {
    errors.push(`output is ${probe.width}x${probe.height}, expected ${RENDER.width}x${RENDER.height}`);
  }
  if (probe.fps == null || Math.abs(probe.fps - RENDER.fps) > 0.02) {
    errors.push(`output is ${probe.fps} fps, expected ${RENDER.fps}`);
  }
  if (probe.durationSec == null || Math.abs(probe.durationSec - expected) > 0.2) {
    errors.push(`output is ${probe.durationSec}s, the spec authors ${expected.toFixed(2)}s`);
  }
  const target = spec.targetDurationSec ?? MOTION.targetDurationSec;
  if (probe.durationSec != null && Math.abs(probe.durationSec - target) > 0.2) {
    errors.push(`output is ${probe.durationSec}s, the target is ${target}s`);
  }
  if (!probe.hasVideo) errors.push("no video stream");
  if (opts.expectAudio !== false && !probe.hasAudio) errors.push("no audio stream (the video should carry instrumental music)");
  if (probe.codec && probe.codec !== "h264") warnings.push(`video codec is ${probe.codec}, expected h264`);

  // Every scene must have produced a segment; a missing one means a silent gap.
  if (opts.checkSegments !== false) {
    for (const scene of spec.scenes) {
      const seg = path.join(path.dirname(path.dirname(file)), "segments", `scene-${String(scene.index).padStart(2, "0")}.mp4`);
      if (!fs.existsSync(seg)) errors.push(`scene ${scene.index} has no rendered segment`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, probe };
}

/** LEVEL 2. */
export function verifyFacts(manifest, lock, spec, opts = {}) {
  const specText = {};
  for (const scene of spec.scenes) {
    for (const t of scene.text || []) specText[`${scene.index}:${t.id}`] = t.text;
  }
  const res = verifyTextManifest(manifest, lock, {
    specText,
    requiredNumbers: opts.requiredNumbers || spec.requiredFigures || [],
    safeZone: MOTION.safeZone,
  });

  const errors = [...res.errors];
  const warnings = [...res.warnings];

  // A spec layer that never made it to screen is as much a defect as an extra one:
  // the video silently dropped a claim it was authored to make.
  const drawn = new Set(manifest.layers.map((l) => `${l.scene}:${l.id}`));
  for (const key of Object.keys(specText)) {
    if (!drawn.has(key)) errors.push(`spec layer "${key}" was never drawn`);
  }
  if (manifest.generativeVideoCalls !== 0) errors.push("a generative video provider was invoked; this pipeline is $0 by design");
  if (manifest.generativeImageCalls !== 0) {
    warnings.push(`${manifest.generativeImageCalls} generative image call(s) were made for this render`);
  }
  return { ok: errors.length === 0, errors, warnings, checked: res.checked };
}

/** LEVEL 3, the machine half: geometry and frame sanity, from data already held. */
export function verifyLayout(manifest) {
  const errors = [];
  const warnings = [];
  const z = MOTION.safeZone;

  for (const l of manifest.layers) {
    if (l.box.w > 1 - z.left - z.right + 1e-6) {
      errors.push(`scene ${l.scene} "${l.id}" is wider than the safe zone allows`);
    }
    // Hand-lettered caps below ~2.2% of frame height stop being readable on a phone.
    if (l.box.h < 0.022) warnings.push(`scene ${l.scene} "${l.id}" is only ${(l.box.h * 100).toFixed(1)}% of frame height; likely too small to read`);
  }

  // Two layers overlapping while both on screen reads as broken layering.
  for (let i = 0; i < manifest.layers.length; i++) {
    for (let j = i + 1; j < manifest.layers.length; j++) {
      const a = manifest.layers[i];
      const b = manifest.layers[j];
      if (a.scene !== b.scene) continue;
      const timeOverlap = a.fromSec < b.toSec - 0.05 && b.fromSec < a.toSec - 0.05;
      if (!timeOverlap) continue;
      const ox = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
      const oy = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
      if (ox > 0 && oy > 0) {
        const area = ox * oy;
        const smaller = Math.min(a.box.w * a.box.h, b.box.w * b.box.h);
        if (area / smaller > 0.12) {
          errors.push(`scene ${a.scene}: "${a.id}" and "${b.id}" overlap by ${Math.round((area / smaller) * 100)}% while both visible`);
        }
      }
    }
  }

  // A CTA the viewer cannot act on is a wasted video.
  const ctaLayers = manifest.layers.filter((l) => (l.role || "").includes("CTA"));
  if (ctaLayers.length) {
    const held = Math.max(...ctaLayers.map((l) => l.toSec - l.fromSec));
    if (held < 2.0) errors.push(`the CTA is only held ${held.toFixed(1)}s; too short to read and act on`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

async function extractFrame(file, atSec, outPath) {
  const ffmpeg = require("ffmpeg-static");
  await new Promise((resolve, reject) => {
    const proc = spawn(
      ffmpeg,
      ["-y", "-hide_banner", "-ss", atSec.toFixed(3), "-i", file, "-frames:v", "1", "-q:v", "2", outPath],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`frame grab at ${atSec}s failed: ${err.slice(-500)}`))));
    proc.on("error", reject);
  });
  return outPath;
}

/**
 * LEVEL 3, the look-at-it half. Grabs a frame per beat plus mid-scene samples,
 * flags blank frames from real pixels, and tiles everything into one sheet.
 */
export async function visualQa(file, spec, outDir, opts = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const times = [];
  let cursor = 0;
  for (const scene of spec.scenes) {
    // Just after the scene settles, and just before it cuts.
    times.push({ t: Math.min(cursor + scene.durationSec * 0.55, cursor + scene.durationSec - 0.1), label: `s${scene.index}-mid` });
    times.push({ t: cursor + Math.max(0.08, scene.durationSec - 0.12), label: `s${scene.index}-end` });
    cursor += scene.durationSec;
  }

  const errors = [];
  const warnings = [];
  const frames = [];
  for (const { t, label } of times) {
    const p = path.join(outDir, `${label}.jpg`);
    await extractFrame(file, t, p);
    const stats = await sharp(p).stats();
    const mean = stats.channels.reduce((a, c) => a + c.mean, 0) / stats.channels.length;
    const stdev = stats.channels.reduce((a, c) => a + c.stdev, 0) / stats.channels.length;
    // A near-white frame with almost no variation is a blank page: nothing drew.
    if (mean > 252 && stdev < 4) errors.push(`frame at ${t.toFixed(2)}s (${label}) is blank`);
    else if (stdev < 12) warnings.push(`frame at ${t.toFixed(2)}s (${label}) has very little contrast (stdev ${stdev.toFixed(1)})`);
    frames.push({ file: p, t, label, mean: Math.round(mean * 10) / 10, stdev: Math.round(stdev * 10) / 10 });
  }

  const cols = opts.cols || 6;
  const cellW = 300;
  const cellH = Math.round((cellW * RENDER.height) / RENDER.width);
  const rows = Math.ceil(frames.length / cols);
  const composites = [];
  for (let i = 0; i < frames.length; i++) {
    const buf = await sharp(frames[i].file).resize(cellW - 8, cellH - 8).toBuffer();
    composites.push({ input: buf, left: (i % cols) * cellW + 4, top: Math.floor(i / cols) * cellH + 4 });
  }
  const sheet = path.join(outDir, "contact-sheet.jpg");
  await sharp({ create: { width: cols * cellW, height: rows * cellH, channels: 3, background: "#333333" } })
    .composite(composites)
    .jpeg({ quality: 88 })
    .toFile(sheet);

  return { ok: errors.length === 0, errors, warnings, contactSheet: sheet, frames };
}

/**
 * Is the artwork actually MOVING, or is this a slideshow of stills?
 *
 * The acceptance test for a handwritten-motion video is that the illustration
 * feels alive, and that is measurable: sample two frames 0.2s apart inside each
 * scene and look at the mean absolute difference. Observed on the first finished
 * POC: 0.71 to 15.2 across the nine scenes, with the low end being a deliberate
 * micro-hold before a reveal. Identical frames (a true static slide) measure
 * around 0.05, which is JPEG noise, so the threshold below separates cleanly.
 * It is a floor on liveliness, not a target: more motion is not better.
 */
export async function verifyMotionPresence(file, spec, workDir, opts = {}) {
  const threshold = opts.threshold ?? MOTION.minInterFrameMad;
  const gapSec = opts.gapSec ?? 0.2;
  fs.mkdirSync(workDir, { recursive: true });
  const errors = [];
  const scenes = [];
  let cursor = 0;
  for (const scene of spec.scenes) {
    const pairs = [];
    for (const at of [0.3, 0.6]) {
      const t0 = cursor + scene.durationSec * at;
      if (t0 + gapSec > cursor + scene.durationSec) continue;
      const a = path.join(workDir, `mad-${scene.index}-${at}-a.jpg`);
      const b = path.join(workDir, `mad-${scene.index}-${at}-b.jpg`);
      await extractFrame(file, t0, a);
      await extractFrame(file, t0 + gapSec, b);
      pairs.push(Math.round((await meanAbsDiff(a, b)) * 100) / 100);
    }
    const best = pairs.length ? Math.max(...pairs) : 0;
    scenes.push({ scene: scene.index, roles: scene.roles, mad: pairs, best });
    if (!(scene.roles || []).includes("END_CARD") && best < threshold) {
      errors.push(
        `scene ${scene.index} barely changes (max inter-frame difference ${best} over ${gapSec}s, floor ${threshold}); it is a static slide, not motion`
      );
    }
    cursor += scene.durationSec;
  }
  return { ok: errors.length === 0, errors, warnings: [], scenes };
}

async function meanAbsDiff(fileA, fileB) {
  // Downscaled greyscale: measuring whether the picture changed, not by how much
  // at full resolution, and it keeps the check fast enough to always run.
  const read = (f) => sharp(f).greyscale().resize(270, 480, { fit: "fill" }).raw().toBuffer();
  const [a, b] = await Promise.all([read(fileA), read(fileB)]);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Every distinct figure the finished video states, straight from the manifest.
 * The founder-facing answer to "are the numbers right". */
export function figuresOnScreen(manifest) {
  const out = new Map();
  for (const l of manifest.layers) {
    for (const n of screenNumberTokens(l.text)) {
      if (!out.has(n)) out.set(n, []);
      out.get(n).push({ scene: l.scene, text: l.text, atSec: l.fromSec });
    }
  }
  return out;
}
