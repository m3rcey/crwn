import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import {
  ensurePersonRefs,
  buildPersonRefParts,
  PERSON_REF_INSTRUCTION,
} from "./fetch-person-ref.mjs";

const MANIFEST_FILE = process.argv[2];
if (!MANIFEST_FILE) {
  console.error("Usage: node regen-carousel-slide1.mjs <absolute path to manifest.json>");
  process.exit(1);
}

const REF_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";

const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and stick figures, high contrast black on white, no gray tones, no background texture, no paper edges, no shadows. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL: every single word on the page must be hand-drawn sharpie handwriting. Never render any text in a typeset/printed/digital font like Arial Black, Impact, or Helvetica Bold, no matter how large or bold the text is. Even the biggest headline words must look hand-written by a marker, with slightly imperfect strokes, not typed. IMPORTANT: The reference images convey drawing STYLE ONLY (line weight, lettering, hand-drawn icon look), not content. Do NOT copy any text, words, logos, crowns, brand marks, or taglines from the reference images. Never draw the word 'CRWN', a crown symbol or logo, or phrases like 'every dollar goes straight to the artist' or 'no middleman' unless the slide prompt explicitly asks for them. Draw ONLY the exact words and marks specified in the slide prompt, and nothing else. The output must be a perfect square 1:1 aspect ratio with pure white #FFFFFF filling all negative space.";

function loadRef(file) {
  return {
    inlineData: {
      mimeType: file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      data: fs.readFileSync(file).toString("base64"),
    },
  };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
  const ai = new GoogleGenAI({ apiKey });

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));
  console.log(`Loaded manifest with ${manifest.length} entries`);

  const styleRefs = fs.readdirSync(REF_DIR)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .filter(f => f !== "crwn-logo.png")
    .filter(f => !fs.statSync(path.join(REF_DIR, f)).isDirectory())
    .map(f => path.join(REF_DIR, f));
  console.log(`Loaded ${styleRefs.length} style reference images.`);

  let ok = 0, fail = 0;
  const failures = [];

  for (let i = 0; i < manifest.length; i++) {
    const entry = manifest[i];
    const { folder, personSlugs, prompt } = entry;
    const outDir = `/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts/${folder}`;
    const outPath = path.join(outDir, "slide-01.png");

    console.log(`\n[${i + 1}/${manifest.length}] ${folder} (people: ${personSlugs.join(", ")})`);

    const personRefs = await ensurePersonRefs(personSlugs);
    const personRefParts = buildPersonRefParts(personRefs);
    if (!personRefParts.length) {
      console.warn(`  WARN: no person refs loaded, skipping`);
      fail++;
      failures.push(folder);
      continue;
    }

    const refParts = styleRefs.map(loadRef);
    const parts = [
      ...refParts,
      { text: STYLE_INSTRUCTION },
      { text: PERSON_REF_INSTRUCTION },
      ...personRefParts,
      { text: prompt },
    ];

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["image", "text"] },
      });
      let saved = false;
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, "base64"));
          console.log(`  Saved: ${outPath}`);
          ok++;
          saved = true;
          break;
        }
      }
      if (!saved) {
        console.error(`  No image returned`);
        fail++;
        failures.push(folder);
      }
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
      fail++;
      failures.push(folder);
    }

    if (i < manifest.length - 1) {
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  console.log(`\nDone. Success: ${ok}, Failed: ${fail}`);
  if (failures.length) console.log(`Failed: ${failures.join(", ")}`);
  process.exit(fail > 0 ? 2 : 0);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
