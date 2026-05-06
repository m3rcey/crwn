import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }

const ai = new GoogleGenAI({ apiKey: API_KEY });

const INPUT_FILE = "/home/merce/.openclaw/workspace-crwn/videos/nano-prompts/CAN_500_FANS_MAKE_100K_NANO_BANANA_PROMPTS.md";
const OUTPUT_DIR = "/mnt/c/Users/Merce/Dropbox/nano banana output/CAN_500_FANS_MAKE_100K";
const REFS_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";
const DELAY_MS = 8000;

const STYLE_REFS = [
  "openart-image_1775581308623_d7e64984_1775581308661_33c1d1ba.png",
  "openart-image_1775598089791_eaae2824_1775598089858_cade8739.png",
  "openart-image_1775598227341_c79110c0_1775598227430_39e71232.png",
  "openart-image_1775598237169_2475a432_1775598237207_c74fc3ec.png",
];

const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and diagrams, high contrast black on white, no gray tones, no background texture. Match the lettering weight, spacing, and hand-drawn aesthetic exactly.";

const CRWN_LOGO_INSTRUCTION = "When the CRWN logo is referenced, reproduce it EXACTLY as shown in the attached crwn-logo.png reference: a geometric angular crown with three sharp pointed spires, diamond-shaped facets, and a flat base band. Do not draw a generic rounded cartoon crown.";

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const styleRefParts = STYLE_REFS.map(f => ({
  inlineData: { mimeType: "image/png", data: fs.readFileSync(path.join(REFS_DIR, f)).toString("base64") }
}));

const crwnLogoPart = {
  inlineData: { mimeType: "image/png", data: fs.readFileSync(path.join(REFS_DIR, "crwn-logo.png")).toString("base64") }
};

// Parse prompts from markdown file
const content = fs.readFileSync(INPUT_FILE, "utf-8");
const lines = content.split("\n");
const prompts = [];
let i = 0;
while (i < lines.length) {
  const m = lines[i].match(/^(\d+)\.\s+SENTENCE:/);
  if (m) {
    const num = parseInt(m[1]);
    // Find the NANO BANANA PRO PROMPT line
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith("NANO BANANA PRO PROMPT:")) j++;
    if (j < lines.length) {
      // Extract the prompt content (starts after "NANO BANANA PRO PROMPT: \"" and ends at closing quote)
      const line = lines[j];
      const startIdx = line.indexOf('"');
      if (startIdx !== -1) {
        let promptText = line.slice(startIdx + 1);
        // Handle multi-line prompts (unlikely here but safe)
        let k = j;
        while (!promptText.endsWith('"') && k < lines.length - 1) {
          k++;
          promptText += "\n" + lines[k];
        }
        if (promptText.endsWith('"')) promptText = promptText.slice(0, -1);
        prompts.push({ number: num, prompt: promptText });
      }
    }
    i = j + 1;
  } else {
    i++;
  }
}

console.log(`Parsed ${prompts.length} prompts`);
console.log(`Output dir: ${OUTPUT_DIR}`);
console.log(`Style refs loaded: ${styleRefParts.length}`);

if (prompts.length === 0) { console.error("No prompts parsed."); process.exit(1); }

let success = 0, fail = 0;
const failed = [];

for (let idx = 0; idx < prompts.length; idx++) {
  const { number, prompt } = prompts[idx];
  const fileName = `${String(number).padStart(3, "0")}.jpg`;
  const outPath = path.join(OUTPUT_DIR, fileName);

  if (fs.existsSync(outPath)) {
    console.log(`[${idx + 1}/${prompts.length}] #${number} SKIP (exists)`);
    success++;
    continue;
  }

  const needsCrwn = /CRWN|thecrwn\.app|crown logo/i.test(prompt);

  const parts = [{ text: STYLE_INSTRUCTION }, ...styleRefParts];
  if (needsCrwn) {
    parts.push({ text: CRWN_LOGO_INSTRUCTION });
    parts.push(crwnLogoPart);
  }
  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
    });

    let imageData = null;
    for (const cand of response.candidates || []) {
      for (const p of cand.content?.parts || []) {
        if (p.inlineData?.data) { imageData = p.inlineData.data; break; }
      }
      if (imageData) break;
    }

    if (!imageData) {
      console.error(`[${idx + 1}/${prompts.length}] #${number} FAIL: no image in response`);
      fail++;
      failed.push(number);
    } else {
      fs.writeFileSync(outPath, Buffer.from(imageData, "base64"));
      console.log(`[${idx + 1}/${prompts.length}] #${number} OK${needsCrwn ? " (+crwn)" : ""}`);
      success++;
    }
  } catch (err) {
    console.error(`[${idx + 1}/${prompts.length}] #${number} ERROR: ${err.message}`);
    fail++;
    failed.push(number);
  }

  if (idx < prompts.length - 1) {
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

console.log(`\n=== DONE ===`);
console.log(`Success: ${success}/${prompts.length}`);
console.log(`Failed: ${fail}/${prompts.length}`);
if (failed.length) console.log(`Failed prompt numbers: ${failed.join(", ")}`);
