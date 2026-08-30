// The thin Meta Graph client for artist Fan Automations. SERVER ONLY.
//
// Two providers, two hosts, verified against official Meta docs 2026-08-29 (Graph v26.0):
//   Instagram API with Instagram Login  -> graph.instagram.com (+ api.instagram.com for the
//     code swap). No Facebook Page required; scopes instagram_business_basic /
//     _manage_comments / _manage_messages; long-lived tokens last 60 days and refresh via
//     /refresh_access_token (token must be >= 24h old and still valid).
//   Facebook Pages via Facebook Login   -> graph.facebook.com. Long-lived PAGE tokens carry
//     no expiry; comment events ride the `feed` webhook field.
//
// Hard platform rules this module encodes so callers cannot get them wrong:
//   * ONE private reply per comment, within 7 days. The webhook receipts table enforces the
//     "one" (UNIQUE claim); this module just performs the send.
//   * The private reply does NOT open the 24h messaging window, so the single message must
//     carry the drop link itself. Text plus URL is the portable shape on both platforms.
//   * Tokens ride in the request BODY or as form params over HTTPS, never in a logged URL,
//     and every error surface passes through redactSecrets before storage.

import { redactSecrets } from '@/lib/social/adapter';

const V = process.env.GRAPH_API_VERSION?.trim() || 'v26.0';
const IG_HOST = 'https://graph.instagram.com';
const FB_HOST = 'https://graph.facebook.com';

export interface GraphResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Redacted provider error summary, safe to store in a receipt row. */
  error: string | null;
}

async function graphFetch<T>(
  url: string,
  init: RequestInit,
  secrets: Array<string | undefined>,
): Promise<GraphResult<T>> {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
    if (!res.ok) {
      const summary = redactSecrets(text.slice(0, 500), secrets);
      return { ok: false, status: res.status, data: null, error: summary };
    }
    return { ok: true, status: res.status, data: json as T, error: null };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: redactSecrets(String(e).slice(0, 300), secrets) };
  }
}

function form(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

// ── Instagram (Instagram Login) ─────────────────────────────────────────────────────────────

export function igAuthorizeUrl(appId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages',
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${q.toString()}`;
}

/** Code -> short-lived token -> long-lived (60 day) token, in one call. */
export async function igExchangeCode(input: {
  appId: string; appSecret: string; redirectUri: string; code: string;
}): Promise<GraphResult<{ access_token: string; user_id?: string; expires_in?: number }>> {
  const secrets = [input.appSecret, input.code];
  const short = await graphFetch<{ access_token: string; user_id?: string | number }>(
    'https://api.instagram.com/oauth/access_token',
    {
      method: 'POST',
      body: form({
        client_id: input.appId,
        client_secret: input.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
        code: input.code,
      }),
    },
    secrets,
  );
  if (!short.ok || !short.data?.access_token) {
    return { ok: false, status: short.status, data: null, error: short.error || 'no short-lived token' };
  }

  const q = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: input.appSecret,
    access_token: short.data.access_token,
  });
  const long = await graphFetch<{ access_token: string; expires_in: number }>(
    `${IG_HOST}/access_token?${q.toString()}`,
    { method: 'GET' },
    [...secrets, short.data.access_token],
  );
  if (!long.ok || !long.data?.access_token) {
    return { ok: false, status: long.status, data: null, error: long.error || 'long-lived exchange failed' };
  }
  return {
    ok: true,
    status: 200,
    data: {
      access_token: long.data.access_token,
      user_id: short.data.user_id != null ? String(short.data.user_id) : undefined,
      expires_in: long.data.expires_in,
    },
    error: null,
  };
}

/** Refresh a long-lived IG token (must be >= 24h old and unexpired). */
export async function igRefreshToken(token: string): Promise<GraphResult<{ access_token: string; expires_in: number }>> {
  const q = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
  return graphFetch(`${IG_HOST}/refresh_access_token?${q.toString()}`, { method: 'GET' }, [token]);
}

export async function igMe(token: string): Promise<GraphResult<{ user_id: string; username: string }>> {
  const q = new URLSearchParams({ fields: 'user_id,username', access_token: token });
  return graphFetch(`${IG_HOST}/${V}/me?${q.toString()}`, { method: 'GET' }, [token]);
}

/** Subscribe the connected account to comment webhooks. Without this, events never arrive. */
export async function igSubscribeWebhooks(token: string): Promise<GraphResult<{ success: boolean }>> {
  return graphFetch(
    `${IG_HOST}/${V}/me/subscribed_apps`,
    { method: 'POST', body: form({ subscribed_fields: 'comments', access_token: token }) },
    [token],
  );
}

export interface ProviderPost {
  id: string;
  caption: string;
  mediaType: string;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
}

export async function igRecentMedia(token: string): Promise<GraphResult<ProviderPost[]>> {
  const q = new URLSearchParams({
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
    limit: '24',
    access_token: token,
  });
  const res = await graphFetch<{ data: Array<Record<string, unknown>> }>(
    `${IG_HOST}/${V}/me/media?${q.toString()}`, { method: 'GET' }, [token],
  );
  if (!res.ok || !res.data) return { ok: false, status: res.status, data: null, error: res.error };
  const posts: ProviderPost[] = (res.data.data || []).map((m) => ({
    id: String(m.id ?? ''),
    caption: typeof m.caption === 'string' ? m.caption.slice(0, 120) : '',
    mediaType: typeof m.media_type === 'string' ? m.media_type : '',
    thumbnailUrl:
      typeof m.thumbnail_url === 'string' ? m.thumbnail_url
      : typeof m.media_url === 'string' ? m.media_url : null,
    permalink: typeof m.permalink === 'string' ? m.permalink : null,
    timestamp: typeof m.timestamp === 'string' ? m.timestamp : null,
  }));
  return { ok: true, status: 200, data: posts, error: null };
}

/** Public threaded reply under the fan's comment. */
export async function igPublicReply(token: string, commentId: string, message: string): Promise<GraphResult<{ id: string }>> {
  return graphFetch(
    `${IG_HOST}/${V}/${encodeURIComponent(commentId)}/replies`,
    { method: 'POST', body: form({ message, access_token: token }) },
    [token],
  );
}

/** THE comment-to-DM primitive: the one private reply Meta permits for this comment. */
export async function igPrivateReply(
  token: string,
  igAccountId: string,
  commentId: string,
  text: string,
): Promise<GraphResult<{ message_id?: string }>> {
  return graphFetch(
    `${IG_HOST}/${V}/${encodeURIComponent(igAccountId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    },
    [token],
  );
}

// ── Facebook Pages (Facebook Login) ─────────────────────────────────────────────────────────

export function fbAuthorizeUrl(appId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'pages_show_list,pages_read_engagement,pages_manage_engagement,pages_manage_metadata,pages_messaging',
    state,
  });
  return `https://www.facebook.com/${V}/dialog/oauth?${q.toString()}`;
}

