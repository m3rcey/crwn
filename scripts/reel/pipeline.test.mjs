// Planning, gating and composition, end to end on synthetic timings (no media, no render).
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadStructure, synthTranscript } from "./lib/testkit.mjs";
import { alignTakes, captionWords } from "./lib/align.mjs";
import { buildEdl, remapWords, lineWindows, toOut, framingFilter } from "./lib/cut.mjs";
import { planBeats, validateBeats, maskFor, faceStats, qualifierTag } from "./lib/beats.mjs";
import { groupCaptions, captionLeaks } from "./lib/captions.mjs";
import { loadCapabilities, missingEvidence, claimGate } from "./lib/claims.mjs";
import { loadLibrary, resolveSheets, resolveBroll, toolNames } from "./lib/assets.mjs";
import { buildComposition, safeZoneViolations, arollState, wrapLines, captionMarkup } from "./lib/compose.mjs";
import { soundPlan, dropExpression } from "./lib/audio.mjs";
import { normalizeElevenLabs, normalizeLocal, normalizeAny, validateTranscript, resolveProvider, transcribeElevenLabs } from "./lib/transcribe.mjs";
import { parseIntervals, sampleTimes } from "./lib/qa.mjs";

const rules = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "rules.json"), "utf8"));
const caps = loadCapabilities();
const library = loadLibrary();
// Sheets resolved against a fake disk so the test does not depend on Dropbox.
const fakeSheets = (slug, n = 5) => resolveSheets(slug, library, { exists: (p) => { const m = p.match(/-(\d)\.jpg$/); const k = m ? +m[1] : 1; return k <= n; } });

function build(num, planSteps) {
  const S = loadStructure(num);
  const tr = synthTranscript(S, planSteps || S.lines.map((l) => ({ line: l.id })), { wps: 3.4 });
  const al = alignTakes(S, tr, rules);
  const edl = buildEdl(S, tr, al, rules);
  const outWords = remapWords(edl, captionWords(S, tr, al));
  const ctx = { structure: S, outWords, lineTimes: lineWindows(S, outWords), edl, rules, caps, sheets: fakeSheets(S.slug), library, toolName: toolNames()[S.leadMagnet.slug] };
  const plan = planBeats(ctx);
  return { S, tr, al, edl, outWords, ctx, plan };
}

describe("edit decision list", () => {
  const { edl, tr, al } = build(14, (() => {
    return [{ line: 0 }, { pause: 3 }, { line: 1 }, { line: 2 }, { pause: 2.2 }, { line: 3 }, { line: 4 }];
  })());
  it("dead air is compressed, the timeline is contiguous and on the frame grid", () => {
    expect(edl.duration).toBeLessThan(tr.duration - 4);
    let t = 0;
    for (const s of edl.segments) {
      expect(Math.abs(s.outStart - t)).toBeLessThan(1e-3);
      expect(Math.abs(s.srcIn * 30 - Math.round(s.srcIn * 30))).toBeLessThan(1e-3);
      t = s.outEnd;
    }
  });
  it("the hook turn gets a longer beat than an ordinary sentence end", () => {
    const turn = edl.segments.find((s) => s.gapAfter === "hook_turn");
    expect(turn).toBeTruthy();
  });
  it("every kept word maps onto the clean timeline", () => {
    for (const k of al.kept.filter((k) => !k.drop)) expect(toOut(edl, tr.words[k.w].start)).not.toBeNull();
  });
});

