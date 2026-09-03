/**
 * CRWN - artist palette sampling, SERVER side.
 *
 * The browser sampler (src/lib/palette.ts) needs a canvas, which meant a palette only
 * ever appeared if the OWNER happened to load their own page after uploading a banner.
 * In practice that left exactly one artist on the platform with a colourway, and every
 * fan-facing surface fell back to CRWN gold regardless of what the artist looked like.
 *
 * This is the same algorithm against raw pixels from sharp, so it can run wherever the
 * server can: a backfill script, an upload handler, a cron. The two implementations must
 * agree, which is what paletteServer.test.ts pins by running both over the same pixels.
 *
 * Returns null when the image carries no usable colour, exactly like the browser version:
 * the caller keeps CRWN gold rather than inventing something the photo does not contain.
 */

import type { Palette } from './palette';

const hex2 = (v: number) =>
  Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');

function hueOf(o: { r: number; g: number; b: number }): number {
  const r = o.r / 255, g = o.g / 255, b = o.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), dd = max - min;
  if (!dd) return 0;
  const h = max === r ? ((g - b) / dd) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  return (h * 60 + 360) % 360;
}

function lift(o: { r: number; g: number; b: number }, floor: number): string {
  let { r, g, b } = o;
  const max = Math.max(r, g, b);
  if (max < floor && max > 0) { const k = floor / max; r *= k; g *= k; b *= k; }
  return '#' + hex2(r) + hex2(g) + hex2(b);
}

/**
 * Sample a palette from RAW RGBA pixel data (4 bytes per pixel).
 * Pure and dependency-free so it can be unit-tested against the browser version.
 */
export function samplePaletteFromPixels(d: Uint8Array | Uint8ClampedArray): Palette | null {
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

  // DOMINANT BY AREA, not most-saturated: a photo that is mostly deep red should not be
  // hijacked by one small bright highlight.
  const byArea = list.slice().sort((a, b) => b.n - a.n);
  const primary = byArea[0] && byArea[0].n >= 8 ? byArea[0] : list.slice().sort((a, b) => b.score - a.score)[0];
  const ph = hueOf(primary);

  // Monochrome image: secondary collapses to primary rather than inventing a hue the
  // photo does not contain. `dh` is already the circular distance, so the test is dh > 35.
  let secondary = primary;
  for (const cand of byArea) {
    if (cand === primary) continue;
    const dh = Math.abs(((hueOf(cand) - ph + 540) % 360) - 180);
    if (dh > 35) { secondary = cand; break; }
  }

  const avg = dn ? { r: dr / dn, g: dg / dn, b: db / dn } : primary;
  const surface = '#' + hex2(avg.r * 0.18 + 14) + hex2(avg.g * 0.18 + 14) + hex2(avg.b * 0.18 + 14);

  return { accent: lift(primary, 150), accent2: lift(secondary, 130), surface };
}

/**
 * Fetch an image URL and sample it. Downscaled to 40x40 first, matching the browser
 * sampler's canvas size so both see the same averaged pixels.
 *
 * Never throws: a dead URL, a private object or an undecodable file returns null and the
 * caller keeps gold.
 */
export async function samplePaletteFromUrl(url: string): Promise<Palette | null> {
  try {
    if (!/^https?:\/\//.test(url)) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { default: sharp } = await import('sharp');
    const { data } = await sharp(buf)
      .resize(40, 40, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return samplePaletteFromPixels(new Uint8Array(data));
  } catch {
    return null;
  }
}
