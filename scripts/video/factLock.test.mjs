import { describe, it, expect } from "vitest";
import {
  buildFactLock,
  factLockDigest,
  malformedNumbers,
  verifyText,
  verifyTextManifest,
} from "./lib/factLock.mjs";
import { fixtureParsedScript } from "./lib/fixtures.mjs";

const lock = () => buildFactLock(fixtureParsedScript(), { slug: "34-ryan-leslie-forty-thousand-numbers" });

function manifest(layers, over = {}) {
  return {
    slug: "34-ryan-leslie-forty-thousand-numbers",
    factLockDigest: factLockDigest(lock()),
    generativeImageCalls: 0,
    generativeVideoCalls: 0,
    layers,
    ...over,
  };
}

const layer = (over = {}) => ({
  scene: 0,
  id: "t1",
  text: "40,000 NUMBERS",
  box: { x: 0.1, y: 0.2, w: 0.7, h: 0.06 },
  fromSec: 0.2,
  toSec: 2.0,
  spriteHash: "abc123",
  ...over,
});

describe("approved numeric fact extraction", () => {
  it("derives every figure the source states, in digits or in words", () => {
    const l = lock();
    for (const token of ["40000", "15000", "2000000", "133"]) {
      expect(l.numbers.has(token), token).toBe(true);
    }
    // "it took eight months" is a figure the script states as a WORD. Without the
    // word table the deterministic layer could not put "8 MONTHS" on screen and
    // trace it, and schema.mjs's <=12 exemption would be the only thing letting
    // it through, which would also let a fabricated "7 MONTHS" through.
    expect(l.numbers.has("8")).toBe(true);
    expect(l.numbers.has("7")).toBe(false);
  });

  it("carries the CTA keyword from the script", () => {
    expect(lock().ctaKeyword).toBe("OWN");
  });

  it("digests differently for different approved sets", () => {
    const other = buildFactLock({ ...fixtureParsedScript(), scriptText: "Just 500 fans.", meta: {} });
    expect(factLockDigest(lock())).not.toBe(factLockDigest(other));
  });
});

describe("rejection of fabricated numbers", () => {
  it("refuses a figure that is not in the source", () => {
    const r = verifyText("17,500 BOUGHT", lock());
    expect(r.ok).toBe(false);
    expect(r.unapproved).toContain("17500");
  });

  it("accepts a figure the source states", () => {
    expect(verifyText("OVER $2,000,000", lock()).ok).toBe(true);
  });

  it("fails the manifest on an unapproved figure", () => {
    const r = verifyTextManifest(manifest([layer({ text: "99,999 FANS" })]), lock(), { requireCta: false });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/not in the source/);
  });

  it("does not exempt small numbers the way the storyboard validator does", () => {
    // schema.mjs skips values <= 12 because prose spells them out. Here the word
    // table makes that exemption unnecessary, so an invented "5" is caught.
    const r = verifyText("5 TIERS", lock());
    expect(r.ok).toBe(false);
    expect(r.unapproved).toContain("5");
  });
});

describe("rejection of malformed numeric strings", () => {
  it("catches a mis-grouped thousands separator", () => {
    // The exact failure a re-lettering model produces: $2,000,00 instead of $2,000,000.
    expect(malformedNumbers("$2,000,00")).toContain("$2,000,00");
  });

  it("catches two decimal points and a trailing point", () => {
    expect(malformedNumbers("1.5.2M").length).toBeGreaterThan(0);
    expect(malformedNumbers("$133.").length).toBeGreaterThan(0);
  });

  it("catches a leading zero on a multi-digit integer", () => {
    expect(malformedNumbers("040,000")).toContain("040,000");
  });

  it("passes well-formed figures", () => {
    expect(malformedNumbers("$2,000,000 and 40,000 and 1.5M and $133")).toEqual([]);
  });

  it("reports a malformed figure as malformed, not merely unapproved", () => {
    const r = verifyText("$2,000,00", lock());
    expect(r.ok).toBe(false);
    expect(r.malformed).toContain("$2,000,00");
    expect(r.unapproved).toEqual([]);
  });
});

