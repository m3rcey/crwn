/**
 * What each platform can actually be asked to publish.
 *
 * ONE TABLE, READ BY EVERYTHING. The ingest command checks it before uploading a byte, the queue
 * checks it before storing a row, and the publishing tick checks it before calling a provider. A
 * surface must never be able to offer a platform something the platform will refuse, because the
 * refusals are not uniform: some are a clean API error, and some are far worse than an error.
 *
 * THE TWO FAILURES THIS EXISTS TO PREVENT.
 *
 * 1. A SILENT PRIVATE POST. TikTok forces every post from an unaudited client to SELF_ONLY, and
 *    YouTube locks uploads from an unverified project to private. Both return SUCCESS. The row
 *    would read "published", the founder would believe the content went out, and nobody would see
 *    it. So an audit-gated platform FAILS CLOSED here until its audit is explicitly recorded.
 *    Refusing to post is recoverable. Believing you posted is not.
 *
 * 2. PROMISING A SURFACE THAT DOES NOT EXIST. YouTube community posts have no create endpoint in
 *    the Data API and never have. No amount of code makes that publishable, so it is recorded as
 *    permanently unsupported rather than left as a gap someone tries to close later.
 *
 * Every entry was verified against current official platform documentation in August 2026.
 */

/** What a piece of content IS, independent of where it goes. */
export type PostKind =
  | 'image' // one still image
  | 'carousel' // several stills in order (CRWN's fan-economy format is 4)
  | 'video_short' // vertical short-form
  | 'video_long' // landscape long-form
  | 'text' // text only
  | 'thread' // several text posts in one chain
  | 'article'; // long-form rich text

export type Platform = 'instagram' | 'facebook' | 'x' | 'tiktok' | 'youtube' | 'threads';

export const PLATFORMS: readonly Platform[] = [
  'instagram',
  'facebook',
  'x',
  'tiktok',
  'youtube',
  'threads',
] as const;

export interface PlatformCapability {
  /** What this platform accepts. Anything absent is refused. */
  kinds: readonly PostKind[];
  /** Max images in one post. 0 where images are not a thing. */
  maxImages: number;
  /** Caption / body character ceiling. */
  maxCaptionChars: number;
  /** Longest video accepted, in seconds. 0 where video is not supported. */
  maxVideoSeconds: number;
  /** Published posts allowed per rolling 24h, per account. */
  dailyPostLimit: number;
  /**
   * The platform forces private/self-only visibility until an audit is passed, and returns
   * SUCCESS while doing so. Publishing before that is worse than not publishing.
   */
  requiresAudit: boolean;
  /** Env var that records the audit as passed. Only meaningful when requiresAudit. */
  auditEnvVar?: string;
  /** A paid subscription or billing setup the ACCOUNT must have, beyond API access. */
  requiresPaidPlan?: string;
  /** Anything a future reader would otherwise have to re-derive. */
  notes: string;
}

export const CAPABILITIES: Record<Platform, PlatformCapability> = {
  instagram: {
    kinds: ['image', 'carousel', 'video_short'],
    maxImages: 10,
    maxCaptionChars: 2200,
    maxVideoSeconds: 900,
    dailyPostLimit: 100,
    requiresAudit: false,
    notes:
      'Live since 2026-08-26. A carousel counts as ONE post against the daily limit. Aspect ratio must be within 4:5 and 1.91:1 or the container is REJECTED, which is why every image is contained into a 1080x1350 white frame.',
  },
  facebook: {
    kinds: ['image', 'carousel', 'video_short', 'video_long', 'text'],
    maxImages: 10,
    maxCaptionChars: 63206,
    maxVideoSeconds: 14400,
    dailyPostLimit: 100,
    requiresAudit: false,
    notes:
      'Shares the Meta app and access token with Instagram, so it needs no separate approval. The only platform here with NATIVE scheduling (published=false plus scheduled_publish_time), which means CRWN does not have to own its clock.',
  },
  x: {
    kinds: ['image', 'carousel', 'video_short', 'text', 'thread', 'article'],
    maxImages: 4,
    maxCaptionChars: 280,
    maxVideoSeconds: 140,
    dailyPostLimit: 100,
    requiresAudit: false,
    requiresPaidPlan:
      'Pay-per-use billing on the X developer account (about $0.015 per post, and $0.20 if the post contains a link). Articles additionally require X Premium on the publishing account.',
    notes:
      'Deliberately NOT video_long: the default ceiling is 140 seconds, so calling X a long-form video surface would route a 10-minute cut here and fail at upload. A "thread" is a reply chain built with in_reply_to_tweet_id, not a distinct object. An "article" is the long-form surface: POST /2/articles/draft then POST /2/articles/{id}/publish, with the body as a DraftJS content_state. Keep captions link-free: a URL multiplies the per-post cost more than thirteenfold.',
  },
  tiktok: {
    kinds: ['video_short', 'carousel'],
    maxImages: 35,
    maxCaptionChars: 2200,
    maxVideoSeconds: 600,
    dailyPostLimit: 20,
    requiresAudit: true,
    auditEnvVar: 'TIKTOK_AUDIT_PASSED',
    notes:
      'FAILS CLOSED until the audit is recorded. Every post from an unaudited client is forced to SELF_ONLY and the API still reports success, so publishing early produces content nobody can see while the queue claims it shipped. The audit takes 2 to 4 weeks with several feedback rounds. Note the daily limit is roughly 15 to 25 per ACCOUNT and is shared across all API clients, so TikTok cannot absorb a 50-a-day cadence even once audited.',
  },
  youtube: {
    kinds: ['video_short', 'video_long'],
    maxImages: 0,
    maxCaptionChars: 5000,
    maxVideoSeconds: 43200,
    dailyPostLimit: 100,
    requiresAudit: true,
    auditEnvVar: 'YOUTUBE_AUDIT_PASSED',
    notes:
      'FAILS CLOSED until the audit is recorded: uploads from an unverified API project are locked to private and the creator is emailed about it. Shorts and long-form are the SAME endpoint (videos.insert); Shorts is simply a vertical video of three minutes or less. Quota stopped being the constraint when videos.insert dropped to roughly 100 units with its own daily bucket. COMMUNITY POSTS ARE NOT PUBLISHABLE: see UNSUPPORTED below.',
  },
  threads: {
    kinds: ['image', 'carousel', 'video_short', 'text'],
    maxImages: 20,
    maxCaptionChars: 500,
    maxVideoSeconds: 300,
    dailyPostLimit: 250,
    requiresAudit: false,
    notes:
      'graph.threads.net, with the same two-step container model as Instagram. No app review is needed to publish to an account that holds a role on your own app, exactly like Instagram.',
  },
};

