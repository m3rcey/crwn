// V2 render orchestration: layout-driven SVG frames -> per-scene segments -> MP4.
//
// Everything that worked in V1 is kept and reused: the fact lock, the per-scene
// segment cache keyed by a content hash (so a fix costs one scene), the render
// manifest as the proof of what was drawn, the shared ffmpeg encoder, the music
// rotation, the job directory. What changed is the frame builder and, crucially,
// where the manifest's geometry comes from: V1 reported the box it intended,
// computed from a sheet it then cropped. V2 reports the box the LAYOUT placed,
// through the same camera the renderer uses, so the manifest is a statement
// about the actual picture.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import sharp from "sharp";
import { RENDER, MOTION } from "../config.mjs";
import { encodeFrames, buildAudioFilter } from "./render.mjs";
import { spriteHash } from "./lettering.mjs";
import { resolveLayout, placeArt } from "./composition.mjs";
import { prepareScene, FRAME_ASPECT, FRAME_W, FRAME_H } from "./svgFrame.mjs";
import { cameraAt, counterIndex, artState, windowProgress } from "./sceneMotion.mjs";
import { factLockDigest } from "./factLock.mjs";

const require = createRequire(import.meta.url);

/** Bump when frame geometry changes, so the segment cache cannot serve frames
 * drawn by an older compositor. V1 learned this the hard way. */
export const RENDER_ENGINE_VERSION_V2 = 1;

/**
 * Font size for a text layer, derived from its SLOT rather than typed.
 *
 * Height-based alone makes a long line shrink-to-fit down to something small, so
 * the width estimate is taken too and the smaller wins. Patrick Hand averages
 * about 0.52 em of advance per character in caps, measured off the sprite
 * metrics the lettering cache already stores.
 */
export function fontPxForSlot(text, slotBox) {
  const lines = String(text).split("\n");
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const byHeight = ((slotBox.h * FRAME_H) / lines.length) * 0.80;
  const byWidth = (slotBox.w * FRAME_W * 0.96) / (longest * 0.52);
  return Math.max(18, Math.round(Math.min(byHeight, byWidth)));
}

/** Every lettering sprite the spec needs, sized from its layout slot. */
export function collectSpritesV2(spec) {
  const requests = [];
  /** @type {Map<string,{hashes:string[]}>} */
  const byLayer = new Map();
  for (const scene of spec.scenes) {
    const layout = resolveLayout(scene.layout, scene.layoutOverrides || {});
    for (const el of scene.text || []) {
      const slot = layout.slots[el.slot];
      if (!slot) throw new Error(`scene ${scene.index}: text "${el.id}" uses unknown slot "${el.slot}"`);
      const fontPx = el.fontPx ?? fontPxForSlot(el.text, slot);
      const base = {
        kind: "text",
        family: el.family || MOTION.letterFamily,
        fontPx,
        strokePx: fontPx * (el.weight === "heavy" ? MOTION.lettering.strokeRatio * 1.35 : MOTION.lettering.strokeRatio),
        maxWidthPx: Math.round(slot.w * FRAME_W * 0.98),
        align: "center",
        box: Boolean(el.boxed),
        underline: false,
      };
      const texts = el.motion?.kind === "COUNTER" && Array.isArray(el.motion.values) ? el.motion.values.map(String) : [el.text];
      const hashes = [];
      for (const text of texts) {
        const req = { ...base, text };
        const h = spriteHash(req);
        requests.push({ ...req, hash: h });
        hashes.push(h);
      }
      byLayer.set(`${scene.index}:${el.id}`, { hashes });
    }
  }
  return { requests, byLayer };
}

/**
 * Manifest rows for one scene, from the SAME placement and camera code the
 * renderer uses. Sampled densely (every sampleStepSec) and unioned, so a box
 * that only leaves the safe area momentarily is still caught.
 */
