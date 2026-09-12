import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, RENDER, MOTION } from "./config.mjs";
import { validateMotionSpecV2, specDurationSecV2, BEAT_BANDS } from "./lib/motionSpecV2.mjs";
import {
  collectSpritesV2,
  computeSceneRowsV2,
  dryRunManifestV2,
  planSegmentsV2,
  sceneSegmentHashV2,
  fontPxForSlot,
  throughCamera,
  heroBoxes,
  RENDER_ENGINE_VERSION_V2,
} from "./lib/motionRenderV2.mjs";
import { auditGeometry, measureFrame } from "./lib/visualQa.mjs";
import { verifyFacts } from "./lib/verify.mjs";
import { buildFactLock } from "./lib/factLock.mjs";
import { resolveLayout, SAFE } from "./lib/composition.mjs";
import {
  labelComponents,
  selectComponents,
  isEnclosedBy,
  touchesLetteredRegion,
} from "./lib/isolate.mjs";
import {
  entranceDelta,
  sustainDelta,
  artState,
  cameraAt,
  parallaxOffset,
  populationState,
  windowProgress,
  wobble,
} from "./lib/sceneMotion.mjs";
import { fixtureParsedScript } from "./lib/fixtures.mjs";
import { spriteHash } from "./lib/lettering.mjs";

const ARTWORK = path.join(REPO_ROOT, "scripts/vsl/assets/crown-black.png");
const lock = () => buildFactLock(fixtureParsedScript());

/** A minimal but VALID V2 spec: two beats plus an end card. */
function v2spec() {
  return {
    slug: "34-ryan-leslie-forty-thousand-numbers-v2",
    title: "Ryan Leslie: forty thousand numbers",
    sourceScript: "videos/scripts/fan-economy/34-ryan-leslie-forty-thousand-numbers.md",
    targetDurationSec: 76.0,
    durationToleranceSec: 0.06,
    requiredFigures: ["40,000", "15,000", "$2,000,000"],
    artwork: [{ id: "sheet", file: ARTWORK, letteredRegions: [{ id: "words", x: 0.0, y: 0.9, w: 1, h: 0.1 }] }],
    subjects: [
      { id: "figure", artwork: "sheet", mode: "subject", region: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 } },
      { id: "fan", artwork: "sheet", mode: "each", region: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 } },
    ],
    plates: [],
    scenes: [
      {
        index: 0,
        roles: ["HOOK"],
        beat: "hook",
        durationSec: 4.0,
        layout: "HERO_CENTER",
        purpose: "the question",
        camera: { keys: [{ at: 0, cx: 0.5, cy: 0.5, zoom: 1.04 }, { at: 4, cx: 0.5, cy: 0.5, zoom: 1.0 }] },
        art: [
          {
            id: "f",
            subject: "figure",
            slot: "hero",
            entrance: { kind: "SETTLE_IN", startSec: -0.4, durSec: 0.9, overshoot: 0.06 },
            sustain: { kind: "BREATHE", amp: 1 },
          },
        ],
        text: [{ id: "q", text: "40,000 NUMBERS", slot: "lead", motion: { kind: "WRITE", startSec: 0.3, durSec: 0.8 } }],
      },
      {
        index: 1,
        roles: ["REVEAL"],
        beat: "reveal",
        durationSec: 6.0,
        layout: "EQUATION_REVEAL",
        purpose: "the total",
        camera: { keys: [{ at: 0, cx: 0.5, cy: 0.45, zoom: 1.05 }, { at: 6, cx: 0.5, cy: 0.5, zoom: 1.0 }] },
        populations: [
          {
            id: "owners",
            library: "fan",
            slot: "evidence",
            count: 6,
            itemHeight: 0.14,
            seed: 3,
            startSec: -1.2,
            durSec: 1.4,
          },
        ],
        text: [
          { id: "t", text: "$2,000,000", slot: "row2", motion: { kind: "RISE", startSec: 0.4 } },
          { id: "c", text: "15,000 BUYERS", slot: "row3", motion: { kind: "RISE", startSec: 2.0 } },
        ],
      },
      {
        index: 2,
        roles: ["CTA"],
        beat: "cta",
        durationSec: 66.0,
        layout: "CTA_FULL_FRAME",
        purpose: "the keyword",
        populations: [
          { id: "top", library: "fan", slot: "art", count: 4, itemHeight: 0.2, seed: 1, startSec: -0.4, durSec: 1.0 },
        ],
        text: [{ id: "k", text: "COMMENT OWN", slot: "keyword", motion: { kind: "RISE", startSec: 0.4 } }],
      },
    ],
  };
}

