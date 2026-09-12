// The composition system: named layouts that resolve to concrete boxes.
//
// V1 had no composition system. Text sat at slot coordinates I typed, art sat at
// a `place.w` fraction I typed, and nothing related the two to the frame. The
// measured result over 60 sampled frames was 10.8% ink coverage and a content
// bounding box filling 43% of the frame, with the bottom third regularly empty.
// Tiny illustrations were not a bug; they were unconstrained authoring.
//
// Here a scene picks a LAYOUT and binds content to its slots. The layout owns
// the geometry, so:
//
//   - art is fitted to its slot by aspect ratio, which means it is as large as
//     the slot allows and can never be cropped by the placement itself
//   - a hero slot is large by construction, not by whatever number was typed
//   - every layout declares the occupancy it intends, so QA can tell an empty
//     frame from deliberate white paper
//   - text and art have separate safe areas, because on Reels the bottom band
//     is covered by UI: artwork may bleed into it, words may not
//
// Boxes are normalized to the output frame, origin top-left.

/** @typedef {{x:number,y:number,w:number,h:number}} Box */

/**
 * Two safe areas, deliberately different.
 *
 * `text` is the platform-safe box: the top strip and the bottom caption/UI band
 * are unusable for words. `art` is far more generous, because an illustration
 * running under the caption bar still reads as a full frame, and V1's biggest
 * visual failure was a frame that looked half empty. Artwork may bleed past even
 * this when a scene marks it, which is how a crowd fills the edge of frame.
 */
export const SAFE = {
  text: { x: 0.055, y: 0.055, w: 0.89, h: 0.805 },
  art: { x: 0.02, y: 0.02, w: 0.96, h: 0.955 },
};

const box = (x, y, w, h) => ({ x, y, w, h });

/** Area of a box as a fraction of the frame. */
export const boxArea = (b) => b.w * b.h;

/** Is `inner` fully inside `outer` (with a small tolerance)? */
export function contains(outer, inner, tol = 1e-6) {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.w <= outer.x + outer.w + tol &&
    inner.y + inner.h <= outer.y + outer.h + tol
  );
}

export function intersection(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x || y1 <= y) return null;
  return box(x, y, x1 - x, y1 - y);
}

/**
 * The largest box with `aspect` (w/h) that fits inside `slot`, centred.
 *
 * This one function is why V2 cannot render a tiny hero or a cropped subject:
 * art always fills its slot along one axis, and the slot is chosen by the layout.
 * `frameAspect` converts between normalized frame units and real pixels, since a
 * 9:16 frame makes normalized width and height non-comparable.
 */
export function fitAspect(slot, aspect, frameAspect, mode = "contain") {
  // Work in pixel-proportional units: normalized width * frameAspect is
  // comparable to normalized height.
  const slotWpx = slot.w * frameAspect;
  const slotH = slot.h;
  const slotAspect = slotWpx / slotH;
  let wpx;
  let h;
  if (mode === "cover" ? slotAspect > aspect : slotAspect < aspect) {
    wpx = slotWpx;
    h = slotWpx / aspect;
  } else {
    h = slotH;
    wpx = slotH * aspect;
  }
  const w = wpx / frameAspect;
  return box(slot.x + (slot.w - w) / 2, slot.y + (slot.h - h) / 2, w, h);
}

/**
 * Layout table. Each entry returns named slots plus the occupancy it intends.
 *
 * `occupancy` is the fraction of the ART safe area that important content is
 * meant to fill. It is a CONTRACT for QA, not a suggestion: a scene that lands
 * far under its own declared occupancy is the V1 failure, and a scene that
 * wants white paper declares a low number and says why.
 */
