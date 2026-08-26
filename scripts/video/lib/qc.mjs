// Automated image QC (§26): deterministic checks first (free), then ONE low-cost
// vision call per attempt that both verifies content and localizes the scene's
// elements on the ACTUAL generated page (boxes feed the camera). A QC infra
// failure degrades to deterministic-only acceptance with a warning; it never burns
// a paid regeneration on its own.

import sharp from "sharp";
import { IMAGE, MODELS } from "../config.mjs";
import { costForTextCall, addEntry } from "./ledger.mjs";

const WHITE_THRESHOLD = 200;

// Same maths as the proven still-image generator (generate-fan-economy-images.mjs):
// saturation is the tell on a black-ink-on-white-paper sheet.
export async function countColouredPixels(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  let coloured = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) coloured++;
  }
  return { coloured, totalPixels: data.length / info.channels };
}

export async function flattenWhiteBackground(filePath) {
  const { data, info } = await sharp(filePath).raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  let flipped = 0;
  for (let i = 0; i < data.length; i += c) {
    if (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      flipped++;
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: c } })
    // Masters get zoomed into by the renderer: 4:4:4 keeps hard sharpie edges clean.
    .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
    .toFile(filePath);
  return flipped;
}

/** Deterministic pre-checks. Returns { ok, failures[], warnings[] }. */
export async function deterministicChecks(filePath) {
  const failures = [];
  const warnings = [];
  const meta = await sharp(filePath).metadata();
  const aspect = meta.width / meta.height;
  // Must be a tall page; 9:16 = 0.5625, 3:4 fallback = 0.75.
  if (aspect > 0.8) failures.push(`image aspect ${aspect.toFixed(2)} is not vertical`);
  const { coloured, totalPixels } = await countColouredPixels(filePath);
  const colourRatio = coloured / totalPixels;
  if (colourRatio > 0.001) failures.push(`colour intrusion: ${(colourRatio * 100).toFixed(2)}% non-greyscale pixels on a B&W sheet`);
  else if (coloured > 0) warnings.push(`${coloured} faintly coloured pixels (below threshold)`);
  return { ok: failures.length === 0, failures, warnings, width: meta.width, height: meta.height };
}

function buildQcPrompt(scene, forbidden) {
  const required = (scene.screenText || []).filter(Boolean);
  const elements = (scene.elements || []).map((e) => ({ id: e.id, desc: e.desc, text: e.text || null }));
  return `You are checking a generated hand-drawn black-sharpie-on-white-paper page for a silent video.

REQUIRED TEXT (each must appear exactly once, hand-lettered, correctly spelled):
${required.map((t) => `- "${t}"`).join("\n") || "(none)"}

FORBIDDEN CONTENT (must NOT appear anywhere):
${forbidden.map((t) => `- "${t}"`).join("\n") || "(none)"}
- the word CRWN, any crown drawing, any logo or watermark
- any gibberish, duplicated, or partial words; any extra numbers not in the required list

ELEMENTS TO LOCATE (report a bounding box for each you can find):
${JSON.stringify(elements)}

Also judge:
- majorDefects: severely broken anatomy, an essential element cropped off the page,
  a composition failure that would distract a viewer, typeset/printed-looking text
  instead of hand-lettering. Minor wobble is fine and expected.

Reply with ONLY JSON:
{
  "requiredTextFound": [{"text": string, "found": boolean, "renderedAs": string?}],
  "forbiddenFound": string[],
  "extraProminentText": string[],
  "majorDefects": string[],
  "elements": [{"id": string, "box_2d": [ymin, xmin, ymax, xmax]}]
}
box_2d values are 0-1000 normalized to the image.`;
}

/**
 * Vision QC + localization for one attempt.
 * @returns {{ ok: boolean|null, failures: string[], boxes: Record<string,{x,y,w,h}>, raw: any }}
 *  ok === null means QC infrastructure failed (do not reject the image for that).
 */
export async function visionQc(filePath, scene, forbidden, client, ledger) {
  let resized;
  try {
    resized = await sharp(filePath)
      .resize({ height: IMAGE.qcInputHeight, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (err) {
    return { ok: null, failures: [`qc resize failed: ${err.message}`], boxes: {}, raw: null };
  }
  let res;
  try {
    res = await client.callModel({
      model: MODELS.qcVision,
      prompt: buildQcPrompt(scene, forbidden),
      image: { mimeType: "image/jpeg", data: resized.toString("base64") },
      json: true,
    });
  } catch (err) {
    return { ok: null, failures: [`qc call failed: ${err.message}`], boxes: {}, raw: null };
  }
  if (ledger) {
    addEntry(ledger, {
      stage: "qc",
      model: MODELS.qcVision,
      sceneIndex: scene.index,
      inputTokens: res.inputTokens || 0,
      outputTokens: res.outputTokens || 0,
      usd: costForTextCall(MODELS.qcVision, res.inputTokens || 0, res.outputTokens || 0),
    });
  }
  let parsed;
  try {
    const start = res.text.indexOf("{");
    parsed = JSON.parse(res.text.slice(start, res.text.lastIndexOf("}") + 1));
  } catch (err) {
    return { ok: null, failures: [`qc reply unparseable: ${err.message}`], boxes: {}, raw: res.text };
  }

  const failures = [];
  for (const r of parsed.requiredTextFound || []) {
    if (!r.found) failures.push(`required text missing/wrong: "${r.text}"${r.renderedAs ? ` (rendered as "${r.renderedAs}")` : ""}`);
  }
  for (const f of parsed.forbiddenFound || []) failures.push(`forbidden content present: "${f}"`);
  for (const d of parsed.majorDefects || []) failures.push(`major defect: ${d}`);

  const boxes = {};
  for (const el of parsed.elements || []) {
    if (Array.isArray(el.box_2d) && el.box_2d.length === 4 && el.id) {
      const [ymin, xmin, ymax, xmax] = el.box_2d.map((v) => Math.min(Math.max(v / 1000, 0), 1));
      if (xmax > xmin && ymax > ymin) {
        boxes[el.id] = { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin };
      }
    }
  }
  return { ok: failures.length === 0, failures, boxes, raw: parsed };
}
