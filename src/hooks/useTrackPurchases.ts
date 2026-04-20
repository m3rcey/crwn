'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface TrackPurchasesResult {
  purchasedTrackIds: Set<string>;
  isLoading: boolean;
  refetch: () => void;
}

export function useTrackPurchases(artistId: string | null): TrackPurchasesResult {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [purchasedTrackIds, setPurchasedTrackIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const userId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    async function fetchPurchases() {
      if (!userId || !artistId) {
        if (!cancelled) {
          setPurchasedTrackIds(new Set());
          setIsLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from('purchases')
        .select('track_id')
        .eq('fan_id', userId)
        .eq('artist_id', artistId)
        .eq('status', 'completed')
        .not('track_id', 'is', null);

      if (!cancelled) {
        const ids = new Set<string>((data || []).map((row: { track_id: string }) => row.track_id));
        setPurchasedTrackIds(ids);
        setIsLoading(false);
      }
    }

    fetchPurchases();

    return () => {
      cancelled = true;
    };
  }, [userId, artistId, supabase, refreshCount]);

  return {
    purchasedTrackIds,
    isLoading,
    refetch: () => setRefreshCount(c => c + 1),
  };
}
