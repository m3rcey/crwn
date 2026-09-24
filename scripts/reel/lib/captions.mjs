// Captions: short phrases in the script's own words, timed to the founder's voice.
//
// A caption phrase is shown whole while it is spoken, so a phrase that CONTAINS the
// withheld figure would put it on screen a second before it is said. Phrases therefore
// always break right before a withheld figure: the answer appears on the word, never
// early. The script's spelling, casing and dialect are kept ("ya", "aint", "HIS").

import { lineNumberTokens } from "./structure.mjs";

export function isWithheldWord(text, withheldTokens) {
  if (!withheldTokens?.size) return false;
  return lineNumberTokens(text).some((t) => withheldTokens.has(t));
}

function display(text) {
  return text.replace(/[,;:]+$/, "").replace(/\.+$/, "").replace(/^["“]|["”]$/g, "");
}

/**
 * @param {Array<{text,start,end,line}>} words clean-timeline caption words
 * @param {object} structure
 * @param {object} rules
 */
export function groupCaptions(words, structure, rules) {
  const C = rules.captions;
  const withheld = new Set(structure.withheld.lateTokens || []);
  const emph = new Map(structure.lines.map((l) => [l.id, new Set(l.emphasis)]));
  const phrases = [];
  let cur = null;
  const close = () => { if (cur && cur.words.length) phrases.push(cur); cur = null; };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = words[i - 1];
    const text = display(w.text);
    if (!text) continue;
    const breakBefore =
      !cur ||
      w.line !== cur.line ||
      (prev && w.start - prev.end > 0.35) ||
      cur.words.length >= C.maxWords ||
      cur.chars + 1 + text.length > C.maxChars ||
      isWithheldWord(w.text, withheld);
    if (breakBefore) close();
    if (!cur) cur = { line: w.line, words: [], chars: 0 };
    const core = text.replace(/[^A-Za-z0-9$%']/g, "");
    cur.words.push({
      text,
      start: w.start,
      end: w.end,
      emph: emph.get(w.line)?.has(core) || /\d/.test(text) || false,
      withheld: isWithheldWord(w.text, withheld),
    });
    cur.chars += (cur.words.length > 1 ? 1 : 0) + text.length;
    if (/[.?!,;:]["”']?$/.test(w.text)) close();
  }
  close();
  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    p.start = p.words[0].start;
    const next = phrases[i + 1];
    const natural = p.words[p.words.length - 1].end + 0.2;
    p.end = next ? Math.min(natural, next.words[0].start) : natural;
    if (p.end - p.start < C.minSec) p.end = next ? Math.max(p.end, Math.min(p.start + C.minSec, next.words[0].start)) : p.start + C.minSec;
    p.text = p.words.map((w) => w.text).join(" ");
    delete p.chars;
  }
  return phrases;
}

/** No caption phrase may show a withheld figure before the moment it is spoken. */
export function captionLeaks(phrases) {
  const leaks = [];
  for (const p of phrases) for (const w of p.words) if (w.withheld && p.start < w.start - 0.1) leaks.push({ phrase: p.text, shownAt: p.start, spokenAt: w.start });
  return leaks;
}
