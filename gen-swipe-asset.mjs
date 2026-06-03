import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const REF_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";
const RAW = "/tmp/swipe-raw.png";
const PROC = "/tmp/swipe-proc.png";

const STYLE = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, high contrast black on white, no gray tones, no background texture, no paper edges, no shadows. Every stroke is hand-drawn marker, slightly imperfect, never a typeset/printed/digital font. IMPORTANT: the reference images convey drawing STYLE ONLY. Do NOT copy any words, logos, crowns, brand marks, or taglines from them. Draw ONLY what the prompt specifies and nothing else. Pure white #FFFFFF fills all negative space.";

const PROMPT = `Flat scan of a white sheet of paper filling the entire frame. No desk, no surface, no edges, just white paper. Centered, hand-write the words "SWIPE for More" in bold black sharpie marker handwriting, large and clearly legible, followed by a small hand-drawn right-pointing arrow. The text sits on a single line in the middle of the frame with generous pure white space all around it. No other words, no other marks, no underline, no box. The background is pure white (#FFFFFF). Shot perfectly straight on, no angle, no shadow.`;

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("GEMINI_API_KEY not set"); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const styleRefs = fs.readdirSync(REF_DIR)
  .filter((f) => /\.(png|jpg|jpeg)$/i.test(f) && f !== "crwn-logo.png")
  .map((f) => ({ inlineData: { mimeType: f.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg", data: fs.readFileSync(path.join(REF_DIR, f)).toString("base64") } }));

const res = await ai.models.generateContent({
  model: "gemini-3.1-flash-image-preview",
  contents: [{ role: "user", parts: [...styleRefs, { text: STYLE }, { text: PROMPT }] }],
  config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
});
let data = null;
for (const c of res.candidates || []) for (const p of c.content?.parts || []) if (p.inlineData?.data) { data = p.inlineData.data; break; }
if (!data) { console.error("no image returned"); process.exit(1); }
fs.writeFileSync(RAW, Buffer.from(data, "base64"));

// trim whitespace to the text bounds, then normalise so bg is pure white
await sharp(RAW).trim({ threshold: 15 }).normalise().toFile(PROC);
const m = await sharp(PROC).metadata();
console.log(`raw saved ${RAW}; processed ${PROC} = ${m.width}x${m.height}`);
