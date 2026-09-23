// Background script runs. One at a time: transcription saturates the CPU and a second model
// load would only slow both. Output streams into memory for the page and into studio/logs/.
// A silent job is NOT a hung job: transcription prints nothing until a file finishes (15+
// minutes on a long recording), so the page shows elapsed time and never times anything out.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { STUDIO_DIR } from "./config.mjs";

const LOGS = path.join(STUDIO_DIR, "logs");
const KEEP_LINES = 600;
let current = null;
let seq = 0;

export const jobRunning = () => current?.status === "running";

export function startJob({ kind, num, label, cmd, args, onDone }) {
  if (jobRunning()) throw new Error(`Wait for "${current.label}" to finish first.`);
  fs.mkdirSync(LOGS, { recursive: true });
  const startedAt = Date.now();
  const logPath = path.join(LOGS, `${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}-${kind}-${num}.log`);
  const log = fs.createWriteStream(logPath);
  log.write(`$ ${cmd} ${args.map((a) => JSON.stringify(a)).join(" ")}\n\n`);

  const job = { id: ++seq, kind, num, label, startedAt, endedAt: null, status: "running", lines: [], logPath, result: null };
  current = job;
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  const take = (chunk) => {
    const text = chunk.toString("utf-8");
    out += text;
    log.write(text);
    job.lines.push(...text.split(/\r?\n/).filter((l) => l.length));
    if (job.lines.length > KEEP_LINES) job.lines.splice(0, job.lines.length - KEEP_LINES);
  };
  child.stdout.on("data", take);
  child.stderr.on("data", take);
  child.on("error", (e) => take(Buffer.from(`\nCould not start: ${e.message}\n`)));
  child.on("close", (code) => {
    job.endedAt = Date.now();
    let result;
    try {
      result = onDone({ code, out });
    } catch (e) {
      result = { ok: false, summary: `Checking the result failed: ${e.message}`, checks: [] };
    }
    job.result = result;
    job.status = result.ok ? "passed" : "failed";
    log.end(`\n\n[exit ${code}] ${job.status.toUpperCase()}: ${result.summary}\n`);
  });
  return job;
}

export function currentJob() {
  if (!current) return null;
  const { lines, ...rest } = current;
  return { ...rest, lines: lines.slice(-200), elapsedSec: Math.round(((current.endedAt || Date.now()) - current.startedAt) / 1000) };
}
