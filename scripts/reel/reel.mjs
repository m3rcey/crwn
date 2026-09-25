#!/usr/bin/env node
// Fan Economy reel editor: raw talking-head footage + its Fan Economy script -> a
// finished 1080x1920 reel. Manual: docs/REEL_EDITOR.md. Skill:
// .claude/skills/fan-economy-reel-editor/SKILL.md.
//
//   npm run reel -- run <video file>            everything, script identified from the name
//   npm run reel -- run 14 --video <file>       everything, script given
//   npm run reel -- new|transcribe|cut|plan|build|render|qa <n>   one stage
//   npm run reel -- preview <n>                 HyperFrames Studio on the composition
//   npm run reel -- feedback <n> "<note>"       record a note for the next pass
//   npm run reel -- status [n] | assets | identify <file>
//
// Every stage reads the previous stage's artifact from videos/reels/<slug>/ and writes
// its own, so any stage can be rerun alone. Run inside WSL.

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseFanEconomy } from "./lib/structure.mjs";
import { resolveProvider, normalizeAny, normalizeElevenLabs, normalizeLocal, validateTranscript, transcribeElevenLabs, transcribeLocal, suspectWindows, spliceWindow } from "./lib/transcribe.mjs";
import { alignTakes, captionWords } from "./lib/align.mjs";
import { buildEdl, remapWords, lineWindows, takeReport, probe, makeProxy, decodePcm, envelope, spliceAudio, writeWav, renderClean, sdrFilter, BT709_TAGS, SEEKABLE } from "./lib/cut.mjs";
import { groupCaptions, captionLeaks } from "./lib/captions.mjs";
import { planBeats, validateBeats, faceStats } from "./lib/beats.mjs";
import { loadCapabilities, missingEvidence } from "./lib/claims.mjs";
import { loadLibrary, resolveSheets, resolveBroll, toolNames, missingFiles } from "./lib/assets.mjs";
import { buildComposition, writeProject, safeZoneViolations } from "./lib/compose.mjs";
import { mix } from "./lib/audio.mjs";
import { runQa, qaMarkdown, contactSheets } from "./lib/qa.mjs";
import { trackSubject } from "./lib/track.mjs";
import { openPlan } from "./lib/author.mjs";
import { pathToFileURL } from "node:url";
import { recordingMatchesSlug, contentWords } from "../../studio/lib/status.mjs";
import { proposeTrack } from "../video/lib/music.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../..");
export const SCRIPTS_DIR = path.join(REPO, "videos/scripts/fan-economy");
export const REELS_DIR = process.env.REEL_DIR || path.join(REPO, "videos/reels");
const ENGINE = path.join(HERE, "engine");
const HF = path.join(ENGINE, "node_modules/.bin/hyperframes");
const FONTS = path.join(REPO, "scripts/vsl/assets/fonts");
const EXPORT_DIR = process.env.REEL_EXPORT_DIR || "/mnt/c/Users/Josh/Dropbox/CRWN/content/Reels TikToks Shorts/Fan Economy Reels";
const HF_ENV = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" };

const log = (...a) => console.log(...a);
const readJson = (p, d = null) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : d);
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2)); };
export const loadRules = () => readJson(path.join(HERE, "rules.json"));

// ------------------------------------------------------------------ scripts & projects

export function listScripts() {
  return fs.readdirSync(SCRIPTS_DIR).filter((f) => /^\d+-.*\.md$/.test(f)).map((f) => ({ num: parseInt(f, 10), slug: f.replace(/\.md$/, ""), file: path.join(SCRIPTS_DIR, f) })).sort((a, b) => a.num - b.num);
}

export function resolveScript(ref) {
  const all = listScripts();
  const s = String(ref);
  const hit = /^\d+$/.test(s) ? all.find((x) => x.num === +s) : all.find((x) => x.slug === s || x.slug.startsWith(s) || path.resolve(s) === x.file);
  if (!hit) throw new Error(`no Fan Economy script "${ref}" in videos/scripts/fan-economy`);
  return hit;
}

/** Which script a recording belongs to, from its file name (Studio's rule: the words
 * in the name ARE the script's id), or null with the candidates. */