export function computeSceneRowsV2(scene, ctx) {
  const layout = resolveLayout(scene.layout, scene.layoutOverrides || {});
  const step = MOTION.qa.sampleStepSec;
  const rows = [];
  for (const el of scene.text || []) {
    const slot = layout.slots[el.slot];
    const hashes = ctx.byLayer.get(`${scene.index}:${el.id}`).hashes;
    let min = null;
    let max = null;
    let acc = null;
    let hash = hashes[0];
    for (let t = 0; t <= scene.durationSec + 1e-9; t += step) {
      const idx = el.motion?.kind === "COUNTER" ? counterIndex(el.motion, t, hashes.length) : 0;
      const sp = ctx.sprites.get(hashes[idx]);
      const fitted = placeArt(slot, sp.width / sp.height, FRAME_ASPECT, { fit: "contain" });
      const ent = el.entrance || defaultTextEntrance(el);
      const st = artState({ ...el, entrance: ent }, fitted, t, scene.durationSec);
      if (!st || st.opacity <= 0.02) continue;
      // Lettering is SCREEN space by default, so the camera does not move it and
      // its layout box IS its on-screen box. A layer explicitly put in world
      // space is reported through the camera instead.
      const raw = { x: st.x, y: st.y, w: st.w, h: st.h };
      const onScreen =
        (el.space || "screen") === "screen"
          ? raw
          : throughCamera(raw, cameraAt(scene.camera, t, scene.durationSec));
      if (min === null) min = t;
      max = t;
      hash = hashes[idx];
      acc = acc ? unionBox(acc, onScreen) : onScreen;
    }
    if (min === null) continue;
    rows.push({
      scene: scene.index,
      id: el.id,
      text: el.text,
      claim: el.claim || null,
      role: (scene.roles || []).join("+"),
      slot: el.slot,
      layout: layout.name,
      box: round4(acc),
      fromSec: round2(min),
      toSec: round2(Math.min(scene.durationSec, max + step)),
      spriteHash: hash,
    });
  }
  return rows;
}

function defaultTextEntrance(el) {
  if (el.motion?.kind === "WRITE") return { kind: "CUT", startSec: el.motion.startSec ?? 0, durSec: 0.001 };
  return { kind: "RISE", startSec: el.motion?.startSec ?? 0, durSec: el.motion?.durSec ?? 0.4, distance: 0.02 };
}

export function throughCamera(box, cam) {
  const zoom = Math.min(Math.max(1, cam.zoom), MOTION.maxZoomV2);
  // The SVG camera scales about (cx,cy), so a point maps as
  //   out = focus + (p - focus) * zoom
  const fx = cam.cx;
  const fy = cam.cy;
  return {
    x: fx + (box.x - fx) * zoom,
    y: fy + (box.y - fy) * zoom,
    w: box.w * zoom,
    h: box.h * zoom,
  };
}

