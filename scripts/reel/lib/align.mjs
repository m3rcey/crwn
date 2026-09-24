// Script alignment and take selection.
//
// The founder records the whole script in one go, with mistakes, pauses and retakes.
// The canonical script is the reference: every spoken phrase is aligned to where it
// sits in the script, and a retake shows up as the script position jumping BACKWARDS.
// Selection then keeps one monotonic path through time AND script order.
//
//   1. phrases   split the transcript at pauses (rules.takes.phraseGapSec)
//   2. runs      local-align each phrase to the whole script (Smith-Waterman, fuzzy
//                dialect-aware word match, number phrases collapsed to values); what
//                is left over on either side of the best match is aligned again on its
//                own. That leftover is where false starts live.
//   3. pieces    runs cut at script-line boundaries
//   4. path      weighted DP over pieces: strictly increasing in time and in script
//                position, a piece may be trimmed where the next one restarts, a
//                continuous take earns a bonus (fewer jump cuts), and a LATER complete
//                take wins a near-tie (the founder's rule: the last one is the one he
//                got right).
//
// Pure: no fs, no clock. Everything here is under test (align.test.mjs).

import { spokenNumbers } from "./numberWords.mjs";

// Dialect and contraction equivalents. The script's spelling is what captions show; the
// transcript's spelling is only evidence of what was said.
const SYN_GROUPS = [
  ["ya", "you", "your", "youre", "yall"],
  ["gon", "gonna", "going", "gone"],
  ["aint", "isnt", "is", "not", "arent", "havent"],
  ["dont", "doesnt", "do"],
  ["cause", "because", "cuz", "coz", "cos"],
  ["em", "them", "dem"],
  ["they", "their", "theyre", "there"],
  ["wit", "with"],
  ["tryna", "trying"],
  ["lil", "little"],
  ["imma", "im", "i"],
  ["nothin", "nothing"],
  ["somethin", "something"],
  ["bout", "about"],
  ["ok", "okay"],
  ["and", "an", "&", "n"],
  ["percent", "%"],
  ["letcha", "let", "your"],
  ["gotta", "got"],
  ["wanna", "want"],
  ["whole", "hole"],
  ["crwn", "crown", "curwin", "cron"],
];
const SYN = new Map();
for (const g of SYN_GROUPS) for (const w of g) SYN.set(w, new Set([...(SYN.get(w) || []), ...g]));

export function norm(t) {
  return String(t).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9$%&.]/g, "").replace(/^\$|[.]+$/g, "").replace(/,/g, "");
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** Word similarity in [0,1]. Numbers only match by value. */
export function sim(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const na = /^#/.test(a), nb = /^#/.test(b);
  if (na || nb) return na && nb && a === b ? 1 : 0;
  if (SYN.get(a)?.has(b)) return 0.92;
  const L = Math.max(a.length, b.length);
  if (Math.min(a.length, b.length) < 3) return 0;
  // A truncated word ("gon" for "gonna", "griz" for "grizzley") is a partial match.
  if (b.startsWith(a) || a.startsWith(b)) return Math.min(a.length, b.length) >= 4 ? 0.8 : 0.6;
  return 1 - lev(a, b) / L;
}

/** Words -> tokens, collapsing number phrases ("1 million", "one million", "$1,000,000")
 * into one "#1000000" token that remembers which source words it spans. Hyphenated
 * words split ("Share-to-Earn" vs "share to earn"). */
