// The motion spec: the machine-readable description of a handwritten-motion video.
//
// A spec is DATA, authored per script under videos/motion-specs/<slug>.json and
// version controlled. It names three things and nothing else:
//
//   artwork  already-accepted handwritten sheets (or newly generated TEXT-FREE
//            illustrations), addressed by file
//   plates   normalized crops of that artwork: the illustration only, never a
//            region carrying a figure the video has to get right
//   scenes   per scene, which plates move how, and which EXACT strings this repo
//            letters itself
//
// Every factual string therefore lives in the spec, is checked against the fact
// lock before a frame is drawn, and is rendered by code. A generative model can
// contribute a blank illustration; it can never contribute a number.
//
// Layout is slots, not coordinates, so a second script does not restate a design.
// A layer may override any slot field when the composition genuinely needs it.

import fs from "node:fs";
import path from "node:path";
import { MOTION, PLATE_MOTIONS, TEXT_MOTIONS, ROLE_DURATION, STORY_ROLES, READING } from "../config.mjs";
import { verifyText, factLockDigest } from "./factLock.mjs";
import { protectedTokens } from "./schema.mjs";
import { screenNumberTokens } from "./scriptParse.mjs";

/** Sheet pixel size: the composition canvas, larger than the output so a push
 * crops into real pixels. */
export function sheetSize(render) {
  return {
    width: Math.round(render.width * MOTION.sheetScale),
    height: Math.round(render.height * MOTION.sheetScale),
  };
}

/** Named type slots, normalized to the sheet. `size` is a share of sheet HEIGHT so
 * a slot reads the same at any output size. */
export const SLOTS = {
  headline: { x: 0.5, y: 0.085, w: 0.9, align: "center", size: 0.042, weight: "hook" },
  subhead: { x: 0.5, y: 0.2, w: 0.86, align: "center", size: 0.03 },
  nameLeft: { x: 0.26, y: 0.63, w: 0.44, align: "center", size: 0.026 },
  nameRight: { x: 0.74, y: 0.63, w: 0.44, align: "center", size: 0.026 },
  statLeft: { x: 0.26, y: 0.7, w: 0.42, align: "center", size: 0.028, box: true },
  statRight: { x: 0.74, y: 0.7, w: 0.42, align: "center", size: 0.028, box: true },
  bigNumber: { x: 0.5, y: 0.44, w: 0.9, align: "center", size: 0.085 },
  equation: { x: 0.5, y: 0.3, w: 0.9, align: "center", size: 0.038 },
  caption: { x: 0.5, y: 0.58, w: 0.88, align: "center", size: 0.03 },
  bottomBar: { x: 0.5, y: 0.8, w: 0.9, align: "center", size: 0.036 },
  ctaLine: { x: 0.5, y: 0.42, w: 0.9, align: "center", size: 0.034 },
  ctaKeyword: { x: 0.5, y: 0.55, w: 0.9, align: "center", size: 0.072, box: true },
};

/** Resolve a text layer to concrete geometry + style. Pure. */
export function resolveTextLayer(layer) {
  const slot = SLOTS[layer.slot];
  if (!slot) throw new Error(`unknown text slot "${layer.slot}"`);
  const merged = { ...slot, ...pick(layer, ["x", "y", "w", "align", "size", "weight", "box", "underline", "family"]) };
  return {
    id: layer.id,
    text: layer.text,
    claim: layer.claim || null,
    x: merged.x,
    y: merged.y,
    w: merged.w,
    align: merged.align,
    size: merged.size,
    weight: merged.weight || "body",
    box: Boolean(merged.box),
    underline: Boolean(merged.underline),
    family: merged.family || MOTION.letterFamily,
    motion: layer.motion || { kind: "FADE", startSec: 0, durSec: 0.35 },
    z: layer.z ?? 100,
  };
}

/** Do two normalized rectangles share any area? Touching edges do not count. */
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** Total authored duration including the end card. */
export function specDurationSec(spec) {
  return spec.scenes.reduce((a, s) => a + s.durationSec, 0);
}

