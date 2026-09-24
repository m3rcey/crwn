// Beat planning: the semantic edit. Every beat says WHY it exists (purpose), what the
// viewer sees (scene), what the A-roll does, what proves the line (evidence + asset
// with provenance), what text is on screen, how it enters, and what it sounds like.
//
// planBeats() writes a DETERMINISTIC first draft from the script's structure: line roles,
// the figures a line states, the capital-letter stress words the scriptwriter already
// marked, the capability a CRWN line names, the sheets the founder already owns. The
// skill then has Claude review that draft against what each sentence MEANS and edit
// beats.json. validateBeats() re-checks any plan, drafted or hand-edited, against the
// rules a model must never be trusted with: the withheld reveal, the fact lock, the
// claim gate, the CTA keyword, the end card, contiguity and pacing.

import { lineNumberTokens } from "./structure.mjs";
import { claimGate } from "./claims.mjs";
import { screenNumberTokens, sourceNumberTokens } from "../../video/lib/scriptParse.mjs";
import { malformedNumbers } from "../../video/lib/factLock.mjs";

export const SCENES = {
  hook_open: { face: true, aroll: "punch", purpose: "open loop: the question, the answer hidden" },
  aroll_hero: { face: true, aroll: "full", purpose: "direct address" },
  aroll_punch: { face: true, aroll: "punch", purpose: "emphasis" },
  aroll_proof: { face: true, aroll: "split", purpose: "proof beside the speaker" },
  fullscreen_proof: { face: false, aroll: "hidden", purpose: "evidence the viewer should look at" },
  motion_concept: { face: false, aroll: "hidden", purpose: "make an abstract idea visible" },
  withheld_tease: { face: true, aroll: "punch", purpose: "hold the open loop" },
  numeric_reveal: { face: false, aroll: "hidden", purpose: "the payoff" },
  calculation: { face: true, aroll: "split", purpose: "show the math in the order it is said" },
  comparison: { face: false, aroll: "hidden", purpose: "two things side by side" },
  crwn_mechanism: { face: false, aroll: "hidden", purpose: "the CRWN capability this story needs" },
  cta_tool: { face: true, aroll: "split", purpose: "show the free tool" },
  cta_keyword: { face: true, aroll: "full", purpose: "tell them exactly what to comment" },
  endcard: { face: false, aroll: "hidden", purpose: "series sign-off" },
};

/** What the hook's hidden answer looks like. Never a digit count: "$???,???" would leak
 * the magnitude, which is part of the answer. */
export function maskFor(withheld) {
  const k = withheld.kind;
  const unit = (String(withheld.bigReveal || "").match(/\b(hours|days|weeks|months|years|albums|projects|chapters|streams|members|people|fans|shows|copies|beats|versions)\b/i) || [])[1];
  if (k === "money") return { text: "$ ? ? ?", unit: null };
  if (unit) return { text: "?", unit: unit.toUpperCase() };
  if (k === "equivalence" || k === "comparison") return { text: "WHO WINS?", unit: null };
  return { text: "?", unit: null };
}

const QUAL_TAG = [
  [/\bmodel\b|not a measurement/i, "A MODEL, NOT A MEASUREMENT"],
  [/self-reported|by (his|her|they|their) own account|his own interviews|her own/i, "SELF-REPORTED"],
  [/\breported(ly)?\b/i, "REPORTED"],
  [/\bestimat/i, "ESTIMATE"],
];
export function qualifierTag(text) {
  for (const [re, tag] of QUAL_TAG) if (re.test(text)) return tag;
  return null;
}

function figureLabel(f) {
  const q = f.qualifier ? { about: "ABOUT", around: "AROUND", like: "ABOUT", roughly: "ROUGHLY", approximately: "ABOUT", over: "OVER", nearly: "NEARLY", "more than": "MORE THAN", "up to": "UP TO" }[f.qualifier] || null : null;
  return { figure: f.figure, qualifier: q, unit: f.unit ? f.unit.toUpperCase() : null };
}

