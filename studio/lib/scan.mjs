// Gathers disk facts for lib/status.mjs. Read-only: nothing here writes anywhere.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PATHS, SSD_FOLDERS } from "./config.mjs";
import { isMount } from "./ssd.mjs";
import { leadingNumber, parsePdfName, recordingMatchesSlug, MAX_SHEETS, sheetFileName } from "./status.mjs";

const listDir = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return null;
  }
};
const statOrNull = (p) => {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
};
const readOrNull = (p) => {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
};

// ffprobe is the slow part (it reads the wav header over the drvfs mount), so cache by
// path + size + mtime. A replaced wav changes size or mtime and is probed again.
const durationCache = new Map();
function wavDuration(p, st) {
  const key = `${p}|${st.size}|${st.mtimeMs}`;
  if (durationCache.has(key)) return durationCache.get(key);
  let result;
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], {
      encoding: "utf-8",
      timeout: 20000,
    });
    const d = parseFloat(out.trim());
    result = Number.isFinite(d) ? { duration: d } : { error: `ffprobe said "${out.trim()}"` };
  } catch (e) {
    result = { error: e.message.split("\n")[0] };
  }
  durationCache.set(key, result);
  return result;
}

function readTranscript(jsonPath) {
  const text = readOrNull(jsonPath);
  if (text === null) return { exists: false };
  try {
    const j = JSON.parse(text);
    const segs = Array.isArray(j.segments) ? j.segments : null;
    return {
      exists: true,
      hasSegments: !!segs,
      hasLanguage: typeof j.language === "string" && j.language.length > 0,
      segmentCount: segs ? segs.length : null,
      lastEnd: segs && segs.length ? Number(segs[segs.length - 1].end) : null,
    };
  } catch (e) {
    return { exists: true, parseError: e.message };
  }
}

function listWavs(dir) {
  return (listDir(dir) || []).filter((f) => /\.wav$/i.test(f) && !f.includes("_timeline_render"));
}

export function scanAll({ ssd, state }) {
  const scriptFiles = (listDir(PATHS.scripts) || [])
    .filter((f) => /^\d+-.*\.md$/.test(f))
    .map((f) => ({ num: parseInt(f, 10), fileName: f, slug: f.replace(/\.md$/, "") }))
    .sort((a, b) => a.num - b.num);

  // Dropbox: one listing for every sheet and PDF.
  const sheetDir = listDir(PATHS.sheets) || [];
  const sheetSet = new Set(sheetDir);
  const pdfs = sheetDir
    .map((name) => ({ name, range: parsePdfName(name) }))
    .filter((p) => p.range)
    .map((p) => ({ name: p.name, ...p.range, mtime: statOrNull(path.join(PATHS.sheets, p.name))?.mtimeMs || 0 }));

  const carouselFiles = (listDir(PATHS.carousels) || []).filter((f) => /^\d+-.*\.md$/.test(f));

  // SSD: the Fan Economy folder is where new recordings live; the rest are history, read only
  // to offer a hint for recordings made before the rename convention.
  let ssdError = ssd.root ? null : ssd.error;
  if (ssd.root && !isMount(ssd.root)) ssdError = `${ssd.root} is no longer mounted.`;
  const fanDir = ssd.root ? path.join(ssd.root, SSD_FOLDERS.fanEconomy) : null;
  const fanDirExists = !!(fanDir && !ssdError && statOrNull(fanDir)?.isDirectory());
  const fanWavs = fanDirExists ? listWavs(fanDir) : [];
  const historyWavs = ssdError
    ? []
    : SSD_FOLDERS.history.flatMap((rel) => listWavs(path.join(ssd.root, rel)).map((f) => ({ rel, f })));

  const videos = scriptFiles.map((sf) => {
    const scriptText = readOrNull(path.join(PATHS.scripts, sf.fileName)) || "";

    const present = [];
    const mtimes = {};
    for (let n = 1; n <= MAX_SHEETS; n++) {
      const name = sheetFileName(sf.slug, n);
      if (sheetSet.has(name)) {
        present.push(n);
        mtimes[n] = statOrNull(path.join(PATHS.sheets, name))?.mtimeMs || 0;
      }
    }

    // Recording: an explicit link in state wins; otherwise a wav in the Fan Economy folder whose
    // name starts with this script number. Two claimants is a conflict, never a pick.
    const recording = { ssdError, conflicts: [], candidates: [], linked: null, fanDir, fanDirExists };
    if (!ssdError) {
      const explicit = state.links?.[sf.num];
      const claimants = explicit
        ? [path.join(ssd.root, explicit.rel)]
        : fanWavs.filter((f) => leadingNumber(f) === sf.num).map((f) => path.join(fanDir, f));
      recording.conflicts = claimants;
      if (claimants.length === 1) {
        const wav = claimants[0];
        const st = statOrNull(wav);
        recording.linked = { wav, exists: !!st, source: explicit ? "linked in Studio" : "Fan Economy folder" };
        if (st) {
          const stem = wav.replace(/\.wav$/i, "");
          const dur = wavDuration(wav, st);
          recording.duration = dur.duration ?? null;
          recording.durationError = dur.error;
          recording.json = readTranscript(`${stem}.json`);
          recording.jsonPath = `${stem}.json`;
          recording.jsxPath = `${stem}_overlap_phrases.jsx`;
          recording.jsxExists = !!statOrNull(recording.jsxPath);
        }
      } else if (!claimants.length) {
        recording.candidates = historyWavs
          .filter(({ f }) => recordingMatchesSlug(f, sf.slug))
          .map(({ rel, f }) => `${rel}/${f}`);
      }
    }

    const carouselName = carouselFiles.find((f) => parseInt(f, 10) === sf.num) || null;
    let carousel = null;
    let captionMd = { exists: false };
    let slides = 0;
    if (carouselName) {
      carousel = { fileName: carouselName, text: readOrNull(path.join(PATHS.carousels, carouselName)) || "" };
      const outDir = path.join(PATHS.carouselOut, carouselName.replace(/\.md$/, ""));
      const outFiles = listDir(outDir) || [];
      const text = outFiles.includes("caption.md") ? readOrNull(path.join(outDir, "caption.md")) : null;
      captionMd = { exists: text !== null, text, path: path.join(outDir, "caption.md") };
      slides = outFiles.filter((f) => /^slide-\d\.jpg$/.test(f)).length;
    }

    return {
      num: sf.num,
      slug: sf.slug,
      fileName: sf.fileName,
      scriptText,
      sheets: { present, mtimes },
      pdfs,
      manual: state.manual?.[sf.num] || {},
      recording,
      carousel,
      captionMd,
      slides,
    };
  });

  return { videos, fanDir, fanDirExists, ssdError };
}
