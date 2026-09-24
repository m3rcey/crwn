/**
 * Instagram adapter: the PROVEN path (media 18415895044156240 on @thecrwnapp), wrapped in the
 * shared contract so the tick can treat every platform the same way.
 *
 * The container logic itself stays in instagramPublish.ts, which is what Phase 0 verified live.
 * This file only adapts its shape: the same request in, the same classified error out. Carousel
 * and single image both go through publishCarousel's container flow; a single image is a
 * one-item container rather than a separate code path, because that is what was tested.
 * A Reel (video_short) goes through publishReel, which resumes a still-processing container
 * across ticks through payload.ig_container_id instead of uploading the video again.
 */

import {
  type PlatformAdapter,
  type PublishRequest,
  type PublishResult,
  PublishError,
} from '../adapter';
import { publishCarousel, publishReel, GraphError, type InstagramConfig } from '../instagramPublish';

function configFromEnv(env: Record<string, string | undefined>): InstagramConfig {
  // TRIM EVERY ONE. The first scheduled post failed on a trailing space pasted into the Vercel
  // dashboard, with an error that read like a permissions problem.
  const igUserId = (env.IG_USER_ID || '').trim();
  const accessToken = (env.IG_ACCESS_TOKEN || '').trim();
  if (!igUserId || !accessToken) {
    throw new PublishError('Instagram credentials are not configured (IG_USER_ID, IG_ACCESS_TOKEN)', {
      retryable: false,
      kind: 'auth',
      message: 'missing credentials',
    });
  }
  return {
    igUserId,
    accessToken,
    host: (env.GRAPH_HOST || 'graph.instagram.com').trim().replace(/^https?:\/\//, ''),
    version: (env.GRAPH_API_VERSION || 'v26.0').trim(),
  };
}

export function createInstagramAdapter(env: Record<string, string | undefined> = process.env): PlatformAdapter {
  return {
    platform: 'instagram',
    supportsNativeScheduling: false,

    async publish(req: PublishRequest): Promise<PublishResult> {
      if (req.kind !== 'carousel' && req.kind !== 'image' && req.kind !== 'video_short') {
        throw new PublishError(`Instagram adapter does not publish ${req.kind}; carousel, image and video_short (Reels) are supported`, {
          retryable: false,
          kind: 'permanent',
          message: 'kind not supported',
        });
      }
      const cfg = configFromEnv(env);
      try {
        if (req.kind === 'video_short') {
          if (req.mediaUrls.length !== 1) {
            throw new PublishError(`a Reel takes exactly one video, got ${req.mediaUrls.length}`, {
              retryable: false,
              kind: 'permanent',
              message: 'bad reel media count',
            });
          }
          const resumeId = req.payload.ig_container_id;
          const thumb = Number(req.payload.thumb_offset_ms);
          const reel = await publishReel(cfg, req.mediaUrls[0], req.caption, {
            resumeContainerId: typeof resumeId === 'string' ? resumeId : undefined,
            thumbOffsetMs: req.payload.thumb_offset_ms !== undefined && Number.isFinite(thumb) ? thumb : undefined,
          });
          return {
            providerPostId: reel.mediaId,
            permalink: reel.permalink,
            providerResponse: { reel_container_id: reel.containerId },
          };
        }
        const out = await publishCarousel(cfg, req.mediaUrls, req.caption);
        return {
          providerPostId: out.mediaId,
          permalink: out.permalink,
          providerResponse: {
            carousel_container_id: out.carouselContainerId,
            child_container_ids: out.childContainerIds,
          },
        };
      } catch (e) {
        if (e instanceof GraphError) {
          throw new PublishError(
            e.message,
            {
              retryable: e.classification.retryable,
              kind: e.classification.kind,
              message: e.classification.message,
              code: e.classification.code,
            },
            e.resume
          );
        }
        throw e;
      }
    },
  };
}
