// Heroes for the two calculators re-promoted 2026-08-20: Between-Tour and Proof of Demand.
//
// Same brand rule as the other seven tool heroes (CLAUDE.md "Brand Imagery"): flat vector poster,
// the exact five-colour palette, anyone shown is a Black hip hop / R&B artist reading 18 to 32
// with gender NAMED in the prompt, WebP never JPEG, 16:9 to match the ToolHero slot. Look at the
// output before shipping it, and the toolPositioning edge check will reject a baked-in white frame
// either way.
//
// Both figures are MEN on purpose: the seven existing heroes count 4 men / 3 women, and the brand
// ratio (65/35) is counted across the set, not per image. Two men lands the nine at 6/3.
//
// Run: bash -c 'source ./load-env.sh; node generate-repromoted-heroes.mjs'

import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import sharp from "sharp";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const STYLE = `Flat vector poster illustration, screen-print aesthetic. Bold geometric shapes and hard-edged flat colour blocks with crisp vector edges. ABSOLUTELY NO gradients, no photographic texture, no realism, no soft shading, no 3D rendering, no drop shadows. The figure is rendered as a strong near-black silhouette with a few sculpted flat highlight planes picking out the face and shoulders. Bold radiating sunburst rays, concentric arcs and repeating dot rows fan out behind the subject as graphic background geometry. STRICT LIMITED PALETTE, only these five: near-black #0D0D0D, deep charcoal #1A1A1A, warm gold #D4AF37, amber #E8A33D, burnt orange #C2571A. The background is predominantly near-black #0D0D0D. High contrast, confident, premium, editorial poster art. NO text, NO letters, NO numbers, NO words, NO logos, NO watermarks anywhere in the image. WIDE CINEMATIC HORIZONTAL COMPOSITION filling a letterbox banner, the subject complete and comfortably inside the frame with room to the left and right, nothing cropped at the top or bottom edge. The artwork runs fully to every edge of the frame with NO border, NO frame and NO margin of any kind.`;

const JOBS = [
  {
    out: "public/hero-between-tour.webp",
    // The thesis: tour revenue is tall spikes with quiet valleys, and the valleys are refillable.
    // The artist stands with the mic he already owns; a steady amber band bridges every gap.
    scene: `a Black African American man, a hip hop and R&B artist, who clearly reads as young, age 18 to 32, with short hair and a youthful face, NOT middle-aged, shown in near-black silhouette from the waist up at the left of the wide banner, holding a hard-edged flat vector microphone at his side and looking to the right across the frame. Filling the right two thirds of the frame is a bold flat bar chart skyline: a few very tall brilliant warm gold vertical bars spaced far apart like tour-night peaks, with wide low deep charcoal valleys between them, and one continuous horizontal amber band running through all the valleys at a steady height, bridging every gap between the gold peaks. Gold sunburst rays radiate from behind the artist, and repeating gold dot rows run horizontally above the bar skyline.`,
  },
  {
    out: "public/hero-proof-of-demand.webp",
    // The thesis: fans raise their hands BEFORE money is spent. A field of fan circles, most lit
    // gold above a threshold arc, a few still charcoal, the artist reading the proof.
    scene: `a Black African American man, a hip hop and R&B artist, who clearly reads as young, age 18 to 32, with a short fade haircut and a youthful face, NOT middle-aged, shown in near-black silhouette from the chest up at the right of the wide banner, one hand raised to his chin, studying a wall that fills the left two thirds of the frame. On that wall is a rising grid of roughly twenty-four flat circles arranged in rows like fans raising hands: most of the circles are filled brilliant warm gold and amber, a handful in the lowest row still dim deep charcoal, and one bold burnt orange concentric arc sweeps across the grid separating the lit majority above it from the dim few below it, so the wall reads as demand already proven past a threshold. Gold sunburst rays radiate from behind the artist, and repeating gold dot rows frame the top of the grid.`,
  },
];

for (const job of JOBS) {
  console.log(`Generating ${job.out}...`);
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ role: "user", parts: [{ text: `${STYLE}\n\n${job.scene}` }] }],
    config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
  });

  let imageData = null;
  for (const cand of response.candidates || []) {
    for (const p of cand.content?.parts || []) {
      if (p.inlineData?.data) { imageData = p.inlineData.data; break; }
    }
    if (imageData) break;
  }

  if (!imageData) { console.error(`FAIL: no image in response for ${job.out}`); process.exit(1); }
  await sharp(Buffer.from(imageData, "base64")).webp({ quality: 82 }).toFile(job.out);
  const meta = await sharp(job.out).metadata();
  console.log(`OK ${job.out} (${fs.statSync(job.out).size.toLocaleString()} bytes, ${meta.width}x${meta.height})`);
}
