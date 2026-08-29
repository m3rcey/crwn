/**
 * The adapter registry: one lookup from platform name to publisher.
 *
 * Adding a platform is one file plus one line here plus one row in capabilities.ts. If platform
 * logic ever appears as `if (platform === '...')` anywhere outside an adapter, the abstraction has
 * failed, which is the same rule the campaign archetypes follow.
 */

import type { Platform } from '../capabilities';
import type { PlatformAdapter } from '../adapter';
import { createInstagramAdapter } from './instagram';
import { createFacebookAdapter } from './facebook';
import { createThreadsAdapter } from './threads';
import { createXAdapter } from './x';
import { createTikTokAdapter } from './tiktok';
import { createYouTubeAdapter } from './youtube';

const FACTORIES: Record<Platform, (env: Record<string, string | undefined>) => PlatformAdapter> = {
  instagram: createInstagramAdapter,
  facebook: createFacebookAdapter,
  threads: createThreadsAdapter,
  x: createXAdapter,
  tiktok: createTikTokAdapter,
  youtube: createYouTubeAdapter,
};

export function adapterFor(platform: Platform, env: Record<string, string | undefined> = process.env): PlatformAdapter {
  const make = FACTORIES[platform];
  if (!make) throw new Error(`no adapter registered for platform "${platform}"`);
  return make(env);
}

export const REGISTERED_PLATFORMS = Object.keys(FACTORIES) as Platform[];
