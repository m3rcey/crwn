import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { REPO_ROOT, MOTION } from "./config.mjs";
import {
  validateMotionSpec,
  specDurationSec,
  scaffoldMotionSpec,
  resolveTextLayer,
  sheetSize,
  SLOTS,
  rectsOverlap,
} from "./lib/motionSpec.mjs";
import { buildFactLock } from "./lib/factLock.mjs";
import { specPath } from "./lib/motionJob.mjs";
import { fixtureParsedScript, fixtureMotionSpec, fixtureStoryboard } from "./lib/fixtures.mjs";

// A real repo asset, because the validator's job includes refusing a spec whose
// artwork is missing: pointing at a fake path would test nothing.
const ARTWORK = path.join(REPO_ROOT, "scripts/vsl/assets/crown-black.png");
const lock = () => buildFactLock(fixtureParsedScript());
const spec = () => fixtureMotionSpec(ARTWORK);
const validate = (s, opts = {}) => validateMotionSpec(s, lock(), { repoRoot: REPO_ROOT, ...opts });

describe("validateMotionSpec", () => {
  it("passes the reference fixture", () => {
    const r = validate(spec());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("pins the total duration to the target", () => {
    const s = spec();
    expect(specDurationSec(s)).toBeCloseTo(30.0, 3);
    s.scenes[0].durationSec += 1.5;
    const r = validate(s);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/durations total 31.50s, target is 30.00s/);
  });

  it("refuses a fabricated figure before anything is drawn", () => {
    const s = spec();
    s.scenes[1].text[0].text = "$3,500,000";
    const r = validate(s);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/is not in the source script\/META/);
  });

  it("refuses a malformed figure", () => {
    const s = spec();
    s.scenes[1].text[0].text = "$2,000,00";
    const r = validate(s);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/malformed figure/);
  });

  it("fact-checks every value a counter passes through, not just the last one", () => {
    const s = spec();
    s.scenes[1].text[0].motion = { kind: "COUNTER", startSec: 0.2, durSec: 1.0, values: ["$500,000", "$9,999,999"] };
    const r = validate(s);
    expect(r.errors.join()).toMatch(/counter value "9999999" is not in the source/);
  });

  it("requires the CTA keyword on the CTA scene, spelled exactly", () => {
    const s = spec();
    s.scenes[2].text[0].text = "COMMENT Own";
    const r = validate(s);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/does not show the keyword "OWN" exactly/);
  });

  it("requires a HOOK on scene 0 and a CTA somewhere", () => {
    const s = spec();
    s.scenes[0].roles = ["CONTEXT"];
    expect(validate(s).errors.join()).toMatch(/scene 0 must carry HOOK/);
    const s2 = spec();
    s2.scenes[2].roles = ["PAYOFF"];
    expect(validate(s2).errors.join()).toMatch(/no scene carries CTA/);
  });

  it("keeps the withheld figure out of the scenes before the reveal", () => {
    const s = spec();
    // Move the payoff figure into the hook.
    s.scenes[0].text.push({
      id: "leak",
      text: "$2,000,000",
      slot: "caption",
      x: 0.5,
      y: 0.5,
      size: 0.03,
      motion: { kind: "FADE", startSec: 0.2, durSec: 0.3 },
    });
    const r = validate(s, { storyboard: fixtureStoryboard() });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/withheld figure "2000000" appears before the reveal/);
  });

  it("fails a missing artwork file rather than discovering it mid-render", () => {
    const s = spec();
    s.artwork[0].file = "videos/does-not-exist/nope.jpg";
    const r = validate(s);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/artwork "sheet" file not found/);
  });

  it("fails a plate reference that does not exist", () => {
    const s = spec();
    s.scenes[0].plates[0].plate = "ghost-plate";
    expect(validate(s).errors.join()).toMatch(/unknown plate "ghost-plate"/);
  });

  it("fails an out-of-range crop", () => {
    const s = spec();
    s.plates[0].crop = { x: 0.8, y: 0.1, w: 0.5, h: 0.4 };
    expect(validate(s).errors.join()).toMatch(/invalid normalized crop/);
  });

  it("fails an unsupported motion kind on either a plate or a text layer", () => {
    const s = spec();
    s.scenes[0].plates[0].motion = { kind: "EXPLODE" };
    expect(validate(s).errors.join()).toMatch(/plate motion "EXPLODE"/);
    const s2 = spec();
    s2.scenes[0].text[0].motion = { kind: "SPARKLE" };
    expect(validate(s2).errors.join()).toMatch(/text motion "SPARKLE"/);
  });

  it("fails a text layer that starts after its scene ends", () => {
    const s = spec();
    s.scenes[0].text[0].motion.startSec = 99;
    expect(validate(s).errors.join()).toMatch(/after the scene ends/);
  });

  it("caps on-screen word density", () => {
    const s = spec();
    s.scenes[0].text[0].text = Array.from({ length: 30 }, () => "WORD").join(" ");
    expect(validate(s).errors.join()).toMatch(/over the density cap/);
  });

  it("warns when a line lands too late to be read, naming the line", () => {
    const s = spec();
    s.scenes[1].text[1].motion.startSec = 7.8; // 0.2s before an 8.0s scene ends
    const r = validate(s);
    expect(r.ok).toBe(true); // pacing is advice, not a gate
    expect(r.warnings.join()).toMatch(/15,000 BUYERS.*only 0.20s left/);
  });

  it("refuses to render at all when the source conflicts with itself", () => {
    const parsed = fixtureParsedScript();
    parsed.warnings = ['CTA keyword conflict: script says "OWN", META lead magnet says "VAULT"'];
    const r = validateMotionSpec(spec(), buildFactLock(parsed), { repoRoot: REPO_ROOT });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/source conflict, refusing to render/);
  });
});

