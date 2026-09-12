// Visual QA that would have failed V1.
//
// V1 passed structural, fact and layout verification and was still rejected on
// sight. That is a QA failure as much as a design failure, and these are the
// specific holes:
//
//   - occupancy was never measured. Measured after the fact, V1 averaged 10.8%
//     ink and a content bounding box covering 43% of the frame.
//   - frames were sampled twice per scene, at 55% and just before the cut: the
//     two moments a scene looks its fullest. Scene openings, which were blank,
//     were never sampled. One V1 frame was 0.0% ink and the check was green.
//   - hero scale was never checked, so a subject rendered at 12% of frame height
//     was indistinguishable from one rendered at 60%.
//   - "motion" was satisfied by a line of text appearing, so a slideshow with
//     accumulating captions read as animated.
//
// Every check here measures REAL PIXELS from the rendered video, densely, and a
// scene may declare an override with a stated reason rather than being forced
// into a shape that does not suit it.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import sharp from "sharp";
import { RENDER, MOTION } from "../config.mjs";
import { SAFE } from "./composition.mjs";

const require = createRequire(import.meta.url);
const QA = () => MOTION.qa;

async function extractFrame(file, atSec, outPath) {
  const ffmpeg = require("ffmpeg-static");
  await new Promise((resolve, reject) => {
    const proc = spawn(
      ffmpeg,
      ["-y", "-hide_banner", "-ss", atSec.toFixed(3), "-i", file, "-frames:v", "1", "-q:v", "3", outPath],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`frame grab at ${atSec}s failed: ${err.slice(-400)}`))));
    proc.on("error", reject);
  });
  return outPath;
}

/**
 * Measure one frame: how much ink, where the content sits, and how much of the
 * frame its bounding box covers. Analysis runs on a downscale because these are
 * questions about composition, not about pixels.
 */
export async function measureFrame(file, opts = {}) {
  const AW = opts.width ?? 216;
  const AH = opts.height ?? 384;
  const { data, info } = await sharp(file).greyscale().resize(AW, AH, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const cut = opts.inkCut ?? 200;
  let ink = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  // Row and column ink profiles, for finding accidental empty bands.
  const rows = new Float32Array(info.height);
  const cols = new Float32Array(info.width);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] < cut) {
        ink++;
        rows[y]++;
        cols[x]++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const total = info.width * info.height;
  const hasInk = maxY >= 0;
  const bbox = hasInk
    ? {
        x: minX / info.width,
        y: minY / info.height,
        w: (maxX - minX + 1) / info.width,
        h: (maxY - minY + 1) / info.height,
      }
    : { x: 0, y: 0, w: 0, h: 0 };

  // The largest fully-empty horizontal band, as a fraction of frame height. A
  // big one in the middle of a composition is the "wasted canvas" defect.
  let worstBand = { start: 0, end: 0, size: 0 };
  let runStart = -1;
  for (let y = 0; y <= info.height; y++) {
    const empty = y < info.height && rows[y] === 0;
    if (empty && runStart === -1) runStart = y;
    if (!empty && runStart !== -1) {
      const size = (y - runStart) / info.height;
      if (size > worstBand.size) worstBand = { start: runStart / info.height, end: y / info.height, size };
      runStart = -1;
    }
  }

  return {
    ink: ink / total,
    coverage: hasInk ? bbox.w * bbox.h : 0,
    bbox,
    worstEmptyBand: worstBand,
    rowsProfile: Array.from(rows, (v) => v / info.width),
  };
}

/** Mean absolute difference between two frames, downscaled. */
export async function frameDiff(a, b) {
  const read = (f) => sharp(f).greyscale().resize(216, 384, { fit: "fill" }).raw().toBuffer();
  const [x, y] = await Promise.all([read(a), read(b)]);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return s / x.length;
}

/**
 * TEMPORAL SAFETY: sample every scene densely and judge each scene against its
 * own layout contract.
 *
 * @param {string} file rendered mp4
 * @param {object} spec
 * @param {{layouts: Map<number,{occupancy:number,hero:string}>, workDir: string, log?: Function}} ctx
 */
