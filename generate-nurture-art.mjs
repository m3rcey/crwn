// Nurture email creative: the flat vector poster set for the prospect-nurture sequence.
//
// Brand rule: CLAUDE.md "Brand Imagery" (flat vector poster art, five-colour palette, anyone shown
// is a Black hip hop / R&B artist reading 18 to 32, gender named in EVERY prompt because the model
// defaults to men, ~65/35 male/female across the SET). Encoded WebP, never JPEG: flat colour and
// hard edges are the worst case for DCT.
//
// Run: bash -c 'source ./load-env.sh; node generate-nurture-art.mjs [--only=slug,slug]'
// Idempotent: an existing .webp is skipped unless --force.

import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import sharp from "sharp";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const DELAY_MS = 8000;
const OUT_DIR = "public";

// The exact founder-approved style block. Appended verbatim after every scene description.
const STYLE = `Flat vector poster illustration, screen-print aesthetic. Bold geometric shapes and hard-edged flat colour blocks with crisp vector edges. ABSOLUTELY NO gradients, no photographic texture, no realism, no soft shading, no 3D rendering, no drop shadows. The figure is rendered as a strong near-black silhouette with a few sculpted flat highlight planes picking out the face and shoulders. Bold radiating sunburst rays, concentric arcs and repeating dot rows fan out behind the subject as graphic background geometry. STRICT LIMITED PALETTE, only these five: near-black #0D0D0D, deep charcoal #1A1A1A, warm gold #D4AF37, amber #E8A33D, burnt orange #C2571A. The background is predominantly near-black #0D0D0D. High contrast, confident, premium, editorial poster art. NO text, NO letters, NO numbers, NO words, NO logos, NO watermarks anywhere in the image. WIDE CINEMATIC HORIZONTAL COMPOSITION filling a letterbox banner, the subject complete and comfortably inside the frame with room to the left and right, nothing cropped at the top or bottom edge.`;

const MAN = "a Black African American man, a hip hop and R&B artist, who clearly reads as young, age 18 to 32";
const WOMAN = "a Black African American woman, a hip hop and R&B artist, who clearly reads as young, age 18 to 32";

