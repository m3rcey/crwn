// Realistic studio photos of a launch artist for every image slot on their offer pages, from a
// reference folder the founder names. Part of the onboard-icp-artist skill.
//
// WHY PHOTOREAL: an artist's own page shows real-looking photos of the artist (founder
// correction 2026-09-28). The flat-vector brand rule governs CRWN's OWN marketing imagery, not
// artist content. Always a RECORDING STUDIO, never DJ turntables (founder, same day).
//
// LIKENESS COMES FROM THE PHOTOS, never from prose about a face (prose is stale and the model
// draws the prose). Put only the artist's CURRENT look in the folder: a mixed-era folder makes
// the model blend two haircuts. Pass --room <file> to set the listening session in a real room.
// An image with no person in it (an empty studio) belongs in --room, not in --refs.
//
// Slots (16:9, WebP), matching what the offer config references:
//   hero-platinum      above the Platinum promise
//   hero-gold          above the Gold promise
//   session-listening  the group listening-session preview (mock video cover)
//   video-vault        the Vault preview (mock video cover)
//   vsl-thumb          the sales-video cover before the artist records it
//
// LOOK AT EVERY IMAGE before it ships (likeness, headcount, stray text, turntables). The
// pipeline cannot tell a good likeness from a cousin.
//
// Run (WSL, main checkout):
//   bash -c 'source ./load-env.sh; npx tsx scripts/generate-offer-photos.mjs <artistKey> --refs "<folder>" [--room <file>] [--only a,b] [--force] [--upload]'
//   --upload puts each file at album-art/<artistId>/offer/photo-<slot>.webp and prints its URL.
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const key = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--force", "--upload"].includes(args[i - 1])));
const REFS_DIR = opt("refs");
const ROOM = opt("room");
const ONLY = (opt("only") || "").split(",").filter(Boolean);
const FORCE = args.includes("--force");
const UPLOAD = args.includes("--upload");
if (!key || !REFS_DIR) { console.error('usage: npx tsx scripts/generate-offer-photos.mjs <artistKey> --refs "<folder>" [--room <file>] [--only a,b] [--force] [--upload]'); process.exit(1); }

const env = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const pick = (k) => process.env[k] || (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^"|"$/g, "");
const API_KEY = pick("GEMINI_API_KEY");
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });
const db = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { LAUNCH_PARTNERS } = await import("../src/lib/offerExperience/reference/launchPartners.ts");
const C = LAUNCH_PARTNERS[key];
if (!C) { console.error(`unknown launch partner "${key}"`); process.exit(1); }

const IMG = /\.(jpe?g|png|webp)$/i;
const MIME = (f) => (/\.png$/i.test(f) ? "image/png" : /\.webp$/i.test(f) ? "image/webp" : "image/jpeg");
const refFiles = fs.readdirSync(REFS_DIR).filter((f) => IMG.test(f) && !f.includes(":")).map((f) => path.join(REFS_DIR, f));
if (!refFiles.length) { console.error(`no images in ${REFS_DIR}`); process.exit(1); }
const REFS = refFiles.map((p) => ({ inlineData: { mimeType: MIME(p), data: fs.readFileSync(p).toString("base64") } }));
const ROOM_PART = ROOM ? { inlineData: { mimeType: MIME(ROOM), data: fs.readFileSync(ROOM).toString("base64") } } : null;
console.log(`${C.displayName}: ${refFiles.length} reference photo(s)${ROOM ? ", room reference" : ""}`);

const STYLE = `Photorealistic editorial music photography, shot on a full-frame camera with a 35mm lens, natural skin texture, real studio lighting, shallow depth of field. Moody and premium: a dark recording studio lit by warm amber practical lights, gold rim light, deep shadows. Colour grade: warm golds and ambers against near-black. Candid, authentic, like a behind-the-scenes photo from a real session. Always a RECORDING STUDIO (mixing console, studio monitors, vocal booth, acoustic panels): NEVER DJ turntables, DJ decks, vinyl decks or a DJ booth. NO text, NO captions, NO logos, NO watermarks, NO brand names anywhere in the image, including on clothing, screens and equipment. WIDE HORIZONTAL 16:9 COMPOSITION, subjects complete in the frame. No border or frame.`;
const LIKENESS = `The main figure is the artist in the attached reference photos. Capture THEIR likeness exactly from the photos: face shape, hairstyle and hair length, facial hair, skin tone, build, jewelry and any accessory they always wear. Do not age them up. They must look like the same real person as in the photos. The photos are for likeness only: do not copy their backgrounds, logos or any text from them.`;
const ROOM_NOTE = `Use the LAST attached image (the empty room) as the setting: the same room, now occupied, framed wide enough to show the seating. `;

