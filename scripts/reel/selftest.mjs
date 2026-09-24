#!/usr/bin/env node
// End-to-end self test on a SYNTHETIC clip. Proves the pipeline (transcribe, align,
// cut, plan, build, render, QA) without the founder's recording, and without faking
// him: the picture is a labelled test card with a burned-in SOURCE timecode (so every
// QA frame shows which second of the raw clip it came from), and the voice is Windows
// text-to-speech reading the script WITH the mistakes a real session has: an abandoned
// take, a restart in the middle of a line, a stutter, a filler, an aside, dead air.
//
//   node scripts/reel/selftest.mjs [n] [--draft]
//
// Writes to videos/reels/_selftest/ only. Never to the real project for that script.

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const OUT = path.join(REPO, "videos/reels/_selftest");
const num = process.argv[2] || "14";
const lite = process.argv.includes("--lines");

const { parseFanEconomy } = await import("./lib/structure.mjs");
const f = fs.readdirSync(path.join(REPO, "videos/scripts/fan-economy")).find((x) => x.startsWith(`${num}-`));
const S = parseFanEconomy(fs.readFileSync(path.join(REPO, "videos/scripts/fan-economy", f), "utf8"));

// The session: every line, with realistic trouble on a few of them.
const say = [];
const pause = (ms) => say.push({ pause: ms });
const words = (i) => S.lines[i].words;
const maxLine = lite ? Math.min(S.lines.length, +process.argv[process.argv.indexOf("--lines") + 1] || 12) : S.lines.length;
for (const l of S.lines.slice(0, maxLine)) {
  const i = l.id;
  if (i === 2) { say.push({ text: words(2).slice(0, 7).join(" ") }); pause(1300); }            // abandoned take
  if (i === 4) { say.push({ text: `${words(4)[0]} ${words(4)[0]}` }); }                          // stutter lead-in
  if (i === 6) { say.push({ text: words(6).slice(0, 9).join(" ") }); pause(500); say.push({ text: words(6).slice(5).join(" ") }); pause(700); continue; } // restart mid-line
  if (i === 8) { say.push({ text: "um" }); pause(400); }                                         // filler
  if (i === 10) { pause(2600); say.push({ text: "hold on, let me do that part again" }); pause(1800); } // aside + dead air
  say.push({ text: l.text });
  pause(l.role === "hook_turn" ? 900 : 350);
}

fs.mkdirSync(OUT, { recursive: true });
const wav = path.join(OUT, "tts.wav");
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\$([\d,.]*\d)/g, "$1 dollars").replace(/%/g, " percent");
const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><prosody rate="+8%">${say.map((x) => (x.pause ? `<break time="${x.pause}ms"/>` : esc(x.text))).join(" ")}</prosody></speak>`;
const ssmlFile = path.join(OUT, "session.ssml");
fs.writeFileSync(ssmlFile, ssml);
const win = (p) => execFileSync("wslpath", ["-w", p]).toString().trim();
const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${win(wav)}'); $s.SpeakSsml([IO.File]::ReadAllText('${win(ssmlFile)}')); $s.Dispose()`;
console.log("synthesizing the test session with Windows text-to-speech...");
execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]).toString());

// Picture: labelled test card, landscape (exercises the 9:16 crop), a "head" block where
// a face would be, and the SOURCE time burned in.
const clip = path.join(OUT, `${num} synthetic selftest.mp4`);
const vf = [
  "drawbox=x=820:y=250:w=280:h=340:color=0xC2571A@0.9:t=fill",
  "drawbox=x=760:y=590:w=400:h=490:color=0x2A2A2A@1:t=fill",
  "drawtext=text='SYNTHETIC TEST CLIP':fontsize=54:fontcolor=0xD4AF37:x=(w-tw)/2:y=90",
  "drawtext=text='NOT FOUNDER FOOTAGE':fontsize=40:fontcolor=white:x=(w-tw)/2:y=160",
  "drawtext=text='SRC %{pts\\:hms}':fontsize=64:fontcolor=white:box=1:boxcolor=black@0.6:x=(w-tw)/2:y=680",
].join(",");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=0x1A1A1A:s=1920x1080:r=30:d=${dur.toFixed(2)}`, "-i", wav, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", clip]);
console.log(`test clip: ${path.relative(REPO, clip)} (${dur.toFixed(1)}s)`);

const r = spawnSync("node", [path.join(HERE, "reel.mjs"), "run", clip, ...(process.argv.includes("--draft") ? ["--draft"] : [])], { stdio: "inherit", env: { ...process.env, REEL_DIR: OUT, REEL_EXPORT_DIR: path.join(OUT, "_no_export") } });
process.exitCode = r.status;
