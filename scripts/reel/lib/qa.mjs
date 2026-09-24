// QA after every render. Rendering is not completion.
//
// Measured checks (fail the render): format, duration, black/frozen frames, loudness,
// voice-over-music margin, the withheld gate (plan AND captions), the fact lock, the
// claim gate, provenance, the CTA keyword, the end card, safe zones.
// Sampled evidence (for the eye, the agent's first and the founder's last): a contact
// sheet of every beat plus the hook's first 1.5s and the reveal, written to qa/.
// What a check cannot see, it does not claim: the report separates the two.

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { probe } from "./cut.mjs";
import { measureLoudness } from "./audio.mjs";

export function parseIntervals(stderr, kind) {
  const out = [];
  if (kind === "black") {
    for (const m of stderr.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)) out.push({ start: +m[1], end: +m[2], d: +m[3] });
  } else {
    const starts = [...stderr.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => +m[1]);
    const ends = [...stderr.matchAll(/freeze_end:\s*([\d.]+)/g)].map((m) => +m[1]);
    starts.forEach((s, i) => out.push({ start: s, end: ends[i] ?? Infinity, d: (ends[i] ?? Infinity) - s }));
  }
  return out;
}

function detect(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vf", "scale=270:480,blackdetect=d=0.15:pix_th=0.06,freezedetect=n=0.0008:d=1.6", "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
  return { black: parseIntervals(r.stderr, "black"), freeze: parseIntervals(r.stderr, "freeze") };
}

/** Frames for the eye: every beat's middle, the hook, the reveal, the end card. */
export function sampleTimes(plan) {
  const t = new Set([0, 0.5, 1.0, 1.5]);
  for (const b of plan.beats) t.add(+((b.start + b.end) / 2).toFixed(2));
  const rv = plan.beats.find((b) => b.scene === "numeric_reveal");
  if (rv) { t.add(+(rv.start - 0.25).toFixed(2)); t.add(+(rv.start + 0.3).toFixed(2)); }
  return [...t].filter((x) => x >= 0 && x < plan.duration).sort((a, b) => a - b);
}

