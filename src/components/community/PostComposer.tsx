'use client';
import { validateUpload } from '@/lib/uploadValidation';

import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import Image from 'next/image';
import { Loader2, X, Image as ImageIcon, Video, Lock } from 'lucide-react';
import { TierAccessSelect } from '@/components/shared/TierAccessSelect';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { readBenefitPointer } from '@/lib/benefitRegistry';
import { expandFromTier } from '@/lib/tierLadder';
import type { RoomChannel } from '@/lib/community/rooms';

interface PostComposerProps {
  artistId: string;
  isArtist: boolean;
  tiers: TierConfig[];
  /** The artist's tier rooms. Empty until the tier-rooms migration is applied. */
  rooms?: RoomChannel[];
  /** The room the feed is showing, so a post lands where the artist is looking. */
  defaultRoomId?: string | null;
  onPostCreated?: () => void;
}

/**
 * The public teaser for a gated photo: a copy at most 32px on its longest side. At that size
 * there is no detail left to recover, which is the point. The card blurs it again for looks.
 */
async function blurredPreview(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = 32 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PostComposer({ artistId, isArtist, tiers, rooms = [], defaultRoomId = null, onPostCreated }: PostComposerProps) {
  const { user, profile } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const { tierId } = useSubscription(artistId);

  const [content, setContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  // Fast action from the Promise to Delivery panel (?benefit=exclusive_posts&tier=<id>): the
  // post starts in that rung's room, or, before rooms exist, gated to "this rung and above".
  // The id is matched against the tiers and rooms this page loaded for the artist, and only
  // the artist sees the visibility control at all.
  const pointer = typeof window !== 'undefined' && isArtist ? readBenefitPointer(window.location.search) : null;
  const pointerRung = pointer?.benefit === 'exclusive_posts' && tiers.some((t) => t.id === pointer.tierId) ? expandFromTier(tiers, pointer.tierId) : [];
  const pointerRoom = pointerRung.length ? rooms.find((r) => r.tier_id === pointer?.tierId)?.id ?? null : null;
  const [isFree, setIsFree] = useState(pointerRung.length === 0);
  const [selectedTiers, setSelectedTiers] = useState<string[]>(pointerRung);
  // '' is a public post (the wall, unchanged). A room id files the post in that room.
  const [roomChoice, setRoomChoice] = useState<string | null>(null);
  const roomId = isArtist ? (roomChoice ?? pointerRoom ?? defaultRoomId ?? '') : '';
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const [error, setError] = useState<string | null>(null);
  
  // Feature 1: Upload Progress
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number>(-1);

  // Feature 2: Video Thumbnail Filmstrip
  const [videoFrames, setVideoFrames] = useState<string[]>([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number>(0);
  const [videoThumbnail, setVideoThumbnail] = useState<Blob | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Extract frames from video for filmstrip
  const extractFrames = async (videoUrl: string, numFrames: number = 10) => {
    setIsExtractingFrames(true);
    
    return new Promise<void>((resolve) => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;
      
      video.preload = 'auto';
      video.addEventListener('loadeddata', async () => {
        const duration = video.duration;
        const canvas = document.createElement('canvas');
        // Use smaller dimensions for thumbnails (performance)
        const scale = Math.min(1, 200 / video.videoHeight);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setIsExtractingFrames(false); resolve(); return; }
        
        const frames: string[] = [];
        
        for (let i = 0; i < numFrames; i++) {
          const time = (duration / numFrames) * i;
          video.currentTime = time;
          
          await new Promise<void>((seekResolve) => {
            video.addEventListener('seeked', () => {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              frames.push(canvas.toDataURL('image/jpeg', 0.6));
              seekResolve();
            }, { once: true });
          });
        }
        
        setVideoFrames(frames);
        // Auto-select first frame as default thumbnail
        if (frames.length > 0) {
          setSelectedFrameIndex(0);
          setThumbnailPreview(frames[0]);
          // Create blob for upload
          canvas.toBlob((blob) => {
            if (blob) setVideoThumbnail(blob);
          }, 'image/jpeg', 0.8);
        }
        
        setIsExtractingFrames(false);
        resolve();
      });
      
      video.addEventListener('error', () => {
        console.error('Failed to load video for frame extraction');
        setIsExtractingFrames(false);
        resolve();
      });
    });
  };

  // Handle frame selection from filmstrip
  const selectFrame = (index: number) => {
    setSelectedFrameIndex(index);
    setThumbnailPreview(videoFrames[index]);
    
    // Create full-resolution thumbnail from the video at this timestamp
    const video = videoPreviewRef.current;
    if (!video) return;
    
    const duration = video.duration;
    const time = (duration / videoFrames.length) * index;
    video.currentTime = time;
    
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) setVideoThumbnail(blob);
      }, 'image/jpeg', 0.8);
    }, { once: true });
  };

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
      
      // Extract frames if it's a video
      if (file.type.startsWith('video')) {
        extractFrames(url);
      }
    });

    setMediaFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeMedia = (index: number) => {
    const isVideo = mediaFiles[index]?.type.startsWith('video');
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
    if (isVideo) {
      setVideoFrames([]);
      setSelectedFrameIndex(0);
      setVideoThumbnail(null);
      setThumbnailPreview(null);
    }
  };

  // Feature 1: Upload with XHR progress tracking
  const uploadFileWithProgress = async (file: File, path: string, index: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
      const url = `${supabaseUrl}/storage/v1/object/community-media/${path}`;
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(prev => {
            const next = [...prev];
            next[index] = percent;
            return next;
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const { data: { publicUrl } } = supabase.storage
            .from('community-media')
            .getPublicUrl(path);
          resolve(publicUrl);
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));

      xhr.open('POST', url);
      xhr.setRequestHeader('x-upsert', 'true');
      
      // Get access token for authorization
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        }
        xhr.send(file);
      });
    });
  };

  // A room post's media go to the PRIVATE bucket. The server names the key; the browser
  // PUTs the bytes straight to R2 with progress, and the post stores the key, never a link.
  const uploadPrivateWithProgress = async (file: File, index: number): Promise<string> => {
    const res = await fetch('/api/community/media-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId, filename: file.name, contentType: file.type }),
    });
    const data = await res.json();
    if (!res.ok || !data.uploadUrl || !data.key) throw new Error(data.error || 'Upload failed');
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress((prev) => { const next = [...prev]; next[index] = percent; return next; });
      });
      xhr.addEventListener('load', () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`))));
      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.open('PUT', data.uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
    return data.key as string;
  };

  // The public teaser for one gated photo, in the public bucket on purpose.
  const uploadPreview = async (file: File): Promise<string | null> => {
    const blob = await blurredPreview(file);
    if (!blob) return null;
    const path = `${artistId}/preview-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { error: previewError } = await supabase.storage
      .from('community-media')
      .upload(path, blob, { contentType: 'image/jpeg' });
    if (previewError) return null;
    return supabase.storage.from('community-media').getPublicUrl(path).data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!user || !content.trim()) return;

    setIsUploading(true);
    setError(null);

    try {
      // Upload media files with progress tracking
      const uploadedUrls: string[] = [];
      const uploadedTypes: string[] = [];
      const uploadedPreviews: (string | null)[] = [];

      // Initialize progress tracking
      setUploadProgress(new Array(mediaFiles.length).fill(0));

      for (let i = 0; i < mediaFiles.length; i++) {
        setCurrentUploadIndex(i);
        const file = mediaFiles[i];
        const cat = file.type.startsWith('video') ? 'video' as const : 'image' as const;
        const check = validateUpload(file, cat);
        if (!check.valid) {
          setError(check.error || 'Invalid file');
          continue;
        }
        if (room) {
          uploadedUrls.push(await uploadPrivateWithProgress(file, i));
          uploadedPreviews.push(cat === 'image' ? await uploadPreview(file) : null);
        } else {
          const ext = file.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random()}.${ext}`;
          const path = `${artistId}/${fileName}`;
          uploadedUrls.push(await uploadFileWithProgress(file, path, i));
        }
        uploadedTypes.push(cat);
      }

      // Feature 2: Upload thumbnail if exists
      let thumbnailUrl: string | null = null;
      if (videoThumbnail) {
        const thumbPath = `${artistId}/thumb-${Date.now()}.jpg`;
        const { error: thumbError } = await supabase.storage
          .from('community-media')
          .upload(thumbPath, videoThumbnail, { contentType: 'image/jpeg' });
        if (!thumbError) {
          const { data: { publicUrl } } = supabase.storage
            .from('community-media')
            .getPublicUrl(thumbPath);
          thumbnailUrl = publicUrl;
        }
      }

      setCurrentUploadIndex(-1);
      setUploadProgress([]);

      // Create post. A room post carries the room AND a locked copy of the room's list: if
      // the room is ever deleted, channel_id goes NULL and the post falls back to its own
      // fields, so it stays locked to the same people instead of going public.
      const { error: insertError } = await supabase
        .from('community_posts')
        .insert({
          artist_id: artistId,
          author_id: user.id,
          content: content.trim(),
          media_urls: uploadedUrls,
          media_types: uploadedTypes,
          thumbnail_url: thumbnailUrl,
          is_artist_post: isArtist,
          ...(room
            ? {
                channel_id: room.id,
                is_free: false,
                allowed_tier_ids: room.allowed_tier_ids || [],
                media_previews: uploadedPreviews,
              }
            : rooms.length > 0
              // Rooms exist and "Everyone" was picked: a public post, whatever the old
              // tier control last held (it is not on screen to see).
              ? { is_free: true, allowed_tier_ids: [] }
              : {
                  is_free: isFree,
                  allowed_tier_ids: isFree ? [] : selectedTiers,
                }),
        });

      if (insertError) throw insertError;

      // Reset form
      setContent('');
      setMediaFiles([]);
      setMediaPreviews([]);
      setIsFree(true);
      setSelectedTiers([]);
      
      // Feature 2: Reset thumbnail state
      setVideoFrames([]);
      setSelectedFrameIndex(0);
      setVideoThumbnail(null);
      setThumbnailPreview(null);
      setIsExtractingFrames(false);
      
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
      setUploadProgress([]);
      setCurrentUploadIndex(-1);
    } finally {
      setIsUploading(false);
    }
  };

  // Find video index for thumbnail filmstrip
  const videoIndex = mediaFiles.findIndex(f => f.type.startsWith('video'));

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
            placeholder={room ? `Share something with your ${room.name} members...` : isArtist ? "Share something with your fans..." : "Write something to this artist..."}
            className="neu-inset w-full px-4 py-3 text-crwn-text placeholder-crwn-text-secondary resize-none focus:outline-none"
            rows={3}
            maxLength={2000}
          />
          <p className="text-xs text-crwn-text-secondary text-right mt-1">{content.length}/2000</p>

          {/* Feature 1: Upload Progress Indicator */}
          {isUploading && uploadProgress.length > 0 && (
            <div className="px-4 py-3 space-y-2">
              {uploadProgress.map((progress, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-xs text-crwn-text-secondary">
                    <span>Uploading {mediaFiles[i]?.type.startsWith('video') ? 'video' : 'image'}{uploadProgress.length > 1 ? ` ${i + 1}/${uploadProgress.length}` : ''}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-crwn-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full bg-crwn-gold rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Media previews */}
          {mediaPreviews.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {mediaPreviews.map((url, index) => (
                <div key={index} className={`relative ${mediaFiles[index]?.type.startsWith('video') && index === videoIndex ? 'w-full' : 'w-20 h-20 rounded-lg overflow-hidden'}`}>
                  {/* Feature 2: Video Thumbnail Filmstrip */}
                  {mediaFiles[index]?.type.startsWith('video') && index === videoIndex ? (
                    <div className="w-full space-y-3">
                      {/* Video preview - shows selected frame */}
                      <div className="relative rounded-lg overflow-hidden">
                        <video
                          ref={videoPreviewRef}
                          src={url}
                          playsInline
                          muted
                          className="w-full rounded-lg"
                          onLoadedMetadata={(e) => {
                            const vid = e.currentTarget;
                            vid.currentTime = 0;
                          }}
                        />
                        {/* Play button overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      
                      {/* Filmstrip thumbnail picker */}
                      {isExtractingFrames ? (
                        <div className="flex items-center justify-center py-3">
                          <div className="animate-spin w-5 h-5 border-2 border-crwn-gold/30 border-t-crwn-gold rounded-full" />
                          <span className="text-xs text-crwn-text-secondary ml-2">Extracting frames...</span>
                        </div>
                      ) : videoFrames.length > 0 ? (
                        <div>
                          <p className="text-xs text-crwn-text-secondary mb-2">Select cover frame</p>
                          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
                            {videoFrames.map((frame, i) => (
                              <button
                                key={i}
                                onClick={() => selectFrame(i)}
                                className={`flex-shrink-0 rounded-md overflow-hidden transition-all ${
                                  selectedFrameIndex === i
                                    ? 'ring-2 ring-crwn-gold scale-105'
                                    : 'opacity-70 hover:opacity-100'
                                }`}
                              >
                                <img
                                  src={frame}
                                  alt={`Frame ${i + 1}`}
                                  className="w-16 h-16 object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <Image src={url} alt="" width={80} height={80} className="object-cover" />
                  )}
                  <button
                    onClick={() => removeMedia(index)}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" />
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
                <span className="text-sm text-crwn-text-secondary">{rooms.length ? 'Post to' : 'Post visibility'}</span>
              </div>

              {rooms.length > 0 && (
                <OptionSelect
                  options={[
                    { value: '', label: 'Everyone', hint: 'A public post anyone can see' },
                    ...rooms.map((r) => ({ value: r.id, label: `${r.name} room`, hint: `${r.name} members and up get the full post` })),
                  ]}
                  value={roomId}
                  onChange={(v) => setRoomChoice(v)}
                />
              )}

              {room ? (
                // What the rope will show, said BEFORE the artist posts, so nothing private
                // goes in a caption by accident.
                <p className="text-xs text-crwn-text-secondary mt-2">
                  {mediaFiles.length > 0
                    ? `Non-members see your caption and ${mediaFiles.some((f) => f.type.startsWith('video')) ? 'the video cover' : 'a blurred photo'}, then a lock. Keep anything private out of the caption.`
                    : `Non-members only see that you posted in ${room.name}. The words stay inside the room.`}
                </p>
              ) : rooms.length === 0 ? (
                // Cumulative by construction. The checkbox column this replaces let an
                // artist tick Silver alone, which silently locked out the Gold and Platinum
                // members who pay MORE. Picking a rung here saves that rung and everyone
                // above it.
                <TierAccessSelect
                  tiers={tiers}
                  isFree={isFree}
                  allowedTierIds={selectedTiers}
                  onChange={({ isFree: nextFree, allowedTierIds }) => {
                    setIsFree(nextFree);
                    setSelectedTiers(allowedTierIds);
                  }}
                />
              ) : null}
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
                accept="video/mp4,video/quicktime,video/*"
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
