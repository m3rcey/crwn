// Script structure: turns a Fan Economy script into the editorial skeleton every
// later stage reads (roled lines, the withheld reveal, the CTA, the CRWN detour).
//
// Deterministic on purpose. The series grammar was measured across all 58 scripts
// on 2026-09-24 (see docs/REEL_EDITOR.md, "Editing grammar"): every script has a
// "market FOR fans" CRWN detour, 57 of 58 close it with "ANYWAY.", every script ends
// "Comment KEYWORD", and every META carries withheld variable / big reveal / lead
// magnet / claim tier. Finding those by anchor is exact; asking a model to find them
// is a guess. Reuses scripts/video's parser so META, the CTA cross-check and the
// number tokens are the SAME ones the silent pipeline's fact lock trusts.

import { parseScriptMarkdown, screenNumberTokens, WORD_NUMBERS } from "../../video/lib/scriptParse.mjs";
import { spokenNumbers, spokenNumberTokens, formatFigure } from "./numberWords.mjs";

export const ROLES = [
  "hook", "hook_turn", "setup", "mechanism", "tease",
  "detour_open", "detour_thesis", "detour", "detour_crwn", "detour_close",
  "restate", "reveal", "payoff", "deepen", "qualifier", "question",
  "cta_tool", "cta_keyword",
];

// Words the scriptwriter types in capitals because they ARE capitals, not stress.
const ACRONYMS = new Set([
  "CRWN", "GTA", "NBA", "RP", "EMPIRE", "SAULT", "VIP", "DM", "DMS", "TV", "US", "USA",
  "BRIT", "EP", "LP", "CD", "DJ", "NME", "IG", "OK", "AI", "HER", "H.E.R.", "PARTYNEXTDOOR",
  "GNX", "MF", "BET", "RCA", "UK", "LA", "NYC", "ATL", "SXSW", "NFT", "ID", "CEO", "A&R",
]);

