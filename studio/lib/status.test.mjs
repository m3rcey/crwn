// node --test studio/
import test from "node:test";
import assert from "node:assert/strict";
import { videoStatus, promptSheets, leadingNumber, recordingMatchesSlug, numberGaps, parsePdfName, transcriptGapAllowed } from "./status.mjs";

const SCRIPT5 = [
  "# T", "**SCRIPT:**", "words", "---",
  "**NANO BANANA PRO PROMPT:**", "a", "---",
  "**NANO BANANA PRO PROMPT 2:**", "b", "---",
  "**NANO BANANA PRO PROMPT 3:**", "c", "---",
  "**NANO BANANA PRO PROMPT 4:**", "d", "---",
  "**NANO BANANA PRO PROMPT 5:**", "e", "---",
  "**META:** x",
].join("\n");

const base = (over = {}) => ({
  num: 61, slug: "61-x", fileName: "61-x.md", scriptText: SCRIPT5,
  sheets: { present: [], mtimes: {} }, pdfs: [], manual: {},
  recording: { ssdError: null, conflicts: [], candidates: [], linked: null },
  carousel: null, captionMd: { exists: false }, slides: 0,
  ...over,
});
const stepOf = (f, n) => videoStatus(f).steps.find((s) => s.step === n);

test("prompt sheets follow the script's blocks, not a constant", () => {
  assert.deepEqual(promptSheets(SCRIPT5), [1, 2, 3, 4, 5]);
  assert.deepEqual(promptSheets("**NANO BANANA PRO PROMPT:**\nx"), [1]);
  // A numbered block alone is not sheet 1 (the generator's exact-marker rule).
  assert.deepEqual(promptSheets("**NANO BANANA PRO PROMPT 2:**\nx"), []);
});

test("step 3: sheets, shape, then a PDF newer than every sheet", () => {
  const all = { present: [1, 2, 3, 4, 5], mtimes: { 1: 10, 2: 10, 3: 10, 4: 10, 5: 20 } };
  assert.equal(stepOf(base(), 3).status, "todo");
  assert.equal(stepOf(base({ sheets: { present: [1, 2], mtimes: {} } }), 3).status, "progress");
  assert.equal(stepOf(base({ sheets: all }), 3).status, "progress"); // no PDF
  const stale = [{ name: "CRWN-Fan-Economy-Sheets-61-61.pdf", lo: 61, hi: 61, mtime: 15 }];
  assert.match(stepOf(base({ sheets: all, pdfs: stale }), 3).summary, /Rebuild the PDF/);
  const fresh = [{ name: "CRWN-Fan-Economy-Sheets-55-65.pdf", lo: 55, hi: 65, mtime: 30 }];
  assert.equal(stepOf(base({ sheets: all, pdfs: fresh }), 3).status, "done");
  const other = [{ name: "CRWN-Fan-Economy-Sheets-1-9.pdf", lo: 1, hi: 9, mtime: 30 }];
  assert.equal(stepOf(base({ sheets: all, pdfs: other }), 3).status, "progress");
});

test("step 3: a script prompting one sheet is not done even with that sheet and a PDF", () => {
  const one = "**SCRIPT:**\nx\n---\n**NANO BANANA PRO PROMPT:**\na\n---\n**META:** y";
  const s = stepOf(base({ scriptText: one, sheets: { present: [1], mtimes: { 1: 1 } }, pdfs: [{ name: "p", lo: 61, hi: 61, mtime: 9 }] }), 3);
  assert.equal(s.status, "progress");
});

test("step 3: the old four-sheet shape is complete", () => {
  const four = SCRIPT5.replace(/\*\*NANO BANANA PRO PROMPT 5:\*\*\ne\n---\n/, "");
  const s = stepOf(base({ scriptText: four, sheets: { present: [1, 2, 3, 4], mtimes: {} }, pdfs: [{ name: "p", lo: 1, hi: 99, mtime: 1 }] }), 3);
  assert.equal(s.status, "done");
});

