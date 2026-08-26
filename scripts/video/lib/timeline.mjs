// Timeline builder: storyboard scenes/shots + music beats -> concrete render plan.
// Master image != video shot (§9): each scene's single image becomes several
// deterministic camera moves. Pacing is content-driven (reading load + role bands),
// then intelligently aligned to the music: scene boundaries and PUNCH/REVEAL moments
// snap to beats when a beat is close, never the other way round. Story clarity wins.

import { RENDER } from "../config.mjs";
import { sceneDurationSec } from "./schema.mjs";
import { MOTION_PROFILES } from "./easing.mjs";

/** @typedef {{x:number,y:number,w:number,h:number}} Region */

/** @typedef {{
 *  sceneIndex: number,
 *  imageFile: string,
 *  startSec: number,
 *  durationSec: number,
 *  motion: string,
 *  easing: string,
 *  from: {cx:number, cy:number, zoom:number},
 *  to: {cx:number, cy:number, zoom:number},
 *  transition: 'CUT'|'SWIPE'|'WHIP',
 *  transitionDirection: 'left'|'right'|'up'|'down',
 * }} RenderShot */

/** Snap a time to the nearest beat if one lies within tolerance. */
export function snapToBeat(timeSec, beats, tolerance = RENDER.beatSnapToleranceSec) {
  if (!beats || beats.length === 0) return timeSec;
  let best = null;
  for (const b of beats) {
    const d = Math.abs(b - timeSec);
    if (d <= tolerance && (best === null || d < Math.abs(best - timeSec))) best = b;
  }
  return best === null ? timeSec : best;
}

/** Focal region -> camera keyframe. zoom 1.0 shows the full image height; the
 * viewport is a 9:16 window inside the (9:16) master, so zoom 1.0 is full frame.
 * The camera centers on the element with padding, capped at maxZoom, clamped so
 * the viewport never leaves the image. */
