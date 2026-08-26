// Storyboard manifest schema + the pre-spend validator (§45). AI output is DATA:
// it is validated here before a cent is spent on image generation, and nothing in
// it is ever executed.

import {
  CAPS,
  MOTIONS,
  TRANSITIONS,
  STORY_ROLES,
  READING,
  ROLE_DURATION,
} from "../config.mjs";
import { screenNumberTokens, normalizeNumberToken } from "./scriptParse.mjs";

/** @typedef {{x:number,y:number,w:number,h:number}} Region normalized 0-1, origin top-left */

/** @typedef {{
 *  id: string,
 *  desc: string,
 *  text?: string,
 *  region: Region,
 * }} SceneElement */

/** @typedef {{
 *  motion: 'PUSH'|'PULL'|'PAN'|'PUNCH'|'DRIFT'|'HOLD'|'REVEAL_CROP',
 *  focalElement?: string,
 *  weight?: number,
 *  transition?: 'CUT'|'SWIPE'|'WHIP',
 *  transitionDirection?: 'left'|'right'|'up'|'down',
 *  beatSync?: boolean,
 * }} Shot */

/** @typedef {{
 *  index: number,
 *  roles: string[],
 *  purpose: string,
 *  sourceText: string[],
 *  screenText: string[],
 *  visualGoal: string,
 *  imagePrompt: string,
 *  elements: SceneElement[],
 *  shots: Shot[],
 *  people?: string[],
 *  hookPromise?: string,
 *  shareTrigger?: string,
 *  saveTrigger?: string,
 * }} Scene */

/** @typedef {{
 *  slug: string,
 *  title: string,
 *  family: string|null,
 *  condensedStory: string,
 *  ctaKeyword: string|null,
 *  withheldInformation: string[],
 *  revealText: string[],
 *  shareTrigger: string,
 *  saveTrigger: string,
 *  scenes: Scene[],
 * }} Storyboard */

export function estimateReadTimeSec(screenText) {
  const words = screenText.join(" ").trim().split(/\s+/).filter(Boolean).length;
  return words / READING.wordsPerSec + READING.sceneOverheadSec;
}

function isRegion(r) {
  return (
    r &&
    typeof r === "object" &&
    [r.x, r.y, r.w, r.h].every((v) => typeof v === "number" && v >= 0 && v <= 1) &&
    r.x + r.w <= 1.001 &&
    r.y + r.h <= 1.001 &&
    r.w > 0 &&
    r.h > 0
  );
}

/** Reveal/withheld strings become "protected tokens": normalized number tokens plus
 * lowercased significant words. A pre-reveal scene containing any of them (in screen
 * text OR in its image prompt) leaks the payoff before it is paid for. */
export function protectedTokens(storyboard) {
  const tokens = new Set();
  for (const s of [...(storyboard.withheldInformation || []), ...(storyboard.revealText || [])]) {
    for (const n of screenNumberTokens(s)) {
      // Small numbers ("400 copies", "15,000 bought") legitimately appear pre-reveal;
      // only distinctive payoff-sized figures are protected. The model also lists the
      // full reveal strings, which are checked verbatim below.
      if (n.replace(/^\$/, "").length >= 6) tokens.add(n);
    }
  }
  return tokens;
}

function sceneIsRevealOrLater(scene, revealIndex) {
  return revealIndex !== -1 && scene.index >= revealIndex;
}

/**
 * Validate a storyboard manifest. Returns { ok, errors, warnings }.
 * Errors block paid generation. Warnings print but do not block.
 * @param {Storyboard} sb
 * @param {{ sourceNumbers?: Set<string>, expectReveal?: boolean }} opts
 */
