// node --test "studio/**/*.test.mjs"
// The placement copy is RUN here, not just parsed: ExtendScript is ES3 JavaScript, so the generated
// file executes in a vm against a mock Premiere that records every overwriteClip call.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { buildPlacementJsx, findLandmarks, gapPlan, parsePhraseRows, phraseTexts, EDGE_PAD, DEFAULT_SPACING } from "./placement.mjs";
import { readPanelReply, queuePlacement, takeNext, cancelPlacement, bridgeStatus, PANEL_VERSION } from "./bridge.mjs";
import { placeRefusal } from "./actions.mjs";
import { section } from "./status.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "../test/fixtures");
const toolJsx = fs.readFileSync(path.join(FIX, "819_overlap_phrases.jsx"), "utf-8"); // CRLF, as written
const segments = JSON.parse(fs.readFileSync(path.join(FIX, "819.json"), "utf-8")).segments;
const script = section(fs.readFileSync(path.join(HERE, "../../videos/scripts/fan-economy/6-joyce-wrice-fans-pick-the-feature.md"), "utf-8"), "**SCRIPT:**");
const TICKS = 254016000000;
const ZERO = { hookSilenceSec: 0, gapFrames: 0, ctaGapFrames: 0, lastLineGapFrames: 0 };

function runInMockPremiere(jsx, fps = 30) {
  const placedAt = [];
  const track = (n) => ({ overwriteClip: (item, ticks) => placedAt.push({ track: n, start: Number(ticks) / TICKS, in: item.in, out: item.out }) });
  const audioPath = jsx.match(/var audioPath = "(.*)";/)[1].replace(/\\\\/g, "\\");
  const item = { type: 1, getMediaPath: () => audioPath, setInPoint(s) { this.in = s; }, setOutPoint(s) { this.out = s; } };
  const g = {
    app: { project: { rootItem: { children: { numItems: 1, 0: item } }, importFiles: () => true,
      activeSequence: { timebase: String(TICKS / fps), audioTracks: { numTracks: 4, 0: track(1), 1: track(2), 2: track(3), 3: track(4) } } } },
    ProjectItemType: { CLIP: 1, FILE: 4, BIN: 2 },
  };
  g.$ = { global: g };
  g.alert = () => assert.fail("a Premiere dialog would have opened");
  vm.runInNewContext(jsx, g);
  return { placedAt, reported: g.__crwnLast };
}

const rows = parsePhraseRows(toolJsx.replace(/\r\n/g, "\n"));
const texts = phraseTexts(rows, segments);
const landmarks = findLandmarks(texts, script);
const place = (spacing, fps, lm = landmarks) => runInMockPremiere(buildPlacementJsx(toolJsx, { landmarks: lm, spacing }).jsx, fps);

test("the hook, the CTA and the last line are found in a real recording", () => {
  assert.equal(landmarks.hook.index, 1);
  assert.match(landmarks.hook.phrase, /never even count/);
  assert.equal(landmarks.cta.index, rows.length - 2);
  assert.match(landmarks.cta.phrase, /^I built a free/);
  assert.equal(landmarks.last.index, rows.length - 1);
  assert.match(landmarks.last.phrase, /^Comment producer/);
});

test("the copy runs, places every phrase, and reports back as text, never a dialog", () => {
  const { placedAt, reported } = place(DEFAULT_SPACING, 30);
  assert.equal(placedAt.length, rows.length);
  assert.match(reported, new RegExp(`Placed: ${rows.length} of ${rows.length} on A3/A4\\nFailed: 0`));
  assert.match(reported, /Clamped: 0/);
  assert.equal(readPanelReply(`CLIPS:${rows.length}\n${reported}`, rows.length).ok, true);
  // Source windows are untouched: only timeline positions move.
  placedAt.forEach((p, i) => assert.deepEqual([p.in, p.out, p.track], [rows[i].srcStart, rows[i].srcEnd, rows[i].track]));
});

test("3 seconds of speech-to-speech silence after the hook", () => {
  const { placedAt } = place(DEFAULT_SPACING, 30);
  const h = landmarks.hook.index;
  const gap = placedAt[h + 1].start - (placedAt[h].start + (rows[h].tlEnd - rows[h].tlStart));
  assert.ok(Math.abs(gap - (3 - 2 * EDGE_PAD)) < 1e-6, `gap was ${gap}`);
});

