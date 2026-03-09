'use client';

import { useState } from 'react';
import { Track } from '@/types';
import { usePlayer } from '@/hooks/usePlayer';
import { useSubscription } from '@/hooks/useSubscription';
import { useFavorites } from '@/hooks/useFavorites';
import { TrackActionButtons } from '@/components/shared/TrackActionButtons';
import { Lock, Play, Pause, LockOpen, Link2 } from 'lucide-react';
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
  const { isLiked, toggleFavorite } = useFavorites();
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // New gating logic: is_free !== false means free (null = free)
  // Otherwise check if user has a tier that's in allowed_tier_ids
  const canAccess = track.is_free !== false || (tierId && track.allowed_tier_ids?.includes(tierId));
  const isLocked = !canAccess;
  const isCurrentTrack = currentTrack?.id === track.id;
  const isTrackPlaying = isCurrentTrack && isPlaying;
  const trackIsLiked = isLiked(track.id);

  const handlePlay = () => {
    if (isLocked) {
      setShowPreviewModal(true);
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

  const handlePreview = () => {
    // Play 30-second preview
    const previewTrack = {
      ...track,
      audio_url_128: `${track.audio_url_128}#t=0,30`,
    };
    play(previewTrack, trackList);
    setShowPreviewModal(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-4 p-3 bg-crwn-surface rounded-lg animate-pulse">
        <div className="w-12 h-12 bg-crwn-elevated rounded" />
        <div className="flex-1 h-4 bg-crwn-elevated rounded" />
      </div>
    );
  }

  return (
    <>
      <div
        className={`flex items-center gap-4 p-3 rounded-lg transition-colors group ${
          isCurrentTrack ? 'bg-crwn-elevated' : 'bg-crwn-surface hover:bg-crwn-elevated'
        } ${isLocked ? 'opacity-90' : ''}`}
      >
        {/* Album Art */}
        <div
          className="relative w-12 h-12 rounded overflow-hidden flex-shrink-0 cursor-pointer"
          onClick={handlePlay}
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
                <Lock size={12} /> Subscribe to unlock
              </span>
            ) : track.is_free === false && track.allowed_tier_ids && track.allowed_tier_ids.length > 0 ? (
              <span className="text-xs text-crwn-gold flex items-center gap-1">
                <LockOpen size={12} /> Subscriber exclusive
              </span>
            ) : track.is_free === false && track.price ? (
              <span className="text-xs text-crwn-text-secondary">
                ${(track.price || 0) / 100}
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
        {isLocked && (
          <button
            onClick={() => setShowPreviewModal(true)}
            className="px-4 py-1.5 bg-crwn-gold/10 border border-crwn-gold text-crwn-gold text-sm font-medium rounded-full hover:bg-crwn-gold/20 transition-colors"
          >
            Preview
          </button>
        )}

        {/* Track Action Buttons (Like & Add to Playlist) */}
        <TrackActionButtons 
          trackId={track.id} 
          size="sm" 
          isLiked={trackIsLiked}
          onToggleLike={() => toggleFavorite(track.id)}
        />

        {/* Share Button */}
        {artistSlug && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(`https://crwn-mauve.vercel.app/artist/${artistSlug}/track/${track.id}`);
            }}
            className="text-crwn-text-secondary hover:text-crwn-gold transition-colors p-1"
            title="Copy share link"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="neu-modal p-6 max-w-md w-full">
            <div className="text-center">
              <div className="w-16 h-16 neu-raised rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock size={32} className="text-crwn-gold" />
              </div>
              <h3 className="text-xl font-bold text-crwn-text mb-2">
                This track is locked
              </h3>
              <p className="text-crwn-text-secondary mb-6">
                Subscribe to this artist to unlock full access to their exclusive content.
              </p>

              <div className="space-y-3">
                <button
                  onClick={handlePreview}
                  className="w-full neu-button text-crwn-gold"
                >
                  Play 30-second preview
                </button>

                <a
                  href={`/artist/${artistId}?subscribe=true`}
                  className="block w-full py-3 neu-button-accent text-crwn-bg"
                >
                  Subscribe to unlock
                </a>

                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="w-full py-3 text-crwn-text-secondary hover:text-crwn-text transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