export function tokenize(words) {
  // Expand hyphens first, remembering the source word index.
  const parts = [];
  words.forEach((w, wi) => {
    const text = String(w.text ?? w);
    const segs = /\d/.test(text) ? [text] : text.split(/[-–]/).filter(Boolean);
    for (const s of segs) parts.push({ text: s, wi });
  });
  const out = [];
  let k = 0;
  while (k < parts.length) {
    // Try the longest number phrase starting here (max 8 parts).
    let taken = 0, value = null;
    for (let len = Math.min(8, parts.length - k); len >= 1; len--) {
      const chunk = parts.slice(k, k + len).map((p) => p.text).join(" ");
      const v = numberValue(chunk);
      if (v !== null) { taken = len; value = v; break; }
    }
    if (taken) {
      out.push({ n: `#${value}`, from: parts[k].wi, to: parts[k + taken - 1].wi });
      k += taken;
      continue;
    }
    const n = norm(parts[k].text);
    if (n) out.push({ n, from: parts[k].wi, to: parts[k].wi });
    k++;
  }
  return out;
}

const SCALE = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 };
/** Value of a WHOLE chunk if the chunk is exactly one number phrase, else null. */
export function numberValue(chunk) {
  const c = chunk.trim().replace(/[.,;:!?]+$/, "");
  let m = c.match(/^\$?(\d[\d,]*(?:\.\d+)?)(?:\s*(k|m|b|thousand|million|billion))?%?$/i);
  if (m) {
    const base = parseFloat(m[1].replace(/,/g, ""));
    const mult = m[2] ? SCALE[m[2].toLowerCase()] : 1;
    return Math.round(base * mult * 100) / 100;
  }
  // Spoken: the whole chunk must be one spoken number (and a bare small number counts
  // here: the alignment is matching words, not deciding what goes on screen).
  if (!/^[a-z\s-]+$/i.test(c) || /^(a|and|half)$/i.test(c)) return null;
  const found = spokenNumbers(`${c} dollars`);
  if (found.length === 1 && found[0].raw.length === c.length) return found[0].value;
  return null;
}

/** Script -> flat token list with line ids and display-word ids. */
export function scriptTokens(structure) {
  const toks = [];
  for (const line of structure.lines) {
    const words = line.words.map((text, wi) => ({ text, wi }));
    for (const t of tokenize(words)) toks.push({ n: t.n, line: line.id, wFrom: t.from, wTo: t.to });
  }
  return toks;
}

/** Transcript -> phrases (arrays of word indices) split at pauses and audio events. */
export function phrases(words, gapSec) {
  const out = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.type === "event") { if (cur.length) out.push(cur); cur = []; continue; }
    if (cur.length && w.start - words[cur[cur.length - 1]].end >= gapSec) { out.push(cur); cur = []; }
    cur.push(i);
  }
  if (cur.length) out.push(cur);
  return out;
}

const MATCH = 2, MISMATCH = -1, GAP_T = -1, GAP_S = -1, GAP_FILLER = -0.2;

/** Smith-Waterman: best local alignment of transcript tokens `tt` to script tokens `st`. */
export function localAlign(tt, st, thr) {
  const m = tt.length, n = st.length;
  if (!m || !n) return null;
  const H = new Float32Array((m + 1) * (n + 1));
  const B = new Uint8Array((m + 1) * (n + 1)); // 0 stop, 1 diag, 2 up (skip t), 3 left (skip s)
  let best = 0, bi = 0, bj = 0;
  for (let i = 1; i <= m; i++) {
    const a = tt[i - 1];
    const gapT = a.filler ? GAP_FILLER : GAP_T;
    for (let j = 1; j <= n; j++) {
      const s = sim(a.n, st[j - 1].n);
      const diag = H[(i - 1) * (n + 1) + j - 1] + (s >= thr ? MATCH * s : MISMATCH);
      const up = H[(i - 1) * (n + 1) + j] + gapT;
      const left = H[i * (n + 1) + j - 1] + GAP_S;
      let v = 0, b = 0;
      if (diag > v) { v = diag; b = 1; }
      if (up > v) { v = up; b = 2; }
      if (left > v) { v = left; b = 3; }
      H[i * (n + 1) + j] = v; B[i * (n + 1) + j] = b;
      if (v > best) { best = v; bi = i; bj = j; }
    }
  }
  if (best <= 0) return null;
  const pairs = [];
  let i = bi, j = bj;
  while (i > 0 && j > 0 && B[i * (n + 1) + j] !== 0) {
    const b = B[i * (n + 1) + j];
    if (b === 1) {
      const s = sim(tt[i - 1].n, st[j - 1].n);
      if (s >= thr) pairs.push({ t: i - 1, s: j - 1, sim: s });
      i--; j--;
    } else if (b === 2) i--;
    else j--;
  }
  pairs.reverse();
  if (!pairs.length) return null;
  return { score: best, tFrom: pairs[0].t, tTo: pairs[pairs.length - 1].t, pairs };
}