export function identifyByName(file) {
  const base = path.basename(file).replace(/\.[^.]+$/, "");
  const all = listScripts();
  const lead = base.match(/^(\d+)(?!\d)/);
  if (lead && all.some((s) => s.num === +lead[1])) return { num: +lead[1], how: "file name starts with the script number" };
  const named = all.filter((s) => recordingMatchesSlug(base, s.slug)).map((s) => s.num);
  if (named.length === 1) return { num: named[0], how: `file name words name script ${named[0]}` };
  return { num: null, candidates: named, how: named.length ? "file name matches several scripts" : "file name matches no script" };
}

/** Which script a transcript sounds like: Studio's content-word overlap, best vs next. */
export function identifyByTranscript(text) {
  const t = contentWords(text);
  const scored = listScripts().map((s) => {
    const words = contentWords(parseFanEconomy(fs.readFileSync(s.file, "utf8")).lines.map((l) => l.text).join(" "));
    return { num: s.num, score: t.size ? [...t].filter((w) => words.has(w)).length / t.size : 0 };
  }).sort((a, b) => b.score - a.score);
  const [a, b] = scored;
  const clear = a && a.score >= 0.6 && (!b || a.score - b.score >= 0.12);
  return { num: clear ? a.num : null, best: a, runnerUp: b, how: clear ? `transcript overlaps script ${a.num} at ${(a.score * 100).toFixed(0)}%` : "transcript does not clearly match one script" };
}

export function projectDir(slug) { return path.join(REELS_DIR, slug); }
function loadProject(ref) {
  const s = resolveScript(ref);
  const dir = projectDir(s.slug);
  const pj = readJson(path.join(dir, "project.json"));
  if (!pj) throw new Error(`no project for ${s.slug} yet: run  npm run reel -- new ${s.num} --video <file>`);
  return { s, dir, pj, save: () => writeJson(path.join(dir, "project.json"), pj) };
}
function loadStructure(s) { return parseFanEconomy(fs.readFileSync(s.file, "utf8"), { num: s.num, slug: s.slug }); }

export function createProject(ref, video, opts = {}) {
  const s = resolveScript(ref);
  const dir = projectDir(s.slug);
  fs.mkdirSync(path.join(dir, "broll"), { recursive: true });
  const existing = readJson(path.join(dir, "project.json"));
  const pj = existing || { num: s.num, slug: s.slug, script: path.relative(REPO, s.file), createdAt: new Date().toISOString(), framing: { x: 0.5, y: 0.42, zoom: 1 }, music: { override: null }, stages: {}, renders: [] };
  if (video) {
    const abs = path.resolve(video);
    if (!fs.existsSync(abs)) throw new Error(`video not found: ${abs}`);
    const info = probe(abs);
    if (!info.hasAudio) throw new Error("that file has no audio track");
    pj.source = { path: abs, ...info };
    pj.stages = {};
    // A landscape recording is framed per beat (portrait crop, punch, split, band) around
    // where the speaker actually is; a vertical one keeps the fixed crop.
    if (info.width > info.height && (!pj.framing || !pj.framing.mode)) pj.framing = { mode: "dynamic" };
  }
  writeJson(path.join(dir, "project.json"), pj);
  if (!fs.existsSync(path.join(dir, "feedback.md"))) fs.writeFileSync(path.join(dir, "feedback.md"), `# Feedback: ${s.slug}\n\nNotes for the next pass. Anything that should apply to EVERY future reel belongs in .claude/skills/fan-economy-reel-editor/RULES.md or scripts/reel/rules.json instead.\n\n`);
  if (!opts.quiet) log(`project: ${path.relative(REPO, dir)}${pj.source ? `\nsource:  ${pj.source.path} (${pj.source.width}x${pj.source.height}, ${pj.source.duration.toFixed(1)}s)` : "\nno footage yet: pass --video <file>"}`);
  return { s, dir, pj };
}

// ------------------------------------------------------------------ stages

