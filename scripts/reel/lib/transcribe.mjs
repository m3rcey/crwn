// Transcription: one normalized word list, whatever produced it.
//
//   { provider, model, language, duration, words: [{ text, start, end, type }] }
//   type: "word" | "filler" | "event"
//
// Providers:
//   elevenlabs  Scribe speech-to-text, word timestamps, verbatim (keeps "um", false
//               starts and repeated phrases, which is what retake detection needs).
//               Needs ELEVENLABS_API_KEY in the environment, never in a file here.
//   local       faster-whisper through the Windows Python that already has it and its
//               cached models (lib/transcribe_local.py). Free and offline; Whisper
//               smooths some disfluencies, so a retake is sometimes heard as one take.
//   import      an existing JSON in either provider's shape.
//
// auto = elevenlabs when the key is set, else local. The provider used is recorded in
// transcript.json so a take report can say what it was working from.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const WIN_PY = "/mnt/c/Users/Josh/AppData/Local/Programs/Python/Python312/python.exe";
export const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/speech-to-text";

export function resolveProvider(requested, env = process.env) {
  if (requested && requested !== "auto") return requested;
  return env.ELEVENLABS_API_KEY ? "elevenlabs" : "local";
}

/** Mark fillers so take selection can drop them without touching real words. */
export function classify(text, fillers) {
  const core = text.toLowerCase().replace(/[^a-z']/g, "");
  return fillers.includes(core) ? "filler" : "word";
}

/** Whisper times figures as sub-word pieces: "$1,000,000" arrives as "$1" ",000" ",000".
 * Glue a piece that starts with a separator and a digit onto a word that ends in a
 * digit, keeping the first start and the last end, so a figure is ONE word again. */
export function mergeNumberFragments(words) {
  const out = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    if (prev && prev.type === "word" && /\d$/.test(prev.text) && /^[.,]\d/.test(w.text) && w.start - prev.end < 0.25) {
      prev.text += w.text;
      prev.end = w.end;
      continue;
    }
    if (prev && prev.type === "word" && /\d$/.test(prev.text) && /^%[.,!?]*$/.test(w.text)) { prev.text += w.text; prev.end = w.end; continue; }
    out.push({ ...w });
  }
  return out;
}

/** ElevenLabs Scribe response -> normalized. `spacing` entries are gaps, not words. */
export function normalizeElevenLabs(raw, fillers) {
  const words = [];
  for (const w of raw.words || []) {
    if (w.type === "spacing") continue;
    const text = String(w.text || "").trim();
    if (!text) continue;
    const type = w.type === "audio_event" ? "event" : classify(text, fillers);
    words.push({ text, start: +w.start, end: +w.end, type });
  }
  const merged = mergeNumberFragments(words);
  const last = merged.length ? merged[merged.length - 1].end : 0;
  return { provider: "elevenlabs", model: raw.model_id || null, language: raw.language_code || "en", duration: last, words: merged };
}

/** transcribe_local.py output -> normalized. Whisper glues punctuation to words. */
export function normalizeLocal(raw, fillers) {
  const words = (raw.words || [])
    .filter((w) => String(w.text || "").trim())
    .map((w) => ({ text: String(w.text).trim(), start: +w.start, end: +w.end, type: classify(w.text, fillers) }));
  return { provider: "local", model: raw.model || null, language: raw.language || "en", duration: raw.duration || (words.at(-1)?.end ?? 0), words: mergeNumberFragments(words) };
}

/** Accept either shape, or an already-normalized transcript. */
export function normalizeAny(raw, fillers) {
  if (raw && Array.isArray(raw.words) && raw.words.some((w) => "type" in w && ["word", "filler", "event"].includes(w.type)) && raw.provider) return raw;
  if (raw && Array.isArray(raw.words) && raw.words.some((w) => w.type === "spacing" || "speaker_id" in w || "logprob" in w)) return normalizeElevenLabs(raw, fillers);
  if (raw && Array.isArray(raw.words)) return normalizeLocal(raw, fillers);
  throw new Error("transcript JSON has no words[] array: this editor needs WORD-level timestamps");
}

/** A transcript the rest of the pipeline can trust: words present, ordered, timed. */
export function validateTranscript(t, audioDurationSec = null) {
  const problems = [];
  if (!t.words?.length) problems.push("no words");
  let prev = -1;
  for (const w of t.words || []) {
    if (!(w.end >= w.start)) { problems.push(`word "${w.text}" ends before it starts`); break; }
    if (w.start + 0.001 < prev) { problems.push(`words out of order at "${w.text}" (${w.start})`); break; }
    prev = w.start;
  }
  if (audioDurationSec && t.words?.length) {
    const tail = audioDurationSec - t.words[t.words.length - 1].end;
    if (tail > Math.max(10, audioDurationSec * 0.2)) problems.push(`transcript stops ${tail.toFixed(1)}s before the audio ends: the run probably died`);
  }
  return problems;
}

export async function transcribeElevenLabs(audioPath, { model = "scribe_v1", apiKey = process.env.ELEVENLABS_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set (see docs/REEL_EDITOR.md, Secrets)");
  const form = new FormData();
  form.append("model_id", model);
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "true");
  form.append("diarize", "false");
  form.append("language_code", "en");
  form.append("file", new Blob([fs.readFileSync(audioPath)], { type: "audio/wav" }), path.basename(audioPath));
  const res = await fetchImpl(ELEVENLABS_URL, { method: "POST", headers: { "xi-api-key": apiKey }, body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs speech-to-text ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------- omission repair
//
// Found on the first real recording (script 23, 2026-09-24): over a 3.8-minute file,
// Whisper silently DROPPED whole passages (12 words once, 17 seconds another time,
// including the script's "not a forecast" qualifier) and hid each drop by stretching a
// neighbouring word across it ("built" stamped 19 seconds long). The same audio,
// transcribed as a short window on its own, came back complete. So: a word stamped longer
// than maxWordSec marks a probable omission; that window is re-transcribed and spliced in.

/** Windows around suspiciously long words, merged. Pure. */
export function suspectWindows(words, { maxWordSec = 1.5, padSec = 3, duration = Infinity } = {}) {
  const wins = [];
  for (const w of words) {
    if (w.end - w.start <= maxWordSec) continue;
    const a = Math.max(0, w.start - padSec), b = Math.min(duration, w.end + padSec);
    const last = wins[wins.length - 1];
    if (last && a <= last.end) last.end = Math.max(last.end, b);
    else wins.push({ start: a, end: b });
  }
  return wins;
}

/** Replace the inside of a window with the window's own words. The outer `edgeSec` of the
 * window keeps the original words, so the splice never duplicates or loses a boundary
 * word. Window words are already on the file's timeline. Pure. */
export function spliceWindow(words, windowWords, win, edgeSec = 1) {
  const a = win.start + (win.start > 0 ? edgeSec : 0), b = win.end - edgeSec;
  const before = words.filter((w) => w.start < a);
  const after = words.filter((w) => w.start >= b);
  const inside = windowWords.filter((w) => w.start >= a && w.start < b);
  return [...before, ...inside, ...after].sort((x, y) => x.start - y.start);
}

export function transcribeLocal(audioPath, outPath, { model = "small.en", hotwords = null } = {}) {
  const win = (p) => execFileSync("wslpath", ["-w", p]).toString().trim();
  const args = ["-X", "utf8", "-u", win(path.join(HERE, "transcribe_local.py")), win(audioPath), win(outPath), "--model", model];
  if (hotwords) args.push("--hotwords", hotwords);
  execFileSync(WIN_PY, args, { stdio: ["ignore", "inherit", "inherit"], timeout: 60 * 60 * 1000 });
  return JSON.parse(fs.readFileSync(outPath, "utf8"));
}
