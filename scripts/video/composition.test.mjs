import { describe, it, expect } from "vitest";
import {
  LAYOUTS,
  LAYOUT_NAMES,
  resolveLayout,
  fitAspect,
  placeArt,
  scatterField,
  unsafeTextSlots,
  contains,
  SAFE,
} from "./lib/composition.mjs";
import { MOTION, RENDER } from "./config.mjs";

const FA = RENDER.width / RENDER.height;

describe("the layout table", () => {
  it("declares at least the layouts the brief asked for", () => {
    for (const name of [
      "HERO_LEFT",
      "HERO_RIGHT",
      "HERO_CENTER",
      "SPLIT_50_50",
      "SPLIT_60_40",
      "STACK_AND_LABEL",
      "CROWD_WIDE",
      "OBJECT_CLOSEUP",
      "COMPARISON_SCALE",
      "EQUATION_REVEAL",
      "FULL_FRAME_NUMBER",
      "MULTI_LAYER_COLLAGE",
      "CTA_FULL_FRAME",
    ]) {
      expect(LAYOUT_NAMES, name).toContain(name);
    }
  });

  it("keeps EVERY declared text slot inside the text-safe box", () => {
    // This is the check that would have prevented 24 of the first full
    // storyboard's errors: the table itself placed labels at x=0.03 and x=0.97.
    expect(unsafeTextSlots(0)).toEqual([]);
  });

  it("leaves room below each text slot for a RISE to travel", () => {
    // RISE lifts a line into place from BELOW, so the constraint is asymmetric:
    // the bottom edge needs clearance and the top edge does not. A symmetric
    // margin test failed 14 kicker slots that can never move upward, which
    // would have been a false alarm rather than a finding.
    const RISE_TRAVEL = 0.012;
    for (const name of LAYOUT_NAMES) {
      const l = resolveLayout(name);
      for (const slot of l.textSlots) {
        const b = l.slots[slot];
        const bottom = b.y + b.h + RISE_TRAVEL;
        expect(bottom, `${name}.${slot} bottom with RISE travel`).toBeLessThanOrEqual(
          SAFE.text.y + SAFE.text.h + 1e-9
        );
      }
    }
  });

  it("gives every layout a hero slot that exists", () => {
    for (const name of LAYOUT_NAMES) {
      const l = resolveLayout(name);
      expect(l.slots[l.hero], `${name} hero ${l.hero}`).toBeTruthy();
    }
  });

  it("declares an occupancy contract for every layout", () => {
    for (const name of LAYOUT_NAMES) {
      const l = resolveLayout(name);
      expect(l.occupancy, name).toBeGreaterThan(0.3);
      expect(l.occupancy, name).toBeLessThanOrEqual(1);
    }
  });

  it("keeps every slot inside the frame", () => {
    for (const name of LAYOUT_NAMES) {
      const l = resolveLayout(name);
      for (const [slot, b] of Object.entries(l.slots)) {
        expect(b.x >= 0 && b.y >= 0, `${name}.${slot} origin`).toBe(true);
        expect(b.x + b.w <= 1.0001, `${name}.${slot} right`).toBe(true);
        expect(b.y + b.h <= 1.0001, `${name}.${slot} bottom`).toBe(true);
      }
    }
  });

  it("refuses an unknown layout and an override of a slot that does not exist", () => {
    expect(() => resolveLayout("NOPE")).toThrow(/unknown layout/);
    expect(() => resolveLayout("HERO_CENTER", { slots: { ghost: { x: 0 } } })).toThrow(/no slot "ghost"/);
  });

  it("applies a slot override without abandoning the layout", () => {
    const l = resolveLayout("HERO_CENTER", { slots: { lead: { y: 0.6 } } });
    expect(l.slots.lead.y).toBe(0.6);
    expect(l.slots.lead.w).toBe(LAYOUTS.HERO_CENTER().slots.lead.w);
  });
});

