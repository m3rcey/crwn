// Pure. Builds the JSX Studio actually places: a COPY of overlap_phrases.py's output with two
// changes, both founder calls (2026-09-24). The tool and its own JSX are never edited.
//
// 1. Spacing. The tool already butts phrases together (+0.08s, or -0.42s when both are long),
//    but each phrase carries quiet the silence detector left in it, so Josh was pulling every
//    clip left by hand: A (track select forward), then Alt+Shift+Left twice = 2 x 5 frames.
//    The copy pulls each clip left `tightenFrames` per gap before it. Frames are converted with
//    the ACTIVE SEQUENCE's own timebase when the JSX runs, so no frame rate is assumed here.
//    A clip is never pulled onto the previous clip on its own track (that would overwrite it).
// 2. The hook pause. After the hook's last line ("Let's find out") the next phrase starts
//    `hookSilenceSec` of speech-to-speech silence later. Each phrase keeps EDGE_PAD of room tone
//    at both ends, so the timeline gap is hookSilenceSec - 2 * EDGE_PAD.
//
// Every alert() becomes __crwnReport(), so the closing "Placed N of M" message comes back to
// Studio as text instead of a Premiere dialog nobody can read from here.

export const DEFAULT_SPACING = { hookSilenceSec: 3.0, tightenFrames: 10 };
export const EDGE_PAD = 0.25; // overlap_phrases.py --edge-pad default; Studio never passes it

const ROW = /^(\s*)\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*(\d+)\s*\](,?)\s*$/;

export function parsePhraseRows(jsx) {
  return jsx.split("\n").filter((l) => ROW.test(l)).map((l) => {
    const m = l.match(ROW);
    return { srcStart: +m[2], srcEnd: +m[3], tlStart: +m[4], tlEnd: +m[5], track: +m[6] };
  });
}

// A phrase's words: the transcript segment that starts where the phrase's source starts (both
// come from the same padded silence regions, so they line up).
export function phraseTexts(rows, segments) {
  return rows.map((r) => {
    let best = null;
    for (const s of segments) if (!best || Math.abs(s.start - r.srcStart) < Math.abs(best.start - r.srcStart)) best = s;
    return best && Math.abs(best.start - r.srcStart) < 0.5 ? best.text : "";
  });
}

const norm = (t) => t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);

// The hook is the SCRIPT section's first paragraph; its last line is where the pause goes
// ("Let's find out."). Josh ad-libs it ("You're about to find out."), so a phrase matches when
// it carries most of that line's words. Only the opening phrases are searched.
export function findHookEnd(phraseTexts, scriptSection, searchFirst = 8) {
  const para = (scriptSection || "").trim().split(/\n\s*\n/)[0] || "";
  const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = norm(lines[lines.length - 1] || "");
  if (!last.length) return null;
  for (let i = 0; i < Math.min(searchFirst, phraseTexts.length); i++) {
    const words = new Set(norm(phraseTexts[i] || ""));
    const shared = last.filter((w) => words.has(w)).length;
    if (shared / last.length >= 0.6) return { index: i, line: lines[lines.length - 1], phrase: phraseTexts[i] };
  }
  return null;
}

// Returns { jsx, rows, hookShiftSec } or throws when the tool's output isn't the shape expected.
export function buildPlacementJsx(rawJsx, { hookIndex = null, hookSilenceSec, tightenFrames }) {
  const toolJsx = rawJsx.replace(/\r\n/g, "\n"); // Windows python writes CRLF
  const rows = parsePhraseRows(toolJsx);
  if (!rows.length) throw new Error("No phrase rows found in the JSX.");
  const anchor = toolJsx.match(/\n([ \t]*)\];\n/);
  if (!anchor || !/var phrases = \[/.test(toolJsx)) throw new Error("The JSX isn't in the shape overlap_phrases.py writes; Studio won't guess.");

  // Hook pause: a fixed shift in seconds for every clip after the hook.
  let hookShiftSec = 0;
  if (hookIndex != null && hookIndex + 1 < rows.length) {
    const wantGap = hookSilenceSec - 2 * EDGE_PAD;
    hookShiftSec = rows[hookIndex].tlEnd + wantGap - rows[hookIndex + 1].tlStart;
  }
  // k = how many tightened gaps sit before each clip. The hook gap is set exactly, not tightened.
  const k = rows.map((_, i) => (hookIndex != null && i > hookIndex ? i - 1 : i));
  const shifted = rows.map((r, i) => {
    const d = hookIndex != null && i > hookIndex ? hookShiftSec : 0;
    return { ...r, tlStart: +(r.tlStart + d).toFixed(4), tlEnd: +(r.tlEnd + d).toFixed(4) };
  });

  let i = 0;
  let out = toolJsx
    .split("\n")
    .map((l) => {
      const m = l.match(ROW);
      if (!m) return l;
      const r = shifted[i++];
      return `${m[1]}[${r.srcStart}, ${r.srcEnd}, ${r.tlStart}, ${r.tlEnd}, ${r.track}]${m[7]}`;
    })
    .join("\n");

  const pad = anchor[1];
  const inject = [
    `${pad}];`,
    "",
    `${pad}// CRWN Studio spacing: pull clip i left k[i] x ${tightenFrames} frames of the ACTIVE sequence,`,
    `${pad}// never onto the previous clip on its own track.`,
    `${pad}var __crwnK = [${k.join(", ")}];`,
    `${pad}var __crwnSeq = app.project && app.project.activeSequence;`,
    `${pad}var __crwnClamped = 0;`,
    `${pad}if (__crwnSeq) {`,
    `${pad}    var __crwnFrame = Number(__crwnSeq.timebase) / 254016000000;`,
    `${pad}    var __crwnLastEnd = {};`,
    `${pad}    for (var __i = 0; __i < phrases.length; __i++) {`,
    `${pad}        var __dur = phrases[__i][3] - phrases[__i][2];`,
    `${pad}        var __s = phrases[__i][2] - __crwnK[__i] * ${tightenFrames} * __crwnFrame;`,
    `${pad}        var __t = phrases[__i][4];`,
    `${pad}        if (__s < 0) __s = 0;`,
    `${pad}        if (__crwnLastEnd[__t] !== undefined && __s < __crwnLastEnd[__t]) { __s = __crwnLastEnd[__t]; __crwnClamped++; }`,
    `${pad}        phrases[__i][2] = __s; phrases[__i][3] = __s + __dur;`,
    `${pad}        __crwnLastEnd[__t] = __s + __dur;`,
    `${pad}    }`,
    `${pad}}`,
    "",
  ].join("\n");
  out = out.replace(/\n[ \t]*\];\n/, `\n${inject}\n`);
  out = out.replace(/\balert\(/g, "__crwnReport(");
  out = out.replace(/(__crwnReport\(msg\);)/, '__crwnReport(msg + "\\nClamped: " + __crwnClamped);');
  const header = [
    "// CRWN Studio placement copy. Generated from the tool's JSX beside it; regenerated on every",
    "// placement, so never edit this file. Its dialog calls report to Studio instead.",
    '$.global.__crwnReport = function (m) { $.global.__crwnLast = ($.global.__crwnLast ? $.global.__crwnLast + "\\n---\\n" : "") + String(m); };',
    "",
  ].join("\n");
  return { jsx: header + out, rows: shifted, hookShiftSec, k };
}
