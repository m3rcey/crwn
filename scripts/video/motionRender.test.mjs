import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, RENDER, MOTION } from "./config.mjs";
import {
  collectSprites,
  computeSceneRows,
  dryRunManifest,
  planSegments,
  sceneSegmentHash,
  toScreenBox,
  unionBox,
  assertRaw,
  spriteRequestsForLayer,
  shapeRequests,
  RENDER_ENGINE_VERSION,
} from "./lib/motionRender.mjs";
import { ensureSprites, spriteHash, toHostPath, fontProvenance } from "./lib/lettering.mjs";
import { inkAlphaFromGrey } from "./lib/plates.mjs";
import { verifyStructure, verifyFacts, verifyLayout, parseProbe, figuresOnScreen } from "./lib/verify.mjs";
import { buildFactLock } from "./lib/factLock.mjs";
import { resolveTextLayer, sheetSize } from "./lib/motionSpec.mjs";
import { textPlacement, platePlacement, cameraAt, progressAt, stateIndexAt } from "./lib/motion.mjs";
import { fixtureParsedScript, fixtureMotionSpec, fixtureSpriteMap } from "./lib/fixtures.mjs";

const ARTWORK = path.join(REPO_ROOT, "scripts/vsl/assets/crown-black.png");
const lock = () => buildFactLock(fixtureParsedScript());
const spec = () => fixtureMotionSpec(ARTWORK);

function ctxFor(s) {
  const { byLayer, sheet } = collectSprites(s);
  return { sheet, byLayer, spriteMap: fixtureSpriteMap(byLayer), lock: lock() };
}

const PLATES = new Map([
  ["portrait", { file: "/plates/portrait.png", width: 1000, height: 1400, aspect: 1000 / 1400 }],
  ["endcard", { file: "/plates/endcard.png", width: 3584, height: 4800, aspect: 3584 / 4800 }],
]);

