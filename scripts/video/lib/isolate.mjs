// Subject isolation: pull WHOLE drawn subjects out of an accepted sheet.
//
// V1 cropped rectangles out of a composed sheet, and the founder's verdict was
// that images looked cut off. That was not a framing mistake, it was the method:
// a rectangle placed to avoid the sheet's hand-lettering inevitably slices
// through whatever artwork is near it. The V1 `collectors` crop cut the raised
// arms off at the wrist; `collector-one` clipped a neighbour's arm; `crowd`
// clipped a jacket edge.
//
// Here a subject is a set of CONNECTED INK COMPONENTS, so it comes out whole or
// not at all. A hand that reaches above the crop box still arrives attached,
// because the component it belongs to is kept in full and the output is trimmed
// to the component's own bounds rather than to the box the author guessed.
//
// It also unlocks something V1 could not do: the sheet's crowd is dozens of
// individually drawn stick figures, and each one is its own component, so they
// can be extracted as a library and populated procedurally instead of appearing
// as one tiny scattered block.
//
// Deterministic, local, $0. No model is involved in isolating anything, and a
// component that touches the sheet's lettering is refused rather than silently
// carrying a figure the fact lock never approved.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { MOTION } from "../config.mjs";

/**
 * Label 8-connected ink components.
 * Iterative flood fill over typed arrays: a 17-megapixel sheet is a few seconds
 * once, and the result is cached, so clarity beats cleverness here.
 *
 * @param {Uint8Array} grey single-channel luma
 * @param {number} w
 * @param {number} h
 * @param {number} cut luma below this is ink
 * @returns {{labels: Int32Array, components: Array<{id:number,area:number,x0:number,y0:number,x1:number,y1:number}>}}
 */
export function labelComponents(grey, w, h, cut = MOTION.plateWhiteCut) {
  const labels = new Int32Array(w * h); // 0 = background
  const components = [];
  const stack = new Int32Array(w * h);
  let next = 0;

  for (let start = 0; start < w * h; start++) {
    if (labels[start] !== 0 || grey[start] >= cut) continue;
    next++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    let area = 0;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;

    while (sp > 0) {
      const p = stack[--sp];
      const py = (p / w) | 0;
      const px = p - py * w;
      area++;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = px + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (labels[q] !== 0 || grey[q] >= cut) continue;
          labels[q] = next;
          stack[sp++] = q;
        }
      }
    }
    components.push({ id: next, area, x0, y0, x1, y1 });
  }
  return { labels, components };
}

/** Normalized rect -> pixel rect on an image of this size. */
function toPixels(region, w, h) {
  return {
    x0: Math.max(0, Math.round(region.x * w)),
    y0: Math.max(0, Math.round(region.y * h)),
    x1: Math.min(w - 1, Math.round((region.x + region.w) * w)),
    y1: Math.min(h - 1, Math.round((region.y + region.h) * h)),
  };
}

