import { describe, it, expect } from 'vitest';
import {
  canPublish,
  validatePayload,
  platformsFor,
  CAPABILITIES,
  UNSUPPORTED,
  PLATFORMS,
  type Platform,
} from './capabilities';

const AUDITED = { TIKTOK_AUDIT_PASSED: 'true', YOUTUBE_AUDIT_PASSED: 'true' };

describe('audit gating: the failure that looks like success', () => {
  // TikTok forces SELF_ONLY and YouTube locks to private, and BOTH report success. A row would
  // read "published" while nobody could see the post. Refusing is recoverable; believing you
  // posted is not.
  it('refuses TikTok and YouTube until their audit is recorded', () => {
    expect(canPublish('tiktok', 'video_short', {}).ok).toBe(false);
    expect(canPublish('tiktok', 'video_short', {}).reason).toBe('audit_required');
    expect(canPublish('youtube', 'video_long', {}).ok).toBe(false);
    expect(canPublish('youtube', 'video_long', {}).reason).toBe('audit_required');
  });

  it('allows them once the audit is explicitly recorded', () => {
    expect(canPublish('tiktok', 'video_short', AUDITED).ok).toBe(true);
    expect(canPublish('youtube', 'video_long', AUDITED).ok).toBe(true);
  });

  it('fails CLOSED on every value that is not exactly true', () => {
    for (const v of [undefined, '', 'false', 'FALSE', '0', 'yes', 'maybe', ' ']) {
      const check = canPublish('tiktok', 'video_short', { TIKTOK_AUDIT_PASSED: v });
      expect(check.ok, `TIKTOK_AUDIT_PASSED=${JSON.stringify(v)} must not open the gate`).toBe(false);
    }
    // Only the exact string opens it, case-insensitively and whitespace-tolerantly.
    expect(canPublish('tiktok', 'video_short', { TIKTOK_AUDIT_PASSED: 'TRUE' }).ok).toBe(true);
    expect(canPublish('tiktok', 'video_short', { TIKTOK_AUDIT_PASSED: ' true ' }).ok).toBe(true);
  });

  it('never gates a platform that does not need an audit', () => {
    for (const p of ['instagram', 'facebook', 'x', 'threads'] as Platform[]) {
      expect(CAPABILITIES[p].requiresAudit, `${p} must not be audit-gated`).toBe(false);
    }
  });
});

describe('content kinds per platform', () => {
  it('refuses a kind the platform cannot take, and says what it can', () => {
    const check = canPublish('youtube', 'carousel', AUDITED);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('kind_unsupported');
    expect(check.message).toMatch(/video_short, video_long/);
  });

  it('YouTube takes no images at all, which is why a carousel cannot go there', () => {
    expect(CAPABILITIES.youtube.maxImages).toBe(0);
    expect(CAPABILITIES.youtube.kinds).not.toContain('carousel');
    expect(CAPABILITIES.youtube.kinds).not.toContain('image');
  });

  it('Shorts and long-form are both YouTube kinds, because they are one endpoint', () => {
    expect(CAPABILITIES.youtube.kinds).toContain('video_short');
    expect(CAPABILITIES.youtube.kinds).toContain('video_long');
  });

  it('X is the only platform that takes threads and articles', () => {
    for (const p of PLATFORMS) {
      const takesThread = CAPABILITIES[p].kinds.includes('thread');
      const takesArticle = CAPABILITIES[p].kinds.includes('article');
      expect(takesThread, `${p} thread`).toBe(p === 'x');
      expect(takesArticle, `${p} article`).toBe(p === 'x');
    }
  });

  it('TikTok takes video and photo carousels but not a bare single image', () => {
    expect(CAPABILITIES.tiktok.kinds).toContain('video_short');
    expect(CAPABILITIES.tiktok.kinds).toContain('carousel');
    expect(CAPABILITIES.tiktok.kinds).not.toContain('video_long');
  });

  it('rejects an unknown platform rather than assuming defaults', () => {
    expect(canPublish('myspace', 'image').ok).toBe(false);
    expect(canPublish('myspace', 'image').reason).toBe('unknown_platform');
  });
});

