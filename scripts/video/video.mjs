#!/usr/bin/env node
// CRWN silent short-form video pipeline CLI.
//
//   npm run video:dryrun -- 34                       (or a full .md path)
//   npm run video:generate -- 34
//   npm run video:regen-scene -- <slug|number> 4
//   npm run video:rerender -- <slug|number> [--music "name"] [--pace 1.1]
//   npm run video:music -- scan
//
// Normal founder workflow: generate -> watch render/final.mp4 -> approve, or
// regen-scene / rerender to correct one thing without repaying for the rest.

import fs from "node:fs";
import path from "node:path";
import { CAPS, IMAGE, MODELS, PATHS } from "./config.mjs";
import { parseScriptMarkdown, sourceNumberTokens } from "./lib/scriptParse.mjs";
import { validateStoryboard, sceneDurationSec, estimateReadTimeSec } from "./lib/schema.mjs";
import { generateStoryboard } from "./lib/storyboardGen.mjs";
import { generateSceneImage } from "./lib/imageGen.mjs";
import {
  scanLibrary,
  pickTrack,
  recordUse,
  loadUsageState,
  saveUsageState,
  findTrackByName,
} from "./lib/music.mjs";
import { analyzeTrack, loadAnalysisCache, saveAnalysisCache, selectSegment } from "./lib/audioAnalysis.mjs";
import { buildTimeline } from "./lib/timeline.mjs";
import { renderVideo } from "./lib/render.mjs";
import { estimateJobCost, formatCostReport, totals } from "./lib/ledger.mjs";
import {
  newJob,
  loadJob,
  saveJob,
  setState,
  jobDir,
  safeSlug,
  writeArtifact,
  readArtifact,
  pendingScenes,
  acceptedSceneImages,
  elementBoxesByScene,
} from "./lib/job.mjs";
import { findMentionedSlugs } from "../../fetch-person-ref.mjs";
import { createGeminiClient } from "./lib/geminiClient.mjs";

function resolveScript(arg) {
  // Bare number -> the numbered script in the fan-economy directory.
  if (/^\d+$/.test(arg)) {
    const files = fs.readdirSync(PATHS.scriptsDir).filter((f) => f.startsWith(`${arg}-`) && f.endsWith(".md"));
    if (files.length !== 1) throw new Error(`script number ${arg} matched ${files.length} files in ${PATHS.scriptsDir}`);
    return path.join(PATHS.scriptsDir, files[0]);
  }
  const p = path.resolve(arg);
  if (!p.endsWith(".md") || !fs.existsSync(p)) throw new Error(`script not found: ${arg}`);
  return p;
}

function slugForScript(scriptPath) {
  return safeSlug(path.basename(scriptPath));
}

function resolveJobSlug(arg) {
  // Accept a slug, a script number, or a script path for job-addressed commands.
  if (/^\d+$/.test(arg) || arg.endsWith(".md")) return slugForScript(resolveScript(arg));
  return safeSlug(arg);
}

async function ensureStoryboard(job, parsed, client, { forceNew = false } = {}) {
  if (!forceNew) {
    const existing = readArtifact(job.slug, "storyboard.json");
    if (existing) {
      const validation = validateStoryboard(existing, {
        sourceNumbers: sourceNumberTokens(parsed),
        expectReveal: Boolean(parsed.meta["big reveal"]),
      });
      if (validation.ok) return { storyboard: existing, validation, reused: true };
      console.log("existing storyboard.json no longer validates; regenerating");
    }
  }
  const personSlugs = findMentionedSlugs(`${parsed.title}\n${parsed.scriptText}\n${parsed.nanoPrompt || ""}`);
  const { storyboard, validation } = await generateStoryboard(parsed, client, {
    slug: job.slug,
    personSlugs,
    ledger: job.ledger,
  });
  writeArtifact(job.slug, "storyboard.json", storyboard);
  writeArtifact(job.slug, "validation.json", validation);
  return { storyboard, validation, reused: false };
}