describe("beat plan", () => {
  let r;
  beforeAll(() => { r = build(14); });
  it("is contiguous, starts at 0, ends on the 128 end card, and validates clean", () => {
    const v = validateBeats(r.plan, r.ctx);
    expect(v.errors).toEqual([]);
    expect(r.plan.beats[0].start).toBe(0);
    expect(r.plan.beats.at(-1).scene).toBe("endcard");
    expect(r.plan.beats.at(-1).end - r.plan.beats.at(-1).start).toBeGreaterThanOrEqual(1.0);
  });
  it("opens on a visual hook whose hidden answer is hidden", () => {
    const b = r.plan.beats[0];
    expect(b.scene).toBe("hook_open");
    expect(b.text.join(" ")).not.toMatch(/1,000,000|million/i);
    expect(b.graphic.props.mask.text).toBe("$ ? ? ?");
  });
  it("the reveal lands on the spoken figure, with a hit", () => {
    const rv = r.plan.beats.find((b) => b.scene === "numeric_reveal");
    const said = r.outWords.find((w) => /1,000,000/.test(w.text));
    expect(Math.abs(rv.start - said.start)).toBeLessThan(0.01);
    expect(rv.sound).toBe("hit");
    expect(rv.text[0]).toBe("$1,000,000");
  });
  it("the CTA uses the script's keyword and the tool's registry name", () => {
    expect(r.plan.beats.find((b) => b.scene === "cta_keyword").graphic.props.keyword).toBe("FREE");
    expect(r.plan.beats.find((b) => b.scene === "cta_tool").text[0]).toBe("CRWN OPPORTUNITY CALCULATOR");
  });
  it("CRWN product footage appears only on the CRWN line, and the claim gate allows it", () => {
    const m = r.plan.beats.filter((b) => b.scene === "crwn_mechanism");
    expect(m.length).toBe(1);
    expect(m[0].graphic.props.gate.allowed).toBe(true);
  });
  it("keeps the founder on screen", () => {
    expect(faceStats(r.plan.beats).ratio).toBeGreaterThanOrEqual(rules.visual.minFaceRatio);
  });
  it("the reveal sheet (it letters the answer) never appears before the reveal", () => {
    const revealAt = r.plan.beats.find((b) => b.scene === "numeric_reveal").start;
    for (const b of r.plan.beats) if (b.broll?.asset === "sheet-4") expect(b.start).toBeGreaterThanOrEqual(revealAt);
  });
});

describe("the withheld gate (mutation tests for the rule a model must never be trusted with)", () => {
  it("a hand-edited plan that shows the answer early is repaired to the spoken word", () => {
    const r = build(14);
    const i = r.plan.beats.findIndex((b) => b.scene === "numeric_reveal");
    const said = r.plan.beats[i].start;
    r.plan.beats[i - 1].end = said - 1.5;
    r.plan.beats[i].start = said - 1.5;
    const v = validateBeats(r.plan, r.ctx);
    expect(v.repaired.length).toBe(1);
    expect(r.plan.beats[i].start).toBeCloseTo(said, 2);
  });
  it("a figure on a hook card is a leak the validator refuses", () => {
    const r = build(14);
    r.plan.beats[0].text.push("$1,000,000");
    const v = validateBeats(r.plan, r.ctx);
    expect(v.errors.some((e) => e.startsWith("WITHHELD LEAK"))).toBe(true);
  });
  it("the reveal sheet placed in the hook is refused", () => {
    const r = build(14);
    r.plan.beats[2].broll = { asset: "sheet-4" };
    expect(validateBeats(r.plan, r.ctx).errors.some((e) => e.includes("reveal sheet"))).toBe(true);
  });
  it("a number the script never states is refused by the fact lock", () => {
    const r = build(14);
    r.plan.beats[5].text = ["$2,500,000"];
    expect(validateBeats(r.plan, r.ctx).errors.some((e) => e.startsWith("FACT LOCK"))).toBe(true);
  });
  it("a wrong CTA keyword is refused", () => {
    const r = build(14);
    r.plan.beats.find((b) => b.scene === "cta_keyword").graphic.props.keyword = "VAULT";
    expect(validateBeats(r.plan, r.ctx).errors.some((e) => e.includes("CTA keyword"))).toBe(true);
  });
  it("captions never show the answer before it is said", () => {
    const r = build(14);
    const phrases = groupCaptions(r.outWords, r.S, rules);
    expect(captionLeaks(phrases)).toEqual([]);
    const hit = phrases.find((p) => p.words.some((w) => w.withheld));
    expect(hit.words[0].withheld).toBe(true);
  });
  it("captions keep the script's dialect", () => {
    const r = build(10);
    const text = groupCaptions(r.outWords, r.S, rules).map((p) => p.text).join(" ");
    expect(text).toMatch(/they own businesses|they dont just watch/);
  });
});