async function stageTranscribe(ref, opts = {}) {
  const { s, dir, pj, save } = loadProject(ref);
  const rules = loadRules();
  if (!pj.source) throw new Error("no footage attached: npm run reel -- new <n> --video <file>");
  const work = path.join(dir, "work");
  fs.mkdirSync(work, { recursive: true });
  const asr = path.join(work, "asr.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", pj.source.path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", asr]);
  const provider = resolveProvider(opts.provider || rules.transcription.provider);
  const S = loadStructure(s);
  let raw;
  if (opts.import) raw = readJson(path.resolve(opts.import));
  else if (provider === "elevenlabs") { log("transcribing with ElevenLabs Scribe (word timestamps, verbatim)..."); raw = await transcribeElevenLabs(asr, { model: rules.transcription.elevenlabsModel }); }
  else {
    log(`transcribing locally with faster-whisper ${opts.model || rules.transcription.localModel} (free; set ELEVENLABS_API_KEY for verbatim retake detection)...`);
    const hot = [S.artist, "CRWN", ...new Set(S.lines.flatMap((l) => l.names))].filter(Boolean).join(", ");
    raw = transcribeLocal(asr, path.join(work, "transcript.local.json"), { model: opts.model || rules.transcription.localModel, hotwords: hot });
  }
  writeJson(path.join(dir, "transcript.raw.json"), raw);
  let t = opts.import ? normalizeAny(raw, rules.takes.fillers) : provider === "elevenlabs" ? normalizeElevenLabs(raw, rules.takes.fillers) : normalizeLocal(raw, rules.takes.fillers);
  if (t.provider === "local" && !opts.noRepair) t = repairOmissions(t, asr, work, { model: opts.model || rules.transcription.localModel, fillers: rules.takes.fillers, duration: pj.source.duration });
  const problems = validateTranscript(t, pj.source.duration);
  if (problems.length) throw new Error(`transcript unusable: ${problems.join("; ")}`);
  writeJson(path.join(dir, "transcript.json"), t);
  const id = identifyByTranscript(t.words.map((w) => w.text).join(" "));
  pj.stages.transcribe = { at: new Date().toISOString(), provider: t.provider, words: t.words.length, scriptCheck: id };
  save();
  log(`transcript: ${t.words.length} words (${t.provider}).`);
  if (id.best?.num !== s.num) log(`WARNING: this recording sounds more like script ${id.best?.num} (${(id.best?.score * 100).toFixed(0)}%) than ${s.num}. Check the script before cutting.`);
}

/** Re-transcribe windows where Whisper probably dropped speech (see transcribe.mjs). */
function repairOmissions(t, asr, work, { model, fillers, duration }) {
  let words = t.words;
  const repaired = [];
  for (let pass = 0; pass < 3; pass++) {
    const wins = suspectWindows(words, { duration });
    if (!wins.length) break;
    for (const win of wins) {
      const clip = path.join(work, `window-${Math.round(win.start)}.wav`);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(win.start), "-t", String(win.end - win.start), "-i", asr, "-ac", "1", "-ar", "16000", clip]);
      const raw = transcribeLocal(clip, clip.replace(/\.wav$/, ".json"), { model });
      const ww = normalizeLocal(raw, fillers).words.map((w) => ({ ...w, start: +(w.start + win.start).toFixed(3), end: +(w.end + win.start).toFixed(3) }));
      const beforeN = words.length;
      words = spliceWindow(words, ww, win);
      repaired.push({ start: +win.start.toFixed(2), end: +win.end.toFixed(2), wordsBefore: beforeN, wordsAfter: words.length });
      log(`  omission repair ${win.start.toFixed(1)}-${win.end.toFixed(1)}s: ${words.length - beforeN >= 0 ? "+" : ""}${words.length - beforeN} words`);
    }
  }
  return { ...t, words, repaired };
}

