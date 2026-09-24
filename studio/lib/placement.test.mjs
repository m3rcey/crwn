// node --test "studio/**/*.test.mjs"
// The placement copy is RUN here, not just parsed: ExtendScript is ES3 JavaScript, so the generated
// file executes in a vm against a mock Premiere that records every overwriteClip call.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { buildPlacementJsx, findHookEnd, parsePhraseRows, phraseTexts, EDGE_PAD } from "./placement.mjs";
import { readPanelReply, queuePlacement, takeNext, cancelPlacement, bridgeStatus, PANEL_VERSION } from "./bridge.mjs";
import { section } from "./status.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "../test/fixtures");
const toolJsx = fs.readFileSync(path.join(FIX, "819_overlap_phrases.jsx"), "utf-8"); // CRLF, as written
const segments = JSON.parse(fs.readFileSync(path.join(FIX, "819.json"), "utf-8")).segments;
const script = fs.readFileSync(path.join(HERE, "../../videos/scripts/fan-economy/6-joyce-wrice-fans-pick-the-feature.md"), "utf-8");
const TICKS = 254016000000;

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
const hook = findHookEnd(phraseTexts(rows, segments), section(script, "**SCRIPT:**"));

test("the hook end is found in a real recording", () => {
  assert.equal(hook.index, 1);
  assert.match(hook.phrase, /never even count/);
});

test("the copy runs, places every phrase, and reports back as text, never a dialog", () => {
  const built = buildPlacementJsx(toolJsx, { hookIndex: hook.index, hookSilenceSec: 3, tightenFrames: 10 });
  const { placedAt, reported } = runInMockPremiere(built.jsx);
  assert.equal(placedAt.length, rows.length);
  assert.match(reported, new RegExp(`Placed: ${rows.length} of ${rows.length} on A3/A4\\nFailed: 0`));
  assert.match(reported, /Clamped: \d+/);
  assert.deepEqual(readPanelReply(`CLIPS:${rows.length}\n${reported}`, rows.length).ok, true);
  // Source windows are untouched: only timeline positions move.
  placedAt.forEach((p, i) => assert.deepEqual([p.in, p.out, p.track], [rows[i].srcStart, rows[i].srcEnd, rows[i].track]));
});

test("3 seconds of speech-to-speech silence after the hook", () => {
  const built = buildPlacementJsx(toolJsx, { hookIndex: hook.index, hookSilenceSec: 3, tightenFrames: 10 });
  const { placedAt } = runInMockPremiere(built.jsx);
  const hookEnd = placedAt[hook.index].start + (rows[hook.index].tlEnd - rows[hook.index].tlStart);
  const gap = placedAt[hook.index + 1].start - hookEnd;
  // The hook clip itself was pulled k frames; the next one k frames too (the hook gap isn't tightened).
  assert.ok(Math.abs(gap - (3 - 2 * EDGE_PAD)) < 1e-6, `gap was ${gap}`);
});

test("every other gap is 10 frames tighter at the sequence's own frame rate", () => {
  for (const fps of [24, 30, 60]) {
    const plain = runInMockPremiere(buildPlacementJsx(toolJsx, { hookIndex: hook.index, hookSilenceSec: 3, tightenFrames: 0 }).jsx, fps).placedAt;
    const tight = runInMockPremiere(buildPlacementJsx(toolJsx, { hookIndex: hook.index, hookSilenceSec: 3, tightenFrames: 10 }).jsx, fps).placedAt;
    const frame = 1 / fps;
    for (let i = 3; i < 8; i++) {
      const delta = plain[i].start - plain[i - 1].start - (tight[i].start - tight[i - 1].start);
      if (i - 1 === hook.index) continue;
      // Pulled 10 frames unless a same-track clamp stopped it.
      assert.ok(Math.abs(delta - 10 * frame) < 1e-6 || delta < 10 * frame, `fps ${fps} gap ${i}: ${delta}`);
    }
  }
});

test("a clip is never pulled onto the previous clip on its own track", () => {
  const built = buildPlacementJsx(toolJsx, { hookIndex: hook.index, hookSilenceSec: 3, tightenFrames: 40 }); // extreme
  const { placedAt } = runInMockPremiere(built.jsx);
  const lastEnd = {};
  placedAt.forEach((p, i) => {
    const end = p.start + (rows[i].tlEnd - rows[i].tlStart);
    if (lastEnd[p.track] != null) assert.ok(p.start >= lastEnd[p.track] - 1e-9, `clip ${i} overlaps its track`);
    lastEnd[p.track] = end;
  });
});

test("no hook found: spacing still applies, no pause is invented", () => {
  const built = buildPlacementJsx(toolJsx, { hookIndex: null, hookSilenceSec: 3, tightenFrames: 10 });
  assert.equal(built.hookShiftSec, 0);
  assert.equal(runInMockPremiere(built.jsx).placedAt.length, rows.length);
});

test("panel reply: Premiere's clip count is the authority", () => {
  assert.equal(readPanelReply("CLIPS:46\noverlap_phrases.jsx complete.\nPlaced: 46 of 46 on A3/A4\nFailed: 0", 46).ok, true);
  assert.equal(readPanelReply("CLIPS:40\noverlap_phrases.jsx complete.\nPlaced: 46 of 46 on A3/A4\nFailed: 0", 46).ok, false);
  assert.equal(readPanelReply("CLIPS:0\nNo active sequence.", 46).ok, false);
  assert.equal(readPanelReply("", 46).placed, null); // the first live test: nothing came back
});

test("an out-of-date panel is never handed a placement, and a new one is refused while it's connected", () => {
  // Nothing seen yet: queueing is allowed; the old panel then polls and gets nothing.
  queuePlacement({ num: 1, jsxWin: "C:\\x.jsx", total: 3 });
  assert.equal(takeNext(Date.now(), "1"), null);
  assert.equal(takeNext(Date.now(), null), null);
  assert.equal(bridgeStatus().outdated, true);
  // The current panel takes it.
  assert.equal(takeNext(Date.now(), PANEL_VERSION).jsx, "C:\\x.jsx");
  cancelPlacement();
  // Once an old panel is what's connected, the page can't queue at all.
  takeNext(Date.now(), "1");
  assert.throws(() => queuePlacement({ num: 1, jsxWin: "C:\\x.jsx", total: 3 }), /old version/);
  takeNext(Date.now(), PANEL_VERSION);
});

test("the tool's own JSX shape is required; anything else is refused", () => {
  assert.throws(() => buildPlacementJsx("alert('hi');", { hookSilenceSec: 3, tightenFrames: 10 }));
});
