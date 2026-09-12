// V2 orchestration: plan, render, repair, verify.
//
// Reuses V1 wholesale where V1 was right: safeSlug and the job directory, the
// fact lock, the storyboard's reveal protection, the music rotation, the ffmpeg
// encoder, the artifact writers. The spec declares its own sourceScript, so a V2
// slug can sit beside V1 in the same output tree and the founder can play both.

import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, MOTION, RENDER, CAPS, MODELS } from "../config.mjs";
import { parseScriptMarkdown } from "./scriptParse.mjs";
import { buildFactLock, factLockDigest } from "./factLock.mjs";
import { validateMotionSpecV2, specDurationSecV2 } from "./motionSpecV2.mjs";
import { ensureSubjects } from "./isolate.mjs";
import { ensurePlates } from "./plates.mjs";
import { ensureSprites, fontProvenance } from "./lettering.mjs";
import { collectSpritesV2, renderMotionVideoV2, dryRunManifestV2 } from "./motionRenderV2.mjs";
import { resolveLayout } from "./composition.mjs";
import { verifyStructure, verifyFacts } from "./verify.mjs";
import { auditGeometry, auditVideo, contactSheet } from "./visualQa.mjs";
import { proposeTrack } from "./music.mjs";
import { jobDir, safeSlug, readArtifact, writeArtifact } from "./job.mjs";

export function specPathV2(slug) {
  return path.join(MOTION.specsDir, `${safeSlug(slug)}.json`);
}

export function loadContextV2(slug, opts = {}) {
  const safe = safeSlug(slug);
  const sp = opts.specPath || specPathV2(safe);
  if (!fs.existsSync(sp)) throw new Error(`no motion spec at ${sp}`);
  const spec = JSON.parse(fs.readFileSync(sp, "utf-8"));
  // A V2 spec names its own source script, which is how a -v2 slug reuses the
  // original markdown instead of needing a copy of it.
  const scriptRel = spec.sourceScript || `videos/scripts/fan-economy/${safe}.md`;
  const scriptPath = path.isAbsolute(scriptRel) ? scriptRel : path.join(REPO_ROOT, scriptRel);
  if (!fs.existsSync(scriptPath)) throw new Error(`source script not found: ${scriptPath}`);
  const parsed = parseScriptMarkdown(fs.readFileSync(scriptPath, "utf-8"));
  const lock = buildFactLock(parsed, { slug: safe });
  // Reveal protection reads the V1 storyboard for this script when one exists.
  const storyboardSlug = (spec.storyboardSlug || safe.replace(/-v2(-proto)?$/, ""));
  const storyboard = readArtifact(storyboardSlug, "storyboard.json");
  return { slug: safe, specPath: sp, scriptPath, parsed, lock, spec, storyboard, dir: jobDir(safe) };
}

/** Shared asset preparation: isolated subjects, plates, lettering. */
async function prepareAssets(ctx, opts = {}) {
  const log = opts.log || (() => {});
  const subjects = await ensureSubjects(ctx.spec, {
    repoRoot: REPO_ROOT,
    cacheDir: path.join(ctx.dir, "subjects"),
    log,
  });
  const plates = (ctx.spec.plates || []).length
    ? await ensurePlates(ctx.spec, { repoRoot: REPO_ROOT, cacheDir: path.join(ctx.dir, "plates"), log })
    : new Map();
  const { requests, byLayer } = collectSpritesV2(ctx.spec);
  const sprites = await ensureSprites(requests, {
    cacheDir: MOTION.spriteCacheDir,
    log,
    chromeRunner: opts.chromeRunner,
  });
  return { subjects, plates, sprites, byLayer, requests };
}