function stageCut(ref) {
  const { s, dir, pj, save } = loadProject(ref);
  const rules = loadRules();
  const S = loadStructure(s);
  const t = readJson(path.join(dir, "transcript.json"));
  if (!t) throw new Error("no transcript.json: run transcribe first");
  const al = alignTakes(S, t, rules);
  const exclude = new Set(pj.exclude || []);
  if (exclude.size) {
    for (const k of al.kept) if (exclude.has(k.line)) k.drop = "excluded";
    log(`excluding script lines ${[...exclude].join(", ")} (project.json "exclude")`);
  }
  const work = path.join(dir, "work");
  fs.mkdirSync(work, { recursive: true });
  // Audio: 48k mono for the splice, and the envelope for cut snapping.
  const rate = 48000;
  const pcm = decodePcm(pj.source.path, rate);
  const env = envelope(pcm, rate);
  const edl = buildEdl(S, t, al, rules, { envelope: env });
  const outWords = remapWords(edl, captionWords(S, t, al));
  writeJson(path.join(dir, "alignment.json"), { coverage: al.coverage, lines: al.lines, chosen: al.chosen, offscript: al.offscript, stutters: al.stutters });
  writeJson(path.join(dir, "edl.json"), edl);
  writeJson(path.join(dir, "words.clean.json"), outWords);
  fs.writeFileSync(path.join(dir, "takes.md"), takeReport(S, al, edl, t));
  const proxy = path.join(work, "proxy.mp4");
  // The proxy (and the speaker track) depend only on the source and the framing: an
  // unchanged pair is not re-encoded on every re-cut.
  const st = fs.statSync(pj.source.path);
  const proxyKey = JSON.stringify({ src: pj.source.path, size: st.size, mtime: st.mtimeMs, framing: pj.framing });
  const proxyStamp = path.join(work, "proxy.key");
  const fresh = fs.existsSync(proxy) && fs.existsSync(proxyStamp) && fs.readFileSync(proxyStamp, "utf8") === proxyKey;
  if (!fresh) {
    log("framing the source into the working proxy...");
    makeProxy(pj.source.path, proxy, pj.framing, rules);
    fs.writeFileSync(proxyStamp, proxyKey);
  }
  if (pj.framing?.mode === "dynamic" && (!fresh || !fs.existsSync(path.join(dir, "track.json")))) {
    log("locating the speaker across the landscape source...");
    const track = trackSubject(proxy, { width: 1920, height: 1080 }, 2);
    writeJson(path.join(dir, "track.json"), track);
    const ok = track.samples.filter((s) => s.conf).length / Math.max(1, track.samples.length);
    log(`speaker located in ${(ok * 100).toFixed(0)}% of samples${track.occluder ? `, static occluder at x ${track.occluder.from}-${track.occluder.to}` : ""}`);
  }
  const voice = path.join(work, "voice.clean.wav");
  writeWav(voice, spliceAudio(pcm, rate, edl), rate);
  log("rendering the clean talking-head cut...");
  renderClean(proxy, voice, edl, path.join(dir, "aroll.clean.mp4"));
  const bad = al.lines.filter((l) => l.status !== "clean");
  pj.stages.cut = { at: new Date().toISOString(), coverage: al.coverage, rawSec: +pj.source.duration.toFixed(2), cleanSec: edl.duration, segments: edl.segments.length, linesNeedingReview: bad.map((l) => l.id) };
  save();
  log(`clean cut: ${edl.duration.toFixed(1)}s from ${pj.source.duration.toFixed(1)}s, ${edl.segments.length} segments, script coverage ${(al.coverage * 100).toFixed(0)}%. Review takes.md and aroll.clean.mp4.`);
  if (bad.length) log(`lines to check: ${bad.map((l) => `${l.id} (${l.status})`).join(", ")}`);
}

function planContext(s, dir) {
  const rules = loadRules();
  const S = loadStructure(s);
  const outWords = readJson(path.join(dir, "words.clean.json"));
  const edl = readJson(path.join(dir, "edl.json"));
  if (!outWords || !edl) throw new Error("no clean cut yet: run cut first");
  const caps = loadCapabilities();
  const library = loadLibrary();
  const sheets = resolveSheets(s.slug, library);
  const { assets: broll, refused } = resolveBroll(dir);
  const toolName = toolNames()[S.leadMagnet.slug] || S.leadMagnet.toolName;
  const track = readJson(path.join(dir, "track.json"));
  const pj = readJson(path.join(dir, "project.json"));
  return { rules, structure: S, outWords, edl, lineTimes: lineWindows(S, outWords), caps, library, sheets, broll, refused, toolName, track: pj?.framing?.mode === "dynamic" ? track : null };
}

