// CRWN claim gate. A reel may SHOW a CRWN capability only when three independent
// things agree: the script's META claim tier says "shipped", the line actually says
// the capability's words, and capabilities.json lists it as shipped with evidence
// paths that exist in this repo (checked by capabilities.test.mjs, so a deleted
// feature fails the suite before it can reach a reel). Anything else is typography,
// never product UI.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../../..");

export function loadCapabilities(file = path.join(HERE, "..", "capabilities.json")) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Evidence paths that no longer exist. Empty means every claim is backed. */
export function missingEvidence(caps, repo = REPO) {
  const out = [];
  for (const [key, c] of Object.entries(caps.capabilities)) {
    for (const p of c.evidence || []) if (!fs.existsSync(path.join(repo, p))) out.push({ key, path: p });
    if (!c.evidence?.length) out.push({ key, path: "(no evidence listed)" });
  }
  return out;
}

export function capabilitiesIn(text, caps) {
  const hits = [];
  for (const [key, c] of Object.entries(caps.capabilities)) if (c.status === "shipped" && new RegExp(c.match, "i").test(text)) hits.push(key);
  return hits;
}

export function neverClaimsIn(text, caps) {
  return Object.entries(caps.neverClaim).filter(([k, re]) => !k.startsWith("_") && new RegExp(re, "i").test(text)).map(([k]) => k);
}

/**
 * May this line be illustrated with CRWN product visuals?
 * @returns {{ allowed: boolean, capabilities: string[], reason: string }}
 */
export function claimGate(structure, line, caps) {
  const tier = structure.claim.tier;
  const found = capabilitiesIn(line.text, caps);
  const never = neverClaimsIn(line.text, caps);
  if (tier !== "shipped") return { allowed: false, capabilities: found, reason: `META claim tier is "${tier || "missing"}", not shipped: typography only` };
  if (never.length) return { allowed: false, capabilities: found, reason: `line reads as something CRWN does not do (${never.join(", ")}): typography only` };
  if (!found.length) return { allowed: false, capabilities: [], reason: "line names no registered CRWN capability" };
  return { allowed: true, capabilities: found, reason: `shipped: ${found.join(", ")}` };
}
