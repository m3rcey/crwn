// Fan Economy CAROUSEL runner: four 3:4 slides per post, from a carousel file that
// sits beside the video script it condenses.
//
//   slide 1  the hook sheet      COPIED from the video sheet
//   slide 2  the reveal          rendered
//   slide 3  the takeaway        rendered
//   slide 4  the 128 end card    COPIED from a shared asset
//
// Only two of the four cost an API call.
//
// This deliberately reuses generate-fan-economy-images.mjs's pipeline (style refs,
// auto person refs, 4K, white-flatten, colour check) instead of generate-carousel.mjs,
// which hardcodes 1:1 in its style instruction and uses the older API shape with no
// aspectRatio or imageSize at all.
//
// Slide 1 is NOT rendered when the video sheet already exists: it is copied. The
// sheets are already 3:4 at 4K, so copying gives the carousel an opening slide
// identical to the video's, for free and with no chance of drift.
//
//   node generate-fan-economy-carousel.mjs 1       one carousel
//   node generate-fan-economy-carousel.mjs 1 9     an inclusive range
//   node generate-fan-economy-carousel.mjs         every carousel file that exists
//
// Existing slide files are skipped, so reruns are safe. Delete a slide to reroll it.

import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  ensurePersonRefs,
  findMentionedSlugs,
  buildPersonRefParts,
  PERSON_REF_INSTRUCTION,
  loadKnownPeople,
} from "./fetch-person-ref.mjs";

const CAROUSELS_DIR = "/home/merce/workspace-crwn/videos/carousels/fan-economy";
const SHEETS_DIR = "/mnt/c/Users/Josh/Dropbox/nano banana output/Shortform Posts/Fan Economy";
const OUTPUT_BASE = "/mnt/c/Users/Josh/Dropbox/nano banana output/Carousel Posts/Fan Economy";
const REFS_DIR = "/mnt/c/Users/Josh/Desktop/nano banana references";
const CRWN_LOGO = path.join(REFS_DIR, "crwn-logo.png");
const END_CARD = path.join(REFS_DIR, "128-end-card.jpg");

// Slide 4 is byte-identical on every carousel, so rendering it per post would spend an
// API call to redraw the same page and give the model 30 chances to draw it differently.
// It is generated ONCE into END_CARD and copied thereafter, the same pattern as
// swipe-for-more.png. This prompt exists only to rebuild the asset if it goes missing.
const END_CARD_PROMPT =
  "Flat scan of a white sheet of paper filling the entire frame. No desk, no surface, no edges visible, just white paper. Black sharpie marker line art on pure white, with heavy solid-black fills. This page is an END CARD and is almost entirely empty white space. Centered in the middle of the page, draw the CRWN logo from the attached reference image: a bold angular geometric crown with sharp pointed peaks and a solid bar across its base, filled solid black, redrawn by hand in sharpie with slightly uneven marker edges and a few tiny flecks of white paper showing through the fill. The crown is large and is the only illustration on the page. Directly BELOW the crown, hand-letter exactly ONE line in large black sharpie capitals: \"128\". Nothing else appears anywhere on the page: no other words, no tagline, no call to action, no website, no handle, no letters spelling CRWN, no border and no frame. Render only the crown mark and the three characters \"128\". Invent no extra words, no nonsense words, no partial words and no extra numbers. Every mark is hand-drawn sharpie, never a printed or typeset font, and the \"128\" must look written by hand with a marker with slightly imperfect strokes. Center the crown and the number together as one group in the exact middle of the page, with roughly equal empty white margins above and below that group. The background is pure white (#FFFFFF). The image is shot perfectly straight on, no angle, no shadow, no background elements. Pure white paper fills the entire 3:4 frame edge to edge.";
const DELAY_MS = 8000;
const WHITE_THRESHOLD = 200;

const STYLE_REFS = [
  "openart-image_1775581308623_d7e64984_1775581308661_33c1d1ba.png",
  "openart-image_1775598089791_eaae2824_1775598089858_cade8739.png",
  "openart-image_1775598227341_c79110c0_1775598227430_39e71232.png",
  "openart-image_1775598237169_2475a432_1775598237207_c74fc3ec.png",
];

