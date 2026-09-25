import { describe, it, expect } from "vitest";
import { suspectWindows, spliceWindow } from "./lib/transcribe.mjs";

const w = (text, start, end) => ({ text, start, end, type: "word" });

describe("omission repair", () => {
  // Shaped like the real failure: "I built" with "built" stretched over 19 seconds of speech.
  const words = [w("feels", 186.2, 186.5), w("like", 186.5, 186.7), w("a", 186.7, 186.9), w("week", 186.9, 187.2), w("I", 188.1, 188.3), w("built", 188.3, 207.4), w("a", 207.5, 207.6), w("free", 207.6, 207.9)];
  it("flags a word stamped across a long stretch, and only that", () => {
    const wins = suspectWindows(words, { duration: 230 });
    expect(wins).toHaveLength(1);
    expect(wins[0].start).toBeLessThan(188.3);
    expect(wins[0].end).toBeGreaterThan(207.4);
    expect(suspectWindows([w("fine", 0, 0.9), w("words", 1, 1.4)])).toEqual([]);
  });
  it("splices the window's own words in, keeping the edges from the original", () => {
    const win = suspectWindows(words, { duration: 230 })[0];
    const ww = [w("week", 186.9, 187.2), w("that", 187.25, 187.4), w("you", 187.4, 187.5), w("was", 187.5, 187.6), w("busy", 187.6, 187.9), w("Now", 189.7, 190), w("mind", 190, 190.3), w("you", 190.3, 190.5), w("not", 191.3, 191.5), w("a", 191.5, 191.6), w("forecast", 191.6, 192), w("I", 206.9, 207.0), w("built", 207.0, 207.4)];
    const out = spliceWindow(words, ww, win);
    const text = out.map((x) => x.text).join(" ");
    expect(text).toContain("not a forecast");
    expect(text.split("week").length - 1).toBe(1);
    expect(out.every((x, i) => i === 0 || x.start >= out[i - 1].start)).toBe(true);
    expect(out.some((x) => x.end - x.start > 1.5)).toBe(false);
  });
});
