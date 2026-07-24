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

const OUT_PATH = "public/tool-royalty-readiness.jpg";

// Royalty Readiness is about the UNGLAMOROUS side: paperwork, registrations, the
// admin nobody does. So the frame is a desk at 2am, not a stage. The mic is present
// but pushed aside and unlit, because this is the part of the career that has nothing
// to do with making the music and everything to do with getting paid for it.
const PROMPT = `A cinematic, photorealistic editorial photograph. Near-black charcoal room, background color #0D0D0D, with a single warm gold light, color #D4AF37, as the only light source. Deep shadows, rich blacks, film grain, shallow depth of field, shot on a 35mm lens at wide aperture.

A young Black (African American) hip hop and R&B artist, clearly aged between 18 and 32 years old, youthful face, sitting alone at a desk very late at night in a dim home studio. He is leaning over a spread of printed paperwork and documents on the desk, one hand flat on the pages, studying them with a serious, focused, slightly weary expression. He is lit only by a single warm gold desk lamp that pools light across the papers and rim-lights one side of his face and shoulder.

A studio microphone on a boom arm sits pushed aside at the edge of the frame, unlit and out of focus. The rest of the room falls away into near-black darkness, studio gear barely suggested in the shadows.

The mood is quiet, expensive and unglamorous: the paperwork side of a music career, the part nobody posts about, done alone at 2am. No text, no words, no letters, no readable writing on the documents, no logos, no watermarks anywhere in the image. Photographic only, not an illustration.`;

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
