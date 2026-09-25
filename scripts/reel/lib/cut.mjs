// The structural cut: chosen takes -> an edit decision list -> a clean talking-head
// render, BEFORE anything is decorated, so a bad cut can never hide under a graphic.
//
// Pacing is set per gap by what the gap IS, not by a global silence threshold:
// breaths inside a take stay, a sentence end gets a sentence pause, the hook's turn
// ("Let's find out.") gets a longer beat, the reveal gets a held breath before it, and
// a removed filler or stutter closes up tight. Every cut point is then placed
// ACOUSTICALLY (lib/boundaries.mjs): an out-point only after the voice has decayed, an
// in-point before the word's real onset, so a cut never clips a word's tail or start.

import fs from "node:fs";
import { withLevels, quietThreshold, decayPoint, onsetPoint, quietRunAfter, quietRunBefore, quietestIn, levelIn } from "./boundaries.mjs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * @param {object} structure parseFanEconomy()
 * @param {object} transcript normalized transcript
 * @param {object} alignment alignTakes()
 * @param {object} rules rules.json
 * @param {{ envelope?: {hop:number, rms:Float32Array}, fps?: number }} opts
 */
export function buildEdl(structure, transcript, alignment, rules, opts = {}) {
  const P = rules.pacing;
  const fps = opts.fps || rules.format.fps;
  const words = transcript.words;
  const keptSet = new Map();
  for (const k of alignment.kept) if (!k.drop) keptSet.set(k.w, k);
  const kept = [...keptSet.keys()].sort((a, b) => a - b);
  if (!kept.length) throw new Error("nothing was kept: the recording does not match this script");

  // Spans: runs of kept words with no dropped word between them and no long pause.
  // A span also always breaks after the hook turn and before the reveal, so those two
  // beats get their pause even when the founder rushed straight through them.
  const roleOf = (w) => structure.lines[keptSet.get(w)?.line]?.role;
  const forcedBreak = (a, b) => keptSet.get(a)?.line !== keptSet.get(b)?.line && (roleOf(a) === "hook_turn" || roleOf(b) === "reveal");
  const spans = [];
  let cur = null;
  for (const w of kept) {
    if (cur && w === cur.w1 + 1 && words[w].start - words[cur.w1].end <= P.keepPauseMaxSec && !forcedBreak(cur.w1, w)) { cur.w1 = w; continue; }
    cur = { w0: w, w1: w };
    spans.push(cur);
  }

  const lineOf = (w) => keptSet.get(w)?.line ?? null;
  const lastTokenOfLine = new Map();
  const firstTokenOfLine = new Map();
  for (const k of alignment.kept) {
    if (k.drop || !k.sTok) continue;
    const l = k.sTok.line;
    if (!firstTokenOfLine.has(l) || k.w < firstTokenOfLine.get(l)) firstTokenOfLine.set(l, k.w);
    if (!lastTokenOfLine.has(l) || k.w > lastTokenOfLine.get(l)) lastTokenOfLine.set(l, k.w);
  }

  const env = opts.envelope ? withLevels(opts.envelope) : null;
  const thrDb = env ? quietThreshold(env, { overFloorDb: P.quietOverFloorDb ?? 5, ceilDb: P.quietCeilDb ?? -24 }) : null;

  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    const prevSrcEnd = s.w0 > 0 ? words[s.w0 - 1].end : 0;
    const nextSrcStart = s.w1 + 1 < words.length ? words[s.w1 + 1].start : words[s.w1].end + 5;
    s.first = words[s.w0].start;
    s.last = words[s.w1].end;
    s.availBefore = Math.max(0, s.first - prevSrcEnd - 0.02);
    s.availAfter = Math.max(0, nextSrcStart - s.last - 0.02);
    s.line = lineOf(s.w1);
    s.firstLine = lineOf(s.w0);
  }

  // What each gap between spans is, and the pause it deserves.
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i], next = spans[i + 1];
    let pause, kind;
    if (!next) { pause = P.sentencePauseSec; kind = "end"; }
    else {
      const endsLine = lastTokenOfLine.get(s.line) === s.w1;
      const nextLine = structure.lines[next.firstLine];
      const thisLine = structure.lines[s.line];
      const sameLine = next.firstLine === s.line;
      // Tight only where a word was actually removed (a filler, a stutter). A plain pause
      // mid-line is a breath: squeezing it to nothing made real delivery sound robotic.
      let removed = false;
      for (let w = s.w1 + 1; w < next.w0; w++) if (words[w].type !== "event") { removed = true; break; }
      if (sameLine && !endsLine && removed) { pause = 0.03; kind = "micro"; }
      else if (sameLine && !endsLine) { pause = Math.min(words[next.w0].start - s.last, P.breathPauseSec ?? 0.22); kind = "breath"; }
      else if (thisLine?.role === "hook_turn") { pause = P.hookTurnPauseSec; kind = "hook_turn"; }
      else if (nextLine?.role === "reveal" && firstTokenOfLine.get(nextLine.id) === next.w0) { pause = P.preRevealPauseSec; kind = "pre_reveal"; }
      else if (nextLine && thisLine && nextLine.para !== thisLine.para) { pause = P.paragraphPauseSec; kind = "paragraph"; }
      else if (/[.?!]["”']?$/.test(words[s.w1].text) || endsLine) { pause = P.sentencePauseSec; kind = "sentence"; }
      else { pause = P.commaPauseSec; kind = "comma"; }
    }
    s.gapKind = kind;
    s.pause = pause;
  }

  // Acoustic boundaries. A word ENDS where the voice has decayed (quiet held longer than a
  // consonant closure), searched past the recognizer's end and past the next recognized
  // word's start, because both are routinely early. A word STARTS where its onset really
  // begins, searched back from the recognizer's (late) start. Without a measured envelope
  // (tests, a silent file) the recognizer's times plus padding are used.
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    const nextWord = words[s.w1 + 1];
    const prevWord = words[s.w0 - 1];
    if (env) {
      const lim = nextWord ? nextWord.start + (P.onsetSlackSec ?? 0.15) : s.last + 1;
      const d = decayPoint(env, s.last - 0.02, lim, { thrDb, holdSec: P.voiceHoldSec ?? 0.09 });
      if (d === null) { s.voiceEnd = quietestIn(env, s.last, Math.max(s.last, lim)); s.continuous = true; }
      else s.voiceEnd = Math.max(d, s.last - 0.02);
      s.quietAfter = s.continuous ? 0 : quietRunAfter(env, s.voiceEnd, thrDb);
      const low = prevWord ? prevWord.end - 0.05 : 0;
      const o = onsetPoint(env, s.first + 0.03, low, { thrDb, holdSec: P.onsetHoldSec ?? 0.06 });
      s.voiceStart = o === null ? quietestIn(env, Math.max(low, s.first - 0.12), s.first) : Math.min(o, s.first);
      s.quietBefore = o === null ? 0 : quietRunBefore(env, s.voiceStart, thrDb);
      s.continuousIn = o === null;
    } else {
      s.voiceEnd = s.last; s.voiceStart = s.first;
      s.quietAfter = s.availAfter; s.quietBefore = s.availBefore;
    }
  }

  // Split each pause into this span's tail and the next span's head, taking only real
  // room tone the recording has on each side of the voice.
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i], next = spans[i + 1];
    const tail = Math.min(Math.max(P.padOutSec, s.pause * 0.6), Math.max(0, s.quietAfter - 0.01));
    s.out = s.voiceEnd + tail;
    if (next) {
      const want = Math.max(P.padInSec, s.pause - tail);
      next.head = Math.min(want, Math.max(0, next.quietBefore - 0.01));
    }
  }
  spans[0].head = Math.min(P.padInSec + 0.05, Math.max(0, spans[0].quietBefore - 0.01));

  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    s.in = Math.max(0, s.voiceStart - (s.head ?? 0));
    // Frame grid, so picture and sound cut on the same instant. Rounding may only move a
    // cut AWAY from the voice (in earlier, out later), and only while that stays in room
    // tone; otherwise it moves toward the voice by less than a frame, never across it.
    const inF = Math.floor(s.in * fps) / fps, inC = Math.ceil(s.in * fps) / fps;
    s.in = !env || levelIn(env, inF, s.voiceStart) <= thrDb + 3 || inC > s.voiceStart ? inF : inC;
    const outC = Math.ceil(s.out * fps) / fps, outF = Math.floor(s.out * fps) / fps;
    s.out = !env || levelIn(env, s.voiceEnd, outC) <= thrDb + 3 || outF < s.voiceEnd ? outC : outF;
    s.in = Math.max(0, s.in);
    if (i > 0 && s.in < spans[i - 1].out) s.in = spans[i - 1].out;
    if (s.out <= s.in) s.out = s.in + 1 / fps;
  }

  // Output timeline.
  let t = 0;
  const segments = spans.map((s, i) => {
    const seg = {
      i,
      srcIn: +s.in.toFixed(6),
      srcOut: +s.out.toFixed(6),
      outStart: +t.toFixed(6),
      outEnd: +(t + (s.out - s.in)).toFixed(6),
      w0: s.w0,
      w1: s.w1,
      line: s.line,
      gapAfter: s.gapKind,
      jumpCut: i > 0 && spans[i - 1].line === s.firstLine && spans[i - 1].gapKind === "micro",
      ...(s.continuous ? { continuous: true } : {}),
    };
    t += s.out - s.in;
    return seg;
  });
  return { fps, duration: +t.toFixed(6), segments };
}

