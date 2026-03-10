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

interface QuickCreateAlbumModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrackIds: string[];
  selectedTracks: Track[];
  artistProfileId: string;
  onAlbumCreated: () => void;
}

interface AlbumFormData {
  title: string;
  description: string;
  albumArtFile: File | null;
  releaseDate: string;
  isAvailableNow: boolean;
  isFree: boolean;
  allowedTierIds: string[];
  price: string;
}

export function QuickCreateAlbumModal({
  isOpen,
  onClose,
  selectedTrackIds,
  selectedTracks,
  artistProfileId,
  onAlbumCreated,
}: QuickCreateAlbumModalProps) {
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedPrice, setSuggestedPrice] = useState<number | null>(null);

  const [formData, setFormData] = useState<AlbumFormData>({
    title: '',
    description: '',
    albumArtFile: null,
    releaseDate: '',
    isAvailableNow: true,
    isFree: true,
    allowedTierIds: [],
    price: '',
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

  // Calculate suggested price based on selected tracks
  useEffect(() => {
    if (selectedTracks.length > 0) {
      const totalCents = selectedTracks.reduce((sum, track) => {
        return sum + (track.price || 0);
      }, 0);
      if (totalCents > 0) {
        // Apply 80% retention (artist keeps 80% of track prices)
        setSuggestedPrice(Math.round(totalCents * 0.8));
      } else {
        setSuggestedPrice(null);
      }
    } else {
      setSuggestedPrice(null);
    }
  }, [selectedTracks]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: '',
        description: '',
        albumArtFile: null,
        releaseDate: '',
        isAvailableNow: true,
        isFree: true,
        allowedTierIds: [],
        price: '',
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || selectedTrackIds.length === 0) return;

    setIsSubmitting(true);

    try {
      let albumArtUrl: string | null = null;

      // Upload album art if present
      if (formData.albumArtFile) {
        const ext = formData.albumArtFile.name.split('.').pop();
        const fileName = `${Date.now()}.${ext}`;
        const path = `${artistProfileId}/albums/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('album-art')
          .upload(path, formData.albumArtFile);
        
        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('album-art')
            .getPublicUrl(path);
          albumArtUrl = urlData.publicUrl;
        }
      }

      // Determine release date
      let releaseDate: string;
      if (formData.isAvailableNow) {
        releaseDate = new Date().toISOString().split('T')[0];
      } else {
        releaseDate = formData.releaseDate || new Date().toISOString().split('T')[0];
      }

      // Calculate price in cents
      const priceInCents = formData.price ? Math.round(parseFloat(formData.price) * 100) : null;

      // Create album
      const { data: album, error: albumError } = await supabase
        .from('albums')
        .insert({
          artist_id: artistProfileId,
          title: formData.title,
          description: formData.description || null,
          album_art_url: albumArtUrl,
          release_date: releaseDate,
          is_free: formData.isFree,
          allowed_tier_ids: formData.isFree ? [] : formData.allowedTierIds,
          is_active: true,
          price: formData.isFree ? null : priceInCents,
        })
        .select()
        .single();

      if (albumError) throw albumError;

      // Add tracks to album
      if (album && selectedTrackIds.length > 0) {
        const albumTracks = selectedTrackIds.map((trackId, index) => ({
          album_id: album.id,
          track_id: trackId,
          position: index + 1,
        }));

        const { error: tracksError } = await supabase
          .from('album_tracks')
          .insert(albumTracks);

        if (tracksError) throw tracksError;
      }

      showToast('Album created successfully!', 'success');
      onAlbumCreated();
      onClose();
    } catch (error) {
      console.error('Error creating album:', error);
      showToast('Failed to create album', 'error');
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
          <h2 className="text-lg font-semibold text-crwn-text">Quick Create Album</h2>
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
              Album Title <span className="text-crwn-gold">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
              placeholder="Enter album title"
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

          {/* Album Art */}
          <div>
            <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
              Cover Art
            </label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-crwn-elevated rounded-lg overflow-hidden flex items-center justify-center">
                {formData.albumArtFile ? (
                  <Image
                    src={URL.createObjectURL(formData.albumArtFile)}
                    alt=""
                    width={80}
                    height={80}
                    className="object-cover"
                  />
                ) : (
                  <span className="text-3xl">🎵</span>
                )}
              </div>
              <label className="flex items-center gap-2 px-4 py-2 bg-crwn-bg border border-crwn-elevated rounded-lg cursor-pointer text-sm">
                <Upload className="w-4 h-4" />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFormData(p => ({ ...p, albumArtFile: e.target.files?.[0] || null }))}
                />
              </label>
            </div>
          </div>

          {/* Release Date / Available Now */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={formData.isAvailableNow}
                onChange={(e) => setFormData(p => ({ ...p, isAvailableNow: e.target.checked }))}
                className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
              />
              <span className="text-crwn-text text-sm">Available Now</span>
            </label>
            {!formData.isAvailableNow && (
              <input
                type="date"
                value={formData.releaseDate}
                onChange={(e) => setFormData(p => ({ ...p, releaseDate: e.target.value }))}
                className="w-full neu-inset px-4 py-2 text-crwn-text"
              />
            )}
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

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
              Price (optional one-time purchase)
            </label>
            {suggestedPrice && (
              <p className="text-xs text-crwn-gold mb-2">
                Suggested: ${(suggestedPrice / 100).toFixed(2)} based on track prices (80% of total)
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="text-crwn-text">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={suggestedPrice ? `(Suggested: ${(suggestedPrice / 100).toFixed(2)})` : 'Leave empty if not for sale'}
                value={formData.price}
                onChange={(e) => setFormData(p => ({ ...p, price: e.target.value }))}
                className="w-full neu-inset px-4 py-2 text-crwn-text"
              />
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
                  Create Album
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
