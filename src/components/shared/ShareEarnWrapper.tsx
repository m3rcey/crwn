'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { ShareEarnButton } from '@/components/shared/ShareEarnButton';

interface ShareEarnWrapperProps {
  artistSlug: string;
  artistId: string;
  commissionRate: number;
}

export function ShareEarnWrapper({ artistSlug, artistId, commissionRate }: ShareEarnWrapperProps) {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    if (!user) return;
    supabase
      .from('subscriptions')
      .select('id')
      .eq('fan_id', user.id)
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => setIsSubscribed(!!data));
  }, [user, artistId, supabase]);

  if (!isSubscribed) return null;

  return (
    <div className="mt-2">
      <ShareEarnButton
        artistSlug={artistSlug}
        artistId={artistId}
        commissionRate={commissionRate}
      />
    </div>
  );
}