/** Map a source time to the clean timeline (null if it was cut). */
export function toOut(edl, srcT) {
  for (const s of edl.segments) if (srcT >= s.srcIn - 1e-6 && srcT <= s.srcOut + 1e-6) return +(s.outStart + (srcT - s.srcIn)).toFixed(4);
  return null;
}

/** Caption words and line windows on the clean timeline. */
export function remapWords(edl, capWords) {
  const out = [];
  for (const w of capWords) {
    const a = toOut(edl, w.start), b = toOut(edl, w.end);
    if (a === null || b === null) continue;
    out.push({ ...w, start: a, end: Math.max(a + 0.04, b) });
  }
  return out;
}

export function lineWindows(structure, outWords) {
  return structure.lines.map((l) => {
    const ws = outWords.filter((w) => w.line === l.id);
    return ws.length ? { id: l.id, start: ws[0].start, end: ws[ws.length - 1].end } : { id: l.id, start: null, end: null };
  });
}

/** Human-readable take report (takes.md). */
export function takeReport(structure, alignment, edl, transcriptMeta) {
  const out = [];
  out.push(`# Take report: ${structure.slug}`);
  out.push("");
  out.push(`Transcript: ${transcriptMeta.provider}${transcriptMeta.model ? ` (${transcriptMeta.model})` : ""}. Script coverage ${(alignment.coverage * 100).toFixed(0)}%. Clean cut ${edl.duration.toFixed(1)}s from ${transcriptMeta.duration?.toFixed?.(1) ?? "?"}s raw, ${edl.segments.length} segments.`);
  out.push("");
  const bad = alignment.lines.filter((l) => l.status !== "clean");
  out.push(bad.length ? `**Check these lines (${bad.length}):**` : "Every script line has a clean take.");
  for (const l of bad) out.push(`- line ${l.id} (${l.role}) is ${l.status.toUpperCase()} (${Math.round(l.coverage * 100)}%): "${l.text}"`);
  out.push("");
  out.push("| # | role | kept take | dropped |");
  out.push("|---|---|---|---|");
  for (const l of alignment.lines) {
    const kept = l.takes.map((t) => `${t.start}-${t.end}s${t.trimmed ? " (trimmed)" : ""}`).join(", ") || "none";
    const dropped = l.dropped.map((d) => `${d.start}s ${d.reason}`).join("; ");
    out.push(`| ${l.id} | ${l.role} | ${kept} | ${dropped} |`);
  }
  if (alignment.filled?.length) {
    out.push("");
    out.push("**Kept although the recognizer did not match it to the script** (it sits where script words were missing, so it is most likely those words misheard):");
    for (const f of alignment.filled) out.push(`- line ${f.line}: "${f.said}"`);
  }
  if (alignment.restored?.length) {
    out.push("");
    out.push(`**Kept as part of the delivery** (paraphrase joined to kept speech with no pause, ${alignment.restored.length} words): ${alignment.restored.map((r) => r.word).join(" ")}`);
  }
  if (alignment.offscript.length) {
    out.push("");
    out.push("**Said but not in the script (cut):**");
    for (const o of alignment.offscript) out.push(`- "${o.text}"`);
  }
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------- media

export function probe(file) {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]).toString());
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  let rotate = 0;
  const sd = v?.side_data_list?.find((d) => d.rotation !== undefined);
  if (sd) rotate = Math.abs(+sd.rotation) % 180 === 90 ? 90 : 0;
  const w = v ? (rotate ? v.height : v.width) : null;
  const h = v ? (rotate ? v.width : v.height) : null;
  return { width: w, height: h, duration: +j.format.duration, hasAudio: !!a, hasVideo: !!v, fps: v ? evalRate(v.avg_frame_rate) : null, transfer: v?.color_transfer || null };
}

