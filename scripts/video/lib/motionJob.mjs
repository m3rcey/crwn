// Orchestration for a handwritten-motion video: plan, render, repair, verify.
//
// Sits beside the master-image job in lib/job.mjs and reuses it: same slug rules,
// same videos/output/<slug>/ directory, same music selector, same ledger. The one
// thing it does differently is where the words come from, and that is the whole
// point of it.

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, MOTION, RENDER, CAPS, MODELS } from "../config.mjs";
import { parseScriptMarkdown } from "./scriptParse.mjs";
import { buildFactLock, factLockDigest } from "./factLock.mjs";
import { validateMotionSpec, specDurationSec, scaffoldMotionSpec, resolveTextLayer } from "./motionSpec.mjs";
import { ensurePlates, platesContactSheet } from "./plates.mjs";
import { ensureSprites, fontProvenance } from "./lettering.mjs";
import { collectSprites, renderMotionVideo, dryRunManifest } from "./motionRender.mjs";
import { verifyStructure, verifyFacts, verifyLayout, visualQa, verifyMotionPresence, figuresOnScreen } from "./verify.mjs";
import { proposeTrack } from "./music.mjs";
import { jobDir, safeSlug, readArtifact, writeArtifact } from "./job.mjs";

export function specPath(slug) {
  return path.join(MOTION.specsDir, `${safeSlug(slug)}.json`);
}

/** Everything a motion command needs, with the source script as semantic truth. */
export function loadContext(slug, scriptPath) {
  const safe = safeSlug(slug);
  const resolvedScript = scriptPath || path.join(REPO_ROOT, "videos/scripts/fan-economy", `${safe}.md`);
  if (!fs.existsSync(resolvedScript)) throw new Error(`source script not found: ${resolvedScript}`);
  const parsed = parseScriptMarkdown(fs.readFileSync(resolvedScript, "utf-8"));
  const lock = buildFactLock(parsed, { slug: safe });
  const sp = specPath(safe);
  if (!fs.existsSync(sp)) {
    throw new Error(`no motion spec at ${sp}. Run: npm run video:motion-scaffold -- ${safe}`);
  }
  const spec = JSON.parse(fs.readFileSync(sp, "utf-8"));
  const storyboard = readArtifact(safe, "storyboard.json");
  return { slug: safe, scriptPath: resolvedScript, parsed, lock, spec, storyboard, dir: jobDir(safe) };
}

/** PLAN: validate everything before a single frame is drawn. Costs $0. */
export async function planMotion(slug, opts = {}) {
  const log = opts.log || console.log;
  const ctx = loadContext(slug, opts.scriptPath);
  for (const w of ctx.parsed.warnings) log(`parse warn: ${w}`);

  const validation = validateMotionSpec(ctx.spec, ctx.lock, {
    storyboard: ctx.storyboard,
    repoRoot: REPO_ROOT,
  });
  const plateMap = validation.ok
    ? await ensurePlates(ctx.spec, { repoRoot: REPO_ROOT, cacheDir: path.join(ctx.dir, "plates"), log })
    : new Map();

  const { requests } = collectSprites(ctx.spec);
  const unique = new Set(requests.map((r) => r.hash));

  log("");
  log(`TITLE: ${ctx.spec.title}`);
  log(`SOURCE: ${ctx.scriptPath}`);
  log(`CTA KEYWORD: ${ctx.lock.ctaKeyword}`);
  log(`FACT LOCK: ${ctx.lock.numbers.size} approved figures, digest ${factLockDigest(ctx.lock).slice(0, 40)}...`);
  log(`DURATION: ${specDurationSec(ctx.spec).toFixed(2)}s across ${ctx.spec.scenes.length} scenes`);
  log(`PLATES: ${ctx.spec.plates.length} illustration crops (${plateMap.size} extracted)`);
  log(`LETTERING: ${unique.size} unique sprites to render locally`);
  log("");
  let cursor = 0;
  for (const scene of ctx.spec.scenes) {
    const motions = [
      ...(scene.plates || []).map((p) => `${p.plate}:${p.motion?.kind || "HOLD"}`),
      ...(scene.shapes || []).map((s) => `${s.shape}:draw`),
    ];
    log(`[${scene.index}] ${(scene.roles || []).join("+")} @${cursor.toFixed(1)}s for ${scene.durationSec}s`);
    log(`    ${scene.purpose}`);
    if (motions.length) log(`    art: ${motions.join("  ")}`);
    for (const t of scene.text || []) {
      log(`    text "${t.text.replace(/\n/g, " / ")}" [${t.motion?.kind}]`);
    }
    cursor += scene.durationSec;
  }
  log("");
  log(`VALIDATION: ${validation.ok ? "PASS" : "FAIL"}`);
  for (const e of validation.errors) log(`  ERROR: ${e}`);
  for (const w of validation.warnings) log(`  warn: ${w}`);
  log("");
  log("COST: $0.00 of image generation, $0.00 of video generation, $0.00 of model calls.");
  log("  Artwork is crops of an already-accepted sheet; lettering is local Chrome + OFL fonts:");
  for (const f of fontProvenance()) log(`    ${f.family}: ${f.licence}`);

  if (plateMap.size) {
    const sheet = await platesContactSheet(plateMap, path.join(ctx.dir, "verify", "plates.jpg"), { cols: 4, cell: 460 });
    log(`\nPLATE SHEET (check that no plate carries lettering): ${sheet.file}`);
  }

  // GEOMETRY PROBE. Lettering is cached and the placement maths is pure, so the
  // exact on-screen boxes and the whole fact check are available here for free.
  // Finding a safe-zone violation costs a second instead of a two-minute encode.
  let geometry = null;
  if (validation.ok && !opts.skipGeometry) {
    const { byLayer, sheet } = collectSprites(ctx.spec);
    const spriteMap = await ensureSprites(requests, {
      cacheDir: MOTION.spriteCacheDir,
      log: () => {},
      chromeRunner: opts.chromeRunner,
    });
    const manifest = dryRunManifest(ctx.spec, { sheet, spriteMap, byLayer, lock: ctx.lock });
    const facts = verifyFacts(manifest, ctx.lock, ctx.spec);
    const layout = verifyLayout(manifest);
    geometry = { ok: facts.ok && layout.ok, facts, layout };
    log("");
    log(`GEOMETRY + FACT PROBE (no frames drawn): ${geometry.ok ? "PASS" : "FAIL"}`);
    for (const e of [...facts.errors, ...layout.errors]) log(`  ERROR: ${e}`);
    for (const w of [...facts.warnings, ...layout.warnings]) log(`  warn: ${w}`);
    writeArtifact(ctx.slug, "motion-geometry.json", { manifest, facts, layout });
  }

  writeArtifact(ctx.slug, "motion-validation.json", validation);
  return { ctx, validation, plateMap, geometry };
}

