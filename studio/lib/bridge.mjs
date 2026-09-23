// The Premiere side of placement. The CEP panel (studio/cep/) polls /api/bridge/next, runs the
// JSX FROM DISK with $.evalFile, and posts back the JSX's own final message. Nothing here runs a
// VS Code buffer, so a stale placement is impossible by construction.
import { parsePlacement } from "./tools.mjs";

const CONNECTED_WITHIN_MS = 10_000;
let pending = null;
let lastSeen = 0;
let seq = 0;

export function bridgeStatus(now = Date.now()) {
  return {
    connected: now - lastSeen < CONNECTED_WITHIN_MS,
    lastSeenSec: lastSeen ? Math.round((now - lastSeen) / 1000) : null,
    pending: pending && { id: pending.id, num: pending.num, picked: !!pending.pickedAt, queuedSec: Math.round((now - pending.queuedAt) / 1000) },
  };
}

export function queuePlacement({ num, jsxPath, jsxWin, jsxMtime }) {
  if (pending) throw new Error(`Placement for video ${pending.num} is still ${pending.pickedAt ? "running in Premiere" : "waiting for the Premiere panel"}.`);
  pending = { id: ++seq, num, jsxPath, jsxWin, jsxMtime, queuedAt: Date.now(), pickedAt: null };
  return pending;
}

export function cancelPlacement() {
  const was = pending;
  pending = null;
  return was;
}

// Called by the panel. Returns the job to run, or null.
export function takeNext(now = Date.now()) {
  lastSeen = now;
  if (!pending || pending.pickedAt) return null;
  pending.pickedAt = now;
  return { id: pending.id, jsx: pending.jsxWin };
}

// Called by the panel with whatever the JSX alerted. Returns the placement record to save.
export function finishPlacement(id, { message, error }) {
  lastSeen = Date.now();
  if (!pending || pending.id !== id) return null;
  const job = pending;
  pending = null;
  const parsed = parsePlacement(message);
  return {
    num: job.num,
    record: {
      by: "bridge",
      at: new Date().toISOString(),
      jsxMtime: job.jsxMtime,
      ...parsed,
      ok: !error && parsed.ok,
      message: error ? `Premiere error: ${error}` : String(message || "").slice(0, 2000),
    },
  };
}
