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

const OUT_PATH = "public/tool-live-experience.jpg";

const PROMPT = `A cinematic, photorealistic editorial photograph. Near-black charcoal room, background color #0D0D0D, with a single warm gold key light, color #D4AF37, raking across the subject from one side. Deep shadows, rich blacks, film grain, shallow depth of field, shot on a 50mm lens at wide aperture.

A young Black (African American) hip hop and R&B artist, clearly aged between 18 and 32 years old, youthful face, performing a stripped-down intimate set. He sits on a stool with a microphone on a stand in front of him, mid-performance, eyes closed, caught in a real moment of singing. He is lit only by the warm gold light.

In the near foreground, slightly out of focus, the back of a single camera on a tripod points at him, its small screen glowing faintly. The rest of the room is empty darkness: no audience, no crowd, just the artist and the one camera watching him.

The mood is intimate, expensive, and a little lonely: a show worth paying for that almost nobody is in the room to see. No text, no words, no letters, no logos, no watermarks anywhere in the image. Photographic only, not an illustration.`;

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
