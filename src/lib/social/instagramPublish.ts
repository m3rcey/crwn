/**
 * Instagram carousel publishing, server side.
 *
 * Used by /api/cron/publish-tick. The Phase 0 script (scripts/test-instagram-carousel-publish.mjs)
 * keeps its own copy of the immediate-publish path because a .mjs cannot import TypeScript; this
 * module is the canonical one for anything that runs on the server.
 *
 * TWO HOSTS, ONE SHAPE. Instagram publishing lives on graph.instagram.com for tokens issued by
 * Instagram Login (they begin "IGAA") and graph.facebook.com for tokens issued by Facebook Login
 * ("EAA"). Sending a token to the wrong host returns code 190 "Cannot parse access token", which
 * reads exactly like an expired credential and is not. The host is configuration, never guessed.
 */

/** Instagram's published limits, from the official Meta reference. */
export const IG_LIMITS = {
  minAspectRatio: 0.8,
  maxAspectRatio: 1.91,
  maxWidth: 1440,
  maxFileBytes: 8 * 1024 * 1024,
  minCarouselItems: 2,
  maxCarouselItems: 10,
  maxCaptionChars: 2200,
} as const;

export type GraphErrorKind =
  | 'rate_limit'
  | 'server'
  | 'auth'
  | 'media_fetch'
  | 'media_format'
  | 'permanent';

export interface GraphErrorClassification {
  retryable: boolean;
  kind: GraphErrorKind;
  message: string;
  code?: number;
  subcode?: number;
}

/**
 * Decide whether a failure is worth retrying.
 *
 * Wrong in either direction is expensive: retrying a permanent failure burns the 100-posts-per-24h
 * budget and can starve valid posts, while giving up on a transient one loses the slot. Unknown
 * failures are treated as PERMANENT, because a human reading a failed row is safer than a loop
 * hammering Meta with something it will never accept.
 */
export function classifyGraphError(status: number, body: unknown): GraphErrorClassification {
  const err =
    (body && typeof body === 'object' && 'error' in body
      ? (body as { error?: Record<string, unknown> }).error
      : undefined) ?? {};
  const code = typeof err.code === 'number' ? err.code : undefined;
  const subcode = typeof err.error_subcode === 'number' ? err.error_subcode : undefined;
  const message = typeof err.message === 'string' ? err.message : `HTTP ${status}`;
  const base = { message, code, subcode };

  if (status === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
    return { retryable: true, kind: 'rate_limit', ...base };
  }
  if (status >= 500) return { retryable: true, kind: 'server', ...base };
  if (status === 401 || code === 190 || code === 102 || code === 10 || code === 200) {
    return { retryable: false, kind: 'auth', ...base };
  }
  if (code === 9004 || code === 2207003 || code === 2207032 || code === 2207052) {
    return { retryable: false, kind: 'media_fetch', ...base };
  }
  if (code === 36003 || code === 2207009 || code === 2207010 || code === 2207023) {
    return { retryable: false, kind: 'media_format', ...base };
  }
  return { retryable: false, kind: 'permanent', ...base };
}

export interface ContainerState {
  done: boolean;
  ok: boolean;
  message: string;
}

/** FINISHED is the only state a container may be published from. */
export function interpretContainerStatus(statusCode: string): ContainerState {
  switch (statusCode) {
    case 'FINISHED':
      return { done: true, ok: true, message: 'ready to publish' };
    case 'IN_PROGRESS':
      return { done: false, ok: true, message: 'still processing' };
    case 'ERROR':
      return { done: true, ok: false, message: 'Meta failed to process the media' };
    case 'EXPIRED':
      return { done: true, ok: false, message: 'container expired before publish (24h limit)' };
    case 'PUBLISHED':
      return { done: true, ok: false, message: 'container was already published' };
    default:
      return { done: false, ok: true, message: `unrecognized status ${statusCode}` };
  }
}

/**
 * Remove credentials from anything about to be logged or stored.
 * The token rides in request bodies and query strings, so an unredacted error message would put
 * it into the function log and, worse, into social_posts.last_error.
 */
