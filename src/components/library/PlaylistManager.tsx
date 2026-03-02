'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Playlist, Track } from '@/types';
import Image from 'next/image';
import { 
  Loader2, 
  Plus, 
  Edit2, 
  Trash2, 
  X,
  Play,
  Pause,
  GripVertical,
  MoreVertical
} from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';

export function PlaylistManager() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const { play, currentTrack, isPlaying } = usePlayer();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    isPublic: true,
  });

  const loadData = useCallback(async () => {
    if (!user) return;

    // Load user playlists
    const { data: playlistsData } = await supabase
      .from('playlists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (playlistsData) {
      // Get track counts
      const playlistsWithCounts = await Promise.all(
        playlistsData.map(async (playlist) => {
          const { count } = await supabase
            .from('playlist_tracks')
            .select('*', { count: 'exact', head: true })
            .eq('playlist_id', playlist.id);
          return { ...playlist, track_count: count || 0 };
        })
      );
      setPlaylists(playlistsWithCounts as Playlist[]);
    }

    // Load all available tracks for adding to playlists
    const { data: tracksData } = await supabase
      .from('tracks')
      .select('*, artist:artist_profiles(id, slug, profile:profiles(display_name))')
      .order('created_at', { ascending: false });

    if (tracksData) {
      setTracks(tracksData as unknown as Track[]);
    }

    setIsLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);

    try {
      if (editingPlaylist) {
        // Update playlist
        const { error } = await supabase
          .from('playlists')
          .update({
            title: formData.title,
            description: formData.description,
            is_public: formData.isPublic,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPlaylist.id);

        if (error) throw error;
        alert('Playlist updated!');
      } else {
        // Create playlist
        const { error } = await supabase
          .from('playlists')
          .insert({
            user_id: user.id,
            title: formData.title,
            description: formData.description,
            is_public: formData.isPublic,
          });

        if (error) throw error;
        alert('Playlist created!');
      }

      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving playlist:', error);
      alert('Failed to save playlist');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (playlist: Playlist) => {
    setEditingPlaylist(playlist);
    setFormData({
      title: playlist.title,
      description: playlist.description || '',
      isPublic: playlist.is_public,
    });
    setShowForm(true);
  };

  const handleDelete = async (playlistId: string) => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;

    await supabase
      .from('playlists')
      .delete()
      .eq('id', playlistId);

    if (selectedPlaylist?.id === playlistId) {
      setSelectedPlaylist(null);
      setPlaylistTracks([]);
    }

    loadData();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingPlaylist(null);
    setFormData({ title: '', description: '', isPublic: true });
  };

  const loadPlaylistTracks = async (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    
    const { data } = await supabase
      .from('playlist_tracks')
      .select('track_id, position, tracks(*, artist:artist_profiles(id, slug, profile:profiles(display_name)))')
      .eq('playlist_id', playlist.id)
      .order('position');
    
    if (data) {
      setPlaylistTracks(data.map(d => d.tracks as unknown as Track));
    }
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!selectedPlaylist) return;

    await supabase
      .from('playlist_tracks')
      .delete()
      .eq('playlist_id', selectedPlaylist.id)
      .eq('track_id', trackId);

    setPlaylistTracks(prev => prev.filter(t => t.id !== trackId));
    loadData();
  };

  const handlePlayAll = () => {
    if (playlistTracks.length > 0) {
      play(playlistTracks[0]);
    }
  };

  if (isLoading && playlists.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-crwn-text">Your Playlists</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors"
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
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text resize-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
                  className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                />
                <span className="text-crwn-text">Make playlist public</span>
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : editingPlaylist ? 'Update Playlist' : 'Create Playlist'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Playlists Grid or Track List */}
      {selectedPlaylist ? (
        <div>
          <button
            onClick={() => setSelectedPlaylist(null)}
            className="text-crwn-gold hover:underline mb-4"
          >
            ← Back to Playlists
          </button>
          
          <div className="bg-crwn-surface rounded-xl p-6 mb-4">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 bg-crwn-elevated rounded-lg flex items-center justify-center text-4xl">
                🎵
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-crwn-text">{selectedPlaylist.title}</h3>
                {selectedPlaylist.description && (
                  <p className="text-crwn-text-secondary">{selectedPlaylist.description}</p>
                )}
                <p className="text-sm text-crwn-text-secondary mt-1">
                  {playlistTracks.length} tracks
                </p>
              </div>
              <button
                onClick={handlePlayAll}
                disabled={playlistTracks.length === 0}
                className="p-3 bg-crwn-gold text-crwn-bg rounded-full hover:bg-crwn-gold-hover disabled:opacity-50"
              >
                <Play className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="space-y-1">
            {playlistTracks.map((track, index) => {
              const isCurrentTrack = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  className="flex items-center gap-3 p-3 bg-crwn-surface rounded-lg hover:bg-crwn-elevated group"
                >
                  <span className="w-6 text-center text-crwn-text-secondary text-sm">{index + 1}</span>
                  <div 
                    className="w-10 h-10 bg-crwn-elevated rounded flex-shrink-0 overflow-hidden"
                  >
                    {track.album_art_url ? (
                      <Image src={track.album_art_url} alt="" width={40} height={40} className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg">🎵</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${isCurrentTrack ? 'text-crwn-gold' : 'text-crwn-text'}`}>
                      {track.title}
                    </p>
                    <p className="text-sm text-crwn-text-secondary truncate">
                      {/* Artist name would go here */}
                    </p>
                  </div>
                  <button
                    onClick={() => play(track)}
                    className="p-2 text-crwn-text-secondary hover:text-crwn-text"
                  >
                    {isCurrentTrack && isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleRemoveTrack(track.id)}
                    className="p-2 text-crwn-error opacity-0 group-hover:opacity-100 hover:bg-crwn-error/10 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            {playlistTracks.length === 0 && (
              <p className="text-center text-crwn-text-secondary py-8">
                No tracks in this playlist
              </p>
            )}
          </div>
        </div>
      ) : playlists.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {playlists.map(playlist => (
            <div
              key={playlist.id}
              className="bg-crwn-surface rounded-xl overflow-hidden border border-crwn-elevated group"
            >
              <div 
                className="aspect-square relative bg-crwn-elevated cursor-pointer"
                onClick={() => loadPlaylistTracks(playlist)}
              >
                <div className="w-full h-full flex items-center justify-center text-4xl">🎵</div>
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-10 h-10 text-white" />
                </div>
              </div>
              <div className="p-3">
                <h3 className="font-medium text-crwn-text truncate">{playlist.title}</h3>
                <p className="text-sm text-crwn-text-secondary">
                  {(playlist as any).track_count || 0} tracks
                </p>
              </div>
              <div className="flex justify-end gap-1 px-3 pb-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(playlist); }}
                  className="p-1.5 bg-crwn-elevated rounded hover:bg-crwn-gold/20"
                >
                  <Edit2 className="w-3 h-3 text-crwn-text" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(playlist.id); }}
                  className="p-1.5 bg-crwn-elevated rounded hover:bg-crwn-error/20"
                >
                  <Trash2 className="w-3 h-3 text-crwn-error" />
                </button>
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