/**
 * Align the transcript against the script and choose the takes.
 * @param {object} structure parseFanEconomy() output
 * @param {{words: Array<{text:string,start:number,end:number,type:string}>}} transcript
 * @param {object} rules rules.json
 */
export function alignTakes(structure, transcript, rules) {
  const R = rules.takes;
  const words = transcript.words;
  const st = scriptTokens(structure);
  const lineLen = new Map();
  for (const t of st) lineLen.set(t.line, (lineLen.get(t.line) || 0) + 1);

  // Transcript tokens per phrase, each remembering its source word range.
  const runs = [];
  const offscript = [];
  const stutters = [];
  for (const ph of phrases(words, R.phraseGapSec)) {
    const phWords = ph.map((i) => ({ text: words[i].text }));
    const toks = tokenize(phWords).map((t) => ({
      n: t.n,
      w0: ph[t.from],
      w1: ph[t.to],
      filler: ph.slice(t.from, t.to + 1).every((i) => words[i].type === "filler"),
    }));
    alignSpan(toks, 0, toks.length - 1);
  }

  function alignSpan(toks, a, b) {
    if (b < a) return;
    const span = toks.slice(a, b + 1);
    const real = span.filter((t) => !t.filler);
    if (!real.length) return;
    const res = localAlign(span, st, R.minMatchSim);
    const single = real.length === 1 && res && res.pairs.length === 1 && res.pairs[0].sim === 1 && real[0].n.length >= 3;
    const okRun = res && (single || (res.pairs.length >= Math.min(2, real.length) && res.score >= 2.5));
    if (!okRun) {
      // A lone word that repeats the next aligned word is a stutter; anything else that
      // aligns nowhere is off-script (an aside, "wait let me do that again").
      offscript.push({ w0: span[0].w0, w1: span[span.length - 1].w1, text: wordsText(words, span[0].w0, span[span.length - 1].w1) });
      return;
    }
    const tFrom = a + res.tFrom, tTo = a + res.tTo;
    runs.push({
      id: runs.length,
      toks: toks.slice(tFrom, tTo + 1),
      pairs: res.pairs.map((p) => ({ t: p.t - res.tFrom, s: p.s, sim: p.sim })),
      score: res.score,
    });
    // Leftovers either side. A single leftover word that repeats the run's first word is
    // a stutter ("he he went"); longer leftovers are aligned on their own.
    const pre = [a, tFrom - 1], post = [tTo + 1, b];
    if (pre[1] >= pre[0]) {
      const left = toks.slice(pre[0], pre[1] + 1).filter((t) => !t.filler);
      if (left.length === 1 && left[0].n === toks[tFrom].n) stutters.push({ w0: left[0].w0, w1: left[0].w1 });
      else if (left.length >= 2) alignSpan(toks, pre[0], pre[1]);
      else if (left.length === 1) offscript.push({ w0: left[0].w0, w1: left[0].w1, text: wordsText(words, left[0].w0, left[0].w1) });
    }
    if (post[1] >= post[0]) {
      const right = toks.slice(post[0], post[1] + 1).filter((t) => !t.filler);
      if (right.length >= 2) alignSpan(toks, post[0], post[1]);
      else if (right.length === 1) offscript.push({ w0: right[0].w0, w1: right[0].w1, text: wordsText(words, right[0].w0, right[0].w1) });
    }
  }

  // Runs -> pieces at script-line boundaries. Every transcript token inside a run belongs
  // to the line of the nearest matched token before it (after it, at the run start).
  const pieces = [];
  for (const run of runs) {
    const lineOf = new Array(run.toks.length).fill(null);
    const sOf = new Array(run.toks.length).fill(null);
    const simOf = new Array(run.toks.length).fill(0);
    for (const p of run.pairs) { lineOf[p.t] = st[p.s].line; sOf[p.t] = p.s; simOf[p.t] = p.sim; }
    let last = null;
    for (let i = 0; i < lineOf.length; i++) { if (lineOf[i] !== null) last = lineOf[i]; else lineOf[i] = last; }
    let next = null;
    for (let i = lineOf.length - 1; i >= 0; i--) { if (lineOf[i] !== null) next = lineOf[i]; else lineOf[i] = next; }
    let cur = null;
    for (let i = 0; i < run.toks.length; i++) {
      if (!cur || cur.line !== lineOf[i]) {
        cur = { run: run.id, line: lineOf[i], idx: [], order: pieces.length };
        pieces.push(cur);
      }
      cur.idx.push({ tok: run.toks[i], s: sOf[i], sim: simOf[i] });
    }
  }
  for (const p of pieces) finishPiece(p);

  function finishPiece(p) {
    const matched = p.idx.filter((x) => x.s !== null);
    p.sMin = matched.length ? Math.min(...matched.map((x) => x.s)) : Infinity;
    p.sMax = matched.length ? Math.max(...matched.map((x) => x.s)) : -Infinity;
    p.matched = matched.length;
    p.simSum = matched.reduce((a, x) => a + x.sim, 0);
    p.insertions = p.idx.filter((x) => x.s === null && !x.tok.filler).length;
    p.fillers = p.idx.filter((x) => x.s === null && x.tok.filler).length;
    p.w0 = p.idx[0].tok.w0;
    p.w1 = p.idx[p.idx.length - 1].tok.w1;
    p.tStart = words[p.w0].start;
    p.tEnd = words[p.w1].end;
    p.coverage = p.matched / (lineLen.get(p.line) || 1);
  }
  const weight = (p) => p.simSum - 0.7 * p.insertions - 0.1 * p.fillers;

  // Last-take bonus: a piece that no LATER piece re-covers (>= 60% of its script tokens).
  pieces.sort((a, b) => a.tStart - b.tStart || a.order - b.order);
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const own = new Set(p.idx.filter((x) => x.s !== null).map((x) => x.s));
    let recovered = false;
    for (let j = i + 1; j < pieces.length && !recovered; j++) {
      const q = pieces[j];
      if (q.line !== p.line) continue;
      const hit = q.idx.filter((x) => x.s !== null && own.has(x.s)).length;
      if (own.size && hit / own.size >= 0.6) recovered = true;
    }
    p.lastTake = !recovered;
  }

  // Trimmed copy of a piece that stops before script position `cut`.
  function trimmed(p, cut) {
    let k = p.idx.length;
    while (k > 0 && (p.idx[k - 1].s === null || p.idx[k - 1].s >= cut)) k--;
    if (!k) return null;
    const q = { ...p, idx: p.idx.slice(0, k), trimmed: true };
    finishPiece(q);
    return q;
  }

  const n = pieces.length;
  const W = pieces.map((p) => weight(p) + (p.lastTake ? R.lastTakeBonus : 0));
  const f = new Array(n).fill(-Infinity);
  const from = new Array(n).fill(null); // { j, trimmedPiece|null }
  for (let i = 0; i < n; i++) {
    const p = pieces[i];
    if (p.matched === 0) continue;
    f[i] = W[i];
    for (let j = 0; j < i; j++) {
      if (f[j] === -Infinity) continue;
      const q = pieces[j];
      if (q.tEnd > p.tStart + 1e-3) continue;
      const continuous = q.run === p.run && q.order + 1 === p.order ? 0.3 : 0;
      if (q.sMax < p.sMin) {
        const v = f[j] + W[i] + continuous;
        if (v > f[i]) { f[i] = v; from[i] = { j, cut: null }; }
      } else if (q.sMin < p.sMin) {
        const tq = trimmed(q, p.sMin);
        if (!tq) continue;
        const v = f[j] - W[j] + (weight(tq) + (q.lastTake ? R.lastTakeBonus : 0)) + W[i];
        if (v > f[i]) { f[i] = v; from[i] = { j, cut: tq }; }
      }
    }
  }
  let end = -1;
  for (let i = 0; i < n; i++) if (end === -1 || f[i] > f[end]) end = i;
  const chosen = [];
  let replace = null;
  for (let i = end; i !== -1 && i !== null && f[i] !== -Infinity;) {
    chosen.push(replace || pieces[i]);
    const back = from[i];
    if (!back) break;
    replace = back.cut;
    i = back.j;
  }
  chosen.reverse();

  // Gap fill. The recognizer mangles names and figures ("Kate Renata" for Kaytranada);
  // a mangled stretch aligns nowhere and would be cut as off-script, taking real script
  // words with it. When unaligned speech sits between two kept pieces AND the script
  // words between those pieces were never covered, it is those words: keep it. An
  // aside ("hold on, let me do that again") never qualifies, because no script words
  // are missing around it.
  const fills = [];
  const covered = new Set(chosen.flatMap((p) => p.idx.filter((x) => x.s !== null).map((x) => x.s)));
  for (let i = 0; i + 1 < chosen.length; i++) {
    const p = chosen[i], q = chosen[i + 1];
    if (q.w0 - p.w1 < 2) continue;
    let missing = 0;
    for (let k = p.sMax + 1; k < q.sMin; k++) if (!covered.has(k)) missing++;
    if (!missing || q.sMin - p.sMax - 1 > missing) continue;
    const gapWords = [];
    for (let w = p.w1 + 1; w < q.w0; w++) gapWords.push(w);
    const inOff = gapWords.every((w) => offscript.some((o) => w >= o.w0 && w <= o.w1) || words[w].type !== "word");
    const real = gapWords.filter((w) => words[w].type === "word").length;
    if (inOff && real && real <= missing * 2 + 2 && words[q.w0].start - words[p.w1].end < 6) fills.push({ after: p, from: p.w1 + 1, to: q.w0 - 1, line: q.line === p.line ? p.line : p.line });
  }
  const fillSet = new Set(fills.flatMap((f) => { const a = []; for (let w = f.from; w <= f.to; w++) a.push(w); return a; }));

  // Kept words: every word inside a chosen piece, minus stutters, duplicate lead-ins and
  // (optionally) fillers long enough to hear.
  const stutterSet = new Set();
  for (const s of stutters) for (let w = s.w0; w <= s.w1; w++) stutterSet.add(w);
  const kept = [];
  for (const p of chosen) {
    for (let k = 0; k < p.idx.length; k++) {
      const x = p.idx[k];
      const nextMatched = p.idx.slice(k + 1).find((y) => y.s !== null);
      const dupLead = x.s === null && !x.tok.filler && nextMatched && nextMatched.tok.n === x.tok.n;
      for (let w = x.tok.w0; w <= x.tok.w1; w++) {
        const word = words[w];
        let drop = null;
        if (stutterSet.has(w) || dupLead) drop = "stutter";
        else if (x.tok.filler && R.removeFillers && word.end - word.start >= R.minFillerSec) drop = "filler";
        const sTok = x.s !== null ? st[x.s] : null;
        kept.push({ w, line: p.line, s: x.s, sTok, drop, piece: p });
      }
    }
    const f = fills.find((x) => x.after === p);
    if (f) for (let w = f.from; w <= f.to; w++) if (words[w].type === "word") kept.push({ w, line: f.line, s: null, sTok: null, drop: null, piece: p, fill: true });
  }
  kept.sort((a, b) => a.w - b.w);
  const offscriptKept = offscript.filter((o) => { for (let w = o.w0; w <= o.w1; w++) if (fillSet.has(w)) return false; return true; });

  // Per-line report: what was chosen, what was dropped and why.
  const lines = structure.lines.map((l) => {
    const mine = chosen.filter((p) => p.line === l.id);
    const covered = new Set();
    for (const p of mine) for (const x of p.idx) if (x.s !== null) covered.add(x.s);
    const total = lineLen.get(l.id) || 0;
    const coverage = total ? covered.size / total : 0;
    const alternates = pieces.filter((p) => p.line === l.id && !mine.some((m) => m.order === p.order));
    return {
      id: l.id,
      role: l.role,
      text: l.text,
      coverage: +coverage.toFixed(2),
      status: coverage >= 0.8 ? "clean" : coverage >= 0.4 ? "partial" : coverage > 0 ? "weak" : "missing",
      takes: mine.map((p) => ({ start: +p.tStart.toFixed(2), end: +p.tEnd.toFixed(2), coverage: +p.coverage.toFixed(2), trimmed: !!p.trimmed, lastTake: p.lastTake })),
      dropped: alternates.map((p) => ({
        start: +p.tStart.toFixed(2),
        end: +p.tEnd.toFixed(2),
        coverage: +p.coverage.toFixed(2),
        said: wordsText(words, p.w0, p.w1),
        reason: mine.length && mine.some((m) => m.tStart > p.tStart) ? "earlier take (a later take of this line was kept)" : p.coverage < 0.5 ? "abandoned partial take" : "lower-scoring take",
      })),
    };
  });

  const matchedTokens = new Set(chosen.flatMap((p) => p.idx.filter((x) => x.s !== null).map((x) => x.s)));
  return {
    coverage: +(matchedTokens.size / (st.length || 1)).toFixed(3),
    chosen: chosen.map((p) => ({ line: p.line, run: p.run, order: p.order, w0: p.w0, w1: p.w1, tStart: p.tStart, tEnd: p.tEnd, trimmed: !!p.trimmed, coverage: +p.coverage.toFixed(2) })),
    kept,
    lines,
    offscript: offscriptKept,
    filled: fills.map((f) => ({ line: f.line, said: wordsText(words, f.from, f.to) })),
    stutters,
    pieces: pieces.length,
    runs: runs.length,
  };
}