export async function auditVideo(file, spec, ctx) {
  const qa = QA();
  const step = qa.sampleStepSec;
  fs.mkdirSync(ctx.workDir, { recursive: true });
  const errors = [];
  const warnings = [];
  const scenes = [];

  let cursor = 0;
  let prevFramePath = null;
  for (const scene of spec.scenes) {
    const layout = ctx.layouts.get(scene.index) || { occupancy: 0.5 };
    const qaOverride = scene.qa || {};
    const minInk = qaOverride.minInkFraction ?? qa.minInkFraction;
    const minCoverage = qaOverride.minContentCoverage ?? Math.min(qa.minContentCoverage, layout.occupancy + 0.02);
    const samples = [];
    const dur = scene.durationSec;

    for (let t = 0; t < dur - 1e-6; t += step) {
      const at = cursor + Math.min(t, dur - 0.02);
      const p = path.join(ctx.workDir, `s${String(scene.index).padStart(2, "0")}-${t.toFixed(2)}.jpg`);
      await extractFrame(file, at, p);
      const m = await measureFrame(p);
      const diff = prevFramePath ? await frameDiff(prevFramePath, p) : null;
      samples.push({ t: Math.round(t * 100) / 100, at: Math.round(at * 100) / 100, file: p, ...m, diff });
      prevFramePath = p;
    }

    const isEndCard = (scene.roles || []).includes("END_CARD");

    // FRAME OCCUPANCY + EMPTY-SPACE ANOMALY
    const inks = samples.map((s) => s.ink);
    const covers = samples.map((s) => s.coverage);
    const meanInk = inks.reduce((a, b) => a + b, 0) / inks.length;
    const meanCover = covers.reduce((a, b) => a + b, 0) / covers.length;

    // The first sample is the scene's opening frame: V1's worst moments.
    const opening = samples[0];
    if (!isEndCard && opening.ink < minInk * 0.6) {
      errors.push(
        `scene ${scene.index} OPENS nearly empty (${(opening.ink * 100).toFixed(1)}% ink at its first frame); ` +
          `something must already be on screen when a scene begins`
      );
    }
    const starved = samples.filter((s) => s.ink < minInk);
    if (!isEndCard && starved.length > samples.length * 0.34) {
      errors.push(
        `scene ${scene.index} is mostly empty paper: ${starved.length}/${samples.length} sampled frames under ` +
          `${(minInk * 100).toFixed(1)}% ink (mean ${(meanInk * 100).toFixed(1)}%)` +
          (qaOverride.reason ? "" : `. If the whitespace is intentional, set scene.qa.minInkFraction with a reason.`)
      );
    }
    if (!isEndCard && meanCover < minCoverage) {
      const msg =
        `scene ${scene.index} content covers only ${(meanCover * 100).toFixed(0)}% of the frame on average, ` +
        `against ${(minCoverage * 100).toFixed(0)}% for layout ${scene.layout}`;
      if (qaOverride.reason) warnings.push(`${msg} (allowed: ${qaOverride.reason})`);
      else errors.push(msg);
    }
    const bigBand = samples.filter((s) => s.worstEmptyBand.size > 0.3 && s.ink > 0.01);
    if (bigBand.length > samples.length * 0.5 && !qaOverride.allowEmptyBand) {
      warnings.push(
        `scene ${scene.index} keeps a blank horizontal band of ${(bigBand[0].worstEmptyBand.size * 100).toFixed(0)}% ` +
          `of frame height (around y=${bigBand[0].worstEmptyBand.start.toFixed(2)}); check it is deliberate`
      );
    }

    // TEMPORAL MOTION: not "did anything change once" but "is it ever static".
    const diffs = samples.map((s) => s.diff).filter((d) => d !== null);
    const deadRun = longestRunBelow(diffs, qa.minInterFrameMad);
    const deadSec = deadRun * step;
    if (!scene.roles?.includes("END_CARD") && deadSec > qa.maxDeadRunSec) {
      errors.push(
        `scene ${scene.index} sits visually still for ${deadSec.toFixed(1)}s ` +
          `(${deadRun} consecutive samples under ${qa.minInterFrameMad} MAD); the frame must keep moving`
      );
    }

    scenes.push({
      scene: scene.index,
      layout: scene.layout,
      beat: scene.beat,
      durationSec: dur,
      meanInk: Math.round(meanInk * 1000) / 1000,
      meanCoverage: Math.round(meanCover * 1000) / 1000,
      openingInk: Math.round(opening.ink * 1000) / 1000,
      minInkSample: Math.round(Math.min(...inks) * 1000) / 1000,
      maxDeadRunSec: Math.round(deadSec * 100) / 100,
      samples: samples.map((s) => ({ t: s.t, ink: Math.round(s.ink * 1000) / 1000, coverage: Math.round(s.coverage * 1000) / 1000, diff: s.diff === null ? null : Math.round(s.diff * 100) / 100 })),
      sampleFiles: samples.map((s) => s.file),
    });
    cursor += dur;
  }

  const meanInkAll = scenes.reduce((a, s) => a + s.meanInk * s.durationSec, 0) / Math.max(1e-9, cursor);
  const meanCoverAll = scenes.reduce((a, s) => a + s.meanCoverage * s.durationSec, 0) / Math.max(1e-9, cursor);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    meanInk: Math.round(meanInkAll * 1000) / 1000,
    meanCoverage: Math.round(meanCoverAll * 1000) / 1000,
    scenes,
  };
}

function longestRunBelow(values, threshold) {
  let best = 0;
  let run = 0;
  for (const v of values) {
    if (v < threshold) {
      run++;
      if (run > best) best = run;
    } else run = 0;
  }
  return best;
}

