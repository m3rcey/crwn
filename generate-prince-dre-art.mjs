// Prince Dre's offer-page images (2026-09-28): two tier heroes and two mock-video covers.
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
const OUT = process.argv[2] || "videos/output/prince-dre-photos";
fs.mkdirSync(OUT, { recursive: true });

const REFS = [
  "videos/prince dre/Prince Dre 2026.jpg",
  "videos/prince dre/Prince Dre 2026 b.jpg",
  "videos/output/Prince Dre - photo.jpg",
].map((p) => ({ inlineData: { mimeType: "image/jpeg", data: fs.readFileSync(p).toString("base64") } }));
// A real control room (founder-supplied, 2026-09-28), passed as a SETTING reference only.
const ROOM = { inlineData: { mimeType: "image/png", data: fs.readFileSync("videos/prince dre/IMG_1919.png").toString("base64") } };

// PHOTOGRAPHIC (founder direction 2026-09-28): the artist's own page shows real-looking
// photos of HIM, not CRWN brand poster art. The brand-poster rule governs CRWN's marketing
// imagery; artist content follows the artist. Dre's team approves use of his likeness (TODO).
const STYLE = `Photorealistic editorial music photography, shot on a full-frame camera with a 35mm lens, natural skin texture, real studio lighting, shallow depth of field. Moody and premium: a dark recording studio lit by warm amber practical lights, gold rim light, deep shadows. Colour grade: warm golds and ambers against near-black. Candid, authentic, like a behind-the-scenes photo from a real session. Always a RECORDING STUDIO (mixing console, studio monitors, vocal booth, acoustic panels): NEVER DJ turntables, DJ decks, vinyl decks or a DJ booth. NO text, NO captions, NO logos, NO watermarks, NO brand names anywhere in the image, including on clothing, screens and equipment. WIDE HORIZONTAL 16:9 COMPOSITION, subjects complete in the frame. No border or frame.`;

const LIKENESS = `The main figure is the young Black man in the attached reference photos, a hip hop artist aged about 24. Capture HIS likeness from the photos: a slim build and a NARROW, LONG face with high cheekbones (never a broad or round face), short cropped natural hair in waves with a crisp lineup (NEVER locs, dreadlocks, braids or long hair), only a LIGHT chin goatee and a thin moustache (NEVER a full beard along the jaw), a small diamond stud earring, and a gold chain with a round iced pendant shaped like a ring or the letter O (never an oval medallion with a portrait in it). He looks about 22. He must look like the same real person as in the photos. The photos are for his likeness only; do not copy their backgrounds, microphones branding or any text from them.`;

const SCENES = [
  {
    file: "hero-platinum.webp",
    scene: `He sits at a large studio mixing console in a dark recording studio, leaning back confidently in the chair, one hand on the faders, headphones around his neck, looking toward the camera with a slight knowing smile. Warm amber light from the console meters and a gold rim light on his face and shoulders. Studio monitors and acoustic panels in the soft background.`,
  },
  {
    file: "hero-gold.webp",
    scene: `In the recording studio, he holds a finished record up in one hand, a plain unlabeled vinyl sleeve, looking at it with pride, standing near the mixing console. Warm amber and gold light, the rest of the studio falling into shadow behind him. Candid behind-the-scenes moment.`,
  },
  {
    file: "session-listening.webp",
    room: true,
    scene: `Use the LAST attached image (the empty control room with the console and the couch) as the setting: the same room, now occupied, framed wide enough to show the whole couch. A private group listening session. He stands by the mixing console at the right, turned toward the room, one hand raised as he talks about the song playing. On the couch sit FIVE young Black fans aged 18 to 30. Count them: one, two, three, four, five people, never four and never six. They are THREE young women and TWO young men, ALL seated side by side on the couch, nobody standing or floating behind it, all five fully inside the frame with space at the left edge. They lean in and nod along, one woman with her eyes closed. Warm amber lamps and candles, a relaxed late-night feel.`,
  },
  {
    // The cover for the video he has not shot yet: the classic talking-head opener.
    file: "vsl-thumb.webp",
    scene: `A talking-head video frame. He sits on a stool in the recording studio facing the camera directly, centered, looking straight into the lens mid-sentence with a serious, honest expression, leaning slightly forward, forearms on his knees, hands loosely together, as if telling his fans something that matters. Behind him, softly out of focus: the mixing console, studio monitors and warm amber lamps. Framed from the knees up with space either side of him.`,
  },
  {
    file: "video-vault.webp",
    scene: `He is in a vocal booth recording, headphones on, eyes closed, one hand cupping the headphone, rapping into a large studio condenser microphone with a round pop filter in the foreground. Acoustic foam on the walls, a warm amber light, the dim control room visible through the booth glass behind him.`,
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
      contents: [{ role: "user", parts: [...REFS, ...(s.room ? [ROOM] : []), { text: `${STYLE}\n\n${LIKENESS}\n\n${s.scene}` }] }],
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
