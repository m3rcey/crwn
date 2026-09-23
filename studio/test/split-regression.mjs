// Phase 2 regression: re-split known-good recordings through Studio's own command builder and
// require the new JSX to match the original except for the audio path.
//
//   node studio/test/split-regression.mjs            recordings 814 and 822
//   node studio/test/split-regression.mjs 814 815   those recordings
//
// Never touches the originals: the wav and JSON are COPIED into a scratch folder on C:
// (Windows python needs a Windows path) and the split runs there.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { HHI } from "../lib/config.mjs";
import { locateSsd } from "../lib/ssd.mjs";
import { splitCommand, parseSplitOutput } from "../lib/tools.mjs";

const SCRATCH = "/mnt/c/Users/Josh/AppData/Local/Temp/crwn-studio-regression";
const nums = process.argv.slice(2).length ? process.argv.slice(2) : ["814", "815", "816", "817", "818", "819", "820", "821", "822"];

// 822's wav no longer yields the 71 regions its own JSON and JSX were built from: today it gives
// 61, and no silence setting (-25 to -32 dB, 0.2 to 0.32s) reproduces the August regions, so the
// wav was replaced after it was transcribed (verified 2026-09-23). A split of it MUST be blocked
// by the Built = Loaded check. It stays in the suite as the proof that the check fires on real data.
const EXPECTED_MISMATCH = { 822: "Built" };

const ssd = locateSsd(null);
if (!ssd.root) {
  console.error(`SSD not available: ${ssd.error}`);
  process.exit(2);
}
const SRC = path.join(ssd.root, HHI, "Unmixed");

// The JSX embeds the wav's absolute path twice (the Source comment and audioPath). Those
// lines are the ONLY ones allowed to differ.
const normalize = (jsx) =>
  jsx
    .replace(/\r\n/g, "\n")
    .replace(/^\/\/ Source: .*$/m, "// Source: <audio>")
    .replace(/^(\s*var audioPath = )".*";$/m, '$1"<audio>";');

fs.mkdirSync(SCRATCH, { recursive: true });
let failures = 0;
for (const n of nums) {
  const stem = fs.readdirSync(SRC).find((f) => f.startsWith(`New Recording ${n} `) && f.endsWith(".wav"))?.replace(/\.wav$/, "");
  if (!stem) {
    console.log(`${n}: FAIL no wav in ${SRC}`);
    failures++;
    continue;
  }
  const orig = fs.readFileSync(path.join(SRC, `${stem}_overlap_phrases.jsx`), "utf-8");
  const wav = path.join(SCRATCH, `${stem}.wav`);
  const json = path.join(SCRATCH, `${stem}.json`);
  const jsx = path.join(SCRATCH, `${stem}_overlap_phrases.jsx`);
  fs.copyFileSync(path.join(SRC, `${stem}.wav`), wav);
  fs.copyFileSync(path.join(SRC, `${stem}.json`), json);
  fs.rmSync(jsx, { force: true });

  const { cmd, args } = splitCommand(wav, json);
  const run = spawnSync(cmd, args, { encoding: "utf-8" });
  const parsed = parseSplitOutput(run.stdout || "");
  const regenerated = fs.existsSync(jsx) ? fs.readFileSync(jsx, "utf-8") : "";

  const same = regenerated && normalize(regenerated) === normalize(orig);
  if (EXPECTED_MISMATCH[n]) {
    const blocked = parsed.checks.some((c) => !c.ok && c.label.startsWith(EXPECTED_MISMATCH[n]));
    console.log(`${n}: ${blocked ? "PASS" : "FAIL"}  (known-inconsistent fixture: the ${EXPECTED_MISMATCH[n]} check must fail)`);
    for (const c of parsed.checks) console.log(`   ${c.ok ? "ok  " : "FAIL"} ${c.label}`);
    if (!blocked) failures++;
    for (const f of [wav, json, jsx]) fs.rmSync(f, { force: true });
    continue;
  }
  console.log(`${n}: ${same && run.status === 0 && parsed.ok ? "PASS" : "FAIL"}  exit=${run.status}`);
  for (const c of parsed.checks) console.log(`   ${c.ok ? "ok  " : "FAIL"} ${c.label}`);
  if (!same) {
    const a = normalize(orig).split("\n");
    const b = normalize(regenerated).split("\n");
    const i = a.findIndex((line, k) => line !== b[k]);
    console.log(`   JSX differs from the original at line ${i + 1}:\n     was: ${a[i]}\n     now: ${b[i]}`);
    if (run.stderr) console.log(`   stderr: ${run.stderr.slice(0, 600)}`);
  } else {
    console.log("   ok   JSX identical to the original except the audio path");
  }
  if (!(same && run.status === 0 && parsed.ok)) failures++;
  for (const f of [wav, json, jsx]) fs.rmSync(f, { force: true });
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