describe("CRWN's actual 4-slide carousel", () => {
  // The whole existing library is 4 stills. This is the check that says which platforms can take
  // it today without re-cutting a single asset.
  const carousel = { kind: 'carousel' as const, imageCount: 4, captionChars: 2100 };

  it('fits Instagram and Facebook with no audit and no re-cutting', () => {
    for (const p of ['instagram', 'facebook'] as Platform[]) {
      expect(validatePayload(p, carousel).ok, p).toBe(true);
    }
  });

  it('is refused by Threads on CAPTION LENGTH, which is the surprise', () => {
    // Threads caps a post at 500 characters and CRWN's captions run 1,700 to 2,200. The images
    // fit fine (Threads allows 20). So Threads is open with no approval and still cannot take
    // this content unchanged: it needs its own short caption, not just a repost.
    expect(CAPABILITIES.threads.maxImages).toBeGreaterThanOrEqual(4);
    const check = validatePayload('threads', carousel);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('caption_too_long');
  });

  it('fits Threads once the caption is written for Threads', () => {
    expect(validatePayload('threads', { kind: 'carousel', imageCount: 4, captionChars: 480 }).ok).toBe(true);
  });

  it('fits TikTok only once audited', () => {
    expect(validatePayload('tiktok', carousel).ok).toBe(false);
    expect(validatePayload('tiktok', carousel, AUDITED).ok).toBe(true);
  });

  it('is refused by X on caption length, not image count', () => {
    // 4 images is exactly X's ceiling, so the image count passes and the 2,100-character
    // caption is what fails. A caption written for Instagram cannot be posted to X unchanged.
    expect(CAPABILITIES.x.maxImages).toBe(4);
    const check = validatePayload('x', carousel);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('caption_too_long');
  });

  it('is refused by YouTube outright', () => {
    expect(validatePayload('youtube', carousel, AUDITED).reason).toBe('kind_unsupported');
  });
});

describe('payload limits', () => {
  it('catches too many images before anything is uploaded', () => {
    expect(validatePayload('x', { kind: 'carousel', imageCount: 5 }).reason).toBe('too_many_images');
    expect(validatePayload('instagram', { kind: 'carousel', imageCount: 11 }).reason).toBe('too_many_images');
  });

  it('catches an over-length caption', () => {
    expect(validatePayload('instagram', { kind: 'image', captionChars: 2201 }).reason).toBe('caption_too_long');
    expect(validatePayload('threads', { kind: 'text', captionChars: 501 }).reason).toBe('caption_too_long');
  });

  it('catches an over-length video', () => {
    expect(validatePayload('x', { kind: 'video_short', videoSeconds: 141 }).reason).toBe('video_too_long');
    expect(validatePayload('tiktok', { kind: 'video_short', videoSeconds: 601 }, AUDITED).reason).toBe('video_too_long');
  });

  it('accepts a payload sitting exactly on every ceiling', () => {
    expect(validatePayload('instagram', { kind: 'carousel', imageCount: 10, captionChars: 2200 }).ok).toBe(true);
    expect(validatePayload('x', { kind: 'video_short', videoSeconds: 140, captionChars: 280 }).ok).toBe(true);
  });
});

describe('platformsFor', () => {
  it('lists only what is genuinely open right now', () => {
    expect(platformsFor('carousel')).toEqual(['instagram', 'facebook', 'x', 'threads']);
    // TikTok joins once audited.
    expect(platformsFor('carousel', AUDITED)).toContain('tiktok');
  });

  it('routes long-form video to YouTube and Facebook only', () => {
    // X is deliberately excluded: its default ceiling is 140 seconds, so treating it as a
    // long-form surface would route a 10-minute cut there and fail at upload.
    expect(platformsFor('video_long', AUDITED).sort()).toEqual(['facebook', 'youtube']);
  });

  it('returns nothing audit-gated when no audit is recorded', () => {
    expect(platformsFor('video_long')).toEqual(['facebook']);
  });
});

describe('permanently unsupported', () => {
  // Recorded so nobody spends a day rediscovering it. This is not a backlog item.
  it('records that YouTube community posts cannot be published by any API', () => {
    const entry = UNSUPPORTED.find((u) => u.platform === 'youtube');
    expect(entry, 'the YouTube community-post limitation must stay recorded').toBeTruthy();
    expect(entry!.what).toMatch(/community post/i);
    expect(entry!.why).toMatch(/no.*create endpoint|never exposed/i);
  });

  it('keeps community posts out of the YouTube capability list', () => {
    // If somebody ever adds a 'community' kind, this is what stops it being wired to YouTube.
    expect(CAPABILITIES.youtube.kinds.some((k) => String(k).includes('community'))).toBe(false);
  });
});

describe('the table itself', () => {
  it('describes every platform exactly once, with a reason a human can read', () => {
    for (const p of PLATFORMS) {
      const cap = CAPABILITIES[p];
      expect(cap, p).toBeTruthy();
      expect(cap.kinds.length, `${p} must accept something`).toBeGreaterThan(0);
      expect(cap.notes.length, `${p} needs a note explaining its constraints`).toBeGreaterThan(40);
      expect(cap.dailyPostLimit, `${p} needs a daily limit`).toBeGreaterThan(0);
    }
  });

  it('gives every audit-gated platform the env var that opens it', () => {
    for (const p of PLATFORMS) {
      const cap = CAPABILITIES[p];
      if (cap.requiresAudit) expect(cap.auditEnvVar, `${p} needs an audit env var`).toBeTruthy();
    }
  });

  it('records the paid prerequisite for X, which is not an API-access question', () => {
    expect(CAPABILITIES.x.requiresPaidPlan).toMatch(/pay-per-use/i);
    expect(CAPABILITIES.x.requiresPaidPlan).toMatch(/Premium/);
  });
});
