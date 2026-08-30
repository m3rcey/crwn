// Pure parsing of Meta webhook payloads into comment events. No I/O, fully tested.
//
// One app-level callback receives BOTH products, distinguished by `object`:
//   "instagram" -> comment events for connected IG professional accounts. Instagram Login
//     delivers a direct field/value structure; the Facebook Login variant wraps the same
//     value in changes[]. Both are handled, keyed on field === 'comments'.
//   "page"      -> Facebook Page `feed` changes; only item === 'comment' with verb === 'add'
//     is a triggering event (edits, likes, and removals are not new comments).
//
// Anything malformed is dropped, never guessed at: a webhook body is untrusted input.

export interface MetaCommentEvent {
  provider: 'instagram' | 'facebook';
  /** The connected account the event belongs to (IG account id / Page id). */
  providerAccountId: string;
  commentId: string;
  mediaId: string;
  fromId: string;
  fromUsername: string;
  text: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/* eslint-disable @typescript-eslint/no-explicit-any */

function igCommentFromValue(accountId: string, value: any): MetaCommentEvent | null {
  if (!value || typeof value !== 'object') return null;
  const commentId = str(value.id);
  if (!commentId) return null;
  return {
    provider: 'instagram',
    providerAccountId: accountId,
    commentId,
    mediaId: str(value.media?.id),
    fromId: str(value.from?.id),
    fromUsername: str(value.from?.username),
    text: str(value.text),
  };
}

function pageCommentFromValue(pageId: string, value: any): MetaCommentEvent | null {
  if (!value || typeof value !== 'object') return null;
  if (value.item !== 'comment' || (value.verb && value.verb !== 'add')) return null;
  const commentId = str(value.comment_id);
  if (!commentId) return null;
  return {
    provider: 'facebook',
    providerAccountId: pageId,
    commentId,
    mediaId: str(value.post_id),
    fromId: str(value.from?.id),
    fromUsername: str(value.from?.name),
    text: str(value.message),
  };
}

export function parseMetaWebhookEvents(body: unknown): MetaCommentEvent[] {
  const root = body as any;
  if (!root || typeof root !== 'object' || !Array.isArray(root.entry)) return [];
  const object = str(root.object);
  if (object !== 'instagram' && object !== 'page') return [];

  const out: MetaCommentEvent[] = [];
  for (const entry of root.entry) {
    const accountId = str(entry?.id);
    if (!accountId) continue;

    if (object === 'instagram') {
      // Instagram Login shape: entry.field / entry.value. FB Login shape: entry.changes[].
      if (entry.field === 'comments') {
        const ev = igCommentFromValue(accountId, entry.value);
        if (ev) out.push(ev);
      }
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        if (change?.field !== 'comments') continue;
        const ev = igCommentFromValue(accountId, change.value);
        if (ev) out.push(ev);
      }
    } else {
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        if (change?.field !== 'feed') continue;
        const ev = pageCommentFromValue(accountId, change.value);
        if (ev) out.push(ev);
      }
    }
  }
  return out;
}