/** PLAN: validate the spec, build assets, probe geometry. Costs $0. */
export async function planMotionV2(slug, opts = {}) {
  const log = opts.log || console.log;
  const ctx = loadContextV2(slug, opts);
  for (const w of ctx.parsed.warnings) log(`parse warn: ${w}`);

  const validation = validateMotionSpecV2(ctx.spec, ctx.lock, {
    storyboard: ctx.storyboard,
    repoRoot: REPO_ROOT,
    prototype: opts.prototype,
  });

  log("");
  log(`TITLE: ${ctx.spec.title}`);
  log(`SPEC: ${ctx.specPath}${validation.prototype ? "  [PROTOTYPE]" : ""}`);
  log(`SOURCE: ${ctx.scriptPath}`);
  log(`CTA KEYWORD: ${ctx.lock.ctaKeyword}`);
  log(`FACT LOCK: ${ctx.lock.numbers.size} approved figures`);
  log(`DURATION: ${specDurationSecV2(ctx.spec).toFixed(2)}s across ${ctx.spec.scenes.length} scenes`);
  log("");
  let cursor = 0;
  for (const scene of ctx.spec.scenes) {
    const bits = [
      ...(scene.art || []).map((a) => `${a.subject}->${a.slot}`),
      ...(scene.populations || []).map((p) => `${p.count}x${p.library}->${p.slot}`),
      ...(scene.marks || []).map((m) => `${m.shape}@${m.slot}`),
    ];
    log(`[${scene.index}] ${(scene.roles || []).join("+")} ${scene.layout} @${cursor.toFixed(1)}s for ${scene.durationSec}s (${scene.beat})`);
    log(`    ${scene.purpose}`);
    if (bits.length) log(`    art: ${bits.join("  ")}`);
    for (const t of scene.text || []) log(`    "${t.text.replace(/\n/g, " / ")}" [${t.motion?.kind}] -> ${t.slot}`);
    cursor += scene.durationSec;
  }
  log("");
  log(`VALIDATION: ${validation.ok ? "PASS" : "FAIL"}`);
  for (const e of validation.errors) log(`  ERROR: ${e}`);
  for (const w of validation.warnings) log(`  warn: ${w}`);
  if (!validation.ok) {
    writeArtifact(ctx.slug, "v2-validation.json", validation);
    return { ctx, validation, geometry: null };
  }

  const assets = await prepareAssets(ctx, { ...opts, log });
  const layouts = new Map(ctx.spec.scenes.map((s) => [s.index, resolveLayout(s.layout, s.layoutOverrides || {})]));
  const manifest = dryRunManifestV2(ctx.spec, { ...assets, lock: ctx.lock });
  // A prototype states only the beats it is testing, so the "every required
  // figure appears" and "the CTA keyword appears" gates belong to the full video.
  // Everything else about the facts it DOES state is checked exactly as normal.
  const facts = verifyFacts(manifest, ctx.lock, ctx.spec, {
    requiredNumbers: validation.prototype ? [] : ctx.spec.requiredFigures || [],
    requireCta: !validation.prototype,
    safeZone: null,
  });
  const geom = auditGeometry(manifest, ctx.spec);
  const geometry = { ok: facts.ok && geom.ok, facts, geom, manifest, layouts, assets };

  log("");
  log(`GEOMETRY + FACT PROBE (no frames drawn): ${geometry.ok ? "PASS" : "FAIL"}`);
  for (const e of [...facts.errors, ...geom.errors]) log(`  ERROR: ${e}`);
  for (const w of [...facts.warnings, ...geom.warnings]) log(`  warn: ${w}`);
  log("");
  log("COST: $0.00 of image generation, $0.00 of video generation, $0.00 of model calls.");
  log("  Subjects are isolated ink components of an accepted sheet; lettering is local Chrome + OFL fonts:");
  for (const f of fontProvenance()) log(`    ${f.family}: ${f.licence}`);

  writeArtifact(ctx.slug, "v2-validation.json", validation);
  writeArtifact(ctx.slug, "v2-geometry.json", { facts, geom, manifest });
  return { ctx, validation, geometry };
}