const validate = (s, opts = {}) => validateMotionSpecV2(s, lock(), { repoRoot: REPO_ROOT, ...opts });

/** Sprite metrics without rendering: enough for geometry to be computed. */
function fakeSprites(spec) {
  const { requests, byLayer } = collectSpritesV2(spec);
  const sprites = new Map();
  for (const r of requests) {
    const lines = String(r.text).split("\n").length;
    sprites.set(r.hash, {
      file: `/dev/null/${r.hash}.png`,
      width: Math.round(r.fontPx * 0.52 * Math.max(...String(r.text).split("\n").map((l) => l.length))),
      height: Math.round(r.fontPx * 1.12 * lines),
    });
  }
  const subjects = new Map([
    ["figure", { file: "/x/figure.png", width: 1000, height: 1700, aspect: 1000 / 1700, inkArea: 100000 }],
  ]);
  for (let i = 1; i <= 8; i++) {
    subjects.set(`fan-${i}`, { file: `/x/fan-${i}.png`, width: 40, height: 90, aspect: 40 / 90, inkArea: 900 });
  }
  return { requests, byLayer, sprites, subjects, plates: new Map(), lock: lock() };
}

describe("V2 spec validation keeps every V1 correctness gate", () => {
  it("passes the reference spec", () => {
    const r = validate(v2spec());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("refuses a fabricated figure", () => {
    const s = v2spec();
    s.scenes[1].text[0].text = "$3,500,000";
    expect(validate(s).errors.join()).toMatch(/is not in the source script\/META/);
  });

  it("refuses a malformed figure", () => {
    const s = v2spec();
    s.scenes[1].text[0].text = "$2,000,00";
    expect(validate(s).errors.join()).toMatch(/malformed figure/);
  });

  it("checks every counter value, not just the last", () => {
    const s = v2spec();
    s.scenes[1].text[0].motion = { kind: "COUNTER", startSec: 0.2, durSec: 1, values: ["$500,000", "$9,999,999"] };
    expect(validate(s).errors.join()).toMatch(/counter value "9999999" is not in the source/);
  });

  it("requires the CTA keyword exactly", () => {
    const s = v2spec();
    s.scenes[2].text[0].text = "COMMENT Own";
    expect(validate(s).errors.join()).toMatch(/does not show the keyword "OWN" exactly/);
  });

  it("refuses to render when the sources disagree", () => {
    const parsed = fixtureParsedScript();
    parsed.warnings = ['CTA keyword conflict: script says "OWN", META lead magnet says "VAULT"'];
    const r = validateMotionSpecV2(v2spec(), buildFactLock(parsed), { repoRoot: REPO_ROOT });
    expect(r.errors.join()).toMatch(/source conflict, refusing to render/);
  });

  it("keeps the withheld payoff out of scenes before the reveal", () => {
    const s = v2spec();
    s.scenes[0].text.push({
      id: "leak",
      text: "$2,000,000",
      slot: "sub",
      motion: { kind: "RISE", startSec: 0.5 },
    });
    const storyboard = {
      withheldInformation: ["$2,000,000"],
      revealText: ["OVER $2,000,000"],
      scenes: [],
    };
    expect(validate(s, { storyboard }).errors.join()).toMatch(/withheld figure "2000000" appears before the reveal/);
  });

  it("fails a missing artwork file", () => {
    const s = v2spec();
    s.artwork[0].file = "videos/nope/missing.jpg";
    expect(validate(s).errors.join()).toMatch(/artwork "sheet" file not found/);
  });

  it("requires HOOK first, plus a REVEAL and a CTA", () => {
    const s = v2spec();
    s.scenes[0].roles = ["CONTEXT"];
    expect(validate(s).errors.join()).toMatch(/scene 0 must carry HOOK/);
  });
});

describe("V2 spec validation adds composition gates", () => {
  it("requires a known layout", () => {
    const s = v2spec();
    s.scenes[0].layout = "FREESTYLE";
    expect(validate(s).errors.join()).toMatch(/unknown or missing layout "FREESTYLE"/);
  });

  it("requires the hero slot to actually carry something", () => {
    const s = v2spec();
    s.scenes[0].art = [];
    expect(validate(s).errors.join()).toMatch(/declares hero slot "hero" but nothing is bound to it/);
  });

  it("refuses text in a slot the layout does not declare for text", () => {
    const s = v2spec();
    s.scenes[0].text[0].slot = "hero";
    expect(validate(s).errors.join()).toMatch(/is not a text slot of HERO_CENTER/);
  });

  it("refuses a scene where everything starts after t=0", () => {
    const s = v2spec();
    s.scenes[0].art[0].entrance.startSec = 0.5;
    s.scenes[0].text[0].motion.startSec = 0.5;
    expect(validate(s).errors.join()).toMatch(/opens on blank paper/);
  });

  it("enforces the pacing floor that V1 violated", () => {
    const s = v2spec();
    s.scenes[1].durationSec = 2.0;
    s.scenes[2].durationSec = 70.0;
    const r = validate(s);
    expect(r.errors.join()).toMatch(/under the 5s floor for a "reveal" beat/);
    expect(BEAT_BANDS.reveal.min).toBeGreaterThan(BEAT_BANDS.hook.min);
  });

  it("holds the explainer inside the duration the brief allows", () => {
    const s = v2spec();
    s.scenes[2].durationSec = 10.0;
    s.targetDurationSec = 20.0;
    expect(validate(s).errors.join()).toMatch(/outside the 70-122s/);
  });

  it("requires a stated reason for a layout override", () => {
    const s = v2spec();
    s.scenes[0].layoutOverrides = { slots: { lead: { y: 0.6 } } };
    expect(validate(s).errors.join()).toMatch(/must carry a "reason"/);
    s.scenes[0].layoutOverrides.reason = "the hero needs the lower third in this beat";
    expect(validate(s).ok).toBe(true);
  });

  it("requires a stated reason to shrink art below its slot", () => {
    const s = v2spec();
    s.scenes[0].art[0].scale = 0.5;
    expect(validate(s).errors.join()).toMatch(/say why with "scaleReason"/);
  });

  it("caps on-screen words harder than V1 did", () => {
    const s = v2spec();
    s.scenes[0].text[0].text = Array.from({ length: 25 }, () => "WORD").join(" ");
    expect(validate(s).errors.join()).toMatch(/short progressive statements \(cap 22\)/);
  });

  it("refuses an unknown entrance, sustain, text motion or mark shape", () => {
    const s1 = v2spec();
    s1.scenes[0].art[0].entrance.kind = "EXPLODE";
    expect(validate(s1).errors.join()).toMatch(/entrance "EXPLODE"/);
    const s2 = v2spec();
    s2.scenes[0].art[0].sustain = { kind: "WIGGLE" };
    expect(validate(s2).errors.join()).toMatch(/sustain "WIGGLE"/);
    const s3 = v2spec();
    s3.scenes[0].text[0].motion.kind = "SPARKLE";
    expect(validate(s3).errors.join()).toMatch(/text motion "SPARKLE"/);
    const s4 = v2spec();
    s4.scenes[0].marks = [{ id: "m", shape: "squiggle", slot: "lead", motion: {} }];
    expect(validate(s4).errors.join()).toMatch(/shape "squiggle"/);
  });
});

describe("the camera has to be numbers", () => {
  it("refuses a non-numeric camera key", () => {
    // A generator bug produced {"at":"at","zoom":"zoom"} for every key in every
    // scene; it passed validation and died in the rasterizer as a NaN width.
    const s = v2spec();
    s.scenes[0].camera = { keys: [{ at: "at", cx: "cx", cy: "cy", zoom: "zoom" }] };
    const r = validate(s);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/field "zoom" is "zoom", not a finite number/);
  });

  it("refuses a zoom under 1 or past the ceiling, and keys that go backwards", () => {
    const s1 = v2spec();
    s1.scenes[0].camera.keys[0].zoom = 0.5;
    expect(validate(s1).errors.join()).toMatch(/zoom=0.5 is outside/);
    const s2 = v2spec();
    s2.scenes[0].camera.keys[0].zoom = 9;
    expect(validate(s2).errors.join()).toMatch(/zoom=9 is outside/);
    const s3 = v2spec();
    s3.scenes[0].camera.keys = [{ at: 3, zoom: 1 }, { at: 1, zoom: 1 }];
    expect(validate(s3).errors.join()).toMatch(/goes backwards/);
  });

  it("refuses a NaN and an empty key list", () => {
    const s1 = v2spec();
    s1.scenes[0].camera.keys[0].cx = NaN;
    expect(validate(s1).errors.join()).toMatch(/not a finite number/);
    const s2 = v2spec();
    s2.scenes[0].camera = { keys: [] };
    expect(validate(s2).errors.join()).toMatch(/camera has no keys/);
  });
});

describe("the V2 manifest and geometry", () => {
  it("reports lettering in SCREEN space, so the camera cannot move it", () => {
    const s = v2spec();
    const ctx = fakeSprites(s);
    const rows = computeSceneRowsV2(s.scenes[0], ctx);
    const layout = resolveLayout("HERO_CENTER");
    const row = rows.find((r) => r.id === "q");
    // The layout slot is the authority; a 1.04 camera zoom must not shift it.
    expect(row.box.y).toBeGreaterThanOrEqual(layout.slots.lead.y - 0.02);
    expect(row.box.y + row.box.h).toBeLessThanOrEqual(layout.slots.lead.y + layout.slots.lead.h + 0.02);
  });

  it("still reports a world-space layer through the camera", () => {
    const flat = throughCamera({ x: 0.1, y: 0.8, w: 0.5, h: 0.05 }, { cx: 0.5, cy: 0.5, zoom: 1 });
    const pushed = throughCamera({ x: 0.1, y: 0.8, w: 0.5, h: 0.05 }, { cx: 0.5, cy: 0.5, zoom: 1.2 });
    expect(flat.y).toBeCloseTo(0.8, 6);
    expect(pushed.y).toBeGreaterThan(flat.y);
  });

  it("keeps every text box inside the text-safe area", () => {
    const s = v2spec();
    const ctx = fakeSprites(s);
    const manifest = dryRunManifestV2(s, ctx);
    const r = auditGeometry(manifest, s);
    expect(r.errors).toEqual([]);
  });

  it("fails a text box pushed out of the safe area", () => {
    const manifest = {
      layers: [{ scene: 0, id: "x", text: "HI", box: { x: 0.01, y: 0.5, w: 0.5, h: 0.06 }, fromSec: 0, toSec: 2 }],
      heroes: [],
    };
    expect(auditGeometry(manifest, { scenes: [{ index: 0, text: [{ id: "x" }] }] }).errors.join()).toMatch(
      /leaves the text-safe area/
    );
  });

  it("fails text too small to read on a phone", () => {
    const manifest = {
      layers: [{ scene: 0, id: "x", text: "HI", box: { x: 0.2, y: 0.5, w: 0.5, h: 0.012 }, fromSec: 0, toSec: 2 }],
      heroes: [],
    };
    expect(auditGeometry(manifest, { scenes: [{ index: 0, text: [{ id: "x" }] }] }).errors.join()).toMatch(
      /under the .* readable floor/
    );
  });

  it("fails a hero that renders tiny, which is the V1 defect", () => {
    const manifest = {
      layers: [],
      heroes: [{ scene: 0, id: "h", slot: "hero", isHero: true, box: { x: 0.4, y: 0.4, w: 0.1, h: 0.12 } }],
    };
    const r = auditGeometry(manifest, { scenes: [{ index: 0 }] });
    expect(r.errors.join()).toMatch(/renders only 12% of frame height/);
  });

  it("lets a scene declare a smaller hero with a reason", () => {
    const manifest = {
      layers: [],
      heroes: [{ scene: 0, id: "h", slot: "small", isHero: true, box: { x: 0.4, y: 0.4, w: 0.1, h: 0.12 } }],
    };
    const spec = { scenes: [{ index: 0, qa: { minHeroHeight: 0.1, reason: "a scale comparison needs one side small" } }] };
    expect(auditGeometry(manifest, spec).errors).toEqual([]);
  });

  it("fails two text layers overlapping while both visible, and allows sequential ones", () => {
    const boxes = (aFrom, aTo, bFrom, bTo) => ({
      layers: [
        { scene: 0, id: "a", text: "A", box: { x: 0.1, y: 0.5, w: 0.6, h: 0.06 }, fromSec: aFrom, toSec: aTo },
        { scene: 0, id: "b", text: "B", box: { x: 0.12, y: 0.51, w: 0.6, h: 0.06 }, fromSec: bFrom, toSec: bTo },
      ],
      heroes: [],
    });
    const spec = { scenes: [{ index: 0, text: [{ id: "a" }, { id: "b" }] }] };
    expect(auditGeometry(boxes(0, 3, 1, 3), spec).errors.join()).toMatch(/overlap/);
    expect(auditGeometry(boxes(0, 1, 1.5, 3), spec).errors).toEqual([]);
  });

  it("reports zero generative calls and passes the fact check it was built from", () => {
    const s = v2spec();
    const ctx = fakeSprites(s);
    const m = dryRunManifestV2(s, ctx);
    expect(m.generativeImageCalls).toBe(0);
    expect(m.generativeVideoCalls).toBe(0);
    const r = verifyFacts(m, lock(), s, { safeZone: null, requiredNumbers: [], requireCta: true });
    expect(r.errors).toEqual([]);
  });

  it("is deterministic: same spec, same manifest", () => {
    const s = v2spec();
    const a = JSON.stringify(dryRunManifestV2(s, fakeSprites(s)).layers);
    const b = JSON.stringify(dryRunManifestV2(s, fakeSprites(s)).layers);
    expect(a).toBe(b);
  });

  it("derives font size from the slot, so a long line is not shrunk to nothing", () => {
    const slot = { x: 0.1, y: 0.4, w: 0.8, h: 0.1 };
    const short = fontPxForSlot("400", slot);
    const long = fontPxForSlot("400 COPIES TIMES THREE HUNDRED DOLLARS", slot);
    expect(short).toBeGreaterThan(long);
    expect(long).toBeGreaterThan(18);
  });
});

describe("scene-level repair survives in V2", () => {
  const segDir = "/segments";
  it("reuses unchanged scenes and rebuilds only what changed", () => {
    const s = v2spec();
    const ctx = fakeSprites(s);
    const hashes = new Map(s.scenes.map((sc) => [sc.index, sceneSegmentHashV2(sc, ctx)]));
    const plan = planSegmentsV2(s, {
      ...ctx,
      segDir,
      exists: () => true,
      readState: (p) => {
        const idx = Number(/scene-(\d+)/.exec(p)[1]);
        return { hash: idx === 1 ? "stale" : hashes.get(idx), rows: [], heroes: [] };
      },
    });
    expect(plan.get(0).reuse).toBe(true);
    expect(plan.get(1).reuse).toBe(false);
    expect(plan.get(2).reuse).toBe(true);
  });

  it("rebuilds exactly the scenes named by onlyScenes", () => {
    const s = v2spec();
    const ctx = fakeSprites(s);
    const hashes = new Map(s.scenes.map((sc) => [sc.index, sceneSegmentHashV2(sc, ctx)]));
    const plan = planSegmentsV2(s, {
      ...ctx,
      segDir,
      onlyScenes: [2],
      exists: () => true,
      readState: (p) => ({ hash: hashes.get(Number(/scene-(\d+)/.exec(p)[1])), rows: [], heroes: [] }),
    });
    expect([...plan.values()].filter((v) => !v.reuse).map((v) => v.seg)).toEqual([path.join(segDir, "scene-02.mp4")]);
  });

  it("keys the cache on the renderer version as well as the spec", () => {
    expect(RENDER_ENGINE_VERSION_V2).toBeGreaterThanOrEqual(1);
    const s = v2spec();
    const ctx = fakeSprites(s);
    const before = sceneSegmentHashV2(s.scenes[0], ctx);
    s.scenes[0].text[0].text = "40,000 PHONE NUMBERS";
    expect(sceneSegmentHashV2(s.scenes[0], fakeSprites(s))).not.toBe(before);
  });

  it("invalidates a segment when the LAYOUT geometry changes, not just the scene", () => {
    // A scene stores a layout NAME, so tuning that layout's slots changes every
    // frame it draws while the scene JSON stays byte-identical. Without the
    // resolved layout in the hash the cache would serve stale geometry, which
    // nearly happened when a slot was nudged mid-render.
    const s = v2spec();
    const ctx = fakeSprites(s);
    const before = sceneSegmentHashV2(s.scenes[0], ctx);
    const moved = JSON.parse(JSON.stringify(s));
    moved.scenes[0].layoutOverrides = { reason: "test", slots: { lead: { y: 0.62 } } };
    expect(sceneSegmentHashV2(moved.scenes[0], fakeSprites(moved))).not.toBe(before);
  });

  it("rebuilds rather than trusting an unreadable state file", () => {
    const s = v2spec();
    const ctx = fakeSprites(s);
    const plan = planSegmentsV2(s, {
      ...ctx,
      segDir,
      exists: () => true,
      readState: () => {
        throw new Error("corrupt");
      },
    });
    expect([...plan.values()].every((v) => !v.reuse)).toBe(true);
  });
});

describe("V2 motion primitives", () => {
  it("separates entrance from sustain, so nothing is ever frozen", () => {
    // The V1 defect: every primitive reached its final state and held.
    const a = sustainDelta("FLOAT", "x", 1.0, { amp: 1 });
    const b = sustainDelta("FLOAT", "x", 3.7, { amp: 1 });
    expect(a.dx).not.toBeCloseTo(b.dx, 6);
    const c = sustainDelta("BREATHE", "x", 1.0, { amp: 1 });
    const d = sustainDelta("BREATHE", "x", 3.7, { amp: 1 });
    expect(c.scale).not.toBeCloseTo(d.scale, 6);
  });

  it("keeps sustains small enough to read as life rather than jitter", () => {
    for (const t of [0.3, 1.1, 2.9, 5.5]) {
      const f = sustainDelta("FLOAT", "id", t, { amp: 1 });
      expect(Math.abs(f.dx)).toBeLessThan(0.01);
      expect(Math.abs(f.dy)).toBeLessThan(0.015);
      const b = sustainDelta("BREATHE", "id", t, { amp: 1 });
      expect(Math.abs(b.scale - 1)).toBeLessThan(0.02);
    }
  });

  it("is seeded, not random: identical inputs letter and drift identically", () => {
    expect(wobble("abc", 1.234, 0.5)).toBe(wobble("abc", 1.234, 0.5));
    expect(wobble("abc", 1.234, 0.5)).not.toBe(wobble("abd", 1.234, 0.5));
  });

  it("hides an element before its entrance and holds it after", () => {
    expect(entranceDelta("RISE", 0).hidden).toBe(true);
    expect(entranceDelta("RISE", 1)).toMatchObject({ dx: 0, dy: 0, scale: 1, opacity: 1 });
  });

  it("never lets RISE start so low that a bottom slot leaves the frame", () => {
    // 0.10 was the original default and it pushed bottom-row text below the
    // safe area on four scenes.
    const d = entranceDelta("RISE", 0.001);
    expect(d.dy).toBeLessThan(0.02);
  });

  it("GROW_UP anchors at the base, so a stack grows instead of inflating", () => {
    const d = entranceDelta("GROW_UP", 0.5);
    expect(d.scaleY).toBeCloseTo(0.5, 6);
    expect(d.anchorY).toBe(1);
  });

  it("interpolates the camera across keyframes and holds the ends", () => {
    const c = { keys: [{ at: 0, cx: 0.4, cy: 0.4, zoom: 1.0 }, { at: 2, cx: 0.6, cy: 0.6, zoom: 1.2, easing: "linear" }] };
    expect(cameraAt(c, -1, 2).cx).toBeCloseTo(0.4, 6);
    expect(cameraAt(c, 1, 2).cx).toBeCloseTo(0.5, 2);
    expect(cameraAt(c, 9, 2).zoom).toBeCloseTo(1.2, 6);
  });

  it("moves background less than foreground, which is what parallax means", () => {
    const cam = { cx: 0.35, cy: 0.5, zoom: 1.1 };
    const back = parallaxOffset(cam, 0.4);
    const fore = parallaxOffset(cam, 1.6);
    expect(Math.abs(fore.dx)).toBeGreaterThan(Math.abs(back.dx));
    expect(Math.sign(fore.dx)).not.toBe(Math.sign(back.dx));
  });

  it("populates a crowd over time and holds it once landed", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ order: i, x: 0.1 * i, y: 0.5, scale: 1, depth: 0 }));
    const spec = { startSec: 0, durSec: 1.6, itemDurSec: 0.4 };
    expect(populationState(items, spec, 0.05).length).toBeLessThan(items.length);
    expect(populationState(items, spec, 9).length).toBe(items.length);
  });

  it("gives every populated figure its own continuing drift", () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ order: i, x: 0.2, y: 0.5, scale: 1, depth: 0 }));
    const spec = { startSec: -2, durSec: 1 };
    const a = populationState(items, spec, 3.0);
    const b = populationState(items, spec, 3.6);
    expect(a.map((i) => i.driftY)).not.toEqual(b.map((i) => i.driftY));
  });

  it("places art from the layout box, not from a typed coordinate", () => {
    const base = { x: 0.2, y: 0.2, w: 0.6, h: 0.5 };
    const st = artState({ id: "a", entrance: { kind: "CUT" } }, base, 1.0, 4);
    expect(st.x).toBeCloseTo(base.x, 6);
    expect(st.w).toBeCloseTo(base.w, 6);
  });
});

