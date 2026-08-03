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
  auditContrast,
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

describe('auditContrast (the sweep core)', () => {
  const DARK_GROUND: RGB = [15, 15, 15];
  const GOLD_TINTED_CARD: RGB = [45, 40, 25]; // what a gold-tinted card really composites to

  it('passes body text in the primary ink on the page ground', () => {
    expect(auditContrast([240, 240, 240], DARK_GROUND, 14, 400).pass).toBe(true);
  });

  it('applies the large-text threshold, so 24px passes where 14px fails', () => {
    // A ratio that clears 3:1 but not 4.5:1 must depend on size/weight alone.
    const ink: RGB = [122, 122, 122];
    const small = auditContrast(ink, DARK_GROUND, 14, 400);
    const large = auditContrast(ink, DARK_GROUND, 24, 400);
    expect(small.required).toBe(4.5);
    expect(large.required).toBe(3);
    expect(small.ratio).toBe(large.ratio);
    expect(large.pass).toBe(true);
    expect(small.pass).toBe(false);
  });

  it('catches the real review bug: muted ink valid on the page ground, invalid in a tinted card', () => {
    const muted: RGB = [138, 138, 154]; // --crwn-text-secondary
    expect(auditContrast(muted, DARK_GROUND, 13, 400).pass).toBe(true);
    expect(auditContrast(muted, GOLD_TINTED_CARD, 13, 400).pass).toBe(false);
  });

  it('does not fail a node on float noise just under the threshold', () => {
    const v = auditContrast([240, 240, 240], DARK_GROUND, 16, 400);
    expect(v.ratio).toBe(Math.round(v.ratio * 100) / 100);
  });
});

describe('muted ink on an accent-tinted card', () => {
  // The tinted cards are `tint% accent` composited over the #1a1a1a card, which
  // is a LIGHTER ground than the page. The token being fine on #0f0f0f says
  // nothing about it here -- this is the case groundOf() exists for, and a
  // token audit cannot see it because the token itself is valid.
  const over = (fg: RGB, a: number, bg: RGB): RGB =>
    [0, 1, 2].map((i) => a * fg[i] + (1 - a) * bg[i]) as RGB;
  const CARD: RGB = [26, 26, 26];
  const GOLD = hexToRgb('#D4AF37');
  const RED = hexToRgb('#fe0000'); // a real lifted accent (m3rcey)
  const MUTED = hexToRgb('#8a8a9a');       // --crwn-text-secondary
  const MUTED_TINT = hexToRgb('#a4a4b2');  // --crwn-muted-on-tint

  it('documents why the plain muted token is not usable there', () => {
    expect(contrast(MUTED, [15, 15, 15])).toBeGreaterThanOrEqual(4.5); // fine on the page
    expect(contrast(MUTED, over(GOLD, 0.15, CARD))).toBeLessThan(4.5); // not on the tint
  });

  it('keeps --crwn-muted-on-tint above AA on every tint we ship', () => {
    for (const accent of [GOLD, RED]) {
      for (const pct of [0.09, 0.15, 0.18]) {
        expect(contrast(MUTED_TINT, over(accent, pct, CARD))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('stays legible on the plain page too, so one token covers both grounds', () => {
    expect(contrast(MUTED_TINT, [15, 15, 15])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(MUTED_TINT, CARD)).toBeGreaterThanOrEqual(4.5);
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

  it('makes EVERY derived variant legible as ink, not just the base', () => {
    // Tailwind exposes all three as text utilities, so any of them can end up
    // as ink on the dark ground. Naive scaling from a base sitting exactly at
    // 4.5:1 produced ~3.9:1 (hover) and ~2.2:1 (muted) -- both invisible to
    // inspection because the base measured fine.
    for (const hex of ['#d50000', '#F5A800', '#4F8DF5', '#7B5BD6', '#960F23', '#3FB27F']) {
      const vars = accentPageVars(hex)!;
      for (const key of ['--crwn-gold', '--crwn-gold-hover', '--crwn-gold-muted']) {
        expect(contrast(hexToRgb(vars[key]), [15, 15, 15])).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('brightens on hover rather than darkening (a hover must not lose contrast)', () => {
    const vars = accentPageVars('#d50000')!;
    const base = contrast(hexToRgb(vars['--crwn-gold']), [15, 15, 15]);
    const hover = contrast(hexToRgb(vars['--crwn-gold-hover']), [15, 15, 15]);
    expect(hover).toBeGreaterThan(base);
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
