// Plates: the illustration half of a motion video.
//
// A plate is a normalized crop of an accepted handwritten sheet, with the white
// paper turned into transparency so it can be moved, grown, wiped and pushed over
// the page independently of everything else. Ink keeps its antialiased edge, so
// compositing a plate back over white paper reproduces the original marker line.
//
// The rule this module exists to enforce: a plate carries ILLUSTRATION, never a
// figure the video has to get right. Crops are authored to exclude lettering, and
// the plate report prints each plate so that exclusion is checked by looking
// (see verify.mjs level 3). Numbers come from lib/lettering.mjs, always.
//
// Extraction is local and free. An already-accepted sheet needs no model call, so
// the steady-state cost of a plate is $0.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { MOTION } from "../config.mjs";

/** Cache key: the source bytes' identity plus everything that shapes the crop. */
function plateHash(absArtwork, plate) {
  const st = fs.statSync(absArtwork);
  return crypto
    .createHash("sha1")
    .update(
      JSON.stringify([
        absArtwork,
        st.size,
        Math.round(st.mtimeMs),
        plate.crop,
        plate.trim !== false,
        plate.keepPaper === true,
        MOTION.plateWhiteCut,
        MOTION.ink,
      ])
    )
    .digest("hex")
    .slice(0, 16);
}

function inkRgb() {
  const hex = MOTION.ink.replace("#", "");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/**
 * Turn a white-paper crop into ink-on-transparent RGBA.
 * Exported so a test can assert the paper really drops out and the ink really
 * survives, without going near the filesystem.
 * @param {{data: Buffer, width: number, height: number}} grey single-channel raw
 * @returns {Buffer} RGBA
 */
export function inkAlphaFromGrey(grey) {
  const [r, g, b] = inkRgb();
  const cut = MOTION.plateWhiteCut;
  const out = Buffer.allocUnsafe(grey.width * grey.height * 4);
  for (let i = 0, o = 0; i < grey.data.length; i++, o += 4) {
    const luma = grey.data[i];
    // Paper (>= cut) is fully transparent; everything darker keeps proportional
    // opacity, which is what preserves the soft edge of a marker stroke.
    const a = luma >= cut ? 0 : Math.round(((cut - luma) / cut) * 255);
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }
  return out;
}

/**
 * Extract every plate the spec declares. Cached by content, so a rerender reuses
 * the PNGs and touches no model.
 *
 * @param {object} spec
 * @param {{ repoRoot?: string, cacheDir: string, log?: Function }} opts
 * @returns {Promise<Map<string,{file:string,width:number,height:number,aspect:number}>>}
 */
export async function ensurePlates(spec, opts) {
  const log = opts.log || (() => {});
  const repoRoot = opts.repoRoot || "";
  fs.mkdirSync(opts.cacheDir, { recursive: true });

  const artworkById = new Map();
  for (const a of spec.artwork || []) {
    artworkById.set(a.id, path.isAbsolute(a.file) ? a.file : path.join(repoRoot, a.file));
  }

  const out = new Map();
  let built = 0;
  for (const plate of spec.plates || []) {
    const abs = artworkById.get(plate.artwork);
    if (!abs) throw new Error(`plate "${plate.id}" references unknown artwork "${plate.artwork}"`);
    if (!fs.existsSync(abs)) throw new Error(`plate "${plate.id}": artwork missing at ${abs}`);

    const hash = plateHash(abs, plate);
    const file = path.join(opts.cacheDir, `${plate.id}-${hash}.png`);
    const metaFile = `${file}.json`;
    if (fs.existsSync(file) && fs.existsSync(metaFile)) {
      out.set(plate.id, { file, ...JSON.parse(fs.readFileSync(metaFile, "utf-8")) });
      continue;
    }

    const src = sharp(abs);
    const meta = await src.metadata();
    const left = Math.round(plate.crop.x * meta.width);
    const top = Math.round(plate.crop.y * meta.height);
    const width = Math.max(1, Math.round(plate.crop.w * meta.width));
    const height = Math.max(1, Math.round(plate.crop.h * meta.height));
    if (left + width > meta.width || top + height > meta.height) {
      throw new Error(`plate "${plate.id}" crop falls outside the artwork (${meta.width}x${meta.height})`);
    }

    let pipeline = sharp(abs).extract({ left, top, width, height });
    if (plate.keepPaper === true) {
      // A plate that is meant to be an opaque sheet (the end card) keeps its paper.
      pipeline = pipeline.removeAlpha();
    } else {
      const grey = await pipeline.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
      const rgba = inkAlphaFromGrey({ data: grey.data, width: grey.info.width, height: grey.info.height });
      pipeline = sharp(rgba, { raw: { width: grey.info.width, height: grey.info.height, channels: 4 } });
      if (plate.trim !== false) pipeline = pipeline.trim({ threshold: 6 });
    }
    const buf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    const outMeta = await sharp(buf).metadata();
    fs.writeFileSync(file, buf);
    const record = {
      width: outMeta.width,
      height: outMeta.height,
      aspect: outMeta.width / outMeta.height,
      opaque: plate.keepPaper === true,
    };
    fs.writeFileSync(metaFile, JSON.stringify(record, null, 2));
    out.set(plate.id, { file, ...record });
    built++;
  }
  log(`plates: ${out.size} plates (${built} extracted, ${out.size - built} cached), $0 of generation`);
  return out;
}

/** A single sheet showing every plate, for the look-at-it check that a plate
 * carries no lettering. Cheap, local, and the only reliable way to catch a crop
 * that clipped a boxed note. */
export async function platesContactSheet(plateMap, outFile, opts = {}) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const cols = opts.cols || 3;
  const cell = opts.cell || 520;
  const entries = [...plateMap.entries()];
  const rows = Math.ceil(entries.length / cols);
  const composites = [];
  for (let i = 0; i < entries.length; i++) {
    const [, p] = entries[i];
    const buf = await sharp(p.file)
      .resize(cell - 24, cell - 24, { fit: "inside", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .flatten({ background: "#FFFFFF" })
      .toBuffer();
    const m = await sharp(buf).metadata();
    composites.push({
      input: buf,
      left: (i % cols) * cell + Math.round((cell - m.width) / 2),
      top: Math.floor(i / cols) * cell + Math.round((cell - m.height) / 2),
    });
  }
  await sharp({
    create: { width: cols * cell, height: rows * cell, channels: 3, background: "#E8E8E8" },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(outFile);
  return { file: outFile, count: entries.length, labels: entries.map(([id]) => id) };
}