/** iPhones record HLG HDR (BT.2020, arib-std-b67). A reel is SDR: tone-map to BT.709
 * before anything else touches the pixels, or the picture renders washed out and the
 * compositor falls back to its slow HDR path. Empty for an SDR source. */
export function sdrFilter(info) {
  if (!["arib-std-b67", "smpte2084"].includes(info?.transfer)) return "";
  return "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,";
}
export const BT709_TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];
/** HyperFrames seeks every video frame by frame: a keyframe every second (x264's default is
 * every 8.3s) or it reports seek failures and renders frozen frames. */
export const SEEKABLE = ["-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-movflags", "+faststart"];
function evalRate(r) {
  const [a, b] = String(r).split("/").map(Number);
  return b ? a / b : a;
}

/** ffmpeg filter that fills WxH from any source (cover), centred on focus x/y. */
export function framingFilter(src, framing, W, H) {
  const zoom = framing?.zoom || 1;
  const fx = framing?.x ?? 0.5, fy = framing?.y ?? 0.45;
  const scale = Math.max(W / src.width, H / src.height) * zoom;
  const sw = Math.round((src.width * scale) / 2) * 2, sh = Math.round((src.height * scale) / 2) * 2;
  const cx = Math.round(Math.min(Math.max(0, fx * sw - W / 2), sw - W));
  const cy = Math.round(Math.min(Math.max(0, fy * sh - H / 2), sh - H));
  return `scale=${sw}:${sh}:flags=lanczos,crop=${W}:${H}:${cx}:${cy}`;
}

