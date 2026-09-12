// The V2 motion vocabulary. Pure functions of time; frame 1500 is computable
// without frame 1499.
//
// The defect this module exists to fix: in V1 every primitive mapped progress to
// a final state and then held. Text arrived and stopped; plates popped and
// stopped; the only thing still moving after ~1.5s was a 5% camera zoom. So each
// scene became a still with text accumulating on it, which is exactly what the
// founder saw. Measured: 28 of 60 sampled frames under 45% content coverage and
// four frames essentially blank, one of them completely.
//
// Three changes:
//
//   1. ENTRANCE and SUSTAIN are separate. Every element can carry a sustain that
//      runs for the whole scene, so nothing is ever frozen. Sustains are slow and
//      small: the point is that the paper is alive, not that things jiggle.
//   2. DEPTH. Elements sit on planes with a parallax factor, so a camera move
//      separates foreground from background instead of sliding a flat картинка.
//   3. ANTICIPATION and EXIT. A scene can lean in before it cuts and push its
//      content out, so boundaries are authored instead of flashing empty paper.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const EASE = {
  linear: (t) => t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  // A settle with one soft overshoot. Deterministic, and gentler than a bounce
  // preset: it lands at 1 and stays there.
  outBack: (t) => {
    const c = 1.34;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  // Critically-damped-ish spring, for weight without wobble.
  spring: (t) => {
    if (t >= 1) return 1;
    return 1 - Math.exp(-6.2 * t) * Math.cos(5.2 * t) * (1 - t);
  },
  // Holds, then goes. Used entering a reveal.
  holdThenGo: (t) => (t < 0.22 ? 0 : 1 - Math.pow(1 - (t - 0.22) / 0.78, 3)),
};

export function ease(name, t) {
  const fn = EASE[name] || EASE.inOutCubic;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return fn(t);
}

/** Progress of a windowed motion, clamped and eased. */
export function windowProgress(t, startSec, durSec, easing) {
  if (durSec <= 0) return t >= startSec ? 1 : 0;
  return ease(easing, clamp01((t - startSec) / durSec));
}

/** Seeded noise in [-1,1], continuous in t. Deterministic per element id. */
export function wobble(id, t, freq = 1) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const phase = ((h >>> 0) % 6283) / 1000;
  // Two incommensurate sines read as organic without being random.
  return 0.62 * Math.sin(t * freq * 1.0 + phase) + 0.38 * Math.sin(t * freq * 1.73 + phase * 2.1);
}

/**
 * ENTRANCES. Each returns an offset/scale/opacity delta to apply to the layout
 * box, so a layout stays the authority on where a thing ends up.
 */
export function entranceDelta(kind, p, opts = {}) {
  const none = { dx: 0, dy: 0, scale: 1, rot: 0, opacity: 1 };
  if (p >= 1) return none;
  if (p <= 0) return { ...none, opacity: 0, hidden: true };
  switch (kind) {
    case "RISE":
      // 0.012, not 0.10: a text layer is fitted to its slot, so a rise that
      // starts a tenth of the frame lower puts the box below the safe area for
      // any bottom-row slot. Small is also better here: this is a lift, not a
      // slide.
      return { dx: 0, dy: (1 - p) * (opts.distance ?? 0.012), scale: 1, rot: 0, opacity: Math.min(1, p * 2.2) };
    case "SETTLE_IN":
      // Lands with weight: slightly large and high, settling down to rest.
      return {
        dx: 0,
        dy: (1 - p) * -(opts.distance ?? 0.05),
        scale: 1 + (1 - p) * (opts.overshoot ?? 0.10),
        rot: (1 - p) * (opts.rot ?? -1.6),
        opacity: Math.min(1, p * 2.6),
      };
    case "SLIDE_IN": {
      const d = (1 - p) * (opts.distance ?? 0.35);
      const dir = opts.from || "left";
      return {
        dx: dir === "left" ? -d : dir === "right" ? d : 0,
        dy: dir === "top" ? -d : dir === "bottom" ? d : 0,
        scale: 1,
        rot: 0,
        opacity: 1,
      };
    }
    case "GROW_UP":
      // Anchored at its own base, so a stack grows rather than inflating.
      return { dx: 0, dy: 0, scale: 1, rot: 0, opacity: 1, scaleY: p, anchorY: 1 };
    case "SWING_IN":
      return { dx: 0, dy: 0, scale: 1, rot: (1 - p) * (opts.rot ?? 9), opacity: Math.min(1, p * 3) };
    case "PUSH_FORWARD":
      return { dx: 0, dy: 0, scale: 0.9 + 0.1 * p, rot: 0, opacity: Math.min(1, p * 2.5) };
    case "FADE":
      return { ...none, opacity: p };
    case "CUT":
    default:
      return none;
  }
}

