import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { alignTakes, captionWords, sim, norm, tokenize, numberValue } from "./lib/align.mjs";
import { loadStructure, synthTranscript } from "./lib/testkit.mjs";

const rules = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "rules.json"), "utf8"));
const s14 = loadStructure(14);
const keptText = (tr, al) => al.kept.filter((k) => !k.drop).map((k) => tr.words[k.w].text).join(" ");

describe("word matching", () => {
  it("treats dialect and contractions as the same word", () => {
    expect(sim(norm("ya"), norm("your"))).toBeGreaterThan(0.9);
    expect(sim(norm("dont"), norm("don't"))).toBe(1);
    expect(sim(norm("gon"), norm("gonna"))).toBeGreaterThan(0.72);
  });
  it("matches numbers only by value, whatever way they are written", () => {
    expect(numberValue("$1,000,000")).toBe(1000000);
    expect(numberValue("1 million")).toBe(1000000);
    expect(numberValue("one million")).toBe(1000000);
    expect(numberValue("250,000")).toBe(250000);
    const a = tokenize([{ text: "a" }, { text: "$1,000,000" }, { text: "advance" }]);
    const b = tokenize([{ text: "a" }, { text: "one" }, { text: "million" }, { text: "advance" }]);
    expect(a.map((t) => t.n)).toEqual(["a", "#1000000", "advance"]);
    expect(b.map((t) => t.n)).toEqual(["a", "#1000000", "advance"]);
    expect(sim("#250000", "#1000000")).toBe(0);
  });
});

