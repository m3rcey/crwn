// The handwritten-motion renderer: spec + plates + lettering -> 1080x1920 MP4.
//
// Two properties drive the design:
//
//   SCENE-LEVEL REPAIR. Each scene is encoded to its own video-only segment,
//   keyed by a hash of everything that determines its pixels. Fixing one scene
//   re-encodes one segment and re-runs a stream-copy concat; the other 27 seconds
//   are never recomputed and never re-lettered. This is the answer to "a typo
//   costs a whole regeneration".
//
//   A RENDER MANIFEST, not OCR. Every text layer the renderer actually drew is
//   recorded with its string, its sprite hash, its geometry and its visible
//   window. Verification reads that, so proving the numbers are right is a
//   comparison against the fact lock rather than a model looking at pixels.
//
// Cost: $0. sharp composites, ffmpeg-static encodes, and the lettering cache
// means an unchanged rerender does not even launch a browser.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import sharp from "sharp";
import { RENDER, MOTION } from "../config.mjs";
import { encodeFrames } from "./render.mjs";
import { resolveTextLayer, sheetSize } from "./motionSpec.mjs";
import { spriteHash } from "./lettering.mjs";
import { textPlacement, platePlacement, cameraAt, progressAt, stateIndexAt } from "./motion.mjs";
import { factLockDigest } from "./factLock.mjs";

const require = createRequire(import.meta.url);

/** Plate motions that change the plate itself each frame. Everything else is a
 * still plate moved by the scene camera, which keeps the frame loop cheap and the
 * line work sharp. */
const ANIMATED_PLATE_MOTIONS = new Set(["POP", "ENTER", "GROW", "WIPE", "PUNCH"]);

/** Sprite requests for one resolved text layer. A COUNTER or a STATES motion
 * needs one sprite per state, and each of those states is real on-screen text,
 * so each is fact-checked by motionSpec before we get here. */
export function spriteRequestsForLayer(resolved, sheet) {
  const fontPx = Math.round(resolved.size * sheet.height);
  const strokePx = fontPx * MOTION.lettering.strokeRatio;
  const maxWidthPx = Math.round(resolved.w * sheet.width);
  const base = {
    kind: "text",
    family: resolved.family,
    fontPx,
    strokePx,
    maxWidthPx,
    align: resolved.align,
    box: resolved.box,
    underline: resolved.underline,
  };
  const m = resolved.motion || {};
  if (m.kind === "COUNTER" && Array.isArray(m.values)) {
    return m.values.map((v) => ({ ...base, text: String(v) }));
  }
  return [{ ...base, text: resolved.text }];
}

/** Sprite requests for a shape layer that draws itself (circle, underline, arrow). */
export function shapeRequests(shape, sheet) {
  const states = shape.states ?? 14;
  const widthPx = Math.round(shape.w * sheet.width);
  const heightPx = Math.round(shape.h * sheet.height);
  const strokePx = Math.max(4, Math.round((shape.stroke ?? 0.006) * sheet.width));
  return Array.from({ length: states }, (_, i) => ({
    kind: "shape",
    shape: shape.shape,
    widthPx,
    heightPx,
    strokePx,
    progress: Math.round((i / (states - 1)) * 1000) / 1000,
  }));
}

/** Everything the whole spec needs lettered, with a map back to the layer. */
export function collectSprites(spec) {
  const sheet = sheetSize(RENDER);
  const requests = [];
  /** @type {Map<string,{hashes:string[]}>} */
  const byLayer = new Map();
  for (const scene of spec.scenes) {
    for (const raw of scene.text || []) {
      const resolved = resolveTextLayer(raw);
      const reqs = spriteRequestsForLayer(resolved, sheet);
      const hashes = reqs.map((r) => spriteHash(r));
      reqs.forEach((r, i) => requests.push({ ...r, hash: hashes[i] }));
      byLayer.set(`${scene.index}:${raw.id}`, { hashes });
    }
    for (const shape of scene.shapes || []) {
      const reqs = shapeRequests(shape, sheet);
      const hashes = reqs.map((r) => spriteHash(r));
      reqs.forEach((r, i) => requests.push({ ...r, hash: hashes[i] }));
      byLayer.set(`${scene.index}:shape:${shape.id}`, { hashes });
    }
  }
  return { requests, byLayer, sheet };
}

/** Alpha-multiply a sprite so it can fade. dest-in keeps the sprite's own shape
 * and scales its alpha by the uniform mask, which is what a real fade is. */
