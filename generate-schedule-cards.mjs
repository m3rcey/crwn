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

const ROW_INTRO = "Every posting row starts on the left with a small hand-drawn EMPTY square checkbox (open, unchecked, nothing inside) and short bold sharpie text to its right. All checkboxes stay empty so they can be ticked by hand. All lettering is bold black sharpie hand-printing, high contrast black on white, no gray, no color. Compact but legible, even spacing, comfortable margins. The background is pure white (#FFFFFF). All times shown are Central time.";

const WEEKS = [
  { file: "week-1-jun-4-to-7.jpg", title: "WEEK 1 - JUN 4 TO 7 (LAUNCH)", days: [
    { label: "THU JUN 4", rows: ["10:00a  TEASER - big announcement coming (personal)", "10:30a  video 1 - drake-per-stream-vs-label", "12:00p  carousel 9 - 1-fan-equals-40000-streams", "3:00p  carousel 9 (repost)"] },
    { label: "FRI JUN 5", rows: ["10:00a  ANNOUNCEMENT post (personal)", "11:00a  video 2 - drake-2m-deal-18-percent", "12:30p  carousel 11 - drake-streaming-vs-payout", "2:00p  react to 1 - drake-per-stream-vs-label", "3:30p  carousel 11 (repost)"] },
    { label: "SAT JUN 6", rows: ["10:00a  video 3 - drake-139m-followers-1-percent", "11:30a  carousel 12 - drake-200k-fans-vs-streaming", "1:00p  react to 2 - drake-2m-deal-18-percent", "2:30p  carousel 12 (repost)"] },
    { label: "SUN JUN 7", rows: ["11:30a  video 4 - kendrick-5-grammys", "1:00p  carousel 13 - kanye-gamma-distribution-deal", "2:30p  react to 3 - drake-139m-followers-1-percent", "4:00p  carousel 13 (repost)"] },
  ]},
  { file: "week-2-jun-11-to-14.jpg", title: "WEEK 2 - JUN 11 TO 14", days: [
    { label: "THU JUN 11", rows: ["10:30a  video 5 - not-like-us-money", "12:00p  carousel 15 - distribution-deal-explained", "1:30p  react to 4 - kendrick-5-grammys", "3:00p  carousel 15 (repost)"] },
    { label: "FRI JUN 12", rows: ["11:00a  video 6 - recoupment-wayne-lawsuit", "12:30p  carousel 18 - same-fan-333x-more-money", "2:00p  react to 5 - not-like-us-money", "3:30p  carousel 18 (repost)"] },
    { label: "SAT JUN 13", rows: ["10:00a  video 7 - drake-umg-fake-streams-lawsuit", "11:30a  carousel 20 - kendrick-pglang-explained", "1:00p  react to 6 - recoupment-wayne-lawsuit", "2:30p  carousel 20 (repost)"] },
    { label: "SUN JUN 14", rows: ["11:30a  video 9 - 1-fan-vs-40k-streams", "1:00p  carousel 21 - masters-jay-z-roc-a-fella", "2:30p  react to 7 - drake-umg-fake-streams-lawsuit", "4:00p  carousel 21 (repost)"] },
  ]},
  { file: "week-3-jun-18-to-21.jpg", title: "WEEK 3 - JUN 18 TO 21", days: [
    { label: "THU JUN 18", rows: ["10:30a  video 10 - umg-made-money-while-drake-sued", "12:00p  carousel 24 - fans-spend-150-monthly", "1:30p  react to 9 - 1-fan-vs-40k-streams", "3:00p  carousel 24 (repost)"] },
    { label: "FRI JUN 19", rows: ["11:00a  video 11 - drake-streaming-vs-payout", "12:30p  carousel 27 - publishing-mase-bad-boy", "2:00p  react to 10 - umg-made-money-while-drake-sued", "3:30p  carousel 27 (repost)"] },
    { label: "SAT JUN 20", rows: ["10:00a  video 12 - drake-200k-fans-vs-streaming", "11:30a  carousel 29 - drake-advance-vs-50k-fans", "1:00p  react to 11 - drake-streaming-vs-payout", "2:30p  carousel 29 (repost)"] },
    { label: "SUN JUN 21", rows: ["11:30a  video 13 - kanye-gamma-distribution-deal", "1:00p  carousel 33 - advance-trinidad-james", "2:30p  react to 12 - drake-200k-fans-vs-streaming", "4:00p  carousel 33 (repost)"] },
  ]},
  { file: "week-4-jun-25-to-28.jpg", title: "WEEK 4 - JUN 25 TO 28", days: [
    { label: "THU JUN 25", rows: ["10:30a  video 15 - distribution-deal-explained", "12:00p  carousel 34 - big-sean-missing-millions", "1:30p  react to 13 - kanye-gamma-distribution-deal", "3:00p  carousel 34 (repost)"] },
    { label: "FRI JUN 26", rows: ["11:00a  video 16 - drake-ovo-vs-republic", "12:30p  carousel 36 - content-vs-offers", "2:00p  react to 15 - distribution-deal-explained", "3:30p  carousel 36 (repost)"] },
    { label: "SAT JUN 27", rows: ["10:00a  video 18 - same-fan-333x-more-money", "11:30a  carousel 39 - 360-deal-drake-umg", "1:00p  react to 16 - drake-ovo-vs-republic", "2:30p  carousel 39 (repost)"] },
    { label: "SUN JUN 28", rows: ["11:30a  video 19 - drake-pnd-some-sexy-songs-masters", "1:00p  carousel 42 - chris-brown-direct-to-consumer", "2:30p  react to 18 - same-fan-333x-more-money", "4:00p  carousel 42 (repost)"] },
  ]},
  { file: "week-5-jul-2-to-5.jpg", title: "WEEK 5 - JUL 2 TO 5", days: [
    { label: "THU JUL 2", rows: ["10:30a  video 21 - masters-jay-z-roc-a-fella", "12:00p  carousel 43 - frank-ocean-endless-def-jam-trick", "1:30p  react to 19 - drake-pnd-some-sexy-songs-masters", "3:00p  carousel 43 (repost)"] },
    { label: "FRI JUL 3", rows: ["11:00a  video 22 - drake-feature-fee-vs-label", "12:30p  carousel 46 - the-weeknd-built-a-year-before-signing", "2:00p  react to 21 - masters-jay-z-roc-a-fella", "3:30p  carousel 46 (repost)"] },
    { label: "SAT JUL 4", rows: ["10:00a  video 23 - megan-signed-at-20", "11:30a  carousel 49 - 50-cent-grodt-12m-what-interscope-kept", "1:00p  react to 22 - drake-feature-fee-vs-label", "2:30p  carousel 49 (repost)"] },
    { label: "SUN JUL 5", rows: ["11:30a  video 24 - fans-spend-150-monthly", "1:00p  carousel 50 - 50-cent-vitamin-water-equity-vs-fee", "2:30p  react to 23 - megan-signed-at-20", "4:00p  carousel 50 (repost)"] },
  ]},
  { file: "week-6-jul-9-to-12.jpg", title: "WEEK 6 - JUL 9 TO 12", days: [
    { label: "THU JUL 9", rows: ["10:30a  video 25 - kanye-ai-vocals-james-blake", "12:00p  carousel 52 - snoop-bought-death-row-back", "1:30p  react to 24 - fans-spend-150-monthly", "3:00p  carousel 52 (repost)"] },
    { label: "FRI JUL 10", rows: ["11:00a  video 26 - kanye-bully-vs-graduation", "12:30p  carousel 54 - tha-doggfather-platinum-no-check", "2:00p  react to 25 - kanye-ai-vocals-james-blake", "3:30p  carousel 54 (repost)"] },
    { label: "SAT JUL 11", rows: ["10:00a  video 27 - publishing-mase-bad-boy", "11:30a  carousel 58 - dmx-100m-for-def-jam-under-15-percent", "1:00p  react to 26 - kanye-bully-vs-graduation", "2:30p  carousel 58 (repost)"] },
    { label: "SUN JUL 12", rows: ["11:30a  video 28 - drake-leaves-umg-catalog", "1:00p  carousel 61 - aaliyah-locked-off-streaming-20-years", "2:30p  react to 27 - publishing-mase-bad-boy", "4:00p  carousel 61 (repost)"] },
  ]},
  { file: "week-7-jul-16-to-19.jpg", title: "WEEK 7 - JUL 16 TO 19", days: [
    { label: "THU JUL 16", rows: ["10:30a  video 29 - drake-advance-vs-50k-fans", "12:00p  carousel 64 - tech-n9ne-2m-albums-no-major", "1:30p  react to 28 - drake-leaves-umg-catalog", "3:00p  carousel 64 (repost)"] },
    { label: "FRI JUL 17", rows: ["11:00a  video 31 - j-cole-cds-out-of-trunk", "12:30p  carousel 67 - bad-bunny-biggest-streamer-no-major", "2:00p  react to 29 - drake-advance-vs-50k-fans", "3:30p  carousel 67 (repost)"] },
    { label: "SAT JUL 18", rows: ["10:00a  video 33 - advance-trinidad-james", "11:30a  carousel 70 - burna-boy-kept-his-own-label", "1:00p  react to 31 - j-cole-cds-out-of-trunk", "2:30p  carousel 70 (repost)"] },
    { label: "SUN JUL 19", rows: ["11:30a  video 34 - big-sean-missing-millions", "1:00p  carousel 73 - lauryn-hill-one-album-still-owned-by-sony", "2:30p  react to 33 - advance-trinidad-james", "4:00p  carousel 73 (repost)"] },
  ]},
  { file: "week-8-jul-23-to-24.jpg", title: "WEEK 8 - JUL 23 TO 24 (LAST)", days: [
    { label: "THU JUL 23", rows: ["10:30a  video 35 - teyana-taylor-retired", "12:00p  carousel 76 - beyonce-parkwood-her-own-company", "1:30p  react to 34 - big-sean-missing-millions", "3:00p  carousel 76 (repost)"] },
    { label: "FRI JUL 24", rows: ["11:00a  video 38 - lil-uzi-quitting-music", "12:30p  carousel 79 - young-thug-900-days-catalog-on-pause", "2:00p  react to 35 - teyana-taylor-retired", "3:30p  carousel 79 (repost)"] },
  ]},
];

