// Builds the Premiere cue sheet: for every rendered slide, the words spoken under it.
//
//   node scripts/vsl/cue-sheet.mjs           # writes videos/vsl/CUE-SHEET.md
//
// Three sources, in order of authority:
//   1. The SCRIPT (.rtf in Documents) is what was recorded, and it is the ANSWER: every row quotes
//      a real line from it. Its section headers carry time ranges ("0:40-1:35"), which is the only
//      timing information that exists: the .txt transcripts are one 00:00:00 block.
//   2. The PROMPT SHEET (.md in Downloads) is only a QUERY. Each slide's "Audio starts:" line
//      paraphrases the script, so it is used to find the position, never printed as the answer.
//   3. The DECK module gives the rendered filename, and its headline is the fallback query for a
//      slide whose sheet describes the beat ("Audio idea:") instead of quoting it.
//
// A row is printed only when a real line scores above the floor. Below it the row says so. A
// fabricated cue sends the editor hunting for words that were never recorded, which is worse than
// an honest gap.
import fs from "node:fs";
import path from "node:path";
import { rtfToText, firstWords } from "./lib/rtf.mjs";
import { renderHtml } from "./lib/cueHtml.mjs";

const SHEETS = "C:/Users/Josh/Downloads";
const SCRIPTS = "C:/Users/Josh/Documents";

const DECKS = [
  { id: "vsl-1-fan-worth", title: "VSL #1: How Much Is One Real Fan Actually Worth?",
    sheet: "CRWN_VSL1_Nano_Banana_Prompts.md", script: "How Much Is 1 Fan Worth.rtf",
    audio: "vsl 1 - fan worth.wav" },
  { id: "vsl-2-what-fans-pay-for", title: "VSL #2: What Would Your Fans Actually Pay For?",
    sheet: "CRWN_VSL2_Nano_Banana_Prompts.md", script: "What Would Fans Pay For.rtf",
    audio: "vsl 2 - what fans pay.wav" },
  { id: "vsl-3-first-100-fans", title: "VSL #3: How I'd Launch to Your First 100 Fans",
    sheet: "CRWN_VSL3_Nano_Banana_Prompts.md", script: "How Id Get 100 Fans.rtf",
    audio: "3 - 100 fans.wav" },
  // VSL #4 is the one deck whose sheet describes beats ("Audio idea: Reframe the fear.") instead
  // of quoting the script, on 16 of 17 slides, so nothing can be matched automatically. These
  // overrides are hand-read against the recording: each is a QUERY drawn from the script, so the
  // words printed still come from the script and the mapping stays auditable. Slide 9 is
  // deliberately absent: its beat (the first 30 days is not a giant income number) was never
  // recorded, and inventing a home for it would be the exact failure this file exists to avoid.
  { id: "vsl-4-if-nobody-buys", title: "VSL #4: What Happens If Nobody Buys?",
    sheet: "CRWN_VSL4_Nano_Banana_Prompts.md", script: "What If Nobody Buys.rtf",
    audio: "4 - if nobody buys.wav",
    overrides: {
      2: "What if you spend the time setting up the membership?",
      3: "If nobody buys, there are several possible reasons.",
      4: "Zero paid members tells you there is a problem.",
      5: "This is why I don't think the first launch should be treated like a final exam.",
      6: "If people click but don't buy, that tells you something.",
      7: "CRWN cannot control whether every fan buys.",
      8: "This is also why a meaningful guarantee needs conditions.",
      // Never recorded. The slide argues the first 30 days is not a giant income number, and the
      // script never makes that point. null means "deliberately unmapped": without it the headline
      // fallback handed slide 9 a duplicate of slide 5's line, which reads as an answer.
      9: null,
      10: "So now let's go back to the question from the beginning.",
      11: "For qualified First Revenue Launch artists, CRWN gives you the First Paid Member Guarantee.",
      12: "if the first version fails, we do not simply point at the dashboard",
      13: "It is not an income guarantee.",
      14: "So for CRWN's assisted launch, the basics have to be in place.",
      15: "And that is why the First Revenue Launch is not for everybody.",
      16: "And this matters because the real risk is not simply",
      17: "So if your concern is",
    } },
  { id: "vsl-calculator", title: "Calculator VSL",
    sheet: "CRWN_Calculator_VSL_Nano_Banana_Prompts.md", script: "Calculator VSL.rtf",
    audio: "VSL pt I.wav" },
];

