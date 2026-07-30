'use client';

// useArtistContext — the one artist row every hub page needs (id, slug, plan,
// tier_config), fetched once per session and served from memory after that.
//
// The old artist dashboard was a single page that fetched this row ONCE and then
// handed it to 16 tabs as props. Splitting the tabs into real routes would have
// re-run that query on every single navigation, which is exactly the "tabs are
// slow" feeling, just moved. So the answer is cached here at module scope: the
// first hub page pays one round trip, every page after it renders on the spot.
//
// Cache the POSITIVE only. "Is an artist" is one way (an artist_profiles row
// never disappears), but caching a negative would strand a fan who publishes
// their page mid-session on the "this is for artists" screen until a reload.
// Same rule as the knownArtists cache in Studio.

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { TierConfig } from '@/types';

export interface ArtistContext {
  artistId: string;
  slug: string;
  platformTier: string;
  tiers: TierConfig[];
}

/** userId -> resolved context. Only successful artist lookups are stored. */
const cache = new Map<string, ArtistContext>();

/**
 * Drop a user's cached row so the next hub page refetches. Call after anything
 * that changes slug or plan (publishing, upgrading) so the shell does not serve
 * a stale plan to a page that gates features on it.
 */
export function invalidateArtistContext(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export type ArtistContextStatus = 'loading' | 'artist' | 'not-artist' | 'signed-out';

export function useArtistContext(): {
  status: ArtistContextStatus;
  context: ArtistContext | null;
  displayName: string;
} {
  const { user, profile, isLoading: authLoading } = useAuth();
  const cached = user ? cache.get(user.id) ?? null : null;
  const [context, setContext] = useState<ArtistContext | null>(cached);
  const [resolved, setResolved] = useState(!!cached);

  useEffect(() => {
    if (authLoading || !user) return;
    const hit = cache.get(user.id);
    if (hit) {
      setContext(hit);
      setResolved(true);
      return;
    }
    let active = true;
    const supabase = createBrowserSupabaseClient();
    // tiers come from the REAL subscription_tiers table. artist_profiles.tier_config is a
    // dead column that was often empty/stale, and serving it here made the live-session
    // tier gate show no tiers (2026-07-26) — any consumer of ctx.tiers had the same bug.
    supabase
      .from('artist_profiles')
      .select('id, slug, platform_tier')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (data) {
          let tiers: TierConfig[] = [];
          try {
            const { data: tierRows } = await supabase
              .from('subscription_tiers')
              .select('id, name, price, description, access_config')
              .eq('artist_id', data.id)
              .eq('is_active', true)
              .order('price', { ascending: true });
            tiers = (tierRows || []).map((t) => ({
              id: t.id,
              name: t.name,
              price: t.price,
              description: t.description || '',
              benefits: ((t.access_config as { benefits?: string[] } | null)?.benefits || []) as string[],
            }));
          } catch {
            // A tier fetch failure must not block the artist shell; pages degrade to [].
          }
          const next: ArtistContext = {
            artistId: data.id,
            slug: data.slug || '',
            platformTier: data.platform_tier || 'starter',
            tiers,
          };
          cache.set(user.id, next);
          if (active) setContext(next);
        }
        if (active) setResolved(true);
      });
    return () => {
      active = false;
    };
  }, [user, authLoading]);

  const status: ArtistContextStatus = authLoading
    ? 'loading'
    : !user
      ? 'signed-out'
      : !resolved
        ? 'loading'
        : context
          ? 'artist'
          : 'not-artist';

  return { status, context, displayName: profile?.display_name || 'An artist' };
}