export function cameraForRegion(region, opts = {}) {
  const maxZoom = opts.maxZoom ?? RENDER.maxZoom;
  const padding = opts.padding ?? 1.35; // viewport is 35% larger than the element
  if (!region) return { cx: 0.5, cy: 0.5, zoom: 1.0 };
  // Viewport (normalized, full frame = 1x1). Element must fit inside vp/padding.
  const needZoomH = 1 / Math.min(1, region.h * padding);
  const needZoomW = 1 / Math.min(1, region.w * padding);
  const zoom = Math.min(Math.max(1, Math.min(needZoomH, needZoomW)), maxZoom);
  const vpH = 1 / zoom;
  const vpW = 1 / zoom;
  const cx = clamp(region.x + region.w / 2, vpW / 2, 1 - vpW / 2);
  const cy = clamp(region.y + region.h / 2, vpH / 2, 1 - vpH / 2);
  return { cx, cy, zoom };
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

function regionFor(scene, elementId, boxes) {
  if (!elementId) return null;
  // QC-localized boxes (measured on the ACTUAL generated image) outrank the
  // storyboard's declared layout, which is only the intent.
  const measured = boxes?.[scene.index]?.[elementId];
  if (measured) return measured;
  const el = (scene.elements || []).find((e) => e.id === elementId);
  return el ? el.region : null;
}

/** Camera keyframes for one shot within its scene. */
export function shotCamera(scene, shot, prevShot, boxes) {
  const profile = MOTION_PROFILES[shot.motion] || MOTION_PROFILES.HOLD;
  const focal = regionFor(scene, shot.focalElement, boxes);
  const full = { cx: 0.5, cy: 0.5, zoom: 1.0 };
  const focalCam = focal ? cameraForRegion(focal) : full;

  switch (shot.motion) {
    case "PUSH":
      return { from: widen(focalCam, profile.zoomFrom / profile.zoomTo), to: focalCam, easing: profile.easing };
    case "PULL":
      return { from: focalCam.zoom > 1 ? focalCam : tighten(full, profile.zoomFrom), to: full, easing: profile.easing };
    case "PAN": {
      // Pan FROM the previous shot's resting camera TO this focal point at similar zoom.
      const fromCam = prevShot?.to || tighten(full, profile.zoomFrom);
      const z = Math.max(fromCam.zoom, focalCam.zoom, 1.15);
      return { from: { ...fromCam, zoom: z }, to: { ...focalCam, zoom: z }, easing: profile.easing };
    }
    case "PUNCH": {
      const from = prevShot?.to || full;
      const to = focal ? cameraForRegion(focal, { padding: 1.15 }) : tighten(full, profile.zoomTo);
      return { from, to, easing: profile.easing };
    }
    case "DRIFT": {
      const base = focalCam.zoom > 1 ? focalCam : tighten(full, profile.zoomFrom);
      return { from: base, to: { ...base, zoom: base.zoom * 1.05 }, easing: profile.easing };
    }
    case "REVEAL_CROP": {
      // Start framed AWAY from the withheld element, then move to include it.
      const start = prevShot?.to || tighten(full, profile.zoomFrom);
      return { from: start, to: focalCam.zoom > 1 ? focalCam : full, easing: profile.easing };
    }
    case "HOLD":
    default:
      return { from: focalCam, to: focalCam, easing: "linear" };
  }
}

function tighten(cam, zoom) {
  return { cx: cam.cx, cy: cam.cy, zoom };
}
function widen(cam, factor) {
  const zoom = Math.max(1, cam.zoom * factor);
  const vp = 1 / zoom;
  return { cx: clamp(cam.cx, vp / 2, 1 - vp / 2), cy: clamp(cam.cy, vp / 2, 1 - vp / 2), zoom };
}

/**
 * Build the full render timeline.
 * @param {import('./schema.mjs').Storyboard} sb
 * @param {{ index:number, imageFile:string }[]} sceneImages accepted images per scene
 * @param {{ beats?: number[], downbeats?: number[] }} musicAnalysis
 * @param {{ paceMultiplier?: number, elementBoxes?: Record<number, Record<string, Region>>, endCard?: string }} opts
 */
export function buildTimeline(sb, sceneImages, musicAnalysis = {}, opts = {}) {
  const pace = opts.paceMultiplier ?? 1.0;
  const beats = musicAnalysis.beats || [];
  const downbeats = musicAnalysis.downbeats || [];
  const boxes = opts.elementBoxes || {};
  const imageByScene = new Map(sceneImages.map((s) => [s.index, s.imageFile]));

  /** @type {RenderShot[]} */
  const shots = [];
  let cursor = 0;
  let revealAtSec = null;
  let ctaAtSec = null;

  sb.scenes.forEach((scene) => {
    const imageFile = imageByScene.get(scene.index);
    if (!imageFile) throw new Error(`scene ${scene.index} has no accepted image`);

    let dur = sceneDurationSec(scene) / pace;

    // Scene boundary lands on a beat when one is near.
    const snappedStart = shots.length === 0 ? 0 : snapToBeat(cursor, beats);
    const shift = snappedStart - cursor;
    if (Math.abs(shift) <= 0.5 && shots.length > 0) {
      shots[shots.length - 1].durationSec += shift;
      cursor = snappedStart;
    }

    if (scene.roles.includes("REVEAL") && revealAtSec === null) {
      // The reveal lands on a downbeat when one is close; a strong beat otherwise.
      const target = snapToBeat(cursor, downbeats.length ? downbeats : beats, 0.6);
      const d = target - cursor;
      if (Math.abs(d) <= 0.6 && shots.length > 0) {
        shots[shots.length - 1].durationSec += d;
        cursor = target;
      }
      revealAtSec = cursor;
    }
    if (scene.roles.includes("CTA") && ctaAtSec === null) ctaAtSec = cursor;

    // Distribute the scene duration across its shots by weight.
    const sceneShots = scene.shots.length ? scene.shots : [{ motion: "DRIFT" }];
    const weights = sceneShots.map((s) => s.weight || defaultShotWeight(s.motion));
    const totalW = weights.reduce((a, b) => a + b, 0);
    let prevRendered = null;
    sceneShots.forEach((shot, j) => {
      let shotDur = (dur * weights[j]) / totalW;
      // PUNCH moments inside a scene also like landing on percussion.
      if (shot.beatSync && j > 0 && beats.length) {
        const t = snapToBeat(cursor, beats, 0.3);
        const d = t - cursor;
        if (Math.abs(d) <= 0.3 && shots.length > 0) {
          shots[shots.length - 1].durationSec += d;
          cursor = t;
        }
      }
      const cam = shotCamera(scene, shot, prevRendered, boxes);
      const rendered = {
        sceneIndex: scene.index,
        imageFile,
        startSec: cursor,
        durationSec: shotDur,
        motion: shot.motion,
        easing: cam.easing,
        from: cam.from,
        to: cam.to,
        transition: j === 0 ? shot.transition || "CUT" : "CUT",
        transitionDirection: shot.transitionDirection || "left",
      };
      shots.push(rendered);
      prevRendered = rendered;
      cursor += shotDur;
    });
  });

  // End-card: the founder's hand-drawn 128 crown sheet, held. Free, on-brand, always last.
  if (opts.endCard) {
    shots.push({
      sceneIndex: -1,
      imageFile: opts.endCard,
      startSec: cursor,
      durationSec: RENDER.endCardSec / pace,
      motion: "DRIFT",
      easing: "linear",
      from: { cx: 0.5, cy: 0.5, zoom: 1.0 },
      to: { cx: 0.5, cy: 0.5, zoom: 1.05 },
      transition: "CUT",
      transitionDirection: "left",
    });
    cursor += RENDER.endCardSec / pace;
  }

  return {
    shots,
    totalDurationSec: cursor,
    revealAtSec,
    ctaAtSec,
    shotCount: shots.length,
  };
}

function defaultShotWeight(motion) {
  switch (motion) {
    case "PUNCH":
      return 0.7;
    case "HOLD":
      return 1.2;
    case "REVEAL_CROP":
      return 1.3;
    default:
      return 1.0;
  }
}
