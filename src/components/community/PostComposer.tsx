'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import Image from 'next/image';
import { Loader2, X, Image as ImageIcon, Video, Lock } from 'lucide-react';

interface PostComposerProps {
  artistId: string;
  isArtist: boolean;
  tiers: TierConfig[];
  onPostCreated?: () => void;
}

export function PostComposer({ artistId, isArtist, tiers, onPostCreated }: PostComposerProps) {
  const { user, profile } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const { tierId } = useSubscription(artistId);
  
  const [content, setContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isFree, setIsFree] = useState(true);
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const files = e.target.files;
    if (!files) return;

    const currentCount = mediaFiles.length;
    const maxCount = type === 'video' ? 1 : (4 - currentCount);
    const newFiles = Array.from(files).slice(0, maxCount);

    // Create previews
    newFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      setMediaPreviews(prev => [...prev, url]);
    });

    setMediaFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!user || !content.trim()) return;

    setIsUploading(true);
    setError(null);

    try {
      // Upload media files
      const uploadedUrls: string[] = [];
      const uploadedTypes: string[] = [];

      for (const file of mediaFiles) {
        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random()}.${ext}`;
        const path = `${artistId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('community-media')
          .upload(path, file);

        if (uploadError) {
          console.error('Media upload error:', uploadError);
          throw new Error('Failed to upload media');
        }

        const { data: { publicUrl } } = supabase.storage
          .from('community-media')
          .getPublicUrl(path);

        uploadedUrls.push(publicUrl);
        uploadedTypes.push(file.type.startsWith('video') ? 'video' : 'image');
      }

      // Create post
      const { error: insertError } = await supabase
        .from('community_posts')
        .insert({
          artist_id: artistId,
          author_id: user.id,
          content: content.trim(),
          media_urls: uploadedUrls,
          media_types: uploadedTypes,
          is_artist_post: isArtist,
          is_free: isFree,
          allowed_tier_ids: isFree ? [] : selectedTiers,
        });

      if (insertError) throw insertError;

      // Reset form
      setContent('');
      setMediaFiles([]);
      setMediaPreviews([]);
      setIsFree(true);
      setSelectedTiers([]);
      
      onPostCreated?.();

      // Email artist about new community post (only if fan posted, not artist)
      if (!isArtist) {
        try {
          await fetch('/api/emails/artist-new-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artistId,
              authorName: profile?.display_name || 'A fan',
              postPreview: content.trim().substring(0, 150),
            }),
          });
        } catch (e) {
          // Non-critical, don't block UI
        }
      }
    } catch (err) {
      console.error('Post creation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="neu-raised p-4">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full neu-inset flex items-center justify-center flex-shrink-0 overflow-hidden">
          {profile?.avatar_url ? (
            <Image src={profile.avatar_url} alt="" width={40} height={40} className="object-cover" />
          ) : (
            <span className="text-crwn-text-secondary font-semibold">
              {(profile?.display_name || user?.email?.charAt(0) || 'U').toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1">
          {/* Text input */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={isArtist ? "Share something with your fans..." : "Write something to this artist..."}
            className="neu-inset w-full px-4 py-3 text-crwn-text placeholder-crwn-text-secondary resize-none focus:outline-none"
            rows={3}
            maxLength={2000}
          />
          <p className="text-xs text-crwn-text-dim text-right mt-1">{content.length}/2000</p>

          {/* Media previews */}
          {mediaPreviews.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {mediaPreviews.map((url, index) => (
                <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden">
                  {mediaFiles[index]?.type.startsWith('video') ? (
                    <video src={url} className="w-full h-full object-cover" />
                  ) : (
                    <Image src={url} alt="" width={80} height={80} className="object-cover" />
                  )}
                  <button
                    onClick={() => removeMedia(index)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Artist tier gating */}
          {isArtist && (
            <div className="mt-3 p-3 neu-inset">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-crwn-text-secondary" />
                <span className="text-sm text-crwn-text-secondary">Post visibility</span>
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={isFree}
                  onChange={(e) => setIsFree(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-crwn-text text-sm">All fans can see</span>
              </label>

              {!isFree && tiers.length > 0 && (
                <div className="space-y-1 ml-6">
                  {tiers.map(tier => (
                    <label key={tier.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTiers.includes(tier.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTiers([...selectedTiers, tier.id]);
                          } else {
                            setSelectedTiers(selectedTiers.filter(id => id !== tier.id));
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-crwn-text text-sm">{tier.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-2">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleMediaSelect(e, 'image')}
                className="hidden"
                ref={fileInputRef}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={mediaFiles.length >= 4}
                className="neu-icon-button p-2 disabled:opacity-50"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              
              <input
                type="file"
                accept="video/*"
                onChange={(e) => handleMediaSelect(e, 'video')}
                className="hidden"
                ref={videoInputRef}
              />
              <button
                onClick={() => videoInputRef.current?.click()}
                disabled={mediaFiles.some(f => f.type.startsWith('video'))}
                className="neu-icon-button p-2 disabled:opacity-50"
              >
                <Video className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!content.trim() || isUploading}
              className="neu-button-accent px-4 py-2 text-sm disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Post'
              )}
            </button>
          </div>

          {error && (
            <p className="text-sm text-crwn-error mt-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
