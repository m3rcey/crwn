// Step 6 actions. Each one re-reads disk and re-checks the guard at the moment it runs, so a
// page left open for an hour cannot act on what it showed an hour ago.
import fs from "node:fs";
import path from "node:path";
import { assertWritable, moveToReplaced, GuardError } from "./guard.mjs";
import { updateState } from "./state.mjs";
import { startJob } from "./jobs.mjs";
import { queuePlacement } from "./bridge.mjs";
import { transcribeCommand, splitCommand, parseSplitOutput, winPath } from "./tools.mjs";
import { readTranscript, wavDuration } from "./scan.mjs";
import { transcriptCheck, leadingNumber, section } from "./status.mjs";
import { buildPlacementJsx, findHookEnd, parsePhraseRows, phraseTexts } from "./placement.mjs";

export class ActionError extends GuardError {}
const refuse = (msg) => {
  throw new ActionError(msg);
};

function video(facts, num) {
  return facts.videos.find((v) => v.num === num) || refuse("No such script.");
}

function linkedWav(v) {
  const r = v.recording;
  if (r.ssdError) refuse(`Can't read the SSD: ${r.ssdError}`);
  if (!r.linked) refuse("Link a recording first.");
  if (!r.linked.exists) refuse(`The linked wav is missing: ${r.linked.wav}`);
  return r;
}

function writableRecording(v) {
  const r = linkedWav(v);
  if (!r.inFanDir) refuse("This recording is in a read-only history folder, so Studio won't write a transcript or JSX beside it.");
  return r;
}

export function linkRecording(facts, num, rel) {
  video(facts, num);
  const rec = facts.recordings.find((r) => r.rel === rel) || refuse("That wav isn't in the Fan Economy folder or the history folders.");
  if (rec.claimedBy != null && rec.claimedBy !== num) refuse(`That wav already belongs to video ${rec.claimedBy}.`);
  updateState((s) => {
    s.links[num] = { rel, at: new Date().toISOString() };
  });
}

export function unlinkRecording(num) {
  updateState((s) => {
    delete s.links[num];
  });
}

// "New Recording 823.wav" becomes "61 kool keith forty seven albums.wav". Only before it is
// transcribed: the JSON and JSX are named after the wav, and the JSX embeds its path.
export function renameTarget(v) {
  return `${v.num} ${v.slug.replace(/^\d+-/, "").replace(/-/g, " ")}.wav`;
}

export function renameRecording(ssd, facts, num) {
  const v = video(facts, num);
  const r = writableRecording(v);
  const wav = r.linked.wav;
  if (leadingNumber(path.basename(wav)) === num) refuse("It already starts with the script number.");
  const stem = wav.replace(/\.wav$/i, "");
  if (fs.existsSync(`${stem}.json`) || fs.existsSync(`${stem}_overlap_phrases.jsx`)) {
    refuse("It already has a transcript or JSX named after it. Renaming would orphan them, so Studio won't.");
  }
  const target = path.join(path.dirname(wav), renameTarget(v));
  if (fs.existsSync(target)) refuse(`${path.basename(target)} already exists.`);
  assertWritable(ssd, wav);
  assertWritable(ssd, target);
  fs.renameSync(wav, target);
  updateState((s) => {
    s.links[num] = { rel: path.posix.relative(ssd.root, target), at: new Date().toISOString() };
  });
  return target;
}

export function startTranscribe(ssd, facts, num) {
  const v = video(facts, num);
  const r = writableRecording(v);
  const wav = r.linked.wav;
  const json = wav.replace(/\.wav$/i, ".json");
  const t = transcriptCheck(r.json, r.duration, r.durationError);
  if (t.state === "complete") refuse("It's already transcribed.");
  if (t.state === "unknown") refuse(t.summary);
  assertWritable(ssd, json);
  // The tool skips any wav whose .json exists, so a broken one has to move aside first.
  const moved = t.state === "broken" ? moveToReplaced(ssd, json) : null;
  const { cmd, args } = transcribeCommand(wav);
  return startJob({
    kind: "transcribe",
    num,
    label: `Transcribe ${num}`,
    cmd,
    args,
    onDone: ({ code }) => {
      const st = fs.statSync(wav);
      const dur = wavDuration(wav, st);
      const check = transcriptCheck(readTranscript(json), dur.duration ?? null, dur.error);
      const ok = code === 0 && check.state === "complete";
      return {
        ok,
        summary: ok ? "Transcript complete." : code !== 0 ? `The transcriber exited with code ${code}.` : check.summary || "No transcript was written.",
        checks: check.checks,
        moved,
      };
    },
  });
}

