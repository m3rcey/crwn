// Master image generation (§23-§27): the proven Fan Economy pipeline (style refs +
// auto person refs + 4K + white-flatten) adapted to per-scene 9:16 video masters.
// Retry ladder: attempts 1-2 on the ECONOMY model, attempt 3 escalates to QUALITY
// (Nano Banana Pro) — optimizing cost per ACCEPTED image, not per call. Hard caps
// and the job spend ceiling stop runaway spending loudly.

import fs from "node:fs";
import path from "node:path";
import { CAPS, IMAGE, MODELS, PATHS, STYLE_REFS } from "../config.mjs";
import { deterministicChecks, flattenWhiteBackground, visionQc } from "./qc.mjs";
import { addEntry, costForImageCall, wouldExceedCeiling } from "./ledger.mjs";
import {
  ensurePersonRefs,
  buildPersonRefParts,
  PERSON_REF_INSTRUCTION,
  loadKnownPeople,
} from "../../../fetch-person-ref.mjs";

// Style boilerplate: same contract as the proven still generator
// (generate-fan-economy-images.mjs), which produced the accepted reference set.
// Kept in sync by hand; if the still generator's STYLE_INSTRUCTION changes, change
// this too (docs/VIDEO_PIPELINE.md records this coupling).
export const STYLE_INSTRUCTION =
  "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and diagrams, high contrast black on white, no gray tones, no background texture. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL MONOCHROME RULE: the entire image is BLACK INK ON WHITE PAPER and contains NO COLOUR WHATSOEVER. There is no gold, no yellow, no red, no blue, no green and no coloured accent anywhere, not on a chain, a logo, a garment, a record label, a highlight or any object. The attached person reference photographs ARE in colour and their colours must NOT be copied: translate every one of them into black marker line work. If a person wears a gold chain or coloured clothing in their photo, draw it in black ink like everything else. Every pixel in the finished page is either black ink or white paper. CRITICAL BACKGROUND RULE: The background must be PURE WHITE (#FFFFFF), absolutely flat, edge to edge. NO off-white, cream, eggshell, beige, or warm paper tones. NO desk, table, notebook, binding, or surface visible underneath. NO shadows under the page, NO page curl, NO page edges, NO paper texture or grain. The entire frame IS the paper — there is no visible surface, no background object, no hint that the paper is sitting on anything. This is a flat editorial scan, not a photograph of a sheet on a desk. Pure #FFFFFF pixels fill every edge of the frame. CRITICAL FONT RULE: ALL text in the image must be hand-drawn sharpie marker handwriting. NEVER use any printed, typeset, computer, Arial, Helvetica, serif, or sans-serif font anywhere in the image. Every single letter, number, word, label, header, list item, footer, and bottom tagline must look hand-written with a sharpie. No typography, no mixed fonts, no computer-generated text anywhere, not even in bottom taglines, captions, or footers. CRITICAL HEADLINE RULE: the single most common failure is the LARGEST headline text at the top of the page rendering as a clean printed, bold, or display font. The big hook headline MUST be thick, slightly uneven, hand-drawn sharpie capital lettering, exactly as if a person wrote it fast with a marker, with imperfect baselines and varying stroke widths. NEVER render the headline (or any text at any size) as a typeset, bold, or display font. Every size of text, especially the biggest headline, is hand-lettered by marker. MARKER FILL TEXTURE: any solid black or filled-in area (filled shapes, redaction bars, blacked-out regions, shaded pie slices, thick fills) must look HAND-FILLED with a real sharpie marker, NOT a flat digital fill. Show visible directional marker strokes, slightly uneven coverage, faint lighter streaks where the marker lifted, tiny specks and flecks of white paper showing through the fill, and slightly ragged stroke edges, exactly like a person colored the area in by hand with a marker that was running a little dry. NEVER render a solid area as a perfectly uniform, smooth, vector-flat black. This streaky texture lives INSIDE the black fills only; it is NOT gray shading and it does NOT change the page background, which stays pure flat white (#FFFFFF), and thin line work stays clean and bold.";

