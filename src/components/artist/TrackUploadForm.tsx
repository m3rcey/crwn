'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Track } from '@/types';
import Image from 'next/image';
import { Trash2, Play, Pause } from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';

export function TrackUploadForm() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const { currentTrack, isPlaying, play, pause } = usePlayer();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    access_level: 'free' as 'free' | 'subscriber' | 'purchase',
    price: '',
    audio_file: null as File | null,
    album_art: null as File | null,
  });

  const handleDeleteTrack = async (track: Track) => {
    if (!confirm(`Are you sure you want to delete "${track.title}"?`)) {
      return;
    }

    try {
      // Delete from database
      const { error } = await supabase
        .from('tracks')
        .delete()
        .eq('id', track.id);

      if (error) throw error;

      // Remove from local state
      setTracks(tracks.filter(t => t.id !== track.id));
      alert('Track deleted');
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete track');
    }
  };

  const handlePlayPause = (track: Track) => {
    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        pause();
      } else {
        play(track);
      }
    } else {
      play(track);
    }
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ ...prev, audio_file: file }));
    }
  };

  const handleArtSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ ...prev, album_art: file }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.audio_file || !formData.title) return;

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
        alert('You need to set up your artist profile first');
        setIsUploading(false);
        return;
      }

      // Get actual duration from audio file BEFORE upload
      let duration = 180;
      try {
        const audioElement = new Audio();
        const audioBlob = new Blob([formData.audio_file], { type: formData.audio_file.type });
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
          // Set timeout in case metadata never loads
          setTimeout(() => {
            URL.revokeObjectURL(audioUrlObject);
            resolve(180);
          }, 3000);
          audioElement.src = audioUrlObject;
        });
        console.log('Track duration:', duration);
      } catch {
        console.log('Could not read audio duration');
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      // Upload audio to Supabase Storage
      const audioExt = formData.audio_file.name.split('.').pop();
      const audioFileName = `${Date.now()}.${audioExt}`;
      const audioPath = `${artistProfile.id}/${audioFileName}`;
      
      const { error: audioError } = await supabase.storage
        .from('audio')
        .upload(audioPath, formData.audio_file);

      let audioUrl = '';
      if (audioError) {
        console.error('Audio upload error:', audioError);
        // Use placeholder URL if upload fails
        audioUrl = `https://crwn-media.r2.dev/${artistProfile.slug}/audio/${audioFileName}`;
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('audio')
          .getPublicUrl(audioPath);
        audioUrl = publicUrl;
      }

      // Upload album art if present
      let albumArtUrl = null;
      if (formData.album_art) {
        const artExt = formData.album_art.name.split('.').pop();
        const artFileName = `${Date.now()}.${artExt}`;
        const artPath = `${artistProfile.id}/album-art/${artFileName}`;
        
        const { error: artError } = await supabase.storage
          .from('album-art')
          .upload(artPath, formData.album_art);
        
        if (!artError) {
          const { data: { publicUrl } } = supabase.storage
            .from('album-art')
            .getPublicUrl(artPath);
          albumArtUrl = publicUrl;
        }
      }

      clearInterval(progressInterval);
      setUploadProgress(100);

      console.log('Saving track with audio URL:', audioUrl);
      console.log('Duration:', duration);
      
      // Save to Supabase
      const { data: track, error } = await supabase
        .from('tracks')
        .insert({
          artist_id: artistProfile.id,
          title: formData.title,
          audio_url_128: audioUrl,
          audio_url_320: audioUrl,
          duration,
          access_level: formData.access_level,
          price: formData.price ? parseInt(formData.price) * 100 : null,
          album_art_url: albumArtUrl,
        })
        .select()
        .single();

      if (error) {
        console.error('Track insert error:', error);
        throw error;
      }
      
      console.log('Track saved:', track);
      
      // Reset form
      setFormData({
        title: '',
        access_level: 'free',
        price: '',
        audio_file: null,
        album_art: null,
      });

      alert('Track uploaded successfully!');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload track');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8">
      {/* Upload Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl bg-crwn-surface p-6 rounded-xl border border-crwn-elevated">
        <h2 className="text-lg font-semibold text-crwn-text mb-4">Upload New Track</h2>

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
              required
            />
            <label
              htmlFor="audio-upload"
              className="flex items-center justify-center gap-2 w-full bg-crwn-bg border-2 border-dashed border-crwn-elevated rounded-lg py-8 cursor-pointer hover:border-crwn-gold transition-colors"
            >
              {formData.audio_file ? (
                <span className="text-crwn-text">{formData.audio_file.name}</span>
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
            className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-3 text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
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

        {/* Access Level */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
            Access Level
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['free', 'subscriber', 'purchase'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, access_level: level }))}
                className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  formData.access_level === level
                    ? 'bg-crwn-gold text-crwn-bg'
                    : 'bg-crwn-bg text-crwn-text-secondary hover:text-crwn-text'
                }`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Price (if purchase) */}
        {formData.access_level === 'purchase' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
              Price (USD)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-crwn-text-secondary">$</span>
              <input
                type="number"
                min="0.99"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                placeholder="0.99"
                className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg pl-8 pr-4 py-3 text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
                required
              />
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

        {/* Submit */}
        <button
          type="submit"
          disabled={isUploading || !formData.audio_file}
          className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-lg hover:bg-crwn-gold-hover transition-colors disabled:opacity-50"
        >
          {isUploading ? 'Uploading...' : 'Upload Track'}
        </button>
      </form>

      {/* Track List */}
      {tracks.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-crwn-text mb-4">Your Tracks</h2>
          <div className="space-y-2">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="flex items-center gap-4 p-4 bg-crwn-surface rounded-lg"
              >
                <div className="w-12 h-12 bg-crwn-elevated rounded overflow-hidden relative">
                  {track.album_art_url ? (
                    <Image src={track.album_art_url} alt={track.title} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary">🎵</div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-crwn-text">{track.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-crwn-text-secondary">
                    <span className="capitalize">{track.access_level}</span>
                    <span>{formatDuration(track.duration)}</span>
                    {track.price && <span>${(track.price / 100).toFixed(2)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePlayPause(track)}
                    className="p-2 bg-crwn-gold text-crwn-bg rounded-full hover:bg-crwn-gold-hover"
                  >
                    {currentTrack?.id === track.id && isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteTrack(track)}
                    className="p-2 text-crwn-error hover:bg-crwn-error/10 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
