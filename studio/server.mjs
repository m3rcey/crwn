// CRWN Studio: a local tracker for the filmed short-form video process.
// Run from WSL:  node studio/server.mjs   then open http://127.0.0.1:4717
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { STUDIO_DIR, PATHS, loadConfig } from "./lib/config.mjs";
import { locateSsd } from "./lib/ssd.mjs";
import { readState, setManual, updateState, MARKABLE_STEPS } from "./lib/state.mjs";
import { scanAll } from "./lib/scan.mjs";
import { videoStatus, numberGaps, section } from "./lib/status.mjs";
import { GuardError } from "./lib/guard.mjs";
import { currentJob } from "./lib/jobs.mjs";
import { bridgeStatus, takeNext, finishPlacement, cancelPlacement } from "./lib/bridge.mjs";
import * as act from "./lib/actions.mjs";
import { DEFAULT_SPACING } from "./lib/placement.mjs";

if (process.platform !== "linux") {
  console.error("Run Studio from WSL (node on Linux), not from Windows.");
  process.exit(1);
}

const config = loadConfig();
let ssd = locateSsd(config.ssdLetter);
console.log(ssd.root ? `SSD: ${ssd.root} (${ssd.source})` : `SSD not available: ${ssd.error}`);

// Read on every use, so a config.json edit applies to the next placement without a restart.
const spacingNow = () => ({ ...DEFAULT_SPACING, ...(loadConfig().spacing || {}) });

