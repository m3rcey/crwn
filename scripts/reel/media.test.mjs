// Real-media prototype (2026-09-25, docs/REEL_MEDIA_ARCHITECTURE.md): the depth scene,
// annotations, timeline, rights marker, prototype flag, variant projects and the two cut
// fixes measured on script 23 (a pause hidden inside abutting recognizer stamps).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { withLevels, quietThreshold, onsetAfterPause, longestQuietRun, auditBoundaries } from "./lib/boundaries.mjs";
import { remapWords } from "./lib/cut.mjs";
import { rampExpression } from "./lib/audio.mjs";
import { beatAssets, isUncleared, UNCLEARED, validateBeats, storyboardLint, planBeats } from "./lib/beats.mjs";
import { annotate, placeLayer, depthScale, layerScene, collageScene, timelineScene, polyPath, circlePts, rng } from "./lib/depth.mjs";
import { variantSlug, excludedBySource } from "./reel.mjs";
import { loadStructure, synthTranscript } from "./lib/testkit.mjs";
import { alignTakes, captionWords } from "./lib/align.mjs";
import { buildEdl, lineWindows } from "./lib/cut.mjs";
import { loadCapabilities } from "./lib/claims.mjs";
import { loadLibrary, resolveSheets, toolNames } from "./lib/assets.mjs";

const rules = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "rules.json"), "utf8"));
const HOP = 0.005, ROOM = 0.004, VOICE = 0.15;
function env(regions, dur) {
  const rms = new Float32Array(Math.ceil(dur / HOP)).fill(ROOM);
  for (const [a, b, v] of regions) for (let i = Math.floor(a / HOP); i < Math.ceil(b / HOP); i++) rms[i] = v;
  return withLevels({ hop: HOP, rms });
}

describe("a pause hidden inside abutting recognizer stamps", () => {
  // Measured shape of script 23 at 40.3s: "nothing" ends at 1.35 in audio, a 1.0s pause
  // with two 5ms blips just over the threshold (measured -30 dB against -30.2), then
  // "here's" at 2.35. The recognizer stamps "now" 1.30-2.22 and "here's" 2.22-3.5, so no
  // gap exists between stamps. ROOM * 2.1 sits over the threshold and inside its 3 dB slack.
  const BLIP = ROOM * 2.1;
  const speech = [[0, 1.35, VOICE], [1.8, 1.805, BLIP], [2.3, 2.305, BLIP], [2.35, 3.5, VOICE], [4, 8, VOICE * 0.9]];
  const e = env(speech, 9);
  const thrDb = quietThreshold(e);
  it("finds where the voice really resumes after a pause that starts at the stamp", () => {
    const r = onsetAfterPause(e, 1.3, 2.47, { thrDb });
    expect(r).not.toBeNull();
    expect(r.onset).toBeGreaterThan(2.3);
    expect(r.onset).toBeLessThanOrEqual(2.36);
    expect(r.quiet).toBeGreaterThanOrEqual(0.06);
  });
  it("a LOUD click right before the onset leaves no clean room tone there, so no in-point", () => {
    const click = env([[0, 1.35, VOICE], [2.3, 2.305, VOICE * 0.3], [2.35, 3.5, VOICE], [4, 8, VOICE]], 9);
    expect(onsetAfterPause(click, 1.3, 2.47, { thrDb: quietThreshold(click) })).toBeNull();
  });
  it("does not invent a pause where the word really starts at its stamp (a consonant closure is not a pause)", () => {
    const closure = env([[0, 1.3, VOICE], [1.33, 2.5, VOICE], [3, 8, VOICE]], 9);
    expect(onsetAfterPause(closure, 1.3, 2.5, { thrDb: quietThreshold(closure) })).toBeNull();
  });
  it("measures the longest unbroken quiet run", () => {
    expect(longestQuietRun(e, 1.3, 2.4, thrDb + 3)).toBeGreaterThan(0.9);
    expect(longestQuietRun(e, 2.4, 3.4, thrDb + 3)).toBe(0);
  });
  it("a word whose stamp starts before its segment's in-point keeps its caption", () => {
    const edl = { segments: [{ srcIn: 2.3, srcOut: 3.5, outStart: 5, outEnd: 6.2 }] };
    const out = remapWords(edl, [{ text: "here's", start: 2.22, end: 2.6 }]);
    expect(out).toHaveLength(1);
    expect(out[0].start).toBe(5);
  });
  it("an in-point placed by the forward search passes the phrase-integrity audit", () => {
    const r = onsetAfterPause(e, 1.3, 2.47, { thrDb });
    const edl = { segments: [{ srcIn: 0, srcOut: 0.2, outStart: 0, outEnd: 0.2 }, { srcIn: r.onset - 0.05, srcOut: 3.6, outStart: 0.2, outEnd: 1.5 }] };
    // (the out-point at 0.2 is voiced on purpose; only the in-point is judged here)
    expect(auditBoundaries(edl, e, { thrDb }).filter((x) => x.kind === "in")).toEqual([]);
  });
});

