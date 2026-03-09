'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Track } from '@/types';
import { usePlatformLimits } from '@/hooks/usePlatformLimits';
import { Loader2, X, Check, AlertCircle } from 'lucide-react';

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
}

interface FileQueueItem {
  id: string;
  file: File;
  title: string;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
  progress: number;
}

interface BulkUploadFormProps {
  artistProfileId: string;
  onComplete: () => void;
}

export function BulkUploadForm({ artistProfileId, onComplete }: BulkUploadFormProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [queue, setQueue] = useState<FileQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Shared access settings for all tracks
  const [isFree, setIsFree] = useState(true);
  const [allowedTierIds, setAllowedTierIds] = useState<string[]>([]);
  const [price, setPrice] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch tiers
  useEffect(() => {
    async function fetchTiers() {
      if (!artistProfileId) return;
      
      const { data: tiersData } = await supabase
        .from('subscription_tiers')
        .select('id, name, price')
        .eq('artist_id', artistProfileId)
        .eq('is_active', true)
        .order('price', { ascending: true });
      
      if (tiersData) setTiers(tiersData);
    }
    fetchTiers();
  }, [artistProfileId, supabase]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;

    // Check for files > 50MB
    const oversizedFiles = files.filter(f => f.size > 50 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      showToast(`${oversizedFiles.length} file(s) exceed 50MB limit`, 'error');
    }

    const queueItems: FileQueueItem[] = files
      .filter(f => f.size <= 50 * 1024 * 1024)
      .map((file, idx) => ({
        id: `${Date.now()}-${idx}-${file.name}`,
        file,
        title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        status: 'pending' as const,
        progress: 0,
      }));

    setQueue(prev => [...prev, ...queueItems]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const updateTitle = (id: string, title: string) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, title } : item
    ));
  };

  const getMaxPosition = async () => {
    const { data } = await supabase
      .from('tracks')
      .select('position')
      .eq('artist_id', artistProfileId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    return (data?.position ?? 0) + 1;
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      const blob = new Blob([file], { type: file.type });
      const url = URL.createObjectURL(blob);
      
      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(url);
        resolve(Math.round(audio.duration));
      });
      
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        resolve(180); // Default duration
      });
      
      setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(180);
      }, 3000);
      
      audio.src = url;
    });
  };

  const handleUpload = async () => {
    if (queue.length === 0 || !user) return;

    const pendingItems = queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) return;

    setIsUploading(true);
    let position = await getMaxPosition();
    let successCount = 0;
    let failCount = 0;

    // Get artist profile for slug
    const { data: artistProfile } = await supabase
      .from('artist_profiles')
      .select('slug')
      .eq('id', artistProfileId)
      .maybeSingle();

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status !== 'pending') continue;

      // Update current index for UI
      setCurrentIndex(i);

      // Mark as uploading
      setQueue(prev => prev.map(q => 
        q.id === item.id ? { ...q, status: 'uploading', progress: 10 } : q
      ));

      try {
        // 1. Upload audio file
        const audioExt = item.file.name.split('.').pop();
        const audioFileName = `${Date.now()}-${i}.${audioExt}`;
        const audioPath = `${artistProfileId}/${audioFileName}`;
        
        setQueue(prev => prev.map(q => 
          q.id === item.id ? { ...q, progress: 30 } : q
        ));

        const { error: uploadError } = await supabase.storage
          .from('audio')
          .upload(audioPath, item.file);

        let audioUrl = '';
        if (uploadError) {
          console.error('Audio upload error:', uploadError);
          audioUrl = `https://crwn-media.r2.dev/${artistProfile?.slug || artistProfileId}/audio/${audioFileName}`;
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('audio')
            .getPublicUrl(audioPath);
          audioUrl = publicUrl;
        }

        setQueue(prev => prev.map(q => 
          q.id === item.id ? { ...q, progress: 60 } : q
        ));

        // 2. Get duration
        const duration = await getAudioDuration(item.file);

        setQueue(prev => prev.map(q => 
          q.id === item.id ? { ...q, progress: 80 } : q
        ));

        // 3. Calculate price in cents
        const priceInCents = isFree ? null : (price ? Math.round(parseFloat(price) * 100) : null);

        // 4. Insert track metadata
        const { error: insertError } = await supabase
          .from('tracks')
          .insert({
            artist_id: artistProfileId,
            title: item.title,
            audio_url_128: audioUrl,
            audio_url_320: audioUrl,
            duration,
            is_free: isFree,
            allowed_tier_ids: isFree ? [] : allowedTierIds,
            price: priceInCents,
            position: position++,
          });

        if (insertError) throw insertError;

        // Mark complete
        setQueue(prev => prev.map(q => 
          q.id === item.id ? { ...q, status: 'complete', progress: 100 } : q
        ));
        successCount++;

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        setQueue(prev => prev.map(q => 
          q.id === item.id ? { ...q, status: 'error', error: errorMessage } : q
        ));
        failCount++;
      }
    }

    setIsUploading(false);

    // Show summary toast
    if (failCount === 0) {
      showToast(`${successCount} track(s) uploaded successfully!`, 'success');
    } else {
      showToast(`${successCount} of ${pendingItems.length} tracks uploaded. ${failCount} failed.`, failCount > 0 ? 'error' : 'success');
    }

    // Refresh track list
    onComplete();
  };

  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const completedCount = queue.filter(q => q.status === 'complete').length;
  const uploadingCount = queue.filter(q => q.status === 'uploading').length;

  return (
    <div className="space-y-6">
      {/* File Selection */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id="bulk-audio-upload"
        />
        <label
          htmlFor="bulk-audio-upload"
          className="flex items-center justify-center gap-2 w-full bg-crwn-bg border-2 border-dashed border-crwn-elevated rounded-lg py-6 cursor-pointer hover:border-crwn-gold transition-colors"
        >
          <span className="text-2xl">🎵</span>
          <span className="text-crwn-text-secondary">Click to select multiple audio files</span>
        </label>
        <p className="text-xs text-crwn-text-secondary mt-2">
          Max 50MB per file. MP3, WAV, FLAC supported.
        </p>
      </div>

      {/* Shared Access Settings */}
      <div className="bg-crwn-bg border border-crwn-elevated rounded-lg p-4">
        <h3 className="text-sm font-medium text-crwn-text mb-3">Access Settings (applies to all tracks)</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isFree}
              onChange={(e) => setIsFree(e.target.checked)}
              className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
            />
            <span className="text-crwn-text text-sm">Free to all</span>
          </label>
          
          {!isFree && tiers.length > 0 && tiers.map(tier => (
            <label key={tier.id} className="flex items-center gap-2 cursor-pointer ml-6">
              <input
                type="checkbox"
                checked={allowedTierIds.includes(tier.id)}
                onChange={(e) => {
                  const ids = e.target.checked
                    ? [...allowedTierIds, tier.id]
                    : allowedTierIds.filter(id => id !== tier.id);
                  setAllowedTierIds(ids);
                }}
                className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
              />
              <span className="text-crwn-text text-sm">{tier.name} (${(tier.price / 100).toFixed(0)}/mo)</span>
            </label>
          ))}
          
          {!isFree && (
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
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Leave empty for tier access only"
                  className="w-full neu-inset px-3 py-2 text-crwn-text"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-crwn-text">
              {queue.length} track(s) selected
              {completedCount > 0 && <span className="text-crwn-success ml-2">({completedCount} complete)</span>}
            </h3>
            {!isUploading && (
              <button
                onClick={() => setQueue([])}
                className="text-xs text-crwn-text-secondary hover:text-red-400"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Overall Progress */}
          {isUploading && (
            <div className="text-center py-2">
              <p className="text-sm text-crwn-text mb-2">
                Uploading {currentIndex + 1} of {queue.length}...
              </p>
              <div className="w-full bg-crwn-bg rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-[#9a7b2a] to-crwn-gold h-2 rounded-full transition-all"
                  style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Queue Items */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {queue.map((item) => (
              <div
                key={item.id}
                className={`neu-raised p-3 rounded-lg flex items-center gap-3 ${
                  item.status === 'error' ? 'border border-red-400/30' : ''
                } ${item.status === 'complete' ? 'opacity-60' : ''}`}
              >
                {/* Status Icon */}
                {item.status === 'pending' && !isUploading && (
                  <button
                    onClick={() => removeFromQueue(item.id)}
                    className="text-crwn-text-secondary hover:text-red-400"
                    title="Remove"
                  >
                    <X size={16} />
                  </button>
                )}
                {item.status === 'uploading' && (
                  <Loader2 size={16} className="text-crwn-gold animate-spin" />
                )}
                {item.status === 'complete' && (
                  <Check size={16} className="text-crwn-success" />
                )}
                {item.status === 'error' && (
                  <span title={item.error}>
                    <AlertCircle size={16} className="text-red-400" />
                  </span>
                )}

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateTitle(item.id, e.target.value)}
                    disabled={item.status !== 'pending' || isUploading}
                    className="w-full bg-transparent text-crwn-text text-sm font-medium focus:outline-none border-b border-transparent focus:border-crwn-gold disabled:opacity-60"
                    placeholder="Track title"
                  />
                  <p className="text-xs text-crwn-text-secondary">
                    {formatFileSize(item.file.size)}
                    {item.status === 'error' && <span className="text-red-400 ml-2">{item.error}</span>}
                  </p>
                </div>

                {/* Progress Bar (uploading only) */}
                {item.status === 'uploading' && (
                  <div className="w-20">
                    <div className="w-full bg-crwn-bg rounded-full h-1.5">
                      <div
                        className="bg-gradient-to-r from-[#9a7b2a] to-crwn-gold h-1.5 rounded-full transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Upload Button */}
          {pendingCount > 0 && !isUploading && (
            <button
              onClick={handleUpload}
              className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-lg hover:bg-crwn-gold-hover transition-colors"
            >
              Upload {pendingCount} Track{pendingCount !== 1 ? 's' : ''}
            </button>
          )}

          {isUploading && (
            <button
              disabled
              className="w-full bg-crwn-gold/50 text-crwn-bg font-semibold py-3 rounded-lg cursor-not-allowed"
            >
              Uploading...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