describe("the deterministic text manifest", () => {
  it("records every spec string, its sprite and its visible window", () => {
    const s = spec();
    const m = dryRunManifest(s, ctxFor(s));
    const ids = m.layers.map((l) => `${l.scene}:${l.id}`);
    expect(ids).toEqual(["0:hook", "1:total", "1:sold", "2:key"]);
    const total = m.layers.find((l) => l.id === "total");
    expect(total.text).toBe("$2,000,000");
    expect(total.spriteHash).toMatch(/^[0-9a-f]{16}$/);
    expect(total.fromSec).toBeCloseTo(0.5, 1);
    expect(total.toSec).toBeCloseTo(8.0, 1);
  });

  it("is the same on every run: identical spec, identical manifest", () => {
    const s = spec();
    const a = dryRunManifest(s, ctxFor(s)).layers;
    const b = dryRunManifest(s, ctxFor(s)).layers;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("reports zero generative calls, because there are none", () => {
    const s = spec();
    const m = dryRunManifest(s, ctxFor(s));
    expect(m.generativeImageCalls).toBe(0);
    expect(m.generativeVideoCalls).toBe(0);
  });

  it("passes the fact check it was built from, and lists the figures shown", () => {
    const s = spec();
    const m = dryRunManifest(s, ctxFor(s));
    const r = verifyFacts(m, lock(), s);
    expect(r.errors).toEqual([]);
    const figures = figuresOnScreen(m);
    expect([...figures.keys()].sort()).toEqual(["15000", "2000000", "40000"]);
  });

  it("fails when the spec declares a layer the render never drew", () => {
    const s = spec();
    const m = dryRunManifest(s, ctxFor(s));
    m.layers = m.layers.filter((l) => l.id !== "sold");
    const r = verifyFacts(m, lock(), s);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/spec layer "1:sold" was never drawn/);
  });

  it("fails a manifest claiming a generative video provider ran", () => {
    const s = spec();
    const m = dryRunManifest(s, ctxFor(s));
    m.generativeVideoCalls = 1;
    expect(verifyFacts(m, lock(), s).errors.join()).toMatch(/generative video provider was invoked/);
  });

  it("reports geometry as the camera frames it, not as the sheet holds it", () => {
    // A layer near the bottom of the sheet moves DOWN on screen under a push-in.
    // The manifest has to say where the viewer sees it or the safe-zone check is
    // measuring the wrong rectangle.
    const box = { x: 0.1, y: 0.8, w: 0.5, h: 0.05 };
    const flat = toScreenBox(box, { cx: 0.5, cy: 0.5, zoom: 1.0 });
    const pushed = toScreenBox(box, { cx: 0.5, cy: 0.5, zoom: 1.2 });
    expect(flat).toEqual(box);
    expect(pushed.y).toBeGreaterThan(flat.y);
    expect(pushed.h).toBeGreaterThan(flat.h);
  });

  it("takes the union across the visible window, so the worst moment is checked", () => {
    const u = unionBox({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { x: 0.2, y: 0.05, w: 0.2, h: 0.2 });
    expect(u.x).toBeCloseTo(0.1, 9);
    expect(u.y).toBeCloseTo(0.05, 9);
    expect(u.w).toBeCloseTo(0.3, 9);
    expect(u.h).toBeCloseTo(0.25, 9);
  });
});

describe("rerendering costs nothing when nothing changed", () => {
  it("launches no browser when every sprite is cached", async () => {
    const s = spec();
    const { requests } = collectSprites(s);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crwn-sprite-cache-"));
    // Pre-populate the cache exactly as a previous render would have left it.
    for (const req of requests) {
      const h = req.hash || spriteHash(req);
      fs.writeFileSync(path.join(dir, `${h}.png`), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      fs.writeFileSync(path.join(dir, `${h}.json`), JSON.stringify({ width: 700, height: 150 }));
    }
    let chromeCalls = 0;
    const map = await ensureSprites(requests, {
      cacheDir: dir,
      chromeRunner: async () => {
        chromeCalls++;
      },
    });
    expect(chromeCalls).toBe(0);
    expect(map.size).toBe(new Set(requests.map((r) => r.hash)).size);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("gives the same string the same sprite, and a changed string a new one", () => {
    const base = { kind: "text", text: "$2,000,000", fontPx: 200, family: "Patrick Hand", strokePx: 10, maxWidthPx: 1300, align: "center" };
    expect(spriteHash(base)).toBe(spriteHash({ ...base }));
    expect(spriteHash(base)).not.toBe(spriteHash({ ...base, text: "$2,000,00" }));
    expect(spriteHash(base)).not.toBe(spriteHash({ ...base, fontPx: 201 }));
  });

  it("uses only fonts that are already in the repo under a licence it can name", () => {
    const fonts = fontProvenance();
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      expect(fs.existsSync(f.file), f.file).toBe(true);
      expect(f.licence).toMatch(/Open Font License/);
    }
  });
});

describe("scene-level repair", () => {
  const segDir = "/segments";
  const state = (hash) => ({ hash, rows: [] });

  it("reuses a scene whose inputs are unchanged and rebuilds one that changed", () => {
    const s = spec();
    const { byLayer } = collectSprites(s);
    const hashes = new Map(s.scenes.map((sc) => [sc.index, sceneSegmentHash(sc, PLATES, byLayer)]));
    const plan = planSegments(s, {
      plateMap: PLATES,
      byLayer,
      segDir,
      exists: () => true,
      readState: (p) => {
        const idx = Number(/scene-(\d+)/.exec(p)[1]);
        // Scene 1's recorded hash is stale, everything else matches.
        return state(idx === 1 ? "stale" : hashes.get(idx));
      },
    });
    expect(plan.get(0).reuse).toBe(true);
    expect(plan.get(1).reuse).toBe(false);
    expect(plan.get(2).reuse).toBe(true);
    expect(plan.get(3).reuse).toBe(true);
  });

  it("rebuilds exactly the scenes named by onlyScenes and no others", () => {
    const s = spec();
    const { byLayer } = collectSprites(s);
    const hashes = new Map(s.scenes.map((sc) => [sc.index, sceneSegmentHash(sc, PLATES, byLayer)]));
    const plan = planSegments(s, {
      plateMap: PLATES,
      byLayer,
      segDir,
      onlyScenes: [2],
      exists: () => true,
      readState: (p) => state(hashes.get(Number(/scene-(\d+)/.exec(p)[1]))),
    });
    expect([...plan.values()].filter((v) => !v.reuse).map((v) => v.seg)).toEqual([
      path.join(segDir, "scene-02.mp4"),
    ]);
  });

  it("rebuilds when the segment or its state file is missing", () => {
    const s = spec();
    const { byLayer } = collectSprites(s);
    const plan = planSegments(s, { plateMap: PLATES, byLayer, segDir, exists: () => false });
    expect([...plan.values()].every((v) => !v.reuse)).toBe(true);
  });

  it("rebuilds rather than trusting an unreadable state file", () => {
    const s = spec();
    const { byLayer } = collectSprites(s);
    const plan = planSegments(s, {
      plateMap: PLATES,
      byLayer,
      segDir,
      exists: () => true,
      readState: () => {
        throw new Error("corrupt json");
      },
    });
    expect([...plan.values()].every((v) => !v.reuse)).toBe(true);
  });

  it("keys the cache on the renderer, not only on the spec", () => {
    // A compositing fix once left correct-LOOKING segments on disk that had been
    // drawn with the wrong geometry. The engine version is in the hash so that
    // cannot happen silently again.
    const s = spec();
    const { byLayer } = collectSprites(s);
    const h = sceneSegmentHash(s.scenes[0], PLATES, byLayer);
    expect(RENDER_ENGINE_VERSION).toBeGreaterThanOrEqual(1);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    // Changing the copy changes the hash, which is what makes a repair targeted.
    const s2 = spec();
    s2.scenes[0].text[0].text = "40,000 PHONE NUMBERS";
    const { byLayer: b2 } = collectSprites(s2);
    expect(sceneSegmentHash(s2.scenes[0], PLATES, b2)).not.toBe(h);
  });
});

describe("no paid provider is reachable from this pipeline", () => {
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
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = fs.readFileSync(f, "utf-8");
      // Allow prose that names them as excluded, but never a URL or an import.
      const offending = src
        .split("\n")
        .filter((line) => banned.test(line) && /(import|require|fetch|https?:\/\/)/i.test(line));
      expect(offending, `${f}: ${offending.join(" | ")}`).toEqual([]);
    }
  });

  it("does not letter through a model: the sprite path is Chrome plus a local font", async () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "scripts/video/lib/lettering.mjs"), "utf-8");
    expect(src).not.toMatch(/geminiClient|generateImage|imageGen/);
    expect(src).toMatch(/MOTION\.fontsDir/);
  });
});