function buildPrompt(week) {
  const dayBlocks = week.days.map((d) => {
    const rows = d.rows.map((r) => `"${r}"`).join("; ");
    return `Day label "${d.label}" with rows: ${rows}.`;
  }).join("\n");
  return `A hand-drawn WEEKLY posting checklist on a pure white page, drawn entirely with a bold black sharpie marker. At the very top, a large hand-printed header in capital letters, underlined: "${week.title}". Below, the day-groups stacked vertically, each introduced by a small bold underlined hand-printed day label, followed by its posting rows.\n\n${dayBlocks}\n\n${ROW_INTRO}`;
}

if (!fs.existsSync(OUTPUT_BASE)) fs.mkdirSync(OUTPUT_BASE, { recursive: true });
const styleRefParts = STYLE_REFS.map((f) => ({ inlineData: { mimeType: "image/png", data: fs.readFileSync(path.join(REFS_DIR, f)).toString("base64") } }));

console.log(`Generating ${WEEKS.length} week cards`);
let success = 0, fail = 0; const failed = [];

for (let i = 0; i < WEEKS.length; i++) {
  const week = WEEKS[i];
  const outPath = path.join(OUTPUT_BASE, week.file);
  if (fs.existsSync(outPath)) { console.log(`[${i + 1}/${WEEKS.length}] ${week.file} SKIP (exists)`); success++; continue; }
  console.log(`\n[${i + 1}/${WEEKS.length}] ${week.file} — ${week.title}`);
  const parts = [{ text: STYLE_INSTRUCTION }, ...styleRefParts, { text: buildPrompt(week) }];
  try {
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
    if (!imageData) { console.error("  FAIL: no image"); fail++; failed.push(week.file); }
    else {
      fs.writeFileSync(outPath, Buffer.from(imageData, "base64"));
      await flattenWhiteBackground(outPath);
      console.log(`  OK ${week.file}`);
      success++;
    }
  } catch (err) { console.error(`  ERROR: ${err.message}`); fail++; failed.push(week.file); }
  if (i < WEEKS.length - 1) await new Promise((r) => setTimeout(r, 8000));
}
console.log(`\n=== DONE ===\nSuccess: ${success}/${WEEKS.length}\nFailed: ${fail}`);
if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