const PUBLIC = path.join(STUDIO_DIR, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function sendJson(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

// A Fan Economy recording whose words name exactly one script ("New Recording 823 money man")
// is linked to it, and the link is SAVED: a later script sharing those words must not silently
// unlink a recording that was already matched. Two recordings naming one script link neither.
function scan() {
  const facts = scanAll({ ssd, state: readState() });
  const taken = new Set(facts.videos.filter((v) => v.recording.linked || v.recording.conflicts.length).map((v) => v.num));
  const named = facts.recordings.filter((r) => r.fan && r.claimedBy == null && r.namedScripts.length === 1 && !taken.has(r.namedScripts[0]));
  const perScript = new Map();
  for (const r of named) perScript.set(r.namedScripts[0], [...(perScript.get(r.namedScripts[0]) || []), r]);
  const links = [...perScript].filter(([, rs]) => rs.length === 1).map(([num, [r]]) => [num, r.rel]);
  if (!links.length) return facts;
  updateState((s) => {
    for (const [num, rel] of links) s.links[num] = { rel, at: new Date().toISOString(), by: "name" };
  });
  for (const [num, rel] of links) console.log(`Linked ${rel} to script ${num} by its name.`);
  return scanAll({ ssd, state: readState() });
}

function overview() {
  const facts = scan();
  const videos = facts.videos.map((f) => {
    const v = videoStatus(f);
    return { num: v.num, slug: v.slug, current: v.current, steps: v.steps.map((s) => ({ step: s.step, name: s.name, status: s.status, summary: s.summary })) };
  });
  const scripts = new Set(videos.map((v) => v.num));
  return {
    videos,
    gaps: numberGaps(videos.map((v) => v.num)),
    ssd: ssd.root ? { root: ssd.root, letter: ssd.letter, source: ssd.source } : { error: ssd.error },
    ssdError: facts.ssdError,
    fanDir: facts.fanDir,
    fanDirExists: facts.fanDirExists,
    // A recording in the Fan Economy folder that no video holds: the page asks which script it is.
    unassigned: facts.recordings
      .filter((r) => r.fan && r.claimedBy == null && !scripts.has(r.leading))
      .map((r) => ({ name: r.name, candidates: r.namedScripts })),
  };
}

function detail(num) {
  const facts = scan();
  const f = facts.videos.find((v) => v.num === num);
  if (!f) return null;
  const v = videoStatus(f);
  const r = f.recording;
  return {
    ...v,
    fileName: f.fileName,
    scriptSection: section(f.scriptText, "**SCRIPT:**"),
    scriptText: f.scriptText,
    recording: r.linked
      ? {
          wav: r.linked.wav,
          source: r.linked.source,
          inFanDir: r.inFanDir,
          explicit: !!readState().links[num],
          renameTo: r.inFanDir && !r.jsxExists && !r.json?.exists && !path.basename(r.linked.wav).startsWith(`${num} `) ? act.renameTarget(f) : null,
          placedByHand: r.placement?.by === "hand" && r.placement.jsxMtime === r.jsxMtime,
          placeRefusal: v.steps[5].stage === "place" ? act.placeRefusal(r) : null,
          preview: v.steps[5].stage === "place" && !act.placeRefusal(r) ? act.placementPreview(f, spacingNow()) : null,
        }
      : null,
    // What the link picker offers: this video's suggestions first, then everything unclaimed.
    recordings: r.linked ? [] : facts.recordings.filter((x) => x.claimedBy == null),
    files: {
      script: path.join(PATHS.scripts, f.fileName),
      sheetsDir: PATHS.sheets,
      recording: r.linked ? { wav: r.linked.wav, json: r.jsonPath, jsx: r.jsxPath } : null,
      carousel: f.carousel?.fileName || null,
      captionMd: f.captionMd.path || null,
      slides: f.slides,
    },
  };
}

// Browsers let any web page POST to 127.0.0.1. Page writes must come from this page.
function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://${req.headers.host}`;
}

// The Premiere panel sends this header. A web page can't add a custom header to a cross-site
// request without a CORS preflight, and this server never answers one.
const isBridge = (req) => req.headers["x-crwn-bridge"] === "1";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 100_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

// POST /api/videos/:num/<action>
const VIDEO_ACTIONS = {
  manual: (num, body) => {
    if (!MARKABLE_STEPS.includes(body.step)) throw new act.ActionError(`Only steps ${MARKABLE_STEPS.join(", ")} are check marks.`);
    if (!scan().videos.some((v) => v.num === num)) throw new act.ActionError("No such script.");
    setManual(num, body.step, !!body.done);
  },
  link: (num, body) => act.linkRecording(scan(), num, String(body.rel || "")),
  unlink: (num) => act.unlinkRecording(num),
  rename: (num) => act.renameRecording(ssd, scan(), num),
  transcribe: (num) => act.startTranscribe(ssd, scan(), num),
  split: (num) => act.startSplit(ssd, scan(), num),
  place: (num) => act.startPlace(ssd, scan(), num, spacingNow()),
  "placed-by-hand": (num, body) => act.markPlacedByHand(scan(), num, !!body.done),
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    // ---- Premiere panel ----
    if (url.pathname.startsWith("/api/bridge/") && isBridge(req)) {
      if (req.method === "GET" && url.pathname === "/api/bridge/next") {
        const job = takeNext(Date.now(), req.headers["x-crwn-bridge-version"] || null);
        return job ? sendJson(res, 200, job) : (res.writeHead(204), res.end());
      }
      if (req.method === "POST" && url.pathname === "/api/bridge/result") {
        const body = await readBody(req);
        const done = finishPlacement(Number(body.id), { message: body.message, error: body.error });
        if (done) updateState((s) => (s.placements[done.num] = done.record));
        return sendJson(res, 200, { saved: !!done });
      }
    }

    // ---- The page ----
    if (req.method === "GET" && url.pathname === "/api/videos") return sendJson(res, 200, overview());
    if (req.method === "GET" && url.pathname === "/api/activity") return sendJson(res, 200, { job: currentJob(), bridge: bridgeStatus() });

    const m = url.pathname.match(/^\/api\/videos\/(\d+)(?:\/([a-z-]+))?$/);
    if (m && req.method === "GET" && !m[2]) {
      const d = detail(parseInt(m[1], 10));
      return d ? sendJson(res, 200, d) : sendJson(res, 404, { error: "No such script." });
    }
    if (req.method === "POST") {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "Cross-site request refused." });
      if (m && m[2] && VIDEO_ACTIONS[m[2]]) {
        const num = parseInt(m[1], 10);
        VIDEO_ACTIONS[m[2]](num, await readBody(req));
        return sendJson(res, 200, detail(num));
      }
      if (url.pathname === "/api/bridge/cancel") return sendJson(res, 200, { cancelled: !!cancelPlacement() });
      if (url.pathname === "/api/ssd/relocate") {
        ssd = locateSsd(loadConfig().ssdLetter);
        return sendJson(res, 200, overview());
      }
    }

    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = path.resolve(PUBLIC, rel);
      if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file)) return sendJson(res, 404, { error: "Not found." });
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      return fs.createReadStream(file).pipe(res);
    }
    sendJson(res, 404, { error: "Not found." });
  } catch (e) {
    // A refusal (guard, precondition, busy job) is an answer, not a crash.
    const refusal = e instanceof GuardError || /still running|still waiting|Wait for/.test(e.message);
    if (!refusal) console.error(e);
    sendJson(res, refusal ? 409 : 500, { error: e.message });
  }
});

server.listen(config.port, "127.0.0.1", () => console.log(`CRWN Studio on http://127.0.0.1:${config.port}`));