export function validateStoryboard(sb, opts = {}) {
  const errors = [];
  const warnings = [];
  const { sourceNumbers, expectReveal = true } = opts;

  if (!sb || typeof sb !== "object") return { ok: false, errors: ["storyboard is not an object"], warnings };
  if (!Array.isArray(sb.scenes) || sb.scenes.length === 0) {
    return { ok: false, errors: ["storyboard has no scenes"], warnings };
  }

  if (sb.scenes.length > CAPS.maxMasterImages)
    errors.push(`${sb.scenes.length} scenes exceeds max ${CAPS.maxMasterImages}`);
  if (sb.scenes.length < CAPS.minMasterImages)
    warnings.push(`${sb.scenes.length} scenes is below normal minimum ${CAPS.minMasterImages}; fine only if the story is genuinely simple`);

  const allRoles = new Set();
  const motionSequence = [];
  let revealIndex = -1;
  sb.scenes.forEach((scene, i) => {
    if (scene.index !== i) errors.push(`scene ${i}: index ${scene.index} out of order`);
    if (!Array.isArray(scene.roles) || scene.roles.length === 0)
      errors.push(`scene ${i}: no roles`);
    for (const r of scene.roles || []) {
      if (!STORY_ROLES.includes(r)) errors.push(`scene ${i}: unknown role ${r}`);
      allRoles.add(r);
      if (r === "REVEAL" && revealIndex === -1) revealIndex = i;
    }
    if (!scene.imagePrompt || scene.imagePrompt.trim().length < 80)
      errors.push(`scene ${i}: imagePrompt missing or too thin to generate from`);
    if (!scene.visualGoal) warnings.push(`scene ${i}: no visualGoal`);
    if (!Array.isArray(scene.screenText)) errors.push(`scene ${i}: screenText missing`);

    // Every screen string must appear verbatim inside the image prompt (the prompt
    // is what actually puts words on paper).
    for (const t of scene.screenText || []) {
      if (t && !scene.imagePrompt.includes(t))
        errors.push(`scene ${i}: screenText "${t}" not present in imagePrompt`);
    }

    // Text density: one major idea per scene, no paragraph blocks.
    const totalWords = (scene.screenText || []).join(" ").split(/\s+/).filter(Boolean).length;
    if (totalWords > 28)
      errors.push(`scene ${i}: ${totalWords} words on screen; over the density cap (28)`);
    else if (totalWords > 20)
      warnings.push(`scene ${i}: ${totalWords} words on screen is heavy; consider simplifying`);
    for (const t of scene.screenText || []) {
      if (t.split(/\s+/).length > 12)
        warnings.push(`scene ${i}: line "${t.slice(0, 40)}..." exceeds 12 words`);
    }

    if (!Array.isArray(scene.elements) || scene.elements.length === 0) {
      errors.push(`scene ${i}: no elements (shots need focal targets)`);
    } else {
      for (const el of scene.elements) {
        if (!el.id) errors.push(`scene ${i}: element without id`);
        if (!isRegion(el.region)) errors.push(`scene ${i}: element ${el.id} has invalid region`);
      }
      const ids = scene.elements.map((e) => e.id);
      if (new Set(ids).size !== ids.length) errors.push(`scene ${i}: duplicate element ids`);
    }

    if (!Array.isArray(scene.shots) || scene.shots.length === 0) {
      errors.push(`scene ${i}: no shots`);
    } else {
      const elIds = new Set((scene.elements || []).map((e) => e.id));
      scene.shots.forEach((shot, j) => {
        if (!MOTIONS.includes(shot.motion))
          errors.push(`scene ${i} shot ${j}: unsupported motion ${shot.motion}`);
        if (shot.transition && !TRANSITIONS.includes(shot.transition))
          errors.push(`scene ${i} shot ${j}: unsupported transition ${shot.transition}`);
        if (shot.focalElement && !elIds.has(shot.focalElement))
          errors.push(`scene ${i} shot ${j}: focalElement ${shot.focalElement} not in elements`);
        motionSequence.push(shot.motion);
      });
    }

    // No number fabrication: every number on screen must exist in the source.
    if (sourceNumbers) {
      for (const t of scene.screenText || []) {
        for (const n of screenNumberTokens(t)) {
          if (!sourceNumbers.has(n))
            errors.push(`scene ${i}: number "${n}" in screenText not found in source script/META`);
        }
      }
    }
  });

  // Story grammar coverage.
  if (!allRoles.has("HOOK")) errors.push("no scene carries HOOK");
  if (!allRoles.has("CTA")) errors.push("no scene carries CTA");
  if (expectReveal && !allRoles.has("REVEAL")) errors.push("META declares a reveal but no scene carries REVEAL");
  if (sb.scenes[0] && !sb.scenes[0].roles.includes("HOOK"))
    errors.push("scene 0 must carry HOOK (first frame is the hook and the thumbnail)");

  // Withheld information must not leak before the reveal.
  const protectedSet = protectedTokens(sb);
  const revealStrings = (sb.revealText || []).filter((s) => s && s.length >= 4);
  for (const scene of sb.scenes) {
    if (sceneIsRevealOrLater(scene, revealIndex)) continue;
    const haystack = `${(scene.screenText || []).join("\n")}\n${scene.imagePrompt || ""}`;
    for (const n of screenNumberTokens(haystack)) {
      if (protectedSet.has(n))
        errors.push(`scene ${scene.index}: withheld number "${n}" appears before the reveal`);
    }
    for (const rs of revealStrings) {
      if (haystack.toUpperCase().includes(rs.toUpperCase()))
        errors.push(`scene ${scene.index}: reveal text "${rs}" appears before the reveal`);
    }
  }

  // CTA keyword must be on the CTA scene.
  if (sb.ctaKeyword) {
    const ctaScene = sb.scenes.find((s) => s.roles.includes("CTA"));
    if (ctaScene) {
      const text = (ctaScene.screenText || []).join(" ").toUpperCase();
      if (!text.includes(sb.ctaKeyword.toUpperCase()))
        errors.push(`CTA scene does not show the keyword "${sb.ctaKeyword}"`);
    }
  }

  // Robotic motion: the same motion three times in a row is a sequencing failure.
  for (let i = 2; i < motionSequence.length; i++) {
    if (
      motionSequence[i] === motionSequence[i - 1] &&
      motionSequence[i] === motionSequence[i - 2] &&
      motionSequence[i] !== "DRIFT"
    ) {
      warnings.push(`motion ${motionSequence[i]} repeats 3+ times consecutively; vary it`);
      break;
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Per-scene duration derived from roles + reading load, never uniform. Returns
 * seconds. The pacing curve (§12) lives in the role bands in config. */
export function sceneDurationSec(scene) {
  const read = estimateReadTimeSec(scene.screenText || []) * READING.comfortMultiplier;
  const bands = (scene.roles || [])
    .map((r) => ROLE_DURATION[r])
    .filter(Boolean);
  const min = bands.length ? Math.max(...bands.map((b) => b.min)) : 2.0;
  const max = bands.length ? Math.max(...bands.map((b) => b.max)) : 4.0;
  return Math.min(Math.max(read, min), max);
}