function wordsText(words, a, b) {
  return words.slice(a, b + 1).map((w) => w.text).join(" ");
}

/**
 * Caption words for the kept speech: the SCRIPT's spelling where a word was matched
 * (dialect is preserved: "ya", "they own", "aint"), the transcript's where the founder
 * said something the script does not have. A multi-word number phrase shows once, as
 * the script writes it.
 */
export function captionWords(structure, transcript, alignment) {
  const words = transcript.words;
  const out = [];
  const shownScriptWords = new Set();
  for (const k of alignment.kept) {
    if (k.drop) continue;
    const w = words[k.w];
    let text;
    let lineId = k.line;
    let scriptWord = null;
    if (k.sTok) {
      const line = structure.lines[k.sTok.line];
      const key = `${line.id}:${k.sTok.wFrom}`;
      if (shownScriptWords.has(key)) {
        // Second transcript word of the same script word/number: extend the previous.
        const prev = out[out.length - 1];
        if (prev) prev.end = w.end;
        continue;
      }
      shownScriptWords.add(key);
      text = line.words.slice(k.sTok.wFrom, k.sTok.wTo + 1).join(" ");
      scriptWord = { line: line.id, from: k.sTok.wFrom, to: k.sTok.wTo };
    } else {
      text = w.text;
    }
    out.push({ text, start: w.start, end: w.end, line: lineId, scriptWord, src: k.w });
  }
  return out;
}
