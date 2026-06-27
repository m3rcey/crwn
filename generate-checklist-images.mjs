import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WHITE_THRESHOLD = 200;

async function flattenWhiteBackground(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  let flipped = 0;
  for (let i = 0; i < data.length; i += c) {
    if (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; flipped++;
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: c } })
    .jpeg({ quality: 95 })
    .toFile(filePath);
  return flipped;
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const OUTPUT_BASE = "/mnt/c/Users/Merce/Dropbox/nano banana output/Cousin Access Checklist";
const REFS_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";
const DELAY_MS = 8000;

const STYLE_REFS = [
  "openart-image_1775581308623_d7e64984_1775581308661_33c1d1ba.png",
  "openart-image_1775598089791_eaae2824_1775598089858_cade8739.png",
  "openart-image_1775598227341_c79110c0_1775598227430_39e71232.png",
  "openart-image_1775598237169_2475a432_1775598237207_c74fc3ec.png",
];

const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and diagrams, high contrast black on white, no gray tones, no background texture. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL BACKGROUND RULE: The background must be PURE WHITE (#FFFFFF), absolutely flat, edge to edge. NO off-white, cream, eggshell, beige, or warm paper tones. NO desk, table, notebook, binding, or surface visible underneath. NO shadows under the page, NO page curl, NO page edges, NO paper texture or grain. The entire frame IS the paper — there is no visible surface, no background object, no hint that the paper is sitting on anything. This is a flat editorial scan, not a photograph of a sheet on a desk. Pure #FFFFFF pixels fill every edge of the frame. CRITICAL FONT RULE: ALL text in the image must be hand-drawn sharpie marker handwriting. NEVER use any printed, typeset, computer, Arial, Helvetica, serif, or sans-serif font anywhere in the image. Every single letter, number, word, label, header, list item, footer, and bottom tagline must look hand-written with a sharpie. No typography, no mixed fonts, no computer-generated text anywhere, not even in bottom taglines, captions, or footers.";

function buildPrompt(title, items) {
  const lines = items.map((t, i) => `(${i + 1}) ${t}`).join("; ");
  return `A hand-drawn checklist on a pure white page, drawn entirely with a bold black sharpie marker. At the top, a bold hand-printed header in large capital letters, underlined with a hand-drawn line: "${title}". Below the header, ${items.length} checklist rows stacked vertically from top to bottom with generous even spacing between them. Each row begins on the left with a small hand-drawn EMPTY square checkbox (an open unchecked box, nothing inside it), and to the right of the box a short line of bold hand-written sharpie text. The rows, in order top to bottom, read: ${lines}. Every checkbox stays empty so it can be ticked by hand later. All lettering is bold black sharpie hand-printing, high contrast black on white, no gray, no color. Comfortable margins on all sides, nothing cramped, everything large and legible. The background is pure white (#FFFFFF).`;
}

const IMAGES = [
  {
    file: "1-lock-the-doors.jpg",
    title: "PHASE 1: LOCK THE DOORS",
    items: [
      "Turn on 2FA on CRWN Instagram",
      "Turn on 2FA on personal Instagram",
      "Recovery email + phone are MINE only",
      "Turn on 2FA on the recovery email",
      "Turn on login alerts, both accounts",
      "Never share my password",
    ],
  },
  {
    file: "2-grant-access-part-1.jpg",
    title: "PHASE 2: LIMITED ACCESS (1)",
    items: [
      "Set both accounts to Professional",
      "Make a Meta Business Portfolio I own",
      "Add both IG accounts to it",
      "Confirm I am Owner / Admin",
      "Cousin uses HIS OWN login",
      "Invite him as PARTIAL access",
    ],
  },
  {
    file: "3-grant-access-part-2.jpg",
    title: "PHASE 2: LIMITED ACCESS (2)",
    items: [
      "Grant scheduling permission only",
      "Turn OFF full control",
      "Turn OFF manage account + billing",
      "Do NOT make him admin",
      "Confirm he cant reach settings or password",
    ],
  },
  {
    file: "4-publish-gate-optional.jpg",
    title: "PHASE 3: PUBLISH GATE (OPTIONAL)",
    items: [
      "Use Later or Metricool with approvals",
      "He drafts + schedules only",
      "I approve before anything goes live",
    ],
  },
  {
    file: "5-while-he-works.jpg",
    title: "PHASE 4: WHILE HE WORKS",
    items: [
      "Check active sessions every few days",
      "Log out anything I dont recognize",
      "Watch login alerts: is it really him?",
      "Spot-check the planner vs my schedule",
    ],
  },
  {
    file: "6-when-done-revoke.jpg",
    title: "PHASE 5: WHEN DONE, REVOKE",
    items: [
      "Remove his access from the portfolio",
      "Remove him from any third-party tool",
      "Change both IG passwords",
      "Confirm 2FA still on my phone",
      "Re-check sessions, log out extras",
    ],
  },
];

if (!fs.existsSync(OUTPUT_BASE)) fs.mkdirSync(OUTPUT_BASE, { recursive: true });

const styleRefParts = STYLE_REFS.map((f) => ({
  inlineData: { mimeType: "image/png", data: fs.readFileSync(path.join(REFS_DIR, f)).toString("base64") },
}));

console.log(`Generating ${IMAGES.length} checklist images`);
console.log(`Output: ${OUTPUT_BASE}`);

let success = 0, fail = 0;
const failed = [];

for (let idx = 0; idx < IMAGES.length; idx++) {
  const { file, title, items } = IMAGES[idx];
  const outPath = path.join(OUTPUT_BASE, file);
  if (fs.existsSync(outPath)) {
    console.log(`[${idx + 1}/${IMAGES.length}] ${file} SKIP (exists)`);
    success++;
    continue;
  }

  const prompt = buildPrompt(title, items);
  const parts = [{ text: STYLE_INSTRUCTION }, ...styleRefParts, { text: prompt }];
  console.log(`\n[${idx + 1}/${IMAGES.length}] ${file} — "${title}" (${items.length} items)`);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
      config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } },
    });

    let imageData = null;
    for (const cand of response.candidates || []) {
      for (const p of cand.content?.parts || []) {
        if (p.inlineData?.data) { imageData = p.inlineData.data; break; }
      }
      if (imageData) break;
    }

    if (!imageData) {
      console.error(`  FAIL: no image in response`);
      fail++; failed.push(file);
    } else {
      fs.writeFileSync(outPath, Buffer.from(imageData, "base64"));
      try {
        const flipped = await flattenWhiteBackground(outPath);
        console.log(`  OK ${file} (white-flattened ${flipped.toLocaleString()} px)`);
      } catch (err) {
        console.warn(`  saved but white-flatten failed: ${err.message}`);
      }
      success++;
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    fail++; failed.push(file);
  }

  if (idx < IMAGES.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
}

console.log(`\n=== DONE ===`);
console.log(`Success: ${success}/${IMAGES.length}`);
console.log(`Failed: ${fail}/${IMAGES.length}`);
if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
