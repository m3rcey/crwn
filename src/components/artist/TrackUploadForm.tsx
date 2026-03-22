'use client';
import { validateUpload } from '@/lib/uploadValidation';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Track } from '@/types';
import { usePlayer } from '@/hooks/usePlayer';
import { SortableTrackList } from '@/components/shared/SortableTrackList';
import { AddToPlaylistMenu } from '@/components/artist/TrackListItem';
import UpgradePrompt from '@/components/shared/UpgradePrompt';
import { usePlatformLimits } from '@/hooks/usePlatformLimits';
import { BulkUploadForm } from './BulkUploadForm';
import { QuickCreateAlbumModal } from './QuickCreateAlbumModal';
import { QuickCreatePlaylistModal } from './QuickCreatePlaylistModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Edit2, X, Upload, Plus } from 'lucide-react';
import { hapticMedium } from '@/lib/haptics';

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
}

interface TierBenefit {
  id: string;
  tier_id: string;
  benefit_type: string;
  config: Record<string, any>;
}

interface TrackFormData {
  title: string;
  isFree: boolean;
  allowedTierIds: string[];
  price: string;
  audioFile: File | null;
  albumArt: File | null;
  enableEarlyAccess: boolean;
  earlyAccessDays: number;
}

export function TrackUploadForm() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  const { currentTrack, isPlaying, play, pause } = usePlayer();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(true);
  const [artistProfileId, setArtistProfileId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [uploadMode, setUploadMode] = useState<'single' | 'bulk'>('single');

  const { tier, limits, usage, loading: limitsLoading } = usePlatformLimits(artistProfileId);
  const trackLimitReached = limits.tracks !== -1 && usage.tracks >= limits.tracks;

  const [formData, setFormData] = useState<TrackFormData>({
    title: '',
    isFree: true,
    allowedTierIds: [],
    price: '',
    audioFile: null,
    albumArt: null,
    enableEarlyAccess: false,
    earlyAccessDays: 7,
  });
  const [tierBenefits, setTierBenefits] = useState<TierBenefit[]>([]);
  const [maxEarlyAccessDays, setMaxEarlyAccessDays] = useState<number>(0);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [albums, setAlbums] = useState<{id: string; title: string}[]>([]);
  const [artistPlaylists, setArtistPlaylists] = useState<{id: string; title: string}[]>([]);
  const [showQuickAlbumModal, setShowQuickAlbumModal] = useState(false);
  const [showQuickPlaylistModal, setShowQuickPlaylistModal] = useState(false);
  const [confirmDeleteTrack, setConfirmDeleteTrack] = useState<Track | null>(null);
  const [confirmDeleteBulk, setConfirmDeleteBulk] = useState(false);

  // Fetch tracks when component mounts
  useEffect(() => {
    async function fetchTracks() {
      if (!user) return;
      
      // Get artist profile first
      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!artistProfile) {
        setIsLoadingTracks(false);
        return;
      }

      // Fetch albums and playlists for bulk actions
      const { data: albumsData } = await supabase
        .from('albums')
        .select('id, title')
        .eq('artist_id', artistProfile.id)
        .eq('is_active', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (albumsData) setAlbums(albumsData);

      const { data: playlistsData } = await supabase
        .from('playlists')
        .select('id, title')
        .eq('artist_id', artistProfile.id)
        .eq('is_active', true)
        .eq('is_artist_playlist', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (playlistsData) setArtistPlaylists(playlistsData);

      // Store artist profile ID for limits check
      setArtistProfileId(artistProfile.id);

      // Fetch subscription tiers
      const { data: tiersData, error: tiersError } = await supabase
        .from('subscription_tiers')
        .select('id, name, price')
        .eq('artist_id', artistProfile.id)
        .eq('is_active', true)
        .eq('is_active', true)
        .order('price', { ascending: true });
      if (tiersError) {
        console.error('Error fetching tiers:', tiersError);
      } else if (tiersData) {
        setTiers(tiersData);
      }

      // Fetch tier benefits to check for early_access
      const tierIds = tiersData?.map(t => t.id) || [];
      if (tierIds.length > 0) {
        const { data: benefitsData } = await supabase
          .from('tier_benefits')
          .select('*')
          .in('tier_id', tierIds)
          .eq('benefit_type', 'early_access')
          .eq('is_active', true);
        
        if (benefitsData && benefitsData.length > 0) {
          setTierBenefits(benefitsData);
          // Get max days_early across all tiers
          const maxDays = Math.max(...benefitsData.map((b: TierBenefit) => b.config?.days_early || 7));
          setMaxEarlyAccessDays(maxDays);
        }
      }
      // Fetch tracks
      const { data: tracksData } = await supabase
        .from('tracks')
        .select('*')
        .eq('artist_id', artistProfile.id)
        .eq('is_active', true)
        .order('position', { ascending: true });

      if (tracksData) {
        // Sort client-side to handle null positions (old tracks before migration)
        const sorted = [...tracksData].sort((a: Track, b: Track) => {
          if (a.position != null && b.position != null) return a.position - b.position;
          if (a.position != null) return -1;
          if (b.position != null) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setTracks(sorted as Track[]);
      }
      setIsLoadingTracks(false);

    }

    fetchTracks();
  }, [user, supabase]);

  // Also refetch tracks after upload - handled in handleSubmit

  const handleReorderTracks = async (reorderedTracks: Track[]) => {
    // Update local state immediately for smooth UX
    setTracks(reorderedTracks);

    // Save positions to database
    try {
      for (let i = 0; i < reorderedTracks.length; i++) {
        await supabase
          .from('tracks')
          .update({ position: i + 1 })
          .eq('id', reorderedTracks[i].id);
      }
    } catch (error) {
      console.error('Failed to save track order:', error);
    }
  };

  const handleDeleteTrack = async (track: Track) => {
    setConfirmDeleteTrack(track);
  };

  const executeDeleteTrack = async (track: Track) => {
    try {
      // Delete audio file from storage
      if (track.audio_url_128) {
        // Extract path from URL - format: https://xxx.supabase.co/storage/v1/object/public/audio/artistId/filename
        try {
          const urlParts = track.audio_url_128.split('/storage/v1/object/public/audio/');
          if (urlParts.length > 1) {
            const filePath = urlParts[1];
            await supabase.storage.from('audio').remove([filePath]);
          }
        } catch (storageError) {
          console.log('Could not delete audio file from storage:', storageError);
        }
      }

      // Delete from database
      const { error } = await supabase
        .from('tracks')
        .delete()
        .eq('id', track.id);

      if (error) throw error;

      // Remove from local state
      setTracks(tracks.filter(t => t.id !== track.id));
      showToast('Track deleted', 'success');
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Failed to delete track', 'error');
    }
  };

  const handleEditTrack = (track: Track) => {
    setEditingTrack(track);
    setFormData({
      title: track.title || '',
      isFree: track.is_free !== false,
      allowedTierIds: track.allowed_tier_ids || [],
      price: track.price ? (track.price / 100).toString() : '',
      audioFile: null,
      albumArt: null,
      enableEarlyAccess: false,
      earlyAccessDays: 7,
    });
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingTrack(null);
    setFormData({
      title: '',
      isFree: true,
      allowedTierIds: [],
      price: '',
      audioFile: null,
      albumArt: null,
      enableEarlyAccess: false,
      earlyAccessDays: 7,
    });
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ ...prev, audioFile: file }));
    }
  };

  const handleArtSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ ...prev, albumArt: file }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    hapticMedium();
    e.preventDefault();
    if (!formData.title) return;
    if (!editingTrack && !formData.audioFile) return;
    if (isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Get artist profile
      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id, slug')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (!artistProfile) {
        showToast('You need to set up your artist profile first', 'warning');
        setIsUploading(false);
        return;
      }

      let audioUrl = editingTrack?.audio_url_128 || '';
      let duration = editingTrack?.duration || 180;

      // Only upload new audio if provided
      if (formData.audioFile) {
        // Get actual duration from audio file BEFORE upload
        try {
          const audioElement = new Audio();
          const audioBlob = new Blob([formData.audioFile], { type: formData.audioFile.type });
          const audioUrlObject = URL.createObjectURL(audioBlob);
          
          duration = await new Promise<number>((resolve) => {
            audioElement.addEventListener('loadedmetadata', () => {
              URL.revokeObjectURL(audioUrlObject);
              resolve(Math.round(audioElement.duration));
            });
            audioElement.addEventListener('error', () => {
              URL.revokeObjectURL(audioUrlObject);
              resolve(180);
            });
            setTimeout(() => {
              URL.revokeObjectURL(audioUrlObject);
              resolve(180);
            }, 3000);
            audioElement.src = audioUrlObject;
          });
        } catch {
          console.log('Could not read audio duration');
        }

        // Simulate upload progress
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => Math.min(prev + 10, 90));
        }, 500);

        // Validate audio file
        const audioCheck = validateUpload(formData.audioFile, 'audio');
        if (!audioCheck.valid) {
          showToast(audioCheck.error || 'Invalid audio file', 'error');
          setIsUploading(false);
          return;
        }

        // Upload audio to Supabase Storage
        const audioExt = formData.audioFile.name.split('.').pop();
        const audioFileName = `${Date.now()}.${audioExt}`;
        const audioPath = `${artistProfile.id}/${audioFileName}`;
        
        const { error: audioError } = await supabase.storage
          .from('audio')
          .upload(audioPath, formData.audioFile);

        if (audioError) {
          console.error('Audio upload error:', audioError);
          audioUrl = `https://crwn-media.r2.dev/${artistProfile.slug}/audio/${audioFileName}`;
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('audio')
            .getPublicUrl(audioPath);
          audioUrl = publicUrl;
        }
        clearInterval(progressInterval);
        setUploadProgress(100);
      }

      // Upload album art if present
      let albumArtUrl = editingTrack?.album_art_url || null;
      if (formData.albumArt) {
        const artExt = formData.albumArt.name.split('.').pop();
        const artFileName = `${Date.now()}.${artExt}`;
        const artPath = `${artistProfile.id}/album-art/${artFileName}`;
        
        const { error: artError } = await supabase.storage
          .from('album-art')
          .upload(artPath, formData.albumArt);
        
        if (!artError) {
          const { data: { publicUrl } } = supabase.storage
            .from('album-art')
            .getPublicUrl(artPath);
          albumArtUrl = publicUrl;
        }
      }

      // Calculate price in cents
      const priceInCents = formData.price ? Math.round(parseFloat(formData.price) * 100) : null;

      if (editingTrack) {
        // Update existing track
        const { error: updateError } = await supabase
          .from('tracks')
          .update({
            title: formData.title,
            audio_url_128: audioUrl,
            audio_url_320: audioUrl,
            duration,
            is_free: formData.isFree,
            allowed_tier_ids: formData.isFree ? [] : formData.allowedTierIds,
            price: formData.isFree ? null : priceInCents,
            album_art_url: albumArtUrl,
          })
          .eq('id', editingTrack.id);

        if (updateError) throw updateError;

        // Update local state
        setTracks(prev => prev.map(t => 
          t.id === editingTrack.id 
            ? { ...t, title: formData.title, is_free: formData.isFree, allowed_tier_ids: formData.isFree ? [] : formData.allowedTierIds, price: formData.isFree ? null : priceInCents, album_art_url: albumArtUrl }
            : t
        ));
        showToast('Track updated!', 'success');
      } else {
        // Insert new track
        // Calculate public_release_date if early access is enabled
        let publicReleaseDate: string | null = null;
        if (formData.enableEarlyAccess && formData.earlyAccessDays > 0) {
          const releaseDate = new Date();
          releaseDate.setDate(releaseDate.getDate() + formData.earlyAccessDays);
          publicReleaseDate = releaseDate.toISOString();
        }

        const { data: track, error } = await supabase
          .from('tracks')
          .insert({
            artist_id: artistProfile.id,
            title: formData.title,
            audio_url_128: audioUrl,
            audio_url_320: audioUrl,
            duration,
            is_free: formData.isFree,
            allowed_tier_ids: formData.isFree ? [] : formData.allowedTierIds,
            price: formData.isFree ? null : priceInCents,
            album_art_url: albumArtUrl,
            public_release_date: publicReleaseDate,
          })
          .select()
          .single();

        if (error) {
          console.error('Track insert error:', error);
          throw error;
        }
        
        // Add new track to state
        if (track) {
          setTracks(prev => [track as Track, ...prev]);

          // Notify subscribers of new track
          const { data: artistName } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user?.id)
            .maybeSingle();
          fetch('/api/notifications/notify-subscribers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artistId: artistProfile.id,
              type: 'new_track',
              title: (artistName?.display_name || 'An artist') + ' dropped a new track!',
              message: formData.title,
              link: '/artist/' + (artistProfile.slug || ''),
            }),
          }).catch(console.error);
        }
        showToast('Track uploaded successfully!', 'success');
      }
      
      // Reset form
      setEditingTrack(null);
      setFormData({
        title: '',
        isFree: true,
        allowedTierIds: [],
        price: '',
        audioFile: null,
        albumArt: null,
        enableEarlyAccess: false,
        earlyAccessDays: 7,
      });

      showToast('Track uploaded successfully!', 'success');
    } catch (error) {
      console.error('Upload error:', error);
      showToast('Failed to upload track', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const toggleTrackSelection = (trackId: string) => {
    const newSet = new Set(selectedTrackIds);
    if (newSet.has(trackId)) newSet.delete(trackId);
    else newSet.add(trackId);
    setSelectedTrackIds(newSet);
  };

  const selectAllTracks = () => {
    if (selectedTrackIds.size === tracks.length) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(tracks.map(t => t.id)));
    }
  };

  const handleBulkDelete = () => {
    setConfirmDeleteBulk(true);
  };

  const executeBulkDelete = async () => {
    setConfirmDeleteBulk(false);
    for (const trackId of selectedTrackIds) {
      const { error: delErr } = await supabase.from("tracks").update({ is_active: false }).eq("id", trackId);
      if (delErr) console.error("Track delete failed:", trackId, delErr);
    }
    setTracks(tracks.filter(t => !selectedTrackIds.has(t.id)));
    setSelectedTrackIds(new Set());
    showToast(`${selectedTrackIds.size} tracks deleted`, "success");
  };

  const handleBulkAddToAlbum = async (albumId: string) => {
    const maxPos = await supabase.from("album_tracks").select("track_number").eq("album_id", albumId).order("track_number", { ascending: false }).limit(1);
    let pos = (maxPos.data?.[0]?.track_number || 0) + 1;
    for (const trackId of selectedTrackIds) {
      await supabase.from("album_tracks").upsert({ album_id: albumId, track_id: trackId, track_number: pos }, { onConflict: "album_id,track_id" });
      pos++;
    }
    setSelectedTrackIds(new Set());
    showToast(`Added ${selectedTrackIds.size} tracks to album`, "success");
  };

  const handleBulkAddToPlaylist = async (playlistId: string) => {
    const maxPos = await supabase.from("playlist_tracks").select("position").eq("playlist_id", playlistId).order("position", { ascending: false }).limit(1);
    let pos = (maxPos.data?.[0]?.position || 0) + 1;
    for (const trackId of selectedTrackIds) {
      await supabase.from("playlist_tracks").upsert({ playlist_id: playlistId, track_id: trackId, position: pos }, { onConflict: "playlist_id,track_id" });
      pos++;
    }
    setSelectedTrackIds(new Set());
    showToast(`Added ${selectedTrackIds.size} tracks to playlist`, "success");
  };

  return (
    <div className="space-y-8">
      {/* Track Limit Check */}
      {trackLimitReached && (
        <UpgradePrompt
          currentTier={tier}
          feature="Tracks"
          current={usage.tracks}
          limit={limits.tracks}
          message={`You've uploaded ${usage.tracks}/${limits.tracks} tracks. Upgrade to Pro for unlimited uploads.`}
        />
      )}

      {/* Upload Mode Toggle */}
      {!trackLimitReached && (
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setUploadMode('single')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              uploadMode === 'single'
                ? 'bg-crwn-gold text-crwn-bg'
                : 'bg-crwn-surface text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            Single Upload
          </button>
          <button
            type="button"
            onClick={() => setUploadMode('bulk')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              uploadMode === 'bulk'
                ? 'bg-crwn-gold text-crwn-bg'
                : 'bg-crwn-surface text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            Bulk Upload
          </button>
        </div>
      )}

      {/* Single Upload Form */}
      {uploadMode === 'single' && (
      <form onSubmit={handleSubmit} className="max-w-2xl bg-crwn-surface p-6 rounded-xl border border-crwn-elevated" style={{ opacity: trackLimitReached && !editingTrack ? 0.5 : 1, pointerEvents: trackLimitReached && !editingTrack ? 'none' : 'auto' }} data-tour="music-upload">
        <h2 className="text-lg font-semibold text-crwn-text mb-4">{editingTrack ? 'Edit Track' : 'Upload New Track'}</h2>

        {/* Audio File */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
            Audio File (MP3, WAV, FLAC)
          </label>
          <div className="relative">
            <input
              type="file"
              accept="audio/*"
              onChange={handleAudioSelect}
              className="hidden"
              id="audio-upload"

            />
            <label
              htmlFor="audio-upload"
              className="flex items-center justify-center gap-2 w-full bg-crwn-bg border-2 border-dashed border-crwn-elevated rounded-lg py-8 cursor-pointer hover:border-crwn-gold transition-colors"
            >
              {formData.audioFile ? (
                <span className="text-crwn-text">{formData.audioFile.name}</span>
              ) : (
                <>
                  <span className="text-2xl">🎵</span>
                  <span className="text-crwn-text-secondary">Click to select audio file</span>
                </>
              )}
            </label>
          </div>
          <p className="text-xs text-crwn-text-secondary mt-1">
            Files will be transcoded to 128kbps (stream) and 320kbps (premium)
          </p>
        </div>

        {/* Title */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
            Track Title
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Enter track title"
            className="w-full neu-inset w-full px-4 py-3 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
            required
          />
        </div>

        {/* Album Art */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
            Album Art (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleArtSelect}
            className="block w-full text-sm text-crwn-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-crwn-gold file:text-crwn-bg hover:file:bg-crwn-gold-hover"
          />
        </div>

        {/* Access Level - Tier Gating */}
        <div className="mb-4">
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
                  price: e.target.checked ? '' : p.price
                }))}
                className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
              />
              <span className="text-crwn-text text-sm">Free to all</span>
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
            {!formData.isFree && (
              <div className="ml-6 mt-2">
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
                  Or set a one-time price (USD)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-crwn-text">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Leave empty for tier access only"
                    value={formData.price}
                    onChange={(e) => setFormData(p => ({ ...p, price: e.target.value }))}
                    className="w-full neu-inset px-3 py-2 text-crwn-text"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Early Access Toggle */}
        {maxEarlyAccessDays > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
              Early Access
            </label>
            <div className="space-y-2 bg-crwn-bg border border-crwn-elevated rounded-lg p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.enableEarlyAccess}
                  onChange={(e) => setFormData(p => ({ 
                    ...p, 
                    enableEarlyAccess: e.target.checked,
                  }))}
                  className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                />
                <span className="text-crwn-text text-sm">Enable early access for subscribers</span>
              </label>
              {formData.enableEarlyAccess && (
                <div className="ml-6 mt-2">
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
                    Release publicly after:
                  </label>
                  <select
                    value={formData.earlyAccessDays}
                    onChange={(e) => setFormData(p => ({ ...p, earlyAccessDays: parseInt(e.target.value) }))}
                    className="neu-inset px-3 py-2 text-crwn-text"
                  >
                    <option value={1}>1 day</option>
                    <option value={3}>3 days</option>
                    <option value={7}>1 week</option>
                    <option value={14}>2 weeks</option>
                  </select>
                  <p className="text-xs text-crwn-text-secondary mt-1">
                    Fans in tiers with early access will hear it immediately. Everyone else sees a countdown.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {isUploading && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-crwn-text-secondary mb-1">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-crwn-bg rounded-full h-2">
              <div
                className="bg-crwn-gold h-2 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <p className="text-xs text-crwn-text-secondary mb-4">
          By uploading, you agree to the{' '}
          <a href="/artist-agreement" target="_blank" rel="noopener noreferrer" className="text-crwn-gold hover:underline">
            Artist Agreement
          </a>{' '}and confirm you own or have the rights to distribute this content.
        </p>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isUploading || (!editingTrack && !formData.audioFile)}
            className="flex-1 bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-full hover:bg-crwn-gold-hover transition-colors disabled:opacity-50 hover-glow"
          >
            {isUploading ? 'Saving...' : editingTrack ? 'Update Track' : 'Upload Track'}
          </button>
          {editingTrack && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-6 py-3 bg-crwn-surface text-crwn-text-secondary font-medium rounded-lg hover:text-crwn-text transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      )}

      {/* Bulk Upload Form */}
      {uploadMode === 'bulk' && artistProfileId && (
        <div className="max-w-2xl bg-crwn-surface p-6 rounded-xl border border-crwn-elevated" style={{ opacity: trackLimitReached ? 0.5 : 1, pointerEvents: trackLimitReached ? 'none' : 'auto' }}>
          <h2 className="text-lg font-semibold text-crwn-text mb-4">Bulk Upload</h2>
          <BulkUploadForm
            artistProfileId={artistProfileId}
            onComplete={() => {
              // Refetch tracks after bulk upload
              async function refetchTracks() {
                if (!user) return;
                const { data: tracksData } = await supabase
                  .from('tracks')
                  .select('*')
                  .eq('artist_id', artistProfileId)
                  .order('position', { ascending: true });
                if (tracksData) {
                  const sorted = [...tracksData].sort((a: Track, b: Track) => {
                    if (a.position != null && b.position != null) return a.position - b.position;
                    if (a.position != null) return -1;
                    if (b.position != null) return 1;
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                  });
                  setTracks(sorted as Track[]);
                }
              }
              refetchTracks();
            }}
          />
        </div>
      )}

      {/* Track List with Drag Reorder */}
      {isLoadingTracks ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crwn-gold mx-auto" />
        </div>
      ) : tracks.length > 0 ? (
        <div data-tour="music-tracklist">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={selectedTrackIds.size === tracks.length && tracks.length > 0} onChange={selectAllTracks} className="w-4 h-4 accent-crwn-gold" />
              <h2 className="text-lg font-semibold text-crwn-text">{selectedTrackIds.size > 0 ? `${selectedTrackIds.size} selected` : "Your Tracks"}</h2>
            </div>
            {selectedTrackIds.size > 0 && (
              <div className="flex items-center gap-2">
                <select 
                  onChange={(e) => { 
                    if (e.target.value === 'new') {
                      setShowQuickAlbumModal(true);
                    } else if (e.target.value) {
                      handleBulkAddToAlbum(e.target.value);
                    }
                    e.target.value = "";
                  }} 
                  className="neu-inset text-sm text-crwn-text px-2 py-1 rounded" 
                  defaultValue=""
                >
                  <option value="" disabled>Add to Album</option>
                  <option value="new" className="font-medium text-crwn-gold">+ Create New Album</option>
                  {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
                <select 
                  onChange={(e) => { 
                    if (e.target.value === 'new') {
                      setShowQuickPlaylistModal(true);
                    } else if (e.target.value) {
                      handleBulkAddToPlaylist(e.target.value);
                    }
                    e.target.value = "";
                  }} 
                  className="neu-inset text-sm text-crwn-text px-2 py-1 rounded" 
                  defaultValue=""
                >
                  <option value="" disabled>Add to Playlist</option>
                  <option value="new" className="font-medium text-crwn-gold">+ Create New Playlist</option>
                  {artistPlaylists.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                <button onClick={handleBulkDelete} className="text-sm text-red-500 hover:text-red-400 px-2 py-1">Delete</button>
              </div>
            )}
          </div>
          <SortableTrackList
            tracks={tracks}
            onReorder={handleReorderTracks}
            onRemove={(trackId) => {
              const track = tracks.find(t => t.id === trackId);
              if (track) handleDeleteTrack(track);
            }}
            renderActions={(track) => (
              <div className="flex items-center gap-2">

                <button
                  onClick={() => handleEditTrack(track)}
                  className="p-2 text-crwn-text-secondary hover:text-crwn-gold transition-colors"
                  title="Edit track"
                >
                  <Edit2 size={16} />
                </button>
                <AddToPlaylistMenu track={track} />
              </div>
            )}
            showDragHandle={true}
            renderPrefix={(track) => (
              <input type="checkbox" checked={selectedTrackIds.has(track.id)} onChange={() => toggleTrackSelection(track.id)} className="w-4 h-4 accent-crwn-gold" onClick={(e) => e.stopPropagation()} />
            )}
          />
        </div>
      ) : (
        <div className="text-center py-8 text-crwn-text-secondary">
          No tracks uploaded yet
        </div>
      )}

      {/* Quick Create Album Modal */}
      {artistProfileId && selectedTrackIds.size > 0 && (
        <QuickCreateAlbumModal
          isOpen={showQuickAlbumModal}
          onClose={() => setShowQuickAlbumModal(false)}
          selectedTrackIds={Array.from(selectedTrackIds)}
          selectedTracks={tracks.filter(t => selectedTrackIds.has(t.id))}
          artistProfileId={artistProfileId}
          onAlbumCreated={() => {
            // Refresh albums and clear selection
            async function refreshAlbums() {
              const { data: albumsData } = await supabase
                .from('albums')
                .select('id, title')
                .eq('artist_id', artistProfileId)
                .eq('is_active', true)
                .order('created_at', { ascending: false });
              if (albumsData) setAlbums(albumsData);
            }
            refreshAlbums();
            setSelectedTrackIds(new Set());
          }}
        />
      )}

      {/* Quick Create Playlist Modal */}
      {artistProfileId && selectedTrackIds.size > 0 && (
        <QuickCreatePlaylistModal
          isOpen={showQuickPlaylistModal}
          onClose={() => setShowQuickPlaylistModal(false)}
          selectedTrackIds={Array.from(selectedTrackIds)}
          selectedTracks={tracks.filter(t => selectedTrackIds.has(t.id))}
          artistProfileId={artistProfileId}
          onPlaylistCreated={() => {
            // Refresh playlists and clear selection
            async function refreshPlaylists() {
              const { data: playlistsData } = await supabase
                .from('playlists')
                .select('id, title')
                .eq('artist_id', artistProfileId)
                .eq('is_artist_playlist', true)
                .eq('is_active', true)
                .order('created_at', { ascending: false });
              if (playlistsData) setArtistPlaylists(playlistsData);
            }
            refreshPlaylists();
            setSelectedTrackIds(new Set());
          }}
        />
      )}

      {/* Confirm Delete Single Track Modal */}
      {confirmDeleteTrack && (
        <ConfirmModal
          isOpen={true}
          title="Delete Track"
          message={`Are you sure you want to delete "${confirmDeleteTrack.title}"?`}
          confirmText="Delete"
          variant="danger"
          onConfirm={() => executeDeleteTrack(confirmDeleteTrack)}
          onCancel={() => setConfirmDeleteTrack(null)}
        />
      )}

      {/* Confirm Bulk Delete Modal */}
      {confirmDeleteBulk && (
        <ConfirmModal
          isOpen={true}
          title="Delete Tracks"
          message={`Are you sure you want to delete ${selectedTrackIds.size} tracks?`}
          confirmText="Delete All"
          variant="danger"
          onConfirm={executeBulkDelete}
          onCancel={() => setConfirmDeleteBulk(false)}
        />
      )}
    </div>
  );
}