async function stagePlan(ref, opts = {}) {
  const { s, dir, pj, save } = loadProject(ref);
  const ctx = planContext(s, dir);
  const file = path.join(dir, "beats.json");
  // An authored plan (videos/reel-plans/<slug>.mjs) anchors every beat to a spoken word:
  // it is re-resolved on every plan/build/render, so a re-cut never strands a graphic.
  const authored = path.join(REPO, "videos/reel-plans", `${s.slug}.mjs`);
  if (fs.existsSync(authored) && !opts.draft) {
    const mod = await import(`${pathToFileURL(authored).href}?t=${Date.now()}`);
    const P = await openPlan(s.slug, { reelsDir: REELS_DIR });
    await mod.default(P);
    P.write();
    log(`plan: authored plan ${path.relative(REPO, authored)} re-resolved against this cut`);
  }
  const existing = readJson(file);
  if (existing?.edited && !opts.force) {
    log("beats.json has hand edits (edited: true): validating it instead of replacing it. Use --force to redraft.");
  } else {
    const p = planBeats(ctx);
    writeJson(file, { slug: s.slug, title: ctx.structure.title, edited: false, arollDuration: ctx.edl.duration, ...p });
  }
  const plan = readJson(file);
  const v = validateBeats(plan, ctx);
  writeJson(file, plan);
  pj.stages.plan = { at: new Date().toISOString(), beats: plan.beats.length, errors: v.errors, warnings: v.warnings, repaired: v.repaired, face: v.face };
  save();
  if (ctx.refused.length) log(`B-roll refused (no provenance): ${ctx.refused.map((r) => `${r.file}: ${r.reason}`).join("; ")}`);
  log(`plan: ${plan.beats.length} beats, face on screen ${(v.face.ratio * 100).toFixed(0)}%.`);
  for (const r of v.repaired) log(`  repaired: ${r}`);
  for (const w of v.warnings) log(`  warning: ${w}`);
  for (const e of v.errors) log(`  ERROR: ${e}`);
  if (v.errors.length) throw new Error(`the plan has ${v.errors.length} error(s): fix beats.json and rerun plan`);
  return { plan, ctx, v };
}

/** Copy/transcode what the composition needs into composition/assets. */
function prepareAssets(compDir, dir, ctx, plan) {
  const A = path.join(compDir, "assets");
  fs.mkdirSync(path.join(A, "fonts"), { recursive: true });
  const files = {};
  const link = (src, dst) => { fs.rmSync(dst, { force: true }); try { fs.linkSync(src, dst); } catch { fs.copyFileSync(src, dst); } };
  link(path.join(dir, "aroll.clean.mp4"), path.join(A, "aroll.mp4"));
  fs.copyFileSync(path.join(ENGINE, "node_modules/gsap/dist/gsap.min.js"), path.join(A, "gsap.min.js"));
  for (const f of ["inter.woff2", "patrickhand.woff2"]) fs.copyFileSync(path.join(FONTS, f), path.join(A, "fonts", f));
  const used = new Set();
  for (const b of plan.beats) for (const id of [b.broll?.asset, b.graphic?.props?.asset, b.graphic?.props?.footage]) if (id) used.add(id);
  for (const id of used) {
    const sheet = ctx.sheets.find((x) => x.id === id);
    const lib = ctx.library.library[id];
    const br = ctx.broll.find((x) => x.id === id);
    const src = sheet?.path || lib?.path || br?.path;
    if (!src || !fs.existsSync(src)) throw new Error(`asset ${id} is missing on disk: ${src}`);
    const isVideo = /\.(mp4|mov|webm|m4v)$/i.test(src);
    const dst = path.join(A, `${id}.${isVideo ? "mp4" : "jpg"}`);
    const stamp = `${dst}.src.json`;
    const want = JSON.stringify({ src, mtime: fs.statSync(src).mtimeMs, crop: lib?.crop || null, enc: 2 });
    if (!fs.existsSync(dst) || !fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8") !== want) {
      const c = lib?.crop;
      const cropF = c ? `crop=iw*${c.w}:ih*${c.h}:iw*${c.x}:ih*${c.y},` : "";
      if (isVideo) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-an", "-vf", `${sdrFilter(probe(src))}${cropF}scale=720:-2,fps=30`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", ...BT709_TAGS, ...SEEKABLE, "-t", "90", dst]);
      else execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", "scale='min(1400,iw)':-2", "-q:v", "3", dst]);
      fs.writeFileSync(stamp, want);
    }
    files[id] = { rel: `assets/${path.basename(dst)}`, type: isVideo ? "video" : "image", startAt: lib?.startAt ?? 2, credit: br ? `Source: ${br.provenance.source}` : null, provenance: sheet?.provenance || lib?.provenance || br?.provenance };
  }
  return files;
}

