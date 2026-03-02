'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Album, Track } from '@/types';
import Image from 'next/image';
import { 
  Loader2, 
  Plus, 
  Edit2, 
  Trash2, 
  X,
  Upload,
  GripVertical,
  Play,
  Pause,
  Check
} from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';

export function AlbumManager() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const { play, currentTrack, isPlaying } = usePlayer();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    albumArt: null as File | null,
    albumArtUrl: '',
    releaseDate: new Date().toISOString().split('T')[0],
    accessLevel: 'free' as 'free' | 'subscriber',
  });

  const loadData = useCallback(async () => {
    if (!user) return;
    
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

    // Load albums
    const { data: albumsData } = await supabase
      .from('albums')
      .select('*')
      .eq('artist_id', artistProfile.id)
      .eq('is_active', true)
      .order('release_date', { ascending: false });

    // Load tracks
    const { data: tracksData } = await supabase
      .from('tracks')
      .select('*')
      .eq('artist_id', artistProfile.id)
      .order('created_at', { ascending: false });

    if (albumsData) {
      // Get track counts
      const albumsWithCounts = await Promise.all(
        albumsData.map(async (album) => {
          const { count } = await supabase
            .from('album_tracks')
            .select('*', { count: 'exact', head: true })
            .eq('album_id', album.id);
          return { ...album, track_count: count || 0 };
        })
      );
      setAlbums(albumsWithCounts as Album[]);
    }

    if (tracksData) {
      setTracks(tracksData as Track[]);
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

      let albumArtUrl = formData.albumArtUrl;

      // Upload album art if provided
      if (formData.albumArt) {
        const artExt = formData.albumArt.name.split('.').pop();
        const artFileName = `${Date.now()}.${artExt}`;
        const artPath = `${artistProfile.id}/albums/${artFileName}`;
        
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

      if (editingAlbum) {
        // Update album
        const { error: updateError } = await supabase
          .from('albums')
          .update({
            title: formData.title,
            description: formData.description,
            album_art_url: albumArtUrl,
            release_date: formData.releaseDate,
            access_level: formData.accessLevel,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingAlbum.id);

        if (updateError) throw updateError;

        // Update track associations
        await supabase.from('album_tracks').delete().eq('album_id', editingAlbum.id);
        
        for (let i = 0; i < selectedTracks.length; i++) {
          await supabase.from('album_tracks').insert({
            album_id: editingAlbum.id,
            track_id: selectedTracks[i],
            track_number: i + 1,
          });
        }

        alert('Album updated!');
      } else {
        // Create album
        const { data: album, error: albumError } = await supabase
          .from('albums')
          .insert({
            artist_id: artistProfile.id,
            title: formData.title,
            description: formData.description,
            album_art_url: albumArtUrl,
            release_date: formData.releaseDate,
            access_level: formData.accessLevel,
          })
          .select()
          .single();

        if (albumError) throw albumError;

        // Add tracks
        for (let i = 0; i < selectedTracks.length; i++) {
          await supabase.from('album_tracks').insert({
            album_id: album.id,
            track_id: selectedTracks[i],
            track_number: i + 1,
          });
        }

        alert('Album created!');
      }

      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving album:', error);
      alert('Failed to save album');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (album: Album) => {
    setEditingAlbum(album);
    setFormData({
      title: album.title,
      description: album.description || '',
      albumArt: null,
      albumArtUrl: album.album_art_url || '',
      releaseDate: album.release_date,
      accessLevel: album.access_level === 'subscriber' ? 'subscriber' : 'free',
    });

    // Load album tracks
    async function loadAlbumTracks() {
      const { data } = await supabase
        .from('album_tracks')
        .select('track_id, track_number')
        .eq('album_id', album.id)
        .order('track_number');
      
      if (data) {
        setSelectedTracks(data.map(t => t.track_id));
      }
    }
    loadAlbumTracks();
    setShowForm(true);
  };

  const handleDelete = async (albumId: string) => {
    if (!confirm('Are you sure you want to delete this album?')) return;

    await supabase
      .from('albums')
      .update({ is_active: false })
      .eq('id', albumId);

    loadData();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingAlbum(null);
    setSelectedTracks([]);
    setFormData({
      title: '',
      description: '',
      albumArt: null,
      albumArtUrl: '',
      releaseDate: new Date().toISOString().split('T')[0],
      accessLevel: 'free',
    });
  };

  const toggleTrack = (trackId: string) => {
    setSelectedTracks(prev => 
      prev.includes(trackId) 
        ? prev.filter(id => id !== trackId)
        : [...prev, trackId]
    );
  };

  if (isLoading) {
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
        <h2 className="text-xl font-semibold text-crwn-text">Albums</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Album
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-crwn-surface rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-crwn-text">
                {editingAlbum ? 'Edit Album' : 'Create Album'}
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

              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Album Art</label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-crwn-elevated rounded-lg overflow-hidden flex items-center justify-center">
                    {formData.albumArt ? (
                      <Image src={URL.createObjectURL(formData.albumArt)} alt="" width={96} height={96} className="object-cover" />
                    ) : formData.albumArtUrl ? (
                      <Image src={formData.albumArtUrl} alt="" width={96} height={96} className="object-cover" />
                    ) : (
                      <span className="text-3xl">🎵</span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 px-4 py-2 bg-crwn-bg border border-crwn-elevated rounded-lg cursor-pointer text-crwn-text hover:bg-crwn-elevated">
                    <Upload className="w-4 h-4" />
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        albumArt: e.target.files?.[0] || null 
                      }))}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Release Date</label>
                  <input
                    type="date"
                    value={formData.releaseDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, releaseDate: e.target.value }))}
                    className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Access Level</label>
                  <select
                    value={formData.accessLevel}
                    onChange={(e) => setFormData(prev => ({ ...prev, accessLevel: e.target.value as 'free' | 'subscriber' }))}
                    className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                  >
                    <option value="free">Free</option>
                    <option value="subscriber">Subscribers Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-2">Select Tracks ({selectedTracks.length} selected)</label>
                <div className="max-h-48 overflow-y-auto bg-crwn-bg rounded-lg p-2 space-y-1">
                  {tracks.map(track => (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => toggleTrack(track.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        selectedTracks.includes(track.id)
                          ? 'bg-crwn-gold/20 text-crwn-text'
                          : 'text-crwn-text-secondary hover:bg-crwn-elevated'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                        selectedTracks.includes(track.id)
                          ? 'bg-crwn-gold border-crwn-gold'
                          : 'border-crwn-text-secondary'
                      }`}>
                        {selectedTracks.includes(track.id) && <Check className="w-3 h-3 text-crwn-bg" />}
                      </div>
                      <span className="flex-1 text-left">{track.title}</span>
                      <span className="text-sm text-crwn-text-secondary">
                        {Math.floor((track.duration || 0) / 60)}:{(track.duration || 0) % 60}
                      </span>
                    </button>
                  ))}
                  {tracks.length === 0 && (
                    <p className="text-center text-crwn-text-secondary py-4">
                      No tracks uploaded yet
                    </p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : editingAlbum ? 'Update Album' : 'Create Album'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Albums Grid */}
      {albums.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {albums.map(album => (
            <div
              key={album.id}
              className="bg-crwn-surface rounded-xl overflow-hidden border border-crwn-elevated group"
            >
              <div className="aspect-square relative bg-crwn-elevated">
                {album.album_art_url ? (
                  <Image src={album.album_art_url} alt={album.title} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🎵</div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={() => handleEdit(album)}
                    className="p-2 bg-crwn-gold text-crwn-bg rounded-full hover:bg-crwn-gold-hover"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(album.id)}
                    className="p-2 bg-crwn-error text-white rounded-full hover:bg-crwn-error/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="p-3">
                <h3 className="font-medium text-crwn-text truncate">{album.title}</h3>
                <p className="text-sm text-crwn-text-secondary">
                  {album.track_count || 0} tracks • {album.release_date}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-crwn-text-secondary">
          No albums yet. Create your first album!
        </div>
      )}
    </div>
  );
}
