import { describe, it, expect } from 'vitest';
import {
  contrast,
  hexToRgb,
  inkOn,
  fillFor,
  liftForInk,
  requiredRatio,
  accentTheme,
  accentPageVars,
  type RGB,
} from './contrast';

const DARK: RGB = [15, 15, 15];

describe('inkOn', () => {
  it('picks DARK ink on CRWN gold (the real bug: a luminance cutoff picked white at 1.76:1)', () => {
    expect(inkOn('#D4AF37')).toBe('#0f0f0f');
  });

  it('picks LIGHT ink on a deep colour', () => {
    expect(inkOn('#1a1a2e')).toBe('#f0f0f0');
  });

  it('always picks the measurably better ink', () => {
    for (const hex of ['#D4AF37', '#7B5BD6', '#960F23', '#4CAF50', '#0f0f0f', '#ffffff']) {
      const c = hexToRgb(hex);
      const chosen = hexToRgb(inkOn(hex));
      const other: RGB = chosen[0] === 15 ? [240, 240, 240] : [15, 15, 15];
      expect(contrast(c, chosen)).toBeGreaterThanOrEqual(contrast(c, other));
    }
  });
});

describe('fillFor', () => {
  it('returns a fill clearing 4.5:1 against its chosen ink for a mid purple', () => {
    const fill = fillFor('#7B5BD6');
    expect(contrast(hexToRgb(fill), hexToRgb(inkOn(fill)))).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves an already-passing fill untouched', () => {
    expect(fillFor('#D4AF37')).toBe('#D4AF37');
  });
});

describe('liftForInk', () => {
  it('lifts a dark red until it clears 4.5:1 on the dark ground', () => {
    const ink = liftForInk('#960F23');
    expect(contrast(hexToRgb(ink), DARK)).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves the hue family intact for a liftable colour (red stays dominant)', () => {
    const [r, g, b] = hexToRgb(liftForInk('#960F23'));
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('falls back to light ink when the hue cannot get there', () => {
    // Pure black scales to black forever; must fall back rather than fail.
    expect(liftForInk('#000000')).toBe('#f0f0f0');
  });
});

describe('requiredRatio', () => {
  it('is 3:1 for large text and 4.5:1 for body', () => {
    expect(requiredRatio(24, 400)).toBe(3);
    expect(requiredRatio(19, 700)).toBe(3);
    expect(requiredRatio(14, 400)).toBe(4.5);
    expect(requiredRatio(18, 400)).toBe(4.5);
  });
});

describe('accentPageVars', () => {
  it('returns null for missing or malformed input (page keeps CRWN gold)', () => {
    expect(accentPageVars(null)).toBeNull();
    expect(accentPageVars(undefined)).toBeNull();
    expect(accentPageVars('gold')).toBeNull();
    expect(accentPageVars('#fff')).toBeNull();
    expect(accentPageVars('#D4AF37"; background:url(x)')).toBeNull();
  });

  it('returns null for a hue that cannot reach legibility (pure black)', () => {
    expect(accentPageVars('#000000')).toBeNull();
  });

  it('produces a dual-role-safe --crwn-gold for real sampled accents', () => {
    for (const hex of ['#F5A800', '#E0473A', '#4F8DF5', '#7B5BD6', '#3FB27F', '#960F23']) {
      const vars = accentPageVars(hex);
      expect(vars).not.toBeNull();
      const c = hexToRgb(vars!['--crwn-gold']);
      // >=4.5:1 vs near-black covers BOTH roles: legible as ink on the dark
      // ground, and legible under the dark ink components put on gold fills.
      expect(contrast(c, [15, 15, 15])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('accentTheme', () => {
  it('resolves a fully legible theme for arbitrary accents', () => {
    for (const hex of ['#D4AF37', '#7B5BD6', '#960F23', '#F5A800', '#4F8DF5', '#3FB27F']) {
      const t = accentTheme(hex);
      expect(contrast(hexToRgb(t.fill), hexToRgb(t.onFill))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hexToRgb(t.onGround), DARK)).toBeGreaterThanOrEqual(4.5);
      // Chip must hold light ink at >=4.5:1 (walked to 4.6 with margin).
      expect(contrast(hexToRgb(t.chip), [240, 240, 240])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
