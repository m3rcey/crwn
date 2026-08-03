/**
 * CRWN — artist palette sampling.
 *
 * Derives an artist's colourway from their own upload. Lifted verbatim from the
 * design reference; no framework dependency. Browser only (canvas).
 *
 * Run this ONCE at upload time and persist `accent` / `accent2` / `surface` on
 * the artist record (artist_profiles.accent_hex / accent2_hex / surface_hex,
 * migration supabase/schema-phase2-artist-palette.sql). Do not recompute per
 * page view.
 */

export interface Palette {
  /** Dominant hue by area. Drives CTAs, active tab, play glyph, tier card. */
  accent: string;
  /** Largest cluster >=35deg away in hue. Second stop of the ambient gradient. */
  accent2: string;
  /** Image average mixed down. Card grounds. */
  surface: string;
}

const hex2 = (v: number) =>
  Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');

/**
 * @param img A decoded, same-origin (or CORS-enabled) image element.
 * @returns null when the image carries no usable colour — caller should keep
 *          the default CRWN gold rather than substituting something invented.
 */
export function samplePalette(img: HTMLImageElement): Palette | null {
  try {
    const n = 40;
    const c = document.createElement('canvas');
    c.width = n;
    c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;

    const buckets: Record<string, { r: number; g: number; b: number; n: number; w: number }> = {};
    let dr = 0, dg = 0, db = 0, dn = 0;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (d[i + 3] < 128) continue;
      dr += r; dg += g; db += b; dn++;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      // Skip near-black and near-grey: neither is a colourway.
      if (max < 40 || sat < 0.18) continue;
      const k = `${r >> 4},${g >> 4},${b >> 4}`;
      const e = buckets[k] || (buckets[k] = { r: 0, g: 0, b: 0, n: 0, w: 0 });
      e.r += r; e.g += g; e.b += b; e.n++; e.w += sat * (max / 255);
    }

    const list = Object.values(buckets).map((e) => ({
      score: e.w * Math.sqrt(e.n),
      n: e.n,
      r: e.r / e.n,
      g: e.g / e.n,
      b: e.b / e.n,
    }));
    if (!list.length) return null;

    const hue = (o: { r: number; g: number; b: number }) => {
      const r = o.r / 255, g = o.g / 255, b = o.b / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), dd = max - min;
      if (!dd) return 0;
      const h = max === r ? ((g - b) / dd) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      return (h * 60 + 360) % 360;
    };

    // Lift so dark text stays legible when the colour is used as a fill.
    const lift = (o: { r: number; g: number; b: number }, floor: number) => {
      let { r, g, b } = o;
      const max = Math.max(r, g, b);
      if (max < floor) { const k = floor / max; r *= k; g *= k; b *= k; }
      return '#' + hex2(r) + hex2(g) + hex2(b);
    };

    // DOMINANT BY AREA, not most-saturated: a photo that is mostly deep red
    // should not be hijacked by one small bright highlight.
    const byArea = list.slice().sort((a, b) => b.n - a.n);
    const primary = byArea[0] && byArea[0].n >= 8 ? byArea[0] : list.sort((a, b) => b.score - a.score)[0];
    const ph = hue(primary);

    // Monochrome upload -> secondary collapses to primary, degrading to
    // single-hue behaviour rather than inventing a hue not in the image.
    let secondary = primary;
    for (const cand of byArea) {
      if (cand === primary) continue;
      const dh = Math.abs(((hue(cand) - ph + 540) % 360) - 180);
      if (180 - dh > 35) { secondary = cand; break; }
    }

    const avg = dn ? { r: dr / dn, g: dg / dn, b: db / dn } : primary;
    const surface = '#' + hex2(avg.r * 0.18 + 14) + hex2(avg.g * 0.18 + 14) + hex2(avg.b * 0.18 + 14);

    return { accent: lift(primary, 150), accent2: lift(secondary, 130), surface };
  } catch {
    return null;
  }
}
