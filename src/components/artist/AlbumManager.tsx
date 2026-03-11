'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { supabase } from '@/lib/supabase/client';
import { Album, Track } from '@/types';
import Image from 'next/image';
import { SortableTrackList } from '@/components/shared/SortableTrackList';

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
}
import { 
  Loader2, Plus, Edit2, Trash2, X, Upload, 
  Eye, EyeOff 
} from 'lucide-react';

interface AlbumFormData {
  title: string;
  description: string;
  albumArtFile: File | null;
  albumArtUrl: string;
  releaseDate: string;
  isFree: boolean;
  allowedTierIds: string[];
  isPublished: boolean;
  price: string;
}

export function AlbumManager() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [availableTracks, setAvailableTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  
  // Track upload state
  const [isUploadingTrack, setIsUploadingTrack] = useState(false);
  const [newTrackFile, setNewTrackFile] = useState<File | null>(null);
  const [newTrackTitle, setNewTrackTitle] = useState('');

  const [formData, setFormData] = useState<AlbumFormData>({
    title: '',
    description: '',
    albumArtFile: null,
    albumArtUrl: '',
    releaseDate: new Date().toISOString().split('T')[0],
    isFree: true,
    allowedTierIds: [],
    price: '',
    isPublished: false,
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

      // Load albums
      const { data: albumsData } = await supabase
        .from('albums')
        .select('*')
        .eq('artist_id', artistProfile.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      // Load subscription tiers
      const { data: tiersData } = await supabase
        .from('subscription_tiers')
        .select('id, name, price')
        .eq('artist_id', artistProfile.id)
        .eq('is_active', true)
        .order('price', { ascending: true });
      if (tiersData) setTiers(tiersData);

      // Get track counts and tracks for each album
      const albumsWithData = await Promise.all(
        (albumsData || []).map(async (album) => {
          const { data: albumTracks } = await supabase
            .from('album_tracks')
            .select('*, track:tracks(*)')
            .eq('album_id', album.id)
            .order('track_number');

          const tracks = (albumTracks || [])
            .filter(at => at.track)
            .map(at => ({ ...at.track, position: at.track_number }));

          return { 
            ...album, 
            tracks,
            track_count: tracks.length 
          };
        })
      );

      setAlbums(albumsWithData as Album[]);

      // Load available tracks (not in any album)
      const { data: allTracks } = await supabase
        .from('tracks')
        .select('*')
        .eq('artist_id', artistProfile.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      // Filter out tracks already in albums
      const trackIdsInAlbums = new Set(
        albumsWithData.flatMap((a: Album) => 
          (a.tracks || []).map((t: Track) => t.id)
        )
      );
      const available = (allTracks || []).filter((t: Track) => !trackIdsInAlbums.has(t.id));
      setAvailableTracks(available as Track[]);

    } catch (error) {
      console.error('Error loading albums:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUploadTrackInForm = async () => {
    if (!newTrackFile || !newTrackTitle || !user) return;

    setIsUploadingTrack(true);

    try {
      // Get artist profile
      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id, slug')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!artistProfile) {
        showToast('Artist profile not found', 'error');
        setIsUploadingTrack(false);
        return;
      }

      // Get duration
      let duration = 180;
      try {
        const audioElement = new Audio();
        const audioBlob = new Blob([newTrackFile], { type: newTrackFile.type });
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

      // Upload audio
      const audioExt = newTrackFile.name.split('.').pop();
      const audioFileName = `${Date.now()}.${audioExt}`;
      const audioPath = `${artistProfile.id}/${audioFileName}`;
      
      const { error: audioError } = await supabase.storage
        .from('audio')
        .upload(audioPath, newTrackFile);

      let audioUrl = '';
      if (audioError) {
        console.error('Audio upload error:', audioError);
        audioUrl = `https://crwn-media.r2.dev/${artistProfile.slug}/audio/${audioFileName}`;
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('audio')
          .getPublicUrl(audioPath);
        audioUrl = publicUrl;
      }

      // Save track to DB
      const { data: newTrack, error } = await supabase
        .from('tracks')
        .insert({
          artist_id: artistProfile.id,
          title: newTrackTitle,
          audio_url_128: audioUrl,
          audio_url_320: audioUrl,
          duration,
          access_level: 'free',
        })
        .select()
        .single();

      if (error) throw error;

      // Add to selected tracks
      if (newTrack) {
        setSelectedTracks(prev => [...prev, newTrack as Track]);
      }

      // Reset upload fields
      setNewTrackFile(null);
      setNewTrackTitle('');
      showToast('Track uploaded and added to album!', 'success');
    } catch (error) {
      console.error('Error uploading track:', error);
      showToast('Failed to upload track', 'error');
    } finally {
      setIsUploadingTrack(false);
    }
  };

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
        showToast('Artist profile not found', 'error');
        return;
      }

      let albumArtUrl = formData.albumArtUrl;

      // Upload album art if new file selected
      if (formData.albumArtFile) {
        const ext = formData.albumArtFile.name.split('.').pop();
        const fileName = `${Date.now()}.${ext}`;
        const path = `${artistProfile.id}/albums/${fileName}`;
        
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

      if (editingAlbum) {
        // Update album
        const { error: updateError } = await supabase
          .from('albums')
          .update({
            title: formData.title,
            description: formData.description || null,
            album_art_url: albumArtUrl || null,
            release_date: formData.releaseDate,
            is_free: formData.isFree,
            allowed_tier_ids: formData.allowedTierIds,
            is_active: true,
            price: formData.price ? Math.round(parseFloat(formData.price) * 100) : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingAlbum.id);

        if (updateError) throw updateError;

        // Update track associations
        await updateAlbumTracks(editingAlbum.id, selectedTracks);
        // Update album art on all tracks in this album
        if (albumArtUrl && selectedTracks.length > 0) {
          await supabase
            .from('tracks')
            .update({ album_art_url: albumArtUrl })
            .in('id', selectedTracks.map(t => t.id));
        }
        showToast('Album updated!', 'success');
      } else {
        // Create album
        const { data: album, error: albumError } = await supabase
          .from('albums')
          .insert({
            artist_id: artistProfile.id,
            title: formData.title,
            description: formData.description || null,
            album_art_url: albumArtUrl || null,
            release_date: formData.releaseDate,
            is_free: formData.isFree,
            allowed_tier_ids: formData.allowedTierIds,
            is_active: true,
            price: formData.price ? Math.round(parseFloat(formData.price) * 100) : null,
          })
          .select()
          .single();

        if (albumError) throw albumError;

        // Add tracks to album
        if (album && selectedTracks.length > 0) {
          await updateAlbumTracks(album.id, selectedTracks);
          // Update album art on all tracks in this album
          if (albumArtUrl) {
            await supabase
              .from('tracks')
              .update({ album_art_url: albumArtUrl })
              .in('id', selectedTracks.map(t => t.id));
          }
        }

        showToast('Album created!', 'success');
      }

      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving album:', error);
      showToast('Failed to save album', 'error');
    }
  };

  const updateAlbumTracks = async (albumId: string, tracks: Track[]) => {
    // Remove all existing tracks
    await supabase.from('album_tracks').delete().eq('album_id', albumId);

    // Add tracks in order
    for (let i = 0; i < tracks.length; i++) {
      await supabase.from('album_tracks').insert({
        album_id: albumId,
        track_id: tracks[i].id,
        track_number: i + 1,
      });
    }
  };

  const handleEdit = async (album: Album) => {
    setEditingAlbum(album);
    setFormData({
      title: album.title,
      description: album.description || '',
      albumArtFile: null,
      albumArtUrl: album.album_art_url || '',
      releaseDate: album.release_date,
      isFree: album.is_free ?? true,
      price: album.price ? (album.price / 100).toString() : '',
      allowedTierIds: album.allowed_tier_ids ?? [],
      isPublished: album.is_active,
    });

    // Load album tracks
    const { data: albumTracks } = await supabase
      .from('album_tracks')
      .select('*, track:tracks(*)')
      .eq('album_id', album.id)
      .order('track_number');

    const tracks = (albumTracks || [])
      .filter(at => at.track)
      .map(at => ({ ...at.track, position: at.track_number }));

    setSelectedTracks(tracks as Track[]);

    // Load available tracks
    const { data: allTracks } = await supabase
      .from('tracks')
      .select('*')
      .eq('artist_id', album.artist_id)
      .eq('is_active', true);

    const trackIdsInAlbum = new Set(tracks.map((t: Track) => t.id));
    const available = (allTracks || []).filter((t: Track) => !trackIdsInAlbum.has(t.id));
    setAvailableTracks(available as Track[]);

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

  const handleTogglePublish = async (album: Album) => {
    await supabase
      .from('albums')
      .update({ 
        is_active: !album.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', album.id);

    loadData();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingAlbum(null);
    setSelectedTracks([]);
    setFormData({
      title: '',
      description: '',
      albumArtFile: null,
      albumArtUrl: '',
      releaseDate: new Date().toISOString().split('T')[0],
      isFree: true,
      allowedTierIds: [],
      isPublished: false,
      price: '',
    });
    setNewTrackFile(null);
    setNewTrackTitle('');
  };

  const handleReorderTracks = (reorderedTracks: Track[]) => {
    setSelectedTracks(reorderedTracks);
  };

  const addTrack = (track: Track) => {
    setSelectedTracks([...selectedTracks, track]);
    setAvailableTracks(availableTracks.filter(t => t.id !== track.id));
  };

  const removeTrack = (trackId: string) => {
    const track = selectedTracks.find(t => t.id === trackId);
    if (track) {
      setSelectedTracks(selectedTracks.filter(t => t.id !== trackId));
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
          className="flex items-center gap-2 px-4 py-2 neu-button-accent text-crwn-bg hover-glow"
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
              {/* Title */}
              <div className="">
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                    className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full neu-inset w-full px-4 py-2 text-crwn-text resize-none"
                />
              </div>

              {/* Album Art */}
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Album Art</label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-crwn-elevated rounded-lg overflow-hidden flex items-center justify-center">
                    {formData.albumArtFile ? (
                      <Image src={URL.createObjectURL(formData.albumArtFile)} alt="" width={96} height={96} className="object-cover" />
                    ) : formData.albumArtUrl ? (
                      <Image src={formData.albumArtUrl} alt="" width={96} height={96} className="object-cover" />
                    ) : (
                      <span className="text-3xl">🎵</span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 px-4 py-2 bg-crwn-bg border border-crwn-elevated rounded-lg cursor-pointer">
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

              {/* Release Date & Access */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Release Date</label>
                  <input
                    type="date"
                    value={formData.releaseDate}
                    onChange={(e) => setFormData(p => ({ ...p, releaseDate: e.target.value }))}
                    className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Access</label>
                  <div className="space-y-2 bg-crwn-bg border border-crwn-elevated rounded-lg p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isFree}
                        onChange={(e) => setFormData(p => ({ ...p, isFree: e.target.checked }))}
                        className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                      />
                      <span className="text-crwn-text text-sm">Free (anyone)</span>
                    </label>
                    {tiers.map(tier => (
                      <label key={tier.id} className="flex items-center gap-2 cursor-pointer">
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
              </div>
              {/* Price (one-time purchase) */}
              <div>
                <label className="block text-sm font-medium text-crwn-text-secondary mb-1">Price (optional one-time purchase)</label>
                <div className="flex items-center gap-2">
                  <span className="text-crwn-text">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Leave empty if not for sale"
                    value={formData.price}
                    onChange={(e) => setFormData(p => ({ ...p, price: e.target.value }))}
                    className="w-full neu-inset w-full px-4 py-2 text-crwn-text"
                  />
                </div>
                <p className="text-xs text-crwn-text-secondary mt-1">Fans can buy the album outright, in addition to tier access</p>
              </div>

              {/* Published Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPublished}
                  onChange={(e) => setFormData(p => ({ ...p, isPublished: e.target.checked }))}
                  className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                />
                <span className="text-crwn-text">Published (visible to fans)</span>
              </label>

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

                {/* Upload Track Inline */}
                <div className="mb-4 p-3 bg-crwn-bg rounded-lg border border-crwn-elevated">
                  <p className="text-sm font-medium text-crwn-text-secondary mb-2">Upload new track directly:</p>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => setNewTrackFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="inline-track-upload"
                    />
                    <label
                      htmlFor="inline-track-upload"
                      className="flex items-center gap-2 px-3 py-2 bg-crwn-surface border border-crwn-elevated rounded-lg cursor-pointer text-sm"
                    >
                      <Upload className="w-4 h-4" />
                      {newTrackFile ? newTrackFile.name.slice(0, 20) + '...' : 'Select Audio'}
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Track title"
                      value={newTrackTitle}
                      onChange={(e) => setNewTrackTitle(e.target.value)}
                      className="flex-1 bg-crwn-surface border border-crwn-elevated rounded-lg px-3 py-2 text-crwn-text text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleUploadTrackInForm}
                      disabled={!newTrackFile || !newTrackTitle || isUploadingTrack}
                      className="px-4 py-2 bg-crwn-gold text-crwn-bg rounded-lg text-sm font-medium hover:bg-crwn-gold-hover disabled:opacity-50 hover-glow"
                    >
                      {isUploadingTrack ? 'Uploading...' : 'Upload'}
                    </button>
                  </div>
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
                          <Plus className="w-4 h-4 text-crwn-gold" />
                          <span className="flex-1 text-crwn-text truncate">{track.title}</span>
                          <span className="text-crwn-text-secondary text-sm">{formatDuration(track.duration)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 neu-button-accent text-crwn-bg hover-glow"
              >
                {editingAlbum ? 'Update Album' : 'Create Album'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Albums Grid */}
      {albums.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {albums.map((album) => (
            <div key={album.id} className="neu-raised neu-card-hover overflow-hidden group">
              <div className="aspect-square relative bg-crwn-elevated">
                {album.album_art_url ? (
                  <Image src={album.album_art_url} alt={album.title} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🎵</div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => handleEdit(album)} className="p-2 bg-crwn-gold rounded-full">
                    <Edit2 className="w-4 h-4 text-crwn-bg" />
                  </button>
                  <button onClick={() => handleDelete(album.id)} className="p-2 bg-crwn-error rounded-full">
                    <Trash2 className="w-4 h-4 text-white" />
                  </button>
                </div>
                {!album.is_active && (
                  <div className="absolute top-2 right-2 px-2 py-1 bg-crwn-elevated text-crwn-text-secondary text-xs rounded">
                    Draft
                  </div>
                )}
              </div>
              <div className="p-3">
                <h3 className="font-medium text-crwn-text truncate">{album.title}</h3>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm text-crwn-text-secondary">
                    {album.track_count || 0} tracks
                  </p>
                  <button
                    onClick={() => handleTogglePublish(album)}
                    className={`p-1.5 rounded ${album.is_active ? 'text-green-400' : 'text-crwn-text-secondary hover:text-crwn-text'}`}
                  >
                    {album.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
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