/** Code -> long-lived user token -> the user's Pages with their long-lived Page tokens. */
export async function fbExchangeCodeForPages(input: {
  appId: string; appSecret: string; redirectUri: string; code: string;
}): Promise<GraphResult<Array<{ id: string; name: string; access_token: string }>>> {
  const secrets: Array<string | undefined> = [input.appSecret, input.code];
  const q1 = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  const short = await graphFetch<{ access_token: string }>(
    `${FB_HOST}/${V}/oauth/access_token?${q1.toString()}`, { method: 'GET' }, secrets,
  );
  if (!short.ok || !short.data?.access_token) {
    return { ok: false, status: short.status, data: null, error: short.error || 'no user token' };
  }
  secrets.push(short.data.access_token);

  const q2 = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: input.appId,
    client_secret: input.appSecret,
    fb_exchange_token: short.data.access_token,
  });
  const long = await graphFetch<{ access_token: string }>(
    `${FB_HOST}/${V}/oauth/access_token?${q2.toString()}`, { method: 'GET' }, secrets,
  );
  const userToken = long.ok && long.data?.access_token ? long.data.access_token : short.data.access_token;
  secrets.push(userToken);

  const q3 = new URLSearchParams({ fields: 'id,name,access_token', access_token: userToken });
  const pages = await graphFetch<{ data: Array<{ id: string; name: string; access_token: string }> }>(
    `${FB_HOST}/${V}/me/accounts?${q3.toString()}`, { method: 'GET' }, secrets,
  );
  if (!pages.ok || !pages.data) return { ok: false, status: pages.status, data: null, error: pages.error };
  return { ok: true, status: 200, data: pages.data.data || [], error: null };
}

/** Subscribe a Page to the `feed` webhook field (comments arrive there). */
export async function fbSubscribePage(pageToken: string, pageId: string): Promise<GraphResult<{ success: boolean }>> {
  return graphFetch(
    `${FB_HOST}/${V}/${encodeURIComponent(pageId)}/subscribed_apps`,
    { method: 'POST', body: form({ subscribed_fields: 'feed', access_token: pageToken }) },
    [pageToken],
  );
}

export async function fbRecentPosts(pageToken: string, pageId: string): Promise<GraphResult<ProviderPost[]>> {
  const q = new URLSearchParams({
    fields: 'id,message,permalink_url,full_picture,created_time',
    limit: '24',
    access_token: pageToken,
  });
  const res = await graphFetch<{ data: Array<Record<string, unknown>> }>(
    `${FB_HOST}/${V}/${encodeURIComponent(pageId)}/posts?${q.toString()}`, { method: 'GET' }, [pageToken],
  );
  if (!res.ok || !res.data) return { ok: false, status: res.status, data: null, error: res.error };
  const posts: ProviderPost[] = (res.data.data || []).map((m) => ({
    id: String(m.id ?? ''),
    caption: typeof m.message === 'string' ? m.message.slice(0, 120) : '',
    mediaType: 'POST',
    thumbnailUrl: typeof m.full_picture === 'string' ? m.full_picture : null,
    permalink: typeof m.permalink_url === 'string' ? m.permalink_url : null,
    timestamp: typeof m.created_time === 'string' ? m.created_time : null,
  }));
  return { ok: true, status: 200, data: posts, error: null };
}

export async function fbPublicReply(pageToken: string, commentId: string, message: string): Promise<GraphResult<{ id: string }>> {
  return graphFetch(
    `${FB_HOST}/${V}/${encodeURIComponent(commentId)}/comments`,
    { method: 'POST', body: form({ message, access_token: pageToken }) },
    [pageToken],
  );
}

export async function fbPrivateReply(
  pageToken: string,
  pageId: string,
  commentId: string,
  text: string,
): Promise<GraphResult<{ message_id?: string }>> {
  return graphFetch(
    `${FB_HOST}/${V}/${encodeURIComponent(pageId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pageToken}` },
      body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    },
    [pageToken],
  );
}
