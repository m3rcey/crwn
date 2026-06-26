'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle, Lock } from 'lucide-react';

interface MessageArtistButtonProps {
  artistId: string;
  artistSlug: string;
  // hide entirely when the viewer is the artist themselves
  isOwnProfile?: boolean;
}

// Renders a "Message" button on an artist's public profile when the signed-in
// fan is on a tier that unlocks direct messaging. Otherwise shows a locked hint.
export function MessageArtistButton({ artistId, artistSlug, isOwnProfile }: MessageArtistButtonProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<{ canMessage: boolean; reason: string; unlockable: boolean } | null>(null);

  useEffect(() => {
    if (!user || isOwnProfile) return;
    let cancelled = false;
    fetch(`/api/messages?artistId=${artistId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || data.error) return;
        setState({
          canMessage: data.canMessage,
          reason: data.reason,
          // any fan tier that could unlock DMs (empty when the artist doesn't offer them at all)
          unlockable: Array.isArray(data.enabledTierIds) && data.enabledTierIds.length > 0,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, artistId, isOwnProfile]);

  if (!user || isOwnProfile || !state) return null;

  // Artist offers no DM-enabled tier (e.g. on the Starter platform plan, or no
  // tier has the benefit on). Don't show a dead-end upsell.
  if (!state.canMessage && !state.unlockable) return null;

  if (state.canMessage) {
    return (
      <button
        onClick={() => router.push(`/messages?artist=${artistSlug}`)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-crwn-elevated rounded-full text-crwn-text hover:border-crwn-gold hover:text-crwn-gold transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        Message
      </button>
    );
  }

  // tier_locked / not_subscribed: nudge toward subscribing/upgrading.
  return (
    <span
      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-crwn-elevated/60 rounded-full text-crwn-text-dim"
      title={state.reason === 'not_subscribed' ? 'Subscribe to message this artist' : 'Upgrade your tier to message this artist'}
    >
      <Lock className="w-3.5 h-3.5" />
      {state.reason === 'not_subscribed' ? 'Subscribe to message' : 'Upgrade to message'}
    </span>
  );
}