/**
 * BOUNDING BOX SAFETY, TEXT SIZE, SUBJECT SCALE and COLLISION, from the manifest
 * rather than from pixels: the manifest is produced by the same placement code
 * the renderer uses, so it is exact, and it covers every sampled instant.
 */
export function auditGeometry(manifest, spec) {
  const qa = QA();
  const errors = [];
  const warnings = [];
  const sceneById = new Map(spec.scenes.map((s) => [s.index, s]));

  for (const l of manifest.layers) {
    const scene = sceneById.get(l.scene);
    const el = (scene?.text || []).find((t) => t.id === l.id);
    const tag = `scene ${l.scene} text "${l.id}"`;

    if (el?.bleed !== true && !contains(SAFE.text, l.box)) {
      errors.push(
        `${tag} leaves the text-safe area: [${l.box.x.toFixed(3)},${l.box.y.toFixed(3)},` +
          `${l.box.w.toFixed(3)},${l.box.h.toFixed(3)}]`
      );
    }
    const minH = el?.minHeight ?? qa.minTextHeight;
    if (l.box.h < minH) {
      errors.push(`${tag} renders ${(l.box.h * 100).toFixed(1)}% of frame height, under the ${(minH * 100).toFixed(1)}% readable floor`);
    }
  }

  // SUBJECT SCALE: a hero that renders small is the V1 defect.
  for (const h of manifest.heroes || []) {
    if (!h.isHero) continue;
    const scene = sceneById.get(h.scene ?? -1);
    const allow = scene?.qa?.minHeroHeight ?? qa.minHeroHeight;
    if (h.box.h < allow) {
      errors.push(
        `hero "${h.id}" in slot "${h.slot}" renders only ${(h.box.h * 100).toFixed(0)}% of frame height ` +
          `(floor ${(allow * 100).toFixed(0)}%); a hero this small is why V1 looked empty`
      );
    }
  }

  // COLLISION: text over text, and text over a hero subject.
  for (let i = 0; i < manifest.layers.length; i++) {
    for (let j = i + 1; j < manifest.layers.length; j++) {
      const a = manifest.layers[i];
      const b = manifest.layers[j];
      if (a.scene !== b.scene) continue;
      if (!(a.fromSec < b.toSec - 0.05 && b.fromSec < a.toSec - 0.05)) continue;
      const area = overlapArea(a.box, b.box);
      const smaller = Math.min(a.box.w * a.box.h, b.box.w * b.box.h);
      if (smaller > 0 && area / smaller > 0.1) {
        errors.push(`scene ${a.scene}: text "${a.id}" and "${b.id}" overlap ${Math.round((area / smaller) * 100)}% while both visible`);
      }
    }
  }
  for (const l of manifest.layers) {
    const scene = sceneById.get(l.scene);
    const el = (scene?.text || []).find((t) => t.id === l.id);
    if (el?.overArt === true) continue; // declared deliberate
    // EVERY art box, not just the hero's. Two scenes put a line of type inside a
    // backdrop crowd band and the words were unreadable against the figures; the
    // hero-only version of this check did not look at populations at all.
    for (const h of (manifest.heroes || []).filter((x) => x.scene === l.scene)) {
      const area = overlapArea(l.box, h.box);
      const textArea = l.box.w * l.box.h;
      if (textArea <= 0) continue;
      const frac = area / textArea;
      if (frac > 0.6) {
        errors.push(
          `scene ${l.scene}: text "${l.id}" sits over ${Math.round(frac * 100)}% of ` +
            `${h.population ? "population" : "art"} "${h.id}"; move it, or set overArt:true with a reason`
        );
      } else if (frac > 0.35) {
        warnings.push(
          `scene ${l.scene}: text "${l.id}" overlaps ${Math.round(frac * 100)}% of "${h.id}"; ` +
            `set overArt:true if that is the design`
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, checked: manifest.layers.length };
}

function overlapArea(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function contains(outer, inner, tol = 1e-6) {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.w <= outer.x + outer.w + tol &&
    inner.y + inner.h <= outer.y + outer.h + tol
  );
}

/** A dense contact sheet: every sampled frame, in order, for the human pass. */
export async function contactSheet(audit, outFile, opts = {}) {
  const files = audit.scenes.flatMap((s) => s.sampleFiles);
  const cols = opts.cols ?? Math.ceil(Math.sqrt(files.length * 1.9));
  const cw = opts.cellWidth ?? 150;
  const ch = Math.round((cw * RENDER.height) / RENDER.width);
  const rows = Math.ceil(files.length / cols);
  const comps = [];
  for (let i = 0; i < files.length; i++) {
    const buf = await sharp(files[i]).resize(cw - 3, ch - 3).toBuffer();
    comps.push({ input: buf, left: (i % cols) * cw + 1, top: Math.floor(i / cols) * ch + 1 });
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await sharp({ create: { width: cols * cw, height: rows * ch, channels: 3, background: "#303030" } })
    .composite(comps)
    .jpeg({ quality: 86 })
    .toFile(outFile);
  return { file: outFile, frames: files.length, cols, rows };
}
