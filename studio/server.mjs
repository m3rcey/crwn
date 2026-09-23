// CRWN Studio: a local tracker for the filmed short-form video process.
// Run from WSL:  node studio/server.mjs   then open http://127.0.0.1:4717
// Phase 1 is read-only apart from the manual step check marks in studio/state.json.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { STUDIO_DIR, PATHS, loadConfig } from "./lib/config.mjs";
import { locateSsd } from "./lib/ssd.mjs";
import { readState, setManual, MANUAL_STEPS } from "./lib/state.mjs";
import { scanAll } from "./lib/scan.mjs";
import { videoStatus, numberGaps, section } from "./lib/status.mjs";

if (!process.cwd().startsWith("/") || process.platform !== "linux") {
  console.error("Run Studio from WSL (node on Linux), not from Windows.");
  process.exit(1);
}

const config = loadConfig();
let ssd = locateSsd(config.ssdLetter);
console.log(ssd.root ? `SSD: ${ssd.root} (${ssd.source})` : `SSD not available: ${ssd.error}`);

const PUBLIC = path.join(STUDIO_DIR, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function sendJson(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const scan = () => scanAll({ ssd, state: readState() });

function overview() {
  const facts = scan();
  const videos = facts.videos.map((f) => {
    const v = videoStatus(f);
    return { num: v.num, slug: v.slug, current: v.current, steps: v.steps.map((s) => ({ step: s.step, name: s.name, status: s.status, summary: s.summary })) };
  });
  return {
    videos,
    gaps: numberGaps(videos.map((v) => v.num)),
    ssd: ssd.root ? { root: ssd.root, letter: ssd.letter, source: ssd.source } : { error: ssd.error },
    ssdError: facts.ssdError,
    fanDir: facts.fanDir,
    fanDirExists: facts.fanDirExists,
  };
}

function detail(num) {
  const facts = scan();
  const f = facts.videos.find((v) => v.num === num);
  if (!f) return null;
  const v = videoStatus(f);
  return {
    ...v,
    fileName: f.fileName,
    scriptSection: section(f.scriptText, "**SCRIPT:**"),
    scriptText: f.scriptText,
    files: {
      script: path.join(PATHS.scripts, f.fileName),
      sheetsDir: PATHS.sheets,
      recording: f.recording.linked ? { wav: f.recording.linked.wav, source: f.recording.linked.source, json: f.recording.jsonPath, jsx: f.recording.jsxPath } : null,
      carousel: f.carousel?.fileName || null,
      captionMd: f.captionMd.path || null,
      slides: f.slides,
    },
  };
}

// Browsers let any web page POST to 127.0.0.1. Only accept writes from this page itself.
function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://${req.headers.host}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 10_000) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/videos") return sendJson(res, 200, overview());

    const m = url.pathname.match(/^\/api\/videos\/(\d+)(\/manual)?$/);
    if (m && req.method === "GET" && !m[2]) {
      const d = detail(parseInt(m[1], 10));
      return d ? sendJson(res, 200, d) : sendJson(res, 404, { error: "No such script." });
    }
    if (m && req.method === "POST" && m[2]) {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "Cross-site request refused." });
      const num = parseInt(m[1], 10);
      const body = JSON.parse(await readBody(req));
      if (!MANUAL_STEPS.includes(body.step)) return sendJson(res, 400, { error: `Only steps ${MANUAL_STEPS.join(", ")} are check marks.` });
      if (!scan().videos.some((v) => v.num === num)) return sendJson(res, 404, { error: "No such script." });
      setManual(num, body.step, !!body.done);
      return sendJson(res, 200, detail(num));
    }
    if (req.method === "POST" && url.pathname === "/api/ssd/relocate") {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: "Cross-site request refused." });
      ssd = locateSsd(loadConfig().ssdLetter);
      return sendJson(res, 200, overview());
    }

    if (req.method === "GET") {
      const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = path.resolve(PUBLIC, rel);
      if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file)) return sendJson(res, 404, { error: "Not found." });
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      return fs.createReadStream(file).pipe(res);
    }
    sendJson(res, 405, { error: "Method not allowed." });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: e.message });
  }
});

server.listen(config.port, "127.0.0.1", () => console.log(`CRWN Studio on http://127.0.0.1:${config.port}`));
