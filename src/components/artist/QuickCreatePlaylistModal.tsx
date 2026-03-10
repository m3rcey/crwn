'use client';

import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useToast } from '@/components/shared/Toast';
import { Track } from '@/types';
import Image from 'next/image';
import { X, Upload, Loader2, Plus } from 'lucide-react';

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
}

interface QuickCreatePlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrackIds: string[];
  selectedTracks: Track[];
  artistProfileId: string;
  onPlaylistCreated: () => void;
}

interface PlaylistFormData {
  title: string;
  description: string;
  coverArtFile: File | null;
  isFree: boolean;
  allowedTierIds: string[];
}

export function QuickCreatePlaylistModal({
  isOpen,
  onClose,
  selectedTrackIds,
  selectedTracks,
  artistProfileId,
  onPlaylistCreated,
}: QuickCreatePlaylistModalProps) {
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<PlaylistFormData>({
    title: '',
    description: '',
    coverArtFile: null,
    isFree: true,
    allowedTierIds: [],
  });

  // Fetch tiers
  useEffect(() => {
    async function fetchTiers() {
      if (!artistProfileId || !isOpen) return;
      
      const { data } = await supabase
        .from('subscription_tiers')
        .select('id, name, price')
        .eq('artist_id', artistProfileId)
        .eq('is_active', true)
        .order('price', { ascending: true });
      
      if (data) setTiers(data);
    }
    fetchTiers();
  }, [artistProfileId, isOpen, supabase]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: '',
        description: '',
        coverArtFile: null,
        isFree: true,
        allowedTierIds: [],
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || selectedTrackIds.length === 0) return;

    setIsSubmitting(true);

    try {
      let coverUrl: string | null = null;

      // Upload cover art if present
      if (formData.coverArtFile) {
        const ext = formData.coverArtFile.name.split('.').pop();
        const fileName = `${Date.now()}.${ext}`;
        const path = `${artistProfileId}/playlists/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('album-art')
          .upload(path, formData.coverArtFile);
        
        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('album-art')
            .getPublicUrl(path);
          coverUrl = urlData.publicUrl;
        }
      }

      // Create playlist
      const { data: playlist, error: playlistError } = await supabase
        .from('playlists')
        .insert({
          user_id: artistProfileId, // Using artist profile id as user_id for artist playlists
          title: formData.title,
          description: formData.description || null,
          cover_url: coverUrl,
          is_public: true,
          is_artist_playlist: true,
          is_active: true,
          is_free: formData.isFree,
          allowed_tier_ids: formData.isFree ? [] : formData.allowedTierIds,
        })
        .select()
        .single();

      if (playlistError) throw playlistError;

      // Add tracks to playlist
      if (playlist && selectedTrackIds.length > 0) {
        const playlistTracks = selectedTrackIds.map((trackId, index) => ({
          playlist_id: playlist.id,
          track_id: trackId,
          position: index + 1,
        }));

        const { error: tracksError } = await supabase
          .from('playlist_tracks')
          .insert(playlistTracks);

        if (tracksError) throw tracksError;
      }

      showToast('Playlist created successfully!', 'success');
      onPlaylistCreated();
      onClose();
    } catch (error) {
      console.error('Error creating playlist:', error);
      showToast('Failed to create playlist', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-crwn-surface rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto neu-raised">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-crwn-elevated">
          <h2 className="text-lg font-semibold text-crwn-text">Quick Create Playlist</h2>
          <button
            onClick={onClose}
            className="text-crwn-text-secondary hover:text-crwn-text"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Selected Tracks Preview */}
          <div>
            <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
              Selected Tracks ({selectedTrackIds.length})
            </label>
            <div className="bg-crwn-bg rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
              {selectedTracks.map((track) => (
                <div
                  key={track.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-sm"
                >
                  <span className="text-crwn-gold">🎵</span>
                  <span className="text-crwn-text truncate flex-1">{track.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
              Playlist Title <span className="text-crwn-gold">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
              placeholder="Enter playlist title"
              className="w-full neu-inset px-4 py-2 text-crwn-text"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
              placeholder="Optional description"
              rows={2}
              className="w-full neu-inset px-4 py-2 text-crwn-text resize-none"
            />
          </div>

          {/* Cover Art */}
          <div>
            <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
              Cover Art
            </label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-crwn-elevated rounded-lg overflow-hidden flex items-center justify-center">
                {formData.coverArtFile ? (
                  <Image
                    src={URL.createObjectURL(formData.coverArtFile)}
                    alt=""
                    width={80}
                    height={80}
                    className="object-cover"
                  />
                ) : (
                  <span className="text-3xl">🎶</span>
                )}
              </div>
              <label className="flex items-center gap-2 px-4 py-2 bg-crwn-bg border border-crwn-elevated rounded-lg cursor-pointer text-sm">
                <Upload className="w-4 h-4" />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFormData(p => ({ ...p, coverArtFile: e.target.files?.[0] || null }))}
                />
              </label>
            </div>
          </div>

          {/* Access Level */}
          <div>
            <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
              Access
            </label>
            <div className="space-y-2 bg-crwn-bg border border-crwn-elevated rounded-lg p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isFree}
                  onChange={(e) => setFormData(p => ({ 
                    ...p, 
                    isFree: e.target.checked,
                    allowedTierIds: e.target.checked ? [] : p.allowedTierIds,
                  }))}
                  className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                />
                <span className="text-crwn-text text-sm">Free (anyone)</span>
              </label>
              {!formData.isFree && tiers.length > 0 && tiers.map(tier => (
                <label key={tier.id} className="flex items-center gap-2 cursor-pointer ml-6">
                  <input
                    type="checkbox"
                    checked={formData.allowedTierIds.includes(tier.id)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...formData.allowedTierIds, tier.id]
                        : formData.allowedTierIds.filter(id => id !== tier.id);
                      setFormData(p => ({ ...p, allowedTierIds: ids }));
                    }}
                    className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                  />
                  <span className="text-crwn-text text-sm">{tier.name} (${(tier.price / 100).toFixed(0)}/mo)</span>
                </label>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-crwn-surface border border-crwn-elevated text-crwn-text-secondary font-medium rounded-lg hover:text-crwn-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.title || selectedTrackIds.length === 0}
              className="flex-1 py-3 bg-crwn-gold text-crwn-bg font-semibold rounded-lg hover:bg-crwn-gold-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create Playlist
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
