// The ONE place Studio builds a command line for the Python tools in C:\Users\Josh\Tools.
// The tools themselves are never edited (BUILD_PLAN rule 2).
import { execFileSync } from "node:child_process";

export const PY = "/mnt/c/Users/Josh/AppData/Local/Programs/Python/Python312/python.exe";
export const TOOLS = "C:\\Users\\Josh\\Tools";

// Windows python needs Windows paths. wslpath is the authority, never string surgery.
export function winPath(p) {
  return execFileSync("wslpath", ["-w", p], { encoding: "utf-8" }).trim();
}

// -X utf8: the tools print "→" and "⚠️". Windows python writing to a PIPE (not a console)
// uses cp1252 and dies with UnicodeEncodeError. -u: stream lines as they happen.
const PY_FLAGS = ["-X", "utf8", "-u"];

export function transcribeCommand(wav) {
  return { cmd: PY, args: [...PY_FLAGS, `${TOOLS}\\build_region_transcript_fast.py`, winPath(wav)] };
}

// Always --no-dedupe, never --script (spec step 6: Adobe Podcast already removed the retakes).
export function splitCommand(wav, json) {
  return { cmd: PY, args: [...PY_FLAGS, `${TOOLS}\\overlap_phrases.py`, winPath(wav), winPath(json), "--no-dedupe"] };
}

// Pure. Reads overlap_phrases.py's stdout and applies the spec's three checks.
export const MIN_TIMELINE_RATIO = 0.5;
export function parseSplitOutput(text) {
  const num = (re) => {
    const m = text.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  const r = {
    audioDuration: num(/^Audio duration: ([\d.]+)s/m),
    loaded: num(/^Loaded (\d+) segment\(s\) from transcript/m),
    built: num(/^Built (\d+) phrases/m),
    sentenceMapped: /^Built \d+ phrases \(sentence-mapped/m.test(text),
    dropped: num(/Dropped (\d+) short fragment\(s\)/),
    timelineDuration: num(/^Timeline duration: ([\d.]+)s/m),
    wrote: (text.match(/^Wrote: (.+)$/m) || [])[1]?.trim() || null,
  };
  r.ratio = r.audioDuration && r.timelineDuration != null ? r.timelineDuration / r.audioDuration : null;
  r.checks = [
    { ok: r.built != null && r.built === r.loaded, label: `Built ${r.built ?? "?"} phrases = Loaded ${r.loaded ?? "?"} segments` },
    { ok: !r.sentenceMapped, label: "transcript has word timing (not sentence-mapped)" },
    { ok: r.dropped === 0, label: `Dropped ${r.dropped ?? "?"} short fragments (must be 0)` },
    {
      ok: r.ratio != null && r.ratio >= MIN_TIMELINE_RATIO,
      label: `timeline ${r.timelineDuration ?? "?"}s / audio ${r.audioDuration ?? "?"}s = ${r.ratio != null ? Math.round(r.ratio * 100) : "?"}% (good files run 55-70%; under ${MIN_TIMELINE_RATIO * 100}% fails)`,
    },
    { ok: !!r.wrote, label: "JSX written" },
  ];
  r.ok = r.checks.every((c) => c.ok);
  return r;
}

// Pure. The generated JSX ends with alert("overlap_phrases.jsx complete.\nPlaced: N of M ...\nFailed: F").
// The master JSX says "Placed: N  Failed: F" with no total.
export function parsePlacement(message) {
  const text = String(message || "");
  const m = text.match(/Placed:\s*(\d+)(?:\s+of\s+(\d+))?/);
  const f = text.match(/Failed:\s*(\d+)/);
  const placed = m ? parseInt(m[1], 10) : null;
  const total = m && m[2] ? parseInt(m[2], 10) : null;
  const failed = f ? parseInt(f[1], 10) : null;
  const ok = placed != null && failed === 0 && (total == null || placed === total);
  return { placed, total, failed, ok };
}
