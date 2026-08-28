// Prepares the CRWN crown marks every VSL slide draws.
// Source of truth is public/crwn-logo-transparent.png (the real CRWN mark, never a generic crown).
// Run from the repo root:  node scripts/vsl/prep-assets.mjs
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const SRC = "public/crwn-logo-transparent.png";
const OUT = "scripts/vsl/assets";

const VARIANTS = {
  "crown-black.png": [17, 17, 17],
  "crown-gold.png": [212, 175, 55],
  "crown-cream.png": [251, 248, 244],
};

fs.mkdirSync(OUT, { recursive: true });

const trimmed = await sharp(SRC).trim({ threshold: 1 }).png().toBuffer();
const { data, info } = await sharp(trimmed)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (const [name, [r, g, b]] of Object.entries(VARIANTS)) {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] > 0) {
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name));
  console.log(`${name}  ${info.width}x${info.height}`);
}
