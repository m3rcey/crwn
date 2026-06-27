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
  await sharp(data, { raw: { width: info.width, height: info.height, channels: c } }).jpeg({ quality: 95 }).toFile(filePath);
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const OUTPUT_BASE = "/mnt/c/Users/Merce/Dropbox/nano banana output/Posting Schedule Cards";
const REFS_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";
const STYLE_REFS = [
  "openart-image_1775581308623_d7e64984_1775581308661_33c1d1ba.png",
  "openart-image_1775598089791_eaae2824_1775598089858_cade8739.png",
  "openart-image_1775598227341_c79110c0_1775598227430_39e71232.png",
  "openart-image_1775598237169_2475a432_1775598237207_c74fc3ec.png",
];
const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and diagrams, high contrast black on white, no gray tones, no background texture. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL BACKGROUND RULE: The background must be PURE WHITE (#FFFFFF), absolutely flat, edge to edge. NO off-white, cream, eggshell, beige, or warm paper tones. NO desk, table, notebook, binding, or surface visible underneath. NO shadows, NO page curl, NO page edges, NO paper texture. The entire frame IS the paper. Pure #FFFFFF pixels fill every edge. CRITICAL FONT RULE: ALL text must be hand-drawn sharpie marker handwriting. NEVER use any printed, typeset, computer, Arial, Helvetica, serif, or sans-serif font anywhere. Every letter, number, word, label, list item and footer must look hand-written with a sharpie. No typography, no computer-generated text anywhere.";

const ROW_INTRO = "Every posting row starts on the left with a small hand-drawn EMPTY square checkbox (open, unchecked, nothing inside) and short bold sharpie text to its right. All checkboxes stay empty so they can be ticked by hand. All lettering is bold black sharpie hand-printing, high contrast black on white, no gray, no color. Compact but legible, even spacing, comfortable margins. The background is pure white (#FFFFFF).";

const prompt = `A hand-drawn WEEKLY posting checklist on a pure white page, drawn entirely with a bold black sharpie marker. At the very top, a large hand-printed header in capital letters, underlined: "WEEK 1 - JUN 4 TO 7 (LAUNCH)". Below, four day-groups stacked vertically, each introduced by a small bold underlined hand-printed day label, followed by its posting rows.

Day label "THU JUN 4": "1:00p  TEASER - big announcement coming (personal)".
Day label "FRI JUN 5": "1:00p  the announcement post (personal)".
Day label "SAT JUN 6": "11:00a  video 1 - drake-per-stream-vs-label"; "12:30p  carousel 9 - 1-fan-equals-40000-streams"; "3:30p  carousel 9 (repost)".
Day label "SUN JUN 7": "12:30p  video 2 - drake-2m-deal-18-percent"; "2:00p  carousel 11 - drake-streaming-vs-payout"; "3:30p  react to 1 - drake-per-stream-vs-label"; "5:00p  carousel 11 (repost)".

` + ROW_INTRO;

if (!fs.existsSync(OUTPUT_BASE)) fs.mkdirSync(OUTPUT_BASE, { recursive: true });
const styleRefParts = STYLE_REFS.map((f) => ({ inlineData: { mimeType: "image/png", data: fs.readFileSync(path.join(REFS_DIR, f)).toString("base64") } }));
const outPath = path.join(OUTPUT_BASE, "SAMPLE-week1-launch.jpg");

console.log("Generating Week 1 (launch) card...");
const parts = [{ text: STYLE_INSTRUCTION }, ...styleRefParts, { text: prompt }];
const response = await ai.models.generateContent({
  model: "gemini-3.1-flash-image-preview",
  contents: [{ role: "user", parts }],
  config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } },
});
let imageData = null;
for (const cand of response.candidates || []) {
  for (const p of cand.content?.parts || []) { if (p.inlineData?.data) { imageData = p.inlineData.data; break; } }
  if (imageData) break;
}
if (!imageData) { console.error("FAIL: no image"); process.exit(1); }
fs.writeFileSync(outPath, Buffer.from(imageData, "base64"));
await flattenWhiteBackground(outPath);
console.log("OK " + outPath);
