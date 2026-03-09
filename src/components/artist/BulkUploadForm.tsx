'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, X, Check, AlertCircle, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
}

interface UploadItem {
  id: string;
  file: File;
  title: string;
  albumArtFile: File | null;
  albumArtPreview: string | null;
  isFree: boolean;
  allowedTierIds: string[];
  price: string;
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
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  // Default settings for new tracks
  const [defaultIsFree, setDefaultIsFree] = useState(true);
  const [defaultAllowedTierIds, setDefaultAllowedTierIds] = useState<string[]>([]);
  const [defaultPrice, setDefaultPrice] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const artInputRef = useRef<HTMLInputElement>(null);

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

    const oversizedFiles = files.filter(f => f.size > 50 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      showToast(`${oversizedFiles.length} file(s) exceed 50MB limit`, 'error');
    }

    const queueItems: UploadItem[] = files
      .filter(f => f.size <= 50 * 1024 * 1024)
      .map((file, idx) => ({
        id: `${Date.now()}-${idx}-${file.name}`,
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        albumArtFile: null,
        albumArtPreview: null,
        isFree: defaultIsFree,
        allowedTierIds: [...defaultAllowedTierIds],
        price: defaultPrice,
        status: 'pending' as const,
        progress: 0,
      }));

    setQueue(prev => [...prev, ...queueItems]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const applyToAll = () => {
    setQueue(prev => prev.map(item => ({
      ...item,
      isFree: defaultIsFree,
      allowedTierIds: [...defaultAllowedTierIds],
      price: defaultPrice,
    })));
    showToast('Settings applied to all tracks', 'success');
  };

  const updateItem = (id: string, updates: Partial<UploadItem>) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const handleAlbumArtSelect = (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const preview = URL.createObjectURL(file);
    updateItem(itemId, { albumArtFile: file, albumArtPreview: preview });
  };

  const removeFromQueue = (id: string) => {
    const item = queue.find(q => q.id === id);
    if (item?.albumArtPreview) {
      URL.revokeObjectURL(item.albumArtPreview);
    }
    setQueue(prev => prev.filter(item => item.id !== id));
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
        resolve(180);
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

    const { data: artistProfile } = await supabase
      .from('artist_profiles')
      .select('slug')
      .eq('id', artistProfileId)
      .maybeSingle();

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status !== 'pending') continue;

      setCurrentIndex(i);

      setQueue(prev => prev.map(q => 
        q.id === item.id ? { ...q, status: 'uploading', progress: 10 } : q
      ));

      try {
        // 1. Upload audio file
        const audioExt = item.file.name.split('.').pop();
        const audioFileName = `${Date.now()}-${i}.${audioExt}`;
        const audioPath = `${artistProfileId}/${audioFileName}`;
        
        setQueue(prev => prev.map(q => 
          q.id === item.id ? { ...q, progress: 20 } : q
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
          q.id === item.id ? { ...q, progress: 40 } : q
        ));

        // 2. Upload album art if provided
        let albumArtUrl: string | null = null;
        if (item.albumArtFile) {
          const artExt = item.albumArtFile.name.split('.').pop();
          const artFileName = `${Date.now()}-${i}.${artExt}`;
          const artPath = `${artistProfileId}/album-art/${artFileName}`;
          
          const { error: artError } = await supabase.storage
            .from('album-art')
            .upload(artPath, item.albumArtFile);
          
          if (!artError) {
            const { data: { publicUrl } } = supabase.storage
              .from('album-art')
              .getPublicUrl(artPath);
            albumArtUrl = publicUrl;
          }
        }

        setQueue(prev => prev.map(q => 
          q.id === item.id ? { ...q, progress: 60 } : q
        ));

        // 3. Get duration
        const duration = await getAudioDuration(item.file);

        setQueue(prev => prev.map(q => 
          q.id === item.id ? { ...q, progress: 75 } : q
        ));

        // 4. Calculate price in cents
        const priceInCents = item.isFree ? null : (item.price ? Math.round(parseFloat(item.price) * 100) : null);

        // 5. Insert track metadata
        const { error: insertError } = await supabase
          .from('tracks')
          .insert({
            artist_id: artistProfileId,
            title: item.title,
            audio_url_128: audioUrl,
            audio_url_320: audioUrl,
            duration,
            is_free: item.isFree,
            allowed_tier_ids: item.isFree ? [] : item.allowedTierIds,
            price: priceInCents,
            album_art_url: albumArtUrl,
            position: position++,
          });

        if (insertError) throw insertError;

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

    // Revoke object URLs
    queue.forEach(item => {
      if (item.albumArtPreview) {
        URL.revokeObjectURL(item.albumArtPreview);
      }
    });

    if (failCount === 0) {
      showToast(`${successCount} track(s) uploaded successfully!`, 'success');
    } else {
      showToast(`${successCount} of ${pendingItems.length} tracks uploaded. ${failCount} failed.`, failCount > 0 ? 'error' : 'success');
    }

    onComplete();
  };

  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const completedCount = queue.filter(q => q.status === 'complete').length;

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

      {/* Default Settings */}
      <div className="bg-crwn-bg border border-crwn-elevated rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-crwn-text">Default Settings</h3>
          {queue.length > 0 && (
            <button
              onClick={applyToAll}
              className="text-xs text-crwn-gold hover:text-crwn-gold-hover"
            >
              Apply to all tracks
            </button>
          )}
        </div>
        
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={defaultIsFree}
              onChange={(e) => setDefaultIsFree(e.target.checked)}
              className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
            />
            <span className="text-crwn-text text-sm">Free to all</span>
          </label>
          
          {!defaultIsFree && tiers.length > 0 && tiers.map(tier => (
            <label key={tier.id} className="flex items-center gap-2 cursor-pointer ml-6">
              <input
                type="checkbox"
                checked={defaultAllowedTierIds.includes(tier.id)}
                onChange={(e) => {
                  const ids = e.target.checked
                    ? [...defaultAllowedTierIds, tier.id]
                    : defaultAllowedTierIds.filter(id => id !== tier.id);
                  setDefaultAllowedTierIds(ids);
                }}
                className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
              />
              <span className="text-crwn-text text-sm">{tier.name} (${(tier.price / 100).toFixed(0)}/mo)</span>
            </label>
          ))}
          
          {!defaultIsFree && (
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
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(e.target.value)}
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
                onClick={() => {
                  queue.forEach(item => {
                    if (item.albumArtPreview) URL.revokeObjectURL(item.albumArtPreview);
                  });
                  setQueue([]);
                }}
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
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {queue.map((item) => (
              <div
                key={item.id}
                className={`neu-raised rounded-lg overflow-hidden ${
                  item.status === 'error' ? 'border border-red-400/30' : ''
                } ${item.status === 'complete' ? 'opacity-60' : ''}`}
              >
                {/* Collapsed View */}
                <div className="flex items-center gap-3 p-3">
                  {/* Cover Art Thumbnail */}
                  <div 
                    className="w-10 h-10 rounded bg-crwn-elevated flex-shrink-0 overflow-hidden relative cursor-pointer"
                    onClick={() => toggleExpanded(item.id)}
                  >
                    {item.albumArtPreview ? (
                      <img src={item.albumArtPreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={16} className="text-crwn-text-secondary" />
                      </div>
                    )}
                  </div>

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

                  {/* Title & Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-crwn-text text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-crwn-text-secondary">
                      {formatFileSize(item.file.size)}
                      {!item.isFree && item.allowedTierIds.length > 0 && ' • Tier locked'}
                      {item.price && !item.isFree && ' • Paid'}
                    </p>
                  </div>

                  {/* Expand Button */}
                  {item.status === 'pending' && (
                    <button
                      onClick={() => toggleExpanded(item.id)}
                      className="p-1 text-crwn-text-secondary hover:text-crwn-text"
                    >
                      {expandedItems.has(item.id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  )}

                  {/* Progress Bar */}
                  {item.status === 'uploading' && (
                    <div className="w-16">
                      <div className="w-full bg-crwn-bg rounded-full h-1.5">
                        <div
                          className="bg-gradient-to-r from-[#9a7b2a] to-crwn-gold h-1.5 rounded-full transition-all"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Expanded View - Per-Track Settings */}
                {expandedItems.has(item.id) && item.status === 'pending' && (
                  <div className="p-3 border-t border-crwn-elevated space-y-3 bg-crwn-bg/50">
                    {/* Cover Art */}
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept="image/*"
                        ref={artInputRef}
                        className="hidden"
                        id={`art-${item.id}`}
                        onChange={(e) => handleAlbumArtSelect(item.id, e)}
                      />
                      <label
                        htmlFor={`art-${item.id}`}
                        className="w-12 h-12 rounded bg-crwn-elevated flex-shrink-0 overflow-hidden cursor-pointer flex items-center justify-center"
                      >
                        {item.albumArtPreview ? (
                          <img src={item.albumArtPreview} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon size={20} className="text-crwn-text-secondary" />
                        )}
                      </label>
                      <div className="flex-1">
                        <p className="text-xs text-crwn-text-secondary">Cover art (optional)</p>
                        {item.albumArtFile && (
                          <button
                            onClick={() => {
                              URL.revokeObjectURL(item.albumArtPreview!);
                              updateItem(item.id, { albumArtFile: null, albumArtPreview: null });
                            }}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <div>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateItem(item.id, { title: e.target.value })}
                        disabled={item.status !== 'pending' || isUploading}
                        className="w-full bg-crwn-bg border border-crwn-elevated rounded px-3 py-2 text-crwn-text text-sm"
                        placeholder="Track title"
                      />
                    </div>

                    {/* Access Settings */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.isFree}
                          onChange={(e) => updateItem(item.id, { 
                            isFree: e.target.checked,
                            allowedTierIds: e.target.checked ? [] : item.allowedTierIds,
                            price: e.target.checked ? '' : item.price,
                          })}
                          className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                        />
                        <span className="text-crwn-text text-sm">Free to all</span>
                      </label>
                      
                      {!item.isFree && tiers.length > 0 && tiers.map(tier => (
                        <label key={tier.id} className="flex items-center gap-2 cursor-pointer ml-6">
                          <input
                            type="checkbox"
                            checked={item.allowedTierIds.includes(tier.id)}
                            onChange={(e) => {
                              const ids = e.target.checked
                                ? [...item.allowedTierIds, tier.id]
                                : item.allowedTierIds.filter(id => id !== tier.id);
                              updateItem(item.id, { allowedTierIds: ids });
                            }}
                            className="w-4 h-4 rounded border-crwn-elevated bg-crwn-bg text-crwn-gold focus:ring-crwn-gold"
                          />
                          <span className="text-crwn-text text-sm">{tier.name} (${(tier.price / 100).toFixed(0)}/mo)</span>
                        </label>
                      ))}
                      
                      {!item.isFree && (
                        <div className="ml-6">
                          <label className="block text-xs font-medium text-crwn-text-secondary mb-1">
                            Or set a one-time price (USD)
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-crwn-text">$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.price}
                              onChange={(e) => updateItem(item.id, { price: e.target.value })}
                              placeholder="Leave empty for tier access only"
                              className="w-full neu-inset px-3 py-2 text-crwn-text text-sm"
                            />
                          </div>
                        </div>
                      )}
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