describe("output shape", () => {
  const probe = (w, h, fps, dur, audio = true) =>
    `  Duration: 00:00:${dur}, start: 0.000000, bitrate: 7000 kb/s\n` +
    `  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, ${w}x${h} [SAR 1:1 DAR 9:16], 7000 kb/s, ${fps} fps, ${fps} tbr\n` +
    (audio ? "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 192 kb/s\n" : "");

  it("parses dimensions, fps, duration and streams out of ffmpeg's own report", () => {
    const p = parseProbe(probe(1080, 1920, 30, "30.00"));
    expect(p).toMatchObject({ width: 1080, height: 1920, fps: 30, durationSec: 30, codec: "h264", hasAudio: true });
  });

  it("passes a 1080x1920 30fps 30s file with music", async () => {
    const r = await verifyStructure("ignored.mp4", spec(), {
      probeText: probe(1080, 1920, 30, "30.00"),
      checkSegments: false,
    });
    expect(r.errors).toEqual([]);
  });

  it("fails the wrong resolution, the wrong fps, the wrong length and a silent file", async () => {
    const s = spec();
    const opts = { checkSegments: false };
    const wrongSize = await verifyStructure("x.mp4", s, { ...opts, probeText: probe(1920, 1080, 30, "30.00") });
    expect(wrongSize.errors.join()).toMatch(/expected 1080x1920/);
    const wrongFps = await verifyStructure("x.mp4", s, { ...opts, probeText: probe(1080, 1920, 24, "30.00") });
    expect(wrongFps.errors.join()).toMatch(/24 fps, expected 30/);
    const wrongLen = await verifyStructure("x.mp4", s, { ...opts, probeText: probe(1080, 1920, 30, "27.00") });
    expect(wrongLen.errors.join()).toMatch(/the target is 30s/);
    const silent = await verifyStructure("x.mp4", s, { ...opts, probeText: probe(1080, 1920, 30, "30.00", false) });
    expect(silent.errors.join()).toMatch(/no audio stream/);
  });

  it("fails a missing output file", async () => {
    const r = await verifyStructure("/definitely/not/here.mp4", spec(), {});
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/no output file/);
  });

  it("refuses a raw buffer whose channel count does not match its bytes", () => {
    const info = { width: 4, height: 2, channels: 3 };
    expect(() => assertRaw({ data: Buffer.alloc(4 * 2 * 4), info }, "test")).toThrow(/raw buffer is 32 bytes/);
    expect(assertRaw({ data: Buffer.alloc(24), info }, "test")).toHaveLength(24);
  });
});

