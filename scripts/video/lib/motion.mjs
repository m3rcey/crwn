// Motion primitives: what turns an accepted still into a video.
//
// Every primitive is a pure function of TIME, so frame 217 is computable without
// frames 0..216 and the same spec always produces the same pixels. That is the
// HyperFrames property (seek to a frame, capture it) without a browser in the
// frame loop: the geometry is arithmetic here, and lib/motionRender.mjs turns it
// into sharp composites.
//
// The vocabulary is chosen to SERVE THE SCRIPT, not to decorate it:
//   marker line drawing itself      DRAW_ON on a text or shape sprite
//   circles / underlines / arrows   sprite states stepped by progress
//   stack of records growing        GROW on the stack plate (bottom-up reveal)
//   crowd multiplying               WIPE on the crowd plate
//   a lone collector appearing      POP / ENTER on the single-figure plate
//   price reveal                    POP with an overshoot, on a beat
//   numeric counter                 COUNTER over fact-locked values
//   push / pull / pan / punch       a camera over the whole composed sheet
//   emphasis                        SHAKE, decaying, used sparingly
//
// Nothing here is random. `SHAKE` is a decaying sine, jitter is seeded, and no
// primitive reads the wall clock.

import { ease } from "./easing.mjs";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Local progress of a motion inside a scene, 0 before it starts, 1 after. */
export function progressAt(motion, tInScene) {
  const start = motion.startSec ?? 0;
  const dur = motion.durSec ?? 0.4;
  if (dur <= 0) return tInScene >= start ? 1 : 0;
  return clamp01((tInScene - start) / dur);
}

/** An overshoot that settles: a marker pressed down hard and released. Used by
 * POP so an emphasised figure lands rather than fades in. */
export function overshoot(p, amount = 0.14) {
  if (p >= 1) return 1;
  const e = ease("easeOutCubic", p);
  return e + Math.sin(Math.PI * clamp01(p)) * amount * (1 - p);
}

/**
 * Where and how visible a TEXT sprite is at this moment.
 * Returns null when the layer is not on screen yet.
 *
 * @param {object} layer resolved text layer (see motionSpec.resolveTextLayer)
 * @param {{width:number,height:number}} sprite sprite pixel size
 * @param {{width:number,height:number}} sheet composition canvas size
 * @param {number} tInScene
 */
export function textPlacement(layer, sprite, sheet, tInScene) {
  const m = layer.motion || { kind: "FADE" };
  const p = progressAt(m, tInScene);
  if (p <= 0) return null;

  const anchorX = layer.x * sheet.width;
  const anchorY = layer.y * sheet.height;
  let scale = 1;
  let dx = 0;
  let dy = 0;
  let opacity = 1;
  // A DRAW_ON is a horizontal reveal of the finished stroke: the marker moving
  // left to right across the words.
  let revealX = 1;

  switch (m.kind) {
    case "DRAW_ON":
      revealX = p;
      break;
    case "POP":
      scale = 0.82 + 0.18 * overshoot(p);
      opacity = Math.min(1, p * 3);
      break;
    case "FADE":
      opacity = ease("easeOutCubic", p);
      break;
    case "SLIDE": {
      const e = ease("easeOutQuint", p);
      const dist = (m.distance ?? 0.08) * sheet.width;
      const dir = m.from || "left";
      if (dir === "left") dx = -dist * (1 - e);
      else if (dir === "right") dx = dist * (1 - e);
      else if (dir === "up") dy = -dist * (1 - e);
      else dy = dist * (1 - e);
      opacity = Math.min(1, p * 4);
      break;
    }
    case "COUNTER":
    case "STATES":
    case "HOLD":
    default:
      break;
  }

  // A held emphasis: decaying shake, only where the spec asks for it.
  if (m.shake) {
    const since = tInScene - (m.startSec ?? 0);
    const life = m.shakeDurSec ?? 0.35;
    if (since >= 0 && since < life) {
      const decay = 1 - since / life;
      const amp = (m.shake ?? 0.004) * sheet.width * decay;
      dx += Math.sin(since * 58) * amp;
      dy += Math.cos(since * 71) * amp * 0.6;
    }
  }

  const w = sprite.width * scale;
  const h = sprite.height * scale;
  const left = anchorX - w / 2 + dx;
  const top = anchorY - h / 2 + dy;
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    opacity,
    revealX,
    // Normalized box, for the manifest and the safe-zone check.
    box: {
      x: left / sheet.width,
      y: top / sheet.height,
      w: w / sheet.width,
      h: h / sheet.height,
    },
  };
}

/**
 * Which state of a multi-state sprite is showing. COUNTER walks a fact-locked
 * list of values; STATES walks pre-rendered progress frames (a circle drawing
 * itself). Both step deterministically, and both hold the final state.
 */