export function unionBox(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

const round2 = (v) => Math.round(v * 100) / 100;
const round4 = (b) => ({
  x: Math.round(b.x * 10000) / 10000,
  y: Math.round(b.y * 10000) / 10000,
  w: Math.round(b.w * 10000) / 10000,
  h: Math.round(b.h * 10000) / 10000,
});

/** Where the HERO art of a scene lands on screen, for the hero-scale check. */
export function heroBoxes(scene, ctx) {
  const layout = resolveLayout(scene.layout, scene.layoutOverrides || {});
  const out = [];
  for (const el of scene.art || []) {
    const rec = ctx.subjects.get(el.subject) || ctx.plates?.get(el.subject);
    if (!rec) continue;
    const slot = layout.slots[el.slot];
    const b = placeArt(slot, rec.aspect, FRAME_ASPECT, { fit: el.fit, scale: el.scale, anchor: el.anchor });
    out.push({ scene: scene.index, id: el.id || el.subject, slot: el.slot, isHero: el.slot === layout.hero, box: round4(b) });
  }
  for (const el of scene.populations || []) {
    const slot = layout.slots[el.slot];
    out.push({ scene: scene.index, id: el.id, slot: el.slot, isHero: el.slot === layout.hero, box: round4(slot), population: true });
  }
  return out;
}

export function sceneSegmentHashV2(scene, ctx) {
  const assetIds = [
    ...(scene.art || []).map((a) => (ctx.subjects.get(a.subject) || ctx.plates?.get(a.subject))?.file || "?"),
    ...(scene.populations || []).flatMap((p) =>
      [...ctx.subjects.keys()].filter((k) => k.startsWith(`${p.library}-`)).map((k) => ctx.subjects.get(k).file)
    ),
  ];
  const spriteHashes = (scene.text || []).map((t) => ctx.byLayer.get(`${scene.index}:${t.id}`)?.hashes.join(",") || "?");
  // The RESOLVED LAYOUT is part of the hash, not just the layout's name.
  // A scene stores "HERO_AND_CLUSTER", so editing that layout's slot geometry
  // changes every frame it draws while leaving the scene JSON identical: the
  // cache would then serve segments composed to the old geometry. Same class of
  // bug as forgetting the engine version, caught the moment a layout was tuned
  // mid-render.
  const layout = resolveLayout(scene.layout, scene.layoutOverrides || {});
  return crypto
    .createHash("sha1")
    .update(
      JSON.stringify([
        RENDER_ENGINE_VERSION_V2,
        scene,
        layout,
        assetIds,
        spriteHashes,
        RENDER.width,
        RENDER.height,
        RENDER.fps,
        RENDER.crf,
        RENDER.preset,
        MOTION.paper,
        MOTION.ink,
        MOTION.maxZoomV2,
      ])
    )
    .digest("hex")
    .slice(0, 16);
}

export function planSegmentsV2(spec, opts) {
  const exists = opts.exists || ((p) => fs.existsSync(p));
  const readState = opts.readState || ((p) => JSON.parse(fs.readFileSync(p, "utf-8")));
  const targeted = Boolean(opts.onlyScenes && opts.onlyScenes.length);
  const out = new Map();
  for (const scene of spec.scenes) {
    const hash = sceneSegmentHashV2(scene, opts);
    const seg = path.join(opts.segDir, `scene-${String(scene.index).padStart(2, "0")}.mp4`);
    const stateFile = `${seg}.json`;
    const forced = targeted && opts.onlyScenes.includes(scene.index);
    let reuse = false;
    if (!forced && exists(seg) && exists(stateFile)) {
      let state = null;
      try {
        state = readState(stateFile);
      } catch {
        state = null;
      }
      reuse = Boolean(state && state.hash === hash);
    }
    out.set(scene.index, { seg, stateFile, hash, reuse, forced });
  }
  return out;
}

async function renderSceneSegment(scene, ctx, outPath, onFrame) {
  const prep = await prepareScene(scene, ctx);
  const frames = Math.round(scene.durationSec * RENDER.fps);
  await encodeFrames({
    totalFrames: frames,
    durationSec: scene.durationSec,
    outPath,
    music: null,
    onProgress: onFrame,
    frameFor: async (f) => {
      const svg = prep.draw(f / RENDER.fps);
      const { data, info } = await sharp(Buffer.from(svg))
        .flatten({ background: MOTION.paper })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const expected = info.width * info.height * info.channels;
      if (data.length !== expected) {
        throw new Error(`scene ${scene.index} frame ${f}: raw buffer ${data.length} != ${expected}`);
      }
      return data;
    },
  });
  return { frames, layout: prep.layout };
}

function runFfmpeg(args) {
  const ffmpeg = require("ffmpeg-static");
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-10000);
    });
    proc.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}: ${err.slice(-1500)}`))));
    proc.on("error", reject);
  });
}

/**
 * Render (or repair) a V2 video.
 * @param {object} spec
 * @param {object} ctx { subjects, plates, sprites, byLayer, music, outDir, lock, onlyScenes, log }
 */
export async function renderMotionVideoV2(spec, ctx) {
  const log = ctx.log || (() => {});
  const segDir = path.join(ctx.outDir, "segments");
  fs.mkdirSync(segDir, { recursive: true });

  const plan = planSegmentsV2(spec, { ...ctx, segDir, onlyScenes: ctx.onlyScenes });
  const manifestRows = [];
  const heroRows = [];
  const segments = [];
  let rendered = 0;
  let reused = 0;

  for (const scene of spec.scenes) {
    const { seg, stateFile, hash, reuse } = plan.get(scene.index);
    if (reuse) {
      const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      manifestRows.push(...state.rows);
      heroRows.push(...(state.heroes || []));
      segments.push(seg);
      reused++;
      continue;
    }
    const t0 = Date.now();
    log(`scene ${scene.index} [${(scene.roles || []).join("+")}] ${scene.durationSec}s ${scene.layout} -> rendering`);
    await renderSceneSegment(scene, ctx, seg, () => {});
    const rows = computeSceneRowsV2(scene, ctx);
    const heroes = heroBoxes(scene, ctx);
    fs.writeFileSync(stateFile, JSON.stringify({ hash, rows, heroes, frames: Math.round(scene.durationSec * RENDER.fps) }, null, 2));
    manifestRows.push(...rows);
    heroRows.push(...heroes);
    segments.push(seg);
    rendered++;
    log(`  scene ${scene.index} done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  log(`segments: ${rendered} rendered, ${reused} reused unchanged`);

  const listFile = path.join(segDir, "concat.txt");
  fs.writeFileSync(listFile, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n"));
  const silentPath = path.join(ctx.outDir, "render", "video-only.mp4");
  fs.mkdirSync(path.dirname(silentPath), { recursive: true });
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-dn", "-movflags", "+faststart", silentPath]);

  const finalPath = path.join(ctx.outDir, "render", "final.mp4");
  const durationSec = spec.scenes.reduce((a, s) => a + s.durationSec, 0);
  if (ctx.music) {
    await runFfmpeg([
      "-y",
      "-i", silentPath,
      "-ss", String(ctx.music.segmentStart || 0),
      "-t", durationSec.toFixed(3),
      "-i", ctx.music.trackPath,
      "-filter_complex", `[1:a]${buildAudioFilter(durationSec)}[a]`,
      "-map", "0:v",
      "-map", "[a]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-dn",
      "-map_chapters", "-1",
      "-movflags", "+faststart",
      "-shortest",
      finalPath,
    ]);
  } else {
    fs.copyFileSync(silentPath, finalPath);
  }

  return {
    finalPath,
    silentPath,
    rendered,
    reused,
    manifest: {
      slug: spec.slug,
      version: 2,
      generatedAt: new Date().toISOString(),
      factLockDigest: factLockDigest(ctx.lock),
      durationSec: Math.round(durationSec * 1000) / 1000,
      width: RENDER.width,
      height: RENDER.height,
      fps: RENDER.fps,
      scenesRendered: rendered,
      scenesReused: reused,
      generativeImageCalls: 0,
      generativeVideoCalls: 0,
      layers: manifestRows,
      heroes: heroRows,
    },
  };
}

/** A manifest without drawing anything: the fast half of the loop, kept from V1. */
export function dryRunManifestV2(spec, ctx) {
  const layers = [];
  const heroes = [];
  for (const scene of spec.scenes) {
    layers.push(...computeSceneRowsV2(scene, ctx));
    heroes.push(...heroBoxes(scene, ctx));
  }
  return {
    slug: spec.slug,
    version: 2,
    generatedAt: new Date().toISOString(),
    factLockDigest: factLockDigest(ctx.lock),
    durationSec: spec.scenes.reduce((a, s) => a + s.durationSec, 0),
    width: RENDER.width,
    height: RENDER.height,
    fps: RENDER.fps,
    scenesRendered: 0,
    scenesReused: 0,
    generativeImageCalls: 0,
    generativeVideoCalls: 0,
    dryRun: true,
    layers,
    heroes,
  };
}
