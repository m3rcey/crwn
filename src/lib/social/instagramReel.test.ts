import { describe, it, expect, vi, afterEach } from 'vitest';
import { publishReel, GraphError, type InstagramConfig } from './instagramPublish';
import { createInstagramAdapter } from './adapters/instagram';
import { PublishError } from './adapter';

// The failure that matters for a Reel is publishing the same video twice: a second post of the
// same video is a public duplicate AND Instagram throttles its reach. These tests pin the rule
// that once a container exists, every later attempt resumes THAT container and never uploads again.

const cfg: InstagramConfig = { igUserId: '123', accessToken: 'tok-abcdefgh', host: 'graph.instagram.com', version: 'v26.0' };

interface Call { method: string; url: string; params: URLSearchParams }

/** A fake Graph API. `statuses` is the sequence of status_code answers for the container. */
function fakeGraph(statuses: string[]) {
  const calls: Call[] = [];
  let poll = 0;
  vi.stubGlobal('fetch', async (input: string, init?: { method?: string; body?: URLSearchParams }) => {
    const method = init?.method ?? 'GET';
    const url = String(input);
    const params = method === 'GET' ? new URL(url).searchParams : (init!.body as URLSearchParams);
    calls.push({ method, url, params });
    const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (method === 'POST' && url.endsWith('/123/media')) return reply({ id: 'container-1' });
    if (method === 'POST' && url.endsWith('/123/media_publish')) return reply({ id: 'media-9' });
    if (method === 'GET' && params.get('fields')?.startsWith('status_code')) {
      const code = statuses[Math.min(poll++, statuses.length - 1)];
      return reply({ status_code: code, status: code === 'ERROR' ? 'Error: video codec' : code });
    }
    if (method === 'GET' && params.get('fields') === 'permalink') return reply({ permalink: 'https://www.instagram.com/reel/X/' });
    return { ok: false, status: 400, json: async () => ({ error: { message: 'unexpected call', code: 100 } }) };
  });
  return calls;
}

const creates = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/123/media'));
const publishes = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/media_publish'));

afterEach(() => vi.unstubAllGlobals());

describe('publishReel', () => {
  it('creates one REELS container, waits for FINISHED, publishes it', async () => {
    const calls = fakeGraph(['IN_PROGRESS', 'FINISHED']);
    const out = await publishReel(cfg, 'https://r2/video.mp4', 'caption', { pollIntervalMs: 1 });
    expect(out).toEqual({ mediaId: 'media-9', permalink: 'https://www.instagram.com/reel/X/', containerId: 'container-1' });
    expect(creates(calls)).toHaveLength(1);
    const p = creates(calls)[0].params;
    expect(p.get('media_type')).toBe('REELS');
    expect(p.get('video_url')).toBe('https://r2/video.mp4');
    expect(p.get('share_to_feed')).toBe('true');
    expect(publishes(calls)).toHaveLength(1);
    expect(publishes(calls)[0].params.get('creation_id')).toBe('container-1');
  });

  it('hands a still-processing container to the next tick instead of waiting forever', async () => {
    const calls = fakeGraph(['IN_PROGRESS']);
    const err = await publishReel(cfg, 'https://r2/video.mp4', 'caption', { pollIntervalMs: 5, pollBudgetMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect(err.classification.retryable).toBe(true);
    expect(err.resume).toEqual({ ig_container_id: 'container-1' });
    expect(publishes(calls)).toHaveLength(0);
  });

  it('resumes the stored container without uploading the video again', async () => {
    const calls = fakeGraph(['FINISHED']);
    const out = await publishReel(cfg, 'https://r2/video.mp4', 'caption', { resumeContainerId: 'container-1', pollIntervalMs: 1 });
    expect(out.mediaId).toBe('media-9');
    expect(creates(calls)).toHaveLength(0);
  });

  it('stops permanently when the resumed container is already PUBLISHED (never a second post)', async () => {
    const calls = fakeGraph(['PUBLISHED']);
    const err = await publishReel(cfg, 'https://r2/video.mp4', 'caption', { resumeContainerId: 'container-1', pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect(err.classification.retryable).toBe(false);
    expect(creates(calls)).toHaveLength(0);
    expect(publishes(calls)).toHaveLength(0);
  });

  it('fails permanently when Meta cannot process the video, keeping the container for a human', async () => {
    fakeGraph(['ERROR']);
    const err = await publishReel(cfg, 'https://r2/video.mp4', 'caption', { pollIntervalMs: 1 }).catch((e) => e);
    expect(err.classification.retryable).toBe(false);
    expect(err.message).toContain('Error: video codec');
    expect(err.resume).toEqual({ ig_container_id: 'container-1' });
  });

  it('refuses an over-length caption before any upload', async () => {
    const calls = fakeGraph(['FINISHED']);
    await expect(publishReel(cfg, 'https://r2/video.mp4', 'x'.repeat(2201))).rejects.toThrow(/2200/);
    expect(calls).toHaveLength(0);
  });
});

describe('instagram adapter, video_short', () => {
  const env = { IG_USER_ID: '123', IG_ACCESS_TOKEN: 'tok-abcdefgh' };

  it('passes the stored container id through so a retry resumes it', async () => {
    const calls = fakeGraph(['FINISHED']);
    const out = await createInstagramAdapter(env).publish({
      kind: 'video_short',
      caption: 'c',
      mediaUrls: ['https://r2/video.mp4'],
      payload: { ig_container_id: 'container-1' },
    });
    expect(out.providerPostId).toBe('media-9');
    expect(creates(calls)).toHaveLength(0);
  });

  it('carries resume state out on a PublishError for the tick to store', async () => {
    fakeGraph(['IN_PROGRESS']);
    // The adapter uses the real 35 second budget, so the clock is faked rather than waited on.
    vi.useFakeTimers();
    try {
      const pending = createInstagramAdapter(env)
        .publish({ kind: 'video_short', caption: 'c', mediaUrls: ['https://r2/video.mp4'], payload: {} })
        .catch((e) => e);
      await vi.runAllTimersAsync();
      const err = await pending;
      expect(err).toBeInstanceOf(PublishError);
      expect(err.classification.retryable).toBe(true);
      expect(err.resume).toEqual({ ig_container_id: 'container-1' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a video post with anything but one media url', async () => {
    fakeGraph(['FINISHED']);
    await expect(
      createInstagramAdapter(env).publish({ kind: 'video_short', caption: 'c', mediaUrls: [], payload: {} })
    ).rejects.toThrow(/exactly one video/);
  });
});
