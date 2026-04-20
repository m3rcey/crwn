'use client';

import { Track } from '@/types';
import { usePlayer } from '@/hooks/usePlayer';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrackPurchases } from '@/hooks/useTrackPurchases';
import { useFavorites } from '@/hooks/useFavorites';
import { TrackActionButtons } from '@/components/shared/TrackActionButtons';
import { TrackShareButton } from '@/components/shared/TrackShareButton';
import { useReferralCode } from '@/hooks/useReferralCode';
import { Lock, Play, Pause, LockOpen } from 'lucide-react';
import { hapticMedium } from '@/lib/haptics';
import Image from 'next/image';

interface GatedTrackPlayerProps {
  track: Track;
  artistId: string;
  artistSlug?: string;
  trackList?: Track[];
}

export function GatedTrackPlayer({ track, artistId, artistSlug, trackList }: GatedTrackPlayerProps) {
  const { play, pause, currentTrack, isPlaying } = usePlayer();
  const { isSubscribed, tierId, isLoading } = useSubscription(artistId);
  const { purchasedTrackIds } = useTrackPurchases(artistId);
  const { isLiked, toggleFavorite } = useFavorites();
  const referralCode = useReferralCode();

  // Early access: if public_release_date is in the future, only tier subscribers can access
  const isEarlyAccess = track.public_release_date && new Date(track.public_release_date) > new Date();

  // Gating priority (in order):
  //   1. Fan owns the track via one-time purchase
  //   2. Early access window → only tier subscribers unlock
  //   3. Track is marked free
  //   4. Fan has a tier subscription that includes this track
  const hasPurchased = purchasedTrackIds.has(track.id);
  const canAccess = hasPurchased
    ? true
    : isEarlyAccess
      ? !!(tierId && track.allowed_tier_ids?.includes(tierId))
      : track.is_free !== false || !!(tierId && track.allowed_tier_ids?.includes(tierId));
  const isLocked = !canAccess;
  const isCurrentTrack = currentTrack?.id === track.id;
  const isTrackPlaying = isCurrentTrack && isPlaying;
  const trackIsLiked = isLiked(track.id);

  const handlePlay = () => {
    hapticMedium();
    if (isLocked) {
      // Navigate to subscribe — use track page if we have a slug, otherwise artist profile
      if (artistSlug) {
        window.location.href = `/${artistSlug}/track/${track.id}`;
      }
      return;
    }

    if (isCurrentTrack) {
      if (isPlaying) {
        pause();
      } else {
        play(track, trackList);
      }
    } else {
      play(track, trackList);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-4 py-3 px-1 border-b border-crwn-elevated/50 animate-pulse">
        <div className="w-12 h-12 bg-crwn-elevated rounded" />
        <div className="flex-1 h-4 bg-crwn-elevated rounded" />
      </div>
    );
  }

  return (
    <>
      <div
        className={`flex items-center gap-4 py-3 px-1 transition-colors group cursor-pointer border-b border-crwn-elevated/50 active:bg-white/10 ${
          isCurrentTrack ? 'bg-crwn-elevated/30' : 'hover:bg-crwn-elevated/20'
        } ${isLocked ? 'opacity-90' : ''}`}
        onClick={handlePlay}
      >
        {/* Album Art */}
        <div
          className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0" 
        >
          {track.album_art_url ? (
            <Image
              src={track.album_art_url}
              alt={track.title}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-crwn-elevated flex items-center justify-center text-crwn-text-secondary">
              🎵
            </div>
          )}

          {/* Play/Pause Overlay */}
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {isTrackPlaying ? (
              <Pause size={20} className="text-white" fill="currentColor" />
            ) : (
              <Play size={20} className="text-white" fill="currentColor" />
            )}
          </div>

          {/* Lock Overlay */}
          {isLocked && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Lock size={16} className="text-crwn-gold" />
            </div>
          )}
        </div>

        {/* Track Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={`font-medium truncate ${
                isCurrentTrack ? 'text-crwn-gold' : 'text-crwn-text'
              }`}
            >
              {track.title}
            </h3>
            {isLocked && (
              <Lock size={14} className="text-crwn-gold flex-shrink-0" />
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            {isLocked ? (
              <span className="text-xs text-crwn-gold flex items-center gap-1">
                <Lock size={12} />
                {isEarlyAccess
                  ? 'Early access — subscribe to listen'
                  : track.price
                    ? `$${(track.price / 100).toFixed(2)} to unlock`
                    : 'Subscribe to unlock'}
              </span>
            ) : isEarlyAccess ? (
              <span className="text-xs text-crwn-gold flex items-center gap-1">
                <LockOpen size={12} /> Early access
              </span>
            ) : hasPurchased ? (
              <span className="text-xs text-crwn-gold flex items-center gap-1">
                <LockOpen size={12} /> Owned
              </span>
            ) : track.is_free === false && track.allowed_tier_ids && track.allowed_tier_ids.length > 0 ? (
              <span className="text-xs text-crwn-gold flex items-center gap-1">
                <LockOpen size={12} /> Subscriber exclusive
              </span>
            ) : (
              <span className="text-xs text-crwn-success">Free</span>
            )}

            {track.duration && (
              <span className="text-xs text-crwn-text-secondary">
                {Math.floor(track.duration / 60)}:
                {(track.duration % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>
        </div>

        {/* CTA Button */}
        {isLocked && artistSlug && (
          <a
            href={`/${artistSlug}/track/${track.id}`}
            onClick={(e) => e.stopPropagation()}
            className="px-4 py-1.5 neu-button-accent text-crwn-bg text-sm font-medium rounded-full"
          >
            Unlock
          </a>
        )}

        {/* Track Action Buttons (Like & Add to Playlist) */}
        <div onClick={(e) => e.stopPropagation()}>
        <TrackActionButtons 
          trackId={track.id} 
          size="sm" 
          isLiked={trackIsLiked}
          onToggleLike={() => toggleFavorite(track.id)}
        />
        </div>

        {/* Share Button */}
        {artistSlug && (
          <TrackShareButton
            trackId={track.id}
            trackTitle={track.title}
            artistSlug={artistSlug}
            size="sm"
            referralCode={isSubscribed ? referralCode : null}
          />
        )}
      </div>

    </>
  );
}