export function stateIndexAt(motion, tInScene, stateCount) {
  const p = progressAt(motion, tInScene);
  const eased = ease(motion.easing || "easeOutCubic", p);
  const i = Math.floor(eased * stateCount);
  return Math.max(0, Math.min(stateCount - 1, i));
}

/**
 * Where and how visible a PLATE is at this moment.
 * `place` is normalized to the sheet: x/y is the CENTRE, w the width; height
 * follows the plate's own aspect so an illustration is never stretched.
 */
export function platePlacement(entry, plate, sheet, tInScene, sceneDur) {
  const place = entry.place || { x: 0.5, y: 0.5, w: 1.0 };
  const m = entry.motion || { kind: "HOLD" };
  const p = progressAt({ startSec: m.startSec ?? 0, durSec: m.durSec ?? sceneDur }, tInScene);
  if ((m.kind === "POP" || m.kind === "ENTER") && p <= 0) return null;

  let scale = 1;
  let dx = 0;
  let dy = 0;
  let opacity = 1;
  let reveal = null; // {axis:'y'|'x', from:'start'|'end', amount:0..1}

  switch (m.kind) {
    case "DRIFT": {
      // The living-still baseline: a slow scale so nothing is ever frozen.
      const amt = m.amount ?? 0.04;
      scale = 1 + amt * ease("linear", tInScene / Math.max(0.001, sceneDur));
      break;
    }
    case "PUSH": {
      const amt = m.amount ?? 0.12;
      scale = 1 + amt * ease(m.easing || "easeInOutCubic", p);
      break;
    }
    case "PULL": {
      const amt = m.amount ?? 0.12;
      scale = 1 + amt * (1 - ease(m.easing || "easeInOutCubic", p));
      break;
    }
    case "PAN": {
      const amt = (m.amount ?? 0.06) * sheet.width;
      const e = ease(m.easing || "easeInOutCubic", p);
      dx = (m.direction === "right" ? 1 : -1) * amt * (e - 0.5) * 2;
      scale = 1 + (m.zoom ?? 0.05);
      break;
    }
    case "PUNCH": {
      scale = 1 + (m.amount ?? 0.08) * overshoot(p, 0.35);
      break;
    }
    case "POP": {
      scale = 0.86 + 0.14 * overshoot(p, 0.2);
      opacity = Math.min(1, p * 3.5);
      break;
    }
    case "ENTER": {
      const e = ease(m.easing || "easeOutQuint", p);
      const dist = (m.distance ?? 0.25) * sheet.width;
      const dir = m.from || "bottom";
      if (dir === "left") dx = -dist * (1 - e);
      else if (dir === "right") dx = dist * (1 - e);
      else if (dir === "top") dy = -dist * (1 - e);
      else dy = dist * (1 - e);
      break;
    }
    case "GROW": {
      // The stack of records growing: the plate is revealed from its base up, so
      // sleeves appear to pile on. Nothing is scaled, so the line work stays sharp.
      reveal = { axis: "y", from: "end", amount: ease(m.easing || "easeOutCubic", p) };
      break;
    }
    case "WIPE": {
      // The crowd multiplying: figures appear across the plate in one direction.
      reveal = {
        axis: m.axis === "x" ? "x" : "y",
        from: m.from === "end" ? "end" : "start",
        amount: ease(m.easing || "easeOutCubic", p),
      };
      break;
    }
    case "HOLD":
    default:
      break;
  }

  const w = place.w * sheet.width * scale;
  const h = w / plate.aspect;
  const left = place.x * sheet.width - w / 2 + dx;
  const top = place.y * sheet.height - h / 2 + dy;
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(2, Math.round(w)),
    height: Math.max(2, Math.round(h)),
    opacity,
    reveal,
    z: entry.z ?? 10,
  };
}

/**
 * The camera over the composed sheet. zoom 1.0 shows the whole sheet; the sheet
 * is larger than the output, so zoom up to MOTION.maxZoom crops into real pixels
 * instead of upscaling.
 */
export function cameraAt(camera, tInScene, sceneDur) {
  const base = { cx: 0.5, cy: 0.5, zoom: 1.0 };
  if (!camera) return base;
  const from = { ...base, ...(camera.from || {}) };
  const to = { ...from, ...(camera.to || {}) };
  const t = sceneDur > 0 ? clamp01(tInScene / sceneDur) : 1;
  const p = ease(camera.easing || "easeInOutCubic", t);
  return {
    cx: from.cx + (to.cx - from.cx) * p,
    cy: from.cy + (to.cy - from.cy) * p,
    zoom: from.zoom + (to.zoom - from.zoom) * p,
  };
}
