// Phrase integrity: a cut must never chop a word. These tests model the three causes
// measured on the first real reel (script 23): a consonant closure read as silence, a
// recognizer that ends words early and starts them late, and frame rounding.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { withLevels, quietThreshold, decayPoint, onsetPoint, auditBoundaries } from "./lib/boundaries.mjs";
import { loadStructure, synthTranscript } from "./lib/testkit.mjs";
import { alignTakes } from "./lib/align.mjs";
import { buildEdl } from "./lib/cut.mjs";

const rules = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "rules.json"), "utf8"));
const HOP = 0.005;
const ROOM = 0.004, VOICE = 0.15;

/** An envelope from [start, end, level] regions over room tone. */
function env(regions, dur) {
  const rms = new Float32Array(Math.ceil(dur / HOP)).fill(ROOM);
  for (const [a, b, v] of regions) for (let i = Math.floor(a / HOP); i < Math.ceil(b / HOP); i++) rms[i] = v;
  // A long run of speech so the peak and floor percentiles mean what they do on a real take.
  return withLevels({ hop: HOP, rms });
}

describe("acoustic boundaries", () => {
  // "Dis" 1.00-1.20, a 30ms stop closure, "cord" 1.23-1.45; room tone; next word at 1.80.
  const speech = [[0, 0.9, VOICE * 0.8], [1.0, 1.2, VOICE], [1.23, 1.45, VOICE], [1.8, 2.2, VOICE], [2.6, 4, VOICE * 0.9]];
  const e = env(speech, 5);
  const thrDb = quietThreshold(e);

  it("a consonant closure inside a word is not the end of the word", () => {
    // The recognizer says the word ended at 1.20 (early, at the closure).
    const d = decayPoint(e, 1.18, 1.95, { thrDb, holdSec: 0.09 });
    expect(d).toBeGreaterThanOrEqual(1.45 - 1e-6);
    expect(d).toBeLessThan(1.8);
  });
  it("a word starts where its onset really begins, not at the recognizer's late start", () => {
    const o = onsetPoint(e, 1.9 + 0.03, 1.45, { thrDb, holdSec: 0.06 });
    expect(o).toBeLessThanOrEqual(1.8 + 1e-6);
    expect(o).toBeGreaterThan(1.45);
  });
  it("the audit fails a cut inside a closure or on voiced audio, and passes one in room tone", () => {
    const seg = (srcOut, srcIn) => ({ segments: [{ srcIn: 0, srcOut, outStart: 0, outEnd: srcOut }, { srcIn, srcOut: 4, outStart: srcOut, outEnd: srcOut + 4 - srcIn }] });
    expect(auditBoundaries(seg(1.21, 1.75), e).map((b) => b.kind)).toEqual(["out"]); // in the closure
    expect(auditBoundaries(seg(1.4, 1.75), e).map((b) => b.kind)).toEqual(["out"]); // mid-"cord"
    expect(auditBoundaries(seg(1.55, 1.85), e).map((b) => b.kind)).toEqual(["in"]); // onset cut off
    expect(auditBoundaries(seg(1.55, 1.75), e)).toEqual([]);
  });
});

describe("the cut places boundaries acoustically", () => {
  it("with the recognizer ending words early, no out-point lands before the voice decays", () => {
    const S = loadStructure(14);
    const tr = synthTranscript(S, [{ line: 0 }, { pause: 1.2 }, { line: 1 }, { line: 2 }, { pause: 1.5 }, { line: 3 }], { wps: 3.4 });
    const al = alignTakes(S, tr, rules);
    // The real voice runs 0.12s past every recognized word end (a decaying tail, with a
    // 30ms closure 40ms after the recognized end, the case that broke the first reel).
    const dur = tr.duration + 2;
    const regions = [];
    for (const w of tr.words) if (w.type === "word") regions.push([w.start, w.end + 0.04, VOICE], [w.end + 0.07, w.end + 0.12, VOICE * 0.5]);
    const e = env(regions, dur);
    const edl = buildEdl(S, tr, al, rules, { envelope: e });
    expect(auditBoundaries(edl, e)).toEqual([]);
    for (const s of edl.segments) {
      const last = tr.words[s.w1];
      if (edl.segments[s.i + 1] && edl.segments[s.i + 1].srcIn > s.srcOut + 1e-3) expect(s.srcOut).toBeGreaterThanOrEqual(last.end + 0.12 - 1e-6);
    }
  });
});
