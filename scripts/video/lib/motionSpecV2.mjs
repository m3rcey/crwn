// V2 spec validation.
//
// Every correctness gate from V1 is kept, unchanged in spirit and stricter in
// reach: figures must trace to the fact lock with no small-number exemption,
// malformed figures are refused, counter values are each checked, the CTA keyword
// must be exact, the withheld payoff may not appear before the reveal, source
// conflicts refuse to render, and an isolated subject may not carry lettering.
//
// What is NEW is composition validation, because V1's failure was compositional
// and nothing in the spec could express, let alone check, an intent about the
// frame. A scene now names a layout, binds content to its slots, and inherits
// that layout's occupancy contract.

import fs from "node:fs";
import path from "node:path";
import { MOTION, ROLE_DURATION, STORY_ROLES, READING } from "../config.mjs";
import { verifyText, factLockDigest } from "./factLock.mjs";
import { protectedTokens } from "./schema.mjs";
import { screenNumberTokens } from "./scriptParse.mjs";
import { LAYOUTS, LAYOUT_NAMES, resolveLayout, SAFE, contains } from "./composition.mjs";
import { rectsOverlap } from "./motionSpec.mjs";

const ENTRANCES = ["CUT", "FADE", "RISE", "SETTLE_IN", "SLIDE_IN", "GROW_UP", "SWING_IN", "PUSH_FORWARD"];
const SUSTAINS = ["NONE", "FLOAT", "BREATHE", "SWAY", "CREEP", "SPIN"];
const TEXT_MOTIONS_V2 = ["WRITE", "RISE", "POP", "FADE", "COUNTER", "HOLD", "SLIDE_IN", "SETTLE_IN"];
const MARK_SHAPES = ["rule", "underline", "circle", "arrow", "box"];

export function specDurationSecV2(spec) {
  return spec.scenes.reduce((a, s) => a + s.durationSec, 0);
}

/**
 * Pacing bands for the V2 explainer, from the founder's brief. V1 was judged too
 * fast at 30s for the same script, so a beat now has a floor as well as a
 * ceiling: a beat under its floor is the thing that made the story unreadable.
 */
export const BEAT_BANDS = {
  hook: { min: 2.0, max: 4.5 },
  explain: { min: 3.0, max: 5.5 },
  compare: { min: 4.0, max: 7.5 },
  reveal: { min: 5.0, max: 8.5 },
  cta: { min: 4.0, max: 7.5 },
  card: { min: 1.2, max: 3.0 },
};

/**
 * @param {object} spec
 * @param {import('./factLock.mjs').FactLock} lock
 * @param {{storyboard?:object, repoRoot?:string, prototype?:boolean}} opts
 */