function rectsIntersect(a, b) {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

/** How much of a component's own area sits inside a rect. */
function fractionInside(comp, rect, labels, w) {
  let inside = 0;
  for (let y = Math.max(comp.y0, rect.y0); y <= Math.min(comp.y1, rect.y1); y++) {
    for (let x = Math.max(comp.x0, rect.x0); x <= Math.min(comp.x1, rect.x1); x++) {
      if (labels[y * w + x] === comp.id) inside++;
    }
  }
  return inside / comp.area;
}

/** Cached analysis of one artwork file: grey buffer, labels, component list. */
const analysisCache = new Map();

/**
 * Label an artwork, optionally treating some bands as background first.
 *
 * `excludeRegions` exists because a composed sheet deliberately connects things
 * a video wants apart. On the Curren$y sheet the vinyl stack touches the central
 * divider rule, so the two label as one component, and Curren$y then arrives
 * with a metre of vertical line attached that also reaches into the sheet's
 * bottom lettering. Masking the divider band before labelling separates the two
 * halves cleanly. The divider is then DRAWN in the scene instead, where it can
 * draw itself, which is better than reusing a static line anyway.
 *
 * Excluding is not cropping: it removes a named connector, and every subject
 * still comes out as whole components.
 */
export async function analyseArtwork(file, excludeRegions = []) {
  const key = `${file}|${JSON.stringify(excludeRegions)}`;
  if (analysisCache.has(key)) return analysisCache.get(key);
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  const grey = Buffer.from(data); // keep the original for alpha; mask a copy for labelling
  const forLabels = Buffer.from(data);
  for (const region of excludeRegions) {
    const r = toPixels(region, info.width, info.height);
    for (let y = r.y0; y <= r.y1; y++) {
      forLabels.fill(255, y * info.width + r.x0, y * info.width + r.x1 + 1);
    }
  }
  const { labels, components } = labelComponents(forLabels, info.width, info.height);
  const result = { grey, width: info.width, height: info.height, labels, components, excludeRegions };
  analysisCache.set(key, result);
  return result;
}

/**
 * Choose the components that make up a subject.
 *
 * `mode`:
 *   'region'  every component with at least `minInside` of itself inside the
 *             region and at least `minAreaFrac` of the region's area. Multi-part
 *             subjects (a stick figure whose head does not touch its body) come
 *             out together.
 *   'largest' the single biggest component overlapping the region. Use for one
 *             figure standing among others.
 *   'each'    every qualifying component as its OWN subject, which is how the
 *             crowd becomes a library of individual figures.
 */
export function selectComponents(analysis, region, opts = {}) {
  const { labels, components, width: w, height: h } = analysis;
  const rect = toPixels(region, w, h);
  const regionArea = (rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1);
  const minAreaFrac = opts.minAreaFrac ?? 0.0004;
  const minInside = opts.minInside ?? 0.6;

  const candidates = components.filter((c) => {
    if (!rectsIntersect(c, rect)) return false;
    if (c.area < regionArea * minAreaFrac) return false;
    return fractionInside(c, rect, labels, w) >= minInside;
  });

  if (opts.mode === "largest") {
    const best = candidates.sort((a, b) => b.area - a.area)[0];
    return best ? [[best]] : [];
  }
  if (opts.mode === "each") {
    const byAspect = candidates.filter((c) => {
      if (!opts.maxAspect) return true;
      const w0 = c.x1 - c.x0 + 1;
      const h0 = c.y1 - c.y0 + 1;
      return w0 / h0 <= opts.maxAspect;
    });
    return byAspect.sort((a, b) => a.x0 - b.x0).map((c) => [c]);
  }
  if (opts.mode === "subject") {
    // A drawn figure is NOT one component. Curren$y's eyes, nose and mouth are
    // drawn inside his head outline without touching it, so they label
    // separately, and an area threshold big enough to reject a background crowd
    // figure also rejects an eye. The first V2 prototype rendered him
    // faceless because of exactly that.
    //
    // So: take the body (the largest component), then re-attach any component
    // that is ENCLOSED by it. Enclosure, not size, is the honest test for "this
    // detail belongs to that figure": a pupil has host ink above, below, left and
    // right of it; a stick figure standing on open paper does not.
    const body = components
      .filter((c) => rectsIntersect(c, rect))
      .sort((a, b) => b.area - a.area)[0];
    if (!body) return [];
    const inner = components.filter(
      (c) => c.id !== body.id && c.area < body.area * 0.25 && isEnclosedBy(c, body, labels, w, h)
    );
    return [[body, ...inner]];
  }
  return candidates.length ? [candidates] : [];
}

/**
 * Is `comp` visually surrounded by `host`?
 *
 * Casts four rays from the component's bounding-box centre and requires host ink
 * in all four directions before leaving the host's own bounds. Cheap, exact
 * enough for line art, and it separates "detail drawn inside a figure" from
 * "something that happens to be nearby".
 */
export function isEnclosedBy(comp, host, labels, w, h) {
  if (comp.x0 < host.x0 || comp.x1 > host.x1 || comp.y0 < host.y0 || comp.y1 > host.y1) return false;
  const cx = Math.round((comp.x0 + comp.x1) / 2);
  const cy = Math.round((comp.y0 + comp.y1) / 2);
  const hit = (dx, dy) => {
    let x = cx;
    let y = cy;
    for (;;) {
      x += dx;
      y += dy;
      if (x < host.x0 || x > host.x1 || y < host.y0 || y > host.y1) return false;
      if (labels[y * w + x] === host.id) return true;
    }
  };
  return hit(1, 0) && hit(-1, 0) && hit(0, 1) && hit(0, -1);
}

/**
 * Render a chosen component set to an ink-on-transparent PNG, trimmed to the
 * components' own bounds. Alpha comes from the source luma exactly as in
 * plates.mjs, so an isolated subject composites over paper identically to the
 * original marker stroke.
 */
export async function renderComponents(analysis, comps, opts = {}) {
  const { grey, labels, width: w } = analysis;
  const pad = opts.padPx ?? 6;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const ids = new Set(comps.map((c) => c.id));
  for (const c of comps) {
    x0 = Math.min(x0, c.x0);
    y0 = Math.min(y0, c.y0);
    x1 = Math.max(x1, c.x1);
    y1 = Math.max(y1, c.y1);
  }
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(analysis.width - 1, x1 + pad);
  y1 = Math.min(analysis.height - 1, y1 + pad);

  const ow = x1 - x0 + 1;
  const oh = y1 - y0 + 1;
  const hex = MOTION.ink.replace("#", "");
  const ir = parseInt(hex.slice(0, 2), 16);
  const ig = parseInt(hex.slice(2, 4), 16);
  const ib = parseInt(hex.slice(4, 6), 16);
  const cut = MOTION.plateWhiteCut;
  const out = Buffer.alloc(ow * oh * 4);

  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const src = (y + y0) * w + (x + x0);
      const o = (y * ow + x) * 4;
      out[o] = ir;
      out[o + 1] = ig;
      out[o + 2] = ib;
      // Only pixels belonging to a kept component get opacity. A neighbouring
      // figure inside the same bounding box is simply not drawn, which is what
      // makes a generous box safe.
      out[o + 3] = ids.has(labels[src]) ? Math.round(((cut - grey[src]) / cut) * 255) : 0;
    }
  }
  return { buffer: out, width: ow, height: oh, box: { x0, y0, x1, y1 } };
}

