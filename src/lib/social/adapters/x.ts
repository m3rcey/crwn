/**
 * X (Twitter) adapter.
 *
 * Pay-per-use: roughly $0.015 per post, and $0.20 if the post contains a link. CRWN's captions
 * use a comment-to-DM keyword rather than a URL, which keeps them on the cheap rate. Nothing
 * here inserts a link on your behalf.
 *
 * SHAPES
 *   text       POST /2/tweets { text }
 *   image /
 *   carousel   upload each image (media/upload), then one tweet with media_ids (max 4)
 *   video      chunked upload (INIT / APPEND / FINALIZE), poll processing, then tweet
 *   thread     one tweet per part, each replying to the previous; the FIRST is the post id
 *   article    POST /2/articles/draft { title, content_state } then POST /2/articles/{id}/publish
 *              (requires X Premium on the account)
 *
 * AUTH: OAuth 1.0a user context, signed per request. No SDK; the signature is ~40 lines and
 * pulling a dependency in for it would be the only new package in this feature.
 */

import { createHmac, randomBytes } from 'node:crypto';
import {
  type PlatformAdapter,
  type PublishRequest,
  type PublishResult,
  PublishError,
  classifyHttp,
  redactSecrets,
  requireString,
  pollUntil,
} from '../adapter';

interface XConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
  username?: string;
}

function configFromEnv(env: Record<string, string | undefined>): XConfig {
  const c = {
    apiKey: (env.X_API_KEY || '').trim(),
    apiSecret: (env.X_API_SECRET || '').trim(),
    accessToken: (env.X_ACCESS_TOKEN || '').trim(),
    accessSecret: (env.X_ACCESS_SECRET || '').trim(),
    username: (env.X_USERNAME || '').trim() || undefined,
  };
  if (!c.apiKey || !c.apiSecret || !c.accessToken || !c.accessSecret) {
    throw new PublishError(
      'X credentials are not configured (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET)',
      { retryable: false, kind: 'auth', message: 'missing credentials' }
    );
  }
  return c;
}

const pct = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());

/** OAuth 1.0a HMAC-SHA1 Authorization header. Body params are only signed for form bodies. */
function oauthHeader(cfg: XConfig, method: string, url: string, formParams: Record<string, string> = {}): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: cfg.apiKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: cfg.accessToken,
    oauth_version: '1.0',
  };
  const all = { ...oauth, ...formParams };
  const paramString = Object.keys(all)
    .sort()
    .map((k) => `${pct(k)}=${pct(all[k])}`)
    .join('&');
  const baseString = `${method.toUpperCase()}&${pct(url)}&${pct(paramString)}`;
  const key = `${pct(cfg.apiSecret)}&${pct(cfg.accessSecret)}`;
  oauth.oauth_signature = createHmac('sha1', key).update(baseString).digest('base64');
  return (
    'OAuth ' +
    Object.keys(oauth)
      .sort()
      .map((k) => `${pct(k)}="${pct(oauth[k])}"`)
      .join(', ')
  );
}

const SECRETS = (cfg: XConfig) => [cfg.apiSecret, cfg.accessToken, cfg.accessSecret];

async function xJson(cfg: XConfig, method: 'GET' | 'POST', url: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: oauthHeader(cfg, method, url),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  if (!res.ok) {
    const detail = (json.detail ?? json.title ?? (json.errors as unknown[])?.[0]) as unknown;
    const message = redactSecrets(typeof detail === 'string' ? detail : JSON.stringify(detail ?? `HTTP ${res.status}`), SECRETS(cfg));
    const c = classifyHttp(res.status, message);
    throw new PublishError(`X ${method} ${url.replace('https://api.x.com', '')} failed [${c.kind}]: ${message}`, c);
  }
  return json;
}

