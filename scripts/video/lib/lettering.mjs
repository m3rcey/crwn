// Deterministic hand-lettering: exact strings become transparent PNG sprites.
//
// This is the anti-typo mechanism. A generative model is never asked to spell a
// figure; the repo letters every factual string itself with the OFL handwriting
// fonts already in scripts/vsl/assets/fonts, through the same headless-Chrome
// route scripts/vsl/render.mjs has been using for exact VSL copy ("HTML rather
// than an image model, deliberately... Here the copy is the copy, and a re-render
// is free").
//
// Chrome runs ONCE per job, on a sheet holding every sprite the video needs, and
// only for sprites not already cached. Sprites are content-addressed, so a
// rerender of unchanged copy launches no browser and costs nothing. Animation is
// not done here: a sprite is a still, and lib/motion.mjs moves it.
//
// Why sprites and not per-frame Chrome: HyperFrames-style per-frame browser
// capture would re-letter the same words 900 times for one video and would
// replace a renderer this repo already has. One capture, then buffer math, is the
// same determinism at a fraction of the wall clock. See docs/VIDEO_PIPELINE.md.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { MOTION } from "../config.mjs";

const MAX_SHEET_PX = 8000; // one Chrome capture; taller sheets are split

/** Stable id for a sprite's full visual definition. Any change of copy, size,
 * weight or decoration is a different sprite, which is what makes the cache safe. */
export function spriteHash(req) {
  const canon = JSON.stringify([
    req.kind,
    req.text ?? null,
    req.shape ?? null,
    req.fontPx ?? null,
    req.family ?? null,
    req.strokePx ?? null,
    req.maxWidthPx ?? null,
    req.align ?? null,
    req.box ?? false,
    req.underline ?? false,
    req.progress ?? null,
    req.widthPx ?? null,
    req.heightPx ?? null,
    MOTION.lettering,
    MOTION.ink,
  ]);
  return crypto.createHash("sha1").update(canon).digest("hex").slice(0, 16);
}

/** A tiny deterministic PRNG seeded from a string: imperfection that is identical
 * on every render. Marker jitter must be reproducible or a rerender is a new video. */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h |= 0;
    return ((h >>> 0) % 10000) / 10000;
  };
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Wrap each glyph so it can carry its own jitter. Spaces stay spaces so the
 * browser still breaks lines and centers them normally. */
function jitterMarkup(text, fontPx) {
  const rand = seeded(text);
  const maxPx = fontPx * MOTION.lettering.jitterPx;
  let out = "";
  for (const ch of text) {
    if (ch === "\n") {
      out += "<br>";
      continue;
    }
    if (ch === " ") {
      out += " ";
      continue;
    }
    const rot = (rand() * 2 - 1) * MOTION.lettering.jitterDeg;
    const dy = (rand() * 2 - 1) * maxPx;
    out += `<span style="display:inline-block;transform:rotate(${rot.toFixed(2)}deg) translateY(${dy.toFixed(2)}px)">${esc(ch)}</span>`;
  }
  return out;
}

function fontFaces() {
  return MOTION.fonts
    .filter((f) => fs.existsSync(path.join(MOTION.fontsDir, f.file)))
    .map((f) => {
      const b64 = fs.readFileSync(path.join(MOTION.fontsDir, f.file)).toString("base64");
      return `@font-face{font-family:'${f.family}';src:url('data:font/woff2;base64,${b64}') format('woff2');font-display:block}`;
    })
    .join("\n");
}

