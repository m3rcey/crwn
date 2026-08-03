/**
 * CRWN — contrast resolution.
 *
 * An accent sampled from an arbitrary photograph cannot be trusted against any
 * fixed ink. Every place the accent meets text is resolved by MEASUREMENT here,
 * never by a chosen constant.
 *
 * Four cases, all of which were real failures found in design review:
 *
 *  1. inkOn()        ink on an accent fill — pick black/white by measured
 *                    contrast. A guessed 0.55 luminance cutoff sits well above
 *                    the real crossover (~0.18) and puts white on CRWN gold at
 *                    1.76:1.
 *  2. fillFor()      a mid-luminance accent (a mid purple) clears 4.5:1 against
 *                    NEITHER ink. Walk the fill away from the ink, keeping hue.
 *  3. liftForInk()   accent used AS ink on the dark ground — lift until legible.
 *  4. groundOf()     a token validated on #0f0f0f is not valid inside a tinted
 *                    card. Composite the ground the text actually sits on,
 *                    INCLUDING gradient stops.
 *
 * Use the same gamma-linearised transfer on both sides of every comparison.
 * Mixing a raw average with a linearised value inflates the result and picks
 * the wrong ink.
 */

export type RGB = [number, number, number];

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

export const luminance = ([r, g, b]: RGB) =>
  0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export const contrast = (a: RGB, b: RGB) => {
  const x = luminance(a) + 0.05;
  const y = luminance(b) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
};

export function hexToRgb(hex: string): RGB {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [212, 175, 55];
}

const toHex = (c: RGB) =>
  '#' + c.map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')).join('');

const DARK: RGB = [15, 15, 15];
const LIGHT: RGB = [240, 240, 240];

/** 1. Whichever extreme actually measures better on this fill. */
export function inkOn(fill: string | RGB): string {
  const c = typeof fill === 'string' ? hexToRgb(fill) : fill;
  return contrast(c, DARK) >= contrast(c, LIGHT) ? toHex(DARK) : toHex(LIGHT);
}

/**
 * 2. Nudge the fill's own value until the chosen ink clears `target`, keeping
 *    hue. Returns the original when it already passes.
 */
export function fillFor(accent: string, target = 4.5): string {
  const base = hexToRgb(accent);
  const ink = hexToRgb(inkOn(base));
  if (contrast(base, ink) >= target) return accent;
  const brighten = luminance(ink) < 0.5; // dark ink -> brighten the fill
  let k = 1;
  for (let i = 0; i < 24; i++) {
    k *= brighten ? 1.04 : 0.96;
    const c: RGB = [
      Math.min(255, base[0] * k),
      Math.min(255, base[1] * k),
      Math.min(255, base[2] * k),
    ];
    if (contrast(c, ink) >= target) return toHex(c);
  }
  return accent;
}

/**
 * 3. The accent used as INK on `ground`. Lifts its value, hue preserved, until
 *    it clears `target`; falls back to the system's light ink if the hue cannot
 *    get there before clipping to white.
 */
export function liftForInk(accent: string, target = 4.5, ground: RGB = DARK): string {
  const [r, g, b] = hexToRgb(accent);
  let k = 1;
  for (let i = 0; i < 40; i++) {
    const c: RGB = [Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k)];
    if (contrast(c, ground) >= target) return toHex(c);
    if (c[0] === 255 && c[1] === 255 && c[2] === 255) break;
    k *= 1.06;
  }
  return toHex(LIGHT);
}

/**
 * 4. The ground a node actually composites onto, honouring alpha AND gradient
 *    stops. `backgroundColor` alone misses every gradient surface in this
 *    system, which is exactly where muted ink was silently failing.
 *    Browser only (walks computed styles).
 */
export function groundOf(el: Element, base: RGB = DARK): RGB {
  const nums = (s: string) => (s.match(/[\d.]+/g) || []).map(Number);
  const stack: number[][] = [];
  let n: Element | null = el;

  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    // A background-clip:text element paints glyphs, not a ground.
    if ((cs as CSSStyleDeclaration & { webkitBackgroundClip?: string }).webkitBackgroundClip !== 'text' && cs.backgroundClip !== 'text') {
      const bi = cs.backgroundImage;
      if (bi && bi !== 'none') {
        const stops = [...bi.matchAll(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/g)]
          .map((m) => [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]);
        if (stops.length) {
          const aAvg = stops.reduce((s, x) => s + x[3], 0) / stops.length;
          const avg = [0, 1, 2].map((k) => stops.reduce((s, x) => s + x[k] * x[3], 0) / stops.length);
          stack.push([avg[0] / (aAvg || 1), avg[1] / (aAvg || 1), avg[2] / (aAvg || 1), aAvg]);
        }
      }
    }
    const bc = nums(cs.backgroundColor);
    if (bc.length) stack.push([bc[0], bc[1], bc[2], bc.length > 3 ? bc[3] : 1]);
    n = n.parentElement;
  }

  let out: RGB = [...base] as RGB;
  for (let i = stack.length - 1; i >= 0; i--) {
    const c = stack[i];
    if (!c[3]) continue;
    out = [0, 1, 2].map((k) => c[3] * c[k] + (1 - c[3]) * out[k]) as RGB;
  }
  return out;
}

