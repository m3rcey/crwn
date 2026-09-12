// The V2 frame builder: one SVG per frame, rasterized by sharp/librsvg.
//
// Why SVG rather than the V1 sharp-composite loop, and rather than a browser:
// librsvg is already a dependency and was capability-probed for exactly the
// vocabulary premium motion needs (nested and matrix transforms, soft gradient
// masks, clipPath, stroke-dashoffset, feTurbulence displacement, per-plane
// opacity). It does all of it, at 1080x1920, in roughly 150-210 ms a frame once
// subjects are pre-sized. That buys parallax, 2.5D tilts and real handwriting
// reveals without a Chromium download and without a second renderer bypassing
// the fact lock, the music rotation, the ledger or the job machinery.
//
// Composition happens at NATIVE output size. V1 composed on a 1.4x sheet and
// then cropped with a camera, which is where the "composite runs after resize"
// bug lived and why composition was whatever coordinates got typed. Here the
// layout owns the frame and the camera is a transform over it.
//
// Chrome is still used, once per job, for lettering sprites: exact strings stay
// the repo's own responsibility.

import fs from "node:fs";
import sharp from "sharp";
import { RENDER, MOTION } from "../config.mjs";
import { resolveLayout, placeArt, scatterField, SAFE } from "./composition.mjs";
import {
  artState,
  cameraAt,
  parallaxOffset,
  populationState,
  counterIndex,
  strokeProgress,
  windowProgress,
  sustainDelta,
  wobble,
} from "./sceneMotion.mjs";

const W = RENDER.width;
const H = RENDER.height;
const FRAME_ASPECT = W / H;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const n = (v) => (Math.round(v * 100) / 100).toString();

/** Normalized box -> pixel box. */
const px = (b) => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });

/**
 * Pre-size an asset to the largest size it will actually occupy, then base64 it
 * once for the whole scene. The per-frame cost of an <image> is its DECODE, so
 * embedding a 3500px hero for a 900px slot was measured at 500 ms a frame
 * against 207 ms for pre-sized art. Same picture, less than half the time.
 */
async function embed(file, targetPxWidth) {
  const meta = await sharp(file).metadata();
  const want = Math.min(meta.width, Math.max(32, Math.ceil(targetPxWidth * 1.12)));
  const buf =
    want >= meta.width
      ? fs.readFileSync(file)
      : await sharp(file).resize({ width: want }).png({ compressionLevel: 6 }).toBuffer();
  const m = await sharp(buf).metadata();
  return { uri: `data:image/png;base64,${buf.toString("base64")}`, width: m.width, height: m.height };
}

/** The one filter set every scene shares: marker roughness for drawn elements. */
function defsPrelude() {
  const r = MOTION.lettering.roughness;
  return `<filter id="mk" x="-6%" y="-30%" width="112%" height="160%" filterUnits="objectBoundingBox">
<feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="11" result="nz"/>
<feDisplacementMap in="SourceGraphic" in2="nz" scale="${n(r * 2.2)}" xChannelSelector="R" yChannelSelector="G"/>
</filter>`;
}

/**
 * A reveal whose leading edge is SOFT.
 *
 * V1 revealed text by extracting a rectangle of the finished sprite, so a
 * headline mid-reveal ended in a hard vertical edge through a glyph and read as
 * cut-off text rather than as writing. A gradient mask with a feathered edge
 * reads as ink arriving.
 */