/** Decode mono PCM (Float32) from any media file. */
export function decodePcm(file, rate) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** 5ms RMS envelope for cut snapping. */
export function envelope(pcm, rate, hop = 0.005) {
  const n = Math.floor(pcm.length / (rate * hop));
  const rms = new Float32Array(n);
  const step = Math.round(rate * hop);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * step; k < (i + 1) * step; k++) s += pcm[k] * pcm[k];
    rms[i] = Math.sqrt(s / step);
  }
  return { hop, rms };
}

export function writeWav(file, pcm, rate) {
  const data = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

/** Splice the kept audio sample-accurately, with short fades at every seam (no clicks). */
export function spliceAudio(pcm, rate, edl, fadeSec = 0.012) {
  const total = Math.round(edl.duration * rate) + 1;
  const out = new Float32Array(total);
  const f = Math.max(1, Math.round(fadeSec * rate));
  for (const s of edl.segments) {
    const a = Math.round(s.srcIn * rate), b = Math.round(s.srcOut * rate), o = Math.round(s.outStart * rate);
    const n = b - a;
    for (let k = 0; k < n && o + k < total && a + k < pcm.length; k++) {
      let g = 1;
      // Raised-cosine edges: a linear 6ms ramp on a boundary with any voice left in it
      // was audible as a chop on the first real reel.
      if (k < f) g = 0.5 - 0.5 * Math.cos(Math.PI * k / f);
      else if (n - k < f) g = 0.5 - 0.5 * Math.cos(Math.PI * (n - k) / f);
      out[o + k] += pcm[a + k] * g;
    }
  }
  return out;
}

/** The framed proxy: every later stage reads this, never the 4K original. */
export function makeProxy(src, outFile, framing, rules) {
  const info = probe(src);
  const { width: W, height: H, fps } = rules.format;
  // framing.mode "dynamic" (a landscape source): keep the whole landscape frame; the
  // composition places a portrait crop, punch, split or band per beat around the speaker.
  const frame = framing?.mode === "dynamic" ? "scale=-2:1080" : framingFilter(info, framing, W, H);
  const vf = `${sdrFilter(info)}fps=${fps},${frame},setsar=1`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-g", String(fps), "-pix_fmt", "yuv420p", ...BT709_TAGS, outFile], { stdio: "inherit" });
  return info;
}

/** Clean A-roll: select the kept frames in one pass, mux the spliced voice. */
export function renderClean(proxy, voiceWav, edl, outFile) {
  const sel = edl.segments.map((s) => `between(t,${s.srcIn.toFixed(4)},${(s.srcOut - 0.5 / edl.fps).toFixed(4)})`).join("+");
  const selFile = outFile + ".select.txt";
  fs.writeFileSync(selFile, `select='${sel}',setpts=N/(${edl.fps}*TB)`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", proxy, "-i", voiceWav, "-filter_script:v", selFile, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", ...BT709_TAGS, ...SEEKABLE, "-r", String(edl.fps), "-c:a", "aac", "-b:a", "256k", "-shortest", outFile], { stdio: "inherit" });
  fs.rmSync(selFile, { force: true });
}

export { path };
