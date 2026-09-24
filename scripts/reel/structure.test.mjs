import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseFanEconomy, emphasisWords, figurePhrases, namedEntities, revealKind, lineNumberTokens } from "./lib/structure.mjs";
import { spokenNumbers } from "./lib/numberWords.mjs";
import { SCRIPTS_DIR, loadStructure } from "./lib/testkit.mjs";

const all = fs.readdirSync(SCRIPTS_DIR).filter((f) => /^\d+-.*\.md$/.test(f)).map((f) => ({ f, s: parseFanEconomy(fs.readFileSync(path.join(SCRIPTS_DIR, f), "utf8"), { num: parseInt(f), slug: f.replace(/\.md$/, "") }) }));

describe("every Fan Economy script parses into the series grammar", () => {
  it("finds the whole library", () => expect(all.length).toBeGreaterThanOrEqual(58));
  for (const { f, s } of all) {
    it(f, () => {
      const roles = s.lines.map((l) => l.role);
      expect(roles[0]).toBe("hook");
      expect(s.ctaKeyword, "CTA keyword").toMatch(/^[A-Z]{2,}$/);
      expect(s.warnings.filter((w) => w.includes("conflict"))).toEqual([]);
      expect(roles).toContain("cta_keyword");
      expect(roles).toContain("detour_thesis");
      expect(roles.filter((r) => r === "reveal")).toHaveLength(1);
      // Order: hook < detour < reveal < CTA.
      const a = s.anchors;
      expect(a.thesis).toBeGreaterThan(a.hookEnd);
      expect(a.revealLine).toBeGreaterThan(a.detourEnd === -1 ? a.thesis : a.detourEnd - 1);
      expect(a.kwLine).toBeGreaterThan(a.revealLine);
      // The spoken CTA line says the same keyword the parser extracted.
      expect(s.lines[a.kwLine].text).toContain(s.ctaKeyword);
      expect(s.endcard.text).toBe("128");
      // No withheld figure is SPOKEN before the detour.
      for (const t of s.withheld.tokens) for (const l of s.lines.slice(0, a.detourStart)) expect(l.numbers, `${t} spoken early in "${l.text}"`).not.toContain(t);
    });
  }
});

describe("withheld reveal", () => {
  it("Money Man: $250,000 is the hook, $1,000,000 is the answer", () => {
    const s = loadStructure(14);
    expect(s.withheld.tokens).toEqual(["1000000"]);
    expect(s.lines[s.withheld.revealLine].text).toMatch(/\$1,000,000 advance/);
    expect(s.lines[0].numbers).toContain("250000");
  });
  it("Akeem Ali: the reveal is the hours, a time reveal", () => {
    const s = loadStructure(18);
    expect(s.withheld.tokens).toContain("3000");
    expect(s.withheld.kind).toBe("time");
  });
  it("Tee Grizzley: the reported $200,000 a month", () => {
    const s = loadStructure(10);
    expect(s.withheld.tokens).toEqual(["200000"]);
    expect(s.leadMagnet).toMatchObject({ slug: "opportunity-calculator", keyword: "FREE" });
  });
  it("a reveal written in words is still withheld (Wu-Tang: Two million dollars)", () => {
    const s = loadStructure(41);
    expect(s.withheld.tokens).toContain("2000000");
    expect(s.lines[s.withheld.revealLine].text).toMatch(/^Two million dollars/);
  });
  it("a conceptual reveal is found by its words (Kool Keith: not one)", () => {
    const s = loadStructure(60);
    expect(s.lines[s.withheld.revealLine].text).toMatch(/^Not one\./);
  });
  it("reveal kinds", () => {
    expect(revealKind("money (the reported $200,000 a month)")).toBe("money");
    expect(revealKind("not one, because no list exists")).toBe("concept");
  });
});

describe("line features", () => {
  it("stress capitals are the scriptwriter's emphasis, acronyms are not", () => {
    expect(emphasisWords("Money Man paid to LEAVE a deal")).toEqual(["LEAVE"]);
    expect(emphasisWords("Partnered with EMPIRE for distribution on HIS terms")).toEqual(["HIS"]);
    expect(emphasisWords("On the CRWN app")).toEqual([]);
  });
  it("figures keep their qualifier and unit", () => {
    const f = figurePhrases("About 3,000 hours a year of content his team never had to make.");
    expect(f[0]).toMatchObject({ figure: "3,000", qualifier: "about" });
    expect(f[0].unit).toMatch(/^hours a year/);
  });
  it("a spoken figure in a dollar line is dollars", () => {
    const f = figurePhrases("He paid $250,000 to be free. Then a distributor paid HIM a million, while he kept everything.");
    expect(f.map((x) => x.figure)).toEqual(["$250,000", "$1,000,000"]);
    expect(f[1].unit).toBeFalsy();
  });
  it("figures stay whole and never come from inside a word", () => {
    const a = figurePhrases("1.5 million monthly listeners generate roughly $15,000 a month from streaming.");
    expect(a.map((f) => f.figure)).toEqual(["1.5 million", "$15,000"]);
    const b = figurePhrases("F-1 Trillion is $45.99, and a run of $29.98 to $34.98.");
    expect(b.map((f) => f.figure)).toEqual(["$45.99", "$29.98", "$34.98"]);
    expect(figurePhrases("Tech N9ne got rich being independent")).toEqual([]);
  });
  it("names on screen, not fragments of the artist's own name", () => {
    expect(namedEntities("Money Man was signed to Cash Money.", "Money Man")).toEqual(["Cash Money"]);
    expect(namedEntities("He went back to his own label, Black Circle Family.", "Money Man")).toEqual(["Black Circle Family"]);
  });
  it("spoken numbers", () => {
    expect(spokenNumbers("Twelve and a half million in the US alone.")[0].value).toBe(12500000);
    expect(spokenNumbers("A hundred and thirteen thousand and seventeen dollars")[0].value).toBe(113017);
    expect(spokenNumbers("He estimated about half a million.")[0].value).toBe(500000);
    expect(spokenNumbers("One is wide. One is deep.")).toEqual([]);
    expect(lineNumberTokens("They toured sixty shows in seventy one days.")).toEqual(["60", "71"]);
  });
});
