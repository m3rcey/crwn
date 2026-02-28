'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface SubscriptionCheck {
  isSubscribed: boolean;
  tierName: string | null;
  isLoading: boolean;
}

export function useSubscription(artistId: string | null) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [subscription, setSubscription] = useState<SubscriptionCheck>({
    isSubscribed: false,
    tierName: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function checkSubscription() {
      if (!user || !artistId) {
        if (!cancelled) {
          setSubscription({ isSubscribed: false, tierName: null, isLoading: false });
        }
        return;
      }

      const { data } = await supabase
        .from('subscriptions')
        .select('tier:tier_id(name)')
        .eq('fan_id', user.id)
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .gt('current_period_end', new Date().toISOString())
        .maybeSingle();

      if (!cancelled) {
        if (data) {
          setSubscription({
            isSubscribed: true,
            tierName: (data.tier as unknown as { name: string })?.name || null,
            isLoading: false,
          });
        } else {
          setSubscription({
            isSubscribed: false,
            tierName: null,
            isLoading: false,
          });
        }
      }
    }

    checkSubscription();

    return () => {
      cancelled = true;
    };
  }, [user, artistId, supabase]);

  return subscription;
}