async function fetchBytes(url: string): Promise<{ buf: Buffer; type: string }> {
  const r = await fetch(url);
  if (!r.ok) {
    throw new PublishError(`could not fetch media for upload (HTTP ${r.status})`, {
      retryable: r.status >= 500,
      kind: 'media_fetch',
      message: `HTTP ${r.status}`,
    });
  }
  return { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || 'application/octet-stream' };
}

/** Simple (non-chunked) image upload. */
async function uploadImage(cfg: XConfig, url: string): Promise<string> {
  const { buf } = await fetchBytes(url);
  const endpoint = 'https://upload.twitter.com/1.1/media/upload.json';
  const form = new FormData();
  form.append('media_data', buf.toString('base64'));
  const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: oauthHeader(cfg, 'POST', endpoint) }, body: form });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.media_id_string) {
    throw new PublishError(`X image upload failed (HTTP ${res.status})`, classifyHttp(res.status, 'image upload failed'));
  }
  return String(json.media_id_string);
}

/** Chunked video upload: INIT, APPEND per chunk, FINALIZE, then poll STATUS until succeeded. */
async function uploadVideo(cfg: XConfig, url: string): Promise<string> {
  const { buf, type } = await fetchBytes(url);
  const endpoint = 'https://upload.twitter.com/1.1/media/upload.json';
  const auth = () => ({ Authorization: oauthHeader(cfg, 'POST', endpoint) });

  const init = new FormData();
  init.append('command', 'INIT');
  init.append('media_type', type.startsWith('video/') ? type : 'video/mp4');
  init.append('total_bytes', String(buf.length));
  init.append('media_category', 'tweet_video');
  const initRes = await fetch(endpoint, { method: 'POST', headers: auth(), body: init });
  const initJson = (await initRes.json().catch(() => ({}))) as Record<string, unknown>;
  if (!initRes.ok || !initJson.media_id_string) {
    throw new PublishError(`X video INIT failed (HTTP ${initRes.status})`, classifyHttp(initRes.status, 'video init failed'));
  }
  const mediaId = String(initJson.media_id_string);

  const CHUNK = 4 * 1024 * 1024;
  for (let i = 0, seg = 0; i < buf.length; i += CHUNK, seg++) {
    const part = new FormData();
    part.append('command', 'APPEND');
    part.append('media_id', mediaId);
    part.append('segment_index', String(seg));
    // Neither a Node Buffer nor a view over its (possibly Shared) ArrayBuffer satisfies BlobPart
    // under strict lib typing. Copying the chunk into a fresh ArrayBuffer is unambiguous, and at
    // 4MB per chunk the copy is not what makes a video upload slow.
    const chunk = buf.subarray(i, i + CHUNK);
    const owned = new ArrayBuffer(chunk.length);
    new Uint8Array(owned).set(chunk);
    part.append('media', new Blob([owned]));
    const r = await fetch(endpoint, { method: 'POST', headers: auth(), body: part });
    if (!r.ok) throw new PublishError(`X video APPEND ${seg} failed (HTTP ${r.status})`, classifyHttp(r.status, 'video append failed'));
  }

  const fin = new FormData();
  fin.append('command', 'FINALIZE');
  fin.append('media_id', mediaId);
  const finRes = await fetch(endpoint, { method: 'POST', headers: auth(), body: fin });
  if (!finRes.ok) throw new PublishError(`X video FINALIZE failed (HTTP ${finRes.status})`, classifyHttp(finRes.status, 'video finalize failed'));

  await pollUntil(async () => {
    const q = `${endpoint}?command=STATUS&media_id=${mediaId}`;
    const r = await fetch(q, { headers: { Authorization: oauthHeader(cfg, 'GET', endpoint, { command: 'STATUS', media_id: mediaId }) } });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    const info = (j.processing_info ?? {}) as Record<string, unknown>;
    const state = String(info.state ?? 'succeeded');
    if (state === 'succeeded') return { done: true, ok: true };
    if (state === 'failed') return { done: true, ok: false, message: JSON.stringify(info.error ?? 'processing failed') };
    return { done: false, ok: true };
  }, `X video ${mediaId} processing`, 60, 3000);

  return mediaId;
}