describe("CRWN claims", () => {
  it("every shipped capability has evidence that exists in this repo", () => {
    expect(missingEvidence(caps)).toEqual([]);
  });
  it("a conceptual-tier script never gets product UI", () => {
    const S = loadStructure(9);
    const line = S.lines[S.anchors.thesis + 1] || S.lines[S.anchors.thesis];
    expect(claimGate(S, line, caps).allowed).toBe(false);
  });
  it("a line that reads as distribution or masters is typography only", () => {
    const S = loadStructure(14);
    expect(claimGate(S, { text: "On the CRWN app you keep your masters and get distribution" }, caps).allowed).toBe(false);
  });
});

describe("assets", () => {
  it("sheet roles come from position from the end", () => {
    expect(fakeSheets("x", 5).map((s) => s.role)).toEqual(["hook", "middle", "crwn", "reveal", "cta"]);
    expect(fakeSheets("x", 4).map((s) => s.role)).toEqual(["hook", "middle", "reveal", "cta"]);
    expect(fakeSheets("x", 1).map((s) => s.role)).toEqual(["hook"]);
    expect(fakeSheets("x", 5).find((s) => s.role === "reveal").gatedToReveal).toBe(true);
  });
  it("sourced B-roll without a provenance sidecar is refused", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
    fs.mkdirSync(path.join(dir, "broll"));
    fs.writeFileSync(path.join(dir, "broll/interview.mp4"), "x");
    fs.writeFileSync(path.join(dir, "broll/headline.jpg"), "x");
    fs.writeFileSync(path.join(dir, "broll/headline.json"), JSON.stringify({ source: "Billboard", url: "https://example.com", rights: "fair use: headline screenshot for commentary" }));
    const r = resolveBroll(dir);
    expect(r.assets.map((a) => a.id)).toEqual(["broll-headline"]);
    expect(r.refused[0].file).toBe("interview.mp4");
  });
  it("tool names come from the product registry", () => {
    expect(toolNames()["vault-revenue-planner"]).toBe("Vault Revenue Planner");
  });
  it("every library asset declares provenance", () => {
    for (const [id, a] of Object.entries(library.library)) expect(a.provenance?.source, id).toBeTruthy();
  });
});