const linked = (over) => ({
  ssdError: null, conflicts: ["/w.wav"], candidates: [], linked: { wav: "/w.wav", exists: true, source: "s" },
  duration: 265.4, json: { exists: true, hasSegments: true, hasLanguage: true, segmentCount: 59, lastEnd: 259.0 }, jsxExists: true,
  ...over,
});

test("step 6: known-good 820 transcript (6.4s short) passes; a half transcript fails", () => {
  assert.equal(stepOf(base({ recording: linked() }), 6).status, "done");
  assert.equal(stepOf(base({ recording: linked({ json: { exists: true, hasSegments: true, hasLanguage: true, segmentCount: 30, lastEnd: 130 } }) }), 6).status, "failed");
  assert.equal(stepOf(base({ recording: linked({ jsxExists: false }) }), 6).status, "progress");
  assert.equal(stepOf(base({ recording: linked({ json: { exists: false } }) }), 6).status, "progress");
  assert.equal(stepOf(base({ recording: linked({ json: { exists: true, parseError: "Unexpected end" } }) }), 6).status, "failed");
  assert.equal(stepOf(base({ recording: linked({ json: { exists: true, hasSegments: true, hasLanguage: false, segmentCount: 3, lastEnd: 265 } }) }), 6).status, "failed");
});

test("step 6: no SSD is 'can't tell', never 'not started'; two claimants is a failure", () => {
  assert.equal(stepOf(base({ recording: { ssdError: "gone", conflicts: [], candidates: [] } }), 6).status, "unknown");
  assert.equal(stepOf(base({ recording: { ssdError: null, conflicts: ["/a.wav", "/b.wav"], candidates: [] } }), 6).status, "failed");
});

test("transcript allowance covers every 814-822 gap and scales with length", () => {
  for (const [dur, end] of [[327.1, 323.6], [282.5, 279.0], [291.1, 285.2], [231.1, 225.3], [238.0, 236.1], [234.5, 231.6], [265.4, 259.0], [275.7, 272.3], [267.1, 262.7]]) {
    assert.ok(dur - end <= transcriptGapAllowed(dur));
  }
  assert.equal(transcriptGapAllowed(60), 10);
  assert.equal(transcriptGapAllowed(1440), 72);
});

test("step 9: over the limit fails, stale caption.md fails, in sync is done", () => {
  const car = (cap) => ({ fileName: "61-x.md", text: `# c\n\n**CAPTION:**\n${cap}\n\n---\n**META:** m` });
  assert.equal(stepOf(base({ carousel: car("a".repeat(2201)) }), 9).status, "failed");
  assert.equal(stepOf(base({ carousel: car("hello") }), 9).status, "progress");
  assert.equal(stepOf(base({ carousel: car("hello"), captionMd: { exists: true, text: "old\n" } }), 9).status, "failed");
  assert.equal(stepOf(base({ carousel: car("a".repeat(2200)), captionMd: { exists: true, text: "a".repeat(2200) + "\n" } }), 9).status, "done");
});

test("manual steps come only from check marks", () => {
  assert.equal(stepOf(base(), 4).status, "todo");
  assert.equal(stepOf(base({ manual: { 4: { done: true, at: "2026-09-23T00:00:00Z" } } }), 4).status, "done");
});

test("the current step is the first one not done", () => {
  assert.equal(videoStatus(base()).current, 3);
});

test("helpers", () => {
  assert.equal(leadingNumber("60 tee grizzley vs drake.wav"), 60);
  assert.equal(leadingNumber("New Recording 814 x.wav"), null);
  assert.ok(recordingMatchesSlug("New Recording 814 currensy vs westside gunn.wav", "1-currensy-vs-westside-gunn-volume-vs-scarcity"));
  assert.ok(!recordingMatchesSlug("New Recording 588-esv2-80p-bg-10p-music-m.wav", "1-currensy-vs-westside-gunn-volume-vs-scarcity"));
  assert.ok(!recordingMatchesSlug("New Recording 999.wav", "1-anything"));
  assert.deepEqual(numberGaps([1, 2, 4, 6]), [3, 5]);
  assert.deepEqual(parsePdfName("CRWN-Fan-Economy-Sheets-1-9.pdf"), { lo: 1, hi: 9 });
  assert.equal(parsePdfName("other.pdf"), null);
});
