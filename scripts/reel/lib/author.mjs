// Hand-authored beat plans that survive a re-cut.
//
// planBeats() drafts a plan; the skill then makes the editorial pass. Editing beats.json by
// hand ties every decision to seconds on ONE cut, and the next re-cut (a better take, a
// tighter pause) silently misplaces every graphic. An authored plan instead anchors each
// beat to a SPOKEN WORD ("line 17, the word 'dated'"), so it re-resolves on any cut.
//
//   const P = await openPlan(slug);            // words, structure, rules, edl, sheets...
//   P.beat({ at: P.w(7, "Going"), scene, aroll, graphic, text, ... })
//   P.write();                                  // contiguous, end card, validated, beats.json
//
// Plans live in videos/reel-plans/<slug>.mjs (tracked): the editorial decisions of a
// reel are reproducible from git even though its media is not.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFanEconomy } from "./structure.mjs";
import { validateBeats, SCENES } from "./beats.mjs";
import { loadCapabilities } from "./claims.mjs";
import { loadLibrary, resolveSheets, resolveBroll, toolNames } from "./assets.mjs";
import { lineWindows } from "./cut.mjs";
import { norm } from "./align.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");

export async function openPlan(slug, { reelsDir = process.env.REEL_DIR || path.join(REPO, "videos/reels") } = {}) {
  const dir = path.join(reelsDir, slug);
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const rules = JSON.parse(fs.readFileSync(path.join(HERE, "..", "rules.json"), "utf8"));
  const num = parseInt(slug, 10);
  const scriptFile = path.join(REPO, "videos/scripts/fan-economy", `${slug}.md`);
  const structure = parseFanEconomy(fs.readFileSync(scriptFile, "utf8"), { num, slug });
  const outWords = read("words.clean.json");
  const edl = read("edl.json");
  const library = loadLibrary();
  const caps = loadCapabilities();
  const sheets = resolveSheets(slug, library);
  const { assets: broll } = resolveBroll(dir);
  const speechEnd = outWords[outWords.length - 1].end;
  const beats = [];

  /** Start time of the n-th spoken word in `line` whose text matches `word`. */
  function w(line, word, n = 0) {
    const want = norm(word);
    const hits = outWords.filter((x) => x.line === line && norm(x.text).replace(/^#/, "") === want.replace(/^#/, ""));
    const hit = hits[n] || outWords.find((x) => x.line === line && norm(x.text).startsWith(want));
    if (!hit) throw new Error(`plan anchor not found: line ${line} word "${word}" (#${n}). Line ${line} says: ${outWords.filter((x) => x.line === line).map((x) => x.text).join(" ")}`);
    return hit.start;
  }
  /** Start of a line's first spoken word; end of its last. */
  const lineStart = (line) => { const x = outWords.find((y) => y.line === line); if (!x) throw new Error(`line ${line} was not spoken`); return x.start; };
  /** Is this line in the cut? (false when excluded or never said) */
  const has = (line) => outWords.some((y) => y.line === line);
  const lineEnd = (line) => { const xs = outWords.filter((y) => y.line === line); return xs[xs.length - 1].end; };

  function beat(b) {
    if (!SCENES[b.scene]) throw new Error(`unknown scene ${b.scene}`);
    beats.push({
      lines: [], role: b.role || "authored", phrase: b.phrase || "", text: [], broll: null, graphic: null,
      evidence: "none", assetSource: "composition (programmatic)", transition: "cut", sound: null, captions: "on", notes: "",
      purpose: SCENES[b.scene].purpose, aroll: SCENES[b.scene].aroll,
      ...b, start: +b.at.toFixed(3),
    });
  }

  function build() {
    const sorted = [...beats].sort((a, b) => a.start - b.start);
    sorted[0].start = 0;
    const endcardAt = +(speechEnd + 0.35).toFixed(3);
    const duration = +(Math.max(edl.duration, speechEnd) + rules.pacing.endcardSec).toFixed(3);
    for (let i = 0; i < sorted.length; i++) sorted[i].end = i + 1 < sorted.length ? sorted[i + 1].start : endcardAt;
    sorted.push({
      start: endcardAt, end: duration, lines: [], role: "endcard", phrase: "(visual end-card, not spoken)", scene: "endcard", aroll: "hidden",
      purpose: SCENES.endcard.purpose, text: [structure.endcard.text],
      graphic: { component: "EndCard", props: { text: structure.endcard.text, crown: structure.endcard.crown, asset: library.library["endcard-128"] ? "endcard-128" : null, keyword: structure.ctaKeyword } },
      broll: null, evidence: "none", assetSource: "endcard-128 (owned)", transition: "slide", sound: "soft_hit", captions: "off", notes: "",
    });
    for (const b of sorted) delete b.at;
    return { slug, title: structure.title, edited: true, authored: true, arollDuration: edl.duration, duration, speechEnd, beats: sorted.map((b, i) => ({ id: i, ...b })) };
  }

  function write() {
    const plan = build();
    const ctx = { structure, outWords, lineTimes: lineWindows(structure, outWords), edl, rules, caps, sheets, library, broll, toolName: toolNames()[structure.leadMagnet.slug] };
    const v = validateBeats(plan, ctx);
    fs.writeFileSync(path.join(dir, "beats.json"), JSON.stringify(plan, null, 2));
    return { plan, validation: v };
  }

  return { dir, rules, structure, outWords, edl, sheets, library, w, lineStart, lineEnd, has, beat, build, write, speechEnd };
}