describe("take selection", () => {
  it("a clean read keeps every line", () => {
    const tr = synthTranscript(s14, s14.lines.map((l) => ({ line: l.id })));
    const al = alignTakes(s14, tr, rules);
    expect(al.coverage).toBeGreaterThan(0.97);
    expect(al.lines.every((l) => l.status === "clean")).toBe(true);
  });

  it("an abandoned take is dropped and the complete retake kept", () => {
    const plan = [{ line: 0 }, { line: 1 }, { line: 2, upTo: 6 }, { pause: 1.2 }, { line: 2 }, { line: 3 }];
    const tr = synthTranscript(s14, plan);
    const al = alignTakes(s14, tr, rules);
    const l2 = al.lines[2];
    expect(l2.status).toBe("clean");
    expect(l2.takes).toHaveLength(1);
    expect(l2.dropped.length).toBeGreaterThan(0);
    // The kept line-2 words are the SECOND attempt.
    const retakeStart = tr.words.findIndex((w, i) => i > 0 && w.start - tr.words[i - 1].end > 1);
    const keptL2 = al.kept.filter((k) => k.line === 2 && !k.drop);
    expect(keptL2.every((k) => k.w >= retakeStart)).toBe(true);
  });

  it("the founder's rule: of two complete takes, the LAST one wins", () => {
    const plan = [{ line: 0 }, { line: 1 }, { line: 3 }, { pause: 0.8 }, { line: 3 }, { line: 4 }];
    const tr = synthTranscript(s14, plan);
    const al = alignTakes(s14, tr, rules);
    const secondStart = tr.words.findIndex((w, i) => i > 0 && w.start - tr.words[i - 1].end > 0.6);
    const kept3 = al.kept.filter((k) => k.line === 3 && !k.drop);
    expect(kept3.length).toBeGreaterThan(0);
    expect(kept3.every((k) => k.w >= secondStart)).toBe(true);
  });

  it("a restart in the MIDDLE of a line keeps the good first half", () => {
    // Says line 5 up to word 8, restarts from word 4, finishes.
    const plan = [{ line: 4 }, { line: 5, upTo: 8 }, { pause: 0.5 }, { line: 5, from: 4 }, { line: 6 }];
    const tr = synthTranscript(s14, plan);
    const al = alignTakes(s14, tr, rules);
    expect(al.lines[5].coverage).toBeGreaterThan(0.95);
    const text = keptText(tr, al);
    const l5 = s14.lines[5].text;
    // Line 5 appears exactly once in the kept speech.
    expect(text.split(l5.split(" ").slice(4, 7).join(" ")).length - 1).toBe(1);
  });

  it("drops a stutter, a long filler and an off-script aside, keeps the words", () => {
    const plan = [
      { line: 0 },
      { say: "Money" }, { line: 2 },
      { filler: "uhhh" },
      { pause: 2.5 },
      { say: "hold on let me look at my phone real quick" },
      { pause: 2 },
      { line: 3 },
    ];
    const tr = synthTranscript(s14, plan);
    tr.words.find((w) => w.text === "uhhh").type = "filler";
    const al = alignTakes(s14, tr, rules);
    const text = keptText(tr, al);
    expect(text).not.toMatch(/phone/);
    expect(text).not.toMatch(/uhhh/);
    expect(text.startsWith("How much")).toBe(true);
    expect(al.lines[2].status).toBe("clean");
    expect(al.lines[3].status).toBe("clean");
    expect(al.offscript.some((o) => /phone/.test(o.text))).toBe(true);
  });

  it("a one-word line said on its own is kept (ANYWAY.)", () => {
    const d = s14.anchors.detourEnd;
    const plan = [{ line: d - 1 }, { pause: 0.8 }, { line: d }, { pause: 0.8 }, { line: d + 1 }];
    const al = alignTakes(s14, synthTranscript(s14, plan), rules);
    expect(al.lines[d].status).toBe("clean");
  });

  it("speech the recognizer mangled is kept when it fills a hole in the line", () => {
    // The recognizer heard "$1,000,000 advance" as nonsense, after a pause.
    const r = s14.withheld.revealLine;
    const ws = s14.lines[r].words;
    const cut = ws.findIndex((w) => w.includes("1,000,000"));
    const plan = [{ line: r - 1 }, { say: ws.slice(0, cut).join(" ") }, { pause: 0.5 }, { say: "won mill yen adva nts." }, { pause: 0.5 }, { say: ws.slice(cut + 2).join(" ") }, { line: r + 1 }];
    const tr = synthTranscript(s14, plan);
    const al = alignTakes(s14, tr, rules);
    expect(keptText(tr, al)).toContain("won mill yen");
    expect(al.filled.length).toBe(1);
  });

  it("an aside between two lines is NOT gap-filled", () => {
    const plan = [{ line: 3 }, { pause: 1 }, { say: "hold on let me look at my phone" }, { pause: 1 }, { line: 4 }];
    const tr = synthTranscript(s14, plan);
    const al = alignTakes(s14, tr, rules);
    expect(keptText(tr, al)).not.toMatch(/phone/);
  });

  it("a line never delivered is reported missing, not invented", () => {
    const plan = s14.lines.filter((l) => l.id !== 7).map((l) => ({ line: l.id }));
    const al = alignTakes(s14, synthTranscript(s14, plan), rules);
    expect(al.lines[7].status).toBe("missing");
  });

  it("paraphrased delivery still aligns (delivery drifts from the page)", () => {
    const plan = [{ line: 0 }, { say: "Let's find out y'all" }, { say: "Money Man paid to leave a deal not to sign one and what came after is somethin independent artists like him gotta pay attention to" }];
    const al = alignTakes(s14, synthTranscript(s14, plan), rules);
    expect(["clean", "partial"]).toContain(al.lines[2].status);
  });
});

describe("caption words", () => {
  it("print the script's spelling, not the recognizer's", () => {
    const tr = synthTranscript(s14, [{ line: 0 }, { line: 1 }]);
    // The recognizer heard "Moneyman" and "250000".
    const heard = tr.words.map((w) => ({ ...w, text: w.text.replace("$250,000", "250,000") }));
    const al = alignTakes(s14, { ...tr, words: heard }, rules);
    const cw = captionWords(s14, { ...tr, words: heard }, al);
    expect(cw.map((w) => w.text).join(" ")).toContain("$250,000");
    expect(cw.map((w) => w.text).join(" ")).toContain("AFTER");
  });
});