export const LAYOUTS = {
  // One subject dominating, words beneath it.
  HERO_CENTER: () => ({
    hero: "hero",
    occupancy: 0.6,
    textSlots: ["lead", "sub", "kicker"],
    slots: {
      hero: box(0.05, 0.10, 0.90, 0.58),
      lead: box(0.07, 0.700, 0.86, 0.090),
      sub: box(0.07, 0.788, 0.86, 0.052),
      kicker: box(0.07, 0.065, 0.86, 0.050),
    },
  }),

  // Subject holds one side full height; the words own the other side.
  HERO_LEFT: () => ({
    hero: "hero",
    occupancy: 0.58,
    textSlots: ["lead", "sub", "detail", "foot", "kicker"],
    slots: {
      hero: box(0.02, 0.130, 0.54, 0.630),
      lead: box(0.58, 0.235, 0.36, 0.125),
      sub: box(0.58, 0.378, 0.36, 0.080),
      detail: box(0.58, 0.472, 0.36, 0.070),
      // Full width. A closing line squeezed into a 34% column fits its type tiny,
      // and two scenes read as having an afterthought caption because of it.
      foot: box(0.08, 0.786, 0.84, 0.058),
      kicker: box(0.07, 0.065, 0.86, 0.050),
    },
  }),

  HERO_RIGHT: () => ({
    hero: "hero",
    occupancy: 0.58,
    textSlots: ["lead", "sub", "detail", "foot", "kicker"],
    slots: {
      hero: box(0.44, 0.130, 0.54, 0.630),
      lead: box(0.06, 0.235, 0.36, 0.125),
      sub: box(0.06, 0.378, 0.36, 0.080),
      detail: box(0.06, 0.472, 0.36, 0.070),
      // Full width. A closing line squeezed into a 34% column fits its type tiny,
      // and two scenes read as having an afterthought caption because of it.
      foot: box(0.08, 0.786, 0.84, 0.058),
      kicker: box(0.07, 0.065, 0.86, 0.050),
    },
  }),

  // Two subjects, equal weight, the comparison stated between them.
  SPLIT_50_50: () => ({
    hero: "left",
    occupancy: 0.62,
    textSlots: ["leftLabel", "rightLabel", "lead", "kicker"],
    slots: {
      left: box(0.02, 0.160, 0.45, 0.520),
      right: box(0.53, 0.160, 0.45, 0.520),
      leftLabel: box(0.07, 0.700, 0.38, 0.048),
      rightLabel: box(0.55, 0.700, 0.38, 0.048),
      lead: box(0.07, 0.780, 0.86, 0.065),
      kicker: box(0.07, 0.065, 0.86, 0.055),
    },
  }),

  // Deliberately unequal: one side is meant to read as bigger.
  SPLIT_60_40: () => ({
    hero: "left",
    occupancy: 0.62,
    textSlots: ["leftLabel", "rightLabel", "lead", "kicker"],
    slots: {
      left: box(0.02, 0.150, 0.56, 0.550),
      right: box(0.60, 0.240, 0.38, 0.370),
      leftLabel: box(0.07, 0.715, 0.46, 0.046),
      rightLabel: box(0.60, 0.628, 0.33, 0.046),
      lead: box(0.07, 0.785, 0.86, 0.060),
      kicker: box(0.07, 0.065, 0.86, 0.055),
    },
  }),

  // The subject and the fact about it, stacked and both large.
  STACK_AND_LABEL: () => ({
    hero: "hero",
    occupancy: 0.64,
    textSlots: ["lead", "sub"],
    slots: {
      hero: box(0.04, 0.070, 0.92, 0.600),
      lead: box(0.08, 0.695, 0.84, 0.095),
      sub: box(0.10, 0.800, 0.80, 0.048),
    },
  }),

  // Many small figures across the full width: reach, drawn.
  CROWD_WIDE: () => ({
    hero: "field",
    occupancy: 0.5,
    textSlots: ["lead", "sub", "detail", "kicker"],
    slots: {
      field: box(0.0, 0.110, 1.0, 0.500),
      lead: box(0.07, 0.645, 0.86, 0.090),
      sub: box(0.08, 0.748, 0.84, 0.055),
      detail: box(0.10, 0.800, 0.80, 0.042),
      kicker: box(0.07, 0.065, 0.86, 0.046),
    },
  }),

  // One object, very large. Used for the record and the price tag.
  OBJECT_CLOSEUP: () => ({
    hero: "hero",
    occupancy: 0.7,
    textSlots: ["lead", "kicker"],
    slots: {
      hero: box(0.04, 0.090, 0.92, 0.660),
      lead: box(0.08, 0.775, 0.84, 0.070),
      kicker: box(0.07, 0.065, 0.86, 0.046),
    },
  }),

  // A small thing against a vast thing, with the axis between them.
  COMPARISON_SCALE: () => ({
    hero: "vast",
    occupancy: 0.58,
    textSlots: ["smallLabel", "vastLabel", "lead", "kicker"],
    slots: {
      small: box(0.04, 0.300, 0.26, 0.300),
      vast: box(0.34, 0.130, 0.64, 0.520),
      smallLabel: box(0.06, 0.630, 0.30, 0.048),
      vastLabel: box(0.38, 0.680, 0.54, 0.045),
      lead: box(0.08, 0.775, 0.84, 0.070),
      kicker: box(0.07, 0.065, 0.86, 0.046),
    },
  }),

  // The maths assembling itself, with the evidence above it.
  EQUATION_REVEAL: () => ({
    hero: "evidence",
    occupancy: 0.52,
    textSlots: ["row1", "row2", "row3", "caption"],
    slots: {
      evidence: box(0.03, 0.065, 0.94, 0.350),
      row1: box(0.08, 0.440, 0.84, 0.068),
      row2: box(0.11, 0.535, 0.78, 0.150),
      row3: box(0.10, 0.718, 0.80, 0.052),
      caption: box(0.12, 0.792, 0.76, 0.044),
    },
  }),

  // The number IS the composition.
  FULL_FRAME_NUMBER: () => ({
    hero: "number",
    occupancy: 0.40,
    textSlots: ["number", "above", "below"],
    slots: {
      backdrop: box(0.0, 0.055, 1.0, 0.215),
      above: box(0.09, 0.300, 0.82, 0.058),
      number: box(0.09, 0.385, 0.82, 0.205),
      below: box(0.11, 0.625, 0.78, 0.052),
      footer: box(0.0, 0.700, 1.0, 0.160),
    },
  }),

  // Three depth planes, for the scenes that should feel built rather than laid out.
  MULTI_LAYER_COLLAGE: () => ({
    hero: "mid",
    occupancy: 0.68,
    textSlots: ["lead", "kicker"],
    slots: {
      // Starts below the kicker band: a title drawn on top of the crowd's own
      // top row is unreadable, and moving the field is better than declaring an
      // override for something that simply wants a clear title line.
      back: box(0.0, 0.130, 1.0, 0.375),
      mid: box(0.08, 0.200, 0.84, 0.500),
      front: box(0.30, 0.500, 0.68, 0.360),
      lead: box(0.08, 0.755, 0.84, 0.090),
      kicker: box(0.07, 0.065, 0.86, 0.046),
    },
  }),

  // A subject above, a group gathering in front of it. The cluster band overlaps
  // the hero's base on purpose: it puts the group in FRONT, which is what makes
  // the scene read as depth rather than as two stacked pictures.
  HERO_AND_CLUSTER: () => ({
    hero: "hero",
    occupancy: 0.66,
    textSlots: ["lead", "sub", "kicker"],
    slots: {
      hero: box(0.07, 0.125, 0.86, 0.460),
      cluster: box(0.02, 0.455, 0.96, 0.280),
      lead: box(0.08, 0.768, 0.84, 0.074),
      sub: box(0.07, 0.065, 0.86, 0.050),
      kicker: box(0.07, 0.065, 0.86, 0.050),
    },
  }),

  // The CTA owns the frame, and is held still enough to act on.
  CTA_FULL_FRAME: () => ({
    hero: "art",
    occupancy: 0.55,
    textSlots: ["lead", "keyword", "sub"],
    slots: {
      art: box(0.05, 0.065, 0.90, 0.330),
      lead: box(0.08, 0.420, 0.84, 0.105),
      keyword: box(0.12, 0.568, 0.76, 0.090),
      sub: box(0.10, 0.718, 0.80, 0.048),
    },
  }),
};