export function validateMotionSpecV2(spec, lock, opts = {}) {
  const errors = [];
  const warnings = [];
  const repoRoot = opts.repoRoot || "";
  const isPrototype = Boolean(opts.prototype || spec.prototype);

  if (!spec || typeof spec !== "object") return { ok: false, errors: ["spec is not an object"], warnings };
  if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) {
    return { ok: false, errors: ["spec has no scenes"], warnings };
  }
  for (const c of lock.conflicts) errors.push(`source conflict, refusing to render: ${c}`);

  // ---- assets exist, and no isolated subject region overlaps lettering ------
  const artworkIds = new Set();
  const lettered = new Map();
  for (const a of spec.artwork || []) {
    if (!a.id || !a.file) errors.push("artwork entry needs id and file");
    const abs = path.isAbsolute(a.file) ? a.file : path.join(repoRoot, a.file);
    if (!fs.existsSync(abs)) errors.push(`artwork "${a.id}" file not found: ${abs}`);
    artworkIds.add(a.id);
    lettered.set(a.id, a.letteredRegions || []);
  }
  const subjectIds = new Set();
  for (const s of spec.subjects || []) {
    if (!s.id) errors.push("subject entry needs an id");
    if (!artworkIds.has(s.artwork)) errors.push(`subject "${s.id}" references unknown artwork "${s.artwork}"`);
    const r = s.region;
    const okRegion =
      r && [r.x, r.y, r.w, r.h].every((v) => typeof v === "number" && v >= 0 && v <= 1) && r.w > 0 && r.h > 0;
    if (!okRegion) errors.push(`subject "${s.id}" has an invalid normalized region`);
    // The region only SELECTS components; isolate.mjs then refuses any component
    // that puts real ink in a lettered area. Flagging an overlapping selection
    // region early is still useful: it means the author is fishing near words.
    if (okRegion) {
      for (const region of lettered.get(s.artwork) || []) {
        if (rectsOverlap(r, region)) {
          warnings.push(
            `subject "${s.id}" selection region overlaps the lettered region "${region.id}"; ` +
              `isolation will refuse any component that actually inks it`
          );
        }
      }
    }
    if (s.mode === "each") subjectIds.add(`${s.id}-*`);
    else subjectIds.add(s.id);
  }
  for (const p of spec.plates || []) subjectIds.add(p.id);

  const known = (id) => subjectIds.has(id) || [...subjectIds].some((k) => k.endsWith("-*") && id.startsWith(k.slice(0, -1)));

  // ---- duration ------------------------------------------------------------
  const total = specDurationSecV2(spec);
  const target = spec.targetDurationSec ?? MOTION.targetDurationSec;
  const tol = spec.durationToleranceSec ?? MOTION.durationToleranceSec;
  if (!isPrototype && Math.abs(total - target) > tol) {
    errors.push(`scene durations total ${total.toFixed(2)}s, target is ${target.toFixed(2)}s`);
  }
  if (!isPrototype && (total < 70 || total > 122)) {
    errors.push(`total ${total.toFixed(1)}s is outside the 70-122s the brief allows for the explainer`);
  }

  // ---- scenes --------------------------------------------------------------
  let revealIndex = -1;
  const roles = new Set();
  const layoutSequence = [];

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

    // Layout is mandatory: a scene without one is the V1 failure mode.
    if (!LAYOUTS[scene.layout]) {
      errors.push(`${where}: unknown or missing layout "${scene.layout}"; known: ${LAYOUT_NAMES.join(", ")}`);
      return;
    }
    layoutSequence.push(scene.layout);
    let layout;
    try {
      layout = resolveLayout(scene.layout, scene.layoutOverrides || {});
    } catch (e) {
      errors.push(`${where}: ${e.message}`);
      return;
    }
    if (scene.layoutOverrides?.slots) {
      if (!scene.layoutOverrides.reason) {
        errors.push(`${where}: layout overrides must carry a "reason" so a deviation is visible, not hidden`);
      } else {
        warnings.push(`${where}: layout override (${scene.layoutOverrides.reason})`);
      }
    }

    // The camera has to be NUMBERS.
    //
    // A generator bug once produced {"at":"at","cx":"cx","zoom":"zoom"} for every
    // key in every scene. Validation passed it, the geometry probe passed it, and
    // it died 20 scenes later inside the rasterizer as a NaN width. Anything the
    // renderer will do arithmetic on gets checked here.
    if (scene.camera) {
      const keys = scene.camera.keys;
      if (!Array.isArray(keys) || !keys.length) {
        errors.push(`${where}: camera has no keys`);
      } else {
        let prevAt = -Infinity;
        keys.forEach((k, ki) => {
          for (const [field, lo, hi] of [
            ["at", 0, scene.durationSec + 1e-6],
            ["cx", -0.5, 1.5],
            ["cy", -0.5, 1.5],
            ["zoom", 1, MOTION.maxZoomV2],
          ]) {
            const v = k[field];
            if (v === undefined) continue;
            if (typeof v !== "number" || !Number.isFinite(v)) {
              errors.push(`${where}: camera key ${ki} field "${field}" is ${JSON.stringify(v)}, not a finite number`);
            } else if (v < lo - 1e-9 || v > hi + 1e-9) {
              errors.push(`${where}: camera key ${ki} ${field}=${v} is outside ${lo}..${hi}`);
            }
          }
          if (typeof k.at === "number" && Number.isFinite(k.at)) {
            if (k.at < prevAt) errors.push(`${where}: camera key ${ki} at=${k.at} goes backwards`);
            prevAt = k.at;
          }
          if (k.easing !== undefined && typeof k.easing !== "string") {
            errors.push(`${where}: camera key ${ki} easing must be a string`);
          }
        });
      }
    }

    // Pacing: a beat declares its kind and has to sit inside that band.
    const beat = scene.beat || (scene.roles?.includes("END_CARD") ? "card" : "explain");
    const band = BEAT_BANDS[beat];
    if (!band) errors.push(`${where}: unknown beat kind "${beat}"`);
    else if (!isPrototype) {
      if (scene.durationSec < band.min - 1e-6) {
        errors.push(`${where}: ${scene.durationSec}s is under the ${band.min}s floor for a "${beat}" beat`);
      }
      if (scene.durationSec > band.max + 1e-6) {
        warnings.push(`${where}: ${scene.durationSec}s is over the ${band.max}s ceiling for a "${beat}" beat`);
      }
    }
    const bands = (scene.roles || []).map((r) => ROLE_DURATION[r]).filter(Boolean);
    if (bands.length && !isPrototype) {
      const min = Math.max(...bands.map((b) => b.min));
      if (scene.durationSec < min - 1e-6) warnings.push(`${where}: under the ${min}s role floor for ${scene.roles.join("+")}`);
    }

    // ---- art ---------------------------------------------------------------
    const usedSlots = new Set();
    for (const el of scene.art || []) {
      const tag = `${where}/art ${el.id || el.subject}`;
      if (!el.subject) errors.push(`${tag}: no subject`);
      else if (!known(el.subject)) errors.push(`${tag}: unknown subject "${el.subject}"`);
      if (!layout.slots[el.slot]) errors.push(`${tag}: unknown slot "${el.slot}" for layout ${scene.layout}`);
      else usedSlots.add(el.slot);
      if (el.entrance && !ENTRANCES.includes(el.entrance.kind)) {
        errors.push(`${tag}: entrance "${el.entrance.kind}" is not one of ${ENTRANCES.join("/")}`);
      }
      if (el.sustain && !SUSTAINS.includes(el.sustain.kind)) {
        errors.push(`${tag}: sustain "${el.sustain.kind}" is not one of ${SUSTAINS.join("/")}`);
      }
      if (el.scale != null && (el.scale <= 0 || el.scale > 1.6)) errors.push(`${tag}: scale ${el.scale} out of range`);
      if (el.scale != null && el.scale < 0.8 && !el.scaleReason) {
        errors.push(`${tag}: scale ${el.scale} shrinks art below its slot; say why with "scaleReason"`);
      }
    }

    // ---- populations -------------------------------------------------------
    for (const el of scene.populations || []) {
      const tag = `${where}/population ${el.id}`;
      if (!el.library) errors.push(`${tag}: no library`);
      else if (!known(`${el.library}-1`)) errors.push(`${tag}: no subject library named "${el.library}"`);
      if (!layout.slots[el.slot]) errors.push(`${tag}: unknown slot "${el.slot}"`);
      else usedSlots.add(el.slot);
      if ((el.count ?? 24) < 1) errors.push(`${tag}: count must be positive`);
      if ((el.count ?? 24) > 400) errors.push(`${tag}: count ${el.count} is beyond what a frame can read`);
    }

    // ---- deterministic lettering, and every V1 fact gate -------------------
    const ids = new Set();
    let words = 0;
    for (const el of scene.text || []) {
      const tag = `${where}/${el.id}`;
      if (!el.id) errors.push(`${where}: text layer without id`);
      if (ids.has(el.id)) errors.push(`${where}: duplicate text id "${el.id}"`);
      ids.add(el.id);
      if (typeof el.text !== "string" || !el.text.length) {
        errors.push(`${tag}: no string`);
        continue;
      }
      if (!layout.slots[el.slot]) errors.push(`${tag}: unknown slot "${el.slot}" for layout ${scene.layout}`);
      else {
        usedSlots.add(el.slot);
        // Text may only go in a slot the layout declares for text, because those
        // are the slots proven to sit inside the platform-safe box.
        if (layout.textSlots && !layout.textSlots.includes(el.slot)) {
          errors.push(
            `${tag}: slot "${el.slot}" is not a text slot of ${scene.layout} ` +
              `(text slots: ${layout.textSlots.join(", ")})`
          );
        }
      }
      if (el.motion && !TEXT_MOTIONS_V2.includes(el.motion.kind)) {
        errors.push(`${tag}: text motion "${el.motion.kind}" is not one of ${TEXT_MOTIONS_V2.join("/")}`);
      }
      for (const v of el.motion?.values || []) {
        const cv = verifyText(String(v), lock);
        for (const m of cv.malformed) errors.push(`${tag}: counter value ${JSON.stringify(m)} is malformed`);
        for (const nn of cv.unapproved) errors.push(`${tag}: counter value "${nn}" is not in the source`);
      }
      const check = verifyText(el.text, lock);
      for (const m of check.malformed) errors.push(`${tag}: malformed figure ${JSON.stringify(m)} in ${JSON.stringify(el.text)}`);
      for (const nn of check.unapproved) {
        errors.push(`${tag}: number "${nn}" in ${JSON.stringify(el.text)} is not in the source script/META`);
      }
      const start = el.motion?.startSec ?? 0;
      if (start >= scene.durationSec) errors.push(`${tag}: starts at ${start}s, after the scene ends`);

      const lineWords = el.text.split(/\s+/).filter(Boolean).length;
      const needs = lineWords / READING.wordsPerSec + MOTION.lineReadOverheadSec;
      const onScreenFor = scene.durationSec - start;
      if (!scene.roles?.includes("END_CARD") && onScreenFor < needs) {
        warnings.push(
          `${tag}: "${el.text.replace(/\n/g, " ")}" appears at ${start}s with only ${onScreenFor.toFixed(2)}s left, ` +
            `but ${lineWords} words need ${needs.toFixed(2)}s`
        );
      }
      words += lineWords;
    }
    if (words > 22) {
      errors.push(`${where}: ${words} words on screen; V2 breaks ideas into short progressive statements (cap 22)`);
    }

    // ---- marks -------------------------------------------------------------
    for (const el of scene.marks || []) {
      const tag = `${where}/mark ${el.id}`;
      if (!MARK_SHAPES.includes(el.shape)) errors.push(`${tag}: shape "${el.shape}" is not one of ${MARK_SHAPES.join("/")}`);
      if (!layout.slots[el.slot]) errors.push(`${tag}: unknown slot "${el.slot}"`);
    }

    // A scene must actually use its hero slot, or the layout is decoration.
    if (!usedSlots.has(layout.hero) && !scene.roles?.includes("END_CARD")) {
      errors.push(`${where}: layout ${scene.layout} declares hero slot "${layout.hero}" but nothing is bound to it`);
    }
    // Something must be on screen from the first frame.
    const opensEmpty =
      [...(scene.art || []), ...(scene.populations || [])].every((e) => (e.entrance?.startSec ?? 0) > 0.001) &&
      (scene.text || []).every((e) => (e.motion?.startSec ?? 0) > 0.001) &&
      !(scene.roles || []).includes("END_CARD");
    if (opensEmpty && (scene.art || []).length + (scene.populations || []).length > 0) {
      errors.push(
        `${where}: every element starts after t=0, so the scene opens on blank paper. ` +
          `V1 did this at four scene boundaries and it is why the video felt dead.`
      );
    }
  });

  // ---- story grammar ------------------------------------------------------
  if (!isPrototype) {
    if (!roles.has("HOOK")) errors.push("no scene carries HOOK");
    if (!spec.scenes[0]?.roles?.includes("HOOK")) errors.push("scene 0 must carry HOOK");
    if (!roles.has("CTA")) errors.push("no scene carries CTA");
    if (!roles.has("REVEAL")) errors.push("no scene carries REVEAL");
  }

  // Repetitive composition reads as cheap: three identical layouts in a row.
  for (let i = 2; i < layoutSequence.length; i++) {
    if (layoutSequence[i] === layoutSequence[i - 1] && layoutSequence[i] === layoutSequence[i - 2]) {
      warnings.push(`layout ${layoutSequence[i]} repeats three scenes in a row (scenes ${i - 2}-${i}); vary the composition`);
      break;
    }
  }

  // ---- reveal protection --------------------------------------------------
  if (opts.storyboard) {
    const guarded = protectedTokens(opts.storyboard);
    for (const scene of spec.scenes) {
      if (revealIndex !== -1 && scene.index >= revealIndex) continue;
      const haystack = (scene.text || []).map((t) => t.text).join("\n");
      for (const nn of screenNumberTokens(haystack)) {
        if (guarded.has(nn)) errors.push(`scene ${scene.index}: withheld figure "${nn}" appears before the reveal`);
      }
    }
  }

  // ---- CTA exactness ------------------------------------------------------
  if (lock.ctaKeyword && !isPrototype) {
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
    sceneCount: spec.scenes.length,
    prototype: isPrototype,
    factLockDigest: factLockDigest(lock),
  };
}
