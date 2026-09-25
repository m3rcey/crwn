// The 3D world and the storyboard gate (2026-09-25 rebuild to the premium-reference
// standard). The world's own text goes through the same guardrails as any beat, the
// camera cannot silently fly across the map, and the storyboard gate rejects the
// structural failures the founder named (split-screen default, text slides, no artist,
// product footage minimised) before a render is spent.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadStructure, synthTranscript } from "./lib/testkit.mjs";
import { alignTakes, captionWords } from "./lib/align.mjs";
import { buildEdl, remapWords, lineWindows } from "./lib/cut.mjs";
import { planBeats, validateBeats, storyboardLint, worldCameraLint, worldDriftLint, worldTexts } from "./lib/beats.mjs";
import { loadCapabilities } from "./lib/claims.mjs";
import { loadLibrary, resolveSheets, toolNames } from "./lib/assets.mjs";
import { buildComposition, worldWindows } from "./lib/compose.mjs";

const rules = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "rules.json"), "utf8"));
const caps = loadCapabilities();
const library = loadLibrary();

function build(num) {
  const S = loadStructure(num);
  const tr = synthTranscript(S, S.lines.map((l) => ({ line: l.id })), { wps: 3.4 });
  const al = alignTakes(S, tr, rules);
  const edl = buildEdl(S, tr, al, rules);
  const outWords = remapWords(edl, captionWords(S, tr, al));
  const sheets = resolveSheets(S.slug, library, { exists: () => false });
  const ctx = { structure: S, outWords, lineTimes: lineWindows(S, outWords), edl, rules, caps, sheets, library, broll: [], toolName: toolNames()[S.leadMagnet.slug] };
  return { S, ctx, plan: planBeats(ctx), outWords };
}
const clone = (x) => JSON.parse(JSON.stringify(x));

describe("the world's text passes the same gates as a beat", () => {
  const r = build(14);
  const S = r.S;
  const late = S.withheld.lateTokens.map(Number).filter((n) => n >= 1000)[0];
  const spokenAt = r.outWords.find((w) => w.text.replace(/[^0-9]/g, "") === String(late))?.start;
  it("a withheld figure on a world tag before it is spoken is a leak", () => {
    expect(late).toBeTruthy();
    const plan = clone(r.plan);
    plan.world = { camera: [], objects: [], tags: [{ text: `$${late.toLocaleString("en-US")}`, start: 1, end: 3, screen: [540, 400] }] };
    expect(validateBeats(plan, r.ctx).errors.some((e) => e.startsWith("WITHHELD LEAK: world tag 0"))).toBe(true);
    plan.world.tags[0].start = spokenAt;
    expect(validateBeats(plan, r.ctx).errors.filter((e) => e.startsWith("WITHHELD"))).toEqual([]);
  });
  it("a counter may only land on a withheld figure when it is spoken", () => {
    const plan = clone(r.plan);
    plan.world = { camera: [], objects: [], tags: [{ text: "", start: 0.5, end: spokenAt + 1, screen: [540, 400], counter: { from: 0, to: late, t0: 1, t1: spokenAt - 3 } }] };
    expect(validateBeats(plan, r.ctx).errors.some((e) => e.includes("counts to"))).toBe(true);
    plan.world.tags[0].counter.t1 = spokenAt;
    expect(validateBeats(plan, r.ctx).errors.filter((e) => e.includes("counts to"))).toEqual([]);
  });
  it("a number the script never states is refused, except a photo credit's licence version", () => {
    const plan = clone(r.plan);
    plan.world = { camera: [], objects: [], tags: [{ text: "Photo: someone, CC BY-SA 4.0", start: 1, end: 2, screen: [300, 1478], label: "credit" }] };
    expect(validateBeats(plan, r.ctx).errors.some((e) => e.startsWith("FACT LOCK: world tag 0"))).toBe(true);
    plan.world.tags[0].attribution = true;
    expect(validateBeats(plan, r.ctx).errors.filter((e) => e.startsWith("FACT LOCK"))).toEqual([]);
  });
  it("words on a card face must be words he said near that moment, unless declared", () => {
    const plan = clone(r.plan);
    plan.world = { camera: [], objects: [{ id: "c", type: "card", face: "note", data: { text: "QUARTERLY SYNERGY PIPELINE" }, keys: { opacity: [{ t: 1, v: 1 }, { t: 3, v: 0 }] } }], tags: [] };
    expect(worldTexts(plan)[0].start).toBe(1);
    expect(validateBeats(plan, r.ctx).errors.some((e) => e.startsWith("UNSPOKEN: world card c"))).toBe(true);
    plan.world.objects[0].label = "a structural label";
    expect(validateBeats(plan, r.ctx).errors.filter((e) => e.startsWith("UNSPOKEN"))).toEqual([]);
  });
});