describe("layout verification", () => {
  it("fails two lines that overlap while both on screen", () => {
    const m = {
      layers: [
        { scene: 0, id: "a", text: "ONE", box: { x: 0.1, y: 0.5, w: 0.5, h: 0.08 }, fromSec: 0, toSec: 3 },
        { scene: 0, id: "b", text: "TWO", box: { x: 0.15, y: 0.52, w: 0.5, h: 0.08 }, fromSec: 1, toSec: 3 },
      ],
    };
    expect(verifyLayout(m).errors.join()).toMatch(/overlap/);
  });

  it("allows the same positions when the lines are never on screen together", () => {
    const m = {
      layers: [
        { scene: 0, id: "a", text: "ONE", box: { x: 0.1, y: 0.5, w: 0.5, h: 0.08 }, fromSec: 0, toSec: 1 },
        { scene: 0, id: "b", text: "TWO", box: { x: 0.1, y: 0.5, w: 0.5, h: 0.08 }, fromSec: 1.5, toSec: 3 },
      ],
    };
    expect(verifyLayout(m).errors).toEqual([]);
  });

  it("fails a CTA held too briefly to act on", () => {
    const m = {
      layers: [
        { scene: 7, id: "key", role: "CTA", text: "COMMENT OWN", box: { x: 0.2, y: 0.5, w: 0.6, h: 0.06 }, fromSec: 0, toSec: 1.0 },
      ],
    };
    expect(verifyLayout(m).errors.join()).toMatch(/CTA is only held/);
  });
});

describe("motion primitives", () => {
  const sheet = sheetSize(RENDER);

  it("holds before it starts and holds after it finishes", () => {
    const m = { startSec: 1.0, durSec: 0.5 };
    expect(progressAt(m, 0.5)).toBe(0);
    expect(progressAt(m, 1.25)).toBeCloseTo(0.5, 5);
    expect(progressAt(m, 9)).toBe(1);
  });

  it("DRAW_ON reveals the finished stroke left to right", () => {
    const layer = resolveTextLayer({
      id: "x",
      text: "HI",
      slot: "headline",
      motion: { kind: "DRAW_ON", startSec: 0, durSec: 1 },
    });
    const sp = { width: 600, height: 120 };
    expect(textPlacement(layer, sp, sheet, 0.25).revealX).toBeCloseTo(0.25, 5);
    expect(textPlacement(layer, sp, sheet, 2).revealX).toBe(1);
  });

  it("a layer is absent before its motion starts", () => {
    const layer = resolveTextLayer({
      id: "x",
      text: "HI",
      slot: "headline",
      motion: { kind: "POP", startSec: 1.0, durSec: 0.3 },
    });
    expect(textPlacement(layer, { width: 100, height: 50 }, sheet, 0.5)).toBeNull();
  });

  it("GROW reveals a plate from its base up, so the stack piles on", () => {
    const entry = { plate: "portrait", place: { x: 0.5, y: 0.5, w: 0.5 }, motion: { kind: "GROW", startSec: 0, durSec: 1 } };
    const p = platePlacement(entry, PLATES.get("portrait"), sheet, 0.5, 3);
    expect(p.reveal.axis).toBe("y");
    expect(p.reveal.from).toBe("end");
    expect(p.reveal.amount).toBeGreaterThan(0);
    expect(p.reveal.amount).toBeLessThan(1);
  });

  it("never stretches an illustration: height follows the plate's own aspect", () => {
    const plate = PLATES.get("portrait");
    const entry = { plate: "portrait", place: { x: 0.5, y: 0.5, w: 0.5 }, motion: { kind: "HOLD" } };
    const p = platePlacement(entry, plate, sheet, 0, 3);
    expect(p.width / p.height).toBeCloseTo(plate.aspect, 2);
  });

  it("steps deterministically through pre-rendered states and holds the last", () => {
    const m = { kind: "STATES", startSec: 0, durSec: 1, easing: "linear" };
    expect(stateIndexAt(m, 0, 10)).toBe(0);
    expect(stateIndexAt(m, 5, 10)).toBe(9);
    expect(stateIndexAt(m, 0.5, 10)).toBe(stateIndexAt(m, 0.5, 10));
  });

  it("keeps the camera inside the sheet and never past the zoom ceiling", () => {
    const cam = cameraAt({ from: { zoom: 1.0 }, to: { zoom: 9.0 }, easing: "linear" }, 3, 3);
    expect(cam.zoom).toBe(9.0); // the camera states its intent
    const box = toScreenBox({ x: 0, y: 0, w: 1, h: 1 }, cam);
    expect(box.w).toBeLessThanOrEqual(MOTION.maxZoom); // the renderer clamps it
  });
});

