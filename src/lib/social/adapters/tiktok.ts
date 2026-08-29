/**
 * TikTok adapter (Content Posting API, direct post).
 *
 * THIS ADAPTER MUST NEVER RUN BEFORE THE AUDIT PASSES. An unaudited client's posts are forced to
 * SELF_ONLY visibility and the API still reports success, so publishing early creates content
 * nobody can see while the queue claims it shipped. The capability matrix
 * (src/lib/social/capabilities.ts) refuses TikTok until TIKTOK_AUDIT_PASSED=true; the tick checks
 * that before this file is reached. This adapter additionally refuses to run without the flag, so
 * a caller that bypasses the matrix still cannot publish privately by accident.
 *
 * SHAPES
 *   video_short   POST /v2/post/publish/video/init/  with source_info.source=PULL_FROM_URL
 *   carousel      POST /v2/post/publish/content/init/ with post_mode=DIRECT_POST, media_type=PHOTO
 *   then poll     POST /v2/post/publish/status/fetch/ until PUBLISH_COMPLETE
 *
 * PULL_FROM_URL requires the media host to be VERIFIED in the TikTok developer portal. R2's public
 * domain has to be added there once; until it is, TikTok answers url_ownership_unverified, which
 * this adapter reports as permanent with the fix named.
 *
 * LIMITS: roughly 15 to 25 posts per account per day, shared across all API clients. Even audited,
 * TikTok cannot take a 50-a-day cadence.
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

interface TikTokConfig {
  accessToken: string;
}

function configFromEnv(env: Record<string, string | undefined>): TikTokConfig {
  if (String(env.TIKTOK_AUDIT_PASSED ?? '').trim().toLowerCase() !== 'true') {
    throw new PublishError(
      'TikTok publishes PRIVATELY until its audit passes and reports success while doing so. Refusing. Set TIKTOK_AUDIT_PASSED=true only once the audit is genuinely approved.',
      { retryable: false, kind: 'audit_required', message: 'audit not recorded' }
    );
  }
  const accessToken = (env.TIKTOK_ACCESS_TOKEN || '').trim();
  if (!accessToken) {
    throw new PublishError('TikTok credentials are not configured (TIKTOK_ACCESS_TOKEN)', {
      retryable: false,
      kind: 'auth',
      message: 'missing credentials',
    });
  }
  return { accessToken };
}

async function tt(cfg: TikTokConfig, path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`https://open.tiktokapis.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const err = (json.error ?? {}) as Record<string, unknown>;
  const code = String(err.code ?? 'ok');
  if (!res.ok || (code && code !== 'ok')) {
    const message = redactSecrets(String(err.message ?? `HTTP ${res.status}`), [cfg.accessToken]);
    let c;
    if (code === 'rate_limit_exceeded' || res.status === 429) c = { retryable: true, kind: 'rate_limit' as const, message, code };
    else if (code === 'access_token_invalid' || code === 'scope_not_authorized') c = { retryable: false, kind: 'auth' as const, message, code };
    else if (code === 'url_ownership_unverified') {
      c = {
        retryable: false,
        kind: 'media_fetch' as const,
        message: `${message}. Add the R2 public domain under URL properties in the TikTok developer portal.`,
        code,
      };
    } else if (code === 'spam_risk_too_many_posts' || code === 'reached_active_user_cap') c = { retryable: true, kind: 'rate_limit' as const, message, code };
    else c = classifyHttp(res.status, message, code);
    throw new PublishError(`TikTok ${path} failed [${c.kind}]: ${message}`, c);
  }
  return json;
}

export function createTikTokAdapter(env: Record<string, string | undefined> = process.env): PlatformAdapter {
  return {
    platform: 'tiktok',
    supportsNativeScheduling: false,

    async publish(req: PublishRequest): Promise<PublishResult> {
      const cfg = configFromEnv(env);
      const title = req.caption.slice(0, 2200);
      const privacy = typeof req.payload.privacyLevel === 'string' ? req.payload.privacyLevel : 'PUBLIC_TO_EVERYONE';

      let publishId: string;
      switch (req.kind) {
        case 'video_short': {
          const r = await tt(cfg, '/v2/post/publish/video/init/', {
            post_info: {
              title,
              privacy_level: privacy,
              disable_duet: false,
              disable_comment: false,
              disable_stitch: false,
            },
            source_info: { source: 'PULL_FROM_URL', video_url: req.mediaUrls[0] },
          });
          publishId = String(((r.data ?? {}) as Record<string, unknown>).publish_id ?? '');
          break;
        }
        case 'carousel': {
          const r = await tt(cfg, '/v2/post/publish/content/init/', {
            post_info: { title, privacy_level: privacy, disable_comment: false },
            source_info: { source: 'PULL_FROM_URL', photo_images: req.mediaUrls.slice(0, 35), photo_cover_index: 0 },
            post_mode: 'DIRECT_POST',
            media_type: 'PHOTO',
          });
          publishId = String(((r.data ?? {}) as Record<string, unknown>).publish_id ?? '');
          break;
        }
        default:
          throw new PublishError(`TikTok cannot publish ${req.kind}`, {
            retryable: false,
            kind: 'permanent',
            message: 'unsupported kind',
          });
      }
      if (!publishId) {
        throw new PublishError('TikTok returned no publish_id', { retryable: false, kind: 'permanent', message: 'no publish id' });
      }

      // TikTok pulls the media and processes it asynchronously. The post does not exist until
      // status says PUBLISH_COMPLETE, and a FAILED status carries the reason.
      const itemId = await pollUntil<string>(async () => {
        const s = await tt(cfg, '/v2/post/publish/status/fetch/', { publish_id: publishId });
        const d = (s.data ?? {}) as Record<string, unknown>;
        const status = String(d.status ?? '');
        if (status === 'PUBLISH_COMPLETE') {
          const ids = Array.isArray(d.publicaly_available_post_id) ? d.publicaly_available_post_id : [];
          return { done: true, ok: true, value: String(ids[0] ?? publishId) };
        }
        if (status === 'FAILED') return { done: true, ok: false, message: String(d.fail_reason ?? 'publish failed') };
        return { done: false, ok: true };
      }, `TikTok publish ${publishId}`, 40, 3000);

      return {
        providerPostId: itemId ?? publishId,
        permalink: null,
        providerResponse: { publish_id: publishId },
      };
    },
  };
}
