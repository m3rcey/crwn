// Pure: disk facts in, step statuses out. No fs, no clock, no child processes, so every rule
// here is under test (status.test.mjs). lib/scan.mjs gathers the facts.

export const STATUS = { DONE: "done", PROGRESS: "progress", TODO: "todo", FAILED: "failed", UNKNOWN: "unknown" };

export const CAPTION_LIMIT = 2200;
export const MAX_SHEETS = 5;

// Mirrors section() in generate-fan-economy-carousel.mjs and extractBlock() in
// generate-fan-economy-images.mjs: from the marker to the next "\n---", trimmed.
export function section(md, marker) {
  const idx = md.indexOf(marker);
  if (idx === -1) return null;
  let rest = md.slice(idx + marker.length);
  const end = rest.indexOf("\n---");
  if (end !== -1) rest = rest.slice(0, end);
  return rest.trim();
}

const promptMarker = (sheet) =>
  sheet === 1 ? "**NANO BANANA PRO PROMPT:**" : `**NANO BANANA PRO PROMPT ${sheet}:**`;

// The sheets a script asks for: one per prompt block, the same way the generator decides.
export function promptSheets(scriptText) {
  if (section(scriptText, promptMarker(1)) === null) return [];
  const sheets = [];
  for (let s = 1; s <= MAX_SHEETS; s++) if (section(scriptText, promptMarker(s)) !== null) sheets.push(s);
  return sheets;
}

export const sheetFileName = (slug, sheet) => (sheet === 1 ? `${slug}.jpg` : `${slug}-${sheet}.jpg`);

// build-fan-economy-pdf.mjs names its output CRWN-Fan-Economy-Sheets-<lo>-<hi>.pdf.
export function parsePdfName(name) {
  const m = name.match(/^CRWN-Fan-Economy-Sheets-(\d+)-(\d+)\.pdf$/);
  return m ? { lo: parseInt(m[1], 10), hi: parseInt(m[2], 10) } : null;
}

// Nine known-good transcripts (814 to 822) end 1.9s to 6.4s before the wav does (trailing
// silence, at most 2.4% of the length). Anything further short than this means the run died
// or the JSON belongs to a shorter file.
export function transcriptGapAllowed(durationSec) {
  return Math.max(10, durationSec * 0.05);
}

// "60 tee grizzley vs drake.wav" belongs to script 60. "600 x.wav" does not.
export function leadingNumber(fileName) {
  const m = fileName.match(/^(\d+)(?!\d)/);
  return m ? parseInt(m[1], 10) : null;
}

// A read-only HINT for recordings made before the rename convention. Never a link: which wav
// belongs to which script is Josh's call (spec step 4). Every word of the recording's own name
// (after "New Recording NNN") must appear in the script slug.
const HINT_STOP = new Set(["new", "recording", "vs", "and", "the", "wav"]);
export function recordingMatchesSlug(fileName, slug) {
  const words = fileName
    .toLowerCase()
    .replace(/\.wav$/, "")
    .split(/[^a-z0-9$]+/)
    .filter((w) => w && !/^\d+$/.test(w) && !HINT_STOP.has(w));
  if (!words.length) return false;
  const slugWords = new Set(slug.toLowerCase().split("-"));
  return words.every((w) => slugWords.has(w));
}

// Does what Josh SAID match the linked script? A warning only: delivery drifts from the page.
// Score = share of the transcript's distinct content words that appear in the script's SCRIPT
// section. Measured 2026-09-24 on ten real recordings: 0.77 to 0.90 against their own script,
// never above 0.47 against any other. Under 0.60 is a clear mismatch.
export const MATCH_WARN_BELOW = 0.6;
const MATCH_STOP = new Set(
  "the and that this with you your for are was but not they them what have just like his her its our out all can get got how who why when then than into from about there their were been being will would could should did does done dont cant isnt".split(" "),
);
export function contentWords(text) {
  return new Set(String(text || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !MATCH_STOP.has(w)));
}
export function scriptMatch(transcriptText, ownWords, others) {
  const t = contentWords(transcriptText);
  if (!t.size) return null;
  const score = (s) => [...t].filter((w) => s.has(w)).length / t.size;
  const best = others.map((o) => ({ num: o.num, score: score(o.words) })).sort((a, b) => b.score - a.score)[0] || null;
  return { score: score(ownWords), best };
}

// The scripts a recording's own words name ("New Recording 823 money man.wav" names
// 14-money-man-paid-to-leave). One match is a link (founder call 2026-09-24: the words in the
// name ARE the script's ID); several is a question with those candidates; none is a question.
export function scriptsNamedBy(fileName, scripts) {
  return scripts.filter((s) => recordingMatchesSlug(fileName, s.slug)).map((s) => s.num);
}