describe("plate extraction", () => {
  it("drops white paper to transparent and keeps ink at full strength", () => {
    const grey = { data: Buffer.from([255, 250, 0, 120]), width: 4, height: 1 };
    const rgba = inkAlphaFromGrey(grey);
    expect(rgba[3]).toBe(0); // pure paper
    expect(rgba[7]).toBe(0); // near-paper, above the cut
    expect(rgba[11]).toBe(255); // solid ink
    expect(rgba[15]).toBeGreaterThan(100); // a soft marker edge survives
    expect(rgba[15]).toBeLessThan(255);
  });

  it("paints every pixel the brand ink colour, whatever the source grey was", () => {
    const rgba = inkAlphaFromGrey({ data: Buffer.from([0, 90]), width: 2, height: 1 });
    const hex = MOTION.ink.replace("#", "");
    expect(rgba[0]).toBe(parseInt(hex.slice(0, 2), 16));
    expect(rgba[4]).toBe(parseInt(hex.slice(0, 2), 16));
  });
});

describe("sprite requests", () => {
  const sheet = sheetSize(RENDER);

  it("derives font size and stroke from the sheet, not from magic numbers", () => {
    const layer = resolveTextLayer({ id: "x", text: "HI", slot: "headline", size: 0.05, w: 0.8 });
    const [req] = spriteRequestsForLayer(layer, sheet);
    expect(req.fontPx).toBe(Math.round(0.05 * sheet.height));
    expect(req.strokePx).toBeCloseTo(req.fontPx * MOTION.lettering.strokeRatio, 6);
    expect(req.maxWidthPx).toBe(Math.round(0.8 * sheet.width));
  });

  it("asks for one sprite per counter value, so every value shown is a real string", () => {
    const layer = resolveTextLayer({
      id: "x",
      text: "$2,000,000",
      slot: "bigNumber",
      motion: { kind: "COUNTER", values: ["$0", "$1,000,000", "$2,000,000"] },
    });
    const reqs = spriteRequestsForLayer(layer, sheet);
    expect(reqs.map((r) => r.text)).toEqual(["$0", "$1,000,000", "$2,000,000"]);
  });

  it("asks for a progress ladder for a shape that draws itself", () => {
    const reqs = shapeRequests({ shape: "circle", x: 0.5, y: 0.5, w: 0.4, h: 0.1, states: 5 }, sheet);
    expect(reqs.map((r) => r.progress)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

describe("host path translation", () => {
  it("hands a Windows Chrome a path it can actually open", () => {
    expect(toHostPath("/mnt/c/Users/Josh/AppData/Local/Temp/x.html")).toBe("C:/Users/Josh/AppData/Local/Temp/x.html");
    expect(toHostPath("/tmp/x.html")).toBe("/tmp/x.html");
  });
});