function shapeSvg(req) {
  const w = req.widthPx;
  const h = req.heightPx;
  const sw = req.strokePx;
  const p = Math.max(0, Math.min(1, req.progress ?? 1));
  const inset = sw;
  if (req.shape === "circle") {
    const rx = (w - inset * 2) / 2;
    const ry = (h - inset * 2) / 2;
    // Circumference of an ellipse, Ramanujan's approximation: good enough for a
    // dash length, and it is deterministic.
    const len = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    // No rotation: rotating the ellipse to move the dash start also rotates its
    // bounding box, which clipped the circle to two arcs the first time round.
    // Starting the stroke at 3 o'clock reads fine for circling something.
    return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${rx}" ry="${ry}" fill="none" stroke="${MOTION.ink}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${len.toFixed(2)}" stroke-dashoffset="${(len * (1 - p)).toFixed(2)}"/>`;
  }
  if (req.shape === "underline") {
    const x2 = inset + (w - inset * 2) * p;
    return `<path d="M ${inset} ${h * 0.55} Q ${w * 0.5} ${h * 0.78} ${x2} ${h * 0.5}" fill="none" stroke="${MOTION.ink}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  if (req.shape === "arrow") {
    const tip = inset + (w - inset * 2) * p;
    const head = p > 0.75 ? `<path d="M ${tip} ${h / 2} l ${-sw * 2.2} ${-sw * 1.8} M ${tip} ${h / 2} l ${-sw * 2.2} ${sw * 1.8}" fill="none" stroke="${MOTION.ink}" stroke-width="${sw}" stroke-linecap="round"/>` : "";
    return `<path d="M ${inset} ${h / 2} L ${tip} ${h / 2}" fill="none" stroke="${MOTION.ink}" stroke-width="${sw}" stroke-linecap="round"/>${head}`;
  }
  throw new Error(`unknown sprite shape "${req.shape}"`);
}

function cellHeight(req) {
  if (req.kind === "shape") return req.heightPx + req.strokePx * 4;
  const lines = String(req.text).split("\n").length;
  const box = req.box ? req.fontPx * 0.7 : 0;
  const under = req.underline ? req.fontPx * 0.5 : 0;
  return Math.ceil(lines * req.fontPx * MOTION.lettering.lineHeight + req.fontPx * 1.0 + box + under);
}

function cellMarkup(req, hash) {
  if (req.kind === "shape") {
    return `<svg width="${req.widthPx}" height="${req.heightPx}" viewBox="0 0 ${req.widthPx} ${req.heightPx}" style="filter:url(#rough)">${shapeSvg(req)}</svg>`;
  }
  // A box is drawn, not bordered: the reference sheets have wobbly marker boxes
  // with overshooting corners, and a CSS border reads as a machine rectangle.
  const pad = req.box ? `${(req.fontPx * 0.3).toFixed(0)}px ${(req.fontPx * 0.46).toFixed(0)}px` : "0";
  const boxAttrs = req.box
    ? ` data-box="1" data-seed="${spriteHash(req)}" data-boxw="${(req.strokePx * 1.9).toFixed(2)}"`
    : "";
  const underline = req.underline
    ? `<div style="height:${(req.fontPx * 0.16).toFixed(1)}px;background:${MOTION.ink};border-radius:999px;margin:${(req.fontPx * 0.12).toFixed(1)}px auto 0;width:88%"></div>`
    : "";
  return (
    `<div class="ink" data-fit="${req.maxWidthPx}"${boxAttrs} style="font-family:'${req.family}';font-size:${req.fontPx}px;` +
    `-webkit-text-stroke:${req.strokePx.toFixed(2)}px ${MOTION.ink};text-align:${req.align};padding:${pad};display:inline-block;position:relative">` +
    `${jitterMarkup(req.text, req.fontPx)}${underline}</div>`
  );
}

