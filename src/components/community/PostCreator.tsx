'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';
import { PostType, AccessLevel } from '@/types';
import { 
  Image as ImageIcon, 
  Music, 
  Video, 
  Link as LinkIcon, 
  BarChart3, 
  X,
  Plus,
  Loader2,
  Send
} from 'lucide-react';

interface PostCreatorProps {
  artistCommunityId: string;
  onPostCreated?: () => void;
  availableTiers?: { id: string; name: string }[];
}

const POST_TYPES: { type: PostType; icon: React.ReactNode; label: string }[] = [
  { type: 'text', icon: null, label: 'Text' },
  { type: 'image', icon: <ImageIcon className="w-4 h-4" />, label: 'Image' },
  { type: 'audio', icon: <Music className="w-4 h-4" />, label: 'Audio' },
  { type: 'video', icon: <Video className="w-4 h-4" />, label: 'Video' },
  { type: 'poll', icon: <BarChart3 className="w-4 h-4" />, label: 'Poll' },
  { type: 'link', icon: <LinkIcon className="w-4 h-4" />, label: 'Link' },
];

const ACCESS_LEVELS: { value: AccessLevel; label: string }[] = [
  { value: 'free', label: 'Everyone' },
  { value: 'subscriber', label: 'Subscribers Only' },
  { value: 'purchase', label: 'Purchasers Only' },
];