/**
 * Things that were asked for and CANNOT be built, with the reason.
 *
 * This exists so nobody spends a day rediscovering it. An entry here is not a backlog item; it is
 * a statement that the platform provides no way to do this at all.
 */
export const UNSUPPORTED: ReadonlyArray<{
  platform: Platform;
  what: string;
  why: string;
}> = [
  {
    platform: 'youtube',
    what: 'community posts (text, image and slideshow posts on the channel tab)',
    why: 'The YouTube Data API has never exposed a create endpoint for community posts. Third-party tools can only READ existing ones by scraping. There is no supported path, so this stays manual.',
  },
  {
    platform: 'x',
    what: 'posting to a LinkedIn-style company page equivalent',
    why: 'Not applicable to X. Recorded only because the same question gets asked of every platform: X posts as the authenticated account and has no separate page object.',
  },
];

export interface CapabilityCheck {
  ok: boolean;
  /** Machine-readable so a caller can branch without parsing prose. */
  reason?: 'unknown_platform' | 'kind_unsupported' | 'audit_required' | 'too_many_images' | 'caption_too_long' | 'video_too_long';
  message?: string;
}

/**
 * Can this platform be asked to publish this, right now, in this environment?
 *
 * `env` is passed in rather than read from process.env so the decision is pure and testable. An
 * audit-gated platform is refused unless its audit variable is explicitly set to 'true': anything
 * else, including unset, an empty string or 'false', fails closed.
 */
export function canPublish(
  platform: string,
  kind: PostKind,
  env: Record<string, string | undefined> = {}
): CapabilityCheck {
  const cap = CAPABILITIES[platform as Platform];
  if (!cap) {
    return { ok: false, reason: 'unknown_platform', message: `"${platform}" is not a platform this engine publishes to.` };
  }
  if (!cap.kinds.includes(kind)) {
    return {
      ok: false,
      reason: 'kind_unsupported',
      message: `${platform} does not accept ${kind}. It accepts: ${cap.kinds.join(', ')}.`,
    };
  }
  if (cap.requiresAudit) {
    const passed = cap.auditEnvVar ? String(env[cap.auditEnvVar] ?? '').trim().toLowerCase() === 'true' : false;
    if (!passed) {
      return {
        ok: false,
        reason: 'audit_required',
        message: `${platform} publishes PRIVATELY until its audit passes, and reports success while doing so. Set ${cap.auditEnvVar}=true only once the audit is genuinely approved.`,
      };
    }
  }
  return { ok: true };
}

/** Validate the payload itself against the platform's published limits. */
export function validatePayload(
  platform: Platform,
  payload: { kind: PostKind; imageCount?: number; captionChars?: number; videoSeconds?: number },
  env: Record<string, string | undefined> = {}
): CapabilityCheck {
  const gate = canPublish(platform, payload.kind, env);
  if (!gate.ok) return gate;

  const cap = CAPABILITIES[platform];
  const images = payload.imageCount ?? 0;
  if (images > cap.maxImages) {
    return {
      ok: false,
      reason: 'too_many_images',
      message: `${platform} accepts at most ${cap.maxImages} images, got ${images}.`,
    };
  }
  if ((payload.captionChars ?? 0) > cap.maxCaptionChars) {
    return {
      ok: false,
      reason: 'caption_too_long',
      message: `${platform} accepts at most ${cap.maxCaptionChars} caption characters, got ${payload.captionChars}.`,
    };
  }
  if ((payload.videoSeconds ?? 0) > cap.maxVideoSeconds) {
    return {
      ok: false,
      reason: 'video_too_long',
      message: `${platform} accepts video up to ${cap.maxVideoSeconds}s, got ${payload.videoSeconds}s.`,
    };
  }
  return { ok: true };
}

/** Every platform that could take this content right now, for fan-out. */
export function platformsFor(
  kind: PostKind,
  env: Record<string, string | undefined> = {}
): Platform[] {
  return PLATFORMS.filter((p) => canPublish(p, kind, env).ok);
}