const TURN_RE = /^(let'?s|lets)\s+(find out|see|break it down|run it|talk about it|get into it|look|do the math|check|go)\b/i;
const QUALIFIER_RE = /\b(reported|reportedly|model of|a model|not a measurement|estimate|estimated|to be fair|yours gon be yours|own numbers|his numbers|her numbers|they numbers|self-reported|by (his|her|they|their) own account|dont depend on the exact|approximate)\b/i;
const DEEPEN_RE = /\b(crazy part|sharpest part|real part|here'?s the (crazy|thing)|watch what|but here|and the \d+ aint|aint even the)\b/i;
const TEASE_RE = /(\?|number came back|hard to believe|check it twice|sit back|had to|hold that|before i (say|give)|go guess|you'?ll see|i did not know|still sound)/i;

/** Split SCRIPT text into paragraphs of lines; drops the unspoken end-card line. */
export function scriptLines(scriptText) {
  const paras = scriptText.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const lines = [];
  let endcard = null;
  paras.forEach((p, pi) => {
    for (const raw of p.split("\n")) {
      const text = raw.trim();
      if (!text) continue;
      if (/^128\b/.test(text) || /visual end-card/i.test(text)) {
        endcard = { text: "128", crown: text.includes("👑"), raw: text };
        continue;
      }
      lines.push({ id: lines.length, para: pi, text });
    }
  });
  return { lines, endcard };
}

/** Spoken words of a line, keeping the script's own spelling (dialect is not a typo). */
export function lineWords(text) {
  return text.split(/\s+/).filter(Boolean);
}

/** Capitalised stress words ("paid to LEAVE", "HIS terms"): the scriptwriter's own
 * emphasis markers, which the planner turns into kinetic type. */
export function emphasisWords(text) {
  const out = [];
  for (const w of lineWords(text)) {
    const core = w.replace(/^[^A-Za-z0-9$]+|[^A-Za-z0-9%]+$/g, "");
    if (core.length < 2 || !/[A-Z]/.test(core)) continue;
    if (core !== core.toUpperCase()) continue;
    if (/\d/.test(core) || ACRONYMS.has(core)) continue;
    out.push(core);
  }
  return out;
}

/** Number tokens a line states, digits AND spoken words ("Two million dollars"),
 * normalized the way the fact lock normalizes screen text. */
export function lineNumberTokens(text) {
  return [...new Set([...screenNumberTokens(text), ...spokenNumberTokens(text)])];
}

/** Spoken figure phrases in a line, with the words around them the viewer needs to
 * read the unit ("$250,000 just to walk away", "about 3,000 hours a year"). The
 * qualifier before the number rides along so a modeled or reported figure is never
 * upgraded into a measurement on screen. */
export function figurePhrases(text) {
  const out = [];
  // A figure never starts inside a word ("Tech N9ne" is not a 9) or inside another figure,
  // and its unit tail stops at the next figure, so "$15,000" and "$29.98 to $34.98" stay whole.
  const re = /(\babout\b|\baround\b|\blike\b|\broughly\b|\bapproximately\b|\bover\b|\bnearly\b|\bmore than\b|\bup to\b)?\s*(?<![A-Za-z0-9$.,-])(\$?\d+(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|thousand|[KMB]\b|%)?)(?![A-Za-z0-9])([^.,;:?!$\d]*)/gi;
  for (const m of text.matchAll(re)) {
    const qual = (m[1] || "").trim().toLowerCase();
    const figure = m[2].trim().replace(/[.,]$/, "");
    if (!/\d/.test(figure)) continue;
    const tail = unitTail(m[3]);
    const tokens = screenNumberTokens(figure);
    out.push({ figure, qualifier: qual || null, unit: tail || null, tokens, spoken: false });
  }
  // A spoken figure in a line that already talks in dollars is dollars ("paid $250,000 ...
  // then paid HIM a million").
  const moneyLine = /\$\s?\d/.test(text);
  for (const n of spokenNumbers(text)) {
    const before = text.slice(0, n.start).trim().split(/\s+/).pop()?.toLowerCase() || "";
    const qual = /^(about|around|like|roughly|approximately|over|nearly)$/.test(before) ? before : null;
    const tail = unitTail(text.slice(n.end).replace(/^\s*dollars?\b/i, ""));
    out.push({ figure: formatFigure(n.value, n.money || (moneyLine && n.value >= 100)), qualifier: qual, unit: tail || null, tokens: [String(n.value)], spoken: true, said: n.raw });
  }
  return out;
}

// The unit is the noun phrase right after a figure ("hours a year", "ownership of his
// music"), not the rest of the sentence: stop at a clause word.
const CLAUSE_WORDS = new Set(["while", "and", "but", "so", "which", "because", "then", "when", "if", "that", "who", "where", "cause", "or"]);
function unitTail(rest) {
  const words = String(rest).split(/[.,;:?!]/)[0].trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    if (CLAUSE_WORDS.has(w.toLowerCase()) && out.length) break;
    if (CLAUSE_WORDS.has(w.toLowerCase())) break;
    out.push(w);
    if (out.length === 4) break;
  }
  return out.join(" ");
}

/** Proper names a line mentions mid-sentence ("Cash Money", "Black Circle Family",
 * "EMPIRE"): the planner's name chips. Sentence-initial words and the artist are left
 * out; stress capitals ("LEAVE") are not names. */
export function namedEntities(text, artist = null) {
  const out = [];
  const tokens = text.split(/\s+/);
  let cur = [];
  const flush = () => { if (cur.length) out.push(cur.join(" ")); cur = []; };
  tokens.forEach((raw, i) => {
    const w = raw.replace(/^[^A-Za-z0-9$]+|[^A-Za-z0-9]+$/g, "");
    const prev = tokens[i - 1] || "";
    const sentenceStart = i === 0 || /[.?!:]$/.test(prev);
    const isCap = /^[A-Z][A-Za-z0-9$&'-]*$/.test(w) && !(w.length > 1 && w === w.toUpperCase() && !ACRONYMS.has(w));
    if (w && isCap && !sentenceStart && !/^(I|I'm|I'll)$/.test(w)) cur.push(w);
    else flush();
    if (/[.,;:?!]$/.test(raw)) flush();
  });
  flush();
  const artistWords = new Set(String(artist || "").toLowerCase().split(/[^a-z0-9$]+/).filter(Boolean));
  return [...new Set(out)].filter((n) => !n.toLowerCase().split(/\s+/).every((w) => artistWords.has(w)) && !/^CRWN( app)?$/i.test(n) && n.length > 2);
}

const REVEAL_KINDS = ["money", "time", "scale", "equivalence", "comparison", "concentration", "ltv", "meaning", "count"];
/** META "Big Reveal: money (the reported $200,000 a month)" -> "money". Anything that
 * is not one of the series' reveal kinds is a conceptual reveal. */
export function revealKind(bigReveal) {
  const head = (String(bigReveal).match(/^([a-z/]+)/i) || [])[1]?.toLowerCase() || "";
  const k = head.split("/")[0];
  if (REVEAL_KINDS.includes(k)) return k;
  if (/\$\s?\d/.test(bigReveal)) return "money";
  if (/\d/.test(bigReveal)) return "count";
  return "concept";
}

function firstIndex(lines, pred, from = 0) {
  for (let i = from; i < lines.length; i++) if (pred(lines[i], i)) return i;
  return -1;
}

/** Headline strings the hook sheet letters, read from NANO BANANA PRO PROMPT 1.
 * Those sheets are founder-approved AND contract-tested to withhold the reveal
 * (FE-SKILL-008), so their headline is a reveal-safe short form of the hook. */
export function hookHeadline(markdown) {
  const md = markdown.replace(/\r/g, "");
  const start = md.indexOf("**NANO BANANA PRO PROMPT:**");
  if (start === -1) return null;
  const rest = md.slice(start);
  const end = rest.indexOf("\n---");
  const block = end === -1 ? rest : rest.slice(0, end);
  // The headline is the quoted text in the sentence that introduces "the hook".
  const hookIdx = block.search(/the hook/i);
  if (hookIdx === -1) return null;
  const after = block.slice(hookIdx, hookIdx + 900);
  const firstSentenceEnd = after.search(/\.\s+(Below|Centred|Centered|On the|In the|Under|THE )/);
  const scope = firstSentenceEnd === -1 ? after.slice(0, 500) : after.slice(0, firstSentenceEnd);
  const quotes = [...scope.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim()).filter((q) => q.length > 3);
  return quotes.length ? quotes.slice(0, 2) : null;
}

/**
 * @param {string} markdown full script file
 * @param {{ num?: number, slug?: string }} ids
 */
export function parseFanEconomy(markdown, ids = {}) {
  const parsed = parseScriptMarkdown(markdown);
  const { lines, endcard } = scriptLines(parsed.scriptText);
  const warnings = [...parsed.warnings];
  const n = lines.length;
  const role = new Array(n).fill(null);

  // Hook: everything up to and including the "Let's find out" turn, if it comes in the
  // first two paragraphs; otherwise the first paragraph (the statement hooks, 1-9).
  let turn = firstIndex(lines, (l) => l.para <= 1 && TURN_RE.test(l.text));
  const hookEnd = turn !== -1 ? turn : firstIndex(lines, (l) => l.para > 0) - 1;
  for (let i = 0; i <= hookEnd; i++) role[i] = "hook";
  if (turn !== -1) role[turn] = "hook_turn";

  // CRWN detour: from its short opener ("Hold that thought.", "Real quick.") or the
  // "market FOR fans" line itself, through "ANYWAY.".
  const thesis = firstIndex(lines, (l) => /market FOR fans/i.test(l.text));
  let detourStart = thesis;
  if (thesis > 0) {
    const prev = lines[thesis - 1];
    if (prev.para === lines[thesis].para && lineWords(prev.text).length <= 10 && !/\?$/.test(prev.text)) detourStart = thesis - 1;
  }
  let detourEnd = thesis === -1 ? -1 : firstIndex(lines, (l) => /^ANYWAY\.?$/i.test(l.text.trim()), thesis);
  if (thesis !== -1 && detourEnd === -1) {
    // Script 21 has no ANYWAY: the detour is its paragraph.
    detourEnd = thesis;
    while (detourEnd + 1 < n && lines[detourEnd + 1].para === lines[thesis].para) detourEnd++;
    warnings.push("no ANYWAY line: detour taken as the thesis paragraph");
  }
  if (thesis === -1) warnings.push('no "market FOR fans" line: no CRWN detour found');
  if (thesis !== -1) {
    for (let i = detourStart; i <= detourEnd; i++) role[i] = "detour";
    if (detourStart < thesis) role[detourStart] = "detour_open";
    role[thesis] = "detour_thesis";
    for (let i = thesis; i <= detourEnd; i++) if (/\bCRWN\b/.test(lines[i].text)) role[i] = "detour_crwn";
    if (/^ANYWAY\.?$/i.test(lines[detourEnd].text.trim())) role[detourEnd] = "detour_close";
  }

  // CTA: "I built a free ..." then "Comment KEYWORD ...".
  const kwLine = firstIndex(lines, (l) => /\bcomment\s+["“']?[A-Z]{2,}/i.test(l.text) && /\b(DM|link|send)\b/i.test(l.text));
  let toolLine = firstIndex(lines, (l) => /^I built a free/i.test(l.text));
  if (kwLine === -1) warnings.push("no Comment KEYWORD line found");
  if (toolLine === -1 && kwLine > 0) toolLine = kwLine - 1;
  if (toolLine !== -1) role[toolLine] = "cta_tool";
  if (kwLine !== -1) role[kwLine] = "cta_keyword";
  const ctaStart = toolLine !== -1 ? toolLine : kwLine !== -1 ? kwLine : n;

  // Withheld reveal. Candidates are the META Big Reveal figures plus every figure that
  // is FIRST spoken after the detour; anything already said before the detour is not
  // withheld (Money Man's $250,000 is the hook, not the answer).
  const afterDetour = detourEnd === -1 ? hookEnd + 1 : detourEnd + 1;
  const beforeTokens = new Set();
  for (let i = 0; i < afterDetour && i < n; i++) for (const t of lineNumberTokens(lines[i].text)) beforeTokens.add(t);
  const bigReveal = parsed.meta["big reveal"] || "";
  const metaTokens = screenNumberTokens(bigReveal).filter((t) => t.length > 1 || Number(t) > 12);
  let revealLine = -1;
  // A conceptual reveal ("not one, because no list exists") is found by its words.
  const revealWords = (bigReveal.replace(/^[a-z/]+\s*\(?/i, "").split(/[,(;]/)[0] || "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  if (!metaTokens.length && revealWords.length) {
    for (let i = afterDetour; i < ctaStart && revealLine === -1; i++) {
      if (/\?\s*$/.test(lines[i].text)) continue;
      const lw = new Set(lines[i].text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/));
      const hit = revealWords.filter((w) => lw.has(w)).length;
      if (hit >= Math.min(2, revealWords.length) && hit / revealWords.length >= 0.5) revealLine = i;
    }
  }
  for (let i = afterDetour; i < ctaStart && !(revealLine !== -1 && !metaTokens.length); i++) {
    if (/\?\s*$/.test(lines[i].text)) continue;
    const toks = lineNumberTokens(lines[i].text).filter((t) => !beforeTokens.has(t));
    const hitsMeta = toks.some((t) => metaTokens.includes(t));
    if (hitsMeta || (toks.length && revealLine === -1 && !metaTokens.length)) { revealLine = i; if (hitsMeta) break; }
  }
  if (revealLine === -1) {
    // A reveal written in words ("Two million dollars", "nine") or a conceptual reveal:
    // the first statement after the restated question.
    revealLine = firstIndex(lines, (l, i) => i >= afterDetour && i < ctaStart && !/\?\s*$/.test(l.text));
    if (revealLine !== -1) warnings.push("reveal line found by position, not by a figure: check beats.json");
  }
  const withheldTokens = new Set(metaTokens.filter((t) => !beforeTokens.has(t)));
  if (revealLine !== -1) for (const t of lineNumberTokens(lines[revealLine].text)) if (!beforeTokens.has(t)) withheldTokens.add(t);
  // Every later figure is also unrevealed until its own line: the payoff math.
  const lateTokens = new Set();
  for (let i = afterDetour; i < n; i++) for (const t of lineNumberTokens(lines[i].text)) if (!beforeTokens.has(t)) lateTokens.add(t);

  for (let i = afterDetour; i < (revealLine === -1 ? ctaStart : revealLine); i++) if (!role[i]) role[i] = "restate";
  if (revealLine !== -1) role[revealLine] = "reveal";

  // Body before the detour, and after the reveal.
  const teasePara = detourStart > 0 ? lines[detourStart - 1].para : -1;
  for (let i = hookEnd + 1; i < (detourStart === -1 ? afterDetour : detourStart); i++) {
    if (role[i]) continue;
    role[i] = lines[i].para === teasePara && TEASE_RE.test(lines[i].text) ? "tease" : "setup";
  }
  let deepening = false;
  for (let i = (revealLine === -1 ? afterDetour : revealLine + 1); i < ctaStart; i++) {
    if (role[i]) continue;
    if (DEEPEN_RE.test(lines[i].text)) deepening = true;
    if (QUALIFIER_RE.test(lines[i].text)) role[i] = "qualifier";
    else if (/\?\s*$/.test(lines[i].text)) role[i] = "question";
    else role[i] = deepening ? "deepen" : "payoff";
  }
  // Setup lines after the first "Now ..."/"And here's" turn are the mechanism.
  let mech = false;
  for (let i = hookEnd + 1; i < n; i++) {
    if (role[i] !== "setup") continue;
    if (/^(now|so|and here|here'?s|the thing|cause|because)\b/i.test(lines[i].text) && i > hookEnd + 2) mech = true;
    if (mech) role[i] = "mechanism";
  }
  for (let i = 0; i < n; i++) if (!role[i]) role[i] = "setup";

  const withheld = {
    variable: parsed.meta["withheld variable"] || null,
    bigReveal: bigReveal || null,
    kind: revealKind(bigReveal),
    tokens: [...withheldTokens],
    lateTokens: [...lateTokens],
    revealLine,
  };

  const lm = parsed.meta["lead magnet"] || "";
  const leadMagnet = { slug: (lm.split("+")[0] || "").trim() || null, keyword: parsed.ctaKeyword };
  const toolText = toolLine !== -1 ? lines[toolLine].text : "";
  const named = toolText.match(/free\s+([A-Z][\w-]*(?:\s+[A-Z][\w-]*)*(?:\s+(?:Planner|Calculator|Check|Builder|Test|Generator))?)/);
  const claimText = parsed.meta["crwn claim tier"] || "";
  const claimTier = (claimText.match(/^([A-Za-z]+)/) || [])[1]?.toLowerCase() || null;

  const out = {
    num: ids.num ?? null,
    slug: ids.slug ?? null,
    title: parsed.title,
    artist: parsed.artist,
    family: parsed.family,
    meta: parsed.meta,
    ctaKeyword: parsed.ctaKeyword,
    leadMagnet: { ...leadMagnet, toolName: named ? named[1] : null },
    claim: { tier: claimTier, text: claimText },
    hookHeadline: hookHeadline(markdown),
    endcard: endcard || { text: "128", crown: true, raw: null },
    lines: lines.map((l, i) => ({
      ...l,
      role: role[i],
      words: lineWords(l.text),
      emphasis: emphasisWords(l.text),
      numbers: lineNumberTokens(l.text),
      figures: figurePhrases(l.text),
      names: namedEntities(l.text, parsed.artist),
      mentionsArtist: !!parsed.artist && l.text.toLowerCase().includes(String(parsed.artist).split(/[·(]/)[0].trim().toLowerCase()),
      qualifier: QUALIFIER_RE.test(l.text),
      question: /\?\s*$/.test(l.text),
    })),
    anchors: { hookEnd, turn, detourStart, thesis, detourEnd, revealLine, toolLine, kwLine },
    withheld,
    warnings,
  };
  return out;
}

/** Tokens that must not reach the screen before `line` is spoken. */
export function withheldUntil(structure) {
  const map = {};
  for (const t of structure.withheld.lateTokens) {
    const first = structure.lines.find((l, i) => i > (structure.anchors.detourEnd ?? -1) && l.numbers.includes(t));
    if (first) map[t] = first.id;
  }
  return map;
}

export { WORD_NUMBERS };
