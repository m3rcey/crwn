// Audio: voice first, always.
//
//   voice  cleaned A-roll voice: high-pass, optional denoise, gentle compression,
//          loudness-normalized to rules.audio.voiceTargetLufs (two-pass, linear).
//   music  the founder's own library (scripts/video/lib/music.mjs, the SAME weighted
//          rotation and usage history the silent pipeline uses). Sits a fixed
//          musicUnderVoiceDb under the voice (his rule: very low, always the same
//          level), sidechain-ducked under speech, dropped for the hook turn with a
//          riser peaking on the drop (his rule), dipped before the reveal, and faded
//          out before the last line.
//   sfx    synthesized here with ffmpeg: nothing downloaded, nothing licensed, the
//          same bytes every render. Only on beats that asked for one.
// Final: mixed, normalized to rules.audio.finalTargetLufs with a true-peak ceiling.

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 1 << 26 });

// ffmpeg writes its measurements to STDERR; execFileSync only returns stdout.
function ffStderr(args) {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || "").slice(-400)}`);
  return r.stderr;
}

/** Integrated loudness / true peak / LRA of a file (ffmpeg loudnorm analysis). */
export function measureLoudness(file) {
  return parseLoudnormJson(ffStderr(["-hide_banner", "-nostats", "-i", file, "-af", "loudnorm=print_format=json", "-f", "null", "-"]));
}
export function parseLoudnormJson(stderr) {
  const m = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) throw new Error("loudnorm produced no measurement");
  const j = JSON.parse(m[0]);
  return { i: +j.input_i, tp: +j.input_tp, lra: +j.input_lra, thresh: +j.input_thresh, offset: +j.target_offset };
}

function loudnormTwoPass(inFile, outFile, target, tp, extraPre = "", channels = 1) {
  const pre = extraPre ? `${extraPre},` : "";
  const m = parseLoudnormJson(ffStderr(["-hide_banner", "-nostats", "-i", inFile, "-af", `${pre}loudnorm=I=${target}:TP=${tp}:LRA=11:print_format=json`, "-f", "null", "-"]));
  ff(["-i", inFile, "-af", `${pre}loudnorm=I=${target}:TP=${tp}:LRA=11:measured_I=${m.i}:measured_TP=${m.tp}:measured_LRA=${m.lra}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true`, "-ar", "48000", "-ac", String(channels), outFile]);
  return m;
}

export function processVoice(inWav, outWav, rules) {
  const A = rules.audio;
  const chain = ["highpass=f=70", A.denoise ? "afftdn=nf=-25" : null, "acompressor=threshold=-21dB:ratio=2.5:attack=8:release=120:makeup=2"].filter(Boolean).join(",");
  return loudnormTwoPass(inWav, outWav, A.voiceTargetLufs, -2, chain);
}

// ---------------------------------------------------------------- sound effects

export const SFX = {
  riser: { d: 1.4, src: "aevalsrc='0.22*sin(2*PI*(180*t+260*t*t))+0.12*sin(2*PI*(360*t+520*t*t))':d=1.4:s=48000", post: "afade=t=in:d=1.3:curve=exp" },
  hit: { d: 1.0, src: "aevalsrc='0.95*sin(2*PI*52*t)*exp(-5*t)+0.35*sin(2*PI*104*t)*exp(-9*t)':d=1.0:s=48000", post: "lowpass=f=900" },
  whoosh: { d: 0.4, src: "anoisesrc=d=0.4:c=pink:r=48000:a=0.5:seed=7", post: "bandpass=f=1400:w=1800,afade=t=in:d=0.18,afade=t=out:st=0.2:d=0.2" },
  pop: { d: 0.14, src: "aevalsrc='0.45*sin(2*PI*880*t)*exp(-38*t)':d=0.14:s=48000", post: "" },
  soft_hit: { d: 1.2, src: "aevalsrc='0.5*sin(2*PI*65*t)*exp(-4*t)':d=1.2:s=48000", post: "aecho=0.8:0.6:60:0.3" },
};

export function makeSfx(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [k, s] of Object.entries(SFX)) {
    const f = path.join(dir, `${k}.wav`);
    if (!fs.existsSync(f)) ff(["-f", "lavfi", "-i", s.src, ...(s.post ? ["-af", s.post] : []), "-ac", "1", "-ar", "48000", f]);
    out[k] = { file: f, d: s.d };
  }
  return out;
}

/**
 * Where each sound goes and where the music changes, from the beats. Pure.
 * @returns {{ cues: {kind:string, at:number}[], drops: {from:number,to:number,fade:number}[], musicEnd: number }}
 */
export function soundPlan(plan, structure, outWords, rules) {
  const A = rules.audio;
  const cues = [];
  const drops = [];
  const lineStart = (id) => outWords.find((w) => w.line === id)?.start ?? null;
  const lineEnd = (id) => { const ws = outWords.filter((w) => w.line === id); return ws.length ? ws[ws.length - 1].end : null; };
  for (const b of plan.beats) {
    if (!b.sound) continue;
    if (b.sound === "riser_drop") {
      // The drop starts in the middle of the hook's last sentence and holds until speech
      // resumes; the riser PEAKS exactly where the beat drops out.
      const turn = b.lines[0];
      const s = lineStart(turn), e = lineEnd(turn);
      const dropFrom = s !== null && e !== null ? (s + e) / 2 : b.start;
      const next = structure.lines.find((l) => l.id > turn && lineStart(l.id) !== null);
      const dropTo = next ? lineStart(next.id) : dropFrom + A.hookDropSec;
      cues.push({ kind: "riser", at: Math.max(0, dropFrom - SFX.riser.d) });
      drops.push({ from: dropFrom, to: Math.max(dropFrom + 0.4, dropTo), fade: 0.04 });
    } else {
      cues.push({ kind: b.sound, at: b.start });
    }
    if (b.scene === "numeric_reveal" && A.revealDrop) drops.push({ from: Math.max(0, b.start - 0.45), to: b.start, fade: 0.08 });
  }
  const kw = structure.anchors.kwLine;
  const lastLineAt = kw !== -1 ? lineStart(kw) : null;
  const musicEnd = A.musicEndsBeforeLastLine && lastLineAt !== null ? lastLineAt : plan.duration;
  // Cap density: keep the first N per minute, riser and hit always kept.
  const perMin = A.maxSfxPerMinute;
  const limit = Math.max(3, Math.floor((plan.duration / 60) * perMin));
  const keep = cues.filter((c) => c.kind === "riser" || c.kind === "hit");
  for (const c of cues) if (!keep.includes(c) && keep.length < limit) keep.push(c);
  keep.sort((a, b) => a.at - b.at);
  return { cues: keep, drops, musicEnd };
}

/** ffmpeg volume expression: 1 everywhere, ramping to 0 inside each drop. */
export function dropExpression(drops) {
  if (!drops.length) return "1";
  const parts = drops.map((d) => `if(between(t,${d.from.toFixed(3)},${d.to.toFixed(3)}),max(0,1-min(1,(t-${d.from.toFixed(3)})/${d.fade})),if(between(t,${d.to.toFixed(3)},${(d.to + 0.25).toFixed(3)}),(t-${d.to.toFixed(3)})/0.25,1))`);
  return parts.reduce((acc, p) => (acc === "1" ? p : `min(${acc},${p})`), "1");
}

/**
 * Build the final mix.
 * @returns measurements for QA
 */
export function mix({ voiceIn, outFile, workDir, plan, structure, outWords, rules, music }) {
  const A = rules.audio;
  fs.mkdirSync(workDir, { recursive: true });
  const voice = path.join(workDir, "voice.wav");
  processVoice(voiceIn, voice, rules);
  const dur = plan.duration;
  const sp = soundPlan(plan, structure, outWords, rules);
  const sfx = makeSfx(path.join(workDir, "sfx"));

  let musicFile = null;
  if (music) {
    // Bed: loop if needed, trim, drop/fade automation, level it under the voice.
    const raw = path.join(workDir, "music.raw.wav");
    const len = Math.max(1, sp.musicEnd);
    ff(["-stream_loop", "-1", "-ss", String(music.segmentStart || 0), "-i", music.sourcePath, "-t", len.toFixed(3), "-ac", "2", "-ar", "48000", "-af", `afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, len - A.musicFadeSec).toFixed(3)}:d=${A.musicFadeSec}`, raw]);
    const m = measureLoudness(raw);
    const gain = A.voiceTargetLufs - A.musicUnderVoiceDb - m.i;
    musicFile = path.join(workDir, "music.wav");
    const exprFile = path.join(workDir, "music.expr");
    fs.writeFileSync(exprFile, `volume='${dropExpression(sp.drops)}':eval=frame,volume=${gain.toFixed(2)}dB`);
    ff(["-i", raw, "-filter_script:a", exprFile, "-ar", "48000", musicFile]);
  }

  // SFX stem.
  const sfxFile = path.join(workDir, "sfx.wav");
  if (sp.cues.length) {
    const inputs = [], labels = [];
    sp.cues.forEach((c, i) => {
      inputs.push("-i", sfx[c.kind]?.file || sfx.pop.file);
      const gain = c.kind === "riser" ? -9 : c.kind === "hit" ? -4 : c.kind === "whoosh" ? -12 : -14;
      labels.push(`[${i}:a]volume=${gain}dB,adelay=${Math.round(c.at * 1000)}|${Math.round(c.at * 1000)}[s${i}]`);
    });
    const fc = `${labels.join(";")};${sp.cues.map((_, i) => `[s${i}]`).join("")}amix=inputs=${sp.cues.length}:normalize=0,apad,atrim=0:${dur.toFixed(3)}[out]`;
    ff([...inputs, "-filter_complex", fc, "-map", "[out]", "-ac", "2", "-ar", "48000", sfxFile]);
  } else {
    ff(["-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo`, "-t", dur.toFixed(3), sfxFile]);
  }

  // Mix: music ducked under the voice (sidechain), then everything summed.
  const pre = path.join(workDir, "mix.pre.wav");
  const inputs = ["-i", voice, "-i", sfxFile];
  let fc = `[0:a]apad,atrim=0:${dur.toFixed(3)},aformat=channel_layouts=stereo,asplit=2[v][key];`;
  if (musicFile) {
    inputs.push("-i", musicFile);
    const ratio = Math.max(1.5, Math.pow(10, A.duckDb / 20) * 1.5).toFixed(2);
    fc += `[2:a]apad,atrim=0:${dur.toFixed(3)}[m];[m][key]sidechaincompress=threshold=0.03:ratio=${ratio}:attack=25:release=350[md];[v][md][1:a]amix=inputs=3:normalize=0[out]`;
  } else {
    fc += `[key]anullsink;[v][1:a]amix=inputs=2:normalize=0[out]`;
  }
  ff([...inputs, "-filter_complex", fc, "-map", "[out]", "-ar", "48000", "-ac", "2", pre]);
  loudnormTwoPass(pre, outFile, A.finalTargetLufs, A.finalTruePeak, "", 2);

  // Measurements QA reads: voice vs music under the same final gain.
  const vM = measureLoudness(voice);
  const mM = musicFile ? measureLoudness(musicFile) : null;
  return { soundPlan: sp, voice: vM, music: mM, voiceOverMusicLu: mM ? +(vM.i - mM.i).toFixed(1) : null, final: measureLoudness(outFile) };
}