/**
 * SUSTAINS. Applied for the whole scene, on top of the entrance. Amplitudes are
 * fractions of the frame and stay small on purpose: this is the difference
 * between a living page and a jiggling one.
 */
export function sustainDelta(kind, id, t, opts = {}) {
  const amp = opts.amp ?? 1;
  switch (kind) {
    case "FLOAT":
      return { dx: wobble(id, t, 0.55) * 0.006 * amp, dy: wobble(id + "y", t, 0.42) * 0.009 * amp, scale: 1, rot: 0 };
    case "BREATHE":
      return { dx: 0, dy: 0, scale: 1 + wobble(id, t, 0.38) * 0.012 * amp, rot: 0 };
    case "SWAY":
      return { dx: 0, dy: 0, scale: 1, rot: wobble(id, t, 0.34) * 0.9 * amp };
    case "CREEP":
      // A slow one-way drift: the catalogue keeps growing while you read.
      return { dx: (opts.dx ?? 0) * t, dy: (opts.dy ?? 0) * t, scale: 1 + (opts.dScale ?? 0) * t, rot: 0 };
    case "SPIN":
      return { dx: 0, dy: 0, scale: 1, rot: (opts.degPerSec ?? 8) * t };
    case "NONE":
    default:
      return { dx: 0, dy: 0, scale: 1, rot: 0 };
  }
}

/**
 * The camera. A normalized pan plus a zoom about a focus point, eased across the
 * scene. Keyframes let one scene push in, hold, then rack across.
 *
 * @param {{keys: Array<{at:number, cx?:number, cy?:number, zoom?:number, rot?:number, easing?:string}>}} camera
 */
export function cameraAt(camera, t, sceneDur) {
  const base = { cx: 0.5, cy: 0.5, zoom: 1.0, rot: 0 };
  if (!camera || !camera.keys || !camera.keys.length) return base;
  const keys = camera.keys.map((k) => ({ ...base, ...k }));
  if (t <= keys[0].at) return keys[0];
  const last = keys[keys.length - 1];
  if (t >= last.at) return last;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].at) {
      const a = keys[i - 1];
      const b = keys[i];
      const span = Math.max(1e-6, b.at - a.at);
      const p = ease(b.easing || "inOutCubic", (t - a.at) / span);
      return {
        cx: a.cx + (b.cx - a.cx) * p,
        cy: a.cy + (b.cy - a.cy) * p,
        zoom: a.zoom + (b.zoom - a.zoom) * p,
        rot: a.rot + (b.rot - a.rot) * p,
      };
    }
  }
  return last;
}

/**
 * Resolve one art element to its drawable state at time t.
 *
 * @param {object} el      spec element (already bound to a layout box)
 * @param {Box}    baseBox layout-resolved box, normalized
 * @param {number} t       seconds into the scene
 * @param {number} sceneDur
 */
