/**
 * YouTube adapter (Data API v3, videos.insert with a resumable upload).
 *
 * THIS ADAPTER MUST NEVER RUN BEFORE THE AUDIT PASSES. Uploads from an unverified API project are
 * locked to private and the creator receives an email saying so, while the API reports success.
 * The capability matrix refuses YouTube until YOUTUBE_AUDIT_PASSED=true, and this adapter refuses
 * on its own as well, so nothing can reach the upload by bypassing the matrix.
 *
 * SHORTS AND LONG-FORM ARE THE SAME ENDPOINT. A Short is a vertical video of three minutes or
 * less; YouTube classifies it, not the caller. The `kind` only decides defaults here.
 *
 * NATIVE SCHEDULING: `status.publishAt` with `privacyStatus=private` publishes on YouTube's clock.
 * Used whenever a future slot is given, for the same reason Facebook's is: CRWN downtime can no
 * longer miss the post.
 *
 * COMMUNITY POSTS CANNOT BE PUBLISHED. There is no create endpoint in the Data API and never has
 * been. Recorded in capabilities.ts UNSUPPORTED; this adapter does not pretend otherwise.
 *
 * AUTH: OAuth 2.0 with a refresh token. The access token is minted per publish from the refresh
 * token, so nothing long-lived beyond the refresh token itself is stored anywhere.
 */

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

interface YouTubeConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

function configFromEnv(env: Record<string, string | undefined>): YouTubeConfig {
  if (String(env.YOUTUBE_AUDIT_PASSED ?? '').trim().toLowerCase() !== 'true') {
    throw new PublishError(
      'YouTube locks uploads from an unverified project to private and reports success while doing so. Refusing. Set YOUTUBE_AUDIT_PASSED=true only once the compliance audit is genuinely approved.',
      { retryable: false, kind: 'audit_required', message: 'audit not recorded' }
    );
  }
  const c = {
    clientId: (env.YOUTUBE_CLIENT_ID || '').trim(),
    clientSecret: (env.YOUTUBE_CLIENT_SECRET || '').trim(),
    refreshToken: (env.YOUTUBE_REFRESH_TOKEN || '').trim(),
  };
  if (!c.clientId || !c.clientSecret || !c.refreshToken) {
    throw new PublishError('YouTube credentials are not configured (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)', {
      retryable: false,
      kind: 'auth',
      message: 'missing credentials',
    });
  }
  return c;
}

async function accessToken(cfg: YouTubeConfig): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== 'string') {
    const message = redactSecrets(String(json.error_description ?? json.error ?? `HTTP ${res.status}`), [cfg.clientSecret, cfg.refreshToken]);
    throw new PublishError(`YouTube token refresh failed: ${message}`, { retryable: false, kind: 'auth', message });
  }
  return json.access_token;
}

export function createYouTubeAdapter(env: Record<string, string | undefined> = process.env): PlatformAdapter {
  return {
    platform: 'youtube',
    supportsNativeScheduling: true,

    async publish(req: PublishRequest): Promise<PublishResult> {
      if (req.kind !== 'video_short' && req.kind !== 'video_long') {
        throw new PublishError(`YouTube cannot publish ${req.kind}; it takes video only`, {
          retryable: false,
          kind: 'permanent',
          message: 'unsupported kind',
        });
      }
      const cfg = configFromEnv(env);
      const token = await accessToken(cfg);
      const title = requireString(req.payload, 'title', 'YouTube');
      const handedOff = !!req.scheduledFor && req.scheduledFor.getTime() > Date.now() + 60_000;

      // Fetch the rendered video from R2 so it can be streamed into the resumable upload.
      const src = await fetch(req.mediaUrls[0]);
      if (!src.ok) {
        throw new PublishError(`could not fetch video for upload (HTTP ${src.status})`, {
          retryable: src.status >= 500,
          kind: 'media_fetch',
          message: `HTTP ${src.status}`,
        });
      }
      const bytes = Buffer.from(await src.arrayBuffer());

      const metadata = {
        snippet: {
          title: title.slice(0, 100),
          description: req.caption.slice(0, 5000),
          ...(Array.isArray(req.payload.tags) ? { tags: (req.payload.tags as unknown[]).map(String).slice(0, 500) } : {}),
          ...(typeof req.payload.categoryId === 'string' ? { categoryId: req.payload.categoryId } : {}),
        },
        status: {
          privacyStatus: handedOff ? 'private' : typeof req.payload.privacyStatus === 'string' ? req.payload.privacyStatus : 'public',
          ...(handedOff ? { publishAt: req.scheduledFor!.toISOString() } : {}),
          selfDeclaredMadeForKids: false,
        },
      };

      // Step 1: open a resumable session.
      const open = await fetch(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(bytes.length),
            'X-Upload-Content-Type': src.headers.get('content-type') || 'video/mp4',
          },
          body: JSON.stringify(metadata),
        }
      );
      if (!open.ok) {
        const j = (await open.json().catch(() => ({}))) as Record<string, unknown>;
        const e = ((j.error ?? {}) as Record<string, unknown>);
        const message = redactSecrets(String(e.message ?? `HTTP ${open.status}`), [token]);
        const reason = String(((e.errors as unknown[])?.[0] as Record<string, unknown> | undefined)?.reason ?? '');
        const c =
          reason === 'quotaExceeded' || reason === 'uploadLimitExceeded'
            ? { retryable: true, kind: 'rate_limit' as const, message, code: reason }
            : classifyHttp(open.status, message, reason);
        throw new PublishError(`YouTube upload open failed [${c.kind}]: ${message}`, c);
      }
      const session = open.headers.get('location');
      if (!session) {
        throw new PublishError('YouTube returned no resumable session URL', { retryable: true, kind: 'server', message: 'no session' });
      }

      // Step 2: send the bytes. Single request; the resumable session tolerates a retry with a
      // Content-Range query if this ever needs to become chunked.
      const put = await fetch(session, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Length': String(bytes.length) },
        body: bytes,
      });
      const uploaded = (await put.json().catch(() => ({}))) as Record<string, unknown>;
      if (!put.ok || typeof uploaded.id !== 'string') {
        const message = redactSecrets(JSON.stringify(uploaded).slice(0, 300), [token]);
        throw new PublishError(`YouTube upload failed (HTTP ${put.status}): ${message}`, classifyHttp(put.status, message));
      }
      const videoId = uploaded.id;

      // Step 3: wait for processing. A video that fails processing never becomes watchable, and
      // that is the outcome a "published" row must not claim.
      await pollUntil(async () => {
        const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=processingDetails,status&id=${videoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        const item = ((j.items as unknown[])?.[0] ?? {}) as Record<string, unknown>;
        const pd = (item.processingDetails ?? {}) as Record<string, unknown>;
        const st = (item.status ?? {}) as Record<string, unknown>;
        const status = String(pd.processingStatus ?? 'succeeded');
        if (st.uploadStatus === 'rejected' || status === 'failed') {
          return { done: true, ok: false, message: String(st.rejectionReason ?? pd.processingFailureReason ?? 'processing failed') };
        }
        if (status === 'succeeded' || st.uploadStatus === 'processed') return { done: true, ok: true };
        return { done: false, ok: true };
      }, `YouTube video ${videoId} processing`, 60, 5000);

      return {
        providerPostId: videoId,
        permalink: `https://www.youtube.com/watch?v=${videoId}`,
        handedOff,
      };
    },
  };
}