// Same instruction as the sheet generator so all four slides sit in one visual family.
// The final clause is the one difference: the sheet generator forbids the CRWN mark
// outright, and the 128 end card is the one page in the series that needs it.
const STYLE_INSTRUCTION =
  "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and diagrams, high contrast black on white, no gray tones, no background texture. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. " +
  "CRITICAL MONOCHROME RULE: the entire image is BLACK INK ON WHITE PAPER and contains NO COLOUR WHATSOEVER. There is no gold, no yellow, no red, no blue, no green and no coloured accent anywhere, not on a chain, a logo, a garment, a record label, a highlight or any object. The attached person reference photographs ARE in colour and their colours must NOT be copied: translate every one of them into black marker line work. If a person wears a gold chain or coloured clothing in their photo, draw it in black ink like everything else. Every pixel in the finished page is either black ink or white paper. " +
  "CRITICAL BACKGROUND RULE: The background must be PURE WHITE (#FFFFFF), absolutely flat, edge to edge. NO off-white, cream, eggshell, beige, or warm paper tones. NO desk, table, notebook, binding, or surface visible underneath. NO shadows under the page, NO page curl, NO page edges, NO paper texture or grain. The entire frame IS the paper. This is a flat editorial scan, not a photograph of a sheet on a desk. Pure #FFFFFF pixels fill every edge of the frame. " +
  "CRITICAL FONT RULE: ALL text in the image must be hand-drawn sharpie marker handwriting. NEVER use any printed, typeset, computer, Arial, Helvetica, serif, or sans-serif font anywhere in the image. Every single letter, number, word, label, header, list item and footer must look hand-written with a sharpie. " +
  "CRITICAL HEADLINE RULE: the single most common failure is the LARGEST headline text at the top of the page rendering as a clean printed, bold, or display font. The big headline MUST be thick, slightly uneven, hand-drawn sharpie capital lettering, exactly as if a person wrote it fast with a marker, with imperfect baselines and varying stroke widths. " +
  "MARKER FILL TEXTURE: any solid black or filled-in area must look HAND-FILLED with a real sharpie marker, NOT a flat digital fill. Show visible directional marker strokes, slightly uneven coverage, faint lighter streaks where the marker lifted, tiny specks and flecks of white paper showing through, and slightly ragged stroke edges. NEVER render a solid area as a perfectly uniform, vector-flat black. This texture lives INSIDE the black fills only; the page background stays pure flat white (#FFFFFF). " +
  "The reference images convey drawing STYLE ONLY. Do NOT copy any text, words, logos, crowns, brand marks or taglines from them. Never draw the word CRWN, a crown symbol, or any logo UNLESS the slide prompt explicitly asks for it, in which case draw exactly what that prompt asks for and nothing more.";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const mimeFor = (f) => (/\.png$/i.test(f) ? "image/png" : "image/jpeg");
const loadRef = (p) => ({
  inlineData: { mimeType: mimeFor(p), data: fs.readFileSync(p).toString("base64") },
});

// Anything the model leaves near-white becomes exactly white, so the page has no
// cream cast and prints clean. Same helper as the sheet generator.
async function flattenWhiteBackground(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  let flipped = 0;
  for (let i = 0; i < data.length; i += c) {
    if (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
      flipped++;
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: c } })
    .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
    .toFile(filePath);
  return flipped;
}

// A colour reference photo can leak its colours onto a black-sharpie page (a gold
// chain did). A correct slide scores exactly 0.
async function countColouredPixels(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  let coloured = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) coloured++;
  }
  return coloured;
}

function section(md, marker) {
  const idx = md.indexOf(marker);
  if (idx === -1) return null;
  let rest = md.slice(idx + marker.length);
  const end = rest.indexOf("\n---");
  if (end !== -1) rest = rest.slice(0, end);
  return rest.trim();
}

const argNums = process.argv.slice(2).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
const START = argNums.length ? argNums[0] : 1;
const END = argNums.length > 1 ? argNums[1] : (argNums.length ? argNums[0] : 9999);

if (!fs.existsSync(CAROUSELS_DIR)) {
  console.error(`No carousel folder at ${CAROUSELS_DIR}`);
  process.exit(1);
}
if (!fs.existsSync(OUTPUT_BASE)) fs.mkdirSync(OUTPUT_BASE, { recursive: true });

const files = fs
  .readdirSync(CAROUSELS_DIR)
  .filter((f) => /^\d+-.*\.md$/.test(f))
  .map((f) => ({ num: parseInt(f.match(/^(\d+)-/)[1], 10), file: f, slug: f.replace(/\.md$/, "") }))
  .filter((s) => s.num >= START && s.num <= END)
  .sort((a, b) => a.num - b.num);

if (!files.length) {
  console.error(`No carousel files in range ${START}-${END}`);
  process.exit(1);
}

const styleRefParts = STYLE_REFS.map((f) => loadRef(path.join(REFS_DIR, f)));

console.log(`Generating ${files.length} carousel(s) for ${START}-${END}`);
console.log(`Output: ${OUTPUT_BASE}\n`);

let rendered = 0, copied = 0, failed = 0;

