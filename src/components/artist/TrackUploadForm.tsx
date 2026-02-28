'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Track } from '@/types';

export function TrackUploadForm() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
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
        .single();

      if (!artistProfile) {
        alert('You need to set up your artist profile first');
        setIsUploading(false);
        return;
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      // In production: Upload to R2
      // const audioUrl = await uploadToR2(formData.audio_file, ...);
      // For now, create placeholder URLs
      const timestamp = Date.now();
      const audioUrl = `https://crwn-media.r2.dev/${artistProfile.slug}/audio/${timestamp}-${formData.audio_file.name}`;

      // Get duration (in production, use audio metadata)
      const duration = 180; // placeholder

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Save to Supabase
      const { data: track, error } = await supabase
        .from('tracks')
        .insert({
          artist_id: artistProfile.id,
          title: formData.title,
          audio_url_128: audioUrl, // In production: transcoded URL
          audio_url_320: audioUrl,
          duration,
          access_level: formData.access_level,
          price: formData.price ? parseInt(formData.price) * 100 : null,
          album_art_url: formData.album_art ? URL.createObjectURL(formData.album_art) : null,
        })
        .select()
        .single();

      if (error) throw error;

      setTracks(prev => [track as Track, ...prev]);
      
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
                <div className="w-12 h-12 bg-crwn-elevated rounded overflow-hidden">
                  {track.album_art_url ? (
                    <img src={track.album_art_url} alt={track.title} className="w-full h-full object-cover" />
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