function proposeMusic(durationSec, { overrideName = null, record = false } = {}) {
  const tracks = scanLibrary();
  if (!tracks.length) throw new Error(`no tracks found under ${PATHS.musicDir}/{primary,secondary,tertiary}`);
  const cache = loadAnalysisCache();
  const state = loadUsageState();
  const track = overrideName ? findTrackByName(tracks, overrideName) : pickTrack(tracks, state);
  const analysis = analyzeTrack(track.path, cache);
  saveAnalysisCache(cache);
  const segment = selectSegment(analysis, durationSec + 1);
  if (record) {
    recordUse(state, track);
    saveUsageState(state);
  }
  return {
    track: track.name,
    tier: track.tier,
    sourcePath: track.path,
    segmentStart: segment.start,
    segmentEnd: Math.round((segment.start + durationSec + 1) * 100) / 100,
    duration: analysis.durationSec,
    bpm: analysis.bpm,
    selectionReason: overrideName
      ? `founder override (--music "${overrideName}"); ${segment.reason}`
      : `weighted ${track.tier} rotation; ${segment.reason}`,
    lastUsed: state.tracks?.[track.path]?.lastUsed || null,
    useCount: state.tracks?.[track.path]?.useCount || 0,
    analysis: { beats: analysis.beats, downbeats: analysis.downbeats },
  };
}

function beatsInVideoTime(music, durationSec) {
  const shift = (arr) =>
    (arr || []).map((b) => Math.round((b - music.segmentStart) * 100) / 100).filter((b) => b >= 0 && b <= durationSec + 2);
  return { beats: shift(music.analysis?.beats), downbeats: shift(music.analysis?.downbeats) };
}

function provisionalDuration(storyboard) {
  const scenes = storyboard.scenes.reduce((a, s) => a + sceneDurationSec(s), 0);
  return scenes + (fs.existsSync(PATHS.endCardImage) ? 1.6 : 0);
}

function endCardOrNull() {
  return fs.existsSync(PATHS.endCardImage) ? PATHS.endCardImage : null;
}