export function redactSecrets(text: string, secrets: string[] = []): string {
  let out = String(text ?? '');
  for (const s of secrets) {
    if (s && s.length >= 8) out = out.split(s).join('[REDACTED]');
  }
  return out.replace(/(access_token=)[^&\s"']+/gi, '$1[REDACTED]');
}

export class GraphError extends Error {
  classification: GraphErrorClassification;
  /**
   * State the NEXT attempt must resume from instead of starting over. Set by the Reels path once
   * a container exists: a retry that created a second container could publish the video twice.
   */
  resume?: Record<string, string>;
  constructor(message: string, classification: GraphErrorClassification, resume?: Record<string, string>) {
    super(message);
    this.name = 'GraphError';
    this.classification = classification;
    this.resume = resume;
  }
}

export interface InstagramConfig {
  igUserId: string;
  accessToken: string;
  /** graph.instagram.com or graph.facebook.com. */
  host: string;
  version: string;
}

async function graph(
  cfg: InstagramConfig,
  method: 'GET' | 'POST',
  endpoint: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: cfg.accessToken });
  const url = `https://${cfg.host}/${cfg.version}/${endpoint}`;
  const res =
    method === 'GET'
      ? await fetch(`${url}?${body.toString()}`)
      : await fetch(url, { method: 'POST', body });

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = { error: { message: `non-JSON response, HTTP ${res.status}` } };
  }

  if (!res.ok || json.error) {
    const c = classifyGraphError(res.status, json);
    throw new GraphError(
      redactSecrets(
        `Graph ${method} ${endpoint} failed [${c.kind}, ${c.retryable ? 'retryable' : 'permanent'}]: ` +
          `${c.message}${c.code ? ` (code ${c.code}${c.subcode ? `/${c.subcode}` : ''})` : ''}`,
        [cfg.accessToken]
      ),
      c
    );
  }
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForContainer(
  cfg: InstagramConfig,
  id: string,
  label: string,
  maxAttempts = 20,
  intervalMs = 2000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const s = await graph(cfg, 'GET', id, { fields: 'status_code' });
    const state = interpretContainerStatus(String(s.status_code ?? ''));
    if (state.done) {
      if (!state.ok) {
        throw new GraphError(`${label} container ${id}: ${state.message}`, {
          retryable: false,
          kind: 'media_format',
          message: state.message,
        });
      }
      return;
    }
    await sleep(intervalMs);
  }
  // Timing out is retryable: the container may simply still be processing, and the next tick can
  // try again while it remains inside its 24 hour life.
  throw new GraphError(`${label} container ${id} did not finish in time`, {
    retryable: true,
    kind: 'server',
    message: 'container processing timeout',
  });
}

export interface PublishResult {
  mediaId: string;
  permalink: string | null;
  carouselContainerId: string;
  childContainerIds: string[];
}

/**
 * Publish one carousel. `imageUrls` must already be in slide order and publicly fetchable:
 * Meta cURLs each URL itself at container-creation time.
 */
export async function publishCarousel(
  cfg: InstagramConfig,
  imageUrls: string[],
  caption: string
): Promise<PublishResult> {
  if (imageUrls.length < IG_LIMITS.minCarouselItems || imageUrls.length > IG_LIMITS.maxCarouselItems) {
    throw new GraphError(
      `a carousel needs ${IG_LIMITS.minCarouselItems} to ${IG_LIMITS.maxCarouselItems} images, got ${imageUrls.length}`,
      { retryable: false, kind: 'permanent', message: 'bad carousel size' }
    );
  }
  if (caption.length > IG_LIMITS.maxCaptionChars) {
    throw new GraphError(
      `caption is ${caption.length} characters, over Instagram's ${IG_LIMITS.maxCaptionChars} limit`,
      { retryable: false, kind: 'permanent', message: 'caption too long' }
    );
  }

  const childContainerIds: string[] = [];
  for (const url of imageUrls) {
    const r = await graph(cfg, 'POST', `${cfg.igUserId}/media`, {
      image_url: url,
      is_carousel_item: 'true',
    });
    childContainerIds.push(String(r.id));
  }

  for (let i = 0; i < childContainerIds.length; i++) {
    await waitForContainer(cfg, childContainerIds[i], `child ${i + 1}`);
  }

  const carousel = await graph(cfg, 'POST', `${cfg.igUserId}/media`, {
    media_type: 'CAROUSEL',
    children: childContainerIds.join(','),
    caption,
  });
  const carouselContainerId = String(carousel.id);
  await waitForContainer(cfg, carouselContainerId, 'carousel');

  const published = await graph(cfg, 'POST', `${cfg.igUserId}/media_publish`, {
    creation_id: carouselContainerId,
  });
  const mediaId = String(published.id);

  let permalink: string | null = null;
  try {
    const detail = await graph(cfg, 'GET', mediaId, { fields: 'permalink' });
    permalink = typeof detail.permalink === 'string' ? detail.permalink : null;
  } catch {
    // The post exists. Failing to read its permalink back must never be treated as a failed
    // publish, or a retry would post it a second time.
    permalink = null;
  }

  return { mediaId, permalink, carouselContainerId, childContainerIds };
}

export interface ReelOptions {
  /** A container an earlier attempt created. Resumed, never recreated. */
  resumeContainerId?: string;
  /** How long this call may wait on Meta's video processing before handing off to the next tick. */
  pollBudgetMs?: number;
  pollIntervalMs?: number;
  /** Which frame becomes the cover, in milliseconds from the start. */
  thumbOffsetMs?: number;
}