describe("slot layout", () => {
  it("resolves a slot and lets a layer override any field", () => {
    const r = resolveTextLayer({ id: "x", text: "HI", slot: "headline", y: 0.3, size: 0.05 });
    expect(r.x).toBe(SLOTS.headline.x);
    expect(r.y).toBe(0.3);
    expect(r.size).toBe(0.05);
    expect(r.family).toBe(MOTION.letterFamily);
  });

  it("refuses an unknown slot", () => {
    expect(() => resolveTextLayer({ id: "x", text: "HI", slot: "nowhere" })).toThrow(/unknown text slot/);
  });

  it("composes on a sheet larger than the output so a push crops real pixels", () => {
    const sheet = sheetSize({ width: 1080, height: 1920 });
    expect(sheet.width).toBeGreaterThan(1080);
    expect(MOTION.maxZoom).toBeLessThanOrEqual(MOTION.sheetScale);
  });
});

describe("scaffolding a second Fan Economy script", () => {
  it("produces a spec of the right length from any validated storyboard", () => {
    // Compatibility with a script other than the Curren$y POC: the storyboard
    // fixture is the Ryan Leslie one, and nothing about it is POC-specific.
    const draft = scaffoldMotionSpec(fixtureStoryboard(), { endCardSec: 1.6 });
    expect(specDurationSec(draft)).toBeCloseTo(MOTION.targetDurationSec, 2);
    expect(draft.scenes[0].roles).toContain("HOOK");
    expect(draft.scenes.at(-1).roles).toContain("END_CARD");
    for (const s of draft.scenes) {
      for (const t of s.text || []) expect(SLOTS[t.slot]).toBeTruthy();
    }
  });

  it("carries the storyboard's own strings, inventing no copy", () => {
    const sb = fixtureStoryboard();
    const draft = scaffoldMotionSpec(sb, { endCardSec: 1.6 });
    const drafted = draft.scenes.flatMap((s) => (s.text || []).map((t) => t.text));
    for (const text of sb.scenes[0].screenText) expect(drafted).toContain(text);
  });
});

describe("safe path handling", () => {
  it("keeps a spec path inside the specs directory", () => {
    expect(specPath("34-ryan-leslie-forty-thousand-numbers")).toBe(
      path.join(MOTION.specsDir, "34-ryan-leslie-forty-thousand-numbers.json")
    );
  });

  it("refuses a traversal or absolute slug outright", () => {
    for (const bad of ["../../etc/passwd", "/etc/passwd", "a/b", "..", "Slug With Spaces"]) {
      expect(() => specPath(bad), bad).toThrow(/unsafe job slug/);
    }
  });
});

describe("the POC spec on disk", () => {
  const poc = path.join(MOTION.specsDir, "1-currensy-vs-westside-gunn-volume-vs-scarcity.json");

  it("exists, validates against its own source script, and is exactly 30 seconds", async () => {
    expect(fs.existsSync(poc)).toBe(true);
    const { parseScriptMarkdown } = await import("./lib/scriptParse.mjs");
    const s = JSON.parse(fs.readFileSync(poc, "utf-8"));
    const parsed = parseScriptMarkdown(fs.readFileSync(path.join(REPO_ROOT, s.sourceScript), "utf-8"));
    const r = validateMotionSpec(s, buildFactLock(parsed), { repoRoot: REPO_ROOT });
    expect(r.errors).toEqual([]);
    expect(specDurationSec(s)).toBeCloseTo(30.0, 3);
  });

  it("states every figure the founder listed, and spells VAULT exactly", () => {
    const s = JSON.parse(fs.readFileSync(poc, "utf-8"));
    const all = s.scenes.flatMap((sc) => (sc.text || []).map((t) => t.text)).join(" | ");
    for (const figure of ["90+", "1.5M", "400", "#187", "$300", "$120,000", "$15,000", "8 MONTHS", "30,000"]) {
      expect(all, figure).toContain(figure);
    }
    expect(all).toContain("COMMENT VAULT");
  });

  it("declares where the accepted sheet is lettered, and crops no plate into it", () => {
    const s = JSON.parse(fs.readFileSync(poc, "utf-8"));
    const sheet = s.artwork.find((a) => a.id === "sheet");
    expect(sheet.letteredRegions.length).toBeGreaterThan(0);
    for (const plate of s.plates) {
      if (plate.keepPaper) continue;
      for (const region of sheet.letteredRegions) {
        expect(rectsOverlap(plate.crop, region), `${plate.id} vs ${region.id}`).toBe(false);
      }
    }
  });

  it("would refuse a crop that reached into the lettering", () => {
    // Mutation check on the invariant itself: widen a plate down into the sheet's
    // own boxed notes and the validator must refuse, or the rule is decorative.
    const s = JSON.parse(fs.readFileSync(poc, "utf-8"));
    const stack = s.plates.find((p) => p.id === "stack");
    stack.crop = { x: 0.0536, y: 0.44, w: 0.4454, h: 0.5 };
    const r = validateMotionSpec(s, lock(), { repoRoot: REPO_ROOT });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/crops into the artwork's lettered region "notes-left"/);
  });
});
