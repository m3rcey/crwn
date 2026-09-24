// Test helpers: build a word-timed transcript from a plan of spoken fragments, the way a
// real recording session goes (retakes, stutters, fillers, asides, dead air). Used by the
// tests and by `reel selftest`; never by a real edit.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFanEconomy } from "./structure.mjs";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const SCRIPTS_DIR = path.join(REPO, "videos/scripts/fan-economy");

export function loadStructure(num) {
  const f = fs.readdirSync(SCRIPTS_DIR).find((x) => x.startsWith(`${num}-`) && x.endsWith(".md"));
  return parseFanEconomy(fs.readFileSync(path.join(SCRIPTS_DIR, f), "utf8"), { num, slug: f.replace(/\.md$/, "") });
}

/**
 * plan: array of steps
 *   { say: "text" }              words at ~2.9 words/s
 *   { line: 5 }                  the script's line 5 verbatim
 *   { line: 5, upTo: 4 }         the first 4 words of line 5 (an abandoned take)
 *   { line: 5, from: 3 }         line 5 from its 4th word (a restart mid-line)
 *   { pause: 1.5 }               silence
 *   { filler: "um" }             a filler word
 */
export function synthTranscript(structure, plan, { wps = 2.9, start = 0.4 } = {}) {
  let t = start;
  const words = [];
  const push = (text, type = "word") => {
    const dur = Math.max(0.12, (text.length / 5.5) / wps * 1.6);
    words.push({ text, start: +t.toFixed(3), end: +(t + dur).toFixed(3), type });
    t += dur + 0.06;
  };
  for (const step of plan) {
    if (step.pause) { t += step.pause; continue; }
    if (step.filler) { push(step.filler, "filler"); continue; }
    let text = step.say;
    if (step.line !== undefined) {
      const ws = structure.lines[step.line].words;
      text = ws.slice(step.from || 0, step.upTo ?? ws.length).join(" ");
    }
    for (const w of text.split(/\s+/).filter(Boolean)) push(w);
    t += 0.12;
  }
  return { provider: "synthetic", model: null, language: "en", duration: t + 0.5, words };
}