describe("fitting art to a slot", () => {
  it("fills the slot on one axis and never exceeds it", () => {
    const slot = { x: 0.1, y: 0.1, w: 0.8, h: 0.5 };
    for (const aspect of [0.3, 0.567, 0.754, 1.0, 1.9]) {
      const b = fitAspect(slot, aspect, FA, "contain");
      expect(contains(slot, b), `aspect ${aspect}`).toBe(true);
      const fillsWidth = Math.abs(b.w - slot.w) < 1e-6;
      const fillsHeight = Math.abs(b.h - slot.h) < 1e-6;
      expect(fillsWidth || fillsHeight, `aspect ${aspect} fills neither axis`).toBe(true);
    }
  });

  it("preserves the subject's aspect ratio in real pixels, so nothing is stretched", () => {
    const slot = { x: 0, y: 0, w: 1, h: 0.4 };
    const aspect = 0.567;
    const b = fitAspect(slot, aspect, FA, "contain");
    expect((b.w * FA) / b.h).toBeCloseTo(aspect, 5);
  });

  it("is why a hero cannot render tiny: a big slot yields a big box", () => {
    // The V1 defect was a subject at 12% of frame height because a width
    // fraction was typed by hand. Here the slot decides.
    const l = resolveLayout("STACK_AND_LABEL");
    const b = placeArt(l.slots.hero, 0.567, FA, {});
    expect(b.h).toBeGreaterThan(MOTION.qa.minHeroHeight);
  });

  it("shrinks only when a scene explicitly asks", () => {
    const slot = { x: 0, y: 0, w: 1, h: 0.5 };
    const full = placeArt(slot, 1, FA, {});
    const half = placeArt(slot, 1, FA, { scale: 0.5 });
    expect(half.w).toBeCloseTo(full.w * 0.5, 6);
    expect(half.h).toBeCloseTo(full.h * 0.5, 6);
  });

  it("anchors a shrunken box where asked", () => {
    const slot = { x: 0, y: 0, w: 1, h: 0.5 };
    const bottom = placeArt(slot, 1, FA, { scale: 0.5, anchor: "bottom" });
    const centered = placeArt(slot, 1, FA, { scale: 0.5 });
    expect(bottom.y).toBeGreaterThan(centered.y);
  });
});

describe("crowd scatter", () => {
  it("is deterministic for a given seed", () => {
    const field = { x: 0, y: 0.2, w: 1, h: 0.4 };
    const a = scatterField(field, 40, { seed: 7 });
    const b = scatterField(field, 40, { seed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("changes with the seed, so two crowds are not the same crowd", () => {
    const field = { x: 0, y: 0.2, w: 1, h: 0.4 };
    const a = scatterField(field, 40, { seed: 7 });
    const b = scatterField(field, 40, { seed: 8 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("places every item inside the field it was given", () => {
    const field = { x: 0.05, y: 0.2, w: 0.9, h: 0.4 };
    for (const item of scatterField(field, 60, { seed: 3 })) {
      expect(item.x).toBeGreaterThanOrEqual(field.x - 1e-9);
      expect(item.x).toBeLessThanOrEqual(field.x + field.w + 1e-9);
      expect(item.y).toBeGreaterThanOrEqual(field.y - 1e-9);
      expect(item.y).toBeLessThanOrEqual(field.y + field.h + 1e-9);
    }
  });

  it("renders rows further back smaller, which is the depth cue", () => {
    const items = scatterField({ x: 0, y: 0, w: 1, h: 0.5 }, 40, { seed: 1, minScale: 0.5, maxScale: 1 });
    const back = items.filter((i) => i.depth > 0.9);
    const front = items.filter((i) => i.depth < 0.1);
    expect(back.length).toBeGreaterThan(0);
    expect(front.length).toBeGreaterThan(0);
    expect(Math.max(...back.map((i) => i.scale))).toBeLessThan(Math.min(...front.map((i) => i.scale)) + 1e-9);
  });
});

describe("the two safe areas", () => {
  it("gives artwork more room than words, because the caption bar covers the bottom", () => {
    expect(SAFE.art.h).toBeGreaterThan(SAFE.text.h);
    expect(SAFE.art.w).toBeGreaterThan(SAFE.text.w);
  });
});
