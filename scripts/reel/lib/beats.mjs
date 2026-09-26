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
  // The tool owns the frame (founder, 2026-09-25: never a small calculator above his face).
  cta_tool: { face: false, aroll: "hidden", purpose: "show the free tool" },
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
/** A spoken line as a two-line headline (at most ~7 words a line). */
function splitHeadline(t) {
  const w = t.split(/\s+/).filter(Boolean).slice(0, 14);
  const h = Math.ceil(w.length / 2);
  return w.length > 7 ? [w.slice(0, h).join(" "), w.slice(h).join(" ")] : [w.join(" ")];
}

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
  const said = spokenLineIds(S, outWords);
  const spoken = S.lines.filter((l) => said.has(l.id) && lt.get(l.id)?.start !== null && lt.get(l.id)?.start !== undefined);
  const mask = maskFor(S.withheld);
  const sheet = (role) => sheets.find((s) => s.role === role) || null;
  const pair = versusPair(S);
  const beats = [];
  let usedMiddleSheet = false;
  let usedHookSheet = false;
  let figureCards = 0;

  const wordsOf = (lineId) => outWords.filter((w) => w.line === lineId);
  const timeOfWord = (lineId, pred) => wordsOf(lineId).find((w) => pred(w.text))?.start ?? null;
  // A stress word pops once, on the word. A script word he did not say is not shown.
  const kin = (line, words = line.emphasis, extra = {}) => ({
    component: "Kinetic",
    props: { ...extra, words: words.map((text) => ({ text, at: timeOfWord(line.id, (tx) => tx.replace(/[^A-Za-z0-9$%]/g, "").toUpperCase() === text.replace(/[^A-Za-z0-9$%]/g, "").toUpperCase()) })).filter((w) => w.at !== null) },
  });
  let namedArtist = false;

  spoken.forEach((line, idx) => {
    const t0 = idx === 0 ? 0 : lt.get(line.id).start;
    const next = spoken[idx + 1];
    const t1 = next ? lt.get(next.id).start : speechEnd + 0.35;
    const base = {
      start: +t0.toFixed(3), end: +t1.toFixed(3), lines: [line.id], role: line.role,
      // The phrase is what he SAID on this line (the viewer hears that), not the script.
      phrase: wordsOf(line.id).map((w) => w.text).join(" ") || line.text, text: [], broll: null, graphic: null, evidence: "none",
      assetSource: "composition (programmatic)", transition: "cut", sound: null, captions: "on", notes: "",
    };
    const mk = (scene, extra = {}) => ({ ...base, scene, aroll: SCENES[scene].aroll, purpose: SCENES[scene].purpose, ...extra });
    const figs = line.figures.filter((f) => f.tokens.length);
    const withheldFig = figs.find((f) => f.tokens.some((t) => S.withheld.tokens.includes(t)));
    let b;

    switch (line.role) {
      case "hook": {
        if (idx === 0) {
          // The script's written hook headline only when he actually said it (a rewording
          // is fine); otherwise the question as he asked it.
          const said = wordsOf(line.id).map((w) => w.text);
          const W = rules.visual.spokenWindowSec;
          const fits = (h) => h.every((x) => { const all = unspokenWords(x, [], 0, 0, S).length; return unspokenWords(x, outWords, -1, t1 + W, S).length <= all / 3; });
          const headline = S.hookHeadline && fits(S.hookHeadline) ? S.hookHeadline : said.length ? splitHeadline(said.join(" ").toUpperCase()) : [line.text];
          b = mk("hook_open", { text: [...headline, mask.text + (mask.unit ? ` ${mask.unit}` : "")], labels: [mask.text + (mask.unit ? ` ${mask.unit}` : "")], graphic: { component: "HookOpen", props: { headline, mask, artist: S.artist } }, sound: "pop" });
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
        b = mk("withheld_tease", { text: [mask.text + (mask.unit ? ` ${mask.unit}` : "")], labels: [mask.text + (mask.unit ? ` ${mask.unit}` : "")], graphic: { component: "MaskedFigure", props: { mask } } });
        break;
      case "detour_open":
        b = mk("aroll_punch", { transition: "whip", sound: "whoosh", text: ["SIDENOTE"], labels: ["SIDENOTE"], graphic: { component: "Chip", props: { text: "SIDENOTE" } } });
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
          // Capability labels come from the claim-gated registry: product truth, not speech.
          labels: gate.allowed ? ["LIVE ON CRWN", ...labels.slice(0, 3).map((x) => x.toUpperCase())] : [],
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
        b = mk("withheld_tease", { text: [mask.text + (mask.unit ? ` ${mask.unit}` : "")], labels: [mask.text + (mask.unit ? ` ${mask.unit}` : "")], graphic: { component: "MaskedFigure", props: { mask, pulse: true } } });
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
        // His own qualifier words pick the tag when he said one; either way a qualifier is a
        // factual guardrail (accuracy outranks speech), so it is always a declared label.
        const saidTag = qualifierTag(wordsOf(line.id).map((w) => w.text).join(" "));
        const tag = saidTag || qualifierTag(line.text) || qualifierTag(S.meta.metric || "");
        b = mk("aroll_hero", { text: tag ? [tag] : [], labels: tag ? [tag] : [], graphic: tag ? { component: "Chip", props: { text: tag, tone: "quiet" } } : null, notes: "keeps the epistemic status on screen" });
        break;
      }
      case "question":
        b = mk("aroll_hero", { notes: "a direct question to the viewer: stay on the face" });
        break;
      case "cta_tool": {
        const toolAsset = Object.entries(library?.library || {}).filter(([, a]) => a.kind === "tool_footage" && a.leadMagnet === S.leadMagnet.slug).map(([id]) => id).sort().reverse()[0] || null;
        const name = ctx.toolName || S.leadMagnet.toolName || "the free calculator";
        b = mk("cta_tool", { text: [String(name).toUpperCase(), "FREE"], labels: [String(name).toUpperCase()], graphic: toolAsset ? { component: "Footage", props: { footage: toolAsset, move: [{ scale: 1.02 }, { scale: 1.1, y: -30 }], labels: [{ text: "FREE CALCULATOR", y: 300 }] } } : { component: "ToolCard", props: { name, footage: null } }, broll: toolAsset ? { asset: toolAsset } : null, evidence: "product", assetSource: toolAsset ? `CRWN tool recording (${toolAsset})` : "composition (tool name card)", transition: "slide", notes: toolAsset ? "" : `no recording of ${S.leadMagnet.slug} yet: add one to scripts/reel/assets.json` });
        break;
      }
      case "cta_keyword":
        b = mk("cta_keyword", { text: [`COMMENT ${S.ctaKeyword}`], graphic: { component: "Keyword", props: { keyword: S.ctaKeyword } }, sound: "pop", captions: "off" });
        break;
      default: {
        // setup / mechanism: evidence first, then the owned sheets, then the face.
        const bl = broll.find((x) => x.line === line.id);
        if (bl) b = mk(bl.kind === "broll_video" ? "fullscreen_proof" : "aroll_proof", { broll: { asset: bl.id }, evidence: "sourced", assetSource: `${bl.provenance.source}${bl.provenance.url ? ` (${bl.provenance.url})` : ""}`, graphic: { component: "Media", props: { asset: bl.id } } });
        else if (!namedArtist && line.mentionsArtist && S.artist && !/^none\b/i.test(S.artist) && (line.role === "setup" || line.role === "mechanism") && !figs.length) {
          namedArtist = true;
          b = mk("aroll_hero", { text: [String(S.artist).toUpperCase()], graphic: { component: "NameTag", props: { name: S.artist } }, notes: "who this story is about" });
        }
        else if (pair && [pair[0], pair[1]].every((n) => line.text.toLowerCase().includes(n.split(" ")[0].toLowerCase()))) b = mk("comparison", { text: [pair[0].toUpperCase(), pair[1].toUpperCase()], graphic: { component: "Comparison", props: { left: pair[0], right: pair[1] } } });
        else if (figs.length && figureCards < 4 && !withheldFig) {
          figureCards++;
          const f = figureLabel(figs[0]);
          const saidQ = qualifierTag(wordsOf(line.id).map((w) => w.text).join(" "));
          const q = saidQ || qualifierTag(line.text);
          b = mk("aroll_proof", { text: [[f.qualifier, f.figure].filter(Boolean).join(" "), f.unit].filter(Boolean), graphic: { component: "FigureCard", props: { ...f, tag: q } }, evidence: "figure", notes: q ? "qualifier kept on the card" : "" });
          // A qualifier is the factual guardrail: always shown, always a declared label.
          if (q) { b.text.push(q); b.labels = [q]; }
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
  // (The face-time balancer that turned full-screen beats into splits was retired 2026-09-25.)
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

const STOP = new Set("a an and are as at be been but by can could did do does for from get got had has have he her him his i if in is it its me my no not of on or our she so that the them then there they this to up us was we were what when where which who will with would you your just one all any how than too very own about around roughly over nearly more under almost".split(" "));
const stem = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
/**
 * Content words in on-screen text that he never says within [a, b] on the clean
 * timeline. Numbers are the fact lock's job; the artist's name, CRWN, the CTA keyword and
 * "comment" are always allowed.
 */
export function unspokenWords(txt, outWords, a, b, S) {
  const said = outWords.filter((w) => w.end >= a && w.start <= b).flatMap((w) => String(w.text).split(/[\s-]+/)).map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const near = new Set(said.map(stem));
  // A plural or a tense is the same word he said ("TOURS" for "tour", "OWED" for "owe").
  const heard = (w) => { const n = w.toLowerCase().replace(/[^a-z0-9]/g, ""); return near.has(stem(n)) || said.some((x) => Math.min(x.length, n.length) >= 3 && (x.startsWith(n) || n.startsWith(x)) && Math.abs(x.length - n.length) <= 2); };
  const free = new Set(["crwn", "comme", "vs", stem(S.ctaKeyword || ""), ...String(S.artist || "").split(/\s+/).map(stem)]);
  return String(txt).replace(/\*/g, "").split(/[\s/,.:;!?()"“”-]+/).filter(Boolean)
    .filter((w) => !/[0-9$%]/.test(w) && w.length > 2 && !STOP.has(w.toLowerCase()))
    .filter((w) => !heard(w) && !free.has(stem(w)));
}

/**
 * Script lines that are really in the spoken edit. A stray short word the aligner pinned
 * to a line he skipped ("to.") does not make the line spoken: it needs at least 3 of its
 * words, or a third of a short line.
 */
export function spokenLineIds(S, outWords) {
  const n = new Map();
  for (const w of outWords) if (w.line != null) n.set(w.line, (n.get(w.line) || 0) + 1);
  return new Set(S.lines.filter((l) => { const k = n.get(l.id) || 0; return k >= Math.min(3, Math.max(1, Math.ceil(l.words.length / 3))); }).map((l) => l.id));
}

/**
 * Objects that glide for a long time between two keys, usually a move keyed from t=0 that
 * was meant to happen at its second key (a caption card drifted for 86 seconds and sat
 * half off-frame when its scene came up). A warning: a slow glide can be intended.
 */
export function worldDriftLint(plan, maxGlideSec = 12) {
  const out = [];
  for (const o of plan.world?.objects || []) for (const [prop, keys] of Object.entries(o.keys || {})) {
    if (!Array.isArray(keys) || prop === "opacity") continue;
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      if (b.t - a.t > maxGlideSec && JSON.stringify(a.v) !== JSON.stringify(b.v) && b.ease !== "hold") out.push(`world object ${o.id}: "${prop}" glides for ${(b.t - a.t).toFixed(0)}s (${a.t}s to ${b.t}s); hold it until its move starts`);
    }
  }
  return out;
}

/** Camera keys that travel across the world without a declared cut. */
export function worldCameraLint(plan, maxTravel = 25) {
  const keys = [...(plan.world?.camera || [])].sort((a, b) => a.t - b.t);
  const out = [];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (b.cut) continue;
    const d = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]);
    if (d > maxTravel) out.push(`WORLD CAMERA: flies ${d.toFixed(0)} units between ${a.t}s and ${b.t}s without a cut (a sequence's last move ends after the next one's cut)`);
  }
  return out;
}

/**
 * Every piece of text the 3D world puts on screen, with when it is visible: pinned tags
 * (and their counters) and the words drawn on card faces.
 */
export function worldTexts(plan) {
  const W = plan.world;
  if (!W) return [];
  const out = [];
  (W.tags || []).forEach((tg, i) => out.push({ id: `world tag ${i}`, start: tg.start, end: tg.end, text: tg.text ? [tg.text] : [], counter: tg.counter || null, label: tg.label || null, attribution: !!tg.attribution }));
  for (const o of W.objects || []) {
    if (o.type !== "card" || !o.data) continue;
    const d = o.data;
    const text = [d.title, d.price, d.text, d.sub, ...(d.lines || [])].filter(Boolean).map((x) => String(x).replace(/\n/g, " "));
    if (!text.length) continue;
    const op = o.keys?.opacity || [];
    const on = op.find((k) => k.v > 0.01)?.t ?? (o.keys?.pos?.[0]?.t ?? 0);
    const offK = [...op].reverse().find((k) => k.v <= 0.01 && k.t > on);
    out.push({ id: `world card ${o.id}`, start: on, end: offK ? offK.t : on + 10, text, label: o.label || null });
  }
  return out;
}

/** Every asset id a beat puts on screen: its B-roll, a component's asset or footage, the
 * layers of a depth scene and the items of a collage. The ONE list the provenance, rights,
 * staging and artist checks read, so a new component cannot slip an asset past them. */
export function beatAssets(b) {
  const p = b.graphic?.props || {};
  return [...new Set([b.broll?.asset, p.asset, p.footage, p.bg?.asset, ...(p.layers || []).map((l) => l.asset), ...(p.items || []).map((i) => i.asset), ...(p.extraLayers || []).map((l) => l.asset)].filter(Boolean))];
}

/** The rights marker for an asset used in an internal prototype whose publication rights
 * are not established. A render carrying one is never publication-ready. */
export const UNCLEARED = "PROTOTYPE_ONLY_NOT_CLEARED_FOR_PUBLICATION";
export const isUncleared = (prov) => !!prov && (prov.clearance === UNCLEARED || String(prov.rights || "").includes(UNCLEARED));

/** What a beat's frame is made of, for the coverage report (declared or derived). */
export function mediumOf(b) {
  if (b.medium) return b.medium;
  if (b.scene === "endcard") return "endcard";
  if (b.aroll === "world") return "3d";
  if (b.graphic?.component === "Footage") return b.scene === "cta_tool" ? "calculator" : "ui";
  if (b.aroll === "split") return "hybrid";
  if (b.aroll === "hidden") return b.broll ? "photo" : "2d";
  return "aroll";
}

/**
 * The storyboard gate (founder, 2026-09-25): what makes a storyboard look like "a talking
 * head decorated with templates" is structural, so it is checked before any render. Errors
 * block the render; the coverage numbers are descriptive, never targets.
 */
export function storyboardLint(plan, ctx) {
  const { structure: S, broll = [] } = ctx;
  const beats = plan.beats.filter((b) => b.scene !== "endcard");
  const total = beats.reduce((a, b) => a + (b.end - b.start), 0) || 1;
  const errors = [], warnings = [];
  const cov = {};
  for (const b of beats) cov[mediumOf(b)] = (cov[mediumOf(b)] || 0) + (b.end - b.start);
  const pct = Object.fromEntries(Object.entries(cov).map(([k, v]) => [k, +(100 * v / total).toFixed(1)]));
  // 1. Top/bottom split is not the default grammar.
  const split = beats.filter((b) => b.aroll === "split").reduce((a, b) => a + (b.end - b.start), 0);
  if (split / total > 0.15) errors.push(`${(100 * split / total).toFixed(0)}% of the reel is the top-graphic/bottom-face split: that is the old default grammar (allow at most 15%)`);
  // 2. Text-led scenes in a row read as slides.
  let run = 0;
  for (const b of beats) { run = mediumOf(b) === "2d" ? run + 1 : 0; if (run >= 3) { errors.push(`beats ${b.id - 2}-${b.id} are three text-led scenes in a row`); break; } }
  // 3. Long stretches of only the talking head.
  let s0 = null;
  for (const b of beats) {
    if (mediumOf(b) === "aroll") { s0 ??= b.start; if (b.end - s0 > 16) { warnings.push(`the talking head runs ${(b.end - s0).toFixed(0)}s without a cutaway from ${s0.toFixed(1)}s`); s0 = -1e9; } }
    else s0 = null;
  }
  // 4. A video about a real artist shows the REAL artist: his photograph, as a cut-out in a
  // layered scene, a collage item, a full-frame photo or a photo in the world. A modelled
  // 3D figure never counts (founder, 2026-09-25, reversing the same-day figure rule: a
  // generic model reads as a mannequin, not as Smino; docs/REEL_MEDIA_ARCHITECTURE.md).
  const artistPhotos = broll.filter((x) => S.artist && new RegExp(S.artist.split(/\s+/)[0], "i").test(`${x.shows || ""} ${x.provenance?.source || ""}`)).map((x) => x.id);
  const artistObjs = new Set((plan.world?.objects || []).filter((o) => o.type === "photo" && artistPhotos.includes(o.asset)).map((o) => o.id));
  const usesArtist = (b) => beatAssets(b).some((id) => artistPhotos.includes(id)) || (b.aroll === "world" && (plan.world?.objects || []).some((o) => artistObjs.has(o.id) && visibleIn(o, b)));
  if (artistPhotos.length) {
    const n = beats.filter(usesArtist).length;
    if (!beats.filter((b) => b.start < 1.5).some(usesArtist)) errors.push(`the hook does not show ${S.artist} (his photographs exist in broll/)`);
    if (n < 3 && !plan.prototype) warnings.push(`${S.artist} appears in only ${n} beat(s)`);
  } else if (S.artist && !/^none\b/i.test(S.artist)) warnings.push(`${S.artist} never appears: source real photographs of him (broll/ with provenance), never a modelled figure`);
  // 5. Product and calculator footage own the frame.
  for (const b of beats) if (b.graphic?.props?.footage && b.aroll !== "hidden" && b.aroll !== "world") errors.push(`beat ${b.id} shows product footage over the talking head: the product is the hero when it is the subject`);
  // 6. A long reel with no dimensional scene at all.
  if (!plan.world && total > 90) warnings.push("no 3D world in a reel over 90s");
  return { errors, warnings, coverage: pct, presenterPct: pct.aroll || 0 };
}
function visibleIn(o, b) {
  const op = o.keys?.opacity;
  if (!op?.length) return true;
  const mid = (b.start + b.end) / 2;
  let v = op[0].v;
  for (const k of op) if (k.t <= mid) v = k.v;
  return v > 0.05;
}

export function faceStats(beats) {
  let face = 0, run = 0, maxRun = 0, total = 0;
  for (const b of beats) {
    if (b.scene === "endcard") continue;
    const d = b.end - b.start;
    total += d;
    if (b.aroll !== "hidden" && b.aroll !== "world") { face += d; run = 0; } else { run += d; maxRun = Math.max(maxRun, run); }
  }
  return { ratio: total ? face / total : 1, maxNoFaceRun: maxRun };
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
    // A graphic whose elements land on their own words declares them in textAt
    // ({text, at}); an element is judged at its own time, everything else at the beat start.
    const shownAt = new Map((b.textAt || []).map((x) => [x.text, x.at]));
    for (const txt of b.text || []) {
      const shown = shownAt.has(txt) ? shownAt.get(txt) : b.start;
      for (const t of [...screenNumberTokens(txt), ...lineNumberTokens(txt)]) {
        if (!late.has(t) || !spokenAt.has(t)) continue;
        const at = spokenAt.get(t);
        if (shownAt.has(txt)) {
          if (shown < at - lead) errors.push(`WITHHELD LEAK: beat ${b.id} shows "${txt}" at ${shown.toFixed(2)}s, spoken at ${at.toFixed(2)}s`);
          continue;
        }
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
    const revealAt = S.withheld.revealLine >= 0 ? outWords.find((w) => w.line === S.withheld.revealLine)?.start : null;
    for (const assetId of beatAssets(b)) {
      const sh = sheets.find((s) => s.id === assetId);
      if (sh?.gatedToReveal && revealAt != null && b.start < revealAt - lead) errors.push(`WITHHELD LEAK: beat ${b.id} shows the ${sh.role} sheet at ${b.start}s, before the reveal at ${revealAt.toFixed(2)}s`);
      const br = broll.find((x) => x.id === assetId);
      if (br?.reveals?.length && br.reveals.some((t) => late.has(String(t)) && spokenAt.has(String(t)) && b.start < spokenAt.get(String(t)) - lead)) errors.push(`WITHHELD LEAK: sourced asset ${br.id} reveals a withheld figure before it is spoken`);
    }
  }

  // The 3D camera: a move that is not a declared cut but crosses the world is the bug
  // where one sequence's last move ends after the next sequence's cut, so the camera
  // flies back across the map (found on the first 3D storyboard: two empty scenes).
  errors.push(...worldCameraLint(plan));
  warnings.push(...worldDriftLint(plan));

  // The 3D world's own text (pinned tags, counters, card faces) passes the same gates.
  const worldAt = new Map();
  for (const it of worldTexts(plan)) {
    for (const txt of it.text) {
      for (const t of [...screenNumberTokens(txt), ...lineNumberTokens(txt)]) {
        if (late.has(t) && spokenAt.has(t) && it.start < spokenAt.get(t) - lead) errors.push(`WITHHELD LEAK: ${it.id} shows "${txt}" at ${it.start.toFixed(2)}s, spoken at ${spokenAt.get(t).toFixed(2)}s`);
      }
    }
    if (it.counter) {
      for (const t of screenNumberTokens(`$${it.counter.to}`)) if (late.has(t) && spokenAt.has(t) && it.counter.t1 < spokenAt.get(t) - lead) errors.push(`WITHHELD LEAK: ${it.id} counts to ${it.counter.to} at ${it.counter.t1.toFixed(2)}s, spoken at ${spokenAt.get(t).toFixed(2)}s`);
    }
    worldAt.set(it.id, it);
  }

  // Fact lock: every number on screen traces to this script.
  const parsedLike = { title: S.title, scriptText: S.lines.map((l) => l.text).join("\n"), meta: S.meta };
  const allowed = new Set([...sourceNumberTokens(parsedLike), ...S.lines.flatMap((l) => l.numbers)]);
  for (const b of beats) for (const txt of b.text || []) {
    const bad = malformedNumbers(txt);
    if (bad.length) errors.push(`beat ${b.id}: malformed number in "${txt}"`);
    for (const t of screenNumberTokens(txt)) if (!allowed.has(t) && !(b.scene === "endcard" && t === "128")) errors.push(`FACT LOCK: beat ${b.id} shows ${t} ("${txt}"), which this script never states`);
  }
  for (const it of worldAt.values()) {
    // A photo credit's licence version ("CC BY 4.0") is attribution, not a figure.
    if (!it.attribution) for (const txt of it.text) for (const t of screenNumberTokens(txt)) if (!allowed.has(t)) errors.push(`FACT LOCK: ${it.id} shows ${t} ("${txt}"), which this script never states`);
    // A counter's in-between values are arithmetic between two script numbers.
    if (it.counter) for (const v of [it.counter.from, it.counter.to]) if (v !== 0) for (const t of screenNumberTokens(`$${v}`)) if (!allowed.has(t)) errors.push(`FACT LOCK: ${it.id} counts to ${v}, which this script never states`);
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
    for (const id of beatAssets(b)) {
      const a = known.get(id);
      if (!a) errors.push(`beat ${b.id}: unknown asset "${id}"`);
      else if (!a.provenance?.source) errors.push(`beat ${b.id}: asset "${id}" has no provenance`);
      // Rights: an asset marked uncleared may appear ONLY in a prototype. In a reel that
      // could be published it is an error, not a warning.
      else if (isUncleared(a.provenance)) (plan.prototype ? warnings : errors).push(`RIGHTS: beat ${b.id} uses "${id}", marked ${UNCLEARED}`);
    }
  }

  // CTA and end card. A prototype is a slice of a reel: their absence is reported, not
  // refused (the keyword, when one IS shown, must still match the script).
  const need = plan.prototype ? warnings : errors;
  const kw = beats.filter((b) => b.scene === "cta_keyword");
  if (kw.length > 1 || (kw.length === 0 && !plan.prototype)) errors.push(`expected exactly one cta_keyword beat, found ${kw.length}`);
  else if (kw.length === 0) warnings.push("prototype: no cta_keyword beat");
  else if (kw[0].graphic?.props?.keyword !== S.ctaKeyword) errors.push(`CTA keyword on screen is "${kw[0].graphic?.props?.keyword}", script says "${S.ctaKeyword}"`);
  if (kw[0] && kw[0].end - kw[0].start < 0.8) warnings.push("CTA keyword is on screen under 0.8s");
  const last = beats[beats.length - 1];
  if (last?.scene !== "endcard") need.push(plan.prototype ? "prototype: no 128 end card" : "the last beat is not the 128 end card");
  else if (last.end - last.start < 1.0) errors.push("end card shorter than 1s");

  // Presenter time is DESCRIPTIVE (reported, never a rule): the founder retired the
  // "face on at least half the reel" rule on 2026-09-25 because it forced split screens
  // under visuals that should own the frame. The narrative decides when his face is on.
  const st = faceStats(beats);

  // What he SAID is the editorial timeline. A visual beat may only stand on a line that is
  // in the spoken edit, and on-screen words must be words he actually said near that
  // moment. The written script stays the guardrail for facts, withheld figures, claims and
  // the CTA; it is never the source of what the viewer is shown.
  const spokenLines = spokenLineIds(S, outWords);
  for (const b of beats) {
    if (b.scene === "endcard") continue;
    for (const l of b.lines || []) if (!spokenLines.has(l)) errors.push(`SPOKEN: beat ${b.id} is built on script line ${l}, which is not in the spoken edit`);
  }
  for (const it of worldAt.values()) {
    if (it.label) continue;
    const W = rules.visual.spokenWindowSec;
    for (const txt of it.text) {
      const missing = unspokenWords(txt, outWords, it.start - W, it.end + W, S);
      const total = unspokenWords(txt, [], 0, 0, S).length;
      if (missing.length && missing.length / Math.max(1, total) > 1 / 3) errors.push(`UNSPOKEN: ${it.id} puts "${txt}" on screen, but he never says ${missing.map((m) => `"${m}"`).join(", ")} near it (a structural label sets label: "<why>")`);
    }
  }

  // Structural labels (a withheld placeholder, a SIDENOTE chip, a claim-gated product
  // label, a tool's name) are declared in b.labels and are not speech. Everything else may
  // reword what he said, but a third or more of its content words never said nearby is an
  // unspoken claim: an error.
  for (const b of beats) {
    if (b.scene === "endcard") continue;
    const labels = new Set(b.labels || []);
    for (const txt of b.text || []) {
      if (labels.has(txt)) continue;
      const W = rules.visual.spokenWindowSec;
      // A continued beat (a pacing split holding the same graphic) is judged from where
      // that graphic first appeared.
      let i0 = beats.indexOf(b);
      while (i0 > 0 && beats[i0].continued && beats[i0 - 1].scene === b.scene) i0--;
      const missing = unspokenWords(txt, outWords, beats[i0].start - W, b.end + W, S);
      const total = unspokenWords(txt, [], 0, 0, S).length;
      if (!missing.length) continue;
      const msg = `beat ${b.id} puts "${txt}" on screen, but he never says ${missing.map((m) => `"${m}"`).join(", ")} near it`;
      if (missing.length / Math.max(1, total) > 1 / 3) errors.push(`UNSPOKEN: ${msg} (a product-truth label goes in the beat's labels)`);
      else warnings.push(msg);
    }
  }
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