const PROMPT_TAIL =
  " Render only the exact words given inside quotation marks; never draw any instruction words, labels, or parentheses from this prompt, and never repeat a line anywhere at any size. CRITICAL: there is NO text of any kind on clothing, hats, caps, jackets, coats, chains, sunglasses, record labels or any object in the scene; every garment is completely blank. Invent no extra words, no nonsense words, no partial words, and no extra numbers. Never draw the word CRWN, a crown, or any logo. Solid black fills look hand-colored with visible directional marker streaks and tiny flecks of white paper showing through. The background is pure white (#FFFFFF). The image is shot perfectly straight on, no angle, no shadow, no background elements. Pure white paper fills the entire 9:16 vertical frame edge to edge.";

function titleCase(s) {
  return s.split("-").map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

/** Portrait directive, same shape as the proven generator's. */
export function portraitDirective(personRefs) {
  if (!personRefs.length) return "";
  const known = loadKnownPeople();
  const names = personRefs.map((r) => known[r.slug]?.name || titleCase(r.slug));
  const nameList =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const drawNotes = personRefs.map((r) => known[r.slug]?.draw).filter(Boolean);
  const drawClause = drawNotes.length ? ` IMPORTANT: ${drawNotes.join(" ")}` : "";
  return ` Draw ${nameList} as the central recognizable character in the scene, a full or half figure actually performing the action the prompt describes (not a separate floating head-shot), with a clearly recognizable face from the attached reference photo (face shape, hair, facial hair if any, signature look), labeled in capital letters with the name, rendered in the same raw black sharpie line work as the rest of the page (not photo-real, no shading or color); the face must still read as ${nameList} even in simple sharpie style.${drawClause}`;
}

export function buildScenePrompt(scene, personRefs) {
  return `${scene.imagePrompt.trim()}${portraitDirective(personRefs)}${PROMPT_TAIL}`;
}

function loadStyleRefParts() {
  return STYLE_REFS.map((f) => ({
    inlineData: {
      mimeType: "image/png",
      data: fs.readFileSync(path.join(PATHS.refsDir, f)).toString("base64"),
    },
  }));
}

/** Forbidden strings for a pre-reveal scene: the storyboard's withheld/reveal text. */
export function forbiddenForScene(storyboard, scene) {
  const revealIndex = storyboard.scenes.findIndex((s) => s.roles.includes("REVEAL"));
  if (revealIndex !== -1 && scene.index >= revealIndex) return [];
  return [...(storyboard.withheldInformation || []), ...(storyboard.revealText || [])].filter(
    (s) => s && s.length >= 2
  );
}

/**
 * Generate one scene's master image, with QC and the retry ladder.
 * @param {object} args
 * @param {import('./schema.mjs').Storyboard} args.storyboard
 * @param {import('./schema.mjs').Scene} args.scene
 * @param {string} args.jobDir
 * @param {{ generateImage: Function, callModel: Function }} args.client
 * @param {object} args.ledger
 * @param {{ attemptsSoFar?: number, log?: (s:string)=>void }} [args.opts]
 * @returns {Promise<{accepted: boolean, imageFile?: string, boxes?: object, attempts: object[], reason?: string}>}
 */
export async function generateSceneImage({ storyboard, scene, jobDir, client, ledger, opts = {} }) {
  const log = opts.log || (() => {});
  const imagesDir = path.join(jobDir, "images");
  const rejectedDir = path.join(jobDir, "rejected");
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(rejectedDir, { recursive: true });

  const forbidden = forbiddenForScene(storyboard, scene);
  const attempts = [];
  let correctiveClause = "";
  // Loaded lazily AFTER the cap checks so a capped-out call never touches the
  // reference library (and unit tests stay hermetic).
  let personRefs = null;
  let personRefParts = null;
  let styleRefParts = null;

  for (let attempt = 1; attempt <= CAPS.maxAttemptsPerScene; attempt++) {
    if ((opts.attemptsSoFar || 0) + attempts.length >= CAPS.maxTotalImageAttempts) {
      return { accepted: false, attempts, reason: `job attempt cap (${CAPS.maxTotalImageAttempts}) reached` };
    }
    const model = attempt < CAPS.maxAttemptsPerScene ? MODELS.imageEconomy : MODELS.imageQuality;
    const estimated = costForImageCall(model, IMAGE.imageSize, 3000) || 0.25;
    if (wouldExceedCeiling(ledger, estimated)) {
      return { accepted: false, attempts, reason: "job spend ceiling reached; stopping before this call" };
    }

    if (personRefs === null) {
      personRefs = await ensurePersonRefs(scene.people || []);
      personRefParts = buildPersonRefParts(personRefs);
      styleRefParts = loadStyleRefParts();
    }
    const parts = [{ text: STYLE_INSTRUCTION }, ...styleRefParts];
    if (personRefParts.length) {
      parts.push({ text: PERSON_REF_INSTRUCTION });
      parts.push(...personRefParts);
    }
    parts.push({ text: buildScenePrompt(scene, personRefs) + correctiveClause });

    log(`  scene ${scene.index} attempt ${attempt} on ${model}...`);
    let gen;
    try {
      gen = await client.generateImage({ model, parts, aspectRatio: IMAGE.aspectRatio, imageSize: IMAGE.imageSize });
    } catch (err) {
      attempts.push({ attempt, model, accepted: false, reason: `API error: ${err.message}` });
      addEntry(ledger, { stage: "image", model, sceneIndex: scene.index, attempt, accepted: false, rejectionReason: `API error: ${err.message}`, usd: 0 });
      continue;
    }
    const usd = costForImageCall(model, gen.imageSize || IMAGE.imageSize, gen.inputTokens || 0);

    const attemptFile = path.join(rejectedDir, `scene-${pad2(scene.index)}-attempt-${attempt}.jpg`);
    fs.writeFileSync(attemptFile, gen.imageBuffer);
    await flattenWhiteBackground(attemptFile);

    const det = await deterministicChecks(attemptFile);
    let failures = [...det.failures];
    let boxes = {};
    if (det.ok) {
      const vis = await visionQc(attemptFile, scene, forbidden, client, ledger);
      if (vis.ok === false) failures.push(...vis.failures);
      else if (vis.ok === null) log(`  scene ${scene.index}: QC unavailable (${vis.failures[0]}); accepting on deterministic checks`);
      boxes = vis.boxes || {};
    }

    const accepted = failures.length === 0;
    attempts.push({ attempt, model, accepted, reason: accepted ? null : failures.join("; "), file: attemptFile, usd });
    addEntry(ledger, {
      stage: "image",
      model,
      sceneIndex: scene.index,
      attempt,
      accepted,
      rejectionReason: accepted ? null : failures.join("; "),
      inputTokens: gen.inputTokens || 0,
      imageSize: gen.imageSize || IMAGE.imageSize,
      usd,
    });

    if (accepted) {
      const finalFile = path.join(imagesDir, `scene-${pad2(scene.index)}.jpg`);
      fs.copyFileSync(attemptFile, finalFile);
      fs.unlinkSync(attemptFile);
      return { accepted: true, imageFile: finalFile, boxes, attempts };
    }
    log(`  scene ${scene.index} attempt ${attempt} REJECTED: ${failures.join("; ")}`);
    correctiveClause = ` PREVIOUS ATTEMPT FAILED QC FOR: ${failures.join("; ")}. Correct every one of these in this generation.`;
    if (IMAGE.delayBetweenCallsMs) await sleep(IMAGE.delayBetweenCallsMs);
  }
  return { accepted: false, attempts, reason: attempts[attempts.length - 1]?.reason || "all attempts rejected" };
}

function pad2(n) {
  return String(n + 1).padStart(2, "0");
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
