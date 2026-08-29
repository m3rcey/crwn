/**
 * Threads adapter.
 *
 * graph.threads.net, with the same two-step container model as Instagram: create a container,
 * poll it, publish it. No app review is needed to publish to an account holding a role on your
 * own Meta app. Cap is 250 posts per 24 hours.
 *
 * THE CONSTRAINT THAT BITES: a Threads post is 500 characters. CRWN's Instagram captions run 1,700
 * to 2,200, so a caption cannot be reposted here unchanged. The capability matrix refuses it
 * before this adapter is reached; this adapter trusts that and does not re-check.
 *
 * SHAPES
 *   text       one container, media_type=TEXT
 *   image      one container, media_type=IMAGE
 *   video      one container, media_type=VIDEO
 *   carousel   one child container per item (is_carousel_item=true), then a CAROUSEL parent
 */

import {
  type PlatformAdapter,
  type PublishRequest,
  type PublishResult,
  PublishError,
  classifyHttp,
  redactSecrets,
  pollUntil,
} from '../adapter';

interface ThreadsConfig {
  userId: string;
  accessToken: string;
  version: string;
}

function configFromEnv(env: Record<string, string | undefined>): ThreadsConfig {
  const userId = (env.THREADS_USER_ID || '').trim();
  const accessToken = (env.THREADS_ACCESS_TOKEN || '').trim();
  if (!userId || !accessToken) {
    throw new PublishError('Threads credentials are not configured (THREADS_USER_ID, THREADS_ACCESS_TOKEN)', {
      retryable: false,
      kind: 'auth',
      message: 'missing credentials',
    });
  }
  return { userId, accessToken, version: (env.THREADS_API_VERSION || 'v1.0').trim() };
}

async function graph(
  cfg: ThreadsConfig,
  method: 'GET' | 'POST',
  endpoint: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: cfg.accessToken });
  const url = `https://graph.threads.net/${cfg.version}/${endpoint}`;
  const res = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method: 'POST', body });
  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = { error: { message: `non-JSON response, HTTP ${res.status}` } };
  }
  if (!res.ok || json.error) {
    const err = (json.error ?? {}) as Record<string, unknown>;
    const code = typeof err.code === 'number' ? err.code : undefined;
    const message = redactSecrets(String(err.message ?? `HTTP ${res.status}`), [cfg.accessToken]);
    const c =
      code === 4 || code === 17 || code === 32
        ? { retryable: true, kind: 'rate_limit' as const, message, code }
        : code === 190
          ? { retryable: false, kind: 'auth' as const, message, code }
          : classifyHttp(res.status, message, code);
    throw new PublishError(`Threads ${method} ${endpoint} failed [${c.kind}]: ${message}`, c);
  }
  return json;
}

async function waitForContainer(cfg: ThreadsConfig, id: string, label: string) {
  await pollUntil(async () => {
    const s = await graph(cfg, 'GET', id, { fields: 'status,error_message' });
    const status = String(s.status ?? '');
    if (status === 'FINISHED') return { done: true, ok: true };
    if (status === 'ERROR' || status === 'EXPIRED') {
      return { done: true, ok: false, message: String(s.error_message ?? status) };
    }
    return { done: false, ok: true };
  }, `Threads ${label} container ${id}`);
}

export function createThreadsAdapter(env: Record<string, string | undefined> = process.env): PlatformAdapter {
  return {
    platform: 'threads',
    supportsNativeScheduling: false,

    async publish(req: PublishRequest): Promise<PublishResult> {
      const cfg = configFromEnv(env);
      const base = `${cfg.userId}/threads`;
      let containerId: string;

      switch (req.kind) {
        case 'text': {
          const r = await graph(cfg, 'POST', base, { media_type: 'TEXT', text: req.caption });
          containerId = String(r.id);
          break;
        }
        case 'image': {
          const r = await graph(cfg, 'POST', base, { media_type: 'IMAGE', image_url: req.mediaUrls[0], text: req.caption });
          containerId = String(r.id);
          break;
        }
        case 'video_short': {
          const r = await graph(cfg, 'POST', base, { media_type: 'VIDEO', video_url: req.mediaUrls[0], text: req.caption });
          containerId = String(r.id);
          break;
        }
        case 'carousel': {
          const children: string[] = [];
          for (const url of req.mediaUrls) {
            const r = await graph(cfg, 'POST', base, { media_type: 'IMAGE', image_url: url, is_carousel_item: 'true' });
            children.push(String(r.id));
          }
          for (let i = 0; i < children.length; i++) await waitForContainer(cfg, children[i], `child ${i + 1}`);
          const r = await graph(cfg, 'POST', base, {
            media_type: 'CAROUSEL',
            children: children.join(','),
            text: req.caption,
          });
          containerId = String(r.id);
          break;
        }
        default:
          throw new PublishError(`Threads cannot publish ${req.kind}`, {
            retryable: false,
            kind: 'permanent',
            message: 'unsupported kind',
          });
      }

      await waitForContainer(cfg, containerId, 'post');
      const published = await graph(cfg, 'POST', `${cfg.userId}/threads_publish`, { creation_id: containerId });
      const id = String(published.id);

      let permalink: string | null = null;
      try {
        const d = await graph(cfg, 'GET', id, { fields: 'permalink' });
        permalink = typeof d.permalink === 'string' ? d.permalink : null;
      } catch {
        // The post exists. A failed read-back must never be treated as a failed publish.
      }
      return { providerPostId: id, permalink };
    },
  };
}