describe("variant projects and source trimming", () => {
  it("a variant is a separate project slug, and a bad variant name is refused", () => {
    expect(variantSlug("23-smino", null)).toBe("23-smino");
    expect(variantSlug("23-smino", "proto")).toBe("23-smino--proto");
    expect(() => variantSlug("23-smino", "../x")).toThrow();
  });
  it("excludeSrc drops only the words wholly inside the source range", () => {
    const words = [{ text: "album.", start: 24.84, end: 25.16 }, { text: "He", start: 25.46, end: 26.02 }, { text: "has", start: 26.02, end: 26.2 }, { text: "his", start: 26.2, end: 26.36 }];
    expect([...excludedBySource(words, [{ from: 25.4, to: 26.25 }])]).toEqual([1, 2]);
    expect(() => excludedBySource(words, [{ from: 3, to: 2 }])).toThrow();
  });
});

describe("the music bed builds", () => {
  it("is flat without keys and ramps linearly in amplitude between them", () => {
    expect(rampExpression([])).toBe("1");
    const ex = rampExpression([{ t: 0, db: -6 }, { t: 2, db: 0 }]);
    const at = (t) => Function("t", "lt", "if_", `return ${ex.replace(/if\(/g, "if_(")}`)(t, (a, b) => a < b, (c, a, b) => (c ? a : b));
    expect(at(0)).toBeCloseTo(Math.pow(10, -6 / 20), 3);
    expect(at(1)).toBeCloseTo((Math.pow(10, -6 / 20) + 1) / 2, 3);
    expect(at(5)).toBeCloseTo(1, 3);
  });
});