/** RENDER (or repair). Refuses to draw anything if validation fails. */
export async function renderMotion(slug, opts = {}) {
  const log = opts.log || console.log;
  const { ctx, validation, plateMap, geometry } = await planMotion(slug, { ...opts, log: opts.quietPlan ? () => {} : log });
  if (!validation.ok) {
    throw new Error(`motion spec invalid, nothing rendered:\n  ${validation.errors.join("\n  ")}`);
  }

  if (geometry && !geometry.ok && !opts.allowGeometryFailures) {
    throw new Error(
      "geometry/fact probe failed, nothing rendered:\n  " +
        [...geometry.facts.errors, ...geometry.layout.errors].join("\n  ")
    );
  }

  const { requests, byLayer, sheet } = collectSprites(ctx.spec);
  const spriteMap = await ensureSprites(requests, {
    cacheDir: MOTION.spriteCacheDir,
    log,
    chromeRunner: opts.chromeRunner,
  });

  const duration = specDurationSec(ctx.spec);
  let music = null;
  if (opts.noMusic !== true) {
    const prior = readArtifact(ctx.slug, "motion-music.json");
    if (prior && !opts.musicName && !opts.repickMusic) music = prior.music;
    else music = proposeTrack(duration, { overrideName: opts.musicName || null, record: true });
    const light = { ...music };
    delete light.analysis;
    writeArtifact(ctx.slug, "motion-music.json", { music: light });
    log(`music: ${music.track} [${music.tier}] bpm=${music.bpm ?? "?"} @${music.segmentStart}s`);
  }

  const result = await renderMotionVideo(ctx.spec, {
    plateMap,
    spriteMap,
    byLayer,
    sheet,
    music: music ? { trackPath: music.sourcePath, segmentStart: music.segmentStart } : null,
    outDir: ctx.dir,
    lock: ctx.lock,
    onlyScenes: opts.onlyScenes,
    log,
  });
  writeArtifact(ctx.slug, "motion-manifest.json", result.manifest);
  log(`\nFINAL VIDEO: ${result.finalPath}`);
  return { ctx, ...result, plateMap, spriteMap };
}