/** WCAG threshold for a given rendered size/weight. */
export const requiredRatio = (fontSizePx: number, fontWeight: number) =>
  fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700) ? 3 : 4.5;

export interface ContrastVerdict {
  pass: boolean;
  /** Measured ratio of ink against the composited ground. */
  ratio: number;
  /** Threshold this node had to clear, from its rendered size and weight. */
  required: number;
}

/**
 * The pure core of the contrast sweep: one text node's ink against the ground
 * it ACTUALLY composites onto. Kept free of the DOM so it unit-tests in the
 * repo's node-env vitest; `sweepContrast` (browser) supplies the measurements.
 */
export function auditContrast(
  ink: RGB,
  ground: RGB,
  fontSizePx: number,
  fontWeight: number
): ContrastVerdict {
  const required = requiredRatio(fontSizePx, fontWeight);
  const ratio = contrast(ink, ground);
  // Round to 2dp before comparing: a node measuring 4.499999 is not a real
  // failure, and float noise in a CI gate trains people to ignore it.
  const rounded = Math.round(ratio * 100) / 100;
  return { pass: rounded >= required, ratio: rounded, required };
}

/**
 * Scoped CSS-variable overrides for an artist-accented page.
 *
 * The app's gold utilities compile to `var(--crwn-gold)` (Tailwind v4 `@theme
 * inline`), so overriding the variable on the page wrapper recolours every
 * gold surface inside it: tabs, play glyphs, tier cards, CTAs. One variable
 * serves BOTH roles (fill under dark ink, ink on the dark ground) only if it
 * clears 4.5:1 against near-black, which is exactly what liftForInk produces.
 *
 * Returns null when the hue cannot get there before clipping to white; the
 * caller keeps CRWN gold rather than shipping an illegible page.
 */
export function accentPageVars(accent: string | null | undefined): Record<string, string> | null {
  if (!accent || !/^#[0-9a-fA-F]{6}$/.test(accent)) return null;
  const safe = liftForInk(accent, 4.5);
  if (safe === toHex(LIGHT)) return null; // hue unusable; keep gold
  const [r, g, b] = hexToRgb(safe);

  // EVERY derived variant must survive being used as INK, because Tailwind
  // exposes all three as text utilities (text-crwn-gold-hover,
  // text-crwn-gold-muted) and any component may reach for them. Deriving them
  // by naive scaling is the trap: liftForInk puts the base right AT 4.5:1, so
  // x0.9 lands ~3.9:1 and x0.62 lands ~2.2:1 -- both illegible, and invisible
  // to inspection because the base looked fine.
  //
  // Hover therefore BRIGHTENS (toward white) rather than darkening: it reads as
  // a hover and it cannot fall below the base's contrast. Muted keeps its
  // darker derivation but is clamped back up to the AA floor; call sites that
  // want a genuinely dim edge already express that with alpha (`/30`), which
  // is a compositing choice, not an ink one.
  const towardWhite = (t: number): string =>
    toHex([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]);

  return {
    '--crwn-gold': safe,
    '--crwn-gold-hover': towardWhite(0.18),
    '--crwn-gold-muted': liftForInk(toHex([r * 0.62, g * 0.62, b * 0.62]), 4.5),
  };
}

/**
 * Everything an artist-accented surface needs, resolved in one call.
 *
 *   const t = accentTheme(artist.accentHex);
 *   <button style={{ background: t.fill, color: t.onFill }}>Join</button>
 *   <Icon style={{ color: t.onGround }} />
 */
export function accentTheme(accent: string, ground: RGB = DARK) {
  const fill = fillFor(accent);
  return {
    /** Background for primary actions — may differ from `accent` by a nudge. */
    fill,
    /** Ink to place on `fill`. */
    onFill: inkOn(fill),
    /** The accent used as ink on `ground`, lifted until legible. */
    onGround: liftForInk(accent, 4.5, ground),
    /** Chrome sitting on a bright accent band. Opaque: alpha over a live
     *  shader lets an unpredictable brightness through. */
    chip: (() => {
      const [r, g, b] = hexToRgb(accent);
      let k = 0.24;
      while (k > 0.04 && contrast([r * k, g * k, b * k], LIGHT) < 4.6) k -= 0.02;
      return toHex([r * k, g * k, b * k]);
    })(),
  };
}