describe("world objects do not drift", () => {
  it("warns on a move keyed from t=0 that glides for the whole reel, not on a held move", () => {
    const drift = { world: { objects: [{ id: "post", type: "card", keys: { pos: [{ t: 0, v: [0, 2, 0] }, { t: 86, v: [0, 4, -3] }] } }] } };
    expect(worldDriftLint(drift).length).toBe(1);
    drift.world.objects[0].keys.pos = [{ t: 0, v: [0, 2, 0] }, { t: 85.9, v: [0, 2, 0] }, { t: 86.6, v: [0, 4, -3] }];
    expect(worldDriftLint(drift)).toEqual([]);
  });
});

describe("the world camera", () => {
  it("refuses a move across the map without a cut, allows the same jump as a cut", () => {
    const plan = { world: { camera: [{ t: 0, pos: [0, 3, 10], look: [0, 0, 0] }, { t: 5, pos: [120, 3, 10], look: [120, 0, 0] }] } };
    expect(worldCameraLint(plan).length).toBe(1);
    plan.world.camera[1].cut = true;
    expect(worldCameraLint(plan)).toEqual([]);
  });
});

describe("the storyboard gate", () => {
  const r = build(14);
  const withMedium = (plan, fn) => { const p = clone(plan); p.beats.forEach(fn); return p; };
  it("rejects the top-graphic/bottom-face split as the default grammar", () => {
    const p = withMedium(r.plan, (b) => { if (b.scene !== "endcard") b.aroll = "split"; });
    expect(storyboardLint(p, r.ctx).errors.some((e) => e.includes("split"))).toBe(true);
  });
  it("rejects three text-led scenes in a row", () => {
    const p = withMedium(r.plan, (b, i) => { if (i >= 3 && i <= 5) b.medium = "2d"; });
    expect(storyboardLint(p, r.ctx).errors.some((e) => e.includes("three text-led"))).toBe(true);
  });
  it("rejects product footage minimised over the talking head", () => {
    const p = clone(r.plan);
    p.beats[4].graphic = { component: "Footage", props: { footage: "x" } };
    p.beats[4].aroll = "split";
    expect(storyboardLint(p, r.ctx).errors.some((e) => e.includes("product footage"))).toBe(true);
    p.beats[4].aroll = "hidden";
    expect(storyboardLint(p, r.ctx).errors.filter((e) => e.includes("product footage"))).toEqual([]);
  });
  it("rejects a hook without the artist when real photographs of him exist", () => {
    const ctx = { ...r.ctx, broll: [{ id: "broll-artist", shows: `${r.S.artist}, real photograph`, provenance: { source: "test" } }] };
    expect(storyboardLint(r.plan, ctx).errors.some((e) => e.includes("the hook does not show"))).toBe(true);
    const p = clone(r.plan);
    p.beats[0].broll = { asset: "broll-artist" };
    expect(storyboardLint(p, ctx).errors.filter((e) => e.includes("the hook"))).toEqual([]);
  });
  it("a 3D figure of the artist counts, and a hook without it is rejected", () => {
    const p = clone(r.plan);
    p.beats[0].aroll = "world"; p.beats[3].aroll = "world";
    p.world = { camera: [], tags: [], objects: [{ id: "artist", type: "figure", artist: true, keys: { scale: [{ t: 0, v: 1 }] } }] };
    expect(storyboardLint(p, r.ctx).errors.filter((e) => e.includes("the hook"))).toEqual([]);
    p.beats[0].aroll = "full";
    expect(storyboardLint(p, r.ctx).errors.some((e) => e.includes("the hook does not show"))).toBe(true);
  });
  it("reports coverage by medium (descriptive)", () => {
    const c = storyboardLint(r.plan, r.ctx).coverage;
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBeGreaterThan(99);
  });
});

describe("the world in the composition", () => {
  it("adds one canvas, the engine, and the windows where the world owns the frame", () => {
    const r = build(14);
    const plan = clone(r.plan);
    plan.beats[2].aroll = "world"; plan.beats[3].aroll = "world";
    plan.world = { camera: [{ t: 0, pos: [0, 3, 10], look: [0, 0, 0] }], objects: [], tags: [] };
    const html = buildComposition({ plan, phrases: [], rules, outWords: r.outWords, assetFiles: {} }).html;
    expect(html).toContain('<canvas id="gl"');
    expect(html).toContain("import { createWorld } from './assets/world3d.js'");
    expect(html).toContain("e.detail.waitUntil");
    expect(worldWindows(plan.beats)).toEqual([[plan.beats[2].start, plan.beats[3].end]]);
  });
  it("plays product footage at a constant rate when asked, so a short recording covers a line", () => {
    const r = build(14);
    const plan = clone(r.plan);
    const b = plan.beats[2];
    b.aroll = "hidden"; b.graphic = { component: "Footage", props: { footage: "vid", rate: 0.7 } };
    const html = buildComposition({ plan, phrases: [], rules, outWords: r.outWords, assetFiles: { vid: { rel: "assets/vid.mp4", type: "video" } } }).html;
    expect(html).toContain('data-playback-rate="0.7"');
  });
});