async function stageBuild(ref) {
  const { s, dir, pj, save } = loadProject(ref);
  const { plan, ctx, v } = await stagePlan(ref);
  const compDir = path.join(dir, "composition");
  const assetFiles = prepareAssets(compDir, dir, ctx, plan);
  const phrases = groupCaptions(ctx.outWords, ctx.structure, ctx.rules);
  const leaks = captionLeaks(phrases);
  const comp = buildComposition({ plan, phrases, rules: ctx.rules, outWords: ctx.outWords, assetFiles, framing: ctx.track ? { track: ctx.track, edl: ctx.edl } : null });
  if (comp.missing.length) throw new Error(`beats use components that do not exist: ${comp.missing.join(", ")}`);
  const safe = safeZoneViolations(comp.boxes, ctx.rules);
  writeProject(compDir, comp.html, { id: s.slug, name: ctx.structure.title, createdAt: pj.createdAt });
  writeJson(path.join(dir, "captions.json"), phrases);
  writeJson(path.join(dir, "assets.json"), Object.fromEntries(Object.entries(assetFiles).map(([id, a]) => [id, { file: a.rel, type: a.type, provenance: a.provenance }])));

  log("mixing audio...");
  let music = null;
  try { music = proposeTrack(plan.duration, { overrideName: pj.music?.override || null, record: false }); } catch (e) { log(`no music: ${e.message}`); }
  const audioDir = path.join(dir, "audio");
  const mixReport = mix({ voiceIn: path.join(dir, "work/voice.clean.wav"), outFile: path.join(audioDir, "mix.wav"), workDir: audioDir, plan, structure: ctx.structure, outWords: ctx.outWords, rules: ctx.rules, music });
  // The track record and the loudness measurements are separate keys: spreading the
  // measurements after the record used to overwrite which track was used.
  writeJson(path.join(audioDir, "mix.json"), { ...mixReport, musicLoudness: mixReport.music, music: music && { track: music.track, tier: music.tier, segmentStart: music.segmentStart, reason: music.selectionReason, source: "founder music library (videos/music)" } });

  log("hyperframes check (lint, runtime, layout, contrast)...");
  const chk = spawnSync(HF, ["check", compDir, "--json", "--samples", "12"], { encoding: "utf8", env: HF_ENV, maxBuffer: 1 << 26, timeout: 600000 });
  let check = null;
  try { check = JSON.parse(chk.stdout.slice(chk.stdout.indexOf("{"))); } catch { check = { raw: (chk.stdout || "") + (chk.stderr || "") }; }
  writeJson(path.join(dir, "qa/check.json"), check);
  const lintErrors = (check?.lint?.findings || []).filter((f) => f.severity === "error");
  pj.stages.build = { at: new Date().toISOString(), captions: comp.captions, safeZone: safe, captionLeaks: leaks, checkExit: chk.status, lintErrors: lintErrors.map((f) => f.code), music: music?.track || null };
  save();
  if (lintErrors.length) {
    for (const f of lintErrors) log(`  HYPERFRAMES ERROR ${f.code}: ${f.message}`);
    throw new Error(`the composition has ${lintErrors.length} HyperFrames lint error(s) (qa/check.json): a render would be wrong, so it was not started`);
  }
  log(`composition: ${path.relative(REPO, compDir)} (${comp.captions} caption phrases). hyperframes check exit ${chk.status}.`);
  if (safe.length) log(`  safe-zone problems: ${safe.map((x) => `beat ${x.beat} ${x.what}`).join(", ")}`);
  if (leaks.length) log(`  CAPTION LEAKS: ${leaks.map((l) => l.phrase).join("; ")}`);
  return { plan, ctx, v, safe, leaks, mixReport };
}

