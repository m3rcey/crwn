'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';
import { Playlist, Track } from '@/types';
import Image from 'next/image';
import { SortableTrackList } from '@/components/shared/SortableTrackList';

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
}

interface PlaylistFormData {
  title: string;
  description: string;
  coverFile: File | null;
  coverUrl: string;
  isFree: boolean;
  allowedTierIds: string[];
  price: string;
}

export function ArtistPlaylistManager() {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [availableTracks, setAvailableTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);

  const [formData, setFormData] = useState<PlaylistFormData>({
    title: '',
    description: '',
    coverFile: null,
    coverUrl: '',
    isFree: true,
    allowedTierIds: [],
    price: '',
  });

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Get artist profile
      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!artistProfile) {
        setIsLoading(false);
        return;
      }

      // Load artist playlists
      const { data: playlistsData } = await supabase
        .from('playlists')
        .select('*')
        .eq('artist_id', artistProfile.id)
        .eq('is_artist_playlist', true)
        .order('created_at', { ascending: false });

      // Get track counts for each playlist
      const playlistsWithCounts = await Promise.all(
        (playlistsData || []).map(async (playlist) => {
          const { count } = await supabase
            .from('playlist_tracks')
            .select('*', { count: 'exact', head: true })
            .eq('playlist_id', playlist.id);
          return { ...playlist, track_count: count || 0 };
        })
      );

      setPlaylists(playlistsWithCounts as Playlist[]);

      // Load subscription tiers
      const { data: tiersData } = await supabase
        .from('subscription_tiers')
        .select('id, name, price')
        .eq('artist_id', artistProfile.id)
        .eq('is_active', true)
        .order('price', { ascending: true });
      if (tiersData) setTiers(tiersData);

      // Load available tracks (artist's own tracks)
      const { data: allTracks } = await supabase
        .from('tracks')
        .select('*')
        .eq('artist_id', artistProfile.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      // Filter out tracks already in playlists
      const trackIdsInPlaylists = new Set<string>();
      for (const playlist of playlistsWithCounts) {
        const { data: pt } = await supabase
          .from('playlist_tracks')
          .select('track_id')
          .eq('playlist_id', playlist.id);
        if (pt) {
          pt.forEach((p) => trackIdsInPlaylists.add(p.track_id));
        }
      }
      
      const available = (allTracks || []).filter((t: Track) => !trackIdsInPlaylists.has(t.id));
      setAvailableTracks(available as Track[]);

    } catch (error) {
      console.error('Error loading playlists:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // Get artist profile
      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!artistProfile) {
        alert('Artist profile not found');
        return;
      }

      let coverUrl = formData.coverUrl;

      // Upload cover if new file selected
      if (formData.coverFile) {
        const ext = formData.coverFile.name.split('.').pop();
        const fileName = `${Date.now()}.${ext}`;
        const path = `${artistProfile.id}/playlists/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('album-art')
          .upload(path, formData.coverFile);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('album-art')
            .getPublicUrl(path);
          coverUrl = urlData.publicUrl;
        }
      }

      if (editingPlaylist) {
        // Update playlist
        const { error: updateError } = await supabase
          .from('playlists')
          .update({
            title: formData.title,
            description: formData.description || null,
            cover_url: coverUrl || null,
            is_free: formData.isFree,
            allowed_tier_ids: formData.allowedTierIds,
            price: formData.price ? Math.round(parseFloat(formData.price) * 100) : null,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPlaylist.id);

        if (updateError) throw updateError;

        // Update track associations
        await updatePlaylistTracks(editingPlaylist.id, selectedTracks);
        alert('Playlist updated!');
      } else {
        // Create playlist
        const { data: playlist, error: insertError } = await supabase
          .from('playlists')
          .insert({
            artist_id: artistProfile.id,
            user_id: user.id,
            title: formData.title,
            description: formData.description || null,
            cover_url: coverUrl || null,
            is_artist_playlist: true,
            is_free: formData.isFree,
            allowed_tier_ids: formData.allowedTierIds,
            price: formData.price ? Math.round(parseFloat(formData.price) * 100) : null,
            is_active: true,
            is_public: true,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Add tracks to playlist
        if (playlist && selectedTracks.length > 0) {
          await updatePlaylistTracks(playlist.id, selectedTracks);
        }

        alert('Playlist created!');
      }

      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving playlist:', error);
      alert('Failed to save playlist');
    }
  };

  const updatePlaylistTracks = async (playlistId: string, tracks: Track[]) => {
    // Remove all existing tracks
    await supabase.from('playlist_tracks').delete().eq('playlist_id', playlistId);

    // Add tracks in order
    for (let i = 0; i < tracks.length; i++) {
      await supabase.from('playlist_tracks').insert({
        playlist_id: playlistId,
        track_id: tracks[i].id,
        position: i + 1,
      });
    }
  };

  const handleEdit = async (playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setFormData({
      title: playlist.title,
      description: playlist.description || '',
      coverFile: null,
      coverUrl: playlist.cover_url || '',
      isFree: playlist.is_free ?? true,
      price: playlist.price ? (playlist.price / 100).toString() : '',
      allowedTierIds: playlist.allowed_tier_ids ?? [],
    });

    // Load playlist tracks
    const { data: playlistTracks } = await supabase
      .from('playlist_tracks')
      .select('*, track:tracks(*)')
      .eq('playlist_id', playlist.id)
      .order('position');

    const tracks = (playlistTracks || [])
      .filter((pt) => pt.track)
      .map((pt) => ({ ...pt.track, position: pt.position }));

    setSelectedTracks(tracks as Track[]);

    // Load available tracks
    const { data: artistProfile } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (!artistProfile) return;

    const { data: allTracks } = await supabase
      .from('tracks')
      .select('*')
      .eq('artist_id', artistProfile.id)
      .eq('is_active', true);

    const trackIdsInPlaylist = new Set(tracks.map((t: Track) => t.id));
    const available = (allTracks || []).filter((t: Track) => !trackIdsInPlaylist.has(t.id));
    setAvailableTracks(available as Track[]);

    setShowForm(true);
  };

  const handleDelete = async (playlistId: string) => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;

    await supabase
      .from('playlists')
      .delete()
      .eq('id', playlistId);

    loadData();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingPlaylist(null);
    setSelectedTracks([]);
    setFormData({
      title: '',
      description: '',
      coverFile: null,
      coverUrl: '',
      isFree: true,
      allowedTierIds: [],
      price: '',
    });
  };

  const handleReorderTracks = (reorderedTracks: Track[]) => {
    setSelectedTracks(reorderedTracks);
  };

  const addTrack = (track: Track) => {
    setSelectedTracks([...selectedTracks, track]);
    setAvailableTracks(availableTracks.filter((t) => t.id !== track.id));
  };

  const removeTrack = (trackId: string) => {
    const track = selectedTracks.find((t) => t.id === trackId);
    if (track) {
      setSelectedTracks(selectedTracks.filter((t) => t.id !== trackId));
      setAvailableTracks([...availableTracks, track]);
    }
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-crwn-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-crwn-text">Playlists</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 neu-button-accent text-crwn-bg"
        >
          <span>+</span>
          New Playlist
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-crwn-surface rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-crwn-text">
                {editingPlaylist ? 'Edit Playlist' : 'Create Playlist'}
              </h3>
              <button
                onClick={resetForm}
                className="text-crwn-text-secondary hover:text-crwn-text"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
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
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full neu-inset w-full px-4 py-2 text-crwn-text resize-none"
                />
              </div>

              {/* Cover Art */}
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
                  Cover Art
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-crwn-elevated rounded-lg overflow-hidden flex items-center justify-center">
                    {formData.coverFile ? (
                      <Image
                        src={URL.createObjectURL(formData.coverFile)}
                        alt=""
                        width={96}
                        height={96}
                        className="object-cover"
                      />
                    ) : formData.coverUrl ? (
                      <Image
                        src={formData.coverUrl}
                        alt=""
                        width={96}
                        height={96}
                        className="object-cover"
                      />
                    ) : (
                      <span className="text-3xl">🎶</span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 px-4 py-2 bg-crwn-bg border border-crwn-elevated rounded-lg cursor-pointer">
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, coverFile: e.target.files?.[0] || null }))
                      }
                    />
                  </label>
                </div>
              </div>

              {/* Access Control */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
                    Access
                  </label>
                  <div className="space-y-2 bg-crwn-bg border border-crwn-elevated rounded-lg p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isFree}
                        onChange={(e) => setFormData((p) => ({ ...p, isFree: e.target.checked }))}
                        className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold"
                      />
                      <span className="text-crwn-text text-sm">Free (anyone)</span>
                    </label>
                    {tiers.map((tier) => (
                      <label key={tier.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.allowedTierIds.includes(tier.id)}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...formData.allowedTierIds, tier.id]
                              : formData.allowedTierIds.filter((id) => id !== tier.id);
                            setFormData((p) => ({ ...p, allowedTierIds: ids }));
                          }}
                          className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold"
                        />
                        <span className="text-crwn-text text-sm">
                          {tier.name} (${(tier.price / 100).toFixed(0)}/mo)
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">
                    Price (optional one-time)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-crwn-text">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Leave empty"
                      value={formData.price}
                      onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                      className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                    />
                  </div>
                </div>
              </div>

              {/* Track Selection */}
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
                  Tracks ({selectedTracks.length} selected)
                </label>

                {/* Selected Tracks - Reorderable with DnD */}
                <div className="mb-4">
                  {selectedTracks.length > 0 ? (
                    <SortableTrackList
                      tracks={selectedTracks}
                      onReorder={handleReorderTracks}
                      onRemove={removeTrack}
                      showDragHandle={true}
                    />
                  ) : (
                    <div className="text-crwn-text-secondary text-sm py-4 text-center bg-crwn-bg rounded-lg">
                      No tracks selected
                    </div>
                  )}
                </div>

                {/* Available Tracks */}
                {availableTracks.length > 0 && (
                  <>
                    <p className="text-sm text-crwn-text-secondary mb-2">Add existing tracks:</p>
                    <div className="max-h-32 overflow-y-auto bg-crwn-bg rounded-lg p-2 space-y-1">
                      {availableTracks.map((track) => (
                        <button
                          key={track.id}
                          type="button"
                          onClick={() => addTrack(track)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-crwn-elevated text-left"
                        >
                          <span className="text-crwn-gold">+</span>
                          <span className="flex-1 text-crwn-text truncate">{track.title}</span>
                          <span className="text-crwn-text-secondary text-sm">
                            {formatDuration(track.duration)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 neu-button-accent text-crwn-bg"
              >
                {editingPlaylist ? 'Update Playlist' : 'Create Playlist'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Playlists Grid */}
      {playlists.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              className="bg-crwn-surface rounded-xl overflow-hidden border border-crwn-elevated group"
            >
              <div className="aspect-square relative bg-crwn-elevated">
                {playlist.cover_url ? (
                  <Image
                    src={playlist.cover_url}
                    alt={playlist.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">
                    🎶
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => handleEdit(playlist)}
                    className="p-2 bg-crwn-gold rounded-full"
                  >
                    <span className="text-crwn-bg">✏️</span>
                  </button>
                  <button
                    onClick={() => handleDelete(playlist.id)}
                    className="p-2 bg-crwn-error rounded-full"
                  >
                    <span className="text-white">🗑️</span>
                  </button>
                </div>
                {!playlist.is_active && (
                  <div className="absolute top-2 right-2 px-2 py-1 bg-crwn-elevated text-crwn-text-secondary text-xs rounded">
                    Draft
                  </div>
                )}
              </div>
              <div className="p-3">
                <h3 className="font-medium text-crwn-text truncate">{playlist.title}</h3>
                <p className="text-sm text-crwn-text-secondary">
                  {playlist.track_count || 0} tracks
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-crwn-text-secondary">
          No playlists yet. Create your first playlist!
        </div>
      )}
    </div>
  );
}
