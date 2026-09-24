// Pure. Builds the JSX Studio actually places: a COPY of overlap_phrases.py's output with its
// gaps re-spaced by where they fall in the script (founder calls 2026-09-24). The tool and its own
// JSX are never edited; its flags can't do this (only --script has a special gap, and --script
// ignores --no-dedupe: on video 14 it dropped 54 phrases to 21).
//
// Pacing is not one number. What Josh fixed by hand after every placement, as starting values
// (Alt+Shift+Left / Right is a large nudge, 5 frames):
//   after the hook's last line ("Let's find out")  exactly hookSilenceSec of speech-to-speech silence
//   before the CTA ("I built a free...")          ctaGapFrames      (-5: one nudge left)
//   before the last line ("Comment X and I'll")   lastLineGapFrames (+5: one nudge RIGHT)
//   every other gap                               gapFrames         (-10: two nudges left)
// A gap's frames are added to the tool's gap, and every clip moves by the running total of the
// gaps before it (what "A, then nudge" does in Premiere). Frames are converted with the ACTIVE
// SEQUENCE's own timebase when the JSX runs, so no frame rate is assumed here. A clip is never
// pulled onto the previous clip on its own track (that would overwrite it). A landmark that can't
// be found falls back to gapFrames and is reported, never guessed.
//
// Each phrase keeps EDGE_PAD of room tone at both ends, so the hook's timeline gap is
// hookSilenceSec - 2 * EDGE_PAD. Every alert() becomes __crwnReport(), so the closing
// "Placed N of M" message comes back to Studio as text instead of a Premiere dialog.

export const DEFAULT_SPACING = { hookSilenceSec: 3.0, gapFrames: -10, ctaGapFrames: -5, lastLineGapFrames: 5 };
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

const scriptLines = (section) =>
  (section || "").split("\n").map((l) => l.trim()).filter((l) => l && !/not spoken|^128\b/i.test(l));

// The CTA opens with "I built a free". Found on all ten recordings checked (2026-09-24), always
// the second-to-last phrase. Only a script that HAS that line gets a CTA gap.
export function findCta(texts, scriptSection) {
  if (!scriptLines(scriptSection).some((l) => /^i built a free\b/i.test(l))) return null;
  for (let i = texts.length - 1; i > 0; i--) if (/^i built a free\b/.test(norm(texts[i]).join(" "))) return { index: i, phrase: texts[i] };
  return null;
}

// The last line opens "Comment <KEYWORD>". Josh's keyword delivery drifts ("Comment, plan,"), so
// only the opening word is matched, and only among the last three phrases.
export function findLastLine(texts, scriptSection) {
  const lines = scriptLines(scriptSection);
  if (!lines.length || !/^comment\b/i.test(lines[lines.length - 1])) return null;
  for (let i = texts.length - 1; i >= Math.max(1, texts.length - 3); i--) if (norm(texts[i])[0] === "comment") return { index: i, phrase: texts[i] };
  return null;
}

export function findLandmarks(texts, scriptSection) {
  return { hook: findHookEnd(texts, scriptSection), cta: findCta(texts, scriptSection), last: findLastLine(texts, scriptSection) };
}

// Per-gap frames. gap[i] sits BEFORE clip i (gap[0] is 0). The hook gap is set in seconds instead.
export function gapPlan(count, landmarks, spacing) {
  const gap = new Array(count).fill(spacing.gapFrames);
  gap[0] = 0;
  const hook = landmarks.hook?.index ?? null;
  const afterHook = hook != null && hook + 1 < count ? hook + 1 : null;
  if (afterHook != null) gap[afterHook] = 0; // set in seconds, not frames
  const cta = landmarks.cta?.index ?? null;
  if (cta != null && cta > 0 && cta !== afterHook) gap[cta] = spacing.ctaGapFrames;
  const last = landmarks.last?.index ?? null;
  if (last != null && last > 0 && last !== afterHook) gap[last] = spacing.lastLineGapFrames;
  return gap;
}

// Returns { jsx, rows, gap, frames, hookShiftSec } or throws when the tool's output isn't the
// shape expected.
export function buildPlacementJsx(rawJsx, { landmarks = {}, spacing }) {
  const toolJsx = rawJsx.replace(/\r\n/g, "\n"); // Windows python writes CRLF
  const rows = parsePhraseRows(toolJsx);
  if (!rows.length) throw new Error("No phrase rows found in the JSX.");
  const anchor = toolJsx.match(/\n([ \t]*)\];\n/);
  if (!anchor || !/var phrases = \[/.test(toolJsx)) throw new Error("The JSX isn't in the shape overlap_phrases.py writes; Studio won't guess.");
  const hookIndex = landmarks.hook?.index ?? null;

  // Hook pause: a fixed shift in seconds for every clip after the hook.
  let hookShiftSec = 0;
  if (hookIndex != null && hookIndex + 1 < rows.length) {
    const wantGap = spacing.hookSilenceSec - 2 * EDGE_PAD;
    hookShiftSec = rows[hookIndex].tlEnd + wantGap - rows[hookIndex + 1].tlStart;
  }
  // frames[i] = running total of the gap frames before clip i: how far clip i moves.
  const gap = gapPlan(rows.length, landmarks, spacing);
  const frames = [];
  gap.reduce((sum, g, i) => (frames[i] = sum + g), 0);
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
    `${pad}// CRWN Studio spacing: move clip i by __crwnF[i] frames of the ACTIVE sequence (the running`,
    `${pad}// total of each gap's frames), never onto the previous clip on its own track.`,
    `${pad}var __crwnF = [${frames.join(", ")}];`,
    `${pad}var __crwnSeq = app.project && app.project.activeSequence;`,
    `${pad}var __crwnClamped = 0;`,
    `${pad}if (__crwnSeq) {`,
    `${pad}    var __crwnFrame = Number(__crwnSeq.timebase) / 254016000000;`,
    `${pad}    var __crwnLastEnd = {};`,
    `${pad}    for (var __i = 0; __i < phrases.length; __i++) {`,
    `${pad}        var __dur = phrases[__i][3] - phrases[__i][2];`,
    `${pad}        var __s = phrases[__i][2] + __crwnF[__i] * __crwnFrame;`,
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
  return { jsx: header + out, rows: shifted, gap, frames, hookShiftSec };
}
