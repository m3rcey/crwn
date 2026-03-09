'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useFavorites() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchFavorites() {
      if (!user) {
        setLikedTrackIds(new Set());
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('favorites')
        .select('track_id')
        .eq('user_id', user.id);

      if (!error && data) {
        setLikedTrackIds(new Set(data.map(f => f.track_id)));
      }
      setIsLoading(false);
    }

    fetchFavorites();
  }, [user, supabase]);

  const isLiked = useCallback((trackId: string) => {
    return likedTrackIds.has(trackId);
  }, [likedTrackIds]);

  const toggleFavorite = useCallback(async (trackId: string) => {
    if (!user) return { success: false, error: 'not_logged_in' };

    const isCurrentlyLiked = likedTrackIds.has(trackId);

    if (isCurrentlyLiked) {
      // Unlike
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('track_id', trackId);

      if (!error) {
        setLikedTrackIds(prev => {
          const next = new Set(prev);
          next.delete(trackId);
          return next;
        });
      }
      return { success: !error, error };
    } else {
      // Like
      const { error } = await supabase
        .from('favorites')
        .insert({
          user_id: user.id,
          track_id: trackId,
        });

      if (!error) {
        setLikedTrackIds(prev => new Set(prev).add(trackId));
      }
      return { success: !error, error };
    }
  }, [user, likedTrackIds, supabase]);

  return { isLiked, toggleFavorite, isLoading };
}
