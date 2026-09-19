// Which browser-stored builder draft belongs to the result on screen.
//
// A pre-signup builder keeps an instant local copy of the draft so a refresh loses nothing. That
// copy was keyed by TOOL SLUG ONLY, never cleared, and it beat the fresh result's prefill. So in
// one browser, a brand-new result silently opened whatever was last typed into that tool: a new
// Proof of Demand result opened an earlier listening-session builder, a new Vault opened an earlier
// Vault's name and inventory (2026-09-19 audit). Worse, the stored copy carries the draft's SERVER
// TOKEN, so the new artist's edits were written over the earlier draft's row, and their signup then
// claimed that row.
//
// The rule here: a stored draft is restored ONLY into the result it was built from. A draft from
// any other result is never restored silently and never overwritten silently: it is set aside and
// offered by name, and the new result starts clean with no token, so it gets its own server row.
//
// This is browser state, not an authorization boundary. Server ownership is enforced where it
// always was: every draft write guards on `user_id IS NULL`, and a claimed row is invisible to the
// draft API. Nothing here may be read as widening or narrowing that.
//
// Pure functions over a Storage-shaped object, so the decision is testable without a browser.

export const DELIVERABLE_DRAFT_PREFIX = 'crwn_deliverable_';
export const OYF_DRAFT_KEY = 'crwn_oyf_draft';
const EARLIER_SUFFIX = ':earlier';

export const deliverableDraftKey = (toolSlug: string): string => `${DELIVERABLE_DRAFT_PREFIX}${toolSlug}`;
export const earlierDraftKey = (key: string): string => `${key}${EARLIER_SUFFIX}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** Key order must not change a fingerprint, or the same result would look like a new one. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

/**
 * The identity of the result a builder was opened from: the tool plus the result's own modeled
 * payload. Two runs with the same answers ARE the same result (a refresh must restore), and any
 * changed answer is a different one. Not a secret and not a credential: a local cache key.
 */
export function resultFingerprint(toolSlug: string, source: unknown): string {
  const text = `${toolSlug}|${stableStringify(source)}`;
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 33) + c) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

export interface StoredLocalDraft {
  token: string | null;
  /** Fingerprint of the result this draft was built from. Absent on drafts stored before 2026-09-19. */
  origin?: string;
  /** The builder's own payload (`values` for the deliverable builder, `draft` for Own Your Fans). */
  [field: string]: unknown;
}

export type RestoreDecision =
  | { kind: 'none' }
  /** Built from THIS result: restore it, token included. */
  | { kind: 'restore'; draft: StoredLocalDraft }
  /** Built from another result (or from before drafts recorded one): never restored silently. */
  | { kind: 'earlier'; draft: StoredLocalDraft };

function parseStored(raw: string | null): StoredLocalDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const p = parsed as Record<string, unknown>;
    return { ...p, token: typeof p.token === 'string' && p.token ? p.token : null, origin: typeof p.origin === 'string' ? p.origin : undefined };
  } catch {
    return null;
  }
}

export function decideRestore(raw: string | null, origin: string): RestoreDecision {
  const draft = parseStored(raw);
  if (!draft) return { kind: 'none' };
  // A draft with no recorded origin predates this rule. It cannot be shown to belong to this
  // result, so it is treated as an earlier draft: offered, never assumed.
  return draft.origin === origin ? { kind: 'restore', draft } : { kind: 'earlier', draft };
}

/**
 * Resolve what a builder mounts with. A draft from another result is MOVED aside (so the first
 * keystroke on the new result cannot overwrite it) and returned as `earlier` for the artist to
 * resume by choice. Returns the draft to restore, if any, and the earlier draft to offer, if any.
 */
export function openLocalDraft(
  storage: StorageLike,
  key: string,
  origin: string,
): { restore: StoredLocalDraft | null; earlier: StoredLocalDraft | null } {
  const decision = decideRestore(storage.getItem(key), origin);
  if (decision.kind === 'earlier') {
    storage.setItem(earlierDraftKey(key), JSON.stringify(decision.draft));
    storage.removeItem(key);
  }
  const aside = parseStored(storage.getItem(earlierDraftKey(key)));
  // An aside draft built from THIS result is just the current draft under another name.
  const earlier = aside && aside.origin !== origin ? aside : null;
  return { restore: decision.kind === 'restore' ? decision.draft : null, earlier };
}

/** Write the current draft, bound to the result it was built from. */
export function writeLocalDraft(
  storage: StorageLike,
  key: string,
  origin: string,
  token: string | null,
  payload: Record<string, unknown>,
): void {
  storage.setItem(key, JSON.stringify({ ...payload, token, origin }));
}

/**
 * The artist chose to resume the earlier draft. It becomes the current draft, bound to the result
 * on screen so a refresh restores it; the draft it displaces is kept aside if the artist had
 * actually started it (it has a server token), so neither one is destroyed by the choice.
 */
export function resumeEarlierDraft(
  storage: StorageLike,
  key: string,
  origin: string,
  displaced: { token: string | null; payload: Record<string, unknown> } | null,
): StoredLocalDraft | null {
  const earlier = parseStored(storage.getItem(earlierDraftKey(key)));
  if (!earlier) return null;
  const { token, origin: _earlierOrigin, ...payload } = earlier;
  void _earlierOrigin;
  if (displaced?.token) {
    storage.setItem(earlierDraftKey(key), JSON.stringify({ ...displaced.payload, token: displaced.token, origin }));
  } else {
    storage.removeItem(earlierDraftKey(key));
  }
  writeLocalDraft(storage, key, origin, token, payload);
  return { ...payload, token, origin };
}

/**
 * Remove every local builder draft. Called when the account boundary is crossed: on sign-out, and
 * once a draft has been claimed into an account (from then on the server row under that account is
 * the draft, and `/plan/<tool>` reads it under RLS). Without this, the next person to use the
 * browser met the previous account's drafts.
 */
export function clearLocalDrafts(storage: StorageLike): number {
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && (k.startsWith(DELIVERABLE_DRAFT_PREFIX) || k === OYF_DRAFT_KEY || k === earlierDraftKey(OYF_DRAFT_KEY))) doomed.push(k);
  }
  for (const k of doomed) storage.removeItem(k);
  return doomed.length;
}