test("each gap changes by its own frames, at the sequence's own frame rate", () => {
  for (const fps of [24, 30, 60]) {
    const plain = place(ZERO, fps).placedAt;
    const paced = place(DEFAULT_SPACING, fps).placedAt;
    for (let i = 1; i < rows.length; i++) {
      if (i === landmarks.hook.index + 1) continue; // set in seconds (previous test)
      const want = i === landmarks.cta.index ? -5 : i === landmarks.last.index ? 5 : -10;
      const changed = (paced[i].start - paced[i - 1].start - (plain[i].start - plain[i - 1].start)) * fps;
      assert.ok(Math.abs(changed - want) < 1e-6, `fps ${fps}, gap before phrase ${i + 1}: ${changed} frames, wanted ${want}`);
    }
  }
});

test("a clip is never pulled onto the previous clip on its own track", () => {
  const { placedAt, reported } = place({ ...DEFAULT_SPACING, gapFrames: -40 }, 30); // extreme
  assert.match(reported, /Clamped: [1-9]/);
  const lastEnd = {};
  placedAt.forEach((p, i) => {
    if (lastEnd[p.track] != null) assert.ok(p.start >= lastEnd[p.track] - 1e-9, `clip ${i} overlaps its track`);
    lastEnd[p.track] = p.start + (rows[i].tlEnd - rows[i].tlStart);
  });
});

test("a landmark that isn't found falls back to the normal gap; nothing is invented", () => {
  const none = { hook: null, cta: null, last: null };
  const built = buildPlacementJsx(toolJsx, { landmarks: none, spacing: DEFAULT_SPACING });
  assert.equal(built.hookShiftSec, 0);
  assert.deepEqual([...new Set(built.gap.slice(1))], [-10]);
  assert.equal(runInMockPremiere(built.jsx).placedAt.length, rows.length);
});

test("gap plan: no hook never skips a CTA at phrase 2; landmarks never overwrite the hook gap", () => {
  assert.deepEqual(gapPlan(4, { hook: null, cta: { index: 1 }, last: { index: 3 } }, DEFAULT_SPACING), [0, -5, -10, 5]);
  assert.deepEqual(gapPlan(4, { hook: { index: 0 }, cta: { index: 1 }, last: null }, DEFAULT_SPACING), [0, 0, -10, -10]);
});

test("a script without the CTA or Comment line gets no special gap for it", () => {
  const plain = "How much?\nLet's find out.\n\nBody line.";
  assert.equal(findLandmarks(texts, plain).cta, null);
  assert.equal(findLandmarks(texts, plain).last, null);
});

test("a video already placed (by the panel or by hand) is never placed again", () => {
  const r = { linked: { exists: true }, jsxExists: true, jsxMtime: 5 };
  assert.match(placeRefusal({ ...r, placement: { ok: true, by: "hand", jsxMtime: 5 } }), /already placed/);
  assert.match(placeRefusal({ ...r, placement: { ok: true, by: "bridge", jsxMtime: 5 } }), /already placed/);
});

test("panel reply: Premiere's clip count is the authority", () => {
  assert.equal(readPanelReply("CLIPS:46\noverlap_phrases.jsx complete.\nPlaced: 46 of 46 on A3/A4\nFailed: 0", 46).ok, true);
  assert.equal(readPanelReply("CLIPS:40\noverlap_phrases.jsx complete.\nPlaced: 46 of 46 on A3/A4\nFailed: 0", 46).ok, false);
  assert.equal(readPanelReply("CLIPS:0\nNo active sequence.", 46).ok, false);
  assert.equal(readPanelReply("", 46).placed, null); // the first live test: nothing came back
});

test("an out-of-date panel is never handed a placement, and a new one is refused while it's connected", () => {
  queuePlacement({ num: 1, jsxWin: "C:\\x.jsx", total: 3 });
  assert.equal(takeNext(Date.now(), "1"), null);
  assert.equal(takeNext(Date.now(), null), null);
  assert.equal(bridgeStatus().outdated, true);
  assert.equal(takeNext(Date.now(), PANEL_VERSION).jsx, "C:\\x.jsx");
  cancelPlacement();
  takeNext(Date.now(), "1");
  assert.throws(() => queuePlacement({ num: 1, jsxWin: "C:\\x.jsx", total: 3 }), /old version/);
  takeNext(Date.now(), PANEL_VERSION);
});

test("the tool's own JSX shape is required; anything else is refused", () => {
  assert.throws(() => buildPlacementJsx("alert('hi');", { spacing: DEFAULT_SPACING }));
});
