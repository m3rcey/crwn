// Hero for the re-promoted Live Experience calculator (founder decision 2026-08-16).
//
// Same brand rule as the other six tool heroes (CLAUDE.md "Brand Imagery"): flat vector poster,
// the exact five-colour palette, anyone shown is a Black hip hop / R&B artist reading 18 to 32
// with gender NAMED in the prompt, WebP never JPEG, 16:9 to match the ToolHero slot (the existing
// heroes are 1376x768). Look at the output before shipping it, and the toolPositioning edge check
// will reject a baked-in white frame either way.
//
// A WOMAN on purpose: the hero set skews male and the brand ratio (65/35) is counted across the
// set, not per image.
//
// Run: bash -c 'source ./load-env.sh; node generate-live-experience-hero.mjs'

import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import sharp from "sharp";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const OUT_PATH = "public/hero-live-experience.webp";

const STYLE = `Flat vector poster illustration, screen-print aesthetic. Bold geometric shapes and hard-edged flat colour blocks with crisp vector edges. ABSOLUTELY NO gradients, no photographic texture, no realism, no soft shading, no 3D rendering, no drop shadows. The figure is rendered as a strong near-black silhouette with a few sculpted flat highlight planes picking out the face and shoulders. Bold radiating sunburst rays, concentric arcs and repeating dot rows fan out behind the subject as graphic background geometry. STRICT LIMITED PALETTE, only these five: near-black #0D0D0D, deep charcoal #1A1A1A, warm gold #D4AF37, amber #E8A33D, burnt orange #C2571A. The background is predominantly near-black #0D0D0D. High contrast, confident, premium, editorial poster art. NO text, NO letters, NO numbers, NO words, NO logos, NO watermarks anywhere in the image. WIDE CINEMATIC HORIZONTAL COMPOSITION filling a letterbox banner, the subject complete and comfortably inside the frame with room to the left and right, nothing cropped at the top or bottom edge. The artwork runs fully to every edge of the frame with NO border, NO frame and NO margin of any kind.`;

// The thesis of the tool: the show itself is the product, and a room of fans PAID to be in it.
// Distinct from platform-first-yes (ONE filled seat = the first member): here the arc of seats is
// mostly FILLED, because a ticketed live is many small yeses at once.
const SCENE = `a Black African American woman, a hip hop and R&B artist, who clearly reads as young, age 18 to 32, with braids and a youthful face, NOT middle-aged, shown in near-black silhouette from the waist up at the right of the wide banner, mid-performance, singing into a hard-edged flat vector microphone with one arm lifted. A single hard-edged cone of warm gold stage light falls on her from the upper right. Sweeping across the left two thirds of the frame is a wide arc of roughly twenty flat circles arranged like rows of seats facing her: most of them are filled brilliant warm gold and amber, a few nearest the edge still dim deep charcoal, so the room reads as almost full. Gold sunburst rays radiate from behind her, and repeating gold dot rows run along the seat arc toward the stage.`;

console.log(`Generating ${OUT_PATH}...`);

const response = await ai.models.generateContent({
  model: "gemini-3.1-flash-image-preview",
  contents: [{ role: "user", parts: [{ text: `${STYLE}\n\n${SCENE}` }] }],
  config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
});

let imageData = null;
for (const cand of response.candidates || []) {
  for (const p of cand.content?.parts || []) {
    if (p.inlineData?.data) { imageData = p.inlineData.data; break; }
  }
  if (imageData) break;
}

if (!imageData) { console.error("FAIL: no image in response"); process.exit(1); }
await sharp(Buffer.from(imageData, "base64")).webp({ quality: 82 }).toFile(OUT_PATH);
const meta = await sharp(OUT_PATH).metadata();
console.log(`OK ${OUT_PATH} (${fs.statSync(OUT_PATH).size.toLocaleString()} bytes, ${meta.width}x${meta.height})`);
