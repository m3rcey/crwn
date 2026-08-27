import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseScriptMarkdown,
  parseMeta,
  extractCtaKeyword,
  sourceNumberTokens,
  normalizeNumberToken,
  screenNumberTokens,
} from "./lib/scriptParse.mjs";
import { PATHS } from "./config.mjs";

const MINI = `# Test Artist: the number

**SCRIPT:**

Test Artist sold 400 copies at $300 each.
Comment VAULT and I'll DM you the link.

---

**NANO BANANA PRO PROMPT:**

Flat scan of a white sheet of paper with "400 COPIES".

---

**META:** Artist: Test Artist · Family: G/Comparison · Metric: 400 copies at ~$300 (verified) ·
Withheld variable: the total · Big Reveal: comparison ($120,000) ·
Lead magnet: vault-revenue-planner + VAULT · CRWN claim tier: shipped
`;

describe("parseScriptMarkdown", () => {
  it("parses title, script, prompt block, and META", () => {
    const p = parseScriptMarkdown(MINI);
    expect(p.title).toBe("Test Artist: the number");
    expect(p.scriptText).toContain("400 copies");
    expect(p.nanoPrompt).toContain("400 COPIES");
    expect(p.meta["family"]).toBe("G/Comparison");
    expect(p.ctaKeyword).toBe("VAULT");
    expect(p.warnings).toEqual([]);
  });

  it("handles a script with no prompt block (script 14 shape)", () => {
    const noPrompt = MINI.replace(/\*\*NANO BANANA PRO PROMPT:\*\*[\s\S]*?---\n/, "");
    const p = parseScriptMarkdown(noPrompt);
    expect(p.nanoPrompt).toBeNull();
    expect(p.scriptText).toContain("400 copies");
  });

  it("flags a script/META keyword conflict instead of silently reconciling", () => {
    const conflicted = MINI.replace("vault-revenue-planner + VAULT", "own-your-fans + OWN");
    const p = parseScriptMarkdown(conflicted);
    expect(p.warnings.some((w) => w.includes("conflict"))).toBe(true);
    expect(p.ctaKeyword).toBe("VAULT"); // script wins
  });

  it("META values keep colons after the first", () => {
    const meta = parseMeta("Artist: A · Metric: ratio 1:5 stays intact");
    expect(meta["metric"]).toBe("ratio 1:5 stays intact");
  });

  it("keyword extraction falls back to META when the script has none", () => {
    const { keyword } = extractCtaKeyword("no call to action here", { "lead magnet": "tool + FREE" });
    expect(keyword).toBe("FREE");
  });
});

describe("number tokens", () => {
  it("normalizes currency, commas and suffixes to comparable forms", () => {
    expect(normalizeNumberToken("$2,000,000")).toBe("2000000");
    expect(normalizeNumberToken("$2M")).toBe("2000000");
    expect(normalizeNumberToken("15,000")).toBe("15000");
  });

  it("collects source numbers so fabricated screen numbers can be caught", () => {
    const p = parseScriptMarkdown(MINI);
    const nums = sourceNumberTokens(p);
    expect(nums.has("400")).toBe(true);
    expect(nums.has("300")).toBe(true);
    expect(nums.has("120000")).toBe(true);
    expect(nums.has("999999")).toBe(false);
  });

  it("reads screen text numbers with the same normalization", () => {
    expect(screenNumberTokens("OVER $2,000,000")).toContain("2000000");
  });

  it("magnitude words normalize the same on both sides ('$2 million' == '$2,000,000')", () => {
    expect(screenNumberTokens("OVER $2 MILLION")).toContain("2000000");
    const p = parseScriptMarkdown(MINI.replace("$120,000", "over $2 million total"));
    expect(sourceNumberTokens(p).has("2000000")).toBe(true);
  });

  it("'a penny a month' in prose licenses 0.01 on screen", () => {
    const p = parseScriptMarkdown(MINI.replace("400 copies", "a penny a month per listener and 400 copies"));
    expect(sourceNumberTokens(p).has("0.01")).toBe(true);
  });
});

describe("real script corpus", () => {
  it("parses every fan-economy script without errors", () => {
    const files = fs.readdirSync(PATHS.scriptsDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) {
      const p = parseScriptMarkdown(fs.readFileSync(path.join(PATHS.scriptsDir, f), "utf-8"));
      expect(p.title, f).not.toBe("(untitled)");
      expect(p.scriptText.length, f).toBeGreaterThan(200);
      expect(p.ctaKeyword, f).toBeTruthy();
    }
  });
});