describe("exact CTA keyword preservation", () => {
  it("passes when the keyword is on screen exactly", () => {
    const r = verifyTextManifest(manifest([layer({ text: "COMMENT OWN" })]), lock(), {});
    expect(r.ok).toBe(true);
  });

  it("fails when the keyword never appears", () => {
    const r = verifyTextManifest(manifest([layer({ text: "COMMENT NOW" })]), lock(), {});
    expect(r.errors.join()).toMatch(/CTA keyword "OWN" never appears/);
  });

  it("warns when the keyword appears in the wrong case", () => {
    const r = verifyTextManifest(manifest([layer({ text: "comment own" })]), lock(), {});
    expect(r.ok).toBe(false);
    expect(r.warnings.join()).toMatch(/different case/);
  });
});

describe("storyboard to manifest consistency", () => {
  it("fails when the rendered string differs from the approved one by one character", () => {
    const r = verifyTextManifest(manifest([layer({ text: "40,00O NUMBERS" })]), lock(), {
      specText: { "0:t1": "40,000 NUMBERS" },
      requireCta: false,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/but the spec approved/);
  });

  it("passes when it matches character for character", () => {
    const r = verifyTextManifest(manifest([layer()]), lock(), {
      specText: { "0:t1": "40,000 NUMBERS" },
      requireCta: false,
    });
    expect(r.ok).toBe(true);
  });

  it("fails a layer that is not in the spec at all", () => {
    const r = verifyTextManifest(manifest([layer({ id: "ghost" })]), lock(), {
      specText: { "0:t1": "40,000 NUMBERS" },
      requireCta: false,
    });
    expect(r.errors.join()).toMatch(/not in the spec/);
  });
});

describe("required figures and conflicts", () => {
  it("fails when a figure the video must state never appears", () => {
    const r = verifyTextManifest(manifest([layer()]), lock(), {
      requiredNumbers: ["$2,000,000"],
      requireCta: false,
    });
    expect(r.errors.join()).toMatch(/required figure "\$2,000,000"/);
  });

  it("refuses to render when the sources disagree, rather than picking one", () => {
    const parsed = fixtureParsedScript();
    parsed.warnings = ['CTA keyword conflict: script says "OWN", META lead magnet says "VAULT"'];
    const conflicted = buildFactLock(parsed);
    const r = verifyTextManifest(manifest([layer({ text: "COMMENT OWN" })]), conflicted, {});
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/source conflict, refusing to choose/);
  });

  it("fails when one claim is answered two different ways", () => {
    const r = verifyTextManifest(
      manifest([
        layer({ id: "a", text: "OVER $2,000,000", claim: "total" }),
        layer({ id: "b", scene: 1, text: "$133 PER FAN", claim: "total" }),
      ]),
      lock(),
      { requireCta: false }
    );
    expect(r.errors.join()).toMatch(/answered two different ways/);
  });

  it("refuses a manifest rendered against a different fact lock", () => {
    const r = verifyTextManifest(manifest([layer()], { factLockDigest: "something-else" }), lock(), {
      requireCta: false,
    });
    expect(r.errors.join()).toMatch(/different fact lock/);
  });
});

describe("safe zone", () => {
  it("fails a text box that leaves the platform-safe area", () => {
    const r = verifyTextManifest(manifest([layer({ box: { x: 0.1, y: 0.9, w: 0.7, h: 0.06 } })]), lock(), {
      safeZone: { top: 0.055, bottom: 0.14, left: 0.05, right: 0.05 },
      requireCta: false,
    });
    expect(r.errors.join()).toMatch(/leaves the safe zone/);
  });

  it("fails an empty visible window", () => {
    const r = verifyTextManifest(manifest([layer({ fromSec: 2.0, toSec: 2.0 })]), lock(), { requireCta: false });
    expect(r.errors.join()).toMatch(/visible window is empty/);
  });
});