const step = (n, name, status, summary, extra = {}) => ({ step: n, name, status, summary, checks: [], ...extra });

function stepIdea(f) {
  return step(1, "Ideas", STATUS.DONE, "A script exists, so its idea was picked.");
}

function stepScript(f) {
  const s = step(2, "Script", STATUS.DONE, f.fileName);
  const hasScript = section(f.scriptText, "**SCRIPT:**") !== null;
  const hasMeta = f.scriptText.includes("**META:**");
  s.checks.push({ ok: hasScript, label: "has a **SCRIPT:** section" });
  s.checks.push({ ok: hasMeta, label: "has a **META:** line" });
  if (!hasScript || !hasMeta) {
    s.status = STATUS.FAILED;
    s.summary = !hasScript ? "No **SCRIPT:** section." : "No **META:** line.";
  }
  s.note = "npm test is the real gate; Studio runs it in Phase 4.";
  return s;
}

function stepImages(f) {
  const wanted = promptSheets(f.scriptText);
  const s = step(3, "Images", STATUS.TODO, "");
  if (!wanted.length) {
    s.summary = "Script has no NANO BANANA PRO PROMPT block yet.";
    return s;
  }
  const present = wanted.filter((n) => f.sheets.present.includes(n));
  const missing = wanted.filter((n) => !f.sheets.present.includes(n));
  for (const n of wanted) s.checks.push({ ok: present.includes(n), label: sheetFileName(f.slug, n) });

  // A video needs exactly the sheets its script prompts for, however many (founder call
  // 2026-09-23: one-sheet videos were made that way and are complete).
  if (!present.length) {
    s.summary = `0 of ${wanted.length} sheets generated.`;
    return s;
  }
  if (missing.length) {
    s.status = STATUS.PROGRESS;
    s.summary = `${present.length} of ${wanted.length} sheets generated.`;
    return s;
  }
  // Done = every prompted sheet exists (founder call 2026-09-23). A PDF is optional: most
  // videos were printed straight from the JPEGs. A PDF that exists but predates a sheet still
  // blocks, because printing it prints a superseded sheet.
  const covering = f.pdfs.filter((p) => p.lo <= f.num && f.num <= p.hi);
  const newestSheet = Math.max(...wanted.map((n) => f.sheets.mtimes[n] || 0));
  const fresh = covering.filter((p) => p.mtime >= newestSheet);
  if (covering.length) {
    s.checks.push({
      ok: fresh.length > 0,
      label: `PDF ${covering.map((p) => p.name).join(", ")} ${fresh.length ? "is newer than every sheet" : "is OLDER than a sheet"}`,
    });
  }
  if (!covering.length) {
    s.status = STATUS.DONE;
    s.summary = `${wanted.length} sheet${wanted.length === 1 ? "" : "s"} (no PDF)`;
  } else if (!fresh.length) {
    s.status = STATUS.PROGRESS;
    s.summary = "A sheet changed after the PDF was built. Rebuild the PDF.";
  } else {
    s.status = STATUS.DONE;
    s.summary = `${wanted.length} sheet${wanted.length === 1 ? "" : "s"} + ${fresh[0].name}`;
  }
  s.note = "Sheet approval is tracked from Phase 3.";
  return s;
}

const MANUAL_TEXT = {
  4: {
    name: "Record",
    next: "Read the SCRIPT section into voice notes. In Adobe Podcast: enhance ~80%, background 10%, music 0%; delete flubbed takes (keep the LAST one); download the wav.",
    lands: "A cleaned wav, ready for FL Studio. Rename it to start with the script number.",
  },
  5: {
    name: "Vocal chain",
    next: "Run the wav through the FL Studio Waves chain (compression, EQ, de-esser, limiter) and export.",
    lands: "Export to <SSD>\\Videos\\2026\\CRWN\\Reels TikTok Shorts\\Hip Hop Industry\\Fan Economy\\ named \"NN <artist words>.wav\".",
  },
  7: {
    name: "Film sheets",
    next: "Print the sheets, film each one on the stand at slowed playback (shift+J x5), shake between sheets.",
  },
  8: {
    name: "Assemble",
    next: "Line up the shakes, trim to the pro audio, music bed with the hook beat drop + riser, app overlay on the CRWN plug, calculator clip on \"I built a free...\".",
  },
};

function stepManual(n, f) {
  const t = MANUAL_TEXT[n];
  const mark = f.manual?.[n];
  return step(n, t.name, mark?.done ? STATUS.DONE : STATUS.TODO, mark?.done ? `Marked done ${mark.at.slice(0, 10)}` : "Not marked done.", {
    manual: true,
    next: t.next,
    ...(t.lands ? { lands: t.lands } : {}),
  });
}

