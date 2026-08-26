// Parser for the existing CRWN short-form script markdown format:
//   # Title
//   **SCRIPT:** ...narration...
//   **NANO BANANA PRO PROMPT:** ...optional static-image prompt...
//   **META:** Key: value · Key: value ...
// The SCRIPT is semantic source material for a silent video, never displayed verbatim.

/** @typedef {{
 *  title: string,
 *  scriptText: string,
 *  nanoPrompt: string|null,
 *  meta: Record<string,string>,
 *  ctaKeyword: string|null,
 *  family: string|null,
 *  artist: string|null,
 *  warnings: string[],
 * }} ParsedScript */

function sectionAfter(content, marker) {
  const idx = content.indexOf(marker);
  if (idx === -1) return null;
  let rest = content.slice(idx + marker.length);
  // A section ends at the next --- divider or the next **HEADER:** marker.
  const endDash = rest.indexOf("\n---");
  const endHeader = rest.search(/\n\*\*[A-Z][A-Z ]+:\*\*/);
  let end = rest.length;
  if (endDash !== -1) end = Math.min(end, endDash);
  if (endHeader !== -1) end = Math.min(end, endHeader);
  return rest.slice(0, end).trim();
}

/** META is `Key: value` pairs separated by `·` (middle dot), possibly wrapped
 * across lines. Values themselves may contain colons (URLs, ratios), so only the
 * FIRST colon of each segment splits key from value, and a segment with no colon
 * is appended to the previous value (a wrapped line). */
export function parseMeta(metaText) {
  /** @type {Record<string,string>} */
  const meta = {};
  if (!metaText) return meta;
  const segments = metaText.replace(/\n/g, " ").split("·");
  let lastKey = null;
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    // Heuristic: a real key is short and has no digits (values with colons start
    // with long prose or numbers).
    const maybeKey = colon > 0 ? trimmed.slice(0, colon).trim() : null;
    if (maybeKey && maybeKey.length <= 40 && !/\d/.test(maybeKey)) {
      const key = maybeKey.toLowerCase().replace(/\s+/g, " ");
      meta[key] = trimmed.slice(colon + 1).trim();
      lastKey = key;
    } else if (lastKey) {
      meta[lastKey] = `${meta[lastKey]} · ${trimmed}`;
    }
  }
  return meta;
}

/** The CTA keyword is the word fans comment ("Comment VAULT and I'll DM you the
 * link"). Source of truth is the SCRIPT text; META's `lead magnet` field carries
 * `tool-slug + KEYWORD` and is used as the cross-check. */
export function extractCtaKeyword(scriptText, meta) {
  const m = scriptText.match(/comment\s+["“]?([A-Z][A-Z0-9]{1,15})["”]?/i);
  const fromScript = m ? m[1].toUpperCase() : null;
  let fromMeta = null;
  const lm = meta["lead magnet"];
  if (lm) {
    const mm = lm.match(/\+\s*([A-Z][A-Z0-9]{1,15})\b/);
    if (mm) fromMeta = mm[1].toUpperCase();
  }
  return { keyword: fromScript || fromMeta, fromScript, fromMeta };
}

/** @returns {ParsedScript} */
export function parseScriptMarkdown(content) {
  const warnings = [];
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "(untitled)";
  if (!titleMatch) warnings.push("no # title found");

  const scriptText = sectionAfter(content, "**SCRIPT:**") || "";
  if (!scriptText) warnings.push("no **SCRIPT:** section found");

  const nanoPrompt = sectionAfter(content, "**NANO BANANA PRO PROMPT:**");
  const metaText = sectionAfter(content, "**META:**");
  if (!metaText) warnings.push("no **META:** section found");
  const meta = parseMeta(metaText);

  const { keyword, fromScript, fromMeta } = extractCtaKeyword(scriptText, meta);
  if (fromScript && fromMeta && fromScript !== fromMeta) {
    // SCRIPT and META materially conflict: flag it, do not silently reconcile.
    warnings.push(
      `CTA keyword conflict: script says "${fromScript}", META lead magnet says "${fromMeta}"`
    );
  }
  if (!keyword) warnings.push("no CTA keyword found in script or META");

  return {
    title,
    scriptText,
    nanoPrompt: nanoPrompt || null,
    meta,
    ctaKeyword: keyword,
    family: meta["family"] || null,
    artist: meta["artist"] || null,
    warnings,
  };
}

/** Every multi-digit number and dollar figure that appears in the source material.
 * The storyboard may only put numbers on screen that exist in this set: a number in
 * screenText that is NOT here was fabricated by storyboard generation. */
export function sourceNumberTokens(parsed) {
  const source = `${parsed.title}\n${parsed.scriptText}\n${Object.values(parsed.meta).join("\n")}`;
  const tokens = new Set();
  for (const m of source.matchAll(/\$?[\d][\d,.]*[KMB]?\b/gi)) {
    const raw = m[0].replace(/[.,]$/, "");
    tokens.add(normalizeNumberToken(raw));
  }
  return tokens;
}

/** "$2,000,000" / "2000000" / "2,000,000" / "$2M" all normalize to comparable forms. */
export function normalizeNumberToken(raw) {
  let t = raw.toUpperCase().replace(/[$,]/g, "");
  const suffix = t.match(/([KMB])$/);
  if (suffix) {
    const n = parseFloat(t.slice(0, -1));
    if (!Number.isNaN(n)) {
      const mult = { K: 1e3, M: 1e6, B: 1e9 }[suffix[1]];
      t = String(Math.round(n * mult));
    }
  }
  return t;
}

/** Numbers used inside screen text strings, normalized the same way. */
export function screenNumberTokens(text) {
  const tokens = [];
  for (const m of text.matchAll(/\$?[\d][\d,.]*[KMB]?\b/gi)) {
    tokens.push(normalizeNumberToken(m[0].replace(/[.,]$/, "")));
  }
  return tokens;
}
