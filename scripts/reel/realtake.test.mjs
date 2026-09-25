// Take selection and captions on the FIRST REAL recording (script 23, 2026-09-24).
// Synthetic timings could not reproduce these failures (a mutation that disabled the fix
// left every synthetic test green), so the real transcript is the fixture. The fixture
// is the transcript AFTER omission repair (transcribe.mjs), which recovered 65 words the
// full-file Whisper pass had dropped, including ANYWAY and the "not a forecast" qualifier.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { alignTakes, captionWords } from "./lib/align.mjs";
import { loadStructure } from "./lib/testkit.mjs";
import { unspokenWords, validateBeats } from "./lib/beats.mjs";

const rules = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "rules.json"), "utf8"));
const t = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/23-real-transcript.json"), "utf8"));
const S = loadStructure(23);
const al = alignTakes(S, t, rules);
const kept = al.kept.filter((k) => !k.drop).map((k) => t.words[k.w].text).join(" ");
const caps = captionWords(S, t, al).map((w) => w.text).join(" ");

describe("script 23, real delivery", () => {
  it("keeps his paraphrases as part of the sentence", () => {
    expect(kept).toMatch(/worth as an independent artist\? You're about to find out/);
    expect(kept).toMatch(/Now he put out Maybe/);
    expect(kept).toMatch(/behind the scenes content\. Whatever you said when they signed up is what you owe\./);
    expect(kept).toMatch(/What they're going to do is just stop paying/);
  });
  it("drops the real restart and the first of two CTA takes", () => {
    expect(kept).not.toMatch(/those\.\.\./);
    expect(kept.split("Smino just went independent").length - 1).toBe(0);
    expect(kept.toLowerCase().split("i built a free calculator").length - 1).toBe(1);
  });
  it("keeps what omission repair recovered: the CRWN line's end, ANYWAY, the qualifier, the closing questions", () => {
    expect(kept.toLowerCase()).toMatch(/stops just living in your head/);
    expect(kept.toLowerCase()).toMatch(/anyway/);
    expect(kept.toLowerCase()).toMatch(/not a forecast/);
    expect(kept.toLowerCase()).toMatch(/written down outside of your head/);
    expect(al.lines.filter((l) => l.status === "missing")).toEqual([]);
  });
  it("captions print what he said, in the script's spelling only when it is the same word", () => {
    expect(caps).toMatch(/that you was busy/i);
    expect(caps).not.toMatch(/That's you was busy/);
    expect(caps).toMatch(/does not feel/);
    expect(caps).toMatch(/which ones are owed/);
    expect(caps).toMatch(/worth to Smino\?/);
    expect(caps).not.toMatch(/fanbases fanbases/);
    expect(caps).toMatch(/real fanbases move in and out/);
    // Meaning-synonyms never replace what he said (V1 review, 2026-09-24).
    expect(caps).toMatch(/they're not going to argue/i);
    expect(caps).not.toMatch(/they dont going/i);
    expect(caps).toMatch(/those two are not small/i);
    expect(caps).not.toMatch(/are aint/i);
    expect(caps).toMatch(/What they're going to do/);
    expect(caps).not.toMatch(/one, of them/);
    // No word of the script is printed twice in a row.
    const ws = caps.split(/\s+/);
    for (let i = 1; i < ws.length; i++) if (ws[i].length > 3) expect(ws[i].replace(/[^a-z]/gi, "").toLowerCase(), `"${ws[i - 1]} ${ws[i]}"`).not.toBe(ws[i - 1].replace(/[^a-z]/gi, "").toLowerCase());
  });
});

// Visuals follow what he SAID (2026-09-25). On this take he never said "Zero Fatigue" (the
// script names the collective; he said "his own collective") and never said "arithmetic"
// (he said "this is not a forecast"). V1 put both on screen anyway.
describe("script 23, visuals follow the spoken edit", () => {
  const cw = captionWords(S, t, al);
  // The clean timeline is the source timeline for this check (no EDL needed): what matters
  // is whether he says a word near where it is shown.
  const outWords = cw.map((w) => ({ ...w }));
  const at = (line) => outWords.find((w) => w.line === line).start;
  const beat = (id, start, end, text, extra = {}) => ({ id, start, end, scene: "aroll_proof", lines: [], text, ...extra });
  const judge = (b) => unspokenWords(b.text[0], outWords, b.start - rules.visual.spokenWindowSec, b.end + rules.visual.spokenWindowSec, S);
  it("flags a script-only name he never said", () => {
    const b = beat(1, at(4), at(4) + 3, ["ZERO FATIGUE"]);
    expect(judge(b)).toEqual(["ZERO", "FATIGUE"]);
  });
  it("passes words he did say, reworded", () => {
    expect(judge(beat(2, at(4), at(4) + 3, ["HIS OWN COLLECTIVE"]))).toEqual([]);
    expect(judge(beat(3, at(26), at(26) + 3, ["NOT A FORECAST"]))).toEqual([]);
    expect(judge(beat(4, at(26), at(26) + 3, ["ARITHMETIC, NOT A FORECAST"]))).toEqual(["ARITHMETIC"]);
  });
});