/**
 * Validate a motion spec. Errors block rendering; nothing here spends money, so
 * this is the whole gate a dry run needs.
 *
 * @param {object} spec
 * @param {import('./factLock.mjs').FactLock} lock
 * @param {{ storyboard?: object, repoRoot?: string }} opts
 */
export function validateMotionSpec(spec, lock, opts = {}) {
  const errors = [];
  const warnings = [];
  const repoRoot = opts.repoRoot || "";

  if (!spec || typeof spec !== "object") return { ok: false, errors: ["spec is not an object"], warnings };
  if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) {
    return { ok: false, errors: ["spec has no scenes"], warnings };
  }
  for (const c of lock.conflicts) errors.push(`source conflict, refusing to render: ${c}`);

  // Artwork + plates exist before anything is composed. A missing asset is a
  // failure at plan time, not a hole in frame 400.
  const artworkById = new Map();
  const letteredByArtwork = new Map();
  for (const a of spec.artwork || []) {
    if (!a.id || !a.file) errors.push("artwork entry needs id and file");
    const abs = path.isAbsolute(a.file) ? a.file : path.join(repoRoot, a.file);
    if (!fs.existsSync(abs)) errors.push(`artwork "${a.id}" file not found: ${abs}`);
    artworkById.set(a.id, abs);
    letteredByArtwork.set(a.id, a.letteredRegions || []);
  }
  const plateById = new Map();
  for (const p of spec.plates || []) {
    if (!p.id) errors.push("plate entry needs an id");
    if (!artworkById.has(p.artwork)) errors.push(`plate "${p.id}" references unknown artwork "${p.artwork}"`);
    const c = p.crop;
    const okCrop =
      c && [c.x, c.y, c.w, c.h].every((v) => typeof v === "number" && v >= 0 && v <= 1) && c.w > 0 && c.h > 0 &&
      c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001;
    if (!okCrop) errors.push(`plate "${p.id}" has an invalid normalized crop`);
    if (plateById.has(p.id)) errors.push(`duplicate plate id "${p.id}"`);
    plateById.set(p.id, p);

    // THE PLATE INVARIANT: a plate carries illustration, never lettering.
    // An accepted sheet has correct hand-lettering of its own, and a crop that
    // clips it puts a second copy of a figure on screen that the fact lock never
    // saw and cannot check. `keepPaper` plates are whole founder assets (the 128
    // end card) and are exempt by declaration.
    if (okCrop && !p.keepPaper) {
      for (const region of letteredByArtwork.get(p.artwork) || []) {
        if (rectsOverlap(c, region)) {
          errors.push(
            `plate "${p.id}" crops into the artwork's lettered region "${region.id || "unnamed"}"; ` +
              `plates carry illustration only, and every figure is lettered from the fact lock`
          );
        }
      }
    }
  }

  // Duration is pinned: a 30-second cut is 30 seconds, not "about 30".
  const total = specDurationSec(spec);
  const target = spec.targetDurationSec ?? MOTION.targetDurationSec;
  if (Math.abs(total - target) > MOTION.durationToleranceSec) {
    errors.push(`scene durations total ${total.toFixed(2)}s, target is ${target.toFixed(2)}s`);
  }

  let revealIndex = -1;
  const roles = new Set();
  spec.scenes.forEach((scene, i) => {
    const where = `scene ${i}`;
    if (scene.index !== i) errors.push(`${where}: index ${scene.index} out of order`);
    if (!(scene.durationSec > 0)) errors.push(`${where}: durationSec must be positive`);
    for (const r of scene.roles || []) {
      if (!STORY_ROLES.includes(r) && r !== "END_CARD") errors.push(`${where}: unknown role ${r}`);
      roles.add(r);
      if (r === "REVEAL" && revealIndex === -1) revealIndex = i;
    }
    if (!(scene.roles || []).length) errors.push(`${where}: no roles`);

    // Role duration bands still govern pacing; END_CARD is exempt.
    const bands = (scene.roles || []).map((r) => ROLE_DURATION[r]).filter(Boolean);
    if (bands.length) {
      const min = Math.max(...bands.map((b) => b.min));
      if (scene.durationSec < min - 0.001) {
        warnings.push(`${where}: ${scene.durationSec}s is under the ${min}s floor for ${scene.roles.join("+")}`);
      }
    }

    for (const pl of scene.plates || []) {
      if (!plateById.has(pl.plate)) errors.push(`${where}: unknown plate "${pl.plate}"`);
      if (pl.motion && !PLATE_MOTIONS.includes(pl.motion.kind)) {
        errors.push(`${where}: plate motion "${pl.motion?.kind}" is not one of ${PLATE_MOTIONS.join("/")}`);
      }
    }

    const ids = new Set();
    let words = 0;
    for (const raw of scene.text || []) {
      if (!raw.id) errors.push(`${where}: text layer without id`);
      if (ids.has(raw.id)) errors.push(`${where}: duplicate text layer id "${raw.id}"`);
      ids.add(raw.id);
      if (typeof raw.text !== "string" || !raw.text.length) {
        errors.push(`${where}: text layer "${raw.id}" has no string`);
        continue;
      }
      if (!SLOTS[raw.slot]) errors.push(`${where}: text layer "${raw.id}" has unknown slot "${raw.slot}"`);
      if (raw.motion && !TEXT_MOTIONS.includes(raw.motion.kind)) {
        errors.push(`${where}: text motion "${raw.motion.kind}" is not one of ${TEXT_MOTIONS.join("/")}`);
      }
      // A COUNTER animates through values; every value it passes through is on
      // screen, so every value is fact-checked, not just the final one.
      for (const v of raw.motion?.values || []) {
        const cv = verifyText(String(v), lock);
        for (const m of cv.malformed) errors.push(`${where}/${raw.id}: counter value ${JSON.stringify(m)} is malformed`);
        for (const n of cv.unapproved) errors.push(`${where}/${raw.id}: counter value "${n}" is not in the source`);
      }
      const check = verifyText(raw.text, lock);
      for (const m of check.malformed) {
        errors.push(`${where}/${raw.id}: malformed figure ${JSON.stringify(m)} in ${JSON.stringify(raw.text)}`);
      }
      for (const n of check.unapproved) {
        errors.push(`${where}/${raw.id}: number "${n}" in ${JSON.stringify(raw.text)} is not in the source script/META`);
      }
      if (raw.motion?.startSec != null && raw.motion.startSec >= scene.durationSec) {
        errors.push(`${where}/${raw.id}: starts at ${raw.motion.startSec}s, after the scene ends`);
      }
      // Readability is PER LAYER here, not summed over the scene.
      // schema.mjs sums, correctly: on a generated master image every word is
      // present from the first frame, so the viewer reads the whole scene. Here
      // lines land one at a time, so what matters is whether each line is on
      // screen long enough to be read after it appears. Summing would demand ~5s
      // for three short lines that are individually instant, and a timing bug
      // (a long line landing 0.3s before the cut) would hide inside the total.
      const lineWords = raw.text.split(/\s+/).filter(Boolean).length;
      const appears = raw.motion?.startSec ?? 0;
      const onScreenFor = scene.durationSec - appears;
      const needs = lineWords / READING.wordsPerSec + MOTION.lineReadOverheadSec;
      if (!scene.roles?.includes("END_CARD") && onScreenFor < needs) {
        warnings.push(
          `${where}/${raw.id}: "${raw.text.replace(/\n/g, " ")}" appears at ${appears}s and has only ` +
            `${onScreenFor.toFixed(2)}s left, but ${lineWords} words need ${needs.toFixed(2)}s`
        );
      }
      words += lineWords;
    }
    if (words > 28) errors.push(`${where}: ${words} words on screen, over the density cap (28)`);
  });

  if (!roles.has("HOOK")) errors.push("no scene carries HOOK");
  if (!spec.scenes[0]?.roles?.includes("HOOK")) errors.push("scene 0 must carry HOOK (the first frame is the hook)");
  if (!roles.has("CTA")) errors.push("no scene carries CTA");

  // Reveal protection: the payoff figure may not appear before the reveal scene.
  if (opts.storyboard) {
    const guarded = protectedTokens(opts.storyboard);
    if (guarded.size && revealIndex === -1) {
      warnings.push("the storyboard withholds a figure but no spec scene carries REVEAL");
    }
    for (const scene of spec.scenes) {
      if (revealIndex !== -1 && scene.index >= revealIndex) continue;
      const haystack = (scene.text || []).map((t) => t.text).join("\n");
      for (const n of screenNumberTokens(haystack)) {
        if (guarded.has(n)) errors.push(`scene ${scene.index}: withheld figure "${n}" appears before the reveal`);
      }
    }
  }

  // The CTA keyword is on the CTA scene, exactly as the script spells it.
  if (lock.ctaKeyword) {
    const cta = spec.scenes.find((s) => s.roles?.includes("CTA"));
    if (cta) {
      const shown = (cta.text || []).map((t) => t.text).join(" ");
      if (!shown.includes(lock.ctaKeyword)) {
        errors.push(`the CTA scene does not show the keyword "${lock.ctaKeyword}" exactly`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    totalDurationSec: Math.round(total * 100) / 100,
    factLockDigest: factLockDigest(lock),
  };
}

/**
 * Deterministic draft spec from a validated storyboard: one scene per storyboard
 * scene, screenText flowed into slots by role, durations from the role bands and
 * then normalized to the target. It is a starting point a human edits, not an
 * authority; nothing renders until validateMotionSpec passes.
 */
export function scaffoldMotionSpec(storyboard, opts = {}) {
  const target = opts.targetDurationSec ?? MOTION.targetDurationSec;
  const endCardSec = opts.endCardSec ?? 1.6;
  const content = storyboard.scenes.map((s) => {
    const bands = (s.roles || []).map((r) => ROLE_DURATION[r]).filter(Boolean);
    const mid = bands.length
      ? bands.reduce((a, b) => a + (b.min + b.max) / 2, 0) / bands.length
      : 3.0;
    return { scene: s, weight: mid };
  });
  const weightSum = content.reduce((a, c) => a + c.weight, 0);
  const budget = target - endCardSec;

  const scenes = content.map(({ scene, weight }, i) => ({
    index: i,
    roles: scene.roles,
    purpose: scene.purpose,
    durationSec: Math.round(((weight / weightSum) * budget) * 100) / 100,
    plates: [],
    text: (scene.screenText || []).map((t, j) => ({
      id: `t${j + 1}`,
      text: t,
      slot: slotForIndex(scene.roles, j),
      motion: { kind: j === 0 ? "DRAW_ON" : "POP", startSec: 0.15 + j * 0.28, durSec: 0.5 },
    })),
  }));
  scenes.push({
    index: scenes.length,
    roles: ["END_CARD"],
    purpose: "the founder's own hand-drawn 128 crown sheet",
    durationSec: endCardSec,
    plates: [{ plate: "endcard", place: { x: 0.5, y: 0.5, w: 1.0 }, motion: { kind: "DRIFT", amount: 0.05 } }],
    text: [],
  });

  // Rounding leaves a few hundredths; put the remainder on the reveal, or scene 0.
  const drift = target - scenes.reduce((a, s) => a + s.durationSec, 0);
  const sink = scenes.find((s) => s.roles?.includes("REVEAL")) || scenes[0];
  sink.durationSec = Math.round((sink.durationSec + drift) * 100) / 100;

  return {
    slug: storyboard.slug,
    title: storyboard.title,
    sourceScript: opts.sourceScript || null,
    targetDurationSec: target,
    artwork: [],
    plates: [],
    scenes,
  };
}

function slotForIndex(roles, j) {
  if (roles?.includes("CTA")) return ["ctaLine", "ctaKeyword", "caption"][j] || "caption";
  if (roles?.includes("REVEAL")) return ["equation", "bigNumber", "caption", "bottomBar"][j] || "caption";
  return ["headline", "subhead", "statLeft", "statRight", "bottomBar"][j] || "caption";
}
