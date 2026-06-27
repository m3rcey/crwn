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

const OUTPUT_BASE = "/mnt/c/Users/Merce/Dropbox/nano banana output";
const REFS_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";
const OUT_PATH = path.join(OUTPUT_BASE, "how-crwn-works-features.jpg");

const STYLE_REFS = [
  "openart-image_1775581308623_d7e64984_1775581308661_33c1d1ba.png",
  "openart-image_1775598089791_eaae2824_1775598089858_cade8739.png",
  "openart-image_1775598227341_c79110c0_1775598227430_39e71232.png",
  "openart-image_1775598237169_2475a432_1775598237207_c74fc3ec.png",
];

const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and diagrams, high contrast black on white, no gray tones, no background texture. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL BACKGROUND RULE: The background must be PURE WHITE (#FFFFFF), absolutely flat, edge to edge. NO off-white, cream, eggshell, beige, or warm paper tones. NO desk, table, notebook, binding, or surface visible underneath. NO shadows under the page, NO page curl, NO page edges, NO paper texture or grain. The entire frame IS the paper. This is a flat editorial scan, not a photograph of a sheet on a desk. Pure #FFFFFF pixels fill every edge of the frame. CRITICAL FONT RULE: ALL text in the image must be hand-drawn sharpie marker handwriting. NEVER use any printed, typeset, computer, Arial, Helvetica, serif, or sans-serif font anywhere in the image. Every single letter, number, word, label, header, list item, and footer must look hand-written with a sharpie. No typography, no mixed fonts, no computer-generated text anywhere. CRITICAL HEADLINE RULE: the single most common failure is the LARGEST headline text at the top of the page rendering as a clean printed, bold, or display font. The big headline MUST be thick, slightly uneven, hand-drawn sharpie capital lettering, exactly as if a person wrote it fast with a marker, with imperfect baselines and varying stroke widths. NEVER render the headline (or any text at any size) as a typeset, bold, or display font. MARKER FILL TEXTURE: any solid black or filled-in area must look HAND-FILLED with a real sharpie marker, NOT a flat digital fill: visible directional marker strokes, slightly uneven coverage, faint lighter streaks, tiny flecks of white paper showing through, slightly ragged edges. The streaky texture lives INSIDE the black fills only; the page background stays pure flat white (#FFFFFF) and thin line work stays clean and bold. The reference images convey drawing STYLE ONLY, not content. Do NOT copy any text, words, logos, crowns, brand marks, or taglines from the reference images. Never draw the word 'CRWN' as a logo, a crown symbol, or marketing taglines from the references. Draw ONLY what the prompt specifies.";

const PROMPT = `Flat scan of a white sheet of paper filling the entire frame. No desk, no surface, no edges visible, just white paper. Black sharpie marker handwriting and clean hand-drawn icons. A tidy one-page feature map of a music platform, organized in three labeled rows with a central phone hub and a payout bar at the bottom. Clear hierarchy, evenly spaced, not cramped.

At the very top, a large hand-lettered black sharpie headline in capitals (thick uneven hand-drawn marker strokes, NOT a printed or display font), double-underlined: "HOW CRWN WORKS".
A small hand-written subline under it: "everything you can do from one page".

In the upper center, a hand-drawn smartphone icon labeled "YOUR PAGE" showing a tiny artist portrait and three little stacked subscription tier bars with dollar signs. Short arrows radiate outward from the phone toward the feature groups.

ROW 1 header underlined: "MAKE MONEY". Four small icon+label tiles in a row:
- a dollar badge with stacked bars labeled "SUBSCRIPTIONS"
- a vinyl record / music note labeled "TRACKS & ALBUMS"
- a box / package labeled "PRODUCTS & BUNDLES"
- a calendar with a dollar sign labeled "PAID BOOKINGS"

ROW 2 header underlined: "CONNECT & GROW". Four small icon+label tiles in a row:
- a broadcast / live video camera labeled "LIVESTREAMS"
- a speech bubble labeled "DIRECT MESSAGES"
- a pair of scissors with share arrows labeled "SHARE-TO-EARN"
- two little figures with a dollar sign between them labeled "FAN REFERRALS"

ROW 3 header underlined: "RUN IT". Three small icon+label tiles in a row:
- an envelope next to a phone labeled "EMAIL + TEXT BLASTS"
- a chain link labeled "SMART LINK PAGE"
- a bar chart labeled "ANALYTICS"

At the very bottom, a wide hand-drawn box spanning the full width, a left-to-right flow with arrows: "FANS PAY" then arrow to a circled "YOU KEEP 88-92%" then arrow to "PAID WEEKLY TO YOUR BANK". Underline "PAID WEEKLY".

Keep every icon simple and clearly labeled in hand-drawn capitals, plenty of white space between tiles so nothing overlaps.

The background is pure white (#FFFFFF). The image is shot perfectly straight on, no angle, no shadow, no background elements. Pure white paper fills the entire 3:4 frame edge to edge.`;

const styleRefParts = STYLE_REFS.map((f) => ({
  inlineData: { mimeType: "image/png", data: fs.readFileSync(path.join(REFS_DIR, f)).toString("base64") },
}));

console.log("Generating features overview image...");
console.log(`Output: ${OUT_PATH}`);

try {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ role: "user", parts: [{ text: STYLE_INSTRUCTION }, ...styleRefParts, { text: PROMPT }] }],
    config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } },
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
  try {
    const flipped = await flattenWhiteBackground(OUT_PATH);
    console.log(`OK ${path.basename(OUT_PATH)} (white-flattened ${flipped.toLocaleString()} px)`);
  } catch (err) {
    console.warn(`saved but white-flatten failed: ${err.message}`);
  }
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