function buildSheetHtml(reqs, sheetWidth) {
  let y = 0;
  const cells = [];
  for (const { req, hash } of reqs) {
    const h = cellHeight(req);
    cells.push(
      `<div class="cell" style="position:absolute;left:0;top:${y}px;width:${sheetWidth}px;height:${h}px;display:flex;align-items:center;justify-content:center">${cellMarkup(req, hash)}</div>`
    );
    req._cell = { top: y, height: h };
    y += h;
  }
  const roughScale = MOTION.lettering.roughness;
  return `<!doctype html><meta charset="utf-8"><style>
${fontFaces()}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent}
body{width:${sheetWidth}px;height:${y}px;position:relative}
.ink{color:${MOTION.ink};text-transform:uppercase;line-height:${MOTION.lettering.lineHeight};white-space:pre;filter:url(#rough)}
</style>
<svg width="0" height="0" style="position:absolute"><filter id="rough" x="-8%" y="-20%" width="116%" height="140%">
<feTurbulence type="fractalNoise" baseFrequency="0.032" numOctaves="2" seed="7" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="${roughScale}" xChannelSelector="R" yChannelSelector="G"/>
</filter></svg>
<body>${cells.join("")}
<script>
// Shrink-to-fit before first paint, the same trick scripts/vsl/lib/theme.mjs uses:
// the capture never catches an unfitted line, and the measurement is deterministic
// because the font, the engine and the string are all fixed.
function prng(seed) {
  var h = 2166136261;
  for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h |= 0; return ((h >>> 0) % 10000) / 10000; };
}
// A marker box: four jittered corners, drawn past the closing corner the way a
// hand does. Measured after the fit pass so it wraps the real text box.
for (var el of document.querySelectorAll('[data-box]')) {
  var r = el.getBoundingClientRect();
  var sw = Number(el.dataset.boxw);
  var rand = prng(el.dataset.seed);
  var j = function () { return (rand() * 2 - 1) * sw * 1.1; };
  var w = r.width, h = r.height;
  var p = [[j(), j()], [w + j(), j()], [w + j(), h + j()], [j(), h + j()]];
  var over = sw * 2.2;
  var d = 'M ' + p[0][0] + ' ' + p[0][1] +
          ' L ' + p[1][0] + ' ' + p[1][1] +
          ' L ' + p[2][0] + ' ' + p[2][1] +
          ' L ' + p[3][0] + ' ' + p[3][1] +
          ' L ' + p[0][0] + ' ' + p[0][1] +
          ' L ' + (p[0][0] + over) + ' ' + (p[0][1] + j() * 0.4);
  var ns = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', w + sw * 6);
  svg.setAttribute('height', h + sw * 6);
  svg.setAttribute('style', 'position:absolute;left:' + (-sw * 3) + 'px;top:' + (-sw * 3) + 'px;overflow:visible');
  var path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('transform', 'translate(' + sw * 3 + ',' + sw * 3 + ')');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '${MOTION.ink}');
  path.setAttribute('stroke-width', sw);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  el.appendChild(svg);
}
for (var el2 of document.querySelectorAll('[data-fit]')) {
  var max = Number(el2.dataset.fit);
  var wid = el2.getBoundingClientRect().width;
  if (wid > max) { el2.style.transform = 'scale(' + (max / wid) + ')'; el2.style.transformOrigin = 'center center'; }
}
</script></body>`;
}

/** /mnt/c/... -> C:/... so a Windows Chrome can read a path a WSL node wrote. */
export function toHostPath(p) {
  const m = /^\/mnt\/([a-z])\/(.*)$/.exec(p);
  if (m) return `${m[1].toUpperCase()}:/${m[2]}`;
  return p;
}

