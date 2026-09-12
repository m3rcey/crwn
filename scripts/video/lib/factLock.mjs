// Fact lock: the approved factual vocabulary of ONE source script, and the check
// that a render only ever put approved strings on screen.
//
// This is not a second validator. It reuses scriptParse's extractor and
// normalizer (the same set schema.mjs validates storyboards against) and adds the
// three things a DETERMINISTIC text layer makes possible and a generated image
// never did:
//
//   1. no <=12 exemption. schema.mjs exempts small numbers because prose spells
//      them out, which is a hole wide enough to hide a fabricated "7 MONTHS".
//      scriptParse now turns "eight" into the token 8, so the exemption is not
//      needed here and every number must trace.
//   2. malformed-number detection. A model that mis-letters "$120,000" as
//      "$120,00" produces a number that is not in the approved set AND is not a
//      well-formed figure at all; both are refused, with different messages.
//   3. claim conflict. Two layers that answer the same claim with different text
//      fail loudly instead of one silently winning.
//
// The output of a render is a text manifest: every string, its geometry and its
// visible window. Verification reads the manifest, not the pixels, so proving the
// numbers are right never depends on OCR or on an agent noticing a typo.

import {
  screenNumberTokens,
  normalizeNumberToken,
  sourceNumberTokens,
  WORD_NUMBERS,
} from "./scriptParse.mjs";

/** @typedef {{
 *  slug: string,
 *  numbers: Set<string>,
 *  ctaKeyword: string|null,
 *  conflicts: string[],
 *  wordNumbers: Record<string,string>,
 * }} FactLock */

/**
 * Derive the approved factual vocabulary from a parsed source script.
 * A parse warning about conflicting sources becomes a LOCK CONFLICT: the fact
 * lock refuses to answer rather than picking one of two disagreeing values.
 * @param {import('./scriptParse.mjs').ParsedScript} parsed
 * @param {{ slug?: string }} opts
 * @returns {FactLock}
 */
export function buildFactLock(parsed, opts = {}) {
  const conflicts = (parsed.warnings || []).filter((w) => w.includes("conflict"));
  return {
    slug: opts.slug || null,
    numbers: sourceNumberTokens(parsed),
    ctaKeyword: parsed.ctaKeyword,
    conflicts,
    wordNumbers: WORD_NUMBERS,
  };
}

/** A stable digest of the lock, stamped into the manifest so a manifest can never
 * be verified against a different script's facts by accident. */
export function factLockDigest(lock) {
  const nums = [...lock.numbers].sort().join(",");
  return `${lock.ctaKeyword || "-"}|${nums}`;
}

// A figure that is shaped wrong, independent of whether its value is approved.
// "$120,00" is the exact failure mode a re-lettering model produces.
const DIGIT_RUN = /\$?\d[\d,.]*[KMB]?/gi;

/**
 * Numeric substrings in `text` that are not well-formed figures.
 * @returns {string[]} the malformed substrings, verbatim
 */
export function malformedNumbers(text) {
  const bad = [];
  for (const m of String(text).matchAll(DIGIT_RUN)) {
    const raw = m[0];
    const body = raw.replace(/^\$/, "").replace(/[KMB]$/i, "");
    // Thousands separators, when present, must group in exact threes.
    if (body.includes(",")) {
      const [intPart, ...decParts] = body.split(".");
      if (decParts.length > 1) {
        bad.push(raw);
        continue;
      }
      const groups = intPart.split(",");
      const headOk = /^\d{1,3}$/.test(groups[0]);
      const tailOk = groups.slice(1).every((g) => /^\d{3}$/.test(g));
      if (!headOk || !tailOk || groups.length < 2) {
        bad.push(raw);
        continue;
      }
    }
    // At most one decimal point, and it must separate digits.
    const dots = (body.match(/\./g) || []).length;
    if (dots > 1 || /\.$/.test(body) || /^\./.test(body)) {
      bad.push(raw);
      continue;
    }
    // A multi-digit integer does not start with 0 ("0400" is a mis-lettering).
    const intOnly = body.split(".")[0].replace(/,/g, "");
    if (intOnly.length > 1 && intOnly.startsWith("0")) {
      bad.push(raw);
      continue;
    }
  }
  return bad;
}

/**
 * Check one on-screen string against the lock.
 * @param {string} text
 * @param {FactLock} lock
 * @returns {{ ok: boolean, unapproved: string[], malformed: string[], numbers: string[] }}
 */
export function verifyText(text, lock) {
  const malformed = malformedNumbers(text);
  const numbers = screenNumberTokens(text);
  // A malformed figure's token is meaningless, so it is reported once, as malformed.
  const malformedTokens = new Set(malformed.flatMap((m) => screenNumberTokens(m)));
  const unapproved = numbers.filter((n) => !lock.numbers.has(n) && !malformedTokens.has(n));
  return {
    ok: malformed.length === 0 && unapproved.length === 0,
    unapproved,
    malformed,
    numbers,
  };
}

