import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

// Batch carousel slide generator: loops over a list of carousel folders under
// the Carousel Posts base, reads each folder's prompts.md, and renders the 5
// square slides. Mirrors generate-carousel.mjs (style refs only, no person
// refs), but iterates many folders and skips slides that already exist.

const BASE = "/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts";
const REF_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";
const DELAY_MS = 6000;

const FOLDERS = [
  "135-jay-z-roc-nation-many-income-streams",
  "136-jay-z-samsung-paid-before-the-drop",
  "137-jay-z-ace-of-spades-own-equity",
  "138-jay-z-you-are-the-business",
];

const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and stick figures, high contrast black on white, no gray tones, no background texture, no paper edges, no shadows. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL: every single word on the page must be hand-drawn sharpie handwriting. Never render any text in a typeset/printed/digital font like Arial Black, Impact, or Helvetica Bold, no matter how large or bold the text is. Even the biggest headline words must look hand-written by a marker, with slightly imperfect strokes, not typed. IMPORTANT: The reference images convey drawing STYLE ONLY (line weight, lettering, hand-drawn icon look), not content. Do NOT copy any text, words, logos, crowns, brand marks, or taglines from the reference images. Never draw the word 'CRWN', a crown symbol or logo, or phrases like 'every dollar goes straight to the artist' or 'no middleman' unless the slide prompt explicitly asks for them. Draw ONLY the exact words and marks specified in the slide prompt, and nothing else. The output must be a perfect square 1:1 aspect ratio with pure white #FFFFFF filling all negative space.";

function parsePrompts(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const sections = text.split(/^## SLIDE /m).slice(1);
  return sections.map((section, idx) => {
    const match = section.match(/PROMPT:\s*"([\s\S]*?)"\s*(?:\n---|\n## |$)/);
    if (!match) throw new Error(`Could not parse PROMPT in slide ${idx + 1}`);
    return { number: idx + 1, prompt: match[1].trim() };
  });
}

function loadRef(file) {
  return {
    inlineData: {
      mimeType: file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      data: fs.readFileSync(file).toString("base64"),
    },
  };
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const styleRefs = fs.readdirSync(REF_DIR)
  .filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
  .filter((f) => f !== "crwn-logo.png")
  .map((f) => loadRef(path.join(REF_DIR, f)));

let ok = 0, skip = 0, fail = 0;
const failed = [];

for (const folder of FOLDERS) {
  const dir = path.join(BASE, folder);
  const promptsFile = path.join(dir, "prompts.md");
  if (!fs.existsSync(promptsFile)) { console.error(`[${folder}] no prompts.md`); continue; }
  let slides;
  try { slides = parsePrompts(promptsFile); }
  catch (e) { console.error(`[${folder}] parse error: ${e.message}`); continue; }

  console.log(`\n=== ${folder} (${slides.length} slides) ===`);
  for (const slide of slides) {
    const outPath = path.join(dir, `slide-${String(slide.number).padStart(2, "0")}.png`);
    if (fs.existsSync(outPath)) { console.log(`  slide ${slide.number} SKIP (exists)`); skip++; continue; }
    try {
      const parts = [...styleRefs, { text: STYLE_INSTRUCTION }, { text: slide.prompt }];
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: "user", parts }],
        config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
      });
      let data = null;
      for (const cand of response.candidates || []) {
        for (const p of cand.content?.parts || []) { if (p.inlineData?.data) { data = p.inlineData.data; break; } }
        if (data) break;
      }
      if (!data) { console.error(`  slide ${slide.number} FAIL: no image`); fail++; failed.push(`${folder}#${slide.number}`); }
      else { fs.writeFileSync(outPath, Buffer.from(data, "base64")); console.log(`  slide ${slide.number} OK`); ok++; }
    } catch (e) {
      console.error(`  slide ${slide.number} ERROR: ${e.message}`); fail++; failed.push(`${folder}#${slide.number}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}

console.log(`\n=== DONE === ok=${ok} skip=${skip} fail=${fail}`);
if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