function revealMask(id, boxPx, progress, feather = 0.09) {
  const p = Math.max(0, Math.min(1, progress));
  const edge = Math.max(0.0001, Math.min(1, p));
  const soft = Math.min(feather, edge);
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="${n(boxPx.x - 4)}" y="${n(boxPx.y - 4)}" width="${n(boxPx.w + 8)}" height="${n(boxPx.h + 8)}">
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#fff"/>
<stop offset="${n(Math.max(0, edge - soft))}" stop-color="#fff"/>
<stop offset="${n(edge)}" stop-color="#000"/>
<stop offset="1" stop-color="#000"/>
</linearGradient>
<rect x="${n(boxPx.x - 4)}" y="${n(boxPx.y - 4)}" width="${n(boxPx.w + 8)}" height="${n(boxPx.h + 8)}" fill="url(#${id}g)"/>
</mask>`;
}

/** A hand-drawn rule: a slightly wavering line that draws along its own path. */
function rulePath(a, b, sag = 0.012) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return `M ${n(a.x)} ${n(a.y)} Q ${n(mx + nx * sag * W)} ${n(my + ny * sag * H)} ${n(b.x)} ${n(b.y)}`;
}

/** Approximate path length, so stroke-dashoffset can draw a fraction of it. */
function pathLen(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y) * 1.06;
}

/**
 * Prepare one scene: resolve its layout, place everything, pre-size every asset.
 * Returns a `draw(t)` that is a pure function of time.
 *
 * @param {object} scene
 * @param {{subjects: Map, sprites: Map, byLayer: Map, plates?: Map}} ctx
 */
export async function prepareScene(scene, ctx) {
  const layout = resolveLayout(scene.layout, scene.layoutOverrides || {});
  const dur = scene.durationSec;
  const camMaxZoom = Math.max(1, ...(scene.camera?.keys || [{ zoom: 1 }]).map((k) => k.zoom ?? 1));

  /** @type {Array<object>} */
  const prepared = [];

  // ---- single-subject art -------------------------------------------------
  for (const el of scene.art || []) {
    const slot = layout.slots[el.slot];
    if (!slot) throw new Error(`scene ${scene.index}: art "${el.id || el.subject}" uses unknown slot "${el.slot}"`);
    const rec = ctx.subjects.get(el.subject) || ctx.plates?.get(el.subject);
    if (!rec) throw new Error(`scene ${scene.index}: unknown subject "${el.subject}"`);
    const baseBox = placeArt(slot, rec.aspect, FRAME_ASPECT, {
      fit: el.fit,
      scale: el.scale,
      anchor: el.anchor,
    });
    const maxScale = 1 + (el.entrance?.overshoot ?? 0.1) + 0.05;
    const asset = await embed(rec.file, baseBox.w * W * maxScale * camMaxZoom);
    prepared.push({ kind: "art", el, baseBox, asset, z: el.z ?? 10, plane: el.plane ?? 1 });
  }

  // ---- populations: a real crowd from the isolated figure library ----------
  for (const el of scene.populations || []) {
    const slot = layout.slots[el.slot];
    if (!slot) throw new Error(`scene ${scene.index}: population "${el.id}" uses unknown slot "${el.slot}"`);
    const library = [...ctx.subjects.entries()]
      .filter(([id]) => id.startsWith(`${el.library}-`))
      .map(([, rec]) => rec)
      .filter((rec) => (el.minSourcePx ? rec.width >= el.minSourcePx : true))
      .sort((a, b) => b.inkArea - a.inkArea);
    if (!library.length) throw new Error(`scene ${scene.index}: population library "${el.library}" is empty`);

    const count = el.count ?? 24;
    // Item height is a share of the field; width follows each figure's aspect.
    const itemH = (el.itemHeight ?? 0.075) * H;
    // Inset the field by the item's own size before scattering. Items are drawn
    // from their BASE upward, so the top needs a full item of clearance and the
    // sides half a width. Without this a full-width field puts half figures
    // against the frame edge, which reads as clipped artwork rather than as a
    // crowd continuing past frame. `bleed` opts back in when that IS the intent.
    const maxAspect = Math.max(...library.map((r) => r.aspect), 0.4);
    const insetX = el.bleed ? 0 : ((itemH * maxAspect * (el.maxScale ?? 1)) / 2) / W;
    const insetY = el.bleed ? 0 : (itemH * (el.maxScale ?? 1)) / H;
    const field = scatterField(
      {
        x: slot.x + insetX,
        y: slot.y + insetY,
        w: Math.max(0.05, slot.w - insetX * 2),
        h: Math.max(0.05, slot.h - insetY),
      },
      count,
      {
        seed: el.seed ?? 7,
        cols: el.cols,
        jitter: el.jitter,
        minScale: el.minScale,
        maxScale: el.maxScale,
      }
    );
    const assets = [];
    for (const rec of library) {
      assets.push({ rec, asset: await embed(rec.file, (itemH * rec.aspect) * (el.maxScale ?? 1.0) * camMaxZoom) });
    }
    prepared.push({
      kind: "population",
      el,
      field,
      assets,
      itemH,
      z: el.z ?? 8,
      plane: el.plane ?? 0.6,
    });
  }

  // ---- deterministic lettering -------------------------------------------
  for (const el of scene.text || []) {
    const slot = layout.slots[el.slot];
    if (!slot) throw new Error(`scene ${scene.index}: text "${el.id}" uses unknown slot "${el.slot}"`);
    const hashes = ctx.byLayer.get(`${scene.index}:${el.id}`)?.hashes;
    if (!hashes) throw new Error(`scene ${scene.index}: text "${el.id}" has no lettering`);
    const states = [];
    for (const h of hashes) {
      const sp = ctx.sprites.get(h);
      if (!sp) throw new Error(`scene ${scene.index}: text "${el.id}" missing sprite ${h}`);
      const fitted = placeArt(slot, sp.width / sp.height, FRAME_ASPECT, { fit: "contain" });
      states.push({ hash: h, box: fitted, asset: await embed(sp.file, fitted.w * W * 1.15 * camMaxZoom) });
    }
    prepared.push({ kind: "text", el, states, z: el.z ?? 100, plane: 1, space: el.space || "screen" });
  }

  // ---- drawn marks: rules, underlines, circles, arrows --------------------
  for (const el of scene.marks || []) {
    const slot = layout.slots[el.slot];
    if (!slot) throw new Error(`scene ${scene.index}: mark "${el.id}" uses unknown slot "${el.slot}"`);
    // A mark annotates TYPE, so it has to be placed against the type's real box.
    // Sized to the slot, an underline lands at the slot's midline and a circle's
    // near edge crosses the letters: both read as a strikethrough. Text is fitted
    // INSIDE its slot, so the slot is almost never where the words actually are.
    let target = slot;
    const anchorId = el.anchorText || (scene.text || []).find((t) => t.slot === el.slot)?.id;
    if (anchorId) {
      const anchored = prepared.find((p) => p.kind === "text" && p.el.id === anchorId);
      if (anchored) target = anchored.states[0].box;
    }
    prepared.push({ kind: "mark", el, slot: target, z: el.z ?? 90, plane: el.plane ?? 1, space: el.space || "screen" });
  }

  prepared.sort((a, b) => a.z - b.z);

  const draw = (t) => {
    const cam = cameraAt(scene.camera, t, dur);
    const zoom = Math.min(Math.max(1, cam.zoom), MOTION.maxZoomV2 ?? 1.8);
    const fx = cam.cx * W;
    const fy = cam.cy * H;
    const camXf = `translate(${n(fx)},${n(fy)}) scale(${n(zoom)}) rotate(${n(cam.rot)}) translate(${n(-fx)},${n(-fy)})`;

    const defs = [defsPrelude()];
    // WORLD space rides the camera; SCREEN space does not.
    //
    // The camera exists to move ARTWORK. Putting lettering inside it meant a 1.10
    // push threw the top slot to y=0.015 and off the frame, which is both a
    // readability failure and a cage around the camera: any move big enough to
    // feel cinematic pushed words out. Titles are screen-space, so the artwork
    // can push, rack and pull as hard as the scene wants while every figure and
    // every number stays exactly where the layout put it.
    const world = [];
    const screen = [];

    for (const p of prepared) {
      const par = p.space === "screen" ? { dx: 0, dy: 0 } : parallaxOffset(cam, p.plane);
      const pdx = par.dx * W;
      const pdy = par.dy * H;
      const planeOpen = `<g transform="translate(${n(pdx)},${n(pdy)})">`;

      const body = p.space === "screen" ? screen : world;
      if (p.kind === "art") {
        const st = artState(p.el, p.baseBox, t, dur);
        if (!st || st.opacity <= 0.002) continue;
        const b = px(st);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h * (st.anchorY ?? 0.5);
        const sy = st.scaleY ?? 1;
        const tilt = p.el.tilt
          ? ` matrix(1,${n(p.el.tilt.skewY ?? 0)},${n(p.el.tilt.skewX ?? 0)},1,0,0)`
          : "";
        body.push(
          `${planeOpen}<g transform="translate(${n(cx)},${n(cy)}) rotate(${n(st.rot)}) scale(1,${n(sy)})${tilt} translate(${n(-cx)},${n(-cy)})" opacity="${n(st.opacity)}">` +
            `<image x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" href="${p.asset.uri}" preserveAspectRatio="none"/>` +
            `</g></g>`
        );
      } else if (p.kind === "population") {
        const items = populationState(p.field, p.el, t);
        if (!items.length) continue;
        const parts = [];
        for (const item of items) {
          const rec = p.assets[item.order % p.assets.length];
          const h = p.itemH * item.scale;
          const w = h * rec.rec.aspect;
          const x = (item.x + item.driftX) * W - w / 2;
          const y = (item.y + item.driftY) * H - h;
          parts.push(
            `<g transform="rotate(${n(item.rot)},${n(x + w / 2)},${n(y + h)})" opacity="${n(item.opacity)}">` +
              `<image x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" href="${rec.asset.uri}" preserveAspectRatio="none"/></g>`
          );
        }
        body.push(`${planeOpen}${parts.join("")}</g>`);
      } else if (p.kind === "text") {
        const el = p.el;
        const idx = el.motion?.kind === "COUNTER" ? counterIndex(el.motion, t, p.states.length) : 0;
        const state = p.states[idx];
        const st = artState({ ...el, entrance: el.entrance || textEntranceFor(el) }, state.box, t, dur);
        if (!st || st.opacity <= 0.002) continue;
        const b = px(st);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        let open = `<g transform="translate(${n(cx)},${n(cy)}) rotate(${n(st.rot)}) translate(${n(-cx)},${n(-cy)})" opacity="${n(st.opacity)}">`;
        let close = `</g>`;
        if (el.motion?.kind === "WRITE") {
          const prog = windowProgress(t, el.motion.startSec ?? 0, el.motion.durSec ?? 0.9, el.motion.easing || "inOutSine");
          if (prog < 0.999) {
            const mid = `wr${scene.index}_${el.id}`;
            defs.push(revealMask(mid, b, prog, el.motion.feather ?? 0.10));
            open = `<g mask="url(#${mid})">${open}`;
            close = `${close}</g>`;
          }
        }
        body.push(
          `${planeOpen}${open}<image x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" href="${state.asset.uri}" preserveAspectRatio="none"/>${close}</g>`
        );
      } else if (p.kind === "mark") {
        body.push(`${planeOpen}${drawMark(p, t, dur, scene)}</g>`);
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${defs.join("")}</defs>
<rect width="${W}" height="${H}" fill="${MOTION.paper}"/>
<g transform="${camXf}">${world.join("")}</g>
${screen.join("")}
</svg>`;
  };

  return { layout, draw, prepared };
}

/** Text gets a sensible default entrance so a scene never opens with nothing. */
function textEntranceFor(el) {
  if (el.motion?.kind === "WRITE") return { kind: "CUT", startSec: el.motion.startSec ?? 0, durSec: 0.001 };
  return {
    kind: "RISE",
    startSec: el.motion?.startSec ?? 0,
    durSec: el.motion?.durSec ?? 0.4,
    distance: 0.02,
    easing: "outCubic",
  };
}

/**
 * Drawn marks. These are SVG paths, not sprites, so they draw along their own
 * geometry: the divider grows downward, a circle closes around a number, an
 * arrow travels to where it points.
 */
function drawMark(p, t, dur, scene) {
  const el = p.el;
  const slot = px(p.slot);
  const prog = strokeProgress(el.motion || {}, t);
  if (prog <= 0.001) return "";
  const sw = (el.stroke ?? 0.009) * W;
  const ink = MOTION.ink;
  const common = `fill="none" stroke="${ink}" stroke-width="${n(sw)}" stroke-linecap="round" filter="url(#mk)"`;
  const breathe = 1 + wobble(el.id, t, 0.4) * 0.006;

  if (el.shape === "rule") {
    const vertical = el.orientation !== "horizontal";
    const a = vertical
      ? { x: slot.x + slot.w / 2, y: slot.y }
      : { x: slot.x, y: slot.y + slot.h / 2 };
    const b = vertical
      ? { x: slot.x + slot.w / 2, y: slot.y + slot.h * breathe }
      : { x: slot.x + slot.w * breathe, y: slot.y + slot.h / 2 };
    const L = pathLen(a, b);
    return `<path d="${rulePath(a, b, el.sag ?? 0.004)}" ${common} stroke-dasharray="${n(L)}" stroke-dashoffset="${n(L * (1 - prog))}"/>`;
  }
  if (el.shape === "underline") {
    // BELOW the words, with a little overhang either side, the way a hand does it.
    const over = slot.w * 0.03;
    const y = slot.y + slot.h + Math.max(6, slot.h * 0.16);
    const a = { x: slot.x - over, y };
    const b = { x: slot.x + slot.w + over, y: y - slot.h * 0.05 };
    const L = pathLen(a, b);
    return `<path d="${rulePath(a, b, el.sag ?? 0.012)}" ${common} stroke-dasharray="${n(L)}" stroke-dashoffset="${n(L * (1 - prog))}"/>`;
  }
  if (el.shape === "circle") {
    // AROUND the words: padded outward so the stroke never crosses a glyph.
    // Generous on the vertical, modest on the horizontal. A sprite box includes
    // ascender and descender space the ink does not fill, so a padding that looks
    // sufficient on paper still crosses the capitals.
    const padX = slot.w * (el.padX ?? 0.05) + sw * 2;
    const padY = slot.h * (el.padY ?? 0.80) + sw * 2;
    const rx = (slot.w / 2 + padX) * breathe;
    const ry = (slot.h / 2 + padY) * breathe;
    const cx = slot.x + slot.w / 2;
    const cy = slot.y + slot.h / 2;
    const L = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" ${common} stroke-dasharray="${n(L)}" stroke-dashoffset="${n(L * (1 - prog))}" transform="rotate(${n(el.rot ?? -2)},${n(cx)},${n(cy)})"/>`;
  }
  if (el.shape === "arrow") {
    // Offset clear of the type it points at, never across it.
    const gap = Math.max(8, slot.h * (el.gap ?? 0.55));
    const down = el.direction === "down";
    const a = down
      ? { x: slot.x + slot.w / 2, y: slot.y + slot.h + gap }
      : { x: slot.x - slot.w * 0.06, y: slot.y + slot.h + gap };
    const b = down
      ? { x: slot.x + slot.w / 2, y: slot.y + slot.h + gap * 3 }
      : { x: slot.x + slot.w * 1.06, y: slot.y + slot.h + gap * 0.9 };
    const tip = { x: a.x + (b.x - a.x) * prog, y: a.y + (b.y - a.y) * prog };
    const L = pathLen(a, b);
    const head =
      prog > 0.82
        ? down
          ? `<path d="M ${n(tip.x)} ${n(tip.y)} l ${n(-sw * 1.7)} ${n(-sw * 2.1)} M ${n(tip.x)} ${n(tip.y)} l ${n(sw * 1.7)} ${n(-sw * 2.1)}" ${common}/>`
          : `<path d="M ${n(tip.x)} ${n(tip.y)} l ${n(-sw * 2.1)} ${n(-sw * 1.7)} M ${n(tip.x)} ${n(tip.y)} l ${n(-sw * 2.1)} ${n(sw * 1.7)}" ${common}/>`
        : "";
    return `<path d="${rulePath(a, b, el.sag ?? 0.006)}" ${common} stroke-dasharray="${n(L)}" stroke-dashoffset="${n(L * (1 - prog))}"/>${head}`;
  }
  if (el.shape === "box") {
    const pad = (el.pad ?? 0.012) * W;
    const x0 = slot.x - pad;
    const y0 = slot.y - pad;
    const x1 = slot.x + slot.w + pad;
    const y1 = slot.y + slot.h + pad;
    // Seeded per corner, never random: a rerender must letter and draw identically.
    const j = (k) => (wobble(`${el.id}c${k}`, t, 0.2) * sw) / 2;
    const d = `M ${n(x0 + j(0))} ${n(y0 + j(1))} L ${n(x1 + j(2))} ${n(y0 + j(3))} L ${n(x1 + j(4))} ${n(y1 + j(5))} L ${n(x0 + j(6))} ${n(y1 + j(7))} Z`;
    const L = 2 * (x1 - x0 + y1 - y0);
    return `<path d="${d}" ${common} stroke-linejoin="round" stroke-dasharray="${n(L)}" stroke-dashoffset="${n(L * (1 - prog))}"/>`;
  }
  throw new Error(`scene ${scene.index}: unknown mark shape "${el.shape}"`);
}

export { FRAME_ASPECT, W as FRAME_W, H as FRAME_H, SAFE };