describe("subject isolation", () => {
  // A 12x12 field: a ring with a dot inside it, and a separate bar outside.
  const W = 12;
  const H = 12;
  function field() {
    const g = new Uint8Array(W * H).fill(255);
    const ink = (x, y) => (g[y * W + x] = 0);
    for (let x = 1; x <= 7; x++) {
      ink(x, 1);
      ink(x, 7);
    }
    for (let y = 1; y <= 7; y++) {
      ink(1, y);
      ink(7, y);
    }
    ink(4, 4); // the enclosed dot: a face feature
    ink(10, 10); // something else entirely
    ink(10, 9);
    return g;
  }

  it("labels separate marks as separate components", () => {
    const { components } = labelComponents(field(), W, H, 200);
    expect(components.length).toBe(3);
  });

  it("re-attaches an enclosed detail to its host, which is how a face survives", () => {
    // The first V2 prototype rendered Curren$y faceless because his eyes are
    // drawn inside his head without touching it and an area filter dropped them.
    const g = field();
    const { labels, components } = labelComponents(g, W, H, 200);
    const ring = components.sort((a, b) => b.area - a.area)[0];
    const dot = components.find((c) => c.area === 1 && c.x0 === 4);
    const bar = components.find((c) => c.x0 === 10);
    expect(isEnclosedBy(dot, ring, labels, W, H)).toBe(true);
    expect(isEnclosedBy(bar, ring, labels, W, H)).toBe(false);
  });

  it("mode 'subject' returns the body plus its enclosed detail", () => {
    const g = field();
    const { labels, components } = labelComponents(g, W, H, 200);
    const analysis = { grey: g, labels, components, width: W, height: H };
    const groups = selectComponents(analysis, { x: 0, y: 0, w: 0.7, h: 0.7 }, { mode: "subject" });
    expect(groups.length).toBe(1);
    expect(groups[0].length).toBe(2); // the ring and the dot, not the far bar
  });

  it("mode 'each' yields one subject per mark and can reject wide strays", () => {
    const g = field();
    const { labels, components } = labelComponents(g, W, H, 200);
    const analysis = { grey: g, labels, components, width: W, height: H };
    const all = selectComponents(analysis, { x: 0, y: 0, w: 1, h: 1 }, { mode: "each", minAreaFrac: 0 });
    expect(all.length).toBe(3);
    const tall = selectComponents(analysis, { x: 0, y: 0, w: 1, h: 1 }, { mode: "each", minAreaFrac: 0, maxAspect: 0.6 });
    expect(tall.length).toBeLessThan(all.length);
  });

  it("refuses a component that really inks a lettered region, by PIXELS not boxes", () => {
    const g = field();
    const { labels, components } = labelComponents(g, W, H, 200);
    const ring = components.sort((a, b) => b.area - a.area)[0];
    // A region the ring's box spans but its ink avoids: the box test would have
    // refused Curren$y outright, which is why this counts pixels.
    const inner = [{ id: "inside-the-ring", x: 3 / W, y: 3 / H, w: 2 / W, h: 2 / H }];
    expect(touchesLetteredRegion([ring], inner, W, H, labels)).toBeNull();
  });
});