async function withOpacity(buf, opacity, width, height) {
  if (opacity >= 0.995) return buf;
  return sharp(buf)
    .composite([
      {
        input: {
          create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: Math.max(0, opacity) } },
        },
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
}

/** Apply a directional reveal to an already-sized layer: return the visible
 * sub-rectangle and where to put it. This is the mechanism behind a marker line
 * drawing itself, a stack growing and a crowd multiplying. */
function revealRect(reveal, placement) {
  const { width, height, left, top } = placement;
  if (!reveal || reveal.amount >= 0.999) return { left, top, extract: null };
  const amt = Math.max(0, reveal.amount);
  if (reveal.axis === "x") {
    const w = Math.max(1, Math.round(width * amt));
    return reveal.from === "end"
      ? { left: left + (width - w), top, extract: { left: width - w, top: 0, width: w, height } }
      : { left, top, extract: { left: 0, top: 0, width: w, height } };
  }
  const h = Math.max(1, Math.round(height * amt));
  return reveal.from === "end"
    ? { left, top: top + (height - h), extract: { left: 0, top: height - h, width, height: h } }
    : { left, top, extract: { left: 0, top: 0, width, height: h } };
}

/** A sheet-normalized box as the camera actually frames it, in output-normalized
 * coordinates. Exported so a test can pin the transform without rendering. */
export function toScreenBox(box, cam) {
  const zoom = Math.min(Math.max(1, cam.zoom), MOTION.maxZoom);
  const vp = 1 / zoom;
  const vpLeft = Math.min(Math.max(0, cam.cx - vp / 2), 1 - vp);
  const vpTop = Math.min(Math.max(0, cam.cy - vp / 2), 1 - vp);
  return {
    x: (box.x - vpLeft) * zoom,
    y: (box.y - vpTop) * zoom,
    w: box.w * zoom,
    h: box.h * zoom,
  };
}

export function unionBox(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/** A raw buffer handed between sharp calls carries its geometry OUT OF BAND, so a
 * wrong channel count is not an error, it is a silently sheared image. Every raw
 * handoff is checked here: the failure mode this catches (the whole sheet ghost-
 * tiled across the frame) passed structural, fact and layout verification and was
 * only visible by looking. Cheap assertion, whole class of bug closed. */
export function assertRaw({ data, info }, what) {
  const expected = info.width * info.height * info.channels;
  if (data.length !== expected) {
    throw new Error(
      `${what}: raw buffer is ${data.length} bytes but ${info.width}x${info.height}x${info.channels} needs ${expected}`
    );
  }
  return data;
}

/** Bump when the compositing maths changes. The segment cache exists to skip
 * re-encoding scenes whose PIXELS cannot have changed, so it has to be keyed on
 * the renderer as well as on the spec: a compositing fix once left 7 correct-
 * looking segments on disk that had been drawn with the wrong geometry. */
export const RENDER_ENGINE_VERSION = 3;

/** What determines this scene's pixels. Change any of it and the segment is stale. */
export function sceneSegmentHash(scene, plateMap, byLayer) {
  const plateFiles = (scene.plates || []).map((p) => plateMap.get(p.plate)?.file || "?");
  const spriteHashes = [
    ...(scene.text || []).map((t) => byLayer.get(`${scene.index}:${t.id}`)?.hashes.join(",") || "?"),
    ...(scene.shapes || []).map((s) => byLayer.get(`${scene.index}:shape:${s.id}`)?.hashes.join(",") || "?"),
  ];
  return crypto
    .createHash("sha1")
    .update(
      JSON.stringify([
        RENDER_ENGINE_VERSION,
        scene,
        plateFiles,
        spriteHashes,
        RENDER.width,
        RENDER.height,
        RENDER.fps,
        RENDER.crf,
        RENDER.preset,
        MOTION.sheetScale,
        MOTION.paper,
      ])
    )
    .digest("hex")
    .slice(0, 16);
}

/**
 * The manifest rows for one scene: which strings are on screen, when, and where
 * the camera actually puts them.
 *
 * The ONE place manifest geometry is computed. renderScene calls it rather than
 * measuring while it composites, so the cheap geometry probe and the real render
 * can never disagree about where a line landed: a probe that says PASS and a
 * render that puts words off the edge would be worse than no probe.
 *
 * Pure: no image work, no filesystem, no encoder. Sprite sizes come in from the
 * lettering cache, which is why this is free to run.
 */
export function computeSceneRows(scene, { sheet, spriteMap, byLayer }) {
  const fps = RENDER.fps;
  const frames = Math.round(scene.durationSec * fps);
  /** @type {Map<string,{min:number,max:number,box:object,hash:string}>} */
  const seen = new Map();

  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    const cam = cameraAt(scene.camera, t, scene.durationSec);
    for (const raw of scene.text || []) {
      const resolved = resolveTextLayer(raw);
      const hashes = byLayer.get(`${scene.index}:${raw.id}`).hashes;
      const m = resolved.motion || {};
      const stateIdx = m.kind === "COUNTER" ? stateIndexAt(m, t, hashes.length) : 0;
      const sp = spriteMap.get(hashes[stateIdx]);
      const place = textPlacement(resolved, sp, sheet, t);
      if (!place) continue;
      const onScreen = toScreenBox(place.box, cam);
      const key = `${scene.index}:${raw.id}`;
      const prior = seen.get(key);
      if (!prior) seen.set(key, { min: t, max: t, box: onScreen, hash: hashes[stateIdx] });
      else {
        prior.max = t;
        prior.box = unionBox(prior.box, onScreen);
      }
    }
  }

  const rows = [];
  for (const raw of scene.text || []) {
    const s = seen.get(`${scene.index}:${raw.id}`);
    if (!s) continue;
    rows.push({
      scene: scene.index,
      id: raw.id,
      text: raw.text,
      claim: raw.claim || null,
      role: (scene.roles || []).join("+"),
      box: {
        x: Math.round(s.box.x * 10000) / 10000,
        y: Math.round(s.box.y * 10000) / 10000,
        w: Math.round(s.box.w * 10000) / 10000,
        h: Math.round(s.box.h * 10000) / 10000,
      },
      fromSec: Math.round(s.min * 100) / 100,
      toSec: Math.round((s.max + 1 / fps) * 100) / 100,
      spriteHash: s.hash,
    });
  }
  return rows;
}

/** The whole manifest without drawing anything: the fast half of the feedback
 * loop. Geometry and fact checks answer in under a second, so composition is
 * iterated before a two-minute encode, not after it. */
export function dryRunManifest(spec, ctx) {
  const layers = [];
  for (const scene of spec.scenes) layers.push(...computeSceneRows(scene, ctx));
  return {
    slug: spec.slug,
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
  };
}

/**
 * Render one scene to a video-only MP4 segment, and return the manifest rows for
 * the text it drew.
 */
async function renderScene(scene, ctx) {
  const { sheet, plateMap, spriteMap, byLayer, segDir, log } = ctx;
  const fps = RENDER.fps;
  const frames = Math.round(scene.durationSec * fps);
  const outPath = path.join(segDir, `scene-${String(scene.index).padStart(2, "0")}.mp4`);

  // Still plates go into a base composited once. Only genuinely animated plates
  // and the lettering are recomputed per frame.
  const still = [];
  const animated = [];
  for (const entry of scene.plates || []) {
    const kind = entry.motion?.kind || "HOLD";
    (ANIMATED_PLATE_MOTIONS.has(kind) ? animated : still).push(entry);
  }

  const baseComposites = [];
  for (const entry of [...still].sort((a, b) => (a.z ?? 10) - (b.z ?? 10))) {
    const plate = plateMap.get(entry.plate);
    const pl = platePlacement(entry, plate, sheet, scene.durationSec, scene.durationSec);
    const buf = await sharp(plate.file).resize(pl.width, pl.height, { fit: "fill" }).png().toBuffer();
    baseComposites.push({ input: buf, left: pl.left, top: pl.top });
  }
  // removeAlpha() BEFORE raw(): compositing plates that carry alpha promotes the
  // canvas to 4 bands, and reading that buffer back as 3 channels shears every
  // row by a third of a pixel, which renders as the whole sheet ghost-tiled
  // across the frame. It looked like a compositing bug and was a bookkeeping one.
  const baseOut = await sharp({
    create: { width: sheet.width, height: sheet.height, channels: 3, background: MOTION.paper },
  })
    .composite(baseComposites)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const base = assertRaw(baseOut, "scene base");

  const spriteBufs = new Map();
  for (const [hash, s] of spriteMap) spriteBufs.set(hash, fs.readFileSync(s.file));

  const frameFor = async (f) => {
    const t = f / fps;
    const composites = [];

    for (const entry of animated.sort((a, b) => (a.z ?? 10) - (b.z ?? 10))) {
      const plate = plateMap.get(entry.plate);
      const pl = platePlacement(entry, plate, sheet, t, scene.durationSec);
      if (!pl) continue;
      let buf = await sharp(plate.file).resize(pl.width, pl.height, { fit: "fill" }).png().toBuffer();
      const rect = revealRect(pl.reveal, pl);
      if (rect.extract) buf = await sharp(buf).extract(rect.extract).png().toBuffer();
      buf = await withOpacity(buf, pl.opacity, rect.extract?.width || pl.width, rect.extract?.height || pl.height);
      composites.push({ input: buf, left: rect.left, top: rect.top });
    }

    // Shapes that draw themselves sit under the words they mark.
    for (const shape of scene.shapes || []) {
      const hashes = byLayer.get(`${scene.index}:shape:${shape.id}`).hashes;
      const motion = shape.motion || { kind: "STATES", startSec: 0, durSec: 0.6 };
      if (progressAt(motion, t) <= 0) continue;
      const idx = stateIndexAt(motion, t, hashes.length);
      const sp = spriteMap.get(hashes[idx]);
      composites.push({
        input: spriteBufs.get(hashes[idx]),
        left: Math.round(shape.x * sheet.width - sp.width / 2),
        top: Math.round(shape.y * sheet.height - sp.height / 2),
      });
    }

    for (const raw of (scene.text || []).slice().sort((a, b) => (a.z ?? 100) - (b.z ?? 100))) {
      const resolved = resolveTextLayer(raw);
      const hashes = byLayer.get(`${scene.index}:${raw.id}`).hashes;
      const m = resolved.motion || {};
      const stateIdx = m.kind === "COUNTER" ? stateIndexAt(m, t, hashes.length) : 0;
      const sp = spriteMap.get(hashes[stateIdx]);
      const place = textPlacement(resolved, sp, sheet, t);
      if (!place) continue;

      let buf = spriteBufs.get(hashes[stateIdx]);
      if (place.width !== sp.width || place.height !== sp.height) {
        buf = await sharp(buf).resize(place.width, place.height, { fit: "fill" }).png().toBuffer();
      }
      let left = place.left;
      const top = place.top;
      let vw = place.width;
      if (place.revealX < 0.999) {
        vw = Math.max(1, Math.round(place.width * place.revealX));
        buf = await sharp(buf).extract({ left: 0, top: 0, width: vw, height: place.height }).png().toBuffer();
      }
      buf = await withOpacity(buf, place.opacity, vw, place.height);
      composites.push({ input: buf, left, top });
    }

    const cam = cameraAt(scene.camera, t, scene.durationSec);
    const zoom = Math.min(Math.max(1, cam.zoom), MOTION.maxZoom);
    const vpW = Math.round(sheet.width / zoom);
    const vpH = Math.round(sheet.height / zoom);
    const left = Math.min(Math.max(0, Math.round(cam.cx * sheet.width - vpW / 2)), sheet.width - vpW);
    const top = Math.min(Math.max(0, Math.round(cam.cy * sheet.height - vpH / 2)), sheet.height - vpH);

    // TWO PASSES, deliberately. sharp applies composite AFTER resize in one
    // pipeline, so chaining .composite().extract().resize() places every sprite
    // onto the already-downscaled frame at sheet coordinates. That silently
    // mis-positioned every layer until a sprite wider than the output made it
    // throw. Compose the sheet first, then point the camera at the result.
    const composed = await sharp(base, { raw: { width: sheet.width, height: sheet.height, channels: 3 } })
      .composite(composites)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assertRaw(composed, "composed sheet");
    return sharp(composed.data, {
      raw: { width: composed.info.width, height: composed.info.height, channels: composed.info.channels },
    })
      .extract({ left, top, width: vpW, height: vpH })
      .resize(RENDER.width, RENDER.height, { kernel: "lanczos3" })
      .removeAlpha()
      .raw()
      .toBuffer();
  };

  await encodeFrames({
    totalFrames: frames,
    durationSec: scene.durationSec,
    frameFor,
    outPath,
    music: null,
    onProgress: (i, total) => log(`  scene ${scene.index}: frame ${i}/${total}`),
  });

  return { outPath, frames, rows: computeSceneRows(scene, ctx) };
}

/**
 * Which scenes have to be re-encoded and which can be reused as they are.
 *
 * The whole economics of a fix lives in this function: a scene is reused when a
 * segment exists whose recorded hash still matches what the spec + plates +
 * sprites + renderer would produce. `onlyScenes` forces a rebuild of exactly the
 * named scenes, so a founder can repair one beat without touching the rest.
 *
 * @param {object} spec
 * @param {{ plateMap: Map, byLayer: Map, segDir: string, onlyScenes?: number[],
 *           exists?: (p:string)=>boolean, readState?: (p:string)=>object }} opts
 *   exists/readState are injectable so this is testable without a filesystem.
 */
export function planSegments(spec, opts) {
  const exists = opts.exists || ((p) => fs.existsSync(p));
  const readState = opts.readState || ((p) => JSON.parse(fs.readFileSync(p, "utf-8")));
  const targeted = Boolean(opts.onlyScenes && opts.onlyScenes.length);
  const out = new Map();
  for (const scene of spec.scenes) {
    const hash = sceneSegmentHash(scene, opts.plateMap, opts.byLayer);
    const seg = path.join(opts.segDir, `scene-${String(scene.index).padStart(2, "0")}.mp4`);
    const stateFile = `${seg}.json`;
    const forced = targeted && opts.onlyScenes.includes(scene.index);
    let reuse = false;
    if (!forced && exists(seg) && exists(stateFile)) {
      let state = null;
      try {
        state = readState(stateFile);
      } catch {
        state = null; // an unreadable state file means rebuild, never trust it
      }
      reuse = Boolean(state && state.hash === hash);
    }
    out.set(scene.index, { seg, stateFile, hash, reuse, forced });
  }
  return out;
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
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-1500)}`))));
    proc.on("error", reject);
  });
}

/**
 * Render (or repair) a motion video.
 *
 * @param {object} spec validated motion spec
 * @param {{
 *   plateMap: Map<string,{file:string,width:number,height:number,aspect:number}>,
 *   spriteMap: Map<string,{file:string,width:number,height:number}>,
 *   byLayer: Map<string,{hashes:string[]}>,
 *   sheet: {width:number,height:number},
 *   music: { trackPath: string, segmentStart?: number }|null,
 *   outDir: string,
 *   lock: import('./factLock.mjs').FactLock,
 *   onlyScenes?: number[],
 *   log?: Function,
 * }} ctx
 */
export async function renderMotionVideo(spec, ctx) {
  const log = ctx.log || (() => {});
  const segDir = path.join(ctx.outDir, "segments");
  fs.mkdirSync(segDir, { recursive: true });

  const manifestRows = [];
  const segments = [];
  let reused = 0;
  let rendered = 0;

  const plan = planSegments(spec, {
    plateMap: ctx.plateMap,
    byLayer: ctx.byLayer,
    segDir,
    onlyScenes: ctx.onlyScenes,
  });

  for (const scene of spec.scenes) {
    const { seg, stateFile, reuse } = plan.get(scene.index);
    if (reuse) {
      manifestRows.push(...JSON.parse(fs.readFileSync(stateFile, "utf-8")).rows);
      segments.push(seg);
      reused++;
      continue;
    }
    const hash = sceneSegmentHash(scene, ctx.plateMap, ctx.byLayer);
    log(`scene ${scene.index} [${(scene.roles || []).join("+")}] ${scene.durationSec}s -> rendering`);
    const res = await renderScene(scene, { ...ctx, segDir, log: () => {} });
    fs.writeFileSync(stateFile, JSON.stringify({ hash, rows: res.rows, frames: res.frames }, null, 2));
    manifestRows.push(...res.rows);
    segments.push(seg);
    rendered++;
  }
  log(`segments: ${rendered} rendered, ${reused} reused unchanged`);

  // Stream-copy concat: the scenes that did not change are not re-encoded, so a
  // one-scene repair costs one scene.
  const listFile = path.join(segDir, "concat.txt");
  fs.writeFileSync(listFile, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n"));
  const silentPath = path.join(ctx.outDir, "render", "video-only.mp4");
  fs.mkdirSync(path.dirname(silentPath), { recursive: true });
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", silentPath]);

  const finalPath = path.join(ctx.outDir, "render", "final.mp4");
  const durationSec = spec.scenes.reduce((a, s) => a + s.durationSec, 0);
  if (ctx.music) {
    const { buildAudioFilter } = await import("./render.mjs");
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
      "-movflags", "+faststart",
      "-shortest",
      finalPath,
    ]);
  } else {
    fs.copyFileSync(silentPath, finalPath);
  }

  const manifest = {
    slug: spec.slug,
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
  };
  return { finalPath, silentPath, manifest, rendered, reused };
}
