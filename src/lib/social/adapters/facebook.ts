/**
 * Facebook Page adapter.
 *
 * Shares the Meta app with Instagram, so it needs no separate approval. It is also the only
 * platform here with NATIVE scheduling: hand it `published=false` plus `scheduled_publish_time`
 * and Facebook publishes on its own clock. That is strictly more reliable than CRWN's tick, so
 * the adapter uses it whenever a future slot is provided.
 *
 * SHAPES
 *   image      POST /{page}/photos  { url, message }
 *   carousel   one unpublished photo per image, then POST /{page}/feed with attached_media
 *   video      POST /{page}/videos  { file_url, description }   (short and long, same endpoint)
 *   text       POST /{page}/feed    { message }
 *
 * CREDENTIALS: a PAGE access token, not the user token. FB_PAGE_ID names the page.
 */

import {
  type PlatformAdapter,
  type PublishRequest,
  type PublishResult,
  PublishError,
  classifyHttp,
  redactSecrets,
} from '../adapter';

interface FacebookConfig {
  pageId: string;
  pageAccessToken: string;
  version: string;
}

function configFromEnv(env: Record<string, string | undefined>): FacebookConfig {
  const pageId = (env.FB_PAGE_ID || '').trim();
  const pageAccessToken = (env.FB_PAGE_ACCESS_TOKEN || '').trim();
  if (!pageId || !pageAccessToken) {
    throw new PublishError('Facebook credentials are not configured (FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN)', {
      retryable: false,
      kind: 'auth',
      message: 'missing credentials',
    });
  }
  return { pageId, pageAccessToken, version: (env.GRAPH_API_VERSION || 'v26.0').trim() };
}

async function graph(
  cfg: FacebookConfig,
  endpoint: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: cfg.pageAccessToken });
  const res = await fetch(`https://graph.facebook.com/${cfg.version}/${endpoint}`, { method: 'POST', body });
  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = { error: { message: `non-JSON response, HTTP ${res.status}` } };
  }
  if (!res.ok || json.error) {
    const err = (json.error ?? {}) as Record<string, unknown>;
    const code = typeof err.code === 'number' ? err.code : undefined;
    const message = redactSecrets(String(err.message ?? `HTTP ${res.status}`), [cfg.pageAccessToken]);
    // Meta's app-level rate limit codes, same as Instagram.
    const c =
      code === 4 || code === 17 || code === 32 || code === 613
        ? { retryable: true, kind: 'rate_limit' as const, message, code }
        : code === 190 || code === 102 || code === 10 || code === 200
          ? { retryable: false, kind: 'auth' as const, message, code }
          : classifyHttp(res.status, message, code);
    throw new PublishError(`Facebook ${endpoint} failed [${c.kind}]: ${message}`, c);
  }
  return json;
}

/** Facebook accepts scheduled_publish_time as a UNIX timestamp, at least 10 minutes out. */
function scheduleParams(scheduledFor?: Date): Record<string, string> {
  if (!scheduledFor) return {};
  const minAhead = Date.now() + 10 * 60 * 1000;
  if (scheduledFor.getTime() < minAhead) return {}; // too soon to hand off; publish now instead
  return {
    published: 'false',
    scheduled_publish_time: String(Math.floor(scheduledFor.getTime() / 1000)),
  };
}

export function createFacebookAdapter(env: Record<string, string | undefined> = process.env): PlatformAdapter {
  return {
    platform: 'facebook',
    supportsNativeScheduling: true,

    async publish(req: PublishRequest): Promise<PublishResult> {
      const cfg = configFromEnv(env);
      const sched = scheduleParams(req.scheduledFor);
      const handedOff = Object.keys(sched).length > 0;

      let id: string;
      switch (req.kind) {
        case 'image': {
          const r = await graph(cfg, `${cfg.pageId}/photos`, { url: req.mediaUrls[0], message: req.caption, ...sched });
          id = String(r.post_id ?? r.id);
          break;
        }
        case 'carousel': {
          // Each image becomes an unpublished photo, then one feed post attaches them all.
          const mediaIds: string[] = [];
          for (const url of req.mediaUrls) {
            const r = await graph(cfg, `${cfg.pageId}/photos`, { url, published: 'false' });
            mediaIds.push(String(r.id));
          }
          const params: Record<string, string> = { message: req.caption, ...sched };
          mediaIds.forEach((m, i) => {
            params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: m });
          });
          const r = await graph(cfg, `${cfg.pageId}/feed`, params);
          id = String(r.id);
          break;
        }
        case 'video_short':
        case 'video_long': {
          const r = await graph(cfg, `${cfg.pageId}/videos`, {
            file_url: req.mediaUrls[0],
            description: req.caption,
            ...(typeof req.payload.title === 'string' ? { title: req.payload.title } : {}),
            ...sched,
          });
          id = String(r.id);
          break;
        }
        case 'text': {
          const r = await graph(cfg, `${cfg.pageId}/feed`, { message: req.caption, ...sched });
          id = String(r.id);
          break;
        }
        default:
          throw new PublishError(`Facebook cannot publish ${req.kind}`, {
            retryable: false,
            kind: 'permanent',
            message: 'unsupported kind',
          });
      }

      return {
        providerPostId: id,
        permalink: `https://www.facebook.com/${id}`,
        handedOff,
      };
    },
  };
}
