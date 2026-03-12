'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { CommunityComment } from '@/types';
import Image from 'next/image';
import Link from 'next/link';
import { Heart, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface CommentItemProps {
  comment: CommunityComment;
  postAuthorId?: string;
  isArtistProfile: boolean;
  onLikeChanged?: () => void;
}

export function CommentItem({
  comment,
  postAuthorId,
  isArtistProfile,
  onLikeChanged,
}: CommentItemProps) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  
  const [isLiked, setIsLiked] = useState(comment.has_liked || false);
  const [likesCount, setLikesCount] = useState(comment.likes_count || 0);
  const [showDelete, setShowDelete] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isCommentAuthor = user?.id === comment.author_id;
  const canDelete = isCommentAuthor || isArtistProfile;

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
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
        await supabase.from('community_comment_likes').insert({
          comment_id: comment.id,
          user_id: user.id,
        });
      } else {
        await supabase
          .from('community_comment_likes')
          .delete()
          .eq('comment_id', comment.id)
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

  const handleDelete = async () => {
    try {
      await supabase
        .from('community_comments')
        .update({ is_active: false })
        .eq('id', comment.id);
      window.location.reload();
    } catch (error) {
      console.error('Delete error:', error);
    } finally {
      setShowDeleteModal(false);
    }
  };

  const confirmDelete = () => {
    setShowDeleteModal(true);
  };

  return (
    <div className="neu-inset p-2">
      <div className="flex gap-2">
        {/* Avatar */}
        <Link
          href={`/artist/${comment.author?.username || 'user'}`}
          className="w-8 h-8 rounded-full neu-inset flex items-center justify-center flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-crwn-gold"
        >
          {comment.author?.avatar_url ? (
            <Image src={comment.author.avatar_url} alt="" width={32} height={32} className="object-cover" />
          ) : (
            <span className="text-crwn-text-secondary text-sm font-semibold">
              {(comment.author?.display_name || comment.author?.username || 'U').charAt(0).toUpperCase()}
            </span>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/artist/${comment.author?.username || 'user'}`}
              className="font-medium text-crwn-text text-sm hover:underline"
            >
              {comment.author?.display_name || comment.author?.username || 'User'}
            </Link>
            {comment.tier_badge && (
              <span className="px-2 py-0.5 text-xs font-medium bg-crwn-gold/20 text-crwn-gold rounded-full">
                {comment.tier_badge}
              </span>
            )}
            <span className="text-crwn-text-dim text-xs">•</span>
            <span className="text-crwn-text-dim text-xs">{formatTimestamp(comment.created_at)}</span>
            
            {canDelete && (
              <button
                onClick={confirmDelete}
                className="ml-auto text-crwn-text-dim hover:text-crwn-error"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Content */}
          <p className="text-crwn-text text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>

          {/* Like button */}
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 mt-1 text-xs ${isLiked ? 'text-crwn-gold' : 'text-crwn-text-dim'}`}
          >
            <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
            <span>{likesCount}</span>
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Comment"
        message="Are you sure you want to delete this comment?"
        confirmText="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
}
