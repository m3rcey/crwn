import { describe, it, expect } from "vitest";
import { validateStoryboard, sceneDurationSec, estimateReadTimeSec } from "./lib/schema.mjs";
import { fixtureStoryboard, fixtureSourceNumbers } from "./lib/fixtures.mjs";

const opts = () => ({ sourceNumbers: fixtureSourceNumbers(), expectReveal: true });

describe("validateStoryboard", () => {
  it("passes the reference fixture", () => {
    const r = validateStoryboard(fixtureStoryboard(), opts());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("fails an unsupported motion", () => {
    const sb = fixtureStoryboard();
    sb.scenes[1].shots[0].motion = "SPIN";
    const r = validateStoryboard(sb, opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("unsupported motion SPIN");
  });

  it("fails when the withheld reveal number leaks into an earlier scene", () => {
    const sb = fixtureStoryboard();
    sb.scenes[1].screenText.push("$2,000,000");
    sb.scenes[1].imagePrompt += ' "$2,000,000"';
    const r = validateStoryboard(sb, opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("withheld number");
  });

  it("fails when the reveal leaks into an earlier IMAGE PROMPT even if not screen text", () => {
    const sb = fixtureStoryboard();
    sb.scenes[2].imagePrompt += " background text reads OVER $2,000,000";
    const r = validateStoryboard(sb, opts());
    expect(r.ok).toBe(false);
  });

  it("fails a fabricated number that is not in the source", () => {
    const sb = fixtureStoryboard();
    sb.scenes[2].screenText = ["17,500 BOUGHT"];
    sb.scenes[2].imagePrompt += ' "17,500 BOUGHT"';
    const r = validateStoryboard(sb, opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("17500");
  });

  it("small counts (<= 12) are exempt from the fabrication check (prose spells them out)", () => {
    const sb = fixtureStoryboard();
    sb.scenes[2].screenText = ["8 MONTHS", "15,000 BOUGHT"];
    sb.scenes[2].imagePrompt += ' "8 MONTHS" "15,000 BOUGHT"';
    const r = validateStoryboard(sb, opts());
    expect(r.errors.filter((e) => e.includes('"8"'))).toEqual([]);
  });

  it("fails when the CTA scene drops the keyword", () => {
    const sb = fixtureStoryboard();
    sb.scenes[7].screenText = ["GO GET THE TOOL"];
    sb.scenes[7].imagePrompt = 'Hand-letter exactly once: "GO GET THE TOOL". A tall page.'.padEnd(90, " detail");
    const r = validateStoryboard(sb, opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('keyword "OWN"');
  });

  it("fails screen text missing from the image prompt (the prompt is what letters the page)", () => {
    const sb = fixtureStoryboard();
    sb.scenes[3].screenText = ["A LINE THE PROMPT FORGOT"];
    const r = validateStoryboard(sb, opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("not present in imagePrompt");
  });

  it("fails a text-overloaded scene", () => {
    const sb = fixtureStoryboard();
    const wall = "THIS IS A VERY LONG WALL OF WORDS THAT KEEPS GOING AND GOING AND GOING AND GOING AND GOING AND GOING AND GOING AND GOING AND NEVER EVER STOPS AT ALL";
    sb.scenes[3].screenText = [wall];
    sb.scenes[3].imagePrompt += ` "${wall}"`;
    const r = validateStoryboard(sb, opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("density cap");
  });

  it("fails when scene 0 is not the HOOK", () => {
    const sb = fixtureStoryboard();
    sb.scenes[0].roles = ["CONTEXT"];
    const r = validateStoryboard(sb, opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("scene 0 must carry HOOK");
  });

  it("fails a missing REVEAL when META declares one", () => {
    const sb = fixtureStoryboard();
    sb.scenes[5].roles = ["PAYOFF"];
    const r = validateStoryboard(sb, opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("REVEAL");
  });

  it("fails a shot pointing at a nonexistent element", () => {
    const sb = fixtureStoryboard();
    sb.scenes[2].shots[0].focalElement = "GHOST";
    const r = validateStoryboard(sb, opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("GHOST");
  });
});

describe("durations", () => {
  it("reading load raises duration; roles band it; scenes are not uniform", () => {
    const sb = fixtureStoryboard();
    const durs = sb.scenes.map(sceneDurationSec);
    expect(new Set(durs.map((d) => d.toFixed(2))).size).toBeGreaterThan(2);
    for (const d of durs) {
      expect(d).toBeGreaterThan(1.0);
      expect(d).toBeLessThan(5.0);
    }
    // TENSION beats stay short.
    expect(durs[3]).toBeLessThanOrEqual(2.4);
  });

  it("read time model scales with words", () => {
    expect(estimateReadTimeSec(["ONE TWO THREE FOUR FIVE SIX"])).toBeGreaterThan(
      estimateReadTimeSec(["ONE TWO"])
    );
  });
});
