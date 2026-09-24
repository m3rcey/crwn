// Generalization: the editor is built for the whole Fan Economy library, not one script.
// Every script, read cleanly, must align, cut, plan and validate with zero errors, keep its
// own CTA keyword, end on the 128 card, and never show a withheld figure early.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SCRIPTS_DIR, loadStructure, synthTranscript } from "./lib/testkit.mjs";
import { alignTakes, captionWords } from "./lib/align.mjs";
import { buildEdl, remapWords, lineWindows } from "./lib/cut.mjs";
import { planBeats, validateBeats } from "./lib/beats.mjs";
import { groupCaptions, captionLeaks } from "./lib/captions.mjs";
import { loadCapabilities } from "./lib/claims.mjs";
import { loadLibrary, resolveSheets, toolNames } from "./lib/assets.mjs";

const rules = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "rules.json"), "utf8"));
const caps = loadCapabilities();
const library = loadLibrary();
const tools = toolNames();
const nums = fs.readdirSync(SCRIPTS_DIR).filter((f) => /^\d+-.*\.md$/.test(f)).map((f) => parseInt(f, 10)).sort((a, b) => a - b);

describe("every Fan Economy script plans cleanly", () => {
  for (const num of nums) {
    it(`script ${num}`, () => {
      const S = loadStructure(num);
      const tr = synthTranscript(S, S.lines.map((l) => ({ line: l.id })), { wps: 3.4 });
      const al = alignTakes(S, tr, rules);
      expect(al.coverage).toBeGreaterThan(0.95);
      const edl = buildEdl(S, tr, al, rules);
      const outWords = remapWords(edl, captionWords(S, tr, al));
      const sheets = resolveSheets(S.slug, library, { exists: (p) => /-[2-5]\.jpg$|\/\d+-[^/]+\.jpg$/.test(p) });
      const ctx = { structure: S, outWords, lineTimes: lineWindows(S, outWords), edl, rules, caps, sheets, library, toolName: tools[S.leadMagnet.slug] };
      const plan = planBeats(ctx);
      const v = validateBeats(plan, ctx);
      expect(v.errors).toEqual([]);
      expect(plan.beats.find((b) => b.scene === "cta_keyword").graphic.props.keyword).toBe(S.ctaKeyword);
      expect(plan.beats.filter((b) => b.scene === "endcard")).toHaveLength(1);
      expect(captionLeaks(groupCaptions(outWords, S, rules))).toEqual([]);
      // Product footage only where the claim gate allows.
      for (const b of plan.beats.filter((x) => x.graphic?.props?.footage && x.scene === "crwn_mechanism")) expect(b.graphic.props.gate.allowed).toBe(true);
    });
  }
});