function stepChop(f) {
  const r = f.recording;
  const s = step(6, "Chop silences", STATUS.TODO, "");
  if (r.ssdError) {
    s.status = STATUS.UNKNOWN;
    s.summary = `Can't read the SSD: ${r.ssdError}`;
    return s;
  }
  if (r.conflicts.length > 1) {
    s.status = STATUS.FAILED;
    s.summary = `${r.conflicts.length} wavs claim script ${f.num}. Keep one.`;
    s.checks = r.conflicts.map((p) => ({ ok: false, label: p }));
    return s;
  }
  if (!r.linked) {
    s.summary = "No recording linked.";
    s.candidates = r.candidates;
    s.stage = "link";
    return s;
  }
  if (!r.linked.exists) {
    s.status = STATUS.FAILED;
    s.summary = `Linked wav is missing: ${r.linked.wav}`;
    return s;
  }

  // `stage` tells the page which single action is next: transcribe, split or place.
  const t = transcriptCheck(r.json, r.duration, r.durationError);
  s.checks.push(...t.checks);
  if (t.state === "missing") {
    s.status = STATUS.PROGRESS;
    s.summary = "Recording linked, not transcribed yet.";
    s.stage = "transcribe";
    return s;
  }
  if (t.state === "unknown") {
    s.status = STATUS.UNKNOWN;
    s.summary = t.summary;
    return s;
  }
  if (t.state === "broken") {
    s.status = STATUS.FAILED;
    s.summary = t.summary;
    s.stage = "transcribe";
    return s;
  }

  const m = r.scriptMatch;
  if (m && m.score < MATCH_WARN_BELOW) {
    const alt = m.best && m.best.score > m.score ? ` It sounds more like script ${m.best.num} (${Math.round(m.best.score * 100)}%).` : "";
    s.warnings = [`What you said matches this script only ${Math.round(m.score * 100)}% (recordings of the right script run 77-90%). Check the recording is linked to the right video.${alt}`];
  }

  s.checks.push({ ok: r.jsxExists, label: "_overlap_phrases.jsx exists" });
  if (!r.jsxExists) {
    s.status = STATUS.PROGRESS;
    s.summary = "Transcribed, not split yet.";
    s.stage = "split";
    return s;
  }
  // A saved record only counts for the JSX it was made from. A JSX rewritten since then
  // (a re-split, a hand edit) has no checks and no placement until it earns them again.
  const split = r.split && r.split.jsxMtime === r.jsxMtime ? r.split : null;
  if (split) {
    s.checks.push(...split.checks);
    if (!split.ok) {
      s.status = STATUS.FAILED;
      s.summary = "The split failed its checks. It is blocked from Premiere.";
      s.stage = "split";
      return s;
    }
  } else {
    s.checks.push({ ok: true, label: "split outside Studio (its checks weren't recorded)" });
  }

  const placement = r.placement && r.placement.jsxMtime === r.jsxMtime ? r.placement : null;
  if (!placement) {
    s.status = STATUS.PROGRESS;
    s.summary = "Split. Not placed in Premiere yet.";
    s.stage = "place";
    return s;
  }
  if (placement.by === "hand") {
    s.checks.push({ ok: true, label: `placed by hand (marked ${placement.at.slice(0, 10)})` });
  } else if (placement.placed == null) {
    // The bridge ran but nothing came back: the clips may well be on the timeline.
    s.status = STATUS.PROGRESS;
    s.summary = "Premiere didn't report the result. Check the timeline; if the clips are there, tick \"I placed this JSX by hand\", or place again.";
    s.stage = "place";
    return s;
  } else {
    s.checks.push({
      ok: placement.ok,
      label: `Premiere: Placed ${placement.placed ?? "?"} of ${placement.total ?? "?"}, Failed ${placement.failed ?? "?"}`,
    });
    const sp = placement.spacing;
    if (sp?.landmarks) {
      const f = (n) => `${n > 0 ? "+" : ""}${n} frames`;
      const lm = (key, what, gap) => {
        const l = sp.landmarks[key];
        s.checks.push({
          ok: !!l,
          label: l ? `${what} (phrase ${l.phrase}, "${l.text}"): ${gap}` : `${what}: not found in the recording, so that gap got the normal ${f(sp.gapFrames)}`,
        });
      };
      lm("hook", "after the hook", `${sp.hookSilenceSec}s of silence`);
      lm("cta", "before the CTA", f(sp.ctaGapFrames));
      lm("last", "before the last line", f(sp.lastLineGapFrames));
      s.checks.push({
        ok: true,
        label: `every other gap ${f(sp.gapFrames)}${placement.clamped ? ` (${placement.clamped} held back to avoid overlapping their own track)` : ""}`,
      });
    }
  }
  if (!placement.ok) {
    s.status = STATUS.FAILED;
    s.summary = "Placement in Premiere reported a problem.";
    s.stage = "place";
    s.message = placement.message;
    return s;
  }
  s.status = STATUS.DONE;
  s.summary = "Transcribed, split and placed.";
  s.stage = "done";
  return s;
}