describe("rights and the prototype flag", () => {
  const S = loadStructure(14);
  const tr = synthTranscript(S, S.lines.map((l) => ({ line: l.id })), { wps: 3.4 });
  const al = alignTakes(S, tr, rules);
  const edl = buildEdl(S, tr, al, rules);
  const outWords = remapWords(edl, captionWords(S, tr, al));
  const library = loadLibrary();
  const broll = [{ id: "broll-cover", shows: "album art", provenance: { source: "iTunes", rights: `${UNCLEARED}: label artwork`, clearance: UNCLEARED } }];
  const ctx = { structure: S, outWords, lineTimes: lineWindows(S, outWords), edl, rules, caps: loadCapabilities(), sheets: resolveSheets(S.slug, library, { exists: () => false }), library, broll, toolName: toolNames()[S.leadMagnet.slug] };
  const base = planBeats(ctx);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  it("every asset a layered scene or collage uses is one list", () => {
    expect(beatAssets({ graphic: { props: { bg: { asset: "a" }, layers: [{ asset: "b" }, { fill: "x" }], items: [{ asset: "c" }, { asset: "b" }] } } })).toEqual(["a", "b", "c"]);
  });
  it("an uncleared asset is an ERROR in a reel that could be published, a warning in a prototype", () => {
    expect(isUncleared(broll[0].provenance)).toBe(true);
    const p = clone(base);
    p.beats[2].graphic = { component: "Collage", props: { items: [{ asset: "broll-cover", dominant: true }] } };
    expect(validateBeats(p, ctx).errors.some((e) => e.startsWith("RIGHTS"))).toBe(true);
    p.prototype = true;
    const v = validateBeats(p, ctx);
    expect(v.errors.filter((e) => e.startsWith("RIGHTS"))).toEqual([]);
    expect(v.warnings.some((w) => w.startsWith("RIGHTS"))).toBe(true);
  });
  it("a prototype may omit the CTA and end card, but a WRONG keyword is still an error", () => {
    const p = clone(base);
    p.prototype = true;
    p.beats = p.beats.filter((b) => b.scene !== "cta_keyword" && b.scene !== "endcard");
    for (let i = 1; i < p.beats.length; i++) p.beats[i].start = p.beats[i - 1].end;
    const v = validateBeats(p, ctx);
    expect(v.errors.filter((e) => /cta_keyword|end card/.test(e))).toEqual([]);
    const q = clone(base);
    q.prototype = true;
    q.beats.find((b) => b.scene === "cta_keyword").graphic.props.keyword = "WRONG";
    expect(validateBeats(q, ctx).errors.some((e) => e.includes("CTA keyword on screen"))).toBe(true);
    delete p.prototype;
    expect(validateBeats(p, ctx).errors.some((e) => e.includes("cta_keyword"))).toBe(true);
  });
  it("the artist counts only as his real photograph, never as a modelled figure", () => {
    const art = { ...ctx, broll: [{ id: "broll-artist-cutout", shows: `${S.artist}, real photograph`, provenance: { source: "t", rights: "CC BY" } }] };
    const p = clone(base);
    p.beats[0].aroll = "world"; p.world = { camera: [], tags: [], objects: [{ id: "a", type: "figure", artist: true }] };
    expect(storyboardLint(p, art).errors.some((e) => e.includes("the hook does not show"))).toBe(true);
    p.beats[0].graphic = { component: "Layers", props: { layers: [{ id: "s", asset: "broll-artist-cutout" }] } };
    expect(storyboardLint(p, art).errors.filter((e) => e.includes("the hook"))).toEqual([]);
  });
});