/** VERIFY: levels 1-3 against whatever is on disk. */
export async function verifyMotion(slug, opts = {}) {
  const log = opts.log || console.log;
  const ctx = loadContext(slug, opts.scriptPath);
  const manifest = readArtifact(ctx.slug, "motion-manifest.json");
  if (!manifest) throw new Error(`no motion-manifest.json for ${ctx.slug}; render it first`);
  const finalPath = path.join(ctx.dir, "render", "final.mp4");

  const l1 = await verifyStructure(finalPath, ctx.spec, { expectAudio: opts.expectAudio });
  const l2 = verifyFacts(manifest, ctx.lock, ctx.spec);
  const l3a = verifyLayout(manifest);
  const l3b = opts.skipFrames
    ? { ok: true, errors: [], warnings: [], contactSheet: null, frames: [] }
    : await visualQa(finalPath, ctx.spec, path.join(ctx.dir, "verify"), {});

  const l3c = opts.skipFrames
    ? { ok: true, errors: [], warnings: [], scenes: [] }
    : await verifyMotionPresence(finalPath, ctx.spec, path.join(ctx.dir, "verify", "motion"), {});

  const report = {
    slug: ctx.slug,
    verifiedAt: new Date().toISOString(),
    level1_structure: l1,
    level2_facts: l2,
    level3_layout: l3a,
    level3_frames: { ...l3b, frames: l3b.frames.map((f) => ({ label: f.label, t: f.t, mean: f.mean, stdev: f.stdev })) },
    level3_motion: l3c,
    figuresOnScreen: [...figuresOnScreen(manifest).entries()].map(([token, uses]) => ({ token, uses })),
    ok: l1.ok && l2.ok && l3a.ok && l3b.ok && l3c.ok,
  };
  writeArtifact(ctx.slug, "motion-verification.json", report);

  log(`LEVEL 1 structure : ${l1.ok ? "PASS" : "FAIL"}  (${l1.probe?.width}x${l1.probe?.height} @${l1.probe?.fps}fps, ${l1.probe?.durationSec}s, ${l1.probe?.codec}${l1.probe?.hasAudio ? " + audio" : ""})`);
  for (const e of l1.errors) log(`  ERROR: ${e}`);
  for (const w of l1.warnings) log(`  warn: ${w}`);
  log(`LEVEL 2 facts     : ${l2.ok ? "PASS" : "FAIL"}  (${l2.checked} text layers checked against ${ctx.lock.numbers.size} approved figures)`);
  for (const e of l2.errors) log(`  ERROR: ${e}`);
  for (const w of l2.warnings) log(`  warn: ${w}`);
  log(`LEVEL 3 layout    : ${l3a.ok ? "PASS" : "FAIL"}`);
  for (const e of l3a.errors) log(`  ERROR: ${e}`);
  for (const w of l3a.warnings) log(`  warn: ${w}`);
  log(`LEVEL 3 frames    : ${l3b.ok ? "PASS" : "FAIL"}${l3b.contactSheet ? `  contact sheet: ${l3b.contactSheet}` : ""}`);
  for (const e of l3b.errors) log(`  ERROR: ${e}`);
  for (const w of l3b.warnings) log(`  warn: ${w}`);
  log(`LEVEL 3 motion    : ${l3c.ok ? "PASS" : "FAIL"}  (inter-frame change per scene: ${l3c.scenes.map((s) => s.best).join(", ")})`);
  for (const e of l3c.errors) log(`  ERROR: ${e}`);
  log("");
  log("FIGURES ON SCREEN (every one traced to the source script):");
  for (const { token, uses } of report.figuresOnScreen) {
    log(`  ${token.padEnd(9)} <- "${uses[0].text.replace(/\n/g, " / ")}" (scene ${uses[0].scene} @${uses[0].atSec}s)`);
  }
  log("");
  log(`LEVEL 4 is a person watching ${finalPath} against the script. Nothing automates taste.`);
  return report;
}

/** SCAFFOLD: a draft spec from the validated storyboard, for a new script. */
export function scaffoldMotion(slug, opts = {}) {
  const log = opts.log || console.log;
  const safe = safeSlug(slug);
  const storyboard = readArtifact(safe, "storyboard.json");
  if (!storyboard) {
    throw new Error(`no storyboard.json for ${safe}; run npm run video:dryrun -- ${safe} first`);
  }
  const draft = scaffoldMotionSpec(storyboard, {
    sourceScript: `videos/scripts/fan-economy/${safe}.md`,
    endCardSec: RENDER.endCardSec,
  });
  draft.slug = safe;
  fs.mkdirSync(MOTION.specsDir, { recursive: true });
  const out = specPath(safe);
  if (fs.existsSync(out) && !opts.force) throw new Error(`${out} already exists; pass --force to overwrite`);
  fs.writeFileSync(out, `${JSON.stringify(draft, null, 2)}\n`);
  log(`draft spec written to ${out}`);
  log("Next: add artwork + plates (text-free crops), place the text layers, then:");
  log(`  npm run video:motion-plan -- ${safe}`);
  return out;
}

/** The cost picture for a finished motion video, in the same shape the ledger
 * reports for the master-image pipeline. Kept honest: it reports zeros because
 * the render really is free, and names the one place spend could enter. */
export function motionCostReport(ctx, result) {
  const lines = [];
  lines.push("COST REPORT (handwritten-motion pipeline)");
  lines.push(`  generative video calls : 0   (no provider is wired; ${CAPS.maxJobSpendUsd} job ceiling never engaged)`);
  lines.push("  generative image calls : 0   (plates are crops of accepted artwork)");
  lines.push(`  model text calls       : 0   (${MODELS.storyboard} was used once when the storyboard was first built, already paid)`);
  lines.push("  lettering              : $0.00  local Chrome, OFL fonts in repo");
  lines.push("  render + encode        : $0.00  sharp + ffmpeg-static, local");
  lines.push(`  TOTAL MARGINAL COST    : $0.00`);
  lines.push(`  scenes rendered: ${result.rendered}, reused unchanged: ${result.reused}`);
  lines.push("  Spend could only enter here by generating NEW text-free plates; that goes");
  lines.push("  through lib/imageGen.mjs and its existing ledger and caps.");
  return lines.join("\n");
}