async function stageRender(ref, opts = {}) {
  const { s, dir, pj, save } = loadProject(ref);
  const built = await stageBuild(ref);
  const compDir = path.join(dir, "composition");
  const renders = path.join(dir, "renders");
  fs.mkdirSync(renders, { recursive: true });
  const silent = path.join(renders, "video.mp4");
  log(`rendering with HyperFrames (${opts.draft ? "draft" : "standard"} quality)... this takes a few minutes`);
  const r = spawnSync(HF, ["render", compDir, "-o", silent, "-f", String(built.ctx.rules.format.fps), "-q", opts.draft ? "draft" : "standard", "-w", String(opts.workers || 4), "--sdr", "--quiet"], { stdio: "inherit", env: HF_ENV, timeout: 3 * 60 * 60 * 1000 });
  if (r.status !== 0) throw new Error(`hyperframes render failed (exit ${r.status})`);
  const version = (pj.renders?.length || 0) + 1;
  const final = path.join(renders, `${s.slug}-v${version}.mp4`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", silent, "-i", path.join(dir, "audio/mix.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", final]);
  pj.renders = [...(pj.renders || []), { version, file: path.relative(dir, final), at: new Date().toISOString(), draft: !!opts.draft }];
  save();
  log(`rendered: ${path.relative(REPO, final)}`);
  return stageQa(ref, { file: final, built });
}

function stageQa(ref, opts = {}) {
  const { s, dir, pj, save } = loadProject(ref);
  const last = pj.renders?.[pj.renders.length - 1];
  const file = opts.file || (last && path.join(dir, last.file));
  if (!file || !fs.existsSync(file)) throw new Error("nothing rendered yet");
  const built = opts.built || (() => {
    const ctx = planContext(s, dir);
    const plan = readJson(path.join(dir, "beats.json"));
    const v = validateBeats(plan, ctx);
    const phrases = groupCaptions(ctx.outWords, ctx.structure, ctx.rules);
    return { plan, ctx, v, safe: pj.stages.build?.safeZone || [], leaks: captionLeaks(phrases), mixReport: readJson(path.join(dir, "audio/mix.json")) };
  })();
  const q = runQa(file, { plan: built.plan, rules: built.ctx.rules, structure: built.ctx.structure, validation: built.v, captionLeaks: built.leaks, safeZone: built.safe, mixReport: built.mixReport, hfCheck: readJson(path.join(dir, "qa/check.json")) });
  const qaDir = path.join(dir, "qa");
  const cs = contactSheets(file, built.plan, qaDir);
  writeJson(path.join(qaDir, "qa.json"), { file: path.relative(dir, file), ...q, sheets: cs.sheets.map((x) => path.relative(dir, x)) });
  fs.writeFileSync(path.join(qaDir, "QA.md"), qaMarkdown(q, cs));
  pj.stages.qa = { at: new Date().toISOString(), file: path.relative(dir, file), passed: q.passed, failed: q.failed };
  save();
  log(qaMarkdown(q, cs));
  if (q.passed) {
    const finalDir = path.join(dir, "final");
    fs.mkdirSync(finalDir, { recursive: true });
    const out = path.join(finalDir, `${s.slug}.mp4`);
    fs.copyFileSync(file, out);
    log(`final: ${path.relative(REPO, out)}`);
    if (fs.existsSync(EXPORT_DIR)) { fs.copyFileSync(file, path.join(EXPORT_DIR, `${s.slug}.mp4`)); log(`exported: ${EXPORT_DIR}/${s.slug}.mp4`); }
  }
  return q;
}

async function stageRun(args, opts) {
  let ref = args[0];
  let video = opts.video || null;
  if (ref && !/^\d+$/.test(ref) && fs.existsSync(ref)) {
    video = ref;
    const id = identifyByName(video);
    ref = id.num;
    log(`script: ${id.how}`);
    if (!ref) {
      // Fall back to what was said.
      const tmp = path.join(REELS_DIR, "_identify");
      fs.mkdirSync(tmp, { recursive: true });
      const asr = path.join(tmp, "asr.wav");
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-t", "90", asr]);
      const raw = transcribeLocal(asr, path.join(tmp, "t.json"), { model: loadRules().transcription.localModel });
      const byT = identifyByTranscript(raw.words.map((w) => w.text).join(" "));
      log(`script: ${byT.how}`);
      if (!byT.num) throw new Error(`could not tell which script this is (${id.candidates?.length ? `candidates ${id.candidates.join(", ")}` : "no candidates"}). Rerun with the number: npm run reel -- run <n> --video "${video}"`);
      ref = byT.num;
    }
  }
  if (!ref) throw new Error("usage: npm run reel -- run <video file> | run <n> --video <file>");
  createProject(ref, video, { quiet: false });
  const { pj } = loadProject(ref);
  if (!pj.stages.transcribe || video) await stageTranscribe(ref, opts);
  stageCut(ref);
  const q = await stageRender(ref, opts);
  if (!q.passed) {
    log(`QA failed: ${q.failed.join(", ")}. Nothing was exported. Fix the cause (see qa/QA.md), then  npm run reel -- render ${ref}`);
    process.exitCode = 2;
  }
}

function stagePreview(ref) {
  const { dir } = loadProject(ref);
  const compDir = path.join(dir, "composition");
  if (!fs.existsSync(path.join(compDir, "index.html"))) throw new Error("no composition yet: run build first");
  const r = spawnSync(HF, ["preview", "--background"], { cwd: compDir, stdio: "inherit", env: HF_ENV });
  process.exitCode = r.status || 0;
}

function stageFeedback(ref, note) {
  const { dir, pj } = loadProject(ref);
  if (!note) throw new Error('usage: npm run reel -- feedback <n> "note"');
  const v = pj.renders?.[pj.renders.length - 1]?.version ?? 0;
  fs.appendFileSync(path.join(dir, "feedback.md"), `- ${new Date().toISOString().slice(0, 16)} (v${v}): ${note}\n`);
  log("noted in feedback.md. Ask Claude to apply it: it decides whether it is this video only or a standing rule (RULES.md / rules.json).");
}

function stageStatus(ref) {
  const dirs = ref ? [resolveScript(ref).slug] : fs.existsSync(REELS_DIR) ? fs.readdirSync(REELS_DIR).filter((d) => fs.existsSync(path.join(REELS_DIR, d, "project.json"))) : [];
  if (!dirs.length) { log("no reel projects yet."); return; }
  for (const d of dirs) {
    const pj = readJson(path.join(REELS_DIR, d, "project.json"));
    const st = pj.stages || {};
    const mark = (k) => (st[k] ? "done" : "-");
    log(`${d}\n  footage ${pj.source ? "yes" : "NO"} | transcribe ${mark("transcribe")} | cut ${mark("cut")} | plan ${st.plan ? (st.plan.errors?.length ? "ERRORS" : "done") : "-"} | build ${mark("build")} | renders ${pj.renders?.length || 0} | qa ${st.qa ? (st.qa.passed ? "PASSED" : "FAILED") : "-"}`);
  }
}

function stageAssets() {
  const lib = loadLibrary();
  const missing = missingFiles(lib);
  const caps = loadCapabilities();
  const ev = missingEvidence(caps);
  log(`asset library: ${Object.keys(lib.library).length} entries, ${missing.length} missing on disk${missing.length ? `: ${missing.map((m) => m.id).join(", ")}` : ""}`);
  log(`capabilities: ${Object.keys(caps.capabilities).length}, evidence missing: ${ev.length ? ev.map((e) => `${e.key} (${e.path})`).join(", ") : "none"}`);
  const tools = toolNames();
  const withFootage = new Set(Object.values(lib.library).filter((a) => a.kind === "tool_footage").map((a) => a.leadMagnet));
  const needed = new Set(listScripts().map((s) => (parseFanEconomy(fs.readFileSync(s.file, "utf8")).leadMagnet.slug)).filter(Boolean));
  const gaps = [...needed].filter((t) => !withFootage.has(t));
  log(`CTA tools the scripts use without a recording yet (they get a name card instead): ${gaps.map((g) => tools[g] || g).join(", ") || "none"}`);
}

// ------------------------------------------------------------------ cli

function parseArgs(argv) {
  const args = [], opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { opts[k] = next; i++; } else opts[k] = true;
    } else args.push(a);
  }
  return { args, opts };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { args, opts } = parseArgs(rest);
  switch (cmd) {
    case "new": createProject(args[0], opts.video || args[1]); break;
    case "identify": {
      const id = identifyByName(args[0]);
      log(id.num ? `script ${id.num} (${id.how})` : `${id.how}${id.candidates?.length ? `: ${id.candidates.join(", ")}` : ""}`);
      break;
    }
    case "transcribe": await stageTranscribe(args[0], opts); break;
    case "cut": stageCut(args[0]); break;
    case "plan": await stagePlan(args[0], opts); break;
    case "build": await stageBuild(args[0]); break;
    case "render": { const q = await stageRender(args[0], opts); if (!q.passed) process.exitCode = 2; break; }
    case "qa": { const q = stageQa(args[0]); if (!q.passed) process.exitCode = 2; break; }
    case "run": await stageRun(args, opts); break;
    case "preview": stagePreview(args[0]); break;
    case "feedback": stageFeedback(args[0], args.slice(1).join(" ")); break;
    case "status": stageStatus(args[0]); break;
    case "assets": stageAssets(); break;
    default:
      log("usage: npm run reel -- run <video>|run <n> --video <file>|new|transcribe|cut|plan|build|render|qa|preview|feedback|status|assets|identify");
      process.exitCode = cmd ? 1 : 0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`reel: ${e.message}`); process.exitCode = 1; });
}

export { stagePlan, stageBuild, faceStats };