export function PostCreator({ artistCommunityId, onPostCreated, availableTiers }: PostCreatorProps) {
  const { user, profile } = useAuth();
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<PostType>('text');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('free');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isArtist = profile?.role === 'artist';

  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newUrls: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${i}.${fileExt}`;
      const filePath = `community/${artistCommunityId}/${user?.id}/${fileName}`;

      setUploadProgress(((i + 1) / files.length) * 50);

      const { error: uploadError } = await supabase.storage
        .from('community-media')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('community-media')
        .getPublicUrl(filePath);

      newUrls.push(publicUrl);
      setUploadProgress(((i + 1) / files.length) * 100);
    }

    setMediaUrls([...mediaUrls, ...newUrls]);
    setUploadProgress(0);
  };

  const removeMedia = (index: number) => {
    setMediaUrls(mediaUrls.filter((_, i) => i !== index));
  };

  const addPollOption = () => {
    if (pollOptions.length < 6) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    if (!user || !content.trim()) return;

    // Validate poll options
    if (postType === 'poll') {
      const validOptions = pollOptions.filter(opt => opt.trim() !== '');
      if (validOptions.length < 2) {
        alert('Please provide at least 2 poll options');
        return;
      }
    }

    // Validate link
    if (postType === 'link' && !linkUrl.trim()) {
      alert('Please provide a link URL');
      return;
    }

    setIsSubmitting(true);

    const postData = {
      author_id: user.id,
      artist_community_id: artistCommunityId,
      content: content.trim(),
      post_type: postType,
      media_urls: mediaUrls,
      access_level: accessLevel,
      link_url: postType === 'link' ? linkUrl : null,
      poll_options: postType === 'poll' ? pollOptions.filter(opt => opt.trim() !== '') : null,
      poll_results: postType === 'poll' ? {} : null,
    };

    const { error } = await supabase
      .from('posts')
      .insert(postData);

    setIsSubmitting(false);

    if (error) {
      console.error('Error creating post:', error);
      return;
    }

    // Reset form
    setContent('');
    setPostType('text');
    setAccessLevel('free');
    setMediaUrls([]);
    setLinkUrl('');
    setPollOptions(['', '']);
    setIsExpanded(false);

    onPostCreated?.();
  };

  const canPost = content.trim() && !isSubmitting;

  return (
    <div className="bg-crwn-surface rounded-xl overflow-hidden">
      {/* Creator Header */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-crwn-elevated overflow-hidden">
            {profile?.avatar_url ? (
              <img 
                src={profile.avatar_url} 
                alt={profile.display_name || ''}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary">
                <span className="text-lg font-semibold">
                  {(profile?.display_name || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1">
            {!isExpanded ? (
              <button
                onClick={() => setIsExpanded(true)}
                className="w-full text-left px-4 py-2.5 bg-crwn-elevated rounded-full text-crwn-text-secondary hover:bg-crwn-elevated/80 transition-colors"
              >
                What&apos;s on your mind?
              </button>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What&apos;s on your mind?"
                className="w-full bg-crwn-elevated rounded-lg px-4 py-3 text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:ring-2 focus:ring-crwn-gold resize-none"
                rows={3}
                autoFocus
              />
            )}
          </div>
        </div>

        {/* Expanded Options */}
        {isExpanded && (
          <>
            {/* Post Type Selector */}
            <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2">
              {POST_TYPES.map(({ type, icon, label }) => (
                <button
                  key={type}
                  onClick={() => setPostType(type)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                    postType === type
                      ? 'bg-crwn-gold text-crwn-bg'
                      : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
                  }`}
                >
                  {icon}
                  <span className="capitalize">{label}</span>
                </button>
              ))}
            </div>

            {/* Media Upload (Image/Audio/Video) */}
            {(postType === 'image' || postType === 'audio' || postType === 'video') && (
              <div className="mt-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple={postType === 'image'}
                  accept={
                    postType === 'image' ? 'image/*' :
                    postType === 'audio' ? 'audio/*' :
                    'video/*'
                  }
                  onChange={(e) => handleMediaUpload(e.target.files)}
                  className="hidden"
                />

                {mediaUrls.length === 0 ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-8 border-2 border-dashed border-crwn-gold-muted/30 rounded-lg text-crwn-text-secondary hover:border-crwn-gold hover:text-crwn-gold transition-colors flex flex-col items-center gap-2"
                  >
                    {postType === 'image' && <ImageIcon className="w-8 h-8" />}
                    {postType === 'audio' && <Music className="w-8 h-8" />}
                    {postType === 'video' && <Video className="w-8 h-8" />}
                    <span>Click to upload {postType}s</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {mediaUrls.map((url, index) => (
                      <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-crwn-elevated">
                        {postType === 'image' ? (
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {postType === 'audio' ? <Music className="w-8 h-8" /> : <Video className="w-8 h-8" />}
                          </div>
                        )}
                        <button
                          onClick={() => removeMedia(index)}
                          className="absolute top-1 right-1 p-1 bg-crwn-error rounded-full text-white hover:opacity-80"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {postType === 'image' && mediaUrls.length < 6 && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-lg border-2 border-dashed border-crwn-gold-muted/30 flex items-center justify-center text-crwn-text-secondary hover:border-crwn-gold hover:text-crwn-gold transition-colors"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                )}

                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="mt-2 h-1 bg-crwn-elevated rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-crwn-gold transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Link Input */}
            {postType === 'link' && (
              <div className="mt-4">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-crwn-elevated rounded-lg px-4 py-2 text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:ring-2 focus:ring-crwn-gold"
                />
              </div>
            )}

            {/* Poll Options */}
            {postType === 'poll' && (
              <div className="mt-4 space-y-2">
                {pollOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => updatePollOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="flex-1 bg-crwn-elevated rounded-lg px-4 py-2 text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:ring-2 focus:ring-crwn-gold"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        onClick={() => removePollOption(index)}
                        className="p-2 text-crwn-error hover:opacity-80"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <button
                    onClick={addPollOption}
                    className="flex items-center gap-2 text-crwn-gold hover:underline text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Option
                  </button>
                )}
              </div>
            )}

            {/* Access Level Selector */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-crwn-text-secondary">Visibility:</span>
                <select
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
                  className="bg-crwn-elevated rounded-lg px-3 py-1.5 text-sm text-crwn-text focus:outline-none focus:ring-2 focus:ring-crwn-gold"
                >
                  {ACCESS_LEVELS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsExpanded(false)}
                  className="px-4 py-2 text-crwn-text-secondary hover:text-crwn-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canPost}
                  className="flex items-center gap-2 px-4 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold disabled:opacity-50 hover:bg-crwn-gold-hover transition-colors"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Post
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
