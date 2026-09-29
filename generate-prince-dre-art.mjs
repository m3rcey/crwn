// Prince Dre's offer-page art (2026-09-28): two tier heroes and two mock-video covers.
//
// Brand rule (CLAUDE.md "Brand Imagery"): flat vector poster art, the exact five-colour
// palette, no text, WebP, 16:9 to match the slots (the offer hero and the preview poster are
// both aspect-video). Illustration, not photography, on purpose: these depict scenes that
// have not happened (a listening room, a session), and a poster reads as art, never as a
// photo of a real event.
//
// Likeness comes from the REFERENCE PHOTOS of his CURRENT look (short cropped hair), never
// from prose about his face; the older loc-era photos are deliberately not attached, so the
// model cannot blend two eras. Look at every output before it ships.
//
// Run: bash -c 'source ./load-env.sh; node generate-prince-dre-art.mjs [outDir]'
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });
const OUT = process.argv[2] || "videos/output/prince-dre-art";
fs.mkdirSync(OUT, { recursive: true });

const REFS = [
  "videos/prince dre/Prince Dre 2026.jpg",
  "videos/prince dre/Prince Dre 2026 b.jpg",
  "videos/output/Prince Dre - photo.jpg",
].map((p) => ({ inlineData: { mimeType: "image/jpeg", data: fs.readFileSync(p).toString("base64") } }));

const STYLE = `Flat vector poster illustration, screen-print aesthetic. Bold geometric shapes and hard-edged flat colour blocks with crisp vector edges. ABSOLUTELY NO gradients, no photographic texture, no realism, no soft shading, no 3D rendering, no drop shadows. Figures are rendered as strong near-black silhouettes with a few sculpted flat highlight planes picking out the face, hands and shoulders. Bold radiating sunburst rays, concentric arcs and repeating dot rows as graphic background geometry. STRICT LIMITED PALETTE, only these five: near-black #0D0D0D, deep charcoal #1A1A1A, warm gold #D4AF37, amber #E8A33D, burnt orange #C2571A. The background is predominantly near-black #0D0D0D. High contrast, premium, editorial poster art. NO text, NO letters, NO numbers, NO words, NO logos, NO watermarks anywhere, including on clothing, chains, screens and equipment. WIDE CINEMATIC HORIZONTAL COMPOSITION, subjects complete inside the frame, nothing cropped at the top or bottom edge. The artwork runs fully to every edge with NO border, NO frame and NO margin.`;

const LIKENESS = `The main figure is the young Black man in the attached reference photos, a hip hop artist aged about 24. Capture HIS likeness from the photos: his face shape, his short cropped natural hair (short and close to the head, NEVER locs, dreadlocks, braids or long hair), his light goatee and thin moustache, a small stud earring, and a gold chain with a round pendant. Render him in the flat vector poster style, not photoreal. The photos are for his likeness only; do not copy their backgrounds, microphones branding or any text from them.`;

const SCENES = [
  {
    file: "hero-platinum.webp",
    scene: `Hero banner. He sits at a studio mixing console at the centre of the frame, leaning back confidently, one hand on the faders, wearing headphones around his neck. Behind him, three large flat gold and amber vinyl records hang in a row like three suns, each with concentric groove arcs, radiating sunburst rays between them: three finished projects, all his. Warm gold rim light on his face and shoulders.`,
  },
  {
    file: "hero-gold.webp",
    scene: `Hero banner. He stands at the right of the frame holding ONE large flat gold vinyl record up high above his head like a trophy, looking up at it. At the lower left, a crowd of raised hands in near-black silhouette reaches toward the record, a few of the hands holding small glowing phone screens, as if the fans voted it up. A single hard cone of warm gold light falls on the record.`,
  },
  {
    file: "session-listening.webp",
    scene: `A private group listening session in a recording studio control room. He stands at the console at the right, turning around toward the room with one hand raised mid-explanation, big studio monitor speakers either side. On a long low couch at the left sit five young fans in near-black silhouette, a mixed group of young men and young women aged 18 to 30, leaning in, nodding, one with eyes closed. Concentric sound-wave arcs flow from the speakers across the room in gold and amber.`,
  },
  {
    file: "video-vault.webp",
    scene: `He is in a vocal booth recording, headphones on, eyes closed, one hand cupping the headphone, singing into a large flat studio condenser microphone with a round pop filter in the foreground. Through the booth glass behind him, a dim studio with a glowing console. Gold sunburst rays behind his head, repeating dot rows along the booth wall.`,
  },
];

let ok = 0;
for (const s of SCENES) {
  const out = path.join(OUT, s.file);
  if (fs.existsSync(out) && !process.argv.includes("--force")) { console.log(`skip ${out} (exists)`); continue; }
  console.log(`Generating ${out}...`);
  try {
    const res = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts: [...REFS, { text: `${STYLE}\n\n${LIKENESS}\n\n${s.scene}` }] }],
      config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
    });
    const data = (res.candidates || []).flatMap((c) => c.content?.parts || []).find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!data) { console.error(`FAIL ${s.file}: no image`); continue; }
    await sharp(Buffer.from(data, "base64")).webp({ quality: 82 }).toFile(out);
    const m = await sharp(out).metadata();
    console.log(`OK ${out} (${fs.statSync(out).size.toLocaleString()} bytes, ${m.width}x${m.height})`);
    ok++;
  } catch (e) {
    console.error(`FAIL ${s.file}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 6000));
}
console.log(`\n${ok}/${SCENES.length} generated`);
