import { describe, it, expect } from "vitest";
import {
  newLedger,
  addEntry,
  totals,
  costForImageCall,
  costForTextCall,
  wouldExceedCeiling,
  estimateJobCost,
  formatCostReport,
} from "./lib/ledger.mjs";

describe("pricing", () => {
  it("prices a 4K economy image call from the verified table", () => {
    const usd = costForImageCall("gemini-3.1-flash-image", "4K", 2000);
    expect(usd).toBeCloseTo(0.151 + (2000 / 1e6) * 0.5, 4);
  });

  it("returns null for an unknown model instead of inventing a price", () => {
    expect(costForImageCall("mystery-model", "4K")).toBeNull();
    expect(costForTextCall("mystery-model", 100, 100)).toBeNull();
  });

  it("text call cost combines input and output rates", () => {
    expect(costForTextCall("gemini-3.5-flash", 1_000_000, 1_000_000)).toBeCloseTo(10.5, 4);
  });
});

describe("ledger totals", () => {
  it("tracks cost per ACCEPTED image, not per call", () => {
    const l = newLedger();
    addEntry(l, { stage: "image", model: "m", accepted: false, usd: 0.151 });
    addEntry(l, { stage: "image", model: "m", accepted: true, usd: 0.151 });
    addEntry(l, { stage: "image", model: "m", accepted: true, usd: 0.151 });
    const t = totals(l);
    expect(t.acceptedImages).toBe(2);
    expect(t.imageAttempts).toBe(3);
    expect(t.attemptMultiplier).toBe(1.5);
    expect(t.costPerAcceptedImage).toBeCloseTo((0.151 * 3) / 2, 4);
  });

  it("flags unknown prices and excludes them from USD totals", () => {
    const l = newLedger();
    addEntry(l, { stage: "qc", model: "mystery", usd: null });
    const t = totals(l);
    expect(t.unknownPriceCalls).toBe(1);
    expect(t.totalUsd).toBe(0);
    expect(l.flags.length).toBe(1);
  });

  it("spend ceiling stops the next call before it happens", () => {
    const l = newLedger();
    addEntry(l, { stage: "image", model: "m", accepted: true, usd: 3.4 });
    expect(wouldExceedCeiling(l, 0.2, 3.5)).toBe(true);
    expect(wouldExceedCeiling(l, 0.05, 3.5)).toBe(false);
  });
});

describe("estimate", () => {
  it("estimates from scene count, retry multiplier and verified prices", () => {
    const e = estimateJobCost(8, "gemini-3.1-flash-image", "4K");
    expect(e.imagesUsd).toBeGreaterThan(1.5);
    expect(e.imagesUsd).toBeLessThan(2.2);
    expect(e.generativeVideoUsd).toBe(0);
    expect(e.musicUsd).toBe(0);
    expect(e.renderApiUsd).toBe(0);
    expect(e.totalUsd).toBeGreaterThan(e.imagesUsd);
  });

  it("cost report renders the §37 shape", () => {
    const l = newLedger();
    addEntry(l, { stage: "storyboard", model: "gemini-3.5-flash", usd: 0.05 });
    addEntry(l, { stage: "image", model: "m", accepted: true, usd: 0.151 });
    const report = formatCostReport(l);
    expect(report).toContain("VIDEO COST");
    expect(report).toContain("Accepted master images: 1");
    expect(report).toContain("Generative video");
    expect(report).toContain("Cost / accepted image");
  });
});
