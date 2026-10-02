'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { useArtistPreview } from './useArtistPreview';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface SubscriptionCheck {
  isSubscribed: boolean;
  tierId: string | null;
  tierName: string | null;
  /** When this membership started (subscriptions.started_at, else created_at): the member
   *  drip counts from it (src/lib/memberDrip.ts). Null when unknown, including in preview. */
  startedAt: string | null;
  isLoading: boolean;
}

export function useSubscription(artistId: string | null) {
  const { user } = useAuth();
  // Owner preview: every gated surface on the artist page reads its lock state
  // from this hook, so overriding the answer here is the single place that makes
  // "view as a Silver member" true everywhere at once. Inert off the artist page.
  const { previewing, previewTierId, previewTierName } = useArtistPreview();
  const supabase = createBrowserSupabaseClient();
  const [subscription, setSubscription] = useState<SubscriptionCheck>({
    isSubscribed: false,
    tierId: null,
    tierName: null,
    startedAt: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function checkSubscription() {
      if (!user || !artistId) {
        if (!cancelled) {
          setSubscription({ isSubscribed: false, tierId: null, tierName: null, startedAt: null, isLoading: false });
        }
        return;
      }

      const { data } = await supabase
        .from('subscriptions')
        .select('tier_id, started_at, created_at, tier:tier_id(name)')
        .eq('fan_id', user.id)
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .maybeSingle();

      if (!cancelled) {
        if (data) {
          setSubscription({
            isSubscribed: true,
            tierId: data.tier_id || null,
            tierName: (data.tier as unknown as { name: string })?.name || null,
            startedAt: data.started_at || data.created_at || null,
            isLoading: false,
          });
        } else {
          setSubscription({
            isSubscribed: false,
            tierId: null,
            tierName: null,
            startedAt: null,
            isLoading: false,
          });
        }
      }
    }

    checkSubscription();

    return () => {
      cancelled = true;
    };
  }, [user?.id, artistId, supabase]);

  // Preview wins over the real read. It only ever narrows access: the previewed
  // persona holds one tier or none, never more than the owner already has. A persona has
  // no start date, so the member drip renders as a day-one member sees it (locked).
  if (previewing) {
    return {
      isSubscribed: !!previewTierId,
      tierId: previewTierId,
      tierName: previewTierName,
      startedAt: null,
      isLoading: false,
    };
  }

  return subscription;
}