export function contactSheets(file, plan, dir) {
  fs.mkdirSync(path.join(dir, "frames"), { recursive: true });
  for (const f of fs.readdirSync(path.join(dir, "frames"))) fs.rmSync(path.join(dir, "frames", f));
  const times = sampleTimes(plan);
  times.forEach((t, i) => {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", t.toFixed(3), "-i", file, "-frames:v", "1", "-vf", `scale=270:480,drawtext=text='${t.toFixed(2)}s':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6`, path.join(dir, "frames", `f${String(i).padStart(3, "0")}.jpg`)]);
  });
  const sheets = [];
  const per = 32;
  for (let s = 0; s * per < times.length; s++) {
    const out = path.join(dir, `contact-${s + 1}.jpg`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-start_number", String(s * per), "-i", path.join(dir, "frames", "f%03d.jpg"), "-frames:v", "1", "-vf", `tile=8x4:padding=6:color=0x222222`, out]);
    sheets.push(out);
  }
  return { times, sheets };
}

/**
 * @param {string} file final render
 * @param {object} ctx { plan, validation, captionLeaks, safeZone, rules, structure, mixReport }
 */
export function runQa(file, ctx) {
  const { plan, rules } = ctx;
  const checks = [];
  const add = (id, ok, detail, severity = "error") => checks.push({ id, ok: !!ok, severity, detail });

  const p = probe(file);
  add("format", p.width === rules.format.width && p.height === rules.format.height, `${p.width}x${p.height}`);
  add("fps", Math.abs((p.fps || 0) - rules.format.fps) < 0.05, `${p.fps?.toFixed?.(2)} fps`);
  add("audio_present", p.hasAudio, p.hasAudio ? "audio stream present" : "NO AUDIO STREAM");
  add("duration", Math.abs(p.duration - plan.duration) < 0.25, `${p.duration.toFixed(2)}s rendered, ${plan.duration.toFixed(2)}s planned`);

  const d = detect(file);
  const endcard = plan.beats.find((b) => b.scene === "endcard");
  const blackBad = d.black.filter((x) => x.d >= 0.15);
  add("no_black_frames", !blackBad.length, blackBad.length ? `black at ${blackBad.map((x) => `${x.start.toFixed(2)}-${x.end.toFixed(2)}s`).join(", ")}` : "none");
  const freezeBad = d.freeze.filter((x) => !(endcard && x.start >= endcard.start - 0.3));
  add("no_frozen_frames", !freezeBad.length, freezeBad.length ? `frozen ${freezeBad.map((x) => `${x.start.toFixed(2)}-${Number.isFinite(x.end) ? x.end.toFixed(2) : "end"}s`).join(", ")}` : "none outside the end card");

  if (p.hasAudio) {
    const L = measureLoudness(file);
    add("loudness", Math.abs(L.i - rules.audio.finalTargetLufs) <= 1.0, `${L.i} LUFS (target ${rules.audio.finalTargetLufs})`);
    add("true_peak", L.tp <= rules.audio.finalTruePeak + 0.5, `${L.tp} dBTP (ceiling ${rules.audio.finalTruePeak})`);
  }
  if (ctx.mixReport?.voiceOverMusicLu != null) add("voice_dominates", ctx.mixReport.voiceOverMusicLu >= rules.audio.musicUnderVoiceDb - 4, `voice ${ctx.mixReport.voiceOverMusicLu} LU over the music bed (before ducking)`);

  const v = ctx.validation;
  add("withheld_reveal", !v.errors.some((e) => e.startsWith("WITHHELD")), v.errors.filter((e) => e.startsWith("WITHHELD")).join("; ") || "no figure or asset before its reveal");
  add("caption_withheld", !(ctx.captionLeaks || []).length, (ctx.captionLeaks || []).map((l) => `"${l.phrase}"`).join("; ") || "captions never show the answer early");
  add("fact_lock", !v.errors.some((e) => e.startsWith("FACT LOCK") || e.includes("malformed")), v.errors.filter((e) => e.startsWith("FACT LOCK") || e.includes("malformed")).join("; ") || "every number on screen traces to the script");
  add("crwn_claims", !v.errors.some((e) => e.startsWith("CLAIM")), v.errors.filter((e) => e.startsWith("CLAIM")).join("; ") || "product visuals only where the claim gate allows");
  add("provenance", !v.errors.some((e) => e.includes("provenance") || e.includes("unknown asset")), v.errors.filter((e) => e.includes("provenance") || e.includes("unknown asset")).join("; ") || "every asset has a source");
  const kw = plan.beats.find((b) => b.scene === "cta_keyword");
  add("cta_keyword", kw && kw.graphic?.props?.keyword === ctx.structure.ctaKeyword, kw ? `COMMENT ${kw.graphic?.props?.keyword} (script: ${ctx.structure.ctaKeyword})` : "no CTA keyword beat");
  add("endcard", endcard && endcard.end - endcard.start >= 1.0 && plan.beats[plan.beats.length - 1] === endcard, endcard ? `${(endcard.end - endcard.start).toFixed(1)}s, last` : "missing");
  add("safe_zone", !(ctx.safeZone || []).length, (ctx.safeZone || []).map((s) => `beat ${s.beat} ${s.what}: ${s.problems.join(", ")}`).join("; ") || "all text inside the platform safe zone");
  const first = plan.beats.find((b) => b.start > 0.01);
  add("hook_moves_fast", first && first.start <= rules.visual.hookFirstChangeSec + 0.05, first ? `first change at ${first.start.toFixed(2)}s` : "no change", "warning");
  if (ctx.hfCheck) {
    const errs = ["lint", "runtime", "layout"].flatMap((k) => (ctx.hfCheck[k]?.findings || []).filter((f) => f.severity === "error").map((f) => `${k}: ${f.code}${f.time != null ? ` at ${Number(f.time).toFixed(2)}s` : ""}`));
    add("hyperframes_check", !errs.length, errs.join("; ") || "lint, runtime and layout clean (HyperFrames)");
  }
  for (const w of v.warnings) add("plan_warning", false, w, "warning");

  const failed = checks.filter((c) => !c.ok && c.severity === "error");
  return { passed: !failed.length, failed: failed.map((c) => c.id), checks, detect: d, probe: p };
}

export function qaMarkdown(q, extra = {}) {
  const lines = [`# QA: ${q.passed ? "PASSED" : "FAILED"}`, ""];
  for (const c of q.checks) lines.push(`- ${c.ok ? "PASS" : c.severity === "warning" ? "WARN" : "FAIL"} ${c.id}: ${c.detail}`);
  if (extra.sheets?.length) {
    lines.push("", "## Frames for review (not machine-judged)", "");
    for (const s of extra.sheets) lines.push(`- ${path.basename(s)}`);
    lines.push("", "Look for: a face covered by a card, text that fights the background, a B-roll beat that does not match its sentence, a transition that jolts, a reveal that lands flat. Those are judgment calls: record them with `reel feedback`.");
  }
  return lines.join("\n") + "\n";
}