describe("frame measurement", () => {
  it("reports ink, coverage and the largest blank band", async () => {
    const sharp = (await import("sharp")).default;
    const tmp = path.join(os.tmpdir(), `crwn-qa-${Date.now()}.jpg`);
    // A black bar across the top third, white below: 1/3 ink, a big blank band.
    await sharp({ create: { width: 108, height: 192, channels: 3, background: "#FFFFFF" } })
      .composite([{ input: { create: { width: 108, height: 64, channels: 3, background: "#000000" } }, left: 0, top: 0 }])
      .jpeg()
      .toFile(tmp);
    const m = await measureFrame(tmp);
    expect(m.ink).toBeGreaterThan(0.28);
    expect(m.ink).toBeLessThan(0.4);
    expect(m.worstEmptyBand.size).toBeGreaterThan(0.55);
    fs.rmSync(tmp, { force: true });
  });

  it("reports an empty frame as empty, which V1's QA never did", async () => {
    const sharp = (await import("sharp")).default;
    const tmp = path.join(os.tmpdir(), `crwn-qa-blank-${Date.now()}.jpg`);
    await sharp({ create: { width: 108, height: 192, channels: 3, background: "#FFFFFF" } }).jpeg().toFile(tmp);
    const m = await measureFrame(tmp);
    expect(m.ink).toBe(0);
    expect(m.coverage).toBe(0);
    fs.rmSync(tmp, { force: true });
  });
});

