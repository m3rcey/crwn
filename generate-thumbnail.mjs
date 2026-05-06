import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const REF_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references/thumbnails";
const OUTPUT_DIR = "/mnt/c/Users/Merce/Dropbox/nano banana output/thumbnails";
const OUTPUT_FILE = "thumbnail-can-500-fans-make-you-100k.jpg";

const THUMBNAIL_TEXT = `YES.`;
const EXPRESSION = `smug and confident: a slight smirk on one side of the mouth, calm relaxed eyes, with one eyebrow raised slightly higher than the other (like a knowing "told you so" look). NOT smiling fully, NOT laughing, just quietly confident.`;
const VIDEO_TITLE = `CAN 500 FANS MAKE YOU $100K?`;

const STYLE_INSTRUCTION = "Match the exact visual style of these reference thumbnails: pure white background, bold black sharpie marker strokes, a round stick-figure head on the right with a small gold crown on top (partially cropped at the top edge), big bold handwritten text on the left filling as much space as possible without touching the face. 16:9 aspect ratio. No gray tones, no paper texture, no shadows, no background elements. High contrast black on white with only the crown in gold/yellow.";

const PROMPT = `Generate a YouTube thumbnail in the exact style of the reference images. 16:9 aspect ratio, pure white background.

On the RIGHT side: a round stick-figure head drawn in bold black sharpie with two circular eyes (solid black dot pupils) and a small gold/yellow crown on top that is partially cropped at the top edge of the frame. The face's expression must be: ${EXPRESSION}.

On the LEFT side: the text "${THUMBNAIL_TEXT}" written in HUGE bold hand-drawn sharpie letters, filling almost the entire left 60-70% of the frame. The word "YES" plus the period should be massive, taking up the full vertical height available, as large as possible while leaving clear space between the text and the face. The text must be unmistakably readable at thumbnail scale.

Do NOT include any other elements: no paper edges, no desk, no shadows, no extra icons. Pure white fills all negative space. Match the reference thumbnails' line weight and handwriting style exactly.`;

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
  const ai = new GoogleGenAI({ apiKey });
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const refs = fs.readdirSync(REF_DIR).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
  const refParts = refs.map(f => ({
    inlineData: {
      mimeType: f.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      data: fs.readFileSync(path.join(REF_DIR, f)).toString("base64")
    }
  }));

  let outPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  let i = 2;
  while (fs.existsSync(outPath)) {
    const base = OUTPUT_FILE.replace(/\.jpg$/, "");
    outPath = path.join(OUTPUT_DIR, `${base}-${i}.jpg`);
    i++;
  }

  console.log(`Generating: ${path.basename(outPath)}`);
  console.log(`Expression: ${EXPRESSION}`);
  console.log(`Text: ${THUMBNAIL_TEXT}`);
  console.log(`Style refs loaded: ${refParts.length}`);

  const parts = [...refParts, { text: STYLE_INSTRUCTION }, { text: PROMPT }];
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["image", "text"] }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, "base64"));
      console.log(`Saved: ${outPath}`);
      return;
    }
  }
  console.error("No image returned");
  process.exit(1);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