/** @typedef {{
 *  scene: number,
 *  id: string,
 *  text: string,
 *  claim?: string,
 *  role?: string,
 *  box: {x:number,y:number,w:number,h:number},
 *  fromSec: number,
 *  toSec: number,
 *  spriteHash: string,
 * }} ManifestLayer */

/**
 * Verify a rendered text manifest against the fact lock and the spec it came from.
 *
 * @param {{ slug: string, factLockDigest: string, layers: ManifestLayer[] }} manifest
 * @param {FactLock} lock
 * @param {{
 *   specText?: Record<string,string>,   // layer key -> approved string, character-for-character
 *   requiredNumbers?: string[],         // figures the video must actually show
 *   requireCta?: boolean,
 *   safeZone?: {top:number,bottom:number,left:number,right:number},
 * }} opts
 * @returns {{ ok: boolean, errors: string[], warnings: string[], checked: number }}
 */
export function verifyTextManifest(manifest, lock, opts = {}) {
  const errors = [];
  const warnings = [];

  if (!manifest || !Array.isArray(manifest.layers)) {
    return { ok: false, errors: ["manifest has no layers"], warnings, checked: 0 };
  }
  for (const c of lock.conflicts) {
    errors.push(`source conflict, refusing to choose: ${c}`);
  }
  if (manifest.factLockDigest && manifest.factLockDigest !== factLockDigest(lock)) {
    errors.push("manifest was rendered against a different fact lock than the one it is being verified with");
  }

  const seenClaims = new Map();
  for (const layer of manifest.layers) {
    const where = `scene ${layer.scene} layer "${layer.id}"`;

    // 1 + 4/5/6: every figure traceable and well formed.
    const v = verifyText(layer.text, lock);
    for (const m of v.malformed) errors.push(`${where}: malformed figure ${JSON.stringify(m)} in ${JSON.stringify(layer.text)}`);
    for (const n of v.unapproved) errors.push(`${where}: number "${n}" is not in the source script/META`);

    // 3: the rendered string is character-for-character the approved one.
    if (opts.specText) {
      const key = `${layer.scene}:${layer.id}`;
      const approved = opts.specText[key];
      if (approved === undefined) errors.push(`${where}: rendered a layer that is not in the spec`);
      else if (approved !== layer.text) {
        errors.push(`${where}: rendered ${JSON.stringify(layer.text)} but the spec approved ${JSON.stringify(approved)}`);
      }
    }

    // 7: one claim, one answer.
    if (layer.claim) {
      const prior = seenClaims.get(layer.claim);
      if (prior !== undefined && prior !== layer.text) {
        errors.push(`claim "${layer.claim}" is answered two different ways: ${JSON.stringify(prior)} and ${JSON.stringify(layer.text)}`);
      } else seenClaims.set(layer.claim, layer.text);
    }

    // Geometry: readable means inside the platform-safe box.
    const z = opts.safeZone;
    if (z && layer.box) {
      const { x, y, w, h } = layer.box;
      if (x < z.left - 1e-6 || y < z.top - 1e-6 || x + w > 1 - z.right + 1e-6 || y + h > 1 - z.bottom + 1e-6) {
        errors.push(
          `${where}: text box [${x.toFixed(3)},${y.toFixed(3)},${w.toFixed(3)},${h.toFixed(3)}] leaves the safe zone`
        );
      }
    }
    if (layer.toSec <= layer.fromSec) errors.push(`${where}: visible window is empty (${layer.fromSec}-${layer.toSec})`);
  }

  // 2: the figures the video is supposed to state are actually on screen.
  const rendered = new Set(manifest.layers.flatMap((l) => screenNumberTokens(l.text)));
  for (const req of opts.requiredNumbers || []) {
    const token = normalizeNumberToken(req);
    if (!rendered.has(token)) errors.push(`required figure "${req}" (token ${token}) never appears on screen`);
  }

  // The CTA keyword is exact, and case matters: "Vault" is not the keyword.
  if (opts.requireCta !== false && lock.ctaKeyword) {
    const hit = manifest.layers.some((l) => l.text.includes(lock.ctaKeyword));
    if (!hit) errors.push(`CTA keyword "${lock.ctaKeyword}" never appears on screen`);
    const wrongCase = manifest.layers.some(
      (l) => !l.text.includes(lock.ctaKeyword) && l.text.toUpperCase().includes(lock.ctaKeyword.toUpperCase())
    );
    if (wrongCase) warnings.push(`a layer contains the CTA keyword in different case than "${lock.ctaKeyword}"`);
  }

  return { ok: errors.length === 0, errors, warnings, checked: manifest.layers.length };
}