function findChrome() {
  for (const c of MOTION.chromeCandidates) {
    if (fs.existsSync(c)) return c;
    const wsl = c.replace(/^([A-Za-z]):\//, (_, d) => `/mnt/${d.toLowerCase()}/`);
    if (fs.existsSync(wsl)) return wsl;
  }
  return null;
}

/** Chrome on Windows returns before the PNG is flushed to disk. */
async function waitForFile(file, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const size = fs.statSync(file).size;
      if (size > 0 && size === last) return true;
      last = size;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/**
 * Make sure every requested sprite exists on disk. Returns hash -> {file,width,height}.
 * Cached sprites are never re-rendered, so an unchanged rerender launches no browser.
 *
 * @param {object[]} requests sprite definitions
 * @param {{ log?: Function, cacheDir?: string, chromeRunner?: Function }} opts
 */
export async function ensureSprites(requests, opts = {}) {
  const log = opts.log || (() => {});
  const cacheDir = opts.cacheDir || MOTION.spriteCacheDir;
  fs.mkdirSync(cacheDir, { recursive: true });

  const withHashes = requests.map((req) => ({ req, hash: req.hash || spriteHash(req) }));
  /** @type {Map<string,{file:string,width:number,height:number}>} */
  const out = new Map();
  const missing = [];
  for (const entry of withHashes) {
    const png = path.join(cacheDir, `${entry.hash}.png`);
    const meta = path.join(cacheDir, `${entry.hash}.json`);
    if (fs.existsSync(png) && fs.existsSync(meta)) {
      out.set(entry.hash, { file: png, ...JSON.parse(fs.readFileSync(meta, "utf-8")) });
    } else if (!out.has(entry.hash) && !missing.some((m) => m.hash === entry.hash)) {
      missing.push(entry);
    }
  }
  if (!missing.length) {
    log(`lettering: ${out.size} sprites, all cached (no browser launch, $0)`);
    return out;
  }

  const chrome = opts.chromeRunner ? "injected" : findChrome();
  if (!chrome) {
    throw new Error(
      `lettering needs Chrome or Edge to render exact copy; none of ${MOTION.chromeCandidates.join(", ")} exists`
    );
  }
  const sheetWidth = Math.max(...missing.map((m) => (m.req.kind === "shape" ? m.req.widthPx : m.req.maxWidthPx))) + 120;

  // Chunk so one capture never exceeds Chrome's comfortable surface size.
  const chunks = [];
  let cur = [];
  let curH = 0;
  for (const m of missing) {
    const h = cellHeight(m.req);
    if (curH + h > MAX_SHEET_PX && cur.length) {
      chunks.push(cur);
      cur = [];
      curH = 0;
    }
    cur.push(m);
    curH += h;
  }
  if (cur.length) chunks.push(cur);

  log(`lettering: ${out.size} cached, rendering ${missing.length} new sprites in ${chunks.length} capture(s)`);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "crwn-letter-"));
  const winStage = stageDir(stage);

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const html = buildSheetHtml(chunk, sheetWidth);
    const htmlPath = path.join(winStage, `sheet-${ci}.html`);
    const pngPath = path.join(winStage, `sheet-${ci}.png`);
    fs.writeFileSync(htmlPath, html, "utf8");
    const totalH = chunk.reduce((a, m) => a + m.req._cell.height, 0);

    if (opts.chromeRunner) {
      await opts.chromeRunner({ htmlPath, pngPath, width: sheetWidth, height: totalH, html });
    } else {
      execFileSync(
        chrome,
        [
          "--headless=new",
          "--disable-gpu",
          "--hide-scrollbars",
          "--force-device-scale-factor=1",
          // Transparent so a sprite composites over the paper without a white box.
          "--default-background-color=00000000",
          `--user-data-dir=${toHostPath(path.join(winStage, "profile"))}`,
          `--window-size=${sheetWidth},${totalH}`,
          `--screenshot=${toHostPath(pngPath)}`,
          `file://${toHostPath(htmlPath)}`,
        ],
        { stdio: "ignore", timeout: 120000 }
      );
      if (!(await waitForFile(pngPath))) throw new Error(`lettering: Chrome produced no screenshot for sheet ${ci}`);
    }

    const sheet = sharp(pngPath);
    for (const { req, hash } of chunk) {
      const cell = req._cell;
      const buf = await sheet
        .clone()
        .extract({ left: 0, top: cell.top, width: sheetWidth, height: cell.height })
        .png()
        .toBuffer();
      // Trim the transparent margin so placement is predictable from the sprite's
      // own box rather than from the cell it happened to be laid out in.
      const trimmed = await sharp(buf).trim({ threshold: 1 }).png().toBuffer();
      const meta = await sharp(trimmed).metadata();
      if (!meta.width || !meta.height) throw new Error(`lettering: sprite ${hash} rendered empty (${req.text ?? req.shape})`);
      const file = path.join(cacheDir, `${hash}.png`);
      fs.writeFileSync(file, trimmed);
      fs.writeFileSync(
        path.join(cacheDir, `${hash}.json`),
        JSON.stringify({ width: meta.width, height: meta.height, kind: req.kind, text: req.text ?? null, shape: req.shape ?? null }, null, 2)
      );
      out.set(hash, { file, width: meta.width, height: meta.height });
    }
  }
  return out;
}

/** A Windows-visible staging directory: Chrome cannot read \\wsl.localhost paths,
 * so HTML and PNGs live on a real drive both sides can see. */
function stageDir(fallback) {
  const candidates = [];
  if (process.env.CRWN_LETTER_STAGE) candidates.push(process.env.CRWN_LETTER_STAGE);
  const winTemp = "/mnt/c/Users/Josh/AppData/Local/Temp";
  if (fs.existsSync(winTemp)) candidates.push(winTemp);
  for (const base of candidates) {
    try {
      return fs.mkdtempSync(path.join(base, "crwn-letter-"));
    } catch {
      /* try the next one */
    }
  }
  return fallback;
}

/** Font licence provenance, reported in the cost/verification output so nobody has
 * to wonder whether the lettering introduced a font obligation. */
export function fontProvenance() {
  return MOTION.fonts
    .filter((f) => fs.existsSync(path.join(MOTION.fontsDir, f.file)))
    .map((f) => ({ family: f.family, file: path.join(MOTION.fontsDir, f.file), licence: "SIL Open Font License (already in repo, used by scripts/vsl)" }));
}
