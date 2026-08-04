// Multi-sheet image runner for lead-magnet scripts (videos/scripts/lead-magnets/*.md).
// Unlike generate-images.mjs (one numbered shortform script -> one image), a lead-magnet
// file may hold SEVERAL labeled "**SHEET N — ...**" prompts. Usage:
//   node generate-lead-magnet-images.mjs <script-basename> [--sheets=1,2] [--refs=a.jpg,b.jpg]
// e.g. node generate-lead-magnet-images.mjs free-k-camp --sheets=1,2 --refs=kcamp1.jpg,kcamp2.jpg
// --refs REPLACES the auto-fetched person photo with the named files in PEOPLE_DIR, for when
// the Brave-fetched shot is a poor likeness. --sheets limits which sheets regenerate.
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
  PEOPLE_DIR,
  mimeFromExt,
} from "./fetch-person-ref.mjs";

const WHITE_THRESHOLD = 200;
async function flattenWhiteBackground(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  let flipped = 0;
  for (let i = 0; i < data.length; i += c) {
    if (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; flipped++;
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: c } })
    .jpeg({ quality: 95 })
    .toFile(filePath);
  return flipped;
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const OUTPUT_BASE = "/mnt/c/Users/Josh/Dropbox/nano banana output/Shortform Posts";
const REFS_DIR = "/mnt/c/Users/Josh/Desktop/nano banana references";
const SCRIPTS_DIR = "/home/merce/workspace-crwn/videos/scripts/lead-magnets";
const DELAY_MS = 8000;

const STYLE_REFS = [
  "openart-image_1775581308623_d7e64984_1775581308661_33c1d1ba.png",
  "openart-image_1775598089791_eaae2824_1775598089858_cade8739.png",
  "openart-image_1775598227341_c79110c0_1775598227430_39e71232.png",
  "openart-image_1775598237169_2475a432_1775598237207_c74fc3ec.png",
];

const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and diagrams, high contrast black on white, no gray tones, no background texture. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL BACKGROUND RULE: The background must be PURE WHITE (#FFFFFF), absolutely flat, edge to edge. NO off-white, cream, eggshell, beige, or warm paper tones. NO desk, table, notebook, binding, or surface visible underneath. NO shadows under the page, NO page curl, NO page edges, NO paper texture or grain. The entire frame IS the paper — there is no visible surface, no background object, no hint that the paper is sitting on anything. This is a flat editorial scan, not a photograph of a sheet on a desk. Pure #FFFFFF pixels fill every edge of the frame. CRITICAL FONT RULE: ALL text in the image must be hand-drawn sharpie marker handwriting. NEVER use any printed, typeset, computer, Arial, Helvetica, serif, or sans-serif font anywhere in the image. Every single letter, number, word, label, header, list item, footer, and bottom tagline must look hand-written with a sharpie. No typography, no mixed fonts, no computer-generated text anywhere, not even in bottom taglines, captions, or footers. CRITICAL HEADLINE RULE: the single most common failure is the LARGEST headline text at the top of the page rendering as a clean printed, bold, or display font. The big hook headline MUST be thick, slightly uneven, hand-drawn sharpie capital lettering, exactly as if a person wrote it fast with a marker, with imperfect baselines and varying stroke widths. NEVER render the headline (or any text at any size) as a typeset, bold, or display font. Every size of text, especially the biggest headline, is hand-lettered by marker. MARKER FILL TEXTURE: any solid black or filled-in area (filled shapes, redaction bars, blacked-out regions, shaded pie slices, thick fills) must look HAND-FILLED with a real sharpie marker, NOT a flat digital fill. Show visible directional marker strokes, slightly uneven coverage, faint lighter streaks where the marker lifted, tiny specks and flecks of white paper showing through the fill, and slightly ragged stroke edges, exactly like a person colored the area in by hand with a marker that was running a little dry. NEVER render a solid area as a perfectly uniform, smooth, vector-flat black. This streaky texture lives INSIDE the black fills only; it is NOT gray shading and it does NOT change the page background, which stays pure flat white (#FFFFFF), and thin line work stays clean and bold.";

const args = process.argv.slice(2);
const scriptSlug = args.find((a) => !a.startsWith("--"));
if (!scriptSlug) { console.error("Usage: node generate-lead-magnet-images.mjs <script-basename> [--sheets=1,2] [--refs=a.jpg,b.jpg]"); process.exit(1); }
const flagValue = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).split(",").map((s) => s.trim()).filter(Boolean) : null;
};
const onlySheets = flagValue("sheets");
const refOverride = flagValue("refs");
const scriptPath = path.join(SCRIPTS_DIR, `${scriptSlug}.md`);
if (!fs.existsSync(scriptPath)) { console.error(`Not found: ${scriptPath}`); process.exit(1); }
const scriptContent = fs.readFileSync(scriptPath, "utf-8");