export function artState(el, baseBox, t, sceneDur) {
  const id = el.id || el.subject || "el";
  const ent = el.entrance || { kind: "CUT" };
  const entP = windowProgress(t, ent.startSec ?? 0, ent.durSec ?? 0.6, ent.easing || "outCubic");
  const d = entranceDelta(ent.kind, entP, ent);
  if (d.hidden) return null;

  const sus = el.sustain || { kind: "NONE" };
  const s = sustainDelta(sus.kind, id, t, sus);

  // An exit is an entrance played backwards at the end of the scene, used when a
  // transition wants the content gone before the cut.
  let exitOpacity = 1;
  let exitDx = 0;
  let exitDy = 0;
  if (el.exit) {
    const start = el.exit.startSec ?? sceneDur - (el.exit.durSec ?? 0.5);
    const p = windowProgress(t, start, el.exit.durSec ?? 0.5, el.exit.easing || "inCubic");
    if (p > 0) {
      const dist = el.exit.distance ?? 0.22;
      const dir = el.exit.to || "left";
      exitDx = (dir === "left" ? -1 : dir === "right" ? 1 : 0) * dist * p;
      exitDy = (dir === "top" ? -1 : dir === "bottom" ? 1 : 0) * dist * p;
      if (el.exit.fade !== false) exitOpacity = 1 - p;
    }
  }

  const scale = (d.scale ?? 1) * (s.scale ?? 1);
  const w = baseBox.w * scale;
  const h = baseBox.h * scale;
  // Scale about the box centre, or about its base for a growing stack.
  const anchorY = d.anchorY ?? 0.5;
  const cx = baseBox.x + baseBox.w / 2;
  const cy = baseBox.y + baseBox.h * anchorY;

  return {
    id,
    x: cx - w / 2 + (d.dx ?? 0) + s.dx + exitDx,
    y: cy - h * anchorY + (d.dy ?? 0) + s.dy + exitDy,
    w,
    h,
    scaleY: d.scaleY ?? 1,
    anchorY,
    rot: (d.rot ?? 0) + (s.rot ?? 0) + (el.rot ?? 0),
    opacity: (d.opacity ?? 1) * exitOpacity * (el.opacity ?? 1),
    plane: el.plane ?? 1,
    z: el.z ?? 10,
  };
}

/**
 * Parallax: how far a plane shifts given the camera's own offset from centre.
 * plane 0 is far background (moves least), 1 is the subject plane, >1 is
 * foreground (moves most, and so reads as nearest).
 */
export function parallaxOffset(cam, plane) {
  const dx = (cam.cx - 0.5) * (plane - 1) * -0.5;
  const dy = (cam.cy - 0.5) * (plane - 1) * -0.5;
  return { dx, dy };
}

/**
 * Population: N library items appearing over a window, each with its own
 * entrance. This is the crowd filling in, the stack building, the collectors
 * gathering. `order` decides who lands when, so a crowd can grow outward from
 * the middle instead of sweeping like a wipe.
 */
export function populationState(items, spec, t) {
  const start = spec.startSec ?? 0;
  const dur = spec.durSec ?? 1.5;
  const stagger = items.length > 1 ? dur / items.length : 0;
  const hold = spec.itemDurSec ?? 0.42;
  const out = [];
  for (const item of items) {
    const order = spec.orderBy === "outward" ? Math.abs(item.order - items.length / 2) * 2 : item.order;
    const t0 = start + order * stagger * (spec.orderBy === "outward" ? 0.5 : 1);
    const p = windowProgress(t, t0, hold, spec.easing || "outBack");
    if (p <= 0) continue;
    const grow = 0.55 + 0.45 * p;
    out.push({
      ...item,
      p,
      scale: item.scale * grow,
      opacity: Math.min(1, p * 2.4),
      // Each figure keeps breathing once it has landed, at its own phase.
      driftY: wobble(`pop${item.order}`, t, 0.5) * 0.004,
      driftX: wobble(`pop${item.order}x`, t, 0.4) * 0.003,
      rot: wobble(`pop${item.order}r`, t, 0.3) * 1.2 + (1 - p) * 8,
    });
  }
  return out;
}

/**
 * A count-up that walks a fact-locked list of values. Returns the index to show.
 * Every value it passes through is checked by the spec validator, so a counter
 * cannot flash an unapproved number on its way to an approved one.
 */
export function counterIndex(spec, t, count) {
  const p = windowProgress(t, spec.startSec ?? 0, spec.durSec ?? 1.0, spec.easing || "outExpo");
  return Math.max(0, Math.min(count - 1, Math.floor(p * count)));
}

/**
 * A stroke drawing itself: the fraction of the path length that is inked.
 * Feeds stroke-dashoffset, so the line follows its real path rather than being
 * revealed by a rectangle, which is what made V1's headlines look cut off.
 */
export function strokeProgress(spec, t) {
  return windowProgress(t, spec.startSec ?? 0, spec.durSec ?? 0.8, spec.easing || "outCubic");
}
