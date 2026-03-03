'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';
import { Playlist, Track } from '@/types';
import Image from 'next/image';
import {
  Loader2, Plus, Edit2, Trash2, X, Upload,
  Lock, Globe
} from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';
import { SortableTrackList } from '@/components/shared/SortableTrackList';

interface PlaylistFormData {
  title: string;
  description: string;
  coverFile: File | null;
  coverUrl: string;
  isPublic: boolean;
}

export function PlaylistManager() {
  const { user } = useAuth();
  const { play, pause } = usePlayer();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [availableTracks, setAvailableTracks] = useState<Track[]>([]);

  const [formData, setFormData] = useState<PlaylistFormData>({
    title: '',
    description: '',
    coverFile: null,
    coverUrl: '',
    isPublic: false,
  });

  const loadPlaylists = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const { data: playlistsData, error } = await supabase
        .from('playlists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

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
    } catch (error) {
      console.error('Error loading playlists:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const loadAvailableTracks = useCallback(async () => {
    if (!user) return;

    try {
      // Get all tracks the user has access to (their own or free tracks)
      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      let tracksQuery = supabase
        .from('tracks')
        .select('*')
        .order('created_at', { ascending: false });

      if (artistProfile) {
        // Show own tracks + free tracks
        tracksQuery = tracksQuery.or(`artist_id.eq.${artistProfile.id},access_level.eq.free`);
      } else {
        // Just free tracks
        tracksQuery = tracksQuery.eq('access_level', 'free');
      }

      const { data: tracksData } = await tracksQuery;
      setAvailableTracks((tracksData || []) as Track[]);
    } catch (error) {
      console.error('Error loading tracks:', error);
    }
  }, [user]);

  useEffect(() => {
    loadPlaylists();
    loadAvailableTracks();
  }, [loadPlaylists, loadAvailableTracks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      let coverUrl = formData.coverUrl;

      // Upload cover if new file selected
      if (formData.coverFile) {
        const ext = formData.coverFile.name.split('.').pop();
        const fileName = `${Date.now()}.${ext}`;
        const path = `${user.id}/playlists/${fileName}`;

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
            is_public: formData.isPublic,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPlaylist.id);

        if (updateError) throw updateError;
        alert('Playlist updated!');
      } else {
        // Create playlist
        const { error: insertError } = await supabase
          .from('playlists')
          .insert({
            user_id: user.id,
            title: formData.title,
            description: formData.description || null,
            cover_url: coverUrl || null,
            is_public: formData.isPublic,
          });

        if (insertError) throw insertError;
        alert('Playlist created!');
      }

      resetForm();
      loadPlaylists();
    } catch (error) {
      console.error('Error saving playlist:', error);
      alert('Failed to save playlist');
    }
  };

  const handleDelete = async (playlistId: string) => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;

    try {
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId);

      if (error) throw error;
      loadPlaylists();
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist(null);
        setPlaylistTracks([]);
      }
    } catch (error) {
      console.error('Error deleting playlist:', error);
      alert('Failed to delete playlist');
    }
  };

  const handleEdit = (playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setFormData({
      title: playlist.title,
      description: playlist.description || '',
      coverFile: null,
      coverUrl: playlist.cover_url || '',
      isPublic: playlist.is_public,
    });
    setShowForm(true);
  };

  const handleViewPlaylist = async (playlist: Playlist) => {
    setSelectedPlaylist(playlist);

    // Load playlist tracks
    const { data: playlistTracksData } = await supabase
      .from('playlist_tracks')
      .select('*, track:tracks(*)')
      .eq('playlist_id', playlist.id)
      .order('position');

    const tracks = (playlistTracksData || [])
      .filter((pt) => pt.track)
      .map((pt) => ({ ...pt.track, position: pt.position }));

    setPlaylistTracks(tracks as Track[]);
  };

  const handleAddTrack = async (track: Track) => {
    if (!selectedPlaylist) return;

    try {
      // Get current max position
      const { data: existingTracks } = await supabase
        .from('playlist_tracks')
        .select('position')
        .eq('playlist_id', selectedPlaylist.id)
        .order('position', { ascending: false })
        .limit(1);

      const newPosition = (existingTracks?.[0]?.position || 0) + 1;

      const { error } = await supabase
        .from('playlist_tracks')
        .insert({
          playlist_id: selectedPlaylist.id,
          track_id: track.id,
          position: newPosition,
        });

      if (error) throw error;

      // Reload tracks
      handleViewPlaylist(selectedPlaylist);
    } catch (error) {
      console.error('Error adding track:', error);
      alert('Failed to add track');
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!selectedPlaylist) return;

    try {
      await supabase
        .from('playlist_tracks')
        .delete()
        .eq('playlist_id', selectedPlaylist.id)
        .eq('track_id', trackId);

      handleViewPlaylist(selectedPlaylist);
    } catch (error) {
      console.error('Error removing track:', error);
      alert('Failed to remove track');
    }
  };

  const handleReorderTracks = async (reorderedTracks: Track[]) => {
    if (!selectedPlaylist) return;

    setPlaylistTracks(reorderedTracks);

    // Update positions in DB
    for (let i = 0; i < reorderedTracks.length; i++) {
      await supabase
        .from('playlist_tracks')
        .update({ position: i + 1 })
        .eq('playlist_id', selectedPlaylist.id)
        .eq('track_id', reorderedTracks[i].id);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingPlaylist(null);
    setFormData({
      title: '',
      description: '',
      coverFile: null,
      coverUrl: '',
      isPublic: false,
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  // View: Single Playlist
  if (selectedPlaylist) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setSelectedPlaylist(null);
              setPlaylistTracks([]);
            }}
            className="text-crwn-text-secondary hover:text-crwn-text"
          >
            ← Back
          </button>
          <h2 className="text-xl font-semibold text-crwn-text">{selectedPlaylist.title}</h2>
          <button
            onClick={() => handleEdit(selectedPlaylist)}
            className="p-2 text-crwn-text-secondary hover:text-crwn-text"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(selectedPlaylist.id)}
            className="p-2 text-crwn-error hover:bg-crwn-error/10 rounded"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {selectedPlaylist.description && (
          <p className="text-crwn-text-secondary">{selectedPlaylist.description}</p>
        )}

        {/* Add Track */}
        <div>
          <h3 className="text-sm font-medium text-crwn-text-secondary mb-2">Add Tracks</h3>
          <div className="max-h-32 overflow-y-auto bg-crwn-bg rounded-lg p-2 space-y-1">
            {availableTracks
              .filter((t) => !playlistTracks.some((pt) => pt.id === t.id))
              .map((track) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => handleAddTrack(track)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-crwn-elevated text-left"
                >
                  <Plus className="w-4 h-4 text-crwn-gold" />
                  <span className="flex-1 text-crwn-text truncate">{track.title}</span>
                  <span className="text-crwn-text-secondary text-sm">{formatDuration(track.duration)}</span>
                </button>
              ))}
          </div>
        </div>

        {/* Playlist Tracks with DnD */}
        {playlistTracks.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium text-crwn-text-secondary mb-2">
              Tracks ({playlistTracks.length})
            </h3>
            <SortableTrackList
              tracks={playlistTracks}
              onReorder={handleReorderTracks}
              onRemove={handleRemoveTrack}
              showDragHandle={true}
            />
          </div>
        ) : (
          <p className="text-crwn-text-secondary">No tracks in this playlist</p>
        )}
      </div>
    );
  }

  // View: Playlist List
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-crwn-text">Playlists</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover"
        >
          <Plus className="w-4 h-4" />
          New Playlist
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-crwn-surface rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-crwn-text">
                {editingPlaylist ? 'Edit Playlist' : 'Create Playlist'}
              </h3>
              <button onClick={resetForm} className="text-crwn-text-secondary hover:text-crwn-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Cover Image</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-crwn-elevated rounded-lg overflow-hidden flex items-center justify-center">
                    {formData.coverFile ? (
                      <Image
                        src={URL.createObjectURL(formData.coverFile)}
                        alt=""
                        width={64}
                        height={64}
                        className="object-cover"
                      />
                    ) : formData.coverUrl ? (
                      <Image src={formData.coverUrl} alt="" width={64} height={64} className="object-cover" />
                    ) : (
                      <span className="text-2xl">🎶</span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 px-4 py-2 bg-crwn-bg border border-crwn-elevated rounded-lg cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Upload
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

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData((p) => ({ ...p, isPublic: e.target.checked }))}
                  className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                />
                <span className="text-crwn-text">Public playlist</span>
                {formData.isPublic ? (
                  <Globe className="w-4 h-4 text-crwn-gold" />
                ) : (
                  <Lock className="w-4 h-4 text-crwn-text-secondary" />
                )}
              </label>

              <button
                type="submit"
                className="w-full py-3 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover"
              >
                {editingPlaylist ? 'Update Playlist' : 'Create Playlist'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Playlist Grid */}
      {playlists.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              onClick={() => handleViewPlaylist(playlist)}
              className="bg-crwn-surface rounded-xl overflow-hidden border border-crwn-elevated group cursor-pointer"
            >
              <div className="aspect-square relative bg-crwn-elevated">
                {playlist.cover_url ? (
                  <Image src={playlist.cover_url} alt={playlist.title} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🎶</div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(playlist);
                    }}
                    className="p-2 bg-crwn-gold rounded-full"
                  >
                    <Edit2 className="w-4 h-4 text-crwn-bg" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(playlist.id);
                    }}
                    className="p-2 bg-crwn-error rounded-full"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                </div>
                {playlist.is_public ? (
                  <Globe className="absolute top-2 right-2 w-4 h-4 text-crwn-gold" />
                ) : (
                  <Lock className="absolute top-2 right-2 w-4 h-4 text-crwn-text-secondary" />
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
