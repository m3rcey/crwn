// Renders a VSL deck to 1920x1080 PNG slides through headless Chrome.
//
//   node scripts/vsl/render.mjs vsl-1-fan-worth          # whole deck
//   node scripts/vsl/render.mjs vsl-1-fan-worth 4,9,13   # just those slides
//
// HTML rather than an image model, deliberately: these slides carry exact headline copy and the
// real CRWN mark. An image model re-letters both on every generation, which is the drift the
// prompt sheet warns about. Here the copy is the copy, and a re-render is free.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { page, SLIDE } from "./lib/theme.mjs";
import { LAYOUT_CSS } from "./lib/layouts.mjs";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
].find((p) => fs.existsSync(p));

if (!CHROME) {
  console.error("render: no Chrome or Edge binary found. Install one, or add its path to CHROME.");
  process.exit(1);
}

const [deckId, only] = process.argv.slice(2);
if (!deckId) {
  console.error("usage: node scripts/vsl/render.mjs <deck-id> [1,2,3]");
  process.exit(1);
}

const wanted = only ? new Set(only.split(",").map((s) => Number(s.trim()))) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits for a screenshot to exist and finish being written. */
async function settled(file, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const size = fs.statSync(file).size;
      if (size > 0 && size === last) return true;
      last = size;
    }
    await sleep(150);
  }
  return false;
}

const { deck } = await import(`./decks/${deckId}.mjs`);
const outDir = path.join("videos", "vsl", deck.id);
fs.mkdirSync(outDir, { recursive: true });

// Chrome cannot reliably read a UNC \\wsl.localhost path, so stage the HTML on a local temp disk.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crwn-vsl-"));

let rendered = 0;
for (const slide of deck.slides) {
  if (wanted && !wanted.has(slide.n)) continue;

  const name = `${String(slide.n).padStart(2, "0")}`;
  const htmlPath = path.join(tmp, `${name}.html`);
  const pngPath = path.join(tmp, `${name}.png`);
  fs.writeFileSync(htmlPath, page({ css: LAYOUT_CSS, html: slide.html }), "utf8");

  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      // Its own profile, so a render never attaches to the browser the user has open.
      `--user-data-dir=${path.join(tmp, "profile")}`,
      `--window-size=${SLIDE.w},${SLIDE.h}`,
      "--virtual-time-budget=3000",
      `--screenshot=${pngPath}`,
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ],
    { stdio: "ignore" },
  );

  // Chrome on Windows returns before the screenshot has been flushed to disk, so wait for the
  // file to appear AND stop growing rather than trusting the exit code.
  if (!(await settled(pngPath))) {
    console.error(`  slide ${name}: chrome produced no screenshot`);
    continue;
  }
  const dest = path.join(outDir, `${deck.id}-${name}.png`);
  fs.copyFileSync(pngPath, dest);
  const kb = Math.round(fs.statSync(dest).size / 1024);
  console.log(`  ${path.basename(dest)}  ${kb} KB`);
  rendered++;
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${rendered} slide(s) to ${outDir}`);
