// Email posters for the four pre-signup VSLs.
//
// Slide 01 of each deck IS the video's opening frame, and every one of them has already been
// reviewed by eye, so the poster costs nothing to produce and cannot disagree with the video.
// WebP because these are flat colour with hard edges, the worst case for DCT (see CLAUDE.md).
// 1120px wide: 2x the 560px the email renders at, so it stays sharp on a retina screen.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SLUGS = [
  "vsl-1-fan-worth",
  "vsl-2-what-fans-pay-for",
  "vsl-3-first-100-fans",
  "vsl-4-if-nobody-buys",
];

const out = path.join("public", "vsl");
fs.mkdirSync(out, { recursive: true });

for (const slug of SLUGS) {
  const src = path.join("videos", "vsl", slug, `${slug}-01.png`);
  if (!fs.existsSync(src)) {
    console.log(`SKIP ${slug}: no ${src}`);
    continue;
  }
  const dest = path.join(out, `${slug}.webp`);
  await sharp(src).resize(1120).webp({ quality: 82 }).toFile(dest);
  console.log(`${dest}  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
}
