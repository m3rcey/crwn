// Per-job cost ledger (§24, §37). Tracks cost per ACCEPTED image, not cost per
// call. Records raw token usage alongside USD so a price-table update recosts
// history. Unknown price -> usd:null and a flag; a price is never invented.

import { PRICES, CAPS } from "../config.mjs";

/** @typedef {{
 *  stage: 'storyboard'|'image'|'qc'|'generative_video'|'music'|'render',
 *  model: string|null,
 *  sceneIndex?: number,
 *  attempt?: number,
 *  accepted?: boolean,
 *  rejectionReason?: string|null,
 *  inputTokens?: number,
 *  outputTokens?: number,
 *  imageSize?: string,
 *  usd: number|null,
 *  at: string,
 * }} LedgerEntry */

export function costForImageCall(model, imageSize, inputTokens = 0) {
  const p = PRICES[model];
  if (!p || !p.perImage || p.perImage[imageSize] == null) return null;
  const inCost = p.inPerM != null ? (inputTokens / 1e6) * p.inPerM : 0;
  return round4(p.perImage[imageSize] + inCost);
}

export function costForTextCall(model, inputTokens = 0, outputTokens = 0) {
  const p = PRICES[model];
  if (!p || p.inPerM == null || p.outPerM == null) return null;
  return round4((inputTokens / 1e6) * p.inPerM + (outputTokens / 1e6) * p.outPerM);
}

export function newLedger() {
  return { entries: [], flags: [] };
}

export function addEntry(ledger, entry) {
  ledger.entries.push({ ...entry, at: new Date().toISOString() });
  if (entry.usd === null) {
    ledger.flags.push(
      `no verified price for ${entry.model} (${entry.stage}); tokens recorded, USD unknown`
    );
  }
  return ledger;
}

export function totals(ledger) {
  const byStage = {};
  let total = 0;
  let unknown = 0;
  for (const e of ledger.entries) {
    byStage[e.stage] = byStage[e.stage] || { usd: 0, calls: 0, unknownCalls: 0 };
    byStage[e.stage].calls++;
    if (e.usd == null) {
      byStage[e.stage].unknownCalls++;
      unknown++;
    } else {
      byStage[e.stage].usd = round4(byStage[e.stage].usd + e.usd);
      total += e.usd;
    }
  }
  const imageEntries = ledger.entries.filter((e) => e.stage === "image");
  const acceptedImages = imageEntries.filter((e) => e.accepted).length;
  const imageAttempts = imageEntries.length;
  const imageUsd = imageEntries.reduce((a, e) => a + (e.usd || 0), 0);
  return {
    byStage,
    totalUsd: round4(total),
    unknownPriceCalls: unknown,
    acceptedImages,
    imageAttempts,
    attemptMultiplier: acceptedImages ? round4(imageAttempts / acceptedImages) : null,
    costPerAcceptedImage: acceptedImages ? round4(imageUsd / acceptedImages) : null,
  };
}

/** Spend guard: true when the next call of `estimatedUsd` would cross the job
 * ceiling. Callers stop LOUDLY, they never continue silently (§50). */
export function wouldExceedCeiling(ledger, estimatedUsd, ceiling = CAPS.maxJobSpendUsd) {
  const t = totals(ledger);
  return t.totalUsd + (estimatedUsd || 0) > ceiling;
}

/** Pre-generation estimate (§38). */
export function estimateJobCost(sceneCount, imageModel, imageSize, opts = {}) {
  const attempts = opts.expectedAttemptsPerAcceptedImage ?? CAPS.expectedAttemptsPerAcceptedImage;
  const perImage = costForImageCall(imageModel, imageSize, 2500);
  const storyboard = opts.storyboardUsd ?? 0.08;
  const qcPerCall = opts.qcUsd ?? 0.01;
  const images = perImage != null ? perImage * sceneCount * attempts : null;
  const qc = qcPerCall * sceneCount * attempts;
  return {
    storyboardUsd: storyboard,
    imagesUsd: images != null ? round4(images) : null,
    qcUsd: round4(qc),
    generativeVideoUsd: 0,
    musicUsd: 0,
    renderApiUsd: 0,
    totalUsd: images != null ? round4(storyboard + images + qc) : null,
    assumptions: { sceneCount, attempts, perImageUsd: perImage, imageModel, imageSize },
  };
}

export function formatCostReport(ledger, estimate = null) {
  const t = totals(ledger);
  const line = (label, v) => `${label.padEnd(20)}$${(v ?? 0).toFixed(2)}`;
  const lines = [
    "VIDEO COST",
    "",
    `Accepted master images: ${t.acceptedImages}`,
    `Total image attempts: ${t.imageAttempts}`,
    "",
    line("Storyboard:", t.byStage.storyboard?.usd),
    line("Image generation:", t.byStage.image?.usd),
    line("Image QC:", t.byStage.qc?.usd),
    line("Generative video:", 0),
    line("Music:", 0),
    line("Render API cost:", 0),
    "",
    line("TOTAL:", t.totalUsd),
    "",
    `Cost / accepted image: ${t.costPerAcceptedImage != null ? `$${t.costPerAcceptedImage.toFixed(3)}` : "n/a"}`,
    `Observed attempts per accepted image: ${t.attemptMultiplier ?? "n/a"}`,
  ];
  if (t.unknownPriceCalls) lines.push(`NOTE: ${t.unknownPriceCalls} calls had no verified price (tokens recorded).`);
  if (estimate) lines.push(`Pre-run estimate was: $${estimate.totalUsd?.toFixed(2)}`);
  return lines.join("\n");
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
