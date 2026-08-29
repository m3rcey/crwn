/**
 * Instagram adapter: the PROVEN path (media 18415895044156240 on @thecrwnapp), wrapped in the
 * shared contract so the tick can treat every platform the same way.
 *
 * The container logic itself stays in instagramPublish.ts, which is what Phase 0 verified live.
 * This file only adapts its shape: the same request in, the same classified error out. Carousel
 * and single image both go through publishCarousel's container flow; a single image is a
 * one-item container rather than a separate code path, because that is what was tested.
 */

import {
  type PlatformAdapter,
  type PublishRequest,
  type PublishResult,
  PublishError,
} from '../adapter';
import { publishCarousel, GraphError, type InstagramConfig } from '../instagramPublish';

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
      if (req.kind !== 'carousel' && req.kind !== 'image') {
        // Reels are in the capability table as a supported kind, but the Reels container flow
        // (media_type=REELS, video_url, longer processing) has not been exercised live yet.
        // Refusing loudly beats shipping an untested path that publishes to a real account.
        throw new PublishError(`Instagram adapter does not yet publish ${req.kind}; carousel and image are live`, {
          retryable: false,
          kind: 'permanent',
          message: 'kind not yet implemented',
        });
      }
      const cfg = configFromEnv(env);
      try {
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
          throw new PublishError(e.message, {
            retryable: e.classification.retryable,
            kind: e.classification.kind,
            message: e.classification.message,
            code: e.classification.code,
          });
        }
        throw e;
      }
    },
  };
}