/* ------------------------------------------------------------------ parsing */

/** Slide number -> { cue, verbatim } from a prompt sheet. */
function parseSheet(file) {
  const text = fs.readFileSync(file, "utf8");
  const out = new Map();
  const blocks = text.split(/\n##\s+Slide\s+/i).slice(1);
  for (const block of blocks) {
    const n = parseInt(block, 10);
    if (!Number.isFinite(n)) continue;
    const starts = block.match(/\*\*Audio starts:\*\*\s*([^\n]+)/i);
    const idea = block.match(/\*\*Audio idea:\*\*\s*([^\n]+)/i);
    if (starts) out.set(n, { cue: clean(starts[1]), verbatim: true });
    else if (idea) out.set(n, { cue: clean(idea[1]), verbatim: false });
    else out.set(n, { cue: "", verbatim: false });
  }
  return out;
}

const clean = (s) =>
  s.replace(/[\u201c\u201d"']/g, "").replace(/\u2026/g, "...").replace(/\s+/g, " ").trim();

/** The slide's own headline + subhead: the fallback query when the sheet only describes a beat. */
function slideText(html) {
  const head = html.match(/<div class="head[^"]*"[^>]*>\s*<h1>([\s\S]*?)<\/h1>/);
  const sub = html.match(/<div class="sub[^"]*">([\s\S]*?)<\/div>/);
  const strip = (m) => (m ? m[1].replace(/<[^>]+>/g, " ") : "");
  return clean(strip(head) + " " + strip(sub));
}

/** Narration lines plus the time-range section each one sits in. */
function parseScript(file) {
  const text = rtfToText(file);
  const rows = [];
  let section = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const time = line.match(/(\d{1,2}:\d{2}\s*[-\u2013]\s*\d{1,2}:\d{2})/);
    if (time && line.length < 80) {
      section = time[1].replace(/\s*[-\u2013]\s*/, "-");
      continue;
    }
    if (/^\[/.test(line) || /^#/.test(line)) continue; // stage directions, headers
    // Everything before the first time range is the brief, not the recording: title, target
    // length, primary job, CTA, and the "Curiosity gap:" paragraph. That paragraph summarises the
    // whole video, so it is topical enough to outscore real narration, and it has no section to
    // print. It matched six VSL #4 slides and dragged the cursor backwards past the rest.
    if (!section) continue;
    rows.push({ line, section });
  }
  return rows;
}

/* ------------------------------------------------------------------ matching */

const norm = (s) =>
  s.toLowerCase().replace(/[\u2019']/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Function words carry no locating power: "what happens if you" is four of them, and it is exactly
// why a prefix matcher put VSL #4 slide 1 five minutes late. They still count toward the score, at
// half weight, because dropping them makes a short line like "Now add time." unmatchable.
const STOP = new Set(
  ("a an and are as at be been being but by can could did do does dont for from get got had has have " +
   "how i if in into is it its just like may me more most much my no not of on one or our out so some " +
   "than that the their them then there these they this to too up us was we were what when where " +
   "which who will with would you your").split(" "),
);

/**
 * Score one script line against a query: token overlap, content words double-weighted.
 * This replaces a prefix-backoff ladder that could not survive paraphrase. The sheets quote the
 * script loosely, so "the first N words match exactly" found the wrong line or no line at all.
 */
function score(queryTokens, line) {
  const have = new Set(norm(line).split(" "));
  let got = 0;
  let want = 0;
  let content = 0;
  for (const t of queryTokens) {
    const w = STOP.has(t) ? 1 : 2;
    want += w;
    if (have.has(t)) {
      got += w;
      if (!STOP.has(t)) content++;
    }
  }
  return { ratio: want ? got / want : 0, content };
}

const MIN_RATIO = 0.45;
const MIN_CONTENT = 2;
// These scripts are one sentence per paragraph, so a sheet cue routinely spans several lines:
// "They buy. They subscribe. They show up." is three. Scoring a cue against single lines can never
// match that, so each candidate is also scored against a short run of consecutive lines. The run
// only improves LOCATION; the words printed are always the FIRST line of it, which is the frame
// the editor actually needs.
const WINDOW = 4;

/**
 * Best-scoring script line at or after `from`. Slides and script both run in narrative order, so
 * the forward constraint is real; the whole-script retry exists only for a slide the sheet ordered
 * differently. Among near-ties the EARLIEST line wins, because a phrase that recurs is nearly
 * always being called back to, not forward.
 */
function locate(rows, query, from = 0) {
  const q = norm(query).split(" ").filter(Boolean);
  if (q.length < 2) return null;

  // A cue the script CONTAINS verbatim is the strongest evidence there is, so it bypasses the
  // content-word floor. Without this, three exact quotes were rejected for being short: "Then you
  // have Silver." carries one content word, and the floor cannot tell that apart from a vague
  // paraphrase. Three tokens and at least one content word keeps it from matching on filler.
  const needle = q.join(" ");
  if (q.length >= 3 && q.some((t) => !STOP.has(t))) {
    for (const start of [from, 0]) {
      for (let i = start; i < rows.length; i++) {
        // Across a window too, not just one line: "They buy. They subscribe. They show up." is one
        // cue and three script paragraphs. Checked per line only, it started the slide on the
        // SECOND sentence, because the scorer found a window there that read almost as well.
        const parts = [];
        for (let w = 0; w < WINDOW && i + w < rows.length; w++) parts.push(norm(rows[i + w].line));
        const joined = parts.join(" ");
        const at = joined.indexOf(needle);
        if (at < 0) continue;
        // Report the line the cue STARTS on, not the line the window starts on. Reporting the
        // window start put slide 26 of the calculator deck one paragraph early, on the sentence
        // before its cue, because that line's window happened to contain the cue too.
        let seen = 0;
        for (let w = 0; w < parts.length; w++) {
          const end = seen + parts[w].length;
          if (at <= end) return { row: i + w, adj: 1, ratio: 1, content: q.length };
          seen = end + 1;
        }
        return { row: i, adj: 1, ratio: 1, content: q.length };
      }
      if (start === 0) break;
    }
  }

  for (const start of [from, 0]) {
    let best = null;
    for (let i = start; i < rows.length; i++) {
      // The run must START on a line that has something to do with the cue, or a wide window would
      // drag in a neighbour's words and report a frame the slide has no business sitting on.
      if (score(q, rows[i].line).content < 1) continue;
      let s = null;
      for (let w = 1; w <= WINDOW && i + w <= rows.length; w++) {
        const joined = rows.slice(i, i + w).map((r) => r.line).join(" ");
        const cand = score(q, joined);
        // Recall rises with window size by construction, so a wide window of loosely related lines
        // would always beat an exact single line. It sent slide 1 of VSL #4 to the CTA at the end
        // of the video. Charge each extra line for the recall it buys.
        cand.adj = cand.ratio - 0.06 * (w - 1);
        if (cand.content >= MIN_CONTENT && cand.ratio >= MIN_RATIO) { s = cand; break; }
        s = s && s.adj >= cand.adj ? s : cand;
      }
      if (!s || s.content < MIN_CONTENT || s.ratio < MIN_RATIO) continue;
      if (!best || s.adj > best.adj + 0.05) best = { row: i, adj: s.adj, ratio: s.ratio };
    }
    if (best) return best;
    if (start === 0) break;
  }
  return null;
}

/** Script text as plain ASCII: curly quotes and ellipses out, block quote marks off the ends. */
function plain(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/…/g, "")
    .replace(/^["']+/, "")
    .replace(/["']+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ build */

const lines = [];
const report = [];
lines.push("CRWN VSL CUE SHEET");
lines.push("");
lines.push("For each rendered slide, the words actually spoken under it.");
lines.push("Every line is real recorded narration. A slide whose cue was never recorded says so.");
lines.push("There are no per slide timecodes: the transcripts are one 00:00:00 block, so the cue is the words.");
lines.push("");

let totalSlides = 0;
let matched = 0;
let viaHead = 0;
let unmatched = 0;

for (const deck of DECKS) {
  const rowsOut = [];
  const mod = await import(`./decks/${deck.id}.mjs`);
  const slides = mod.deck.slides;
  const cues = parseSheet(path.join(SHEETS, deck.sheet));
  const rows = parseScript(path.join(SCRIPTS, deck.script));
  let cursor = 0;

  lines.push("");
  lines.push(deck.title.replace(/#/g, "").replace(/\s+/g, " ").trim().toUpperCase());
  lines.push("Audio file: " + deck.audio);
  lines.push("Slide folder: videos/vsl/" + deck.id);
  lines.push("");

  const outOfOrder = [];
  let lastRow = -1;

  for (const slide of slides) {
    totalSlides++;
    const file = deck.id + "-" + String(slide.n).padStart(2, "0") + ".png";
    const entry = cues.get(slide.n);
    const hasOverride = Boolean(deck.overrides) &&
      Object.prototype.hasOwnProperty.call(deck.overrides, slide.n);
    const override = hasOverride ? deck.overrides[slide.n] : undefined;

    // The sheet cue is the better query when it quotes the script. Otherwise fall back to the
    // slide's own headline, which is usually lifted straight from the narration.
    const fromSheet = Boolean(entry && entry.verbatim && entry.cue);
    const query = hasOverride ? override : fromSheet ? entry.cue : slideText(slide.html);
    // An override is hand-placed, so it searches the whole script: the two VSL #4 slides that play
    // EARLIER than their deck position are the point of having overrides at all, and a forward-only
    // cursor would refuse exactly those.
    const hit = query ? locate(rows, query, override ? 0 : cursor) : null;

    if (!hit) {
      const note = entry && entry.cue ? " The sheet asks for: " + plain(entry.cue) : "";
      lines.push(file + ": NOT IN THE RECORDING." + note);
      rowsOut.push({ n: slide.n, file, spoken: null, sheet: entry && entry.cue ? entry.cue : "" });
      unmatched++;
      continue;
    }
    matched++;
    if (!override && !fromSheet) viaHead++;
    if (hit.row < lastRow) outOfOrder.push(slide.n);
    lastRow = hit.row;
    if (!override) cursor = hit.row;
    // The FILENAME is the key, because a file is what gets dragged onto the timeline, and the first
    // few words are a handle to scan for, not the whole sentence. A full sentence is more to read
    // per row without helping anyone find the frame any faster.
    const spoken = firstWords(plain(rows[hit.row].line), 9).replace(/\.\.\.$/, "");
    lines.push(file + ": " + spoken);
    rowsOut.push({ n: slide.n, file, spoken, sheet: "" });
  }
  lines.push("");

  report.push({ id: deck.id, title: deck.title, audio: deck.audio, rows: rowsOut, outOfOrder });

  if (outOfOrder.length) {
    lines.push("");
    lines.push(
      "NOTE: slides " + outOfOrder.join(" and ") + " play out of deck order. The recording says these " +
        "words earlier than the slide number suggests, so place them by the words and not by the " +
        "number. In numeric order they would run against narration about something else.",
    );
    lines.push("");
  }

  lines.push("");
}

lines.push("");
lines.push(
  matched + " of " + totalSlides + " slides located in the recorded narration. " +
    (unmatched ? unmatched + " was never recorded, and says so." : "None are guesses."),
);
lines.push("");

const out = path.join("videos", "vsl", "CUE-SHEET.md");
fs.mkdirSync(path.dirname(out), { recursive: true });
// Never more than one blank line between blocks. The sections each push their own spacing and it
// stacks up, which reads as a gap rather than a separation.
fs.writeFileSync(out, lines.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
// The page is what actually sits open beside Premiere, so it is built from the same pass rather
// than by parsing the markdown back out: re-render a deck, run this once, and both stay true.
fs.writeFileSync(
  path.join("videos", "vsl", "cue-sheet.html"),
  renderHtml(report, { decks: report.length, slides: totalSlides, matched, unmatched }),
  "utf8",
);
console.log(out + ": " + totalSlides + " slides, " + matched + " located (" + viaHead + " via headline), " + unmatched + " not located");