const SLOTS = {
  "hero-platinum": `They sit at a large studio mixing console in a dark recording studio, leaning back confidently, one hand on the faders, headphones around the neck, looking toward the camera with a slight knowing smile. Warm amber light from the console meters and a gold rim light on the face and shoulders. Studio monitors and acoustic panels softly in the background.`,
  "hero-gold": `In the recording studio, they hold a finished record up in one hand, a plain unlabeled vinyl record, looking at it with pride, standing near the mixing console. Warm amber and gold light, the rest of the studio falling into shadow behind them. A candid behind-the-scenes moment.`,
  "session-listening": `${ROOM ? ROOM_NOTE : ""}A private group listening session in a recording studio control room. The artist stands by the mixing console at the right, turned toward the room, one hand raised mid-sentence about the song playing. On one couch at the left sit FIVE young fans aged 18 to 30. Count them: one, two, three, four, five people, never four and never six. They are THREE young women and TWO young men, ALL seated side by side on the couch, nobody standing or floating behind it, all five fully inside the frame with space at the left edge. They lean in and nod along, one woman with her eyes closed. Warm amber lamps, a relaxed late-night feel.`,
  "video-vault": `They are in a vocal booth recording, headphones on, eyes closed, one hand cupping the headphone, performing into a large studio condenser microphone with a round pop filter in the foreground. Acoustic foam on the walls, a warm amber light, the dim control room visible through the booth glass behind them.`,
  "vsl-thumb": `A talking-head video frame. They sit on a stool in the recording studio facing the camera directly, centered, looking straight into the lens mid-sentence with a serious, honest expression, leaning slightly forward, forearms resting on the knees, hands loosely together, as if telling their fans something that matters. Behind them, softly out of focus: the mixing console, studio monitors and warm amber lamps. Framed from the knees up with space either side.`,
};

const OUT = path.join("videos/output", `${C.slug}-photos`);
fs.mkdirSync(OUT, { recursive: true });
let artistId = null;
if (UPLOAD) {
  const { data } = await db.from("artist_profiles").select("id").eq("slug", C.slug).single();
  artistId = data?.id;
  if (!artistId) { console.error(`no artist row for ${C.slug}`); process.exit(1); }
}

for (const [slot, scene] of Object.entries(SLOTS)) {
  if (ONLY.length && !ONLY.includes(slot)) continue;
  const out = path.join(OUT, `${slot}.webp`);
  if (fs.existsSync(out) && !FORCE) {
    console.log(`skip ${out} (exists; --force to regenerate)`);
  } else {
    console.log(`Generating ${out}...`);
    try {
      const parts = [...REFS, ...(slot === "session-listening" && ROOM_PART ? [ROOM_PART] : []), { text: `${STYLE}\n\n${LIKENESS}\n\n${scene}` }];
      const res = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: "user", parts }],
        config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
      });
      const data = (res.candidates || []).flatMap((c) => c.content?.parts || []).find((p) => p.inlineData?.data)?.inlineData?.data;
      if (!data) { console.error(`FAIL ${slot}: no image`); continue; }
      await sharp(Buffer.from(data, "base64")).webp({ quality: 82 }).toFile(out);
      console.log(`OK ${out}`);
    } catch (e) {
      console.error(`FAIL ${slot}: ${e.message}`);
      continue;
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  if (UPLOAD && fs.existsSync(out)) {
    const dest = `${artistId}/offer/photo-${slot}.webp`;
    const { error } = await db.storage.from("album-art").upload(dest, fs.readFileSync(out), { contentType: "image/webp", upsert: true });
    console.log(error ? `UPLOAD FAIL ${slot}: ${error.message}` : `uploaded ${db.storage.from("album-art").getPublicUrl(dest).data.publicUrl}`);
  }
}