for (const entry of files) {
  const md = fs.readFileSync(path.join(CAROUSELS_DIR, entry.file), "utf-8");
  const outDir = path.join(OUTPUT_BASE, entry.slug);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`[${entry.num}] ${entry.slug}`);

  const caption = section(md, "**CAPTION:**");
  if (caption) {
    fs.writeFileSync(path.join(outDir, "caption.md"), caption + "\n");
    console.log(`  caption.md (${caption.split(/\s+/).length} words)`);
  } else {
    console.warn(`  no **CAPTION:** block`);
  }

  for (const slideNo of [1, 2, 3, 4]) {
    const outPath = path.join(outDir, `slide-${slideNo}.jpg`);
    if (fs.existsSync(outPath)) {
      console.log(`  slide-${slideNo} SKIP (exists)`);
      continue;
    }

    // Slide 4 is the fixed 128 end card, shared by every carousel in the series.
    if (slideNo === 4) {
      if (fs.existsSync(END_CARD)) {
        fs.copyFileSync(END_CARD, outPath);
        console.log(`  slide-4 COPIED from the shared 128 end card`);
        copied++;
        continue;
      }
      console.log(`  slide-4 end-card asset missing, rendering it once to rebuild it`);
    }

    // Slide 1 is the video sheet. Copy it rather than re-rendering: identical art,
    // no API call, and no chance of the carousel opening on a different drawing
    // than the video it condenses.
    if (slideNo === 1) {
      const sheet = fs.existsSync(SHEETS_DIR)
        ? fs.readdirSync(SHEETS_DIR).find((f) => f.startsWith(`${entry.num}-`) && f.endsWith(".jpg"))
        : null;
      if (sheet) {
        fs.copyFileSync(path.join(SHEETS_DIR, sheet), outPath);
        console.log(`  slide-1 COPIED from the video sheet (${sheet})`);
        copied++;
        continue;
      }
      console.log(`  slide-1 no video sheet yet, rendering from the prompt`);
    }

    const prompt =
      slideNo === 4 ? END_CARD_PROMPT : section(md, `**SLIDE ${slideNo} PROMPT:**`);
    if (!prompt) {
      console.warn(`  slide-${slideNo} SKIP (no prompt block)`);
      continue;
    }

    const personSlugs = findMentionedSlugs(prompt);
    const personRefs = await ensurePersonRefs(personSlugs);
    const personRefParts = buildPersonRefParts(personRefs);
    if (personSlugs.length) console.log(`  slide-${slideNo} people: ${personSlugs.join(", ")}`);

    let finalPrompt = prompt;
    if (personRefParts.length) {
      const known = loadKnownPeople();
      const notes = personRefs.map((r) => known[r.slug]?.draw).filter(Boolean);
      if (notes.length) finalPrompt += ` IMPORTANT: ${notes.join(" ")}`;
    }

    const parts = [{ text: STYLE_INSTRUCTION }, ...styleRefParts];
    if (personRefParts.length) {
      parts.push({ text: PERSON_REF_INSTRUCTION });
      parts.push(...personRefParts);
    }
    // Slide 3 is the only slide in the series that draws the CRWN mark, so it is the
    // only one that gets the logo reference attached.
    if (/CRWN|crwn logo/.test(prompt) && fs.existsSync(CRWN_LOGO)) {
      parts.push({
        text: "Reference image of the CRWN logo. When the slide prompt asks for the CRWN logo, reproduce THIS exact mark, redrawn by hand in solid black sharpie with slightly uneven marker edges. Keep its proportions and its distinctive angular crown shape. Do not invent a different crown, do not add letters to it, and do not add any other logo.",
      });
      parts.push(loadRef(CRWN_LOGO));
    }
    parts.push({ text: finalPrompt });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["IMAGE"],
          // 3:4 to match the video sheets, 4K because these get printed too.
          imageConfig: { aspectRatio: "3:4", imageSize: "4K" },
        },
      });

      let imageData = null;
      for (const cand of response.candidates || []) {
        for (const p of cand.content?.parts || []) {
          if (p.inlineData?.data) { imageData = p.inlineData.data; break; }
        }
        if (imageData) break;
      }

      if (!imageData) {
        console.error(`  slide-${slideNo} FAIL: no image in response`);
        failed++;
      } else {
        fs.writeFileSync(outPath, Buffer.from(imageData, "base64"));
        const flipped = await flattenWhiteBackground(outPath);
        const colour = await countColouredPixels(outPath);
        console.log(`  slide-${slideNo} OK (white-flattened ${flipped.toLocaleString()} px)`);
        if (colour > 0) {
          console.warn(
            `  COLOUR INTRUSION on slide-${slideNo}: ${colour.toLocaleString()} non-greyscale pixels. `
            + `These slides are black ink on white paper. Look at it and reroll.`
          );
        }
        if (slideNo === 4) {
          fs.copyFileSync(outPath, END_CARD);
          console.log(`  slide-4 saved as the shared end card for every later carousel`);
        }
        rendered++;
      }
    } catch (err) {
      console.error(`  slide-${slideNo} FAIL: ${err.message}`);
      failed++;
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log("");
}

console.log("=== DONE ===");
console.log(`rendered: ${rendered}  copied: ${copied}  failed: ${failed}`);
