import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WHITE_THRESHOLD = 200;
async function flattenWhiteBackground(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  for (let i = 0; i < data.length; i += c) {
    if (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: c } })
    .jpeg({ quality: 95 }).toFile(filePath);
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const REFS_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";
const OUT_PATH = "/mnt/c/Users/Merce/Dropbox/nano banana output/major-announcement-coming.jpg";

const STYLE_REFS = [
  "openart-image_1775581308623_d7e64984_1775581308661_33c1d1ba.png",
  "openart-image_1775598089791_eaae2824_1775598089858_cade8739.png",
  "openart-image_1775598227341_c79110c0_1775598227430_39e71232.png",
  "openart-image_1775598237169_2475a432_1775598237207_c74fc3ec.png",
];
const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons, high contrast black on white, no gray tones, no background texture. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. STYLE ONLY — do not copy any words, branding, crowns, logos, or taglines from the reference images. CRITICAL BACKGROUND RULE: background must be PURE WHITE (#FFFFFF), absolutely flat, edge to edge. NO off-white, cream, beige, or warm tones. NO desk, table, notebook, binding, or surface visible. NO shadows, page curl, page edges, or paper texture. The entire frame IS the paper. Pure #FFFFFF pixels fill every edge. CRITICAL FONT RULE: ALL text must be hand-drawn sharpie marker handwriting. NEVER use any printed, typeset, Arial, Helvetica, serif, or sans-serif font anywhere. Every letter must look hand-written with a sharpie.";

const PROMPT = "A hand-drawn black sharpie marker image on pure white paper, square format. At the top center, a simple bold hand-drawn closed padlock icon. Below it, large bold all-caps hand-drawn sharpie lettering reading on three lines, centered: \"MAJOR\" (underlined twice with two hand-drawn lines), then \"ANNOUNCEMENT\", then \"COMING...\" with three dots. Everything is raw hand-drawn sharpie, high contrast black on white. The background is pure white (#FFFFFF). Do NOT include any signature, name, byline, attribution, or text at the bottom of the page. No '- Josh', no 'Mercey', no author credit anywhere. Nothing below the word COMING.";

const styleRefParts = STYLE_REFS.map((f) => ({
  inlineData: { mimeType: "image/png", data: fs.readFileSync(path.join(REFS_DIR, f)).toString("base64") },
}));

const parts = [{ text: STYLE_INSTRUCTION }, ...styleRefParts, { text: PROMPT }];

const response = await ai.models.generateContent({
  model: "gemini-3.1-flash-image-preview",
  contents: [{ role: "user", parts }],
  config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
});

let imageData = null;
for (const cand of response.candidates || []) {
  for (const p of cand.content?.parts || []) {
    if (p.inlineData?.data) { imageData = p.inlineData.data; break; }
  }
  if (imageData) break;
}
if (!imageData) { console.error("FAIL: no image in response"); process.exit(1); }
fs.writeFileSync(OUT_PATH, Buffer.from(imageData, "base64"));
await flattenWhiteBackground(OUT_PATH);
console.log(`OK -> ${OUT_PATH}`);