/**
 * Every slot a layout declares for text, checked against the text-safe box.
 *
 * The layout table used to place labels at x=0.03 and x=0.97, outside the safe
 * area, so 24 of the full storyboard's first-pass errors were the table's fault
 * rather than the author's. This makes that a testable property of the module.
 */
export function unsafeTextSlots(inset = 0.0) {
  const bad = [];
  for (const [name, make] of Object.entries(LAYOUTS)) {
    const l = make();
    for (const slot of l.textSlots || []) {
      const b = l.slots[slot];
      if (!b) {
        bad.push({ layout: name, slot, why: "declared as a text slot but not defined" });
        continue;
      }
      const safe = {
        x: SAFE.text.x + inset,
        y: SAFE.text.y + inset,
        w: SAFE.text.w - inset * 2,
        h: SAFE.text.h - inset * 2,
      };
      if (!contains(safe, b)) bad.push({ layout: name, slot, box: b, why: "outside the text-safe box" });
    }
  }
  return bad;
}

export const LAYOUT_NAMES = Object.keys(LAYOUTS);

/**
 * Resolve a layout to its slots, with optional per-scene slot nudges.
 *
 * `overrides` exists so a scene can adjust one slot without abandoning the
 * layout, and every override is visible in the spec (and reported by QA) rather
 * than hidden in a coordinate.
 */