// 12 concepts, 8 male / 4 female = 67/33 across the set.
const ART = [
  {
    slug: "nurture-discovery",
    gender: "male",
    scene: `${MAN}, shown in near-black silhouette from the chest up, positioned slightly left of centre and looking up and to the right. Around and above him, a wide field of small scattered geometric marks (dots, short bars, tiny circles) in amber and burnt orange begins to bend and converge into a single bright warm gold focal point at the upper right, where the marks resolve into one clean concentric arc. The left side of the frame is loose and scattered, the right side is ordered and radiant. Bold gold sunburst rays fan from that focal point back across the whole banner.`,
  },
  {
    slug: "nurture-fragmentation",
    gender: "female",
    scene: `${WOMAN}, shown in near-black silhouette from the chest up, standing dead centre and facing forward. She is surrounded by five clearly SEPARATE clusters of geometric shapes, spaced far apart across the wide banner, each cluster a different flat colour block (warm gold, amber, burnt orange, deep charcoal) and each enclosed in its own hard-edged rounded rectangle. Crucially, NO lines connect any cluster to any other cluster or to the figure. The gaps between the clusters are wide, empty near-black voids. Repeating dot rows run along the bottom edge but stop short at every gap.`,
  },
  {
    slug: "nurture-first-move",
    gender: "male",
    scene: `${MAN}, shown in near-black silhouette from behind and slightly below, standing at the left of the banner facing right. Spread in front of him across the wide frame are seven diverging paths rendered as hard-edged flat geometric bands receding toward the right. Six of the paths are dim deep charcoal, flat and unlit. ONE path, the third from the bottom, is brilliant warm gold, wider than the rest, and leads to a single bright concentric arc burst at the right edge. Repeating gold dot rows mark the steps along the lit path only.`,
  },
  {
    slug: "nurture-proven-buyers",
    gender: "female",
    scene: `${WOMAN}, shown in near-black silhouette from the chest up at the right of the banner, turned toward the left and looking down at the crowd. Filling the left two thirds of the wide frame is a massive dense field of small flat deep-charcoal circles, hundreds of them, uniform and dim, representing a huge passive crowd. Inside that field, a small tight cluster of roughly twelve circles is rendered in brilliant warm gold and amber, noticeably larger than the rest, ringed by a single hard concentric gold arc that separates them from the dim mass. Gold sunburst rays radiate from that small bright cluster only.`,
  },
  {
    slug: "nurture-one-record",
    gender: "male",
    scene: `${MAN}, wearing a hoodie, with a short modern fade haircut and a clean-shaven youthful face that unmistakably reads mid twenties, NOT a suit, NOT a full beard, NOT middle-aged. He is shown in near-black silhouette from the chest up at the centre of the banner. Radiating outward from a single bright warm gold hexagon at his chest are clean hard-edged gold connector lines reaching to six flat geometric icons arranged symmetrically across the wide frame (a circle, a square, a triangle, a ring, a bar, a diamond) in amber and burnt orange. Every icon is joined to the central hexagon by an unbroken line, and the icons are also joined to each other around the ring, forming one closed connected system. Concentric gold arcs ripple outward behind the whole structure.`,
  },
  {
    slug: "nurture-parallel-bridge",
    gender: "male",
    scene: `${MAN}, shown in near-black silhouette from the chest up, standing at the centre of the banner facing forward. To his left is an older structure built from stacked flat deep-charcoal and burnt-orange blocks, still standing, still intact, clearly not demolished. To his right is a newer, cleaner structure of flat warm-gold and amber blocks. Spanning the gap between the two structures at mid height is a single solid, wide, hard-edged gold bridge, with repeating gold dot rows crossing it in one direction. Both structures remain whole and lit; nothing is broken, falling, or crossed out. Concentric arcs frame the scene behind.`,
  },
  {
    slug: "nurture-one-piece",
    gender: "female",
    scene: `${WOMAN}, shown in near-black silhouette from the waist up at the right of the banner, one arm extended left, calmly placing a single small bright warm gold square block into a waiting notch. To the left, a large flat structure of deep charcoal and amber geometric blocks is already assembled and complete except for that one empty notch. The gesture is light and effortless, one hand, one small piece. The rest of the structure is untouched and stable. A soft burst of gold sunburst rays emanates from the notch she is filling.`,
  },
  {
    slug: "nurture-stack-collapse",
    gender: "male",
    scene: `${MAN}, shown in near-black silhouette from the chest up at the right of the banner, watching to the left. Across the left of the wide frame, a tall cluttered leaning stack of many mismatched flat geometric blocks in deep charcoal, burnt orange and amber is shown mid-transition: the upper blocks are dispersing into small fragments while the lower blocks are merging and consolidating into ONE clean, solid, hard-edged warm gold rounded rectangle at the centre of the banner. The progression reads clearly left to right, from many cluttered pieces to a single clean form. Concentric gold arcs radiate from the consolidated form.`,
  },
  {
    slug: "nurture-compounding",
    gender: "male",
    scene: `${MAN}, shown in near-black silhouette from the chest up at the far left of the banner, facing right. Extending across the wide frame to the right is a single connected chain of four flat geometric stages, each a hard-edged rounded shape linked to the next by a solid gold connector line: the first stage a small dim charcoal circle, the second a larger amber circle, the third a larger burnt-orange hexagon, the fourth a large brilliant warm gold star burst. Each stage is visibly LARGER and brighter than the one before it, so the growth reads instantly. Repeating gold dot rows run beneath the chain, increasing in density toward the right.`,
  },
  {
    slug: "nurture-ownership",
    gender: "female",
    scene: `${WOMAN}, shown in near-black silhouette from the chest up at the centre-right of the banner, facing forward with quiet confidence. Far to the left, occupying the distant background, is an enormous flat field of tiny uniform deep-charcoal dots, dim and undifferentiated, with NO lines reaching the figure. Close around her on the right, roughly nine larger flat warm-gold and amber circles are each joined DIRECTLY to her silhouette by a short, thick, unbroken gold line. The contrast is between a vast unconnected distant mass and a small set of direct, solid, personal connections. Concentric gold arcs frame her.`,
  },
  {
    slug: "nurture-transformation",
    gender: "male",
    scene: `${MAN}, shown in near-black silhouette from the chest up at the exact centre of the banner, facing forward. The wide frame is split by his figure into two halves that mirror each other. The LEFT half is scattered chaos: small flat geometric fragments in dim deep charcoal and dull burnt orange strewn at random angles with wide empty gaps and no connecting lines. The RIGHT half is the same quantity of fragments, but resolved into a clean ordered grid of hard-edged warm gold and amber blocks, aligned, evenly spaced, and joined by solid gold connector lines. No text, no arrow, no divider line: the contrast alone carries it. Gold sunburst rays radiate from the figure outward across the ordered right side.`,
  },
  {
    slug: "nurture-return",
    gender: "male",
    scene: `${MAN}, wearing a hoodie and joggers with a slim youthful build and short twists, unmistakably in his early twenties, NOT a suit, NOT a coat, NOT middle-aged. He is shown in near-black silhouette from behind, standing small at the lower left of the wide banner, facing right and up. Ahead of him a single broad warm gold path of hard-edged flat geometric bands recedes into the distance toward a large bright concentric arc burst at the upper right, still clearly lit and open. Along the path, repeating gold dot rows are spaced widely at the near end and grow denser toward the light. The surrounding field is deep charcoal and quiet. The mood is patient and unhurried, a way back that stayed open.`,
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
  if (fs.existsSync(outPath) && !force) { console.log(`SKIP ${outPath} (exists)`); skipped++; continue; }

  const prompt = `${item.scene}\n\n${STYLE}`;
  console.log(`Generating ${item.slug} (${item.gender})...`);
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
    });

    let imageData = null;
    for (const cand of response.candidates || []) {
      for (const p of cand.content?.parts || []) {
        if (p.inlineData?.data) { imageData = p.inlineData.data; break; }
      }
      if (imageData) break;
    }
    if (!imageData) { console.error(`FAIL ${item.slug}: no image in response`); failed.push(item.slug); continue; }

    // WebP, never JPEG: flat colour + hard edges are the DCT worst case.
    await sharp(Buffer.from(imageData, "base64")).webp({ quality: 82 }).toFile(outPath);
    const size = fs.statSync(outPath).size;
    console.log(`OK   ${outPath} (${size.toLocaleString()} bytes)`);
    ok++;
  } catch (err) {
    console.error(`ERROR ${item.slug}: ${err.message}`);
    failed.push(item.slug);
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

console.log(`\nDone. generated=${ok} skipped=${skipped} failed=${failed.length}`);
if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