describe("composition", () => {
  it("builds one document with a registered paused timeline, the A-roll, every scene and captions", () => {
    const r = build(14);
    const phrases = groupCaptions(r.outWords, r.S, rules);
    const assetFiles = { "crwn-memberships-vault": { rel: "assets/crwn-memberships-vault.mp4", type: "video" }, "tool-opportunity-calculator": { rel: "assets/tool.mp4", type: "video" }, "endcard-128": { rel: "assets/endcard.jpg", type: "image" } };
    for (const s of r.ctx.sheets) assetFiles[s.id] = { rel: `assets/${s.id}.jpg`, type: "image" };
    const c = buildComposition({ plan: r.plan, phrases, rules, outWords: r.outWords, assetFiles });
    expect(c.missing).toEqual([]);
    expect(c.html).toContain('data-composition-id="main"');
    expect(c.html).toContain("window.__timelines.main = tl");
    expect(c.html).toContain('src="assets/aroll.mp4"');
    expect(c.html).not.toMatch(/Math\.random|Date\.now/);
    expect(c.captions).toBeGreaterThan(20);
    expect(safeZoneViolations(c.boxes, rules)).toEqual([]);
    // HyperFrames extracts a video from ITS OWN timing and finds it by id: a <video>
    // without an id, or nested in a timed scene, renders frozen.
    const videos = [...c.html.matchAll(/<video[^>]*>/g)].map((m) => m[0]);
    expect(videos.length).toBeGreaterThan(1);
    for (const v of videos) expect(v).toMatch(/ id="[^"]+"/);
    for (const sec of c.html.match(/<section[\s\S]*?<\/section>/g) || []) expect(sec).not.toContain("<video");
  });
  it("a pacing split of the hook holds the headline instead of rebuilding it", () => {
    const r = build(14);
    const hooks = r.plan.beats.filter((b) => b.scene === "hook_open");
    expect(hooks.length).toBeGreaterThan(1);
    expect(hooks.slice(1).every((b) => b.continued)).toBe(true);
    const c = buildComposition({ plan: r.plan, phrases: [], rules, outWords: r.outWords, assetFiles: {} });
    const second = hooks[1].id;
    expect(c.html).not.toMatch(new RegExp(`tl\\.fromTo\\('#h${second}-l0'`));
  });
  it("A-roll tweens are seek-safe: no fromTo on the A-roll renders at build time, no bare to()", () => {
    const r = build(14);
    r.plan.beats[3].transition = "whip";
    const c = buildComposition({ plan: r.plan, phrases: [], rules, outWords: r.outWords, assetFiles: {} });
    const aroll = c.html.split("\n").filter((l) => /#arollWrap|#arollClip/.test(l) && /tl\.(to|fromTo)\(/.test(l));
    expect(aroll.length).toBeGreaterThan(3);
    for (const l of aroll) {
      expect(l, l).not.toMatch(/tl\.to\('#aroll/);
      expect(l, l).toMatch(/immediateRender:false/);
    }
  });
  it("a caption starting as the picture slides into a split travels with it, never jumping over the face", () => {
    const beats = [
      { start: 0, end: 5, aroll: "full" },
      { start: 5, end: 10, aroll: "split" },
    ];
    const words = [{ text: "Everybody", start: 5, end: 5.6, emph: false }, { text: "builds", start: 5.6, end: 6, emph: false }];
    const { js } = captionMarkup([{ start: 5, end: 6, words }], beats, rules);
    expect(js).toContain(`tl.fromTo('#cp0',{y:${rules.captions.y - rules.captions.splitSeamY}},{y:0,duration:0.38,ease:'power3.inOut',immediateRender:false},5)`);
    // Layout properties snap to pixels under frame capture (HyperFrames lint): never `top`.
    expect(js).not.toMatch(/top:/);
    // A phrase well inside a split beat does not move.
    const still = captionMarkup([{ start: 7, end: 8, words: words.map((w) => ({ ...w, start: w.start + 2, end: w.end + 2 })) }], beats, rules);
    expect(still.js).not.toMatch(/tl\.fromTo\('#cp0',\{y:-?\d+\}/);
  });
  it("A-roll states", () => {
    expect(arollState("punch", rules).scale).toBe(rules.visual.punchScale);
    expect(arollState("hidden", rules).opacity).toBe(0);
    expect(arollState("split", rules).clipTop).toBeGreaterThan(800);
  });
  it("framing fills 1080x1920 from landscape and vertical sources", () => {
    expect(framingFilter({ width: 3840, height: 2160 }, { x: 0.5, y: 0.4 }, 1080, 1920)).toMatch(/crop=1080:1920/);
    expect(framingFilter({ width: 1080, height: 1920 }, {}, 1080, 1920)).toMatch(/scale=1080:1920/);
  });
  it("headlines wrap", () => expect(wrapLines("How much did Money Man get offered AFTER", 18).length).toBe(3));
});

describe("audio plan", () => {
  it("the riser peaks where the beat drops, the music ends before the last line", () => {
    const r = build(14);
    const sp = soundPlan(r.plan, r.S, r.outWords, rules);
    const riser = sp.cues.find((c) => c.kind === "riser");
    const drop = sp.drops[0];
    expect(riser.at + 1.4).toBeCloseTo(drop.from, 2);
    const lastLine = r.outWords.find((w) => w.line === r.S.anchors.kwLine).start;
    expect(sp.musicEnd).toBeCloseTo(lastLine, 3);
    expect(sp.cues.some((c) => c.kind === "hit")).toBe(true);
  });
  it("drop expression", () => {
    expect(dropExpression([])).toBe("1");
    expect(dropExpression([{ from: 1, to: 2, fade: 0.1 }])).toMatch(/between\(t,1\.000,2\.000\)/);
  });
});

describe("transcription", () => {
  const fillers = rules.takes.fillers;
  it("ElevenLabs: spacing dropped, fillers and events typed", () => {
    const t = normalizeElevenLabs({ language_code: "en", words: [{ text: "Um", start: 0, end: 0.2, type: "word" }, { text: " ", start: 0.2, end: 0.3, type: "spacing" }, { text: "(laughs)", start: 0.3, end: 0.8, type: "audio_event" }, { text: "Money", start: 0.9, end: 1.2, type: "word" }] }, fillers);
    expect(t.words.map((w) => w.type)).toEqual(["filler", "event", "word"]);
    expect(normalizeAny({ words: [{ text: "a", start: 0, end: 1, type: "spacing" }, { text: "b", start: 1, end: 2, type: "word" }] }, fillers).provider).toBe("elevenlabs");
  });
  it("a figure Whisper split into pieces is one word again", () => {
    const t = normalizeLocal({ words: [{ text: "a", start: 0, end: 0.1 }, { text: "$1", start: 0.2, end: 0.3 }, { text: ",000", start: 0.3, end: 0.4 }, { text: ",000", start: 0.4, end: 0.5 }, { text: "advance.", start: 0.6, end: 1 }] }, fillers);
    expect(t.words.map((w) => w.text)).toEqual(["a", "$1,000,000", "advance."]);
    expect(t.words[1]).toMatchObject({ start: 0.2, end: 0.5 });
  });
  it("local faster-whisper output", () => {
    const t = normalizeLocal({ model: "small.en", duration: 3, words: [{ text: " uh", start: 0, end: 0.3 }, { text: "Money", start: 0.4, end: 0.8 }] }, fillers);
    expect(t.words[0]).toMatchObject({ text: "uh", type: "filler" });
  });
  it("refuses a transcript without word timing or one that stops early", () => {
    expect(() => normalizeAny({ segments: [] }, fillers)).toThrow(/WORD-level/);
    expect(validateTranscript({ words: [{ text: "a", start: 0, end: 1, type: "word" }] }, 120)[0]).toMatch(/stops/);
  });
  it("provider auto-selects from the environment, never from a file", () => {
    expect(resolveProvider("auto", {})).toBe("local");
    expect(resolveProvider("auto", { ELEVENLABS_API_KEY: "x" })).toBe("elevenlabs");
  });
  it("ElevenLabs request: key in the header, word timestamps, and no key leaks into the URL", async () => {
    const tmp = path.join(os.tmpdir(), `reel-${process.pid}.wav`);
    fs.writeFileSync(tmp, Buffer.alloc(64));
    let seen;
    const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ words: [] }) }; };
    await transcribeElevenLabs(tmp, { apiKey: "k-test", fetchImpl });
    expect(seen.url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(seen.init.headers["xi-api-key"]).toBe("k-test");
    expect(seen.init.body.get("timestamps_granularity")).toBe("word");
    expect(String(seen.url)).not.toContain("k-test");
    await expect(transcribeElevenLabs(tmp, { apiKey: "" })).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });
});

describe("qa parsing", () => {
  it("reads blackdetect and freezedetect output", () => {
    expect(parseIntervals("[blackdetect] black_start:1.5 black_end:2 black_duration:0.5", "black")).toEqual([{ start: 1.5, end: 2, d: 0.5 }]);
    expect(parseIntervals("lavfi.freezedetect.freeze_start: 3.2\nlavfi.freezedetect.freeze_end: 5.0", "freeze")[0].start).toBe(3.2);
  });
  it("samples the hook, every beat and the reveal", () => {
    const r = build(14);
    const t = sampleTimes(r.plan);
    for (const x of [0, 0.5, 1, 1.5]) expect(t).toContain(x);
    expect(t.length).toBeGreaterThan(r.plan.beats.length / 2);
  });
  it("qualifier tags keep the epistemic status", () => {
    expect(qualifierTag("Them hours is a model of a real habit, not a measurement.")).toBe("A MODEL, NOT A MEASUREMENT");
    expect(qualifierTag("Them is reported numbers from his own interviews")).toBe("SELF-REPORTED");
    expect(maskFor({ kind: "time", bigReveal: "time/production (about 3,000 hours a year)" })).toEqual({ text: "?", unit: "HOURS" });
  });
});
