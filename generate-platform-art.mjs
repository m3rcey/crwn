// Platform-sequence email creative: the flat vector poster set for the post-signup lifecycle.
//
// Same brand rule as everything else (CLAUDE.md "Brand Imagery"): flat vector poster art, the exact
// five-colour palette, anyone shown is a Black hip hop / R&B artist reading 18 to 32, gender named
// in EVERY prompt because the model defaults to men, WebP never JPEG, 16:9.
//
// SIX concepts serve TEN sequences. These are ACTIVATION arguments (your page is empty, money
// cannot reach you, nobody has joined yet, you are hitting a ceiling), which the nurture set does
// not cover: that set argues fragmentation to a prospect who has no account. Only `return` is
// genuinely shared, because "the door is still open" is the same picture for a churned artist as
// for a cold lead.
//
// Run: bash -c 'source ./load-env.sh; node generate-platform-art.mjs [--force] [--only=slug]'

import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import sharp from "sharp";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const DELAY_MS = 8000;
const OUT_DIR = "public";

const STYLE = `Flat vector poster illustration, screen-print aesthetic. Bold geometric shapes and hard-edged flat colour blocks with crisp vector edges. ABSOLUTELY NO gradients, no photographic texture, no realism, no soft shading, no 3D rendering, no drop shadows. The figure is rendered as a strong near-black silhouette with a few sculpted flat highlight planes picking out the face and shoulders. Bold radiating sunburst rays, concentric arcs and repeating dot rows fan out behind the subject as graphic background geometry. STRICT LIMITED PALETTE, only these five: near-black #0D0D0D, deep charcoal #1A1A1A, warm gold #D4AF37, amber #E8A33D, burnt orange #C2571A. The background is predominantly near-black #0D0D0D. High contrast, confident, premium, editorial poster art. NO text, NO letters, NO numbers, NO words, NO logos, NO watermarks anywhere in the image. WIDE CINEMATIC HORIZONTAL COMPOSITION filling a letterbox banner, the subject complete and comfortably inside the frame with room to the left and right, nothing cropped at the top or bottom edge.`;

const MAN = "a Black African American man, a hip hop and R&B artist, who clearly reads as young, age 18 to 32, wearing a hoodie, with a short modern fade and a youthful clean-shaven face, NOT middle-aged, NOT in a suit";
const WOMAN = "a Black African American woman, a hip hop and R&B artist, who clearly reads as young, age 18 to 32, with braids and a youthful face, NOT middle-aged";

// 4 male / 2 female = 67% across this set, matching the brand ratio.
const ART = [
  {
    slug: "platform-ladder",
    gender: "male",
    scene: `${MAN}, shown in near-black silhouette from the chest up at the lower left of the wide banner, looking up and to the right. Rising across the frame to the right are FOUR hard-edged horizontal platform bars arranged as an ascending staircase, each one higher and brighter than the last. The lowest and nearest bar is a HOLLOW gold outline only, unfilled, clearly open. The three above it are solid: amber, burnt orange, then brilliant warm gold at the top right. Concentric gold arcs radiate from the highest bar.`,
  },
  {
    slug: "platform-payment-gate",
    gender: "female",
    scene: `${WOMAN}, shown in near-black silhouette from the chest up at the left of the wide banner, one arm reaching to the right. Running horizontally across the whole frame is a bold conduit built from thick interlocking gold and amber geometric segments, like a pipeline of hard-edged blocks. Near the right end ONE segment is MISSING, leaving a clean rectangular near-black gap, and the flow of repeating gold dots travelling along the conduit stops dead at that gap. Past the gap the remaining segments are dim deep charcoal, unlit.`,
  },
  {
    slug: "platform-empty-stage",
    gender: "male",
    scene: `${MAN}, shown in near-black silhouette from the waist up at the far left edge of the wide banner, holding one small glowing warm gold rectangle in his raised hand. The rest of the frame is a wide, deliberately EMPTY stage: a bare flat charcoal floor plane, a single hard-edged cone of gold light falling on nothing, and two dim microphone stand shapes in flat silhouette at the edges. Concentric arcs frame the empty space. The emptiness is the subject.`,
  },
  {
    slug: "platform-open-the-door",
    gender: "male",
    scene: `${MAN}, shown in near-black silhouette from the chest up at the right of the wide banner, facing left toward a wall. Filling the left two thirds of the frame is a solid wall built from stacked flat deep-charcoal rectangular blocks with no opening. At the centre of that wall ONE tall doorway-shaped gap has appeared, filled with brilliant warm gold, with amber light spilling out of it across the floor in hard-edged geometric bands. Repeating gold dot rows lead from the doorway toward the figure.`,
  },
  {
    slug: "platform-first-yes",
    gender: "female",
    scene: `${WOMAN}, shown in near-black silhouette from the chest up at the right of the wide banner, watching to the left. Across the left of the frame is a wide arc of roughly twenty evenly spaced flat circles arranged like rows of empty seats, all of them dim deep charcoal and unfilled. Exactly ONE circle, near the centre, is filled brilliant warm gold and is slightly larger than the rest, with gold sunburst rays radiating out from that single circle only. Concentric arcs sweep behind the whole arc of seats.`,
  },
  {
    slug: "platform-ceiling-lift",
    gender: "male",
    scene: `${MAN}, shown in near-black silhouette from the waist up at the centre of the wide banner, both arms raised above his head pressing upward against a heavy horizontal bar. That bar is a thick flat deep-charcoal slab spanning the full width of the frame, and it is clearly being pushed UP: it tilts slightly and has lifted away from its original position, revealing a band of brilliant warm gold and amber light and radiating sunburst rays in the space opened above it. Below the bar the field is dim charcoal with sparse dots.`,
  },
];

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",").map((s) => s.trim())) : null;

let ok = 0, skipped = 0, failed = [];
for (const item of ART) {
  if (only && !only.has(item.slug)) continue;
  const outPath = `${OUT_DIR}/${item.slug}.webp`;
  if (fs.existsSync(outPath) && !force) { console.log(`SKIP ${outPath}`); skipped++; continue; }

  console.log(`Generating ${item.slug} (${item.gender})...`);
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts: [{ text: `${item.scene}\n\n${STYLE}` }] }],
      config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
    });
    let imageData = null;
    for (const cand of response.candidates || []) {
      for (const p of cand.content?.parts || []) {
        if (p.inlineData?.data) { imageData = p.inlineData.data; break; }
      }
      if (imageData) break;
    }
    if (!imageData) { console.error(`FAIL ${item.slug}: no image`); failed.push(item.slug); continue; }
    await sharp(Buffer.from(imageData, "base64")).webp({ quality: 82 }).toFile(outPath);
    console.log(`OK   ${outPath} (${fs.statSync(outPath).size.toLocaleString()} bytes)`);
    ok++;
  } catch (err) {
    console.error(`ERROR ${item.slug}: ${err.message}`);
    failed.push(item.slug);
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));
}
console.log(`\nDone. generated=${ok} skipped=${skipped} failed=${failed.length}`);
if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