export function resolveLayout(name, overrides = {}) {
  const make = LAYOUTS[name];
  if (!make) throw new Error(`unknown layout "${name}"; known: ${LAYOUT_NAMES.join(", ")}`);
  const resolved = make();
  const slots = { ...resolved.slots };
  for (const [slot, patch] of Object.entries(overrides.slots || {})) {
    if (!slots[slot]) throw new Error(`layout "${name}" has no slot "${slot}" to override`);
    slots[slot] = { ...slots[slot], ...patch };
  }
  return {
    name,
    hero: overrides.hero || resolved.hero,
    occupancy: overrides.occupancy ?? resolved.occupancy,
    textSlots: resolved.textSlots || [],
    slots,
  };
}

/**
 * Place one art item: the largest aspect-correct box inside its slot.
 * `scale` lets a scene deliberately under-fill a slot (a figure that should read
 * as small in a scale comparison); it is the only way to shrink art, and it is
 * explicit.
 */
export function placeArt(slotBox, aspect, frameAspect, opts = {}) {
  const fitted = fitAspect(slotBox, aspect, frameAspect, opts.fit || "contain");
  const s = opts.scale ?? 1;
  if (s === 1) return fitted;
  const w = fitted.w * s;
  const h = fitted.h * s;
  const anchor = opts.anchor || "center";
  let x = fitted.x + (fitted.w - w) / 2;
  let y = fitted.y + (fitted.h - h) / 2;
  if (anchor.includes("bottom")) y = fitted.y + fitted.h - h;
  if (anchor.includes("top")) y = fitted.y;
  if (anchor.includes("left")) x = fitted.x;
  if (anchor.includes("right")) x = fitted.x + fitted.w - w;
  return box(x, y, w, h);
}

/**
 * Deterministic scatter of N items across a field box.
 *
 * Used for the crowd: real hand-drawn figures placed on a jittered grid, denser
 * toward the back, so reach reads as a populated field rather than V1's single
 * tiny cluster. Seeded, so the same scene always produces the same crowd.
 */
export function scatterField(fieldBox, count, opts = {}) {
  const seed = opts.seed ?? 1;
  let h = 2166136261 ^ seed;
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h |= 0;
    return ((h >>> 0) % 100000) / 100000;
  };
  const cols = opts.cols ?? Math.ceil(Math.sqrt(count * (fieldBox.w / Math.max(0.001, fieldBox.h)) * 2.2));
  const rows = Math.ceil(count / cols);
  const jitter = opts.jitter ?? 0.42;
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const cw = fieldBox.w / cols;
    const ch = fieldBox.h / rows;
    // Rows further back sit higher and render smaller: a cheap, honest depth cue.
    const depth = rows > 1 ? 1 - r / (rows - 1) : 0;
    out.push({
      x: fieldBox.x + (c + 0.5 + (rand() - 0.5) * jitter) * cw,
      y: fieldBox.y + (r + 0.5 + (rand() - 0.5) * jitter * 0.6) * ch,
      depth,
      scale: (opts.minScale ?? 0.55) + (1 - depth) * ((opts.maxScale ?? 1.0) - (opts.minScale ?? 0.55)),
      order: i,
      wobble: rand(),
    });
  }
  return out;
}