describe("no paid provider is reachable from V2 either", () => {
  it("imports no generative video service anywhere under scripts/video", () => {
    const banned = /\b(seedance|kling|runwayml|runway\.|pika\b|lumalabs|veo-|sora|minimax)\b/i;
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".mjs")) files.push(p);
      }
    };
    walk(path.join(REPO_ROOT, "scripts/video"));
    for (const f of files) {
      const offending = fs
        .readFileSync(f, "utf-8")
        .split("\n")
        .filter((line) => banned.test(line) && /(import|require|fetch|https?:\/\/)/i.test(line));
      expect(offending, `${f}: ${offending.join(" | ")}`).toEqual([]);
    }
  });

  it("draws frames with librsvg and never with an image model", () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "scripts/video/lib/svgFrame.mjs"), "utf-8");
    expect(src).not.toMatch(/geminiClient|generateSceneImage|imageGen/);
    expect(src).toMatch(/from "sharp"/);
  });

  it("isolates subjects without any model in the path", () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "scripts/video/lib/isolate.mjs"), "utf-8");
    expect(src).not.toMatch(/geminiClient|imageGen|fetch\(/);
  });
});

describe("the V2 spec on disk", () => {
  const specFile = path.join(MOTION.specsDir, "1-currensy-vs-westside-gunn-volume-vs-scarcity-v2.json");

  it("exists, validates against its own source script, and runs 75-105s", async () => {
    expect(fs.existsSync(specFile)).toBe(true);
    const { parseScriptMarkdown } = await import("./lib/scriptParse.mjs");
    const s = JSON.parse(fs.readFileSync(specFile, "utf-8"));
    const parsed = parseScriptMarkdown(fs.readFileSync(path.join(REPO_ROOT, s.sourceScript), "utf-8"));
    const r = validateMotionSpecV2(s, buildFactLock(parsed), { repoRoot: REPO_ROOT });
    expect(r.errors).toEqual([]);
    const total = specDurationSecV2(s);
    expect(total).toBeGreaterThanOrEqual(75);
    expect(total).toBeLessThanOrEqual(105);
  });

  it("states every figure the founder listed, and spells VAULT exactly", () => {
    const s = JSON.parse(fs.readFileSync(specFile, "utf-8"));
    const all = s.scenes.flatMap((sc) => (sc.text || []).map((t) => t.text)).join(" | ");
    for (const figure of ["90+", "1.5M", "400", "#187", "$300", "$120,000", "$15,000", "8 MONTHS", "30,000"]) {
      expect(all, figure).toContain(figure);
    }
    expect(all).toContain("COMMENT VAULT");
  });

  it("covers the whole argument, not just the numbers", () => {
    const s = JSON.parse(fs.readFileSync(specFile, "utf-8"));
    const all = s.scenes.flatMap((sc) => (sc.text || []).map((t) => t.text)).join(" | ").toUpperCase();
    // The founder's brief lists the beats the 30s cut skipped.
    for (const idea of ["VOLUME", "WIDE", "DEEP", "ARTIFACTS", "NAMES AND ADDRESSES", "ANONYMOUS"]) {
      expect(all, idea).toContain(idea);
    }
    // And the fairness beat: this is not volume-bad, scarcity-good.
    expect(all).toMatch(/NOT\s*\n?\s*VOLUME VS SCARCITY|VOLUME BUILT THE CATALOG/);
  });

  it("varies its composition instead of repeating one layout", () => {
    const s = JSON.parse(fs.readFileSync(specFile, "utf-8"));
    const layouts = s.scenes.map((sc) => sc.layout);
    expect(new Set(layouts).size).toBeGreaterThanOrEqual(9);
    for (let i = 2; i < layouts.length; i++) {
      expect(layouts[i] === layouts[i - 1] && layouts[i] === layouts[i - 2], `layouts repeat at scene ${i}`).toBe(false);
    }
  });

  it("declares no plate crop that reaches the sheet's lettering", async () => {
    const { rectsOverlap } = await import("./lib/motionSpec.mjs");
    const s = JSON.parse(fs.readFileSync(specFile, "utf-8"));
    const sheet = s.artwork.find((a) => a.id === "sheet");
    expect(sheet.letteredRegions.length).toBeGreaterThan(0);
    for (const plate of s.plates || []) {
      if (plate.keepPaper) continue;
      for (const region of sheet.letteredRegions) {
        expect(rectsOverlap(plate.crop, region), `${plate.id} vs ${region.id}`).toBe(false);
      }
    }
  });
});