/** RENDER (or repair). Refuses to draw if validation or geometry fails. */
export async function renderMotionV2(slug, opts = {}) {
  const log = opts.log || console.log;
  const { ctx, validation, geometry } = await planMotionV2(slug, { ...opts, log: opts.quietPlan ? () => {} : log });
  if (!validation.ok) throw new Error(`spec invalid, nothing rendered:\n  ${validation.errors.join("\n  ")}`);
  if (!geometry.ok && !opts.allowGeometryFailures) {
    throw new Error(
      `geometry/fact probe failed, nothing rendered:\n  ${[...geometry.facts.errors, ...geometry.geom.errors].join("\n  ")}`
    );
  }

  const duration = specDurationSecV2(ctx.spec);
  let music = null;
  if (opts.noMusic !== true) {
    const prior = readArtifact(ctx.slug, "v2-music.json");
    if (prior && !opts.musicName && !opts.repickMusic) music = prior.music;
    else music = proposeTrack(duration, { overrideName: opts.musicName || null, record: true });
    const light = { ...music };
    delete light.analysis;
    writeArtifact(ctx.slug, "v2-music.json", { music: light });
    log(`music: ${music.track} [${music.tier}] bpm=${music.bpm ?? "?"} @${music.segmentStart}s`);
  }

  const t0 = Date.now();
  const result = await renderMotionVideoV2(ctx.spec, {
    ...geometry.assets,
    music: music ? { trackPath: music.sourcePath, segmentStart: music.segmentStart } : null,
    outDir: ctx.dir,
    lock: ctx.lock,
    onlyScenes: opts.onlyScenes,
    log,
  });
  log(`rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  writeArtifact(ctx.slug, "v2-manifest.json", result.manifest);
  log(`\nFINAL VIDEO: ${result.finalPath}`);
  return { ctx, ...result, layouts: geometry.layouts, assets: geometry.assets };
}

/** VERIFY: structure, facts, geometry, and a dense visual audit of real pixels. */
export async function verifyMotionV2(slug, opts = {}) {
  const log = opts.log || console.log;
  const ctx = loadContextV2(slug, opts);
  const manifest = readArtifact(ctx.slug, "v2-manifest.json");
  if (!manifest) throw new Error(`no v2-manifest.json for ${ctx.slug}; render it first`);
  const finalPath = path.join(ctx.dir, "render", "final.mp4");
  const layouts = new Map(ctx.spec.scenes.map((s) => [s.index, resolveLayout(s.layout, s.layoutOverrides || {})]));

  const l1 = await verifyStructure(finalPath, ctx.spec, {
    expectAudio: opts.expectAudio,
    checkSegments: true,
  });
  const l2 = verifyFacts(manifest, ctx.lock, ctx.spec, {
    requiredNumbers: ctx.spec.prototype ? [] : ctx.spec.requiredFigures || [],
    requireCta: !ctx.spec.prototype,
    safeZone: null,
  });
  const l3 = auditGeometry(manifest, ctx.spec);
  const l4 = opts.skipFrames
    ? { ok: true, errors: [], warnings: [], scenes: [], meanInk: null, meanCoverage: null }
    : await auditVideo(finalPath, ctx.spec, { layouts, workDir: path.join(ctx.dir, "verify", "frames"), log });

  let sheet = null;
  if (!opts.skipFrames && l4.scenes.length) {
    sheet = await contactSheet(l4, path.join(ctx.dir, "verify", "contact-sheet.jpg"), {});
  }

  const report = {
    slug: ctx.slug,
    version: 2,
    verifiedAt: new Date().toISOString(),
    level1_structure: l1,
    level2_facts: l2,
    level3_geometry: l3,
    level4_visual: { ...l4, scenes: l4.scenes.map(({ sampleFiles, ...rest }) => rest) },
    contactSheet: sheet?.file || null,
    ok: l1.ok && l2.ok && l3.ok && l4.ok,
  };
  writeArtifact(ctx.slug, "v2-verification.json", report);

  log(`LEVEL 1 structure : ${l1.ok ? "PASS" : "FAIL"}  (${l1.probe?.width}x${l1.probe?.height} @${l1.probe?.fps}fps, ${l1.probe?.durationSec}s, ${l1.probe?.codec}${l1.probe?.hasAudio ? " + audio" : ""})`);
  for (const e of l1.errors) log(`  ERROR: ${e}`);
  log(`LEVEL 2 facts     : ${l2.ok ? "PASS" : "FAIL"}  (${l2.checked} text layers against ${ctx.lock.numbers.size} approved figures)`);
  for (const e of l2.errors) log(`  ERROR: ${e}`);
  for (const w of l2.warnings) log(`  warn: ${w}`);
  log(`LEVEL 3 geometry  : ${l3.ok ? "PASS" : "FAIL"}  (safe zones, text size, hero scale, collisions)`);
  for (const e of l3.errors) log(`  ERROR: ${e}`);
  for (const w of l3.warnings) log(`  warn: ${w}`);
  log(`LEVEL 4 visual    : ${l4.ok ? "PASS" : "FAIL"}  (mean ink ${fmtPct(l4.meanInk)}, mean coverage ${fmtPct(l4.meanCoverage)})`);
  for (const e of l4.errors) log(`  ERROR: ${e}`);
  for (const w of l4.warnings) log(`  warn: ${w}`);
  if (l4.scenes.length) {
    log("");
    log("  scene  layout                beat     ink    cover  open   deadRun");
    for (const s of l4.scenes) {
      log(
        `   ${String(s.scene).padStart(2)}    ${String(s.layout).padEnd(21)} ${String(s.beat || "").padEnd(8)} ` +
          `${fmtPct(s.meanInk).padStart(5)}  ${fmtPct(s.meanCoverage).padStart(5)}  ${fmtPct(s.openingInk).padStart(5)}  ${s.maxDeadRunSec.toFixed(2)}s`
      );
    }
  }
  if (sheet) log(`\n  contact sheet (${sheet.frames} frames): ${sheet.file}`);
  log("");
  log(`LEVEL 5 is a person watching ${finalPath}. Nothing automates taste.`);
  return report;
}

function fmtPct(v) {
  return v === null || v === undefined ? "-" : `${(v * 100).toFixed(1)}%`;
}

/** The cost picture. Zeros, and it names the one place spend could enter. */
export function motionCostReportV2(result) {
  return [
    "COST REPORT (V2 handwritten-motion pipeline)",
    "  generative video calls : 0   (no provider is wired, asserted by test)",
    "  generative image calls : 0   (subjects are isolated components of accepted artwork)",
    `  model text calls       : 0   (${MODELS.storyboard} ran once when the storyboard was first built, already paid)`,
    "  subject isolation      : $0.00  local connected-component labelling",
    "  lettering              : $0.00  local Chrome, OFL fonts already in repo",
    "  render + encode        : $0.00  librsvg + sharp + ffmpeg-static, local",
    "  TOTAL MARGINAL COST    : $0.00",
    `  scenes rendered: ${result.rendered}, reused unchanged: ${result.reused}`,
    `  Spend could only enter by generating NEW text-free artwork, which goes through`,
    `  lib/imageGen.mjs, its ledger and the $${CAPS.maxJobSpendUsd} job ceiling.`,
  ].join("\n");
}