/** On-screen copy: a sentence's period after a figure ("CHARGES $4.") is not part of the
 * figure, and the fact lock rightly reads "$4." as malformed. */
export function screenText(t) {
  return String(t).replace(/(\d)[.,](?=\s|$|["”'])/g, "$1").replace(/\s+$/, "");
}
function cleanBeat(b) {
  if (b.text) b.text = b.text.map(screenText);
  const p = b.graphic?.props;
  if (p?.headline) p.headline = p.headline.map(screenText);
  if (p?.lines) p.lines = p.lines.map(screenText);
  if (p?.words) p.words = p.words.map((w) => (typeof w === "string" ? screenText(w) : { ...w, text: screenText(w.text) }));
  if (p?.figure) p.figure = screenText(p.figure);
  if (p?.steps) p.steps = p.steps.map((x) => ({ ...x, figure: screenText(x.figure) }));
  return b;
}

/** Artists a versus script compares ("Curren$y vs Westside Gunn"). */
export function versusPair(structure) {
  const m = String(structure.title).match(/^(.+?)\s+vs\.?\s+(.+?)(?::|$)/i);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

/**
 * @param {object} ctx {
 *   structure, outWords (clean timeline caption words), lineTimes, edl, rules,
 *   caps (capabilities.json), sheets, library, toolName, broll
 * }
 */
export function planBeats(ctx) {
  const { structure: S, outWords, lineTimes, edl, rules, caps, sheets = [], library, broll = [] } = ctx;
  const speechEnd = outWords.length ? outWords[outWords.length - 1].end : edl.duration;
  const duration = +(Math.max(edl.duration, speechEnd) + rules.pacing.endcardSec).toFixed(3);
  const lt = new Map(lineTimes.map((l) => [l.id, l]));
  const spoken = S.lines.filter((l) => lt.get(l.id)?.start !== null && lt.get(l.id)?.start !== undefined);
  const mask = maskFor(S.withheld);
  const sheet = (role) => sheets.find((s) => s.role === role) || null;
  const pair = versusPair(S);
  const beats = [];
  let usedMiddleSheet = false;
  let usedHookSheet = false;
  let figureCards = 0;

  const wordsOf = (lineId) => outWords.filter((w) => w.line === lineId);
  const timeOfWord = (lineId, pred) => wordsOf(lineId).find((w) => pred(w.text))?.start ?? null;
  // A stress word pops once, on the word.
  const kin = (line, words = line.emphasis, extra = {}) => ({
    component: "Kinetic",
    props: { ...extra, words: words.map((text) => ({ text, at: timeOfWord(line.id, (tx) => tx.replace(/[^A-Za-z0-9$%]/g, "").toUpperCase() === text.replace(/[^A-Za-z0-9$%]/g, "").toUpperCase()) ?? lt.get(line.id).start })) },
  });
  let namedArtist = false;

  spoken.forEach((line, idx) => {
    const t0 = idx === 0 ? 0 : lt.get(line.id).start;
    const next = spoken[idx + 1];
    const t1 = next ? lt.get(next.id).start : speechEnd + 0.35;
    const base = {
      start: +t0.toFixed(3), end: +t1.toFixed(3), lines: [line.id], role: line.role,
      phrase: line.text, text: [], broll: null, graphic: null, evidence: "none",
      assetSource: "composition (programmatic)", transition: "cut", sound: null, captions: "on", notes: "",
    };
    const mk = (scene, extra = {}) => ({ ...base, scene, aroll: SCENES[scene].aroll, purpose: SCENES[scene].purpose, ...extra });
    const figs = line.figures.filter((f) => f.tokens.length);
    const withheldFig = figs.find((f) => f.tokens.some((t) => S.withheld.tokens.includes(t)));
    let b;

    switch (line.role) {
      case "hook": {
        if (idx === 0) {
          const headline = S.hookHeadline || [line.text];
          b = mk("hook_open", { text: [...headline, mask.text + (mask.unit ? ` ${mask.unit}` : "")], graphic: { component: "HookOpen", props: { headline, mask, artist: S.artist } }, sound: "pop" });
        } else if (!usedHookSheet && sheet("hook")) {
          usedHookSheet = true;
          b = mk("aroll_proof", { broll: { asset: sheet("hook").id }, evidence: "illustration", assetSource: "hook sheet (owned)", graphic: { component: "SheetCard", props: { asset: sheet("hook").id, focus: "top" } } });
        } else b = mk("aroll_punch");
        break;
      }
      case "hook_turn":
        b = mk("aroll_punch", { transition: "punch", sound: "riser_drop", notes: "music drops here and a riser peaks on the drop (founder's own assembly rule)" });
        break;
      case "tease":
        b = mk("withheld_tease", { text: [mask.text + (mask.unit ? ` ${mask.unit}` : "")], graphic: { component: "MaskedFigure", props: { mask } } });
        break;
      case "detour_open":
        b = mk("aroll_punch", { transition: "whip", sound: "whoosh", text: ["SIDENOTE"], graphic: { component: "Chip", props: { text: "SIDENOTE" } } });
        break;
      case "detour_thesis":
        b = mk("motion_concept", { text: [line.text.toUpperCase()], graphic: { component: "Thesis", props: { lines: line.text.split(/(?<=\.)\s+/).map((s) => s.toUpperCase()) } }, transition: "slide", captions: "off", notes: "the thesis text IS the spoken words: no captions under it" });
        break;
      case "detour_crwn": {
        const gate = claimGate(S, line, caps);
        const footage = gate.allowed ? gate.capabilities.flatMap((c) => caps.capabilities[c].footage || []).find((id) => library?.library?.[id]) : null;
        const labels = gate.capabilities.map((c) => caps.capabilities[c].label);
        b = mk("crwn_mechanism", {
          text: gate.allowed ? ["LIVE ON CRWN", ...labels.slice(0, 3).map((x) => x.toUpperCase())] : [],
          graphic: { component: "CrwnMechanism", props: { footage, labels: gate.allowed ? labels.slice(0, 3) : [], gate } },
          broll: footage ? { asset: footage } : null,
          evidence: gate.allowed ? "product" : "none",
          assetSource: footage ? `CRWN screen recording (${footage})` : sheet("crwn") ? "crwn sheet (owned)" : "composition",
          notes: gate.reason,
        });
        if (!footage && sheet("crwn")) { b.graphic = { component: "SheetCard", props: { asset: sheet("crwn").id, focus: "center", labels: gate.allowed ? labels.slice(0, 3) : [] } }; b.broll = { asset: sheet("crwn").id }; }
        if (!gate.allowed && !sheet("crwn")) { b.scene = "motion_concept"; b.aroll = "hidden"; b.graphic = line.emphasis.length ? kin(line) : kin(line, ["CRWN"]); }
        break;
      }
      case "detour":
        b = line.emphasis.length ? mk("aroll_punch", { text: line.emphasis, graphic: kin(line) }) : mk("aroll_hero");
        if (!b.graphic && sheet("crwn")) b = mk("aroll_proof", { broll: { asset: sheet("crwn").id }, evidence: "illustration", assetSource: "crwn sheet (owned)", graphic: { component: "SheetCard", props: { asset: sheet("crwn").id, focus: "top" } } });
        break;
      case "detour_close":
        b = mk("aroll_hero", { transition: "whip", sound: "whoosh" });
        break;
      case "restate":
        b = mk("withheld_tease", { text: [mask.text + (mask.unit ? ` ${mask.unit}` : "")], graphic: { component: "MaskedFigure", props: { mask, pulse: true } } });
        break;
      case "reveal": {
        if (withheldFig) {
          const label = figureLabel(withheldFig);
          // The payoff lands when the figure is actually SAID: in this line if it was, else
          // wherever it is first spoken. Never at a line-start guess, which could be early.
          const saysIt = (tx) => lineNumberTokens(tx).some((t) => withheldFig.tokens.includes(t));
          const at = timeOfWord(line.id, saysIt);
          // A short beat on the face first, then the payoff lands on the word.
          if (at !== null && at - t0 > 0.5) beats.push({ ...mk("aroll_punch"), end: +at.toFixed(3) });
          if (at === null) {
            // He did not say the figure in this line: the line itself is the payoff, and the
            // figure appears wherever it IS said (never here, never early).
            b = mk("motion_concept", { text: [line.text.toUpperCase()], graphic: kin(line, line.words.slice(0, 6).map((w) => w.toUpperCase()), { big: true }), sound: "hit", transition: "flash", captions: "off", notes: "reveal figure not spoken in the reveal line: word reveal instead" });
            break;
          }
          b = mk("numeric_reveal", {
            start: +at.toFixed(3), text: [[label.qualifier, label.figure].filter(Boolean).join(" "), label.unit].filter(Boolean),
            graphic: { component: "Reveal", props: label }, evidence: "figure", sound: "hit", transition: "flash", captions: "off",
            notes: "the withheld answer: lands on the spoken word, never before it",
          });
        } else {
          b = mk("motion_concept", { text: [line.text.toUpperCase()], graphic: kin(line, line.words.slice(0, 6).map((w) => w.toUpperCase()), { big: true }), sound: "hit", transition: "flash", captions: "off", notes: "conceptual reveal: the words themselves are the payoff" });
        }
        break;
      }
      case "payoff": {
        if (figs.length >= 2) b = mk("calculation", { text: figs.map((f) => [figureLabel(f).qualifier, f.figure, f.unit].filter(Boolean).join(" ").toUpperCase()), graphic: { component: "Calculation", props: { steps: figs.map((f) => ({ ...figureLabel(f), at: timeOfWord(line.id, (tx) => lineNumberTokens(tx).some((t) => f.tokens.includes(t))) })) } }, evidence: "figure" });
        else if (figs.length === 1) b = mk("aroll_proof", { text: [[figureLabel(figs[0]).qualifier, figs[0].figure].filter(Boolean).join(" "), figureLabel(figs[0]).unit].filter(Boolean), graphic: { component: "FigureCard", props: figureLabel(figs[0]) }, evidence: "figure" });
        else if (sheet("reveal") && !beats.some((x) => x.broll?.asset === sheet("reveal").id)) b = mk("fullscreen_proof", { broll: { asset: sheet("reveal").id }, evidence: "illustration", assetSource: "reveal sheet (owned, gated to the reveal)", graphic: { component: "SheetCard", props: { asset: sheet("reveal").id, focus: "center" } } });
        else b = line.emphasis.length ? mk("aroll_punch", { text: line.emphasis, graphic: kin(line) }) : mk("aroll_hero");
        break;
      }
      case "deepen":
        b = line.emphasis.length ? mk("aroll_punch", { text: line.emphasis, graphic: kin(line) }) : mk("aroll_hero");
        break;
      case "qualifier": {
        const tag = qualifierTag(line.text) || qualifierTag(S.meta.metric || "");
        b = mk("aroll_hero", { text: tag ? [tag] : [], graphic: tag ? { component: "Chip", props: { text: tag, tone: "quiet" } } : null, notes: "keeps the epistemic status on screen" });
        break;
      }
      case "question":
        b = mk("aroll_hero", { notes: "a direct question to the viewer: stay on the face" });
        break;
      case "cta_tool": {
        const toolAsset = Object.entries(library?.library || {}).find(([, a]) => a.kind === "tool_footage" && a.leadMagnet === S.leadMagnet.slug)?.[0] || null;
        const name = ctx.toolName || S.leadMagnet.toolName || "the free calculator";
        b = mk("cta_tool", { text: [String(name).toUpperCase(), "FREE"], graphic: { component: "ToolCard", props: { name, footage: toolAsset } }, broll: toolAsset ? { asset: toolAsset } : null, evidence: "product", assetSource: toolAsset ? `CRWN tool recording (${toolAsset})` : "composition (tool name card)", transition: "slide", notes: toolAsset ? "" : `no recording of ${S.leadMagnet.slug} yet: add one to scripts/reel/assets.json` });
        break;
      }
      case "cta_keyword":
        b = mk("cta_keyword", { text: [`COMMENT ${S.ctaKeyword}`], graphic: { component: "Keyword", props: { keyword: S.ctaKeyword } }, sound: "pop", captions: "off" });
        break;
      default: {
        // setup / mechanism: evidence first, then the owned sheets, then the face.
        const bl = broll.find((x) => x.line === line.id);
        if (bl) b = mk(bl.kind === "broll_video" ? "fullscreen_proof" : "aroll_proof", { broll: { asset: bl.id }, evidence: "sourced", assetSource: `${bl.provenance.source}${bl.provenance.url ? ` (${bl.provenance.url})` : ""}`, graphic: { component: "Media", props: { asset: bl.id } } });
        else if (!namedArtist && line.mentionsArtist && (line.role === "setup" || line.role === "mechanism") && !figs.length) {
          namedArtist = true;
          b = mk("aroll_hero", { text: [String(S.artist).toUpperCase()], graphic: { component: "NameTag", props: { name: S.artist } }, notes: "who this story is about" });
        }
        else if (pair && [pair[0], pair[1]].every((n) => line.text.toLowerCase().includes(n.split(" ")[0].toLowerCase()))) b = mk("comparison", { text: [pair[0].toUpperCase(), pair[1].toUpperCase()], graphic: { component: "Comparison", props: { left: pair[0], right: pair[1] } } });
        else if (figs.length && figureCards < 4 && !withheldFig) {
          figureCards++;
          const f = figureLabel(figs[0]);
          b = mk("aroll_proof", { text: [[f.qualifier, f.figure].filter(Boolean).join(" "), f.unit].filter(Boolean), graphic: { component: "FigureCard", props: { ...f, tag: qualifierTag(line.text) } }, evidence: "figure", notes: qualifierTag(line.text) ? "qualifier kept on the card" : "" });
          if (qualifierTag(line.text)) b.text.push(qualifierTag(line.text));
        } else if (line.role === "mechanism" && !usedMiddleSheet && sheet("middle")) {
          usedMiddleSheet = true;
          b = mk("fullscreen_proof", { broll: { asset: sheet("middle").id }, evidence: "illustration", assetSource: "middle sheet (owned)", graphic: { component: "SheetCard", props: { asset: sheet("middle").id, focus: "center" } }, transition: "slide" });
        } else if (line.emphasis.length) b = mk("aroll_punch", { text: line.emphasis, graphic: kin(line) });
        else if (line.names.length) b = mk("aroll_punch", { text: line.names.slice(0, 2).map((n) => n.toUpperCase()), graphic: { component: "Chip", props: { text: line.names.slice(0, 2).join(" · ").toUpperCase() } }, notes: "names on screen are proof the story is real" });
        else b = mk(idx % 2 ? "aroll_hero" : "aroll_punch");
      }
    }
    beats.push(b);
  });

  beats.push({
    start: +(speechEnd + 0.35).toFixed(3), end: duration, lines: [], role: "endcard", phrase: "(visual end-card, not spoken)",
    scene: "endcard", aroll: "hidden", purpose: SCENES.endcard.purpose, text: [S.endcard.text], graphic: { component: "EndCard", props: { text: S.endcard.text, crown: S.endcard.crown, asset: library?.library?.["endcard-128"] ? "endcard-128" : null, keyword: S.ctaKeyword } },
    broll: null, evidence: "none", assetSource: library?.library?.["endcard-128"] ? "endcard-128 (owned)" : "composition", transition: "slide", sound: "soft_hit", captions: "off", notes: "",
  });
  // The last spoken beat must end where the end card starts.
  for (let i = 0; i < beats.length - 1; i++) beats[i].end = beats[i + 1].start;

  beats.forEach(cleanBeat);
  let out = pace(beats, { outWords, edl, rules });
  out = balanceFace(out, rules);
  return { duration, speechEnd, beats: out.map((b, i) => ({ id: i, ...b })) };
}

/** Split any too-static A-roll beat at a word boundary and mask jump cuts with a zoom. */
function pace(beats, { outWords, edl, rules }) {
  const V = rules.visual;
  const jumpCuts = edl.segments.filter((s) => s.jumpCut).map((s) => s.outStart);
  const out = [];
  for (const b of beats) {
    if (!["aroll_hero", "aroll_punch", "hook_open", "withheld_tease"].includes(b.scene)) { out.push(b); continue; }
    const limit = b.role === "hook" || b.role === "hook_turn" ? V.maxStaticSec.hook : V.maxStaticSec.body;
    const cuts = new Set(jumpCuts.filter((t) => t > b.start + 0.3 && t < b.end - 0.3).map((t) => +t.toFixed(3)));
    // Hook: the first visual change comes within hookFirstChangeSec.
    if (b.start === 0 && b.end > V.hookFirstChangeSec + 0.3) {
      const w = outWords.find((x) => x.start >= V.hookFirstChangeSec * 0.7 && x.start <= V.hookFirstChangeSec);
      cuts.add(+(w ? w.start : V.hookFirstChangeSec).toFixed(3));
    }
    let pieces = [b.start, ...[...cuts].sort((a, b2) => a - b2), b.end];
    const res = [];
    for (let i = 0; i < pieces.length - 1; i++) {
      let a = pieces[i];
      const z = pieces[i + 1];
      while (z - a > limit + 0.4) {
        const target = a + Math.min(limit, (z - a) / 2);
        const w = outWords.filter((x) => x.start > a + 0.6 && x.start < z - 0.6).sort((p, q) => Math.abs(p.start - target) - Math.abs(q.start - target))[0];
        if (!w) break;
        res.push([a, w.start]);
        a = w.start;
      }
      res.push([a, z]);
    }
    res.forEach(([a, z], i) => {
      const part = { ...b, start: +a.toFixed(3), end: +z.toFixed(3) };
      if (i > 0) {
        part.scene = b.scene === "aroll_punch" || b.scene === "hook_open" ? (i % 2 ? "aroll_hero" : "aroll_punch") : i % 2 ? "aroll_punch" : "aroll_hero";
        part.aroll = SCENES[part.scene].aroll;
        part.sound = null;
        part.transition = cuts.has(+a.toFixed(3)) ? "punch" : "cut";
        part.notes = cuts.has(+a.toFixed(3)) ? "zoom change masks a jump cut" : "pacing: the frame changes before it goes static";
        if (b.scene === "hook_open" || b.scene === "withheld_tease") { part.scene = b.scene; part.aroll = i % 2 ? "full" : "punch"; part.continued = true; }
        else if (b.graphic?.component !== "Kinetic") { part.graphic = null; part.text = []; }
      }
      if (b.graphic?.component === "Kinetic") {
        const ws = b.graphic.props.words.filter((w) => w.at >= a - 1e-3 && w.at < z);
        part.graphic = ws.length ? { ...b.graphic, props: { ...b.graphic.props, words: ws } } : null;
        part.text = ws.map((w) => w.text);
      }
      out.push(part);
    });
  }
  return out;
}

export function faceStats(beats) {
  let face = 0, run = 0, maxRun = 0, total = 0;
  for (const b of beats) {
    if (b.scene === "endcard") continue;
    const d = b.end - b.start;
    total += d;
    if (b.aroll !== "hidden") { face += d; run = 0; } else { run += d; maxRun = Math.max(maxRun, run); }
  }
  return { ratio: total ? face / total : 1, maxNoFaceRun: maxRun };
}

/** Keep the founder on screen: convert the least important full-screen beats to splits. */
function balanceFace(beats, rules) {
  const V = rules.visual;
  const order = ["fullscreen_proof", "comparison", "motion_concept", "crwn_mechanism"];
  let guard = 0;
  while (guard++ < 40) {
    const st = faceStats(beats);
    if (st.ratio >= V.minFaceRatio && st.maxNoFaceRun <= V.maxNoFaceRunSec) break;
    const cand = beats
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => order.includes(b.scene) && b.aroll === "hidden" && b.role !== "detour_thesis")
      .sort((x, y) => order.indexOf(x.b.scene) - order.indexOf(y.b.scene) || (y.b.end - y.b.start) - (x.b.end - x.b.start))[0];
    if (!cand) break;
    cand.b.aroll = "split";
    cand.b.notes = `${cand.b.notes ? cand.b.notes + "; " : ""}kept the face on screen (split) to hold the face-time rule`;
  }
  return beats;
}

/**
 * Validate any plan. Returns { errors, warnings, repaired } and REPAIRS what is safe to
 * repair deterministically (a withheld figure shown early is pushed to its word).
 */
export function validateBeats(plan, ctx) {
  const { structure: S, outWords, rules, caps, sheets = [], library, broll = [] } = ctx;
  const errors = [], warnings = [], repaired = [];
  const beats = plan.beats;
  // Contiguity.
  if (!beats.length) errors.push("no beats");
  if (beats[0]?.start > 0.001) errors.push(`first beat starts at ${beats[0].start}s, not 0`);
  for (let i = 1; i < beats.length; i++) {
    if (Math.abs(beats[i].start - beats[i - 1].end) > 0.002) errors.push(`gap/overlap between beat ${i - 1} and ${i} (${beats[i - 1].end} vs ${beats[i].start})`);
    if (beats[i].end <= beats[i].start) errors.push(`beat ${i} has no duration`);
  }
  for (const b of beats) if (!SCENES[b.scene]) errors.push(`beat ${b.id}: unknown scene "${b.scene}"`);

  // Withheld reveal: the first spoken time of every late figure.
  const spokenAt = new Map();
  for (const w of outWords) for (const t of lineNumberTokens(w.text)) if (!spokenAt.has(t)) spokenAt.set(t, w.start);
  const late = new Set(S.withheld.lateTokens);
  const lead = rules.visual.revealLeadSec;
  for (const b of beats) {
    for (const txt of b.text || []) {
      for (const t of [...screenNumberTokens(txt), ...lineNumberTokens(txt)]) {
        if (!late.has(t) || !spokenAt.has(t)) continue;
        const at = spokenAt.get(t);
        if (b.start < at - lead) {
          const i = beats.indexOf(b);
          if (i > 0 && at < b.end) {
            const early = at - b.start;
            beats[i - 1].end = +at.toFixed(3);
            b.start = +at.toFixed(3);
            repaired.push(`beat ${b.id} showed "${txt}" ${early.toFixed(2)}s early: moved to the spoken word`);
          } else errors.push(`WITHHELD LEAK: beat ${b.id} shows "${txt}" at ${b.start}s, spoken at ${at.toFixed(2)}s`);
        }
      }
    }
    // Gated assets (the reveal and CTA sheets) never before the reveal word.
    const assetId = b.broll?.asset || b.graphic?.props?.asset;
    const sh = sheets.find((s) => s.id === assetId);
    const revealAt = S.withheld.revealLine >= 0 ? outWords.find((w) => w.line === S.withheld.revealLine)?.start : null;
    if (sh?.gatedToReveal && revealAt != null && b.start < revealAt - lead) errors.push(`WITHHELD LEAK: beat ${b.id} shows the ${sh.role} sheet at ${b.start}s, before the reveal at ${revealAt.toFixed(2)}s`);
    const br = broll.find((x) => x.id === assetId);
    if (br?.reveals?.length && br.reveals.some((t) => late.has(String(t)) && spokenAt.has(String(t)) && b.start < spokenAt.get(String(t)) - lead)) errors.push(`WITHHELD LEAK: sourced asset ${br.id} reveals a withheld figure before it is spoken`);
  }

  // Fact lock: every number on screen traces to this script.
  const parsedLike = { title: S.title, scriptText: S.lines.map((l) => l.text).join("\n"), meta: S.meta };
  const allowed = new Set([...sourceNumberTokens(parsedLike), ...S.lines.flatMap((l) => l.numbers)]);
  for (const b of beats) for (const txt of b.text || []) {
    const bad = malformedNumbers(txt);
    if (bad.length) errors.push(`beat ${b.id}: malformed number in "${txt}"`);
    for (const t of screenNumberTokens(txt)) if (!allowed.has(t) && !(b.scene === "endcard" && t === "128")) errors.push(`FACT LOCK: beat ${b.id} shows ${t} ("${txt}"), which this script never states`);
  }

  // Claims: CRWN product visuals only where the gate allows.
  for (const b of beats) {
    if (b.scene !== "crwn_mechanism" && !(b.graphic?.props?.footage && b.scene !== "cta_tool")) continue;
    const line = S.lines[b.lines[0]];
    if (!line) continue;
    const gate = claimGate(S, line, caps);
    if (b.graphic?.props?.footage && !gate.allowed) errors.push(`CLAIM: beat ${b.id} shows CRWN product footage but ${gate.reason}`);
  }

  // Provenance for every referenced asset.
  const known = new Map([...sheets.map((s) => [s.id, s]), ...broll.map((s) => [s.id, s]), ...Object.entries(library?.library || {}).map(([id, a]) => [id, a])]);
  for (const b of beats) {
    for (const id of [b.broll?.asset, b.graphic?.props?.asset, b.graphic?.props?.footage].filter(Boolean)) {
      const a = known.get(id);
      if (!a) errors.push(`beat ${b.id}: unknown asset "${id}"`);
      else if (!a.provenance?.source) errors.push(`beat ${b.id}: asset "${id}" has no provenance`);
    }
  }

  // CTA and end card.
  const kw = beats.filter((b) => b.scene === "cta_keyword");
  if (kw.length !== 1) errors.push(`expected exactly one cta_keyword beat, found ${kw.length}`);
  else if (kw[0].graphic?.props?.keyword !== S.ctaKeyword) errors.push(`CTA keyword on screen is "${kw[0].graphic?.props?.keyword}", script says "${S.ctaKeyword}"`);
  if (kw[0] && kw[0].end - kw[0].start < 0.8) warnings.push("CTA keyword is on screen under 0.8s");
  const last = beats[beats.length - 1];
  if (last?.scene !== "endcard") errors.push("the last beat is not the 128 end card");
  else if (last.end - last.start < 1.0) errors.push("end card shorter than 1s");

  // Pacing and face time: warnings (taste), not errors.
  const st = faceStats(beats);
  if (st.ratio < rules.visual.minFaceRatio) warnings.push(`face on screen ${(st.ratio * 100).toFixed(0)}% (rule: at least ${(rules.visual.minFaceRatio * 100).toFixed(0)}%)`);
  if (st.maxNoFaceRun > rules.visual.maxNoFaceRunSec + 0.01) warnings.push(`longest stretch without the face is ${st.maxNoFaceRun.toFixed(1)}s (rule: ${rules.visual.maxNoFaceRunSec}s)`);
  for (const b of beats) {
    const d = b.end - b.start;
    const words = (b.text || []).join(" ").split(/\s+/).filter(Boolean).length;
    const need = Math.max(rules.visual.readingHoldMinSec, words / rules.visual.readingWordsPerSec);
    if (["fullscreen_proof", "calculation", "comparison", "motion_concept"].includes(b.scene) && words && d < need * 0.8) warnings.push(`beat ${b.id} (${b.scene}) is ${d.toFixed(1)}s, reading it needs about ${need.toFixed(1)}s`);
  }
  const sfx = beats.filter((b) => b.sound).length;
  const minutes = (beats[beats.length - 1]?.end || 60) / 60;
  if (sfx / minutes > rules.audio.maxSfxPerMinute) warnings.push(`${sfx} sound effects in ${minutes.toFixed(1)} min: over the ${rules.audio.maxSfxPerMinute}/min rule`);
  return { errors, warnings, repaired, face: st };
}
