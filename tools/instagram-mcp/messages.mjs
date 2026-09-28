// DM helpers for the Instagram MCP server. Pure: every Meta call goes through an injected `graph`
// function, so the tests run with no network and no token.
//
// Why the detail fetch exists (proven live 2026-09-28 against graph.instagram.com v26.0, 53
// messages across 30 threads): the conversation messages EDGE returns `message` text reliably,
// every inbound text arrived, but it silently omits `attachments` even when the field is asked
// for. 29 of 53 messages came back as `message: ""` with nothing else, while GET /{message-id}
// with the same fields returned the attachment (a ManyChat card: generic_template title + CTA)
// plus `is_unsupported`. Claude read those as blank messages. So a message the edge returned with
// no text and no content is re-fetched by id; a message that already carries content is not.

export const MESSAGE_FIELDS = 'id,created_time,from,to,message,attachments,shares,story';
const DETAIL_FIELDS = `${MESSAGE_FIELDS},reactions,is_unsupported`;
const DETAIL_CONCURRENCY = 5;

const hasContent = (m) => Boolean(m.message) || m.attachments !== undefined || m.shares !== undefined || m.story !== undefined;

/**
 * Remove every nested `paging` block (attachments, reactions). Their `next`/`previous` URLs carry
 * the access token, and a nested cursor is useless to the reader anyway.
 */
export function stripPaging(v) {
  if (Array.isArray(v)) return v.map(stripPaging);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) if (k !== 'paging') out[k] = stripPaging(x);
  return out;
}

/**
 * Fill in messages the edge returned bare, then label each one inbound or outbound.
 * A failed detail fetch keeps the list item and says why, so one bad id never blanks a thread.
 */
export async function enrichMessages(items, graph, accountId) {
  const out = items.slice();
  const bare = out.map((m, i) => (hasContent(m) ? -1 : i)).filter((i) => i >= 0);
  for (let k = 0; k < bare.length; k += DETAIL_CONCURRENCY) {
    await Promise.all(bare.slice(k, k + DETAIL_CONCURRENCY).map(async (i) => {
      try {
        out[i] = { ...out[i], ...(await graph(out[i].id, { fields: DETAIL_FIELDS })) };
      } catch (e) {
        out[i] = { ...out[i], detail_error: String(e?.message ?? e) };
      }
    }));
  }
  return out.map((m) => {
    const t = stripPaging(m);
    const direction = !accountId || !t.from?.id ? 'unknown' : t.from.id === accountId ? 'outbound' : 'inbound';
    return { ...t, direction };
  });
}

/**
 * Find the DM thread with one Instagram user by walking the conversation list. The API has no
 * username lookup (its `user_id` filter takes an Instagram-scoped id), so this pages, bounded.
 */
export async function findConversation(username, graph, { pageSize = 50, maxPages = 10 } = {}) {
  const want = String(username).replace(/^@/, '').trim().toLowerCase();
  if (!want) throw new Error('username is required');
  let after;
  for (let p = 0; p < maxPages; p++) {
    const json = await graph('me/conversations', { platform: 'instagram', fields: 'id,updated_time,participants', limit: pageSize, after });
    const hit = (json.data ?? []).find((c) => (c.participants?.data ?? []).some((u) => u.username?.toLowerCase() === want));
    if (hit) return hit;
    after = json.paging?.next ? json.paging?.cursors?.after : undefined;
    if (!after) return null;
  }
  return null;
}
