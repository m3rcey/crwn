import { describe, it, expect } from "vitest";
import { buildTimeline, snapToBeat, cameraForRegion } from "./lib/timeline.mjs";
import { cameraAt, slideComposite, shotIndexAt } from "./lib/render.mjs";
import { ease } from "./lib/easing.mjs";
import { fixtureStoryboard } from "./lib/fixtures.mjs";
import { RENDER } from "./config.mjs";

const images = () => fixtureStoryboard().scenes.map((s) => ({ index: s.index, imageFile: `/img/${s.index}.jpg` }));

describe("snapToBeat", () => {
  it("snaps within tolerance, leaves otherwise", () => {
    expect(snapToBeat(10.2, [10.0, 11.0], 0.45)).toBe(10.0);
    expect(snapToBeat(10.6, [10.0, 12.0], 0.45)).toBe(10.6);
    expect(snapToBeat(5, [], 0.45)).toBe(5);
  });
});

describe("cameraForRegion", () => {
  it("caps zoom and clamps the viewport inside the image", () => {
    const cam = cameraForRegion({ x: 0.0, y: 0.0, w: 0.05, h: 0.02 });
    expect(cam.zoom).toBeLessThanOrEqual(RENDER.maxZoom);
    const vp = 1 / cam.zoom;
    expect(cam.cx - vp / 2).toBeGreaterThanOrEqual(-1e-9);
    expect(cam.cy - vp / 2).toBeGreaterThanOrEqual(-1e-9);
  });

  it("full-page region means no zoom", () => {
    expect(cameraForRegion({ x: 0, y: 0, w: 1, h: 1 }).zoom).toBe(1);
  });
});

describe("buildTimeline", () => {
  it("produces multiple shots per master image and non-uniform durations", () => {
    const sb = fixtureStoryboard();
    const tl = buildTimeline(sb, images(), {}, {});
    expect(tl.shotCount).toBeGreaterThan(sb.scenes.length * 1.5);
    const durs = tl.shots.map((s) => s.durationSec.toFixed(2));
    expect(new Set(durs).size).toBeGreaterThan(3);
  });

  it("reveal snaps to a downbeat within tolerance and is recorded", () => {
    const beats = Array.from({ length: 200 }, (_, i) => i * 0.5);
    const downbeats = beats.filter((_, i) => i % 4 === 0);
    const tl = buildTimeline(fixtureStoryboard(), images(), { beats, downbeats }, {});
    expect(tl.revealAtSec).not.toBeNull();
    const nearest = Math.min(...downbeats.map((b) => Math.abs(b - tl.revealAtSec)));
    expect(nearest).toBeLessThan(0.05);
    expect(tl.ctaAtSec).toBeGreaterThan(tl.revealAtSec);
  });

  it("pace multiplier shortens the whole video without dropping shots", () => {
    const base = buildTimeline(fixtureStoryboard(), images(), {}, {});
    const fast = buildTimeline(fixtureStoryboard(), images(), {}, { paceMultiplier: 1.2 });
    expect(fast.totalDurationSec).toBeLessThan(base.totalDurationSec);
    expect(fast.shotCount).toBe(base.shotCount);
  });

  it("appends the end card when provided", () => {
    const tl = buildTimeline(fixtureStoryboard(), images(), {}, { endCard: "/refs/128.jpg" });
    expect(tl.shots[tl.shots.length - 1].imageFile).toBe("/refs/128.jpg");
  });

  it("throws when a scene has no accepted image (resume guard)", () => {
    const imgs = images().slice(1);
    expect(() => buildTimeline(fixtureStoryboard(), imgs, {}, {})).toThrow(/no accepted image/);
  });

  it("measured QC boxes outrank declared regions", () => {
    const boxes = { 0: { PORTRAIT: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } } };
    const tl = buildTimeline(fixtureStoryboard(), images(), {}, { elementBoxes: boxes });
    const pushShot = tl.shots.find((s) => s.sceneIndex === 0 && s.motion === "PUSH");
    // camera centered near the measured box center (0.5, 0.5), not the declared (0.45, 0.55)
    expect(Math.abs(pushShot.to.cx - 0.5)).toBeLessThan(0.05);
  });
});

describe("render maths (pure)", () => {
  it("cameraAt hits exact endpoints", () => {
    const shot = { easing: "easeInOutCubic", from: { cx: 0.3, cy: 0.3, zoom: 1 }, to: { cx: 0.6, cy: 0.6, zoom: 2 } };
    expect(cameraAt(shot, 0)).toEqual(shot.from);
    expect(cameraAt(shot, 1)).toEqual(shot.to);
    const mid = cameraAt(shot, 0.5);
    expect(mid.zoom).toBeGreaterThan(1);
    expect(mid.zoom).toBeLessThan(2);
  });

  it("easings are monotonic with exact endpoints", () => {
    for (const name of ["easeInOutSine", "punch", "holdThenGo", "easeOutQuint"]) {
      expect(ease(name, 0)).toBe(0);
      expect(ease(name, 1)).toBe(1);
      let prev = -1e-9;
      for (let t = 0; t <= 1.0001; t += 0.01) {
        const v = ease(name, t);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it("slideComposite at 0 is the old frame, at 1 the new frame", () => {
    const size = RENDER.width * RENDER.height * 3;
    const oldF = Buffer.alloc(size, 10);
    const newF = Buffer.alloc(size, 200);
    expect(slideComposite(oldF, newF, 0).equals(oldF)).toBe(true);
    expect(slideComposite(oldF, newF, 1).equals(newF)).toBe(true);
    const half = slideComposite(oldF, newF, 0.5);
    expect(half[0]).toBe(10); // left half still old
    expect(half[size - 1]).toBe(200); // right half new
  });

  it("shotIndexAt finds the active shot", () => {
    const shots = [
      { startSec: 0, durationSec: 2 },
      { startSec: 2, durationSec: 3 },
    ];
    expect(shotIndexAt(shots, 0.5)).toBe(0);
    expect(shotIndexAt(shots, 2.5)).toBe(1);
    expect(shotIndexAt(shots, 99)).toBe(1);
  });
});
