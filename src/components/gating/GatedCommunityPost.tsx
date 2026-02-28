'use client';

import { useState } from 'react';
import { useContentAccess } from '@/hooks/useContentAccess';
import { Lock, LockOpen, Eye } from 'lucide-react';
import Image from 'next/image';

interface CommunityPost {
  id: string;
  author_id: string;
  content: string;
  post_type: 'text' | 'image' | 'video' | 'audio' | 'poll' | 'link';
  media_urls?: string[];
  access_level: 'free' | 'subscriber' | 'purchase';
  pinned: boolean;
  highlighted: boolean;
  created_at: string;
  author?: {
    display_name: string;
    avatar_url: string;
  };
}

interface GatedCommunityPostProps {
  post: CommunityPost;
  artistId: string;
  artistSlug: string;
}

export function GatedCommunityPost({ post, artistId, artistSlug }: GatedCommunityPostProps) {
  const { canAccess, isLoading } = useContentAccess(
    artistId,
    post.access_level
  );
  const [showPreview, setShowPreview] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-crwn-surface border border-crwn-elevated rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-crwn-elevated rounded w-1/4 mb-3" />
        <div className="h-16 bg-crwn-elevated rounded" />
      </div>
    );
  }

  const isLocked = !canAccess && post.access_level !== 'free';

  return (
    <div
      className={`bg-crwn-surface border rounded-xl p-4 transition-all ${
        post.pinned
          ? 'border-crwn-gold/50 bg-crwn-gold/5'
          : post.highlighted
          ? 'border-crwn-gold/30'
          : 'border-crwn-elevated'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {post.author?.avatar_url ? (
            <Image
              src={post.author.avatar_url}
              alt={post.author.display_name}
              width={40}
              height={40}
              className="rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-crwn-elevated flex items-center justify-center">
              👤
            </div>
          )}
          <div>
            <p className="font-medium text-crwn-text">
              {post.author?.display_name || 'Anonymous'}
            </p>
            <div className="flex items-center gap-2">
              {post.pinned && (
                <span className="text-xs text-crwn-gold">📌 Pinned</span>
              )}
              {post.highlighted && (
                <span className="text-xs text-crwn-gold">⭐ Spotlight</span>
              )}
              <span className="text-xs text-crwn-text-secondary">
                {new Date(post.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Access Badge */}
        {post.access_level !== 'free' && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              canAccess
                ? 'bg-crwn-success/10 text-crwn-success'
                : 'bg-crwn-gold/10 text-crwn-gold'
            }`}
          >
            {canAccess ? (
              <>
                <LockOpen size={12} /> Unlocked
              </>
            ) : (
              <>
                <Lock size={12} /> Locked
              </>
            )}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="relative">
        {isLocked && !showPreview ? (
          <div className="bg-crwn-bg/50 border border-dashed border-crwn-elevated rounded-lg p-8 text-center">
            <Lock size={32} className="text-crwn-gold mx-auto mb-3" />
            <p className="text-crwn-text mb-2">This post is for subscribers only</p>
            <p className="text-crwn-text-secondary text-sm mb-4">
              Subscribe to see exclusive content from this artist.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-1.5 text-crwn-text-secondary hover:text-crwn-text text-sm"
              >
                <Eye size={16} /> Show preview
              </button>
              <a
                href={`/artist/${artistSlug}?subscribe=true`}
                className="bg-crwn-gold text-crwn-bg px-4 py-2 rounded-lg text-sm font-medium hover:bg-crwn-gold-hover transition-colors"
              >
                Subscribe
              </a>
            </div>
          </div>
        ) : (
          <>
            <p className="text-crwn-text whitespace-pre-wrap">{post.content}</p>

            {/* Media */}
            {post.media_urls && post.media_urls.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {post.media_urls.map((url, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-video bg-crwn-elevated rounded-lg overflow-hidden"
                  >
                    {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                      <Image
                        src={url}
                        alt={`Media ${idx + 1}`}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary">
                        🎬 Media
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Locked overlay for preview mode */}
            {isLocked && showPreview && (
              <div className="mt-4 p-4 bg-crwn-gold/10 border border-crwn-gold/30 rounded-lg">
                <p className="text-crwn-gold text-sm text-center">
                  👆 This is a preview. Subscribe for full access.
                </p>
                <a
                  href={`/artist/${artistSlug}?subscribe=true`}
                  className="block w-full mt-3 bg-crwn-gold text-crwn-bg py-2 rounded-lg text-center font-medium hover:bg-crwn-gold-hover transition-colors"
                >
                  Subscribe to unlock
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
