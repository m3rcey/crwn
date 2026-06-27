// Regenerate specific slide(s) of ONE carousel from its prompts.md.
// Usage: node regen-slide.mjs "<folder name under Carousel Posts>" "1,4"   (slides optional = all)
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ensurePersonRefs, buildPersonRefParts, PERSON_REF_INSTRUCTION } from "./fetch-person-ref.mjs";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const BASE = "/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts";
const REF_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";
const CRWN_LOGO = path.join(REF_DIR, "crwn-logo.png");
const WHITE = 200;

const folderArg = process.argv[2];
if (!folderArg) { console.error("Usage: node regen-slide.mjs '<folder>' '1,4'"); process.exit(1); }
const folder = path.isAbsolute(folderArg) ? folderArg : path.join(BASE, folderArg);
const only = process.argv[3] ? process.argv[3].split(",").map(Number) : null;

const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and stick figures, high contrast black on white, no gray tones, no background texture, no paper edges, no shadows. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL: every single word on the page must be hand-drawn sharpie handwriting. Never render any text in a typeset/printed/digital font like Arial Black, Impact, or Helvetica Bold, no matter how large or bold the text is. Even the biggest headline words must look hand-written by a marker, with slightly imperfect strokes, not typed. IMPORTANT: The reference images convey drawing STYLE ONLY (line weight, lettering, hand-drawn icon look), not content. Do NOT copy any text, words, logos, crowns, brand marks, or taglines from the reference images. Never draw the word 'CRWN', a crown symbol or logo, or phrases like 'every dollar goes straight to the artist' or 'no middleman' unless the slide prompt explicitly asks for them. Draw ONLY the exact words and marks specified in the slide prompt, and nothing else. The output must be a perfect square 1:1 aspect ratio with pure white #FFFFFF filling all negative space.";

function loadRef(f) {
  return { inlineData: { mimeType: f.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg", data: fs.readFileSync(f).toString("base64") } };
}
async function flattenWhite(fp) {
  const { data, info } = await sharp(fp).raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  for (let i = 0; i < data.length; i += c) {
    if (data[i] >= WHITE && data[i+1] >= WHITE && data[i+2] >= WHITE) { data[i]=255; data[i+1]=255; data[i+2]=255; }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: c } }).png().toFile(fp);
}

const promptsPath = path.join(folder, "prompts.md");
const text = fs.readFileSync(promptsPath, "utf8");
const artistMatch = text.match(/Primary artist:\s*([a-z0-9-]+)/i);
const artistSlug = artistMatch && artistMatch[1] !== "none" ? artistMatch[1] : null;
const sections = text.split(/^## SLIDE /m).slice(1);
const slides = sections.map((s, i) => {
  const m = s.match(/PROMPT:\s*"([\s\S]*?)"\s*(?:\n---|\n## |$)/);
  if (!m) throw new Error(`parse fail slide ${i+1}`);
  return { number: i+1, prompt: m[1].trim() };
}).filter(s => !only || only.includes(s.number));

const styleRefParts = fs.readdirSync(REF_DIR).filter(f => /\.(png|jpg|jpeg)$/i.test(f)).filter(f => f !== "crwn-logo.png").map(f => loadRef(path.join(REF_DIR, f)));

let personRefParts = [];
if (artistSlug) {
  try { personRefParts = buildPersonRefParts(await ensurePersonRefs([artistSlug])); }
  catch (e) { console.warn(`person ref fail: ${e.message}`); }
}

for (const slide of slides) {
  const outPath = path.join(folder, `slide-${String(slide.number).padStart(2,"0")}.png`);
  const refParts = [...styleRefParts];
  if (/CRWN|crwn logo/.test(slide.prompt)) refParts.push(loadRef(CRWN_LOGO));
  const parts = [...refParts, { text: STYLE_INSTRUCTION }];
  if (slide.number === 1 && personRefParts.length) { parts.push({ text: PERSON_REF_INSTRUCTION }, ...personRefParts); }
  parts.push({ text: slide.prompt });
  console.log(`Generating ${path.basename(folder)} slide ${slide.number} ...`);
  try {
    const resp = await ai.models.generateContent({ model: "gemini-3.1-flash-image-preview", contents: [{ role: "user", parts }], config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } } });
    let img = null;
    for (const c of resp.candidates || []) for (const p of c.content?.parts || []) if (p.inlineData?.data) { img = p.inlineData.data; break; }
    if (!img) { console.error(`  FAIL: no image`); continue; }
    fs.writeFileSync(outPath, Buffer.from(img, "base64"));
    try { await flattenWhite(outPath); } catch (e) { console.warn(`  flatten fail: ${e.message}`); }
    console.log(`  OK ${outPath}`);
  } catch (e) { console.error(`  ERROR: ${e.message}`); }
  await new Promise(r => setTimeout(r, 8000));
}
console.log("Done.");
