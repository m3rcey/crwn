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

  // Two shapes are legal (generator header): 4 sheets for videos 1 to 9, 5 from then on.
  const shapeOk = wanted.length >= 4;
  s.checks.push({ ok: shapeOk, label: `script has prompts for ${wanted.length} sheet(s) (a video needs 5; the old shape is 4)` });

  if (!present.length) {
    s.summary = `0 of ${wanted.length} sheets generated.`;
    return s;
  }
  if (missing.length) {
    s.status = STATUS.PROGRESS;
    s.summary = `${present.length} of ${wanted.length} sheets generated.`;
    return s;
  }
  if (!shapeOk) {
    s.status = STATUS.PROGRESS;
    s.summary = `The script only has prompts for ${wanted.length} sheet${wanted.length === 1 ? "" : "s"} (all generated). A video needs 5.`;
    return s;
  }

  const covering = f.pdfs.filter((p) => p.lo <= f.num && f.num <= p.hi);
  const newestSheet = Math.max(...wanted.map((n) => f.sheets.mtimes[n] || 0));
  const fresh = covering.filter((p) => p.mtime >= newestSheet);
  s.checks.push({
    ok: fresh.length > 0,
    label: covering.length
      ? `PDF ${covering.map((p) => p.name).join(", ")} ${fresh.length ? "is newer than every sheet" : "is OLDER than a sheet"}`
      : "a PDF covering this video exists",
  });
  if (!covering.length) {
    s.status = STATUS.PROGRESS;
    s.summary = `All ${wanted.length} sheets exist. No PDF yet.`;
  } else if (!fresh.length) {
    s.status = STATUS.PROGRESS;
    s.summary = "A sheet changed after the PDF was built. Rebuild the PDF.";
  } else {
    s.status = STATUS.DONE;
    s.summary = `${wanted.length} sheets + ${fresh[0].name}`;
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
    next: "Print the PDF, film each sheet on the stand at slowed playback (shift+J x5), shake between sheets.",
    lands: "Camera clips (their folder on the SSD is not specified yet).",
  },
  8: {
    name: "Assemble",
    next: "Line up the shakes, trim to the pro audio, music bed with the hook beat drop + riser, app overlay on the CRWN plug, calculator clip on \"I built a free...\".",
    lands: "The finished edit in Premiere (export location not specified yet).",
  },
};

function stepManual(n, f) {
  const t = MANUAL_TEXT[n];
  const mark = f.manual?.[n];
  return step(n, t.name, mark?.done ? STATUS.DONE : STATUS.TODO, mark?.done ? `Marked done ${mark.at.slice(0, 10)}` : "Not marked done.", {
    manual: true,
    next: t.next,
    lands: t.lands,
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
    return s;
  }
  if (!r.linked.exists) {
    s.status = STATUS.FAILED;
    s.summary = `Linked wav is missing: ${r.linked.wav}`;
    return s;
  }

  const j = r.json;
  s.checks.push({ ok: j.exists, label: "transcript JSON exists" });
  if (!j.exists) {
    s.status = STATUS.PROGRESS;
    s.summary = "Recording linked, not transcribed yet.";
    return s;
  }
  if (j.parseError) {
    s.status = STATUS.FAILED;
    s.summary = `Transcript JSON doesn't parse: ${j.parseError}`;
    s.checks.push({ ok: false, label: "JSON parses" });
    return s;
  }
  const shapeOk = j.hasSegments && j.hasLanguage && j.segmentCount > 0;
  s.checks.push({ ok: shapeOk, label: `has "segments" and "language"${j.segmentCount != null ? ` (${j.segmentCount} segments)` : ""}` });
  if (!shapeOk) {
    s.status = STATUS.FAILED;
    s.summary = "Transcript JSON is missing segments or language.";
    return s;
  }
  if (r.duration == null) {
    s.status = STATUS.UNKNOWN;
    s.summary = `Couldn't read the wav's duration${r.durationError ? `: ${r.durationError}` : ""}.`;
    return s;
  }
  const gap = r.duration - j.lastEnd;
  const allowed = transcriptGapAllowed(r.duration);
  const complete = gap <= allowed;
  s.checks.push({
    ok: complete,
    label: `last segment ends ${gap.toFixed(1)}s before the wav's end (${r.duration.toFixed(1)}s; allowed ${allowed.toFixed(1)}s)`,
  });
  if (!complete) {
    s.status = STATUS.FAILED;
    s.summary = "Transcript stops well before the audio does. The run probably died.";
    return s;
  }
  s.checks.push({ ok: r.jsxExists, label: "_overlap_phrases.jsx exists" });
  if (!r.jsxExists) {
    s.status = STATUS.PROGRESS;
    s.summary = "Transcribed, not split yet.";
    return s;
  }
  s.status = STATUS.DONE;
  s.summary = "Transcribed and split.";
  s.note = "Premiere placement is tracked from Phase 2.";
  return s;
}

function stepCaption(f) {
  const s = step(9, "Caption", STATUS.TODO, "");
  if (!f.carousel) {
    s.summary = "No carousel file yet.";
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
