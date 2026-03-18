'use client';
import { createPortal } from 'react-dom';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { CommunityPost } from '@/types';
import { CommentSection } from './CommentSection';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, MessageCircle, Lock, Crown, MoreHorizontal, Trash2, Share2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

function AutoPlayVideo({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showControls, setShowControls] = useState(false);
  const hideTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const handleTap = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  };

  return (
    <div className="relative" onClick={handleTap}>
      <video
        ref={videoRef}
        src={src}
        controls={showControls}
        playsInline
        muted
        loop
        poster={poster}
        className="w-full h-auto max-h-[500px] object-contain rounded-lg"
      />
    </div>
  );
}

interface CommunityPostCardProps {
  post: CommunityPost;
  artistSlug: string;
  artistId: string;
  artistTierId?: string;
  isPostAuthor?: boolean;
  isArtistProfile?: boolean;
  onLikeChanged?: () => void;
  onCommentClicked?: () => void;
  onPostDeleted?: () => void;
}

export function CommunityPostCard({
  post,
  artistSlug,
  artistId,
  artistTierId,
  isPostAuthor,
  isArtistProfile,
  onLikeChanged,
  onCommentClicked,
  onPostDeleted,
}: CommunityPostCardProps) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const { tierId } = useSubscription(post.artist_id);
  
  const [isLiked, setIsLiked] = useState(post.has_liked || false);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [showMenu, setShowMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Check if user can view gated post
  const canView = post.is_free || (tierId && post.allowed_tier_ids?.includes(tierId));

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const handleLike = async () => {
    if (!user) return;

    // Optimistic update
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLikesCount(prev => newLiked ? prev + 1 : prev - 1);

    try {
      if (newLiked) {
        const { error: deleteError } = await supabase.from('community_post_likes').insert({
          post_id: post.id,
          user_id: user.id,
        });
      } else {
        const { error: deleteError } = await supabase
          .from('community_post_likes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', user.id);
      }
      onLikeChanged?.();
    } catch (error) {
      console.error('Like error:', error);
      // Revert on error
      setIsLiked(!newLiked);
      setLikesCount(prev => newLiked ? prev - 1 : prev + 1);
    }
  };

  const handleCommentClick = () => {
    setShowComments(!showComments);
    onCommentClicked?.();
  };

  const handleDelete = async () => {
    try {
      const { error: deleteError } = await supabase
        .from('community_posts')
        .update({ is_active: false })
        .eq('id', post.id);

      if (deleteError) { console.error("Delete failed:", deleteError); return; }
      onPostDeleted?.();
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setShowDeleteModal(false);
    }
  };

  const confirmDelete = () => {
    setShowMenu(false);
    setShowDeleteModal(true);
  };

  const handleCommentAdded = () => {
    setCommentsCount(prev => prev + 1);
  };

  // Show locked state for gated posts
  if (!canView) {
    return (
      <div className="neu-raised p-4">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full neu-inset flex items-center justify-center flex-shrink-0 overflow-hidden">
            {post.author?.avatar_url ? (
              <Image src={post.author.avatar_url} alt="" width={40} height={40} className="object-cover" />
            ) : (
              <span className="text-crwn-text-secondary font-semibold">
                {(post.author?.display_name || post.author?.username || 'U').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-crwn-text">
                {post.author?.display_name || post.author?.username || 'User'}
              </span>
              {post.is_artist_post && (
                <span title="Artist"><Crown className="w-4 h-4 text-crwn-gold" /></span>
              )}
              <span className="text-crwn-text-dim text-sm">•</span>
              <span className="text-crwn-text-dim text-sm">{formatTimestamp(post.created_at)}</span>
            </div>
            <div className="neu-inset p-6 text-center mt-2">
              <Lock className="w-8 h-8 text-crwn-gold mx-auto mb-2" />
              <p className="text-crwn-text font-medium mb-1">Exclusive Post</p>
              <p className="text-crwn-text-secondary text-sm">
                Subscribe to see this content
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="neu-raised p-4">
      <div className="flex gap-3">
        {/* Avatar */}
        <Link
          href={`/${artistSlug}`}
          className="w-10 h-10 rounded-full neu-inset flex items-center justify-center flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-crwn-gold"
        >
          {post.author?.avatar_url ? (
            <Image src={post.author.avatar_url} alt="" width={40} height={40} className="object-cover" />
          ) : (
            <span className="text-crwn-text-secondary font-semibold">
              {(post.author?.display_name || post.author?.username || 'U').charAt(0).toUpperCase()}
            </span>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/${artistSlug}`}
              className="font-medium text-crwn-text hover:underline"
            >
              {post.author?.display_name || post.author?.username || 'User'}
            </Link>
            {post.is_artist_post && (
              <span title="Artist">
                <Crown className="w-4 h-4 text-crwn-gold" />
              </span>
            )}
            <span className="text-crwn-text-dim text-sm">•</span>
            <span className="text-crwn-text-dim text-sm">{formatTimestamp(post.created_at)}</span>

            {/* Menu for post author or artist */}
            {(isPostAuthor || isArtistProfile) && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="neu-icon-button p-1"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 neu-raised py-1 z-10">
                    <button
                      onClick={confirmDelete}
                      className="flex items-center gap-2 px-4 py-2 text-crwn-error hover:bg-crwn-error/10 w-full"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tier badge if gated but accessible */}
          {!post.is_free && post.allowed_tier_ids && post.allowed_tier_ids.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-crwn-gold mb-2">
              <Lock className="w-3 h-3" />
              <span>Exclusive</span>
            </div>
          )}

          {/* Content */}
          <p className="text-crwn-text whitespace-pre-wrap">{post.content}</p>

          {/* Media grid */}
          {post.media_urls && post.media_urls.length > 0 && (
            <div className={`mt-3 grid gap-2 ${
              post.media_urls.length === 1 ? 'grid-cols-1' :
              post.media_urls.length === 2 ? 'grid-cols-2' :
              'grid-cols-2'
            }`}>
              {post.media_urls.map((url, index) => (
                <div key={index} className="relative rounded-lg overflow-hidden max-h-[500px] max-w-[600px] mx-auto flex items-center justify-center">
                  {post.media_types?.[index] === 'video' ? (
                    <AutoPlayVideo src={url} poster={post.thumbnail_url || undefined} />
                  ) : (
                    <Image src={url} alt="" width={600} height={800} className="w-full h-auto rounded-lg max-h-[500px] object-contain" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1 text-sm ${isLiked ? 'text-crwn-gold' : 'text-crwn-text-secondary'}`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span>{likesCount}</span>
            </button>

            <button
              onClick={handleCommentClick}
              className={`flex items-center gap-1 text-sm ${showComments ? 'text-crwn-gold' : 'text-crwn-text-secondary'}`}
            >
              <MessageCircle className={`w-5 h-5 ${showComments ? 'fill-current' : ''}`} />
              <span>{commentsCount}</span>
            </button>
            <button
              onClick={async () => {
                const url = `${window.location.origin}/${artistSlug}/post/${post.id}`;
                if (navigator.share) {
                  try { await navigator.share({ title: post.content?.slice(0, 50) || 'Check out this post', url }); } catch {}
                } else {
                  await navigator.clipboard.writeText(url);
                  const btn = document.activeElement as HTMLElement;
                  if (btn) { btn.classList.add('text-crwn-gold'); setTimeout(() => btn.classList.remove('text-crwn-gold'), 1500); }
                }
              }}
              className="flex items-center gap-1 text-sm text-crwn-text-secondary hover:text-crwn-gold transition-colors"
            >
              <Share2 className="w-5 h-5" />
            </button>
          </div>

          {/* Comments Section */}
          <CommentSection
            postId={post.id}
            artistId={artistId}
            isArtistProfile={isArtistProfile || false}
            isOpen={showComments}
            onCommentAdded={handleCommentAdded}
          />
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <ConfirmModal
          isOpen={showDeleteModal}
          title="Delete Post"
          message="Are you sure you want to delete this post? This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />,
        document.body
      )}
    </div>
  );
}