export interface ReelResult {
  mediaId: string;
  permalink: string | null;
  containerId: string;
}

/**
 * Publish one Reel. `videoUrl` must be publicly fetchable: Meta downloads it itself.
 *
 * VIDEO PROCESSING OUTLIVES A FUNCTION. The tick runs under a 60 second ceiling and Meta can take
 * longer than that to transcode a video, so a container still IN_PROGRESS when the budget runs out
 * is handed to the next tick (a retryable error carrying `resume.ig_container_id`), which checks
 * that SAME container rather than uploading again.
 *
 * NEVER A SECOND CONTAINER ONCE ONE EXISTS. Every failure after creation carries the container id,
 * so a retry always resumes it. A resumed container that reads PUBLISHED means an earlier attempt
 * posted it (the response was lost), and that stops permanently: a human checks the account, which
 * is recoverable, where a second post of the same video is not.
 */
export async function publishReel(
  cfg: InstagramConfig,
  videoUrl: string,
  caption: string,
  opts: ReelOptions = {}
): Promise<ReelResult> {
  if (caption.length > IG_LIMITS.maxCaptionChars) {
    throw new GraphError(
      `caption is ${caption.length} characters, over Instagram's ${IG_LIMITS.maxCaptionChars} limit`,
      { retryable: false, kind: 'permanent', message: 'caption too long' }
    );
  }
  const budgetMs = opts.pollBudgetMs ?? 35000;
  const intervalMs = opts.pollIntervalMs ?? 4000;

  let containerId = opts.resumeContainerId?.trim() || '';
  if (!containerId) {
    const params: Record<string, string> = {
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: 'true',
    };
    if (opts.thumbOffsetMs !== undefined && opts.thumbOffsetMs >= 0) {
      params.thumb_offset = String(Math.round(opts.thumbOffsetMs));
    }
    const created = await graph(cfg, 'POST', `${cfg.igUserId}/media`, params);
    containerId = String(created.id);
  }
  const resume = { ig_container_id: containerId };

  try {
    const started = Date.now();
    for (;;) {
      const s = await graph(cfg, 'GET', containerId, { fields: 'status_code,status' });
      const code = String(s.status_code ?? '');
      if (code === 'PUBLISHED') {
        throw new GraphError(
          `reel container ${containerId} is already PUBLISHED; an earlier attempt posted it. Check the account; not retrying`,
          { retryable: false, kind: 'permanent', message: 'container already published' }
        );
      }
      const state = interpretContainerStatus(code);
      if (state.done && state.ok) break;
      if (state.done) {
        const detail = typeof s.status === 'string' && s.status ? ` (${s.status})` : '';
        throw new GraphError(`reel container ${containerId}: ${state.message}${detail}`, {
          retryable: false,
          kind: 'media_format',
          message: state.message,
        });
      }
      if (Date.now() - started + intervalMs > budgetMs) {
        throw new GraphError(`reel container ${containerId} is still processing; the next tick resumes it`, {
          retryable: true,
          kind: 'server',
          message: 'video still processing',
        });
      }
      await sleep(intervalMs);
    }

    const published = await graph(cfg, 'POST', `${cfg.igUserId}/media_publish`, {
      creation_id: containerId,
    });
    const mediaId = String(published.id);

    let permalink: string | null = null;
    try {
      const detail = await graph(cfg, 'GET', mediaId, { fields: 'permalink' });
      permalink = typeof detail.permalink === 'string' ? detail.permalink : null;
    } catch {
      // The post exists. A failed permalink read must never look like a failed publish.
      permalink = null;
    }
    return { mediaId, permalink, containerId };
  } catch (e) {
    if (e instanceof GraphError) {
      e.resume = resume;
      throw e;
    }
    // A network failure mid-publish is unknown, not permanent: resume the same container so the
    // PUBLISHED check above decides, rather than a fresh upload.
    throw new GraphError(redactSecrets(e instanceof Error ? e.message : String(e), [cfg.accessToken]), {
      retryable: true,
      kind: 'server',
      message: 'network failure',
    }, resume);
  }
}

/** Remaining posts in the rolling 24 hour window, or null when Meta does not say. */
export async function readPublishingQuota(
  cfg: InstagramConfig
): Promise<{ used: number; total: number } | null> {
  try {
    const r = await graph(cfg, 'GET', `${cfg.igUserId}/content_publishing_limit`, {
      fields: 'config,quota_usage',
    });
    const row = Array.isArray(r.data) ? (r.data[0] as Record<string, unknown> | undefined) : undefined;
    if (!row) return null;
    const used = Number(row.quota_usage ?? 0);
    const cfgRow = row.config as Record<string, unknown> | undefined;
    const total = Number(cfgRow?.quota_total ?? 100);
    return { used, total };
  } catch {
    return null;
  }
}