async function tweet(cfg: XConfig, body: Record<string, unknown>): Promise<string> {
  const r = await xJson(cfg, 'POST', 'https://api.x.com/2/tweets', body);
  const data = (r.data ?? {}) as Record<string, unknown>;
  if (!data.id) {
    throw new PublishError('X returned no tweet id', { retryable: false, kind: 'permanent', message: 'no id in response' });
  }
  return String(data.id);
}

export function createXAdapter(env: Record<string, string | undefined> = process.env): PlatformAdapter {
  return {
    platform: 'x',
    supportsNativeScheduling: false,

    async publish(req: PublishRequest): Promise<PublishResult> {
      const cfg = configFromEnv(env);
      const link = (id: string) => (cfg.username ? `https://x.com/${cfg.username}/status/${id}` : null);

      switch (req.kind) {
        case 'text': {
          const id = await tweet(cfg, { text: req.caption });
          return { providerPostId: id, permalink: link(id) };
        }
        case 'image':
        case 'carousel': {
          const ids: string[] = [];
          for (const url of req.mediaUrls.slice(0, 4)) ids.push(await uploadImage(cfg, url));
          const id = await tweet(cfg, { text: req.caption, media: { media_ids: ids } });
          return { providerPostId: id, permalink: link(id) };
        }
        case 'video_short': {
          const mediaId = await uploadVideo(cfg, req.mediaUrls[0]);
          const id = await tweet(cfg, { text: req.caption, media: { media_ids: [mediaId] } });
          return { providerPostId: id, permalink: link(id) };
        }
        case 'thread': {
          const parts = Array.isArray(req.payload.parts) ? (req.payload.parts as unknown[]).map(String) : [];
          if (parts.length < 2) {
            throw new PublishError('an X thread needs payload.parts with at least two entries', {
              retryable: false,
              kind: 'permanent',
              message: 'thread too short',
            });
          }
          // The first part may carry the media. Every later part replies to the one before it.
          let mediaIds: string[] | undefined;
          if (req.mediaUrls.length) {
            mediaIds = [];
            for (const url of req.mediaUrls.slice(0, 4)) mediaIds.push(await uploadImage(cfg, url));
          }
          const first = await tweet(cfg, { text: parts[0], ...(mediaIds ? { media: { media_ids: mediaIds } } : {}) });
          let prev = first;
          for (const part of parts.slice(1)) {
            prev = await tweet(cfg, { text: part, reply: { in_reply_to_tweet_id: prev } });
          }
          return { providerPostId: first, permalink: link(first), providerResponse: { parts: parts.length } };
        }
        case 'article': {
          const title = requireString(req.payload, 'title', 'X article');
          const blocks = Array.isArray(req.payload.blocks) ? (req.payload.blocks as unknown[]) : null;
          if (!blocks) {
            throw new PublishError('an X article needs payload.title and payload.blocks (DraftJS content_state blocks)', {
              retryable: false,
              kind: 'permanent',
              message: 'missing article body',
            });
          }
          const draft = await xJson(cfg, 'POST', 'https://api.x.com/2/articles/draft', {
            title,
            content_state: { blocks, entityMap: req.payload.entityMap ?? {} },
          });
          const draftId = String(((draft.data ?? {}) as Record<string, unknown>).id ?? '');
          if (!draftId) {
            throw new PublishError('X returned no article draft id', { retryable: false, kind: 'permanent', message: 'no draft id' });
          }
          const pub = await xJson(cfg, 'POST', `https://api.x.com/2/articles/${draftId}/publish`, {});
          const id = String(((pub.data ?? {}) as Record<string, unknown>).id ?? draftId);
          return { providerPostId: id, permalink: link(id) };
        }
        default:
          throw new PublishError(`X cannot publish ${req.kind}`, {
            retryable: false,
            kind: 'permanent',
            message: 'unsupported kind',
          });
      }
    },
  };
}
