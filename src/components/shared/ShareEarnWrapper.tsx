'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Gift } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArtistPreview } from '@/hooks/useArtistPreview';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { ShareEarnButton } from '@/components/shared/ShareEarnButton';

interface ShareEarnWrapperProps {
  artistSlug: string;
  artistId: string;
  /** The artist's REAL referral rate. <= 0 means no program: the fan button
   *  must not render, because the payout pays the real rate, not a default. */
  commissionRate: number;
  /** Optional path to share instead of the artist profile (e.g. current page path). */
  sharePath?: string;
  /** Override the subscription check — pass true if already known to be subscribed. */
  isSubscribedOverride?: boolean;
  /** The viewer OWNS this page: show the program state instead of the fan button. */
  isOwner?: boolean;
}

export function ShareEarnWrapper({ artistSlug, artistId, commissionRate, sharePath, isSubscribedOverride, isOwner: isOwnerProp }: ShareEarnWrapperProps) {
  const { user } = useAuth();
  // Previewing as a fan means seeing the fan button (or its absence), not the
  // owner's manage link.
  const { previewing } = useArtistPreview();
  const isOwner = isOwnerProp && !previewing;
  const [isSubscribed, setIsSubscribed] = useState(isSubscribedOverride ?? false);
  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    if (isOwner) return; // owners see the program state, never the fan button
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
  }, [user, artistId, supabase, isSubscribedOverride, isOwner]);

  // The artist viewing their own page: the fan button is invisible to them by
  // design (fans must be subscribed), which read as "Share-to-Earn is missing"
  // in live testing. Show the program's real state with a manage link instead.
  if (isOwner) {
    return (
      <Link
        prefetch
        href="/account/referrals"
        className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-full border border-crwn-gold/40 text-xs text-crwn-gold hover:bg-crwn-gold/10 transition-colors"
      >
        <Gift className="w-3.5 h-3.5" />
        {commissionRate > 0
          ? `Share-to-Earn is live: your subscribed fans see an Earn ${Math.round(commissionRate)}% button here`
          : 'Share-to-Earn is off: fans are not recruiting for you yet. Turn it on'}
      </Link>
    );
  }

  // No program, no button: advertising a rate the payout will not pay is a
  // false promise to the fan (the payout uses the real rate, default 0).
  if (commissionRate <= 0) return null;

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