// The spec's transcript checks: the JSON parses, has segments and language, and its last
// segment ends near the wav's end. `broken` means a rerun must move the JSON aside first.
export function transcriptCheck(j, duration, durationError) {
  const checks = [{ ok: !!j?.exists, label: "transcript JSON exists" }];
  if (!j?.exists) return { state: "missing", checks };
  if (j.parseError) {
    checks.push({ ok: false, label: "JSON parses" });
    return { state: "broken", checks, summary: `Transcript JSON doesn't parse: ${j.parseError}` };
  }
  const shapeOk = j.hasSegments && j.hasLanguage && j.segmentCount > 0;
  checks.push({ ok: shapeOk, label: `has "segments" and "language"${j.segmentCount != null ? ` (${j.segmentCount} segments)` : ""}` });
  if (!shapeOk) return { state: "broken", checks, summary: "Transcript JSON is missing segments or language." };
  if (duration == null) {
    return { state: "unknown", checks, summary: `Couldn't read the wav's duration${durationError ? `: ${durationError}` : ""}.` };
  }
  const gap = duration - j.lastEnd;
  const allowed = transcriptGapAllowed(duration);
  const complete = gap <= allowed;
  checks.push({ ok: complete, label: `last segment ends ${gap.toFixed(1)}s before the wav's end (${duration.toFixed(1)}s; allowed ${allowed.toFixed(1)}s)` });
  if (!complete) return { state: "broken", checks, summary: "Transcript stops well before the audio does. The run probably died." };
  return { state: "complete", checks };
}

function stepCaption(f) {
  const s = step(9, "Caption", STATUS.TODO, "");
  if (!f.carousel) {
    // Videos posted before carousels existed can never be proven by a file, so Josh's check
    // mark stands in. It only counts while there is NO carousel file: once one exists, its
    // own checks (length, caption.md in sync) decide, and a stale caption can't hide.
    const mark = f.manual?.[9];
    s.captionOverride = true;
    if (mark?.done) {
      s.status = STATUS.DONE;
      s.summary = `Posted without a carousel file (marked ${mark.at.slice(0, 10)}).`;
      s.overridden = true;
    } else {
      s.summary = "No carousel file yet.";
    }
    return s;
  }
  const caption = section(f.carousel.text, "**CAPTION:**");
  s.checks.push({ ok: caption !== null, label: `${f.carousel.fileName} has a **CAPTION:** block` });
  if (caption === null) {
    s.status = STATUS.FAILED;
    s.summary = "Carousel file has no **CAPTION:** block.";
    return s;
  }
  // .length counts UTF-16 units, the same way the generator counts against Instagram's limit.
  const within = caption.length <= CAPTION_LIMIT;
  s.checks.push({ ok: within, label: `${caption.length} of ${CAPTION_LIMIT} characters` });
  if (!within) {
    s.status = STATUS.FAILED;
    s.summary = `Caption is ${caption.length - CAPTION_LIMIT} characters over Instagram's limit.`;
    return s;
  }
  const d = f.captionMd;
  s.checks.push({ ok: d.exists, label: "derived caption.md exists" });
  if (!d.exists) {
    s.status = STATUS.PROGRESS;
    s.summary = "Caption written; generator hasn't produced caption.md yet.";
    return s;
  }
  // The generator writes caption + "\n".
  const matches = d.text === caption + "\n";
  s.checks.push({ ok: matches, label: "caption.md matches the source CAPTION block" });
  if (!matches) {
    s.status = STATUS.FAILED;
    s.summary = "caption.md is stale: it differs from the CAPTION block. Rerun the generator.";
    return s;
  }
  s.status = STATUS.DONE;
  s.summary = `${caption.length} characters, caption.md in sync.`;
  s.slides = f.slides;
  return s;
}

export function videoStatus(f) {
  const steps = [
    stepIdea(f),
    stepScript(f),
    stepImages(f),
    stepManual(4, f),
    stepManual(5, f),
    stepChop(f),
    stepManual(7, f),
    stepManual(8, f),
    stepCaption(f),
  ];
  const current = steps.find((s) => s.status !== STATUS.DONE) || null;
  return { num: f.num, slug: f.slug, steps, current: current ? current.step : null };
}

// Numbers between 1 and the highest script with no script file. Shown as gaps, never as rows.
export function numberGaps(nums) {
  if (!nums.length) return [];
  const have = new Set(nums);
  const gaps = [];
  for (let n = 1; n <= Math.max(...nums); n++) if (!have.has(n)) gaps.push(n);
  return gaps;
}