async function buildAndRender(job, storyboard, { paceMultiplier = 1.0 } = {}) {
  if (!job.music) throw new Error("no music selected for this job yet; run video:generate");
  const dur = provisionalDuration(storyboard) / paceMultiplier;
  const beatData = beatsInVideoTime(job.music, dur);
  const timeline = buildTimeline(storyboard, acceptedSceneImages(job), beatData, {
    paceMultiplier,
    elementBoxes: elementBoxesByScene(job),
    endCard: endCardOrNull(),
  });
  if (timeline.totalDurationSec > CAPS.maxVideoDurationSec) {
    throw new Error(`timeline is ${timeline.totalDurationSec.toFixed(1)}s, over the ${CAPS.maxVideoDurationSec}s cap`);
  }
  job.timelineSummary = {
    totalDurationSec: round2(timeline.totalDurationSec),
    shotCount: timeline.shotCount,
    revealAtSec: timeline.revealAtSec != null ? round2(timeline.revealAtSec) : null,
    ctaAtSec: timeline.ctaAtSec != null ? round2(timeline.ctaAtSec) : null,
    paceMultiplier,
  };
  setState(job, "TIMELINE_READY");
  saveJob(job);
  writeArtifact(job.slug, "timeline.json", timeline);

  const outPath = path.join(jobDir(job.slug), "render", "final.mp4");
  console.log(`rendering ${timeline.shotCount} shots / ${timeline.totalDurationSec.toFixed(1)}s -> ${outPath}`);
  const t0 = Date.now();
  await renderVideo(timeline, { trackPath: job.music.sourcePath, segmentStart: job.music.segmentStart }, outPath, {
    onProgress: (f, total) => process.stdout.write(`\r  frame ${f}/${total}`),
  });
  console.log(`\nrendered in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  setState(job, "RENDERED");
  saveJob(job);
  return { timeline, outPath };
}

function writeMeta(job, parsed, storyboard, timeline) {
  const t = totals(job.ledger);
  writeArtifact(job.slug, "meta.json", {
    sourceScript: job.scriptPath,
    contentFamily: parsed.family,
    artist: parsed.artist,
    sceneCount: storyboard.scenes.length,
    masterImageCount: acceptedSceneImages(job).length,
    shotCount: timeline.shotCount,
    finalDurationSec: round2(timeline.totalDurationSec),
    avgShotDurationSec: round2(timeline.totalDurationSec / timeline.shotCount),
    openingMotion: timeline.shots[0]?.motion,
    revealAtSec: timeline.revealAtSec != null ? round2(timeline.revealAtSec) : null,
    ctaAtSec: timeline.ctaAtSec != null ? round2(timeline.ctaAtSec) : null,
    musicTrack: job.music.track,
    musicTier: job.music.tier,
    bpm: job.music.bpm,
    imageModelEconomy: MODELS.imageEconomy,
    imageModelQuality: MODELS.imageQuality,
    storyboardModel: MODELS.storyboard,
    totalImageAttempts: t.imageAttempts,
    attemptMultiplier: t.attemptMultiplier,
    totalApiCostUsd: t.totalUsd,
    costPerAcceptedImage: t.costPerAcceptedImage,
    shareTrigger: storyboard.shareTrigger,
    saveTrigger: storyboard.saveTrigger,
    generatedAt: new Date().toISOString(),
  });
  const music = { ...job.music };
  delete music.analysis; // beats live in the analysis cache; keep music.json light
  writeArtifact(job.slug, "music.json", { music });
  writeArtifact(job.slug, "cost.json", { entries: job.ledger.entries, flags: job.ledger.flags, totals: t });
}

function printDryRun(parsed, storyboard, validation, musicPlan, estimate) {
  const lines = [];
  lines.push(`TITLE: ${storyboard.title || parsed.title}`);
  lines.push(`FAMILY: ${parsed.family || "(none)"}   CTA KEYWORD: ${storyboard.ctaKeyword}`);
  lines.push(`\nCONDENSED SILENT STORY:\n${storyboard.condensedStory}`);
  lines.push(`\nWITHHELD: ${storyboard.withheldInformation.join(" | ") || "(none)"}`);
  lines.push(`REVEAL TEXT: ${storyboard.revealText.join(" | ") || "(none)"}`);
  lines.push(`SHARE TRIGGER: ${storyboard.shareTrigger}`);
  lines.push(`SAVE TRIGGER: ${storyboard.saveTrigger}`);
  lines.push(`\nSCENES: ${storyboard.scenes.length} master images`);
  let cursor = 0;
  for (const s of storyboard.scenes) {
    const dur = sceneDurationSec(s);
    lines.push(
      `\n[${s.index + 1}] ${s.roles.join("+")} · ~${dur.toFixed(1)}s (read ${estimateReadTimeSec(s.screenText).toFixed(1)}s) · shots: ${s.shots.map((x) => x.motion).join(" > ")}`
    );
    lines.push(`    purpose: ${s.purpose}`);
    lines.push(`    text: ${s.screenText.map((t) => `"${t}"`).join("  ")}`);
    lines.push(`    visual: ${s.visualGoal}`);
    if (s.people?.length) lines.push(`    people: ${s.people.join(", ")}`);
    if (s.roles.includes("REVEAL")) lines.push(`    >>> reveal lands ~${cursor.toFixed(1)}s`);
    if (s.roles.includes("CTA")) lines.push(`    >>> CTA lands ~${cursor.toFixed(1)}s`);
    cursor += dur;
  }
  lines.push(`\nESTIMATED RUNTIME: ~${(cursor + 1.6).toFixed(1)}s (+1.6s end card)`);
  if (musicPlan) {
    lines.push(
      `MUSIC PROPOSAL: ${musicPlan.track} [${musicPlan.tier}] bpm=${musicPlan.bpm ?? "?"} segment@${musicPlan.segmentStart}s — ${musicPlan.selectionReason}`
    );
  }
  lines.push(`\nVALIDATION: ${validation.ok ? "PASS" : "FAIL"}`);
  for (const e of validation.errors) lines.push(`  ERROR: ${e}`);
  for (const w of validation.warnings) lines.push(`  warn: ${w}`);
  lines.push(`\nEXPECTED COST (at ${CAPS.expectedAttemptsPerAcceptedImage} attempts/accepted image):`);
  lines.push(`  storyboard ~$${estimate.storyboardUsd.toFixed(2)}  images ~$${estimate.imagesUsd?.toFixed(2)}  qc ~$${estimate.qcUsd.toFixed(2)}  TOTAL ~$${estimate.totalUsd?.toFixed(2)}`);
  console.log(lines.join("\n"));
}

async function cmdDryrun(args) {
  const scriptPath = resolveScript(args[0]);
  const slug = slugForScript(scriptPath);
  const content = fs.readFileSync(scriptPath, "utf-8");
  const parsed = parseScriptMarkdown(content);
  for (const w of parsed.warnings) console.log(`parse warn: ${w}`);
  let job = loadJob(slug) || newJob(slug, scriptPath);
  writeArtifact(slug, "source.md", content);
  const client = createGeminiClient();
  const { storyboard, validation } = await ensureStoryboard(job, parsed, client, {
    forceNew: args.includes("--new"),
  });
  const estimate = estimateJobCost(storyboard.scenes.length, MODELS.imageEconomy, IMAGE.imageSize);
  job.estimate = estimate;
  const musicPlan = proposeMusic(provisionalDuration(storyboard), { record: false });
  setState(job, "VALIDATED");
  saveJob(job);
  printDryRun(parsed, storyboard, validation, musicPlan, estimate);
  console.log(`\nartifacts: ${jobDir(slug)}`);
}

async function cmdGenerate(args) {
  const scriptPath = resolveScript(args[0]);
  const slug = slugForScript(scriptPath);
  const content = fs.readFileSync(scriptPath, "utf-8");
  const parsed = parseScriptMarkdown(content);
  for (const w of parsed.warnings) console.log(`parse warn: ${w}`);
  let job = loadJob(slug) || newJob(slug, scriptPath);
  job.scriptPath = scriptPath;
  writeArtifact(slug, "source.md", content);
  const client = createGeminiClient();

  const { storyboard, validation } = await ensureStoryboard(job, parsed, client);
  if (!validation.ok) throw new Error(`storyboard invalid:\n${validation.errors.join("\n")}`);
  setState(job, "STORYBOARDED");
  job.estimate = estimateJobCost(storyboard.scenes.length, MODELS.imageEconomy, IMAGE.imageSize);
  if (job.estimate.totalUsd != null && job.estimate.totalUsd > CAPS.maxJobSpendUsd) {
    throw new Error(
      `estimated cost $${job.estimate.totalUsd} exceeds the job ceiling $${CAPS.maxJobSpendUsd}; raise CAPS.maxJobSpendUsd deliberately if intended`
    );
  }
  setState(job, "IMAGES_GENERATING");
  saveJob(job);

  const todo = pendingScenes(job, storyboard);
  console.log(`generating ${todo.length} of ${storyboard.scenes.length} scene images (rest already accepted)`);
  for (const scene of todo) {
    const attemptsSoFar = job.ledger.entries.filter((e) => e.stage === "image").length;
    const result = await generateSceneImage({
      storyboard,
      scene,
      jobDir: jobDir(slug),
      client,
      ledger: job.ledger,
      opts: { attemptsSoFar, log: console.log },
    });
    job.scenes = job.scenes.filter((s) => s.index !== scene.index);
    job.scenes.push({
      index: scene.index,
      status: result.accepted ? "accepted" : "failed",
      imageFile: result.imageFile || null,
      boxes: result.boxes || null,
      attempts: result.attempts,
      reason: result.reason || null,
    });
    job.scenes.sort((a, b) => a.index - b.index);
    saveJob(job);
    if (!result.accepted) {
      setState(job, "FAILED");
      job.error = `scene ${scene.index} failed: ${result.reason}`;
      saveJob(job);
      writeArtifact(slug, "cost.json", { entries: job.ledger.entries, flags: job.ledger.flags, totals: totals(job.ledger) });
      throw new Error(
        `scene ${scene.index} could not be generated (${result.reason}). Artifacts kept in rejected/. ` +
          `Fix and run: npm run video:regen-scene -- ${slug} ${scene.index + 1}`
      );
    }
    console.log(`  scene ${scene.index} ACCEPTED`);
  }
  setState(job, "IMAGES_READY");
  saveJob(job);

  if (!job.music || args.includes("--repick-music")) {
    job.music = proposeMusic(provisionalDuration(storyboard), { record: true });
    setState(job, "MUSIC_SELECTED");
    saveJob(job);
  }
  console.log(`music: ${job.music.track} [${job.music.tier}] bpm=${job.music.bpm ?? "?"} @${job.music.segmentStart}s`);

  const { timeline, outPath } = await buildAndRender(job, storyboard);
  writeMeta(job, parsed, storyboard, timeline);
  setState(job, "COMPLETE");
  saveJob(job);

  console.log(`\n${formatCostReport(job.ledger, job.estimate)}`);
  console.log(`\nFINAL VIDEO: ${outPath}`);
  console.log(`duration ${timeline.totalDurationSec.toFixed(1)}s · ${timeline.shotCount} shots · reveal @${timeline.revealAtSec?.toFixed(1)}s · CTA @${timeline.ctaAtSec?.toFixed(1)}s`);
}

async function cmdRegenScene(args) {
  const slug = resolveJobSlug(args[0]);
  const sceneNum = parseInt(args[1], 10);
  if (Number.isNaN(sceneNum)) throw new Error("usage: video:regen-scene <job> <sceneNumber (1-based)>");
  const job = loadJob(slug);
  if (!job) throw new Error(`no job ${slug}`);
  const storyboard = readArtifact(slug, "storyboard.json");
  if (!storyboard) throw new Error(`job ${slug} has no storyboard.json`);
  const index = sceneNum - 1;
  const scene = storyboard.scenes.find((s) => s.index === index);
  if (!scene) throw new Error(`scene ${sceneNum} not in storyboard (1-${storyboard.scenes.length})`);

  const entry = job.scenes.find((s) => s.index === index);
  if (entry?.imageFile && fs.existsSync(entry.imageFile)) fs.unlinkSync(entry.imageFile);
  job.scenes = job.scenes.filter((s) => s.index !== index);
  saveJob(job);

  const client = createGeminiClient();
  const result = await generateSceneImage({
    storyboard,
    scene,
    jobDir: jobDir(slug),
    client,
    ledger: job.ledger,
    opts: { log: console.log },
  });
  job.scenes.push({
    index,
    status: result.accepted ? "accepted" : "failed",
    imageFile: result.imageFile || null,
    boxes: result.boxes || null,
    attempts: result.attempts,
    reason: result.reason || null,
  });
  job.scenes.sort((a, b) => a.index - b.index);
  saveJob(job);
  if (!result.accepted) throw new Error(`scene ${sceneNum} regeneration failed: ${result.reason}`);

  const stillPending = pendingScenes(job, storyboard);
  if (stillPending.length) {
    console.log(
      `scene ${sceneNum} regenerated, but scenes ${stillPending.map((s) => s.index + 1).join(", ")} have no accepted image yet.` +
        ` Run: npm run video:generate -- ${slug} to finish the job.`
    );
    saveJob(job);
    return;
  }
  console.log(`scene ${sceneNum} regenerated; rerendering`);
  if (!job.music) {
    job.music = proposeMusic(provisionalDuration(storyboard), { record: true });
    setState(job, "MUSIC_SELECTED");
    saveJob(job);
  }

  const parsed = parseScriptMarkdown(fs.readFileSync(job.scriptPath, "utf-8"));
  const { timeline } = await buildAndRender(job, storyboard, {
    paceMultiplier: job.timelineSummary?.paceMultiplier || 1.0,
  });
  writeMeta(job, parsed, storyboard, timeline);
  setState(job, "COMPLETE");
  saveJob(job);
  console.log(`\n${formatCostReport(job.ledger)}`);
}

async function cmdRerender(args) {
  const slug = resolveJobSlug(args[0]);
  const job = loadJob(slug);
  if (!job) throw new Error(`no job ${slug}`);
  const storyboard = readArtifact(slug, "storyboard.json");
  if (!storyboard) throw new Error(`job ${slug} has no storyboard.json`);

  const musicIdx = args.indexOf("--music");
  const paceIdx = args.indexOf("--pace");
  const pace = paceIdx !== -1 ? parseFloat(args[paceIdx + 1]) : job.timelineSummary?.paceMultiplier || 1.0;
  if (!(pace > 0.5 && pace < 2.0)) throw new Error(`--pace ${pace} outside sane range 0.5-2.0`);
  if (musicIdx !== -1) {
    job.music = proposeMusic(provisionalDuration(storyboard) / pace, {
      overrideName: args[musicIdx + 1],
      record: true,
    });
  } else if (job.music && !job.music.analysis) {
    // music.json strips beats; rehydrate from the analysis cache for beat sync.
    const cache = loadAnalysisCache();
    const a = analyzeTrack(job.music.sourcePath, cache);
    saveAnalysisCache(cache);
    job.music.analysis = { beats: a.beats, downbeats: a.downbeats };
  }
  if (!job.music) job.music = proposeMusic(provisionalDuration(storyboard) / pace, { record: true });

  const parsed = parseScriptMarkdown(fs.readFileSync(job.scriptPath, "utf-8"));
  const { timeline } = await buildAndRender(job, storyboard, { paceMultiplier: pace });
  writeMeta(job, parsed, storyboard, timeline);
  setState(job, "COMPLETE");
  saveJob(job);
  console.log(`rerendered with ${job.music.track} [${job.music.tier}] pace=${pace}`);
}

async function cmdMusic(args) {
  if (args[0] !== "scan") throw new Error("usage: video:music -- scan");
  const tracks = scanLibrary();
  const cache = loadAnalysisCache();
  for (const t of tracks) {
    try {
      const a = analyzeTrack(t.path, cache);
      console.log(
        `[${t.tier}] ${t.name}  ${a.durationSec}s  bpm=${a.bpm ?? "?"}  beats=${a.beats.length}  rms=${a.rms}${a.tempoError ? `  TEMPO ERROR: ${a.tempoError}` : ""}`
      );
    } catch (err) {
      console.log(`[${t.tier}] ${t.name}  UNSUPPORTED/CORRUPT: ${err.message}`);
    }
  }
  saveAnalysisCache(cache);
  const state = loadUsageState();
  console.log(`\nusage history: ${(state.recent || []).map((p) => path.basename(p)).join(" -> ") || "(none)"}`);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const [cmd, ...rest] = process.argv.slice(2);
const commands = {
  dryrun: cmdDryrun,
  storyboard: cmdDryrun, // storyboard IS the dry run: zero media cost
  generate: cmdGenerate,
  "regen-scene": cmdRegenScene,
  rerender: cmdRerender,
  music: cmdMusic,
};

if (!cmd || !commands[cmd]) {
  console.log(`usage: node scripts/video/video.mjs <${Object.keys(commands).join("|")}> ...`);
  process.exit(2);
}
commands[cmd](rest).catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
