// The Premiere side of placement. The CEP panel (studio/cep/) polls /api/bridge/next, runs the
// placement copy FROM DISK with $.evalFile, and posts back two things: what the JSX reported
// (its alert() is rerouted to text, see lib/placement.mjs) and how many clips actually appeared
// on A3/A4, counted before and after. The count is Premiere's own answer, so it doesn't depend
// on the JSX's message at all.
import { parsePlacement } from "./tools.mjs";

const CONNECTED_WITHIN_MS = 10_000;
// Must match VERSION in cep/com.crwn.studio.bridge/bridge.js. Version 1 swapped alert(), which
// Premiere 24 ignored, so its placements came back empty.
export const PANEL_VERSION = "2";
let pending = null;
let lastSeen = 0;
let panelVersion = null;
let seq = 0;

export function bridgeStatus(now = Date.now()) {
  return {
    connected: now - lastSeen < CONNECTED_WITHIN_MS,
    outdated: panelVersion !== PANEL_VERSION,
    lastSeenSec: lastSeen ? Math.round((now - lastSeen) / 1000) : null,
    pending: pending && { id: pending.id, num: pending.num, picked: !!pending.pickedAt, queuedSec: Math.round((now - pending.queuedAt) / 1000) },
  };
}

export function queuePlacement(job) {
  if (lastSeen && panelVersion !== PANEL_VERSION) {
    throw new Error("The Premiere panel is running an old version. Close and reopen it (Window > Extensions > CRWN Studio Bridge), then place again.");
  }
  if (pending) throw new Error(`Placement for video ${pending.num} is still ${pending.pickedAt ? "running in Premiere" : "waiting for the Premiere panel"}.`);
  pending = { id: ++seq, ...job, queuedAt: Date.now(), pickedAt: null };
  return pending;
}

export function cancelPlacement() {
  const was = pending;
  pending = null;
  return was;
}

// Called by the panel. Returns the job to run, or null.
export function takeNext(now = Date.now(), version = null) {
  lastSeen = now;
  panelVersion = version;
  // Never hand a job to an out-of-date panel: it would run it and lose the result.
  if (!pending || pending.pickedAt || version !== PANEL_VERSION) return null;
  pending.pickedAt = now;
  return { id: pending.id, jsx: pending.jsxWin };
}

// Pure. The panel's reply is "CLIPS:<added on A3/A4>" then whatever the JSX reported.
export function readPanelReply(raw, total) {
  const text = String(raw || "");
  const m = text.match(/^CLIPS:(-?\d+)\n?/);
  const added = m ? parseInt(m[1], 10) : null;
  const message = m ? text.slice(m[0].length) : text;
  const reported = parsePlacement(message);
  const clamped = (message.match(/Clamped:\s*(\d+)/) || [])[1];
  // Premiere's clip count is the authority; the JSX's own Failed count must agree when present.
  const placed = added ?? reported.placed;
  const failed = reported.failed ?? (added != null ? total - added : null);
  const ok = placed != null && placed === total && (failed == null || failed === 0);
  return { placed, total, failed, ok, clamped: clamped != null ? +clamped : null, message };
}

export function finishPlacement(id, { message, error }) {
  lastSeen = Date.now();
  if (!pending || pending.id !== id) return null;
  const job = pending;
  pending = null;
  const reply = readPanelReply(message, job.total);
  return {
    num: job.num,
    record: {
      by: "bridge",
      at: new Date().toISOString(),
      jsxMtime: job.jsxMtime,
      spacing: job.spacing,
      ...reply,
      ok: !error && reply.ok,
      message: error ? `Premiere error: ${error}` : reply.message.slice(0, 2000),
    },
  };
}
