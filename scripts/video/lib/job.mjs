// Job state + resumability (§39-§40). One directory per video under
// videos/output/<slug>/ holding source.md, storyboard.json, validation.json,
// job.json (state machine + per-scene attempts), cost.json, music.json, images/,
// rejected/, render/final.mp4. A failed stage resumes without redoing earlier
// stages; changing music or pacing rerenders without regenerating images.

import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../config.mjs";

export const STATES = [
  "PARSED",
  "STORYBOARDED",
  "VALIDATED",
  "IMAGES_GENERATING",
  "IMAGES_READY",
  "MUSIC_SELECTED",
  "TIMELINE_READY",
  "RENDERED",
  "COMPLETE",
  "FAILED",
];

/** Job slugs come from script filenames; anything else is refused so AI output can
 * never choose a filesystem destination (§50). */
export function safeSlug(name) {
  const slug = String(name).toLowerCase().replace(/\.md$/, "");
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(slug)) {
    throw new Error(`unsafe job slug: ${JSON.stringify(name)}`);
  }
  return slug;
}

export function jobDir(slug) {
  return path.join(PATHS.outputBase, safeSlug(slug));
}

export function loadJob(slug) {
  const p = path.join(jobDir(slug), "job.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function saveJob(job) {
  const dir = jobDir(job.slug);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "job.json");
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, p);
  return job;
}

export function newJob(slug, scriptPath) {
  return {
    slug: safeSlug(slug),
    scriptPath,
    state: "PARSED",
    createdAt: new Date().toISOString(),
    scenes: [], // [{index, status: 'pending'|'accepted'|'failed', imageFile, boxes, attempts, reason}]
    music: null,
    timelineSummary: null,
    ledger: { entries: [], flags: [] },
    estimate: null,
    error: null,
  };
}

export function setState(job, state) {
  if (!STATES.includes(state)) throw new Error(`unknown job state ${state}`);
  job.state = state;
  job.updatedAt = new Date().toISOString();
  return job;
}

export function writeArtifact(slug, name, data) {
  const dir = jobDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  return p;
}

export function readArtifact(slug, name) {
  const p = path.join(jobDir(slug), name);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf-8");
  return name.endsWith(".json") ? JSON.parse(raw) : raw;
}

/** Scenes still needing an accepted image (drives resume + regen-scene). */
export function pendingScenes(job, storyboard) {
  const bySceneIndex = new Map(job.scenes.map((s) => [s.index, s]));
  return storyboard.scenes.filter((s) => {
    const st = bySceneIndex.get(s.index);
    return !st || st.status !== "accepted" || !fs.existsSync(st.imageFile || "");
  });
}

export function acceptedSceneImages(job) {
  return job.scenes
    .filter((s) => s.status === "accepted")
    .map((s) => ({ index: s.index, imageFile: s.imageFile }));
}

export function elementBoxesByScene(job) {
  const out = {};
  for (const s of job.scenes) {
    if (s.status === "accepted" && s.boxes) out[s.index] = s.boxes;
  }
  return out;
}