export function startSplit(ssd, facts, num) {
  const v = video(facts, num);
  const r = writableRecording(v);
  const wav = r.linked.wav;
  const json = wav.replace(/\.wav$/i, ".json");
  const jsx = wav.replace(/\.wav$/i, "_overlap_phrases.jsx");
  const t = transcriptCheck(r.json, r.duration, r.durationError);
  if (t.state !== "complete") refuse("Transcribe it first: the transcript isn't complete.");
  assertWritable(ssd, jsx);
  // A re-split never overwrites: the old JSX keeps its place in _replaced/.
  const moved = fs.existsSync(jsx) ? moveToReplaced(ssd, jsx) : null;
  const { cmd, args } = splitCommand(wav, json);
  return startJob({
    kind: "split",
    num,
    label: `Split ${num}`,
    cmd,
    args,
    onDone: ({ code, out }) => {
      const parsed = parseSplitOutput(out);
      const exists = fs.existsSync(jsx);
      const checks = [{ ok: code === 0, label: `overlap_phrases.py exited with code ${code}` }, ...parsed.checks];
      const ok = code === 0 && exists && parsed.ok;
      if (exists) {
        updateState((s) => {
          s.splits[num] = {
            at: new Date().toISOString(),
            jsxMtime: fs.statSync(jsx).mtimeMs,
            ok,
            checks,
            built: parsed.built,
            loaded: parsed.loaded,
            ratio: parsed.ratio,
          };
        });
      }
      return { ok, summary: ok ? "Split passed every check." : "The split failed a check. It is blocked from Premiere.", checks, moved };
    },
  });
}

// The JSX embeds the wav's absolute Windows path. One made when the SSD was D: would import
// nothing now, so placement refuses unless it points at the wav as it is today.
export function jsxAudioPath(jsxText) {
  const m = jsxText.match(/^\s*var audioPath = "(.*)";$/m);
  return m ? m[1].replace(/\\\\/g, "\\") : null;
}

// The ONE placement precondition, used by the page (to explain) and by startPlace (to refuse).
export function placeRefusal(r) {
  if (r.ssdError || !r.linked?.exists) return "The recording isn't available.";
  if (!r.jsxExists) return "Split it first.";
  const split = r.split && r.split.jsxMtime === r.jsxMtime ? r.split : null;
  if (split && !split.ok) return "The split failed its checks, so it is blocked from Premiere.";
  const expected = winPath(r.linked.wav);
  const inJsx = jsxAudioPath(fs.readFileSync(r.jsxPath, "utf-8"));
  if (!inJsx || inJsx.toLowerCase() !== expected.toLowerCase()) {
    return `The JSX points at ${inJsx || "(no audioPath)"}, but the wav is at ${expected}. It would place nothing.`;
  }
  return null;
}

// Places a Studio COPY of the tool's JSX (lib/placement.mjs): hook pause + tightened spacing, and
// alert() rerouted so the result comes back. The copy is regenerated on every placement from the
// untouched tool JSX, so it is overwritten rather than kept in _replaced/.
export function startPlace(ssd, facts, num, spacing) {
  const v = video(facts, num);
  const r = linkedWav(v);
  const reason = placeRefusal(r);
  if (reason) refuse(reason);
  const toolJsx = fs.readFileSync(r.jsxPath, "utf-8");
  const texts = phraseTexts(parsePhraseRows(toolJsx.replace(/\r\n/g, "\n")), r.json.segments || []);
  const hook = findHookEnd(texts, section(v.scriptText, "**SCRIPT:**") || "");
  const built = buildPlacementJsx(toolJsx, { hookIndex: hook ? hook.index : null, ...spacing });
  const copy = r.jsxPath.replace(/_overlap_phrases\.jsx$/, "_placement.jsx");
  assertWritable(ssd, copy);
  fs.writeFileSync(copy, built.jsx);
  return queuePlacement({
    num,
    jsxPath: copy,
    jsxWin: winPath(copy),
    jsxMtime: r.jsxMtime, // the record belongs to the TOOL's JSX: a re-split invalidates it
    total: built.rows.length,
    spacing: { ...spacing, hook: hook ? `after phrase ${hook.index + 1}: "${hook.phrase}"` : null, hookShiftSec: +built.hookShiftSec.toFixed(2) },
  });
}

export function markPlacedByHand(facts, num, done) {
  const v = video(facts, num);
  const r = linkedWav(v);
  if (done && !r.jsxExists) refuse("There's no JSX to have placed.");
  updateState((s) => {
    if (done) s.placements[num] = { by: "hand", ok: true, at: new Date().toISOString(), jsxMtime: r.jsxMtime };
    else delete s.placements[num];
  });
}
