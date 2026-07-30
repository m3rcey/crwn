// Bespoke hero photo for a lead-magnet tool page.
// Cinematic charcoal + gold, per the CLAUDE.md brand-photo rule: anyone shown is a
// Black hip hop / R&B artist who reads as age 18 to 32, stated explicitly in the
// prompt or the model drifts middle-aged. Look at the output before shipping it.
//
// Run: bash -c 'source ./load-env.sh; node generate-tool-hero.mjs'

import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const OUT_PATH = "public/tool-opportunity.jpg";

// The all-in-one Opportunity Calculator is about finally seeing the WHOLE business as
// one picture instead of five scattered numbers. So the frame is an artist in front of
// a planning wall where everything connects: the moment the pieces become one plan.
const PROMPT = `A cinematic, photorealistic editorial photograph. Near-black charcoal room, background color #0D0D0D, with a single warm gold light, color #D4AF37, as the only light source. Deep shadows, rich blacks, film grain, shallow depth of field, shot on a 35mm lens at wide aperture.

A young Black (African American) hip hop and R&B artist, clearly aged between 18 and 32 years old, youthful face, standing alone at night in a dim studio, seen in three-quarter view from behind his shoulder. He is facing a large dark planning wall covered with pinned photographs, papers and small cards, all connected by strands of fine gold thread that converge toward one central point on the wall. One hand is raised, about to touch that central point. His expression, caught in profile, is calm and certain: the moment scattered pieces finally read as one plan.

A single warm gold light rakes across the wall from the side, catching the threads so they glow, and rim-lights the edge of his face, shoulder and hand. The rest of the room falls away into near-black darkness, studio gear barely suggested in the shadows.

The mood is quiet, focused and expensive: one person seeing their whole business clearly for the first time. No text, no words, no letters, no readable writing on the papers or cards, no logos, no watermarks anywhere in the image. Photographic only, not an illustration.`;

console.log(`Generating ${OUT_PATH}...`);

try {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ role: "user", parts: [{ text: PROMPT }] }],
    config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:3" } },
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
  console.log(`OK ${OUT_PATH} (${fs.statSync(OUT_PATH).size.toLocaleString()} bytes)`);
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
