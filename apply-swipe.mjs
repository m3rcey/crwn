import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BASE = "/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts";
const PERSIST = "/mnt/c/Users/Merce/Desktop/nano banana references/swipe-for-more.png";
const SWIPE = fs.existsSync(PERSIST) ? PERSIST : "/tmp/swipe-proc.png";
const SIZE = 1024;
const BAND = 104;                 // bottom band reserved for the swipe cue
const TARGET_TOP = 22;            // top margin content reflows to
const CONTENT_MAX_BOTTOM = SIZE - BAND; // content must end above this
const AVAIL_H = CONTENT_MAX_BOTTOM - TARGET_TOP;
const SWIPE_W = 500;
const WHITE_THR = 235;
const ONLY = process.env.ONLY_FOLDER || null;

const swipeBuf = await sharp(SWIPE).resize({ width: SWIPE_W }).toBuffer();
const swipeH = (await sharp(swipeBuf).metadata()).height;
const swLeft = Math.round((SIZE - SWIPE_W) / 2);
const swTop = CONTENT_MAX_BOTTOM + Math.round((BAND - swipeH) / 2);

function contentRows(data, W, H, C) {
  const has = (y) => {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      if (data[i] < WHITE_THR || data[i + 1] < WHITE_THR || data[i + 2] < WHITE_THR) return true;
    }
    return false;
  };
  let top = 0; while (top < H && !has(top)) top++;
  let bot = H - 1; while (bot > top && !has(bot)) bot--;
  return { top, bot };
}

const folders = ONLY ? [ONLY] : fs.readdirSync(BASE).filter((d) => fs.existsSync(path.join(BASE, d, "slide-01.png")));
let done = 0, scaled = 0;

for (const folder of folders) {
  const dir = path.join(BASE, folder);
  const cur = path.join(dir, "slide-01.png");
  const orig = path.join(dir, "slide-01.orig.png");
  if (!fs.existsSync(cur)) continue;
  if (!fs.existsSync(orig)) fs.copyFileSync(cur, orig);

  const { data, info } = await sharp(orig).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  if (W !== SIZE || H !== SIZE) { console.log(`skip ${folder} (not ${SIZE}sq: ${W}x${H})`); continue; }

  const { top, bot } = contentRows(data, W, H, C);
  const contentH = bot - top + 1;

  // vertical slice that holds all content, full width (horizontal preserved)
  const slice = sharp(orig).extract({ left: 0, top, width: W, height: contentH });

  let regionBuf, regionW, regionH, didScale = false;
  if (contentH <= AVAIL_H) {
    regionBuf = await slice.png().toBuffer();
    regionW = W; regionH = contentH;
  } else {
    // content is full-height: shrink uniformly to fit the top region
    const scale = AVAIL_H / contentH;
    regionW = Math.round(W * scale); regionH = AVAIL_H;
    regionBuf = await slice.resize({ width: regionW, height: regionH }).png().toBuffer();
    didScale = true; scaled++;
  }
  const pasteTop = contentH <= AVAIL_H ? Math.min(TARGET_TOP, top) : TARGET_TOP;
  const pasteLeft = Math.round((W - regionW) / 2);

  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: "#ffffff" } })
    .composite([
      { input: regionBuf, top: pasteTop, left: pasteLeft },
      { input: swipeBuf, top: swTop, left: swLeft },
    ])
    .png()
    .toFile(cur + ".tmp");
  fs.renameSync(cur + ".tmp", cur);
  done++;
  if (ONLY) console.log(`${folder}: content rows ${top}-${bot} (h=${contentH}) ${didScale ? "SCALED to " + regionH : "shifted to top " + pasteTop}; swipe at y=${swTop}`);
}
console.log(`\nDone. ${done} slide-01 reflowed + stamped (${scaled} needed scaling).`);
