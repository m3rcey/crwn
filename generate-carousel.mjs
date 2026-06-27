import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import {
  findMentionedSlugs,
  ensurePersonRefs,
  buildPersonRefParts,
  PERSON_REF_INSTRUCTION,
} from "./fetch-person-ref.mjs";

const BASE = "/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts";
const FOLDERS = ["release-waterfall", "clipper-share-ramp", "first-7-days-on-crwn"];
const REF_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";
const CRWN_LOGO = path.join(REF_DIR, "crwn-logo.png");

const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and stick figures, high contrast black on white, no gray tones, no background texture, no paper edges, no shadows. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL: every single word on the page must be hand-drawn sharpie handwriting. Never render any text in a typeset/printed/digital font like Arial Black, Impact, or Helvetica Bold, no matter how large or bold the text is. Even the biggest headline words must look hand-written by a marker, with slightly imperfect strokes, not typed. IMPORTANT: The reference images convey drawing STYLE ONLY (line weight, lettering, hand-drawn icon look), not content. Do NOT copy any text, words, logos, crowns, brand marks, or taglines from the reference images. Never draw the word 'CRWN', a crown symbol or logo, or phrases like 'every dollar goes straight to the artist' or 'no middleman' unless the slide prompt explicitly asks for them. Draw ONLY the exact words and marks specified in the slide prompt, and nothing else. The output must be a perfect square 1:1 aspect ratio with pure white #FFFFFF filling all negative space.";

function parsePrompts(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const sections = text.split(/^## SLIDE /m).slice(1);
  return sections.map((section, idx) => {
    const match = section.match(/PROMPT:\s*"([\s\S]*?)"\s*(?:\n---|\n## |$)/);
    if (!match) throw new Error(`Could not parse PROMPT in slide ${idx + 1} of ${filePath}`);
    return { number: idx + 1, prompt: match[1].trim() };
  });
}
function loadRef(file) {
  return { inlineData: { mimeType: file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg", data: fs.readFileSync(file).toString("base64") } };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
  const ai = new GoogleGenAI({ apiKey });

  const styleRefs = fs.readdirSync(REF_DIR).filter(f => /\.(png|jpg|jpeg)$/i.test(f)).filter(f => f !== "crwn-logo.png").map(f => path.join(REF_DIR, f));

  let totalOk = 0, totalFail = 0; const failures = [];
  for (const folder of FOLDERS) {
    const outDir = path.join(BASE, folder);
    const slides = parsePrompts(path.join(outDir, "prompts.md"));
    console.log(`\n=== ${folder} (${slides.length} slides) ===`);
    for (const slide of slides) {
      const outName = `slide-${String(slide.number).padStart(2, "0")}.png`;
      const outPath = path.join(outDir, outName);
      const refParts = styleRefs.map(loadRef);
      if (/CRWN|crwn logo/.test(slide.prompt)) refParts.push(loadRef(CRWN_LOGO));
      let personInstruction = null;
      try {
        const slugs = findMentionedSlugs(slide.prompt);
        if (slugs.length) {
          const refs = await ensurePersonRefs(slugs);
          const pParts = buildPersonRefParts(refs);
          if (pParts.length) { refParts.push(...pParts); personInstruction = PERSON_REF_INSTRUCTION; console.log(`  slide ${slide.number}: person refs -> ${refs.map(r => r.slug).join(", ")}`); }
        }
      } catch (e) { console.error(`  slide ${slide.number}: person ref failed (${e.message}); proceeding without`); }
      const parts = [...refParts, { text: STYLE_INSTRUCTION }];
      if (personInstruction) parts.push({ text: personInstruction });
      parts.push({ text: slide.prompt });
      try {
        const response = await ai.models.generateContent({ model: "gemini-3.1-flash-image-preview", contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["image", "text"] } });
        let saved = false;
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) { fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, "base64")); console.log(`  saved ${outName}`); totalOk++; saved = true; break; }
        }
        if (!saved) { totalFail++; failures.push(`${folder}/${slide.number}`); console.error(`  no image for ${folder} slide ${slide.number}`); }
      } catch (e) { totalFail++; failures.push(`${folder}/${slide.number}`); console.error(`  FAILED ${folder} slide ${slide.number}: ${e.message}`); }
      await new Promise(r => setTimeout(r, 8000));
    }
  }
  console.log(`\nDone. Success: ${totalOk}, Failed: ${totalFail}`);
  if (failures.length) console.log(`Failed: ${failures.join(", ")}`);
}
main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
