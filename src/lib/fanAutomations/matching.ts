// Pure trigger matching for Fan Automations: does this comment fire this automation?
//
// Decisions the artist made in the wizard (which posts, which keywords) are data on the
// fan_automations row; this module is the ONE place that reads them against an incoming
// comment. The webhook route holds no matching logic of its own, so every rule here is
// testable without Meta.

export interface IncomingComment {
  /** Provider comment id. The dedupe claim key; not used for matching itself. */
  commentId: string;
  /** Provider media/post id the comment sits on ('' when the provider omits it). */
  mediaId: string;
  /** Provider user id of the commenter. */
  fromId: string;
  /** Comment text as delivered. */
  text: string;
}

export interface AutomationTrigger {
  id: string;
  status: string;
  /** Provider media ids this automation listens on. Empty = every post. */
  triggerMediaIds: string[];
  /** Lowercased keywords. Empty = any comment on a matching post. */
  triggerKeywords: string[];
  createdAt: string;
}

/** Lowercase, trim, collapse whitespace. Applied to both keywords and comment text. */
export function normalizeKeyword(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The connected account commenting on its own post must never trigger its own automation.
 * Our public reply IS such a comment, and Meta delivers a webhook for it: without this
 * check every triggered comment would spawn a second webhook, a second match, and a loop.
 */
export function isOwnComment(comment: Pick<IncomingComment, 'fromId'>, providerAccountId: string): boolean {
  return !!comment.fromId && !!providerAccountId && comment.fromId === providerAccountId;
}

/** Substring match on normalized text, per keyword; any keyword hitting is a match. */
export function textMatchesKeywords(text: string, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const haystack = normalizeKeyword(text);
  if (!haystack) return false;
  return keywords.some((k) => {
    const needle = normalizeKeyword(k);
    return needle.length > 0 && haystack.includes(needle);
  });
}

export function commentMatchesAutomation(comment: IncomingComment, automation: AutomationTrigger): boolean {
  if (automation.status !== 'active') return false;
  if (automation.triggerMediaIds.length > 0) {
    if (!comment.mediaId || !automation.triggerMediaIds.includes(comment.mediaId)) return false;
  }
  return textMatchesKeywords(comment.text, automation.triggerKeywords);
}

/**
 * Exactly ONE automation answers a comment (Meta permits one private reply per comment, so
 * two matches would race for one slot). Deterministic: the oldest matching automation wins.
 */
export function pickAutomation(comment: IncomingComment, automations: AutomationTrigger[]): AutomationTrigger | null {
  const matches = automations
    .filter((a) => commentMatchesAutomation(comment, a))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return matches[0] ?? null;
}

/** Row jsonb -> trigger shape, refusing junk instead of matching on it. */
export function triggerFromRow(row: {
  id: string;
  status: string;
  trigger_media_ids: unknown;
  trigger_keywords: unknown;
  created_at: string;
}): AutomationTrigger {
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  return {
    id: row.id,
    status: row.status,
    triggerMediaIds: strings(row.trigger_media_ids),
    triggerKeywords: strings(row.trigger_keywords).map(normalizeKeyword).filter(Boolean),
    createdAt: row.created_at,
  };
}