/**
 * Does any kept component put actual INK inside a region the sheet letters?
 *
 * Pixel-accurate on purpose. A bounding-box test refused Curren$y outright: his
 * component is tall and wide enough that its box spans the sheet's bottom-centre
 * verdict line while not one of his strokes goes near it. Boxes are the wrong
 * instrument here, and being wrong in the strict direction is still being wrong,
 * because it pushes the author back toward small safe crops, which is the V1
 * failure. Counting pixels is exact and still refuses a component that really
 * does carry lettering.
 *
 * @returns {null | {region: string, pixels: number}}
 */
export function touchesLetteredRegion(comps, letteredRegions, w, h, labels) {
  const ids = new Set(comps.map((c) => c.id));
  for (const region of letteredRegions || []) {
    const rect = toPixels(region, w, h);
    let hits = 0;
    for (let y = rect.y0; y <= rect.y1; y++) {
      for (let x = rect.x0; x <= rect.x1; x++) {
        if (ids.has(labels[y * w + x])) hits++;
      }
    }
    // A handful of pixels is antialiasing bleed from a neighbouring stroke, not a
    // letter. A letter is thousands of pixels.
    if (hits > 400) return { region: region.id || "unnamed", pixels: hits };
  }
  return null;
}

function subjectHash(file, subject, excludes) {
  const st = fs.statSync(file);
  return crypto
    .createHash("sha1")
    .update(JSON.stringify([file, st.size, Math.round(st.mtimeMs), subject, excludes, MOTION.plateWhiteCut, MOTION.ink]))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Build every subject a spec declares under `subjects`, cached on disk.
 *
 * A subject entry:
 *   { id, artwork, region, mode?, minInside?, minAreaFrac?, limit?, padPx? }
 *
 * `mode: 'each'` yields `<id>-1`, `<id>-2`, ... so a crowd becomes a numbered
 * library the composition can populate one figure at a time.
 *
 * @returns {Promise<Map<string,{file:string,width:number,height:number,aspect:number,components:number}>>}
 */
export async function ensureSubjects(spec, opts) {
  const log = opts.log || (() => {});
  const repoRoot = opts.repoRoot || "";
  fs.mkdirSync(opts.cacheDir, { recursive: true });

  const artworkById = new Map();
  const letteredById = new Map();
  const artworkExcludes = new Map();
  for (const a of spec.artwork || []) {
    artworkById.set(a.id, path.isAbsolute(a.file) ? a.file : path.join(repoRoot, a.file));
    letteredById.set(a.id, a.letteredRegions || []);
    artworkExcludes.set(a.id, a.excludeRegions || []);
  }

  const out = new Map();
  let built = 0;
  for (const subject of spec.subjects || []) {
    const file = artworkById.get(subject.artwork);
    if (!file) throw new Error(`subject "${subject.id}" references unknown artwork "${subject.artwork}"`);

    // One cache probe for the whole subject (including an 'each' family) so a
    // warm run never touches the component labeller.
    const excludes = subject.excludeRegions || artworkExcludes.get(subject.artwork) || [];
    const hash = subjectHash(file, subject, excludes);
    const manifestFile = path.join(opts.cacheDir, `${subject.id}-${hash}.subjects.json`);
    if (fs.existsSync(manifestFile)) {
      for (const rec of JSON.parse(fs.readFileSync(manifestFile, "utf-8"))) out.set(rec.id, rec);
      continue;
    }

    const analysis = await analyseArtwork(file, excludes);
    const groups = selectComponents(analysis, subject.region, {
      mode: subject.mode,
      minInside: subject.minInside,
      minAreaFrac: subject.minAreaFrac,
      maxAspect: subject.maxAspect,
    });
    if (!groups.length) {
      throw new Error(`subject "${subject.id}" matched no ink components in its region; widen it or lower minAreaFrac`);
    }
    const limited = subject.limit ? groups.slice(0, subject.limit) : groups;

    const records = [];
    for (let i = 0; i < limited.length; i++) {
      const comps = limited[i];
      const lettered = touchesLetteredRegion(
        comps,
        letteredById.get(subject.artwork),
        analysis.width,
        analysis.height,
        analysis.labels
      );
      if (lettered) {
        throw new Error(
          `subject "${subject.id}" component set ${i} puts ${lettered.pixels} ink pixels inside the ` +
            `lettered region "${lettered.region}"; subjects carry illustration only, and every figure ` +
            `is lettered from the fact lock`
        );
      }
      const { buffer, width, height } = await renderComponents(analysis, comps, { padPx: subject.padPx });
      const id = subject.mode === "each" ? `${subject.id}-${i + 1}` : subject.id;
      const outFile = path.join(opts.cacheDir, `${id}-${hash}.png`);
      await sharp(buffer, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outFile);
      const rec = {
        id,
        file: outFile,
        width,
        height,
        aspect: width / height,
        components: comps.length,
        inkArea: comps.reduce((a, c) => a + c.area, 0),
      };
      records.push(rec);
      out.set(id, rec);
      built++;
    }
    fs.writeFileSync(manifestFile, JSON.stringify(records, null, 2));
  }
  log(`subjects: ${out.size} isolated (${built} built, rest cached), $0 of generation`);
  return out;
}
