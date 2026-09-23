// node --test "studio/**/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSplitOutput, parsePlacement, splitCommand } from "./tools.mjs";
import { jsxAudioPath } from "./actions.mjs";
import { refuseWrite } from "./guard.mjs";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "../test/fixtures");
const fixture = (n) => fs.readFileSync(path.join(FIX, `split-${n}.txt`), "utf-8");

test("split parser: a real good run (819) passes every check", () => {
  const r = parseSplitOutput(fixture(819));
  assert.equal(r.loaded, 46);
  assert.equal(r.built, 46);
  assert.equal(r.dropped, 0);
  assert.equal(Math.round(r.ratio * 100), 64);
  assert.ok(r.wrote.endsWith("_overlap_phrases.jsx"));
  assert.ok(r.ok);
});

test("split parser: the real 822 run is blocked on Built != Loaded", () => {
  const r = parseSplitOutput(fixture(822));
  assert.equal(r.built, 61);
  assert.equal(r.loaded, 71);
  assert.equal(r.ok, false);
  assert.equal(r.checks.find((c) => !c.ok).label, "Built 61 phrases = Loaded 71 segments");
});

test("split parser: fails a short timeline, dropped fragments, missing lines and sentence mapping", () => {
  const good = fixture(819);
  assert.equal(parseSplitOutput(good.replace("Timeline duration: 151.04s", "Timeline duration: 100.00s")).ok, false); // 43%
  assert.equal(parseSplitOutput(good.replace("Dropped 0 short", "Dropped 2 short")).ok, false);
  assert.equal(parseSplitOutput(good.replace(/^Dropped.*$|  Dropped.*$/m, "")).ok, false); // line absent is not 0
  assert.equal(parseSplitOutput(good.replace("from word-level timing", "(sentence-mapped; --no_align)")).ok, false);
  assert.equal(parseSplitOutput("").ok, false);
});

test("split command: always --no-dedupe, never --script, utf8 + unbuffered", () => {
  const { args } = splitCommand("/mnt/c/a b.wav", "/mnt/c/a b.json");
  assert.ok(args.includes("--no-dedupe"));
  assert.ok(!args.includes("--script"));
  assert.deepEqual(args.slice(0, 3), ["-X", "utf8", "-u"]);
  assert.equal(args[4], "C:\\a b.wav");
});

test("placement parser: reads the JSX's own closing message", () => {
  const ok = "overlap_phrases.jsx complete.\nPlaced: 60 of 60 on A3/A4\nFailed: 0\nTimeline range: 0.00s - 181.39s\n";
  assert.deepEqual(parsePlacement(ok), { placed: 60, total: 60, failed: 0, ok: true });
  assert.equal(parsePlacement("overlap_phrases.jsx complete.\nPlaced: 58 of 60 on A3/A4\nFailed: 2\n").ok, false);
  assert.equal(parsePlacement("Placed: 60 of 61\nFailed: 0").ok, false);
  assert.equal(parsePlacement("No active sequence.").ok, false);
  assert.equal(parsePlacement("").ok, false);
  assert.equal(parsePlacement("Master placement complete.\nReels: 9\nPlaced: 540  Failed: 0").ok, true);
});

test("jsxAudioPath unescapes the JSX string", () => {
  const jsx = '    var audioPath = "D:\\\\Videos\\\\2026\\\\New Recording 814 x.wav";\n';
  assert.equal(jsxAudioPath(jsx), "D:\\Videos\\2026\\New Recording 814 x.wav");
});

test("guard: refuses with no SSD, a non-mount, and anywhere outside Fan Economy", () => {
  assert.match(refuseWrite({ root: null, error: "gone" }, "/x/y.json"), /isn't available/);
  assert.match(refuseWrite({ root: "/mnt/d" }, "/mnt/d/Videos/a.json"), /not a mounted drive/);
  // /mnt/c is a real mount, but has no Fan Economy folder under it.
  assert.match(refuseWrite({ root: "/mnt/c" }, "/mnt/c/a.json"), /doesn't exist yet/);
});
