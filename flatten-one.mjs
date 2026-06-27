import sharp from "sharp";
import fs from "node:fs";

const filePath = process.argv[2];
const threshold = parseInt(process.argv[3] || "215", 10);

if (!filePath || !fs.existsSync(filePath)) {
  console.error(`usage: node flatten-one.mjs <path> [threshold=215]`);
  process.exit(1);
}

const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
const c = info.channels;
let flipped = 0;
for (let i = 0; i < data.length; i += c) {
  if (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    flipped++;
  }
}
await sharp(data, { raw: { width: info.width, height: info.height, channels: c } })
  .jpeg({ quality: 95 })
  .toFile(filePath);
console.log(`Flattened ${flipped.toLocaleString()} pixels at threshold ${threshold}`);