describe("the depth scene", () => {
  const ctx = { assetFiles: { cut: { rel: "assets/cut.webp" }, bg: { rel: "assets/bg.jpg" }, a: { rel: "assets/a.jpg" }, b: { rel: "assets/b.jpg" } } };
  it("places layers in screen terms: a far layer is drawn larger to appear the size asked", () => {
    expect(depthScale(0, 1400)).toBe(1);
    const far = placeLayer({ id: "x", z: -700, sw: 540, aspect: 1, sx: 540, sy: 960 }, 1400);
    expect(far.w).toBe(Math.ceil(540 / depthScale(-700, 1400)));
    expect(far.left).toBeCloseTo(-far.w / 2, 0);
    const foot = placeLayer({ id: "y", z: 0, sw: 1000, aspect: 1.5, bottom: 1920 }, 1400);
    expect(960 + foot.top + foot.h).toBeCloseTo(1920, 0);
  });
  it("hides a layer BEFORE its entrance, so a render worker that starts mid-scene still sees it", () => {
    const r = layerScene({ id: 3, start: 0, end: 5, graphic: { props: { layers: [{ id: "s", asset: "cut", z: 0, w: 500, h: 800, in: { at: 0, from: { opacity: 0, y: 40 } } }], camera: [{ t: 0 }, { t: 5, z: 200 }] } } }, ctx);
    const set = r.js.indexOf("tl.set('#d3-s-in',{opacity:0}");
    const tween = r.js.indexOf("tl.fromTo('#d3-s-in'");
    expect(set).toBeGreaterThan(-1);
    expect(set).toBeLessThan(tween);
    expect(r.html).toContain('decoding="sync"');
    expect(r.js).toContain("tl.fromTo('#d3-cam'");
  });
  it("refuses two camera keys at one instant, a duplicate layer id and an unstaged asset", () => {
    const b = (props) => ({ id: 1, start: 0, end: 2, graphic: { props } });
    expect(() => layerScene(b({ layers: [], camera: [{ t: 1 }, { t: 1, z: 50 }] }), ctx)).toThrow(/increase/);
    expect(() => layerScene(b({ layers: [{ id: "a", fill: "x", w: 1, h: 1 }, { id: "a", fill: "x", w: 1, h: 1 }] }), ctx)).toThrow(/unique/);
    expect(() => layerScene(b({ layers: [{ id: "a", asset: "nope", w: 1, h: 1 }] }), ctx)).toThrow(/staged/);
  });
  it("a collage has exactly ONE dominant item", () => {
    const b = (items) => ({ id: 2, start: 0, end: 3, graphic: { props: { items } } });
    expect(() => collageScene(b([{ asset: "a", sw: 400 }, { asset: "b", sw: 300 }]), ctx)).toThrow(/ONE dominant/);
    expect(() => collageScene(b([{ asset: "a", sw: 400, dominant: true }, { asset: "b", sw: 300, dominant: true }]), ctx)).toThrow(/ONE dominant/);
    expect(collageScene(b([{ asset: "a", sw: 400, dominant: true }, { asset: "b", sw: 300 }]), ctx).html).toContain("d25-print");
  });
  it("the timeline's delivery line starts on its word and its markers land in order after it", () => {
    const r = timelineScene({ id: 4, start: 10, end: 17, graphic: { props: { bg: { asset: "bg" }, launch: { at: 11, label: "LAUNCH", sub: "ABOUT A MONTH" }, delivery: { at: 13, label: "DELIVERY", restAt: 15, rest: "THE REST OF YOUR LIFE", drawEnd: 16.5 }, markers: 6 } } }, ctx);
    const markerTimes = [...r.js.matchAll(/tl\.fromTo\('#d4-track-a\d+',\{scale:0\}.*?,([\d.]+)\);/g)].map((m) => +m[1]);
    expect(markerTimes).toHaveLength(6);
    expect(markerTimes.every((t, i) => t >= 13 && (i === 0 || t > markerTimes[i - 1]))).toBe(true);
    expect(r.js).toMatch(/tl\.fromTo\('#d4-spk',.*,11\);/);
    // every marker is hidden at the scene start (the first storyboard showed them early)
    expect((r.js.match(/tl\.set\('#d4-track-a\d+',\{"scale":0/g) || []).length).toBe(6);
  });
});

describe("annotation strokes", () => {
  it("are deterministic and draw on from their full length", () => {
    expect(circlePts(100, 100, 50, 30, 7)).toEqual(circlePts(100, 100, 50, 30, 7));
    expect(rng(3)()).toBe(rng(3)());
    const p = polyPath([[0, 0], [3, 4]]);
    expect(p.len).toBe(5);
    const a = annotate([{ type: "underline", x: 0, y: 10, w: 200, at: 1 }], "t");
    expect(a.svg).toMatch(/stroke-dashoffset="(\d+)"/);
    expect(a.js).toContain("strokeDashoffset:0");
  });
  it("refuse an unknown type, and report screen-space labels to the safe-zone check", () => {
    expect(() => annotate([{ type: "sparkle" }], "t")).toThrow(/unknown annotation/);
    const a = annotate([{ type: "label", x: 90, y: 1100, text: "WORTH $???", w: 380 }], "t");
    expect(a.boxes[0]).toMatchObject({ x: 90, y: 1100 });
    // A right-aligned label ENDS at x (the renderer translates it -100%): its box must too,
    // or the safe-zone check flags a label that is inside the frame (prototype QA, 2026-09-25).
    const r = annotate([{ type: "label", x: 1000, y: 392, align: "right", text: "DECEMBER 2024", w: 340 }], "t");
    expect(r.boxes[0].x + r.boxes[0].w).toBe(1000);
  });
});
