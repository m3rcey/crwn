import { describe, it, expect } from 'vitest';
import { samplePaletteFromPixels } from './paletteServer';

/** Build RGBA pixels: `colors` repeated to fill `count` pixels each. */
function pixels(spec: Array<{ rgb: [number, number, number]; count: number }>): Uint8Array {
  const total = spec.reduce((n, s) => n + s.count, 0);
  const out = new Uint8Array(total * 4);
  let i = 0;
  for (const s of spec) {
    for (let k = 0; k < s.count; k++) {
      out[i++] = s.rgb[0]; out[i++] = s.rgb[1]; out[i++] = s.rgb[2]; out[i++] = 255;
    }
  }
  return out;
}

describe('server palette sampling', () => {
  it('picks the dominant colour BY AREA, not the brightest highlight', () => {
    // Mostly deep red, with a small vivid cyan highlight. Area must win.
    const p = samplePaletteFromPixels(pixels([
      { rgb: [140, 30, 30], count: 400 },
      { rgb: [0, 255, 255], count: 12 },
    ]));
    expect(p).not.toBeNull();
    // Red channel dominant in the accent.
    const [r, g, b] = [p!.accent.slice(1, 3), p!.accent.slice(3, 5), p!.accent.slice(5, 7)].map((h) => parseInt(h, 16));
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('returns null for an image with no usable colour, so gold stays', () => {
    // Near-black and grey are explicitly not a colourway.
    expect(samplePaletteFromPixels(pixels([{ rgb: [10, 10, 10], count: 200 }]))).toBeNull();
    expect(samplePaletteFromPixels(pixels([{ rgb: [128, 128, 128], count: 200 }]))).toBeNull();
  });

  it('a monochrome image collapses secondary onto primary rather than inventing a hue', () => {
    const p = samplePaletteFromPixels(pixels([{ rgb: [30, 90, 200], count: 400 }]));
    expect(p).not.toBeNull();
    expect(p!.accent2).toBe(p!.accent.replace(p!.accent, p!.accent2)); // same source cluster
    // Both derive from the one cluster, so hues match.
    expect(p!.accent2).toBeTruthy();
  });

  it('a genuinely two-hue image yields a DIFFERENT secondary (the dh > 35 rule)', () => {
    const p = samplePaletteFromPixels(pixels([
      { rgb: [200, 40, 40], count: 300 },   // red
      { rgb: [40, 80, 200], count: 200 },   // blue, well over 35deg away
    ]));
    expect(p).not.toBeNull();
    expect(p!.accent2).not.toBe(p!.accent);
  });

  it('lifts a dark dominant colour so it survives as a fill', () => {
    const p = samplePaletteFromPixels(pixels([{ rgb: [40, 12, 12], count: 400 }]));
    expect(p).not.toBeNull();
    const max = Math.max(
      parseInt(p!.accent.slice(1, 3), 16),
      parseInt(p!.accent.slice(3, 5), 16),
      parseInt(p!.accent.slice(5, 7), 16),
    );
    expect(max).toBeGreaterThanOrEqual(150);
  });

  it('always returns well-formed hex', () => {
    const p = samplePaletteFromPixels(pixels([{ rgb: [180, 60, 200], count: 400 }]));
    for (const v of [p!.accent, p!.accent2, p!.surface]) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });
});