// Pull every "**SHEET N — LABEL...**" block: prompt text runs until the next **SHEET or a --- rule.
const sheetRe = /\*\*SHEET (\d+) — ([^*]+)\*\*\s*\n+([\s\S]*?)(?=\n\*\*SHEET \d+ — |\n---)/g;
const sheets = [];
let m;
while ((m = sheetRe.exec(scriptContent)) !== null) {
  const label = m[2].split("(")[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  sheets.push({ num: m[1], label, prompt: m[3].trim() });
}
if (!sheets.length) { console.error("No **SHEET N — ...** blocks found."); process.exit(1); }
console.log(`${scriptSlug}: ${sheets.length} sheet(s)`);

const styleRefParts = STYLE_REFS.map((f) => ({
  inlineData: { mimeType: "image/png", data: fs.readFileSync(path.join(REFS_DIR, f)).toString("base64") },
}));

const peopleSlugs = findMentionedSlugs(scriptContent);
console.log(`people: ${peopleSlugs.length ? peopleSlugs.join(", ") : "(none)"}`);

// --refs wins over the auto-fetch: a hand-picked photo beats whatever Brave returned.
let personRefs;
let personRefParts;
if (refOverride) {
  personRefs = peopleSlugs.length ? [{ slug: peopleSlugs[0] }] : [];
  personRefParts = refOverride.map((file) => {
    const p = path.join(PEOPLE_DIR, file);
    if (!fs.existsSync(p)) { console.error(`ref not found: ${p}`); process.exit(1); }
    return { inlineData: { mimeType: mimeFromExt(path.extname(file).slice(1)), data: fs.readFileSync(p).toString("base64") } };
  });
  console.log(`refs (override): ${refOverride.join(", ")}`);
} else {
  personRefs = await ensurePersonRefs(peopleSlugs);
  personRefParts = buildPersonRefParts(personRefs);
}

function withPortraitDirective(promptText) {
  if (!personRefParts.length) return promptText;
  const titleCase = (s) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const refSlugs = personRefs.map((r) => r.slug);
  let primary = refSlugs.filter((s) => scriptSlug.includes(s));
  if (!primary.length) primary = refSlugs;
  const names = primary.map(titleCase);
  const nameList = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const known = loadKnownPeople();
  const drawNotes = primary.map((s) => known[s]?.draw).filter(Boolean);
  const drawClause = drawNotes.length ? ` IMPORTANT: ${drawNotes.join(" ")}` : "";
  const portraitDirective = ` Draw ${nameList} as the central recognizable character in the scene, a full or half figure actually performing the action the prompt describes (not a separate floating head-shot), with a clearly recognizable face from the attached reference photo (face shape, hair, facial hair if any, signature look), labeled in capital letters with the name, rendered in the same raw black sharpie line work as the rest of the page (not photo-real, no shading or color); the face must still read as ${nameList} even in simple sharpie style.${drawClause}`;
  const anchor = "The background is pure white (#FFFFFF).";
  return promptText.includes(anchor)
    ? promptText.replace(anchor, `${portraitDirective.trim()} ${anchor}`)
    : `${promptText.trim()}${portraitDirective}`;
}

let success = 0;
for (let i = 0; i < sheets.length; i++) {
  const sheet = sheets[i];
  if (onlySheets && !onlySheets.includes(sheet.num)) { console.log(`[${i + 1}/${sheets.length}] SKIP (not selected) sheet ${sheet.num}`); continue; }
  const outPath = path.join(OUTPUT_BASE, `${scriptSlug}-${sheet.num}-${sheet.label}.jpg`);
  if (fs.existsSync(outPath)) { console.log(`[${i + 1}/${sheets.length}] SKIP (exists) ${path.basename(outPath)}`); success++; continue; }

  const parts = [{ text: STYLE_INSTRUCTION }, ...styleRefParts];
  if (personRefParts.length) { parts.push({ text: PERSON_REF_INSTRUCTION }); parts.push(...personRefParts); }
  parts.push({ text: withPortraitDirective(sheet.prompt) });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
      config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } },
    });
    let imageData = null;
    for (const cand of response.candidates || []) {
      for (const p of cand.content?.parts || []) {
        if (p.inlineData?.data) { imageData = p.inlineData.data; break; }
      }
      if (imageData) break;
    }
    if (!imageData) {
      console.error(`[${i + 1}/${sheets.length}] FAIL: no image in response`);
    } else {
      fs.writeFileSync(outPath, Buffer.from(imageData, "base64"));
      try {
        const flipped = await flattenWhiteBackground(outPath);
        console.log(`[${i + 1}/${sheets.length}] OK ${path.basename(outPath)} (white-flattened ${flipped.toLocaleString()} px)`);
      } catch (err) {
        console.warn(`[${i + 1}/${sheets.length}] saved but white-flatten failed: ${err.message}`);
      }
      success++;
    }
  } catch (err) {
    console.error(`[${i + 1}/${sheets.length}] ERROR: ${err.message}`);
  }
  if (i < sheets.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
}
console.log(`DONE ${success}/${sheets.length}`);
