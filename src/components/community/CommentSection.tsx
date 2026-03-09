'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { CommunityComment } from '@/types';
import { CommentItem } from './CommentItem';
import { Loader2, Send } from 'lucide-react';
import Image from 'next/image';

interface CommentSectionProps {
  postId: string;
  artistId: string;
  isArtistProfile: boolean;
  isOpen: boolean;
  onClose?: () => void;
  onCommentAdded?: () => void;
}

export function CommentSection({
  postId,
  artistId,
  isArtistProfile,
  isOpen,
  onClose,
  onCommentAdded,
}: CommentSectionProps) {
  const { user, profile } = useAuth();
  const supabase = createBrowserSupabaseClient();
  
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadComments();
    }
  }, [isOpen, postId]);

  const loadComments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_comments')
        .select(`
          *,
          author:profiles(
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('post_id', postId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      const commentsData = data || [];

      // Get unique author IDs
      const authorIds = [...new Set(commentsData.map(c => c.author_id))];

      // Fetch active subscriptions and tier benefits for all authors
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('fan_id, tier_id, tier:tier_id(tier_benefits(benefit_type, config))')
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .in('fan_id', authorIds);

      // Build a map of author_id -> badge_text
      const authorBadgeMap: Record<string, string> = {};

      if (subscriptions) {
        for (const sub of subscriptions) {
          const tier = sub.tier as any;
          if (tier?.tier_benefits) {
            const badgeBenefit = tier.tier_benefits.find(
              (b: any) => b.benefit_type === 'community_badge' && b.config?.badge_text
            );
            if (badgeBenefit) {
              authorBadgeMap[sub.fan_id] = badgeBenefit.config.badge_text;
            }
          }
        }
      }

      // Add badge info to comments
      const commentsWithBadge = commentsData.map(c => ({
        ...c,
        tier_badge: authorBadgeMap[c.author_id] || null,
      }));

      // Check if user liked each comment
      let commentsWithLikes = commentsWithBadge;
      if (user) {
        const commentIds = commentsData.map(c => c.id);
        if (commentIds.length > 0) {
          const { data: likesData } = await supabase
            .from('community_comment_likes')
            .select('comment_id')
            .eq('user_id', user.id)
            .in('comment_id', commentIds);

          const likedIds = new Set((likesData || []).map(l => l.comment_id));
          commentsWithLikes = commentsWithBadge.map(c => ({
            ...c,
            has_liked: likedIds.has(c.id),
          }));
        }
      }

      setComments(commentsWithLikes as CommunityComment[]);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!user || !newComment.trim() || newComment.length > 500) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('community_comments')
        .insert({
          post_id: postId,
          author_id: user.id,
          content: newComment.trim(),
        });

      if (error) throw error;

      setNewComment('');
      loadComments();
      onCommentAdded?.();
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mt-3 pl-14 pr-4 pb-2">
      {/* Comments list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="neu-inset p-3 animate-pulse">
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-crwn-surface" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 bg-crwn-surface rounded" />
                  <div className="h-3 w-full bg-crwn-surface rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : comments.length > 0 ? (
        <div className="space-y-2">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              postAuthorId={comments[0]?.author_id}
              isArtistProfile={isArtistProfile}
              onLikeChanged={loadComments}
            />
          ))}
        </div>
      ) : (
        <div className="neu-inset p-4 text-center">
          <p className="text-crwn-text-dim text-sm">No comments yet. Be the first!</p>
        </div>
      )}

      {/* Comment input */}
      {user && (
        <div className="mt-3 flex gap-2">
          <div className="w-8 h-8 rounded-full neu-inset flex items-center justify-center flex-shrink-0 overflow-hidden">
            {profile?.avatar_url ? (
              <Image src={profile.avatar_url} alt="" width={32} height={32} className="object-cover" />
            ) : (
              <span className="text-crwn-text-secondary text-sm font-semibold">
                {(profile?.display_name || user.email?.charAt(0) || 'U').toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value.slice(0, 500))}
              placeholder="Write a comment..."
              className="neu-inset flex-1 px-3 py-2 text-sm text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmitComment()}
            />
            <button
              onClick={handleSubmitComment}
              disabled={!newComment.trim() || isSubmitting}
              className="neu-button-accent px-3 py-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}
      {newComment.length > 0 && (
        <p className="text-xs text-crwn-text-dim text-right mt-1">{newComment.length}/500</p>
      )}
    </div>
  );
}
