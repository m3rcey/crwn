// Minimal RTF to plain text, good enough for a narration script.
// Josh's VSL scripts are Wordpad .rtf: paragraphs, smart quotes, and [SLIDE: ...] markers.
// This keeps the paragraph breaks and the markers, which is all the cue sheet needs.
import fs from "node:fs";

export function rtfToText(file) {
  let s = fs.readFileSync(file, "latin1");

  // Drop font/colour/stylesheet groups wholesale; they carry no narration.
  // The second backslash is OPTIONAL: RTF writes the destination as `{\fonttbl` with one, and only
  // the ignorable form `{\*\generator` has two. Requiring two left every font name in the output,
  // which stayed invisible for months because the sectioned scripts discard everything above their
  // first time header. A flat transcript has no such header, so "Calibri;" landed in sentence one.
  s = s.replace(/\{\\\*?\\?(?:fonttbl|colortbl|stylesheet|generator|mmathPr)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, " ");

  // Escaped literals first, before the generic control-word sweep eats them.
  s = s.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) =>
    Buffer.from([parseInt(h, 16)]).toString("latin1"),
  );
  s = s.replace(/\\par[d]?\b/g, "\n");
  s = s.replace(/\\line\b/g, "\n");
  s = s.replace(/\\tab\b/g, "\t");
  s = s.replace(/\\rquote\b\s?/g, "’");
  s = s.replace(/\\lquote\b\s?/g, "‘");
  s = s.replace(/\\rdblquote\b\s?/g, "”");
  s = s.replace(/\\ldblquote\b\s?/g, "“");
  s = s.replace(/\\emdash\b\s?/g, "-");
  s = s.replace(/\\endash\b\s?/g, "-");
  s = s.replace(/\\bullet\b\s?/g, "-");
  s = s.replace(/\\\\/g, "\\");

  // Remaining control words, then group braces.
  s = s.replace(/\\[a-zA-Z]+-?\d*\s?/g, "");
  s = s.replace(/[{}]/g, "");

  return s
    .split("\n")
    .map((l) => l.replace(/ /g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first `words` words of a passage, normalised to one line. */
export function firstWords(text, words = 9) {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.split(" ").filter(Boolean);
  const head = parts.slice(0, words).join(" ");
  return parts.length > words ? `${head}...` : head;
}
