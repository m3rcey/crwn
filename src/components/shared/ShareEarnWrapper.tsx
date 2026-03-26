'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { ShareEarnButton } from '@/components/shared/ShareEarnButton';

interface ShareEarnWrapperProps {
  artistSlug: string;
  artistId: string;
  commissionRate: number;
  /** Optional path to share instead of the artist profile (e.g. current page path). */
  sharePath?: string;
  /** Override the subscription check — pass true if already known to be subscribed. */
  isSubscribedOverride?: boolean;
}

export function ShareEarnWrapper({ artistSlug, artistId, commissionRate, sharePath, isSubscribedOverride }: ShareEarnWrapperProps) {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(isSubscribedOverride ?? false);
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    if (isSubscribedOverride !== undefined) return; // skip query when overridden
    if (!user) return;
    supabase
      .from('subscriptions')
      .select('id')
      .eq('fan_id', user.id)
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => setIsSubscribed(!!data));
  }, [user, artistId, supabase, isSubscribedOverride]);

  if (!isSubscribed) return null;

  return (
    <div className="mt-2">
      <ShareEarnButton
        artistSlug={artistSlug}
        artistId={artistId}
        commissionRate={commissionRate}
        sharePath={sharePath}
      />
    </div>
  );
}
