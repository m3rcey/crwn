// The keyword a DM session is RECORDED under. Attribution only: it never routes a tool.
//
// ManyChat automations are cloned from one another, and a clone whose External Request body was
// only half-edited keeps the parent's `keyword` while its `lead_magnet_id` is correct. Routing
// already follows `lead_magnet_id` (see orchestration.ts); the keyword was stored raw, so every
// VAULT session of the 2026-09-25 content test was recorded as "WORTH" and the per-keyword read
// of the test was wrong.
//
// The rule, deliberately narrow so it never invents precision:
//   * The reported keyword is one of the routed tool's own keywords  -> keep it.
//   * It maps to a DIFFERENT tool (the half-edited-clone tell), and the routed tool has exactly
//     ONE keyword -> that one keyword. A single-keyword tool has one trigger word by contract
//     (ManyChat trigger keywords MUST equal the registry's dmKeywords), so this is not a guess.
//   * It maps to a different tool and the routed tool has several keywords -> null (unknown),
//     never the wrong word. The raw value is kept by the caller for audit.
//   * Anything else (no keyword, an unknown word, an unknown tool) -> unchanged.
//
// Shared by the write path (new sessions) and the read path (attribution lookup), so the
// sessions recorded before this existed report correctly without rewriting stored rows.

import { LEAD_MAGNETS } from '@/lib/leadMagnets/registry';

const TOOL_KEYWORDS: Record<string, string[]> = {
  ...Object.fromEntries(LEAD_MAGNETS.map((m) => [m.slug, m.dmKeywords.map((k) => k.toLowerCase())])),
  // WORTH is not a registry tool; orchestration.ts hard-codes it the same way.
  worth: ['worth'],
};

const KEYWORD_TOOL: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_KEYWORDS).flatMap(([tool, kws]) => kws.map((k) => [k, tool] as [string, string])),
);

/** The same bare-word shape orchestration's keywordTool accepts. */
function bareWord(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || t.includes(' ')) return null;
  const w = t.toLowerCase().replace(/[^a-z]/g, '');
  return w && w.length <= 12 ? w : null;
}

export interface ResolvedKeyword {
  /** The keyword to record (lowercase), or null when it cannot be known. */
  keyword: string | null;
  /** True when the reported keyword belonged to a different tool than the one that ran. */
  mislabeled: boolean;
}

export function resolveSessionKeyword(
  reported: string | null | undefined,
  toolId: string | null | undefined,
): ResolvedKeyword {
  const word = bareWord(reported);
  const own = toolId ? TOOL_KEYWORDS[toolId] : undefined;
  const fallback = reported?.trim() ? reported.trim().toLowerCase() : null;
  if (!word || !own) return { keyword: word ?? fallback, mislabeled: false };
  if (own.includes(word)) return { keyword: word, mislabeled: false };
  const other = KEYWORD_TOOL[word];
  if (!other || other === toolId) return { keyword: word, mislabeled: false };
  return { keyword: own.length === 1 ? own[0] : null, mislabeled: true };
}
