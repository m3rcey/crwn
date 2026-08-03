import { describe, it, expect, vi, afterEach } from 'vitest';
import { samplePalette } from './palette';

/**
 * samplePalette needs a canvas, which the node test env has no business
 * providing. The DECISIONS it makes are pure, though, so we feed it pixels
 * through a minimal fake canvas and assert the rules that matter:
 *   - dominant BY AREA wins, not the most saturated highlight
 *   - a monochrome image degrades to one hue instead of inventing a second
 *   - an image with no usable colour returns null (caller keeps CRWN gold)
 */

const N = 40; // samplePalette samples a 40x40 grid

/** Build RGBA pixel data from a function of pixel index. */
function pixels(fill: (i: number) => [number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const [r, g, b] = fill(i);
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = b;
    d[i * 4 + 3] = 255;
  }
  return d;
}

function stubCanvas(data: Uint8ClampedArray) {
  const ctx = {
    drawImage: () => {},
    getImageData: () => ({ data }),
  };
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  });
}

const hueOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

/** Circular hue distance in degrees, 0-180. */
const hueDistance = (a: string, b: string) =>
  Math.abs(((hueOf(a) - hueOf(b) + 540) % 360) - 180);

const img = {} as HTMLImageElement;

afterEach(() => vi.unstubAllGlobals());

describe('samplePalette', () => {
  it('returns null when the image carries no usable colour (near-black / grey)', () => {
    stubCanvas(pixels(() => [18, 18, 20]));
    expect(samplePalette(img)).toBeNull();
  });

  it('picks the DOMINANT colour by area, not a small bright highlight', () => {
    // 90% deep red, 10% vivid cyan. The cyan is far more saturated; area wins.
    stubCanvas(pixels((i) => (i % 10 === 0 ? [0, 240, 255] : [150, 20, 25])));
    const p = samplePalette(img);
    expect(p).not.toBeNull();
    const h = hueOf(p!.accent);
    // red sits near 0/360, cyan near 180
    expect(Math.min(h, 360 - h)).toBeLessThan(40);
  });

  it('degrades a monochrome image to a single hue rather than inventing one', () => {
    // One hue at varying brightness — there is no second hue in this image.
    stubCanvas(pixels((i) => {
      const k = 0.7 + ((i % 5) / 5) * 0.3;
      return [Math.round(190 * k), Math.round(40 * k), Math.round(30 * k)];
    }));
    const p = samplePalette(img);
    expect(p).not.toBeNull();
    // accent2 collapsed onto accent: the hues are the same.
    expect(hueDistance(p!.accent, p!.accent2)).toBeLessThan(1);
  });

  it('finds a genuine second hue when the image really has one', () => {
    // Half deep red, half deep blue: accent2 must be >=35deg from accent.
    stubCanvas(pixels((i) => (i % 2 === 0 ? [170, 30, 30] : [30, 50, 180])));
    const p = samplePalette(img);
    expect(p).not.toBeNull();
    expect(hueDistance(p!.accent, p!.accent2)).toBeGreaterThan(35);
  });

  it('accepts an EXACT COMPLEMENT as the second hue (the reference rejected it)', () => {
    // Red + cyan, 180deg apart. The reference's inverted test threw this away
    // and collapsed the page to one hue on the most obviously two-hue image.
    stubCanvas(pixels((i) => (i % 2 === 0 ? [190, 30, 30] : [30, 190, 190])));
    const p = samplePalette(img);
    expect(p).not.toBeNull();
    expect(hueDistance(p!.accent, p!.accent2)).toBeGreaterThan(140);
  });

  it('returns 6-digit hex for all three roles (the DB CHECK requires it)', () => {
    stubCanvas(pixels(() => [170, 30, 30]));
    const p = samplePalette(img)!;
    for (const v of [p.accent, p.accent2, p.surface]) {
      expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
