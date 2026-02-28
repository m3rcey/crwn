'use client';

import { useState } from 'react';
import { Post, Comment } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { formatDistanceToNow } from '@/lib/utils';
import Image from 'next/image';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  MoreHorizontal, 
  Pin, 
  Sparkles,
  Image as ImageIcon,
  Music,
  Video,
  Link as LinkIcon,
  BarChart3,
  Trash2,
  Check
} from 'lucide-react';

interface PostCardProps {
  post: Post;
  onUpdate?: () => void;
  isArtistView?: boolean;
}

export function PostCard({ post, onUpdate, isArtistView = false }: PostCardProps) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [selectedPollOption, setSelectedPollOption] = useState<string | null>(null);

  const isAuthor = user?.id === post.author_id;

  const handleLike = async () => {
    if (!user) return;
    
    await supabase.rpc('toggle_like', {
      p_user_id: user.id,
      p_likeable_type: 'post',
      p_likeable_id: post.id
    });

    if (onUpdate) {
      onUpdate();
    }
  };

  const loadComments = async () => {
    if (!isExpanded) {
      setIsExpanded(true);
      setIsLoadingComments(true);
      
      const { data, error } = await supabase
        .from('comments')
        .select(`
          *,
          author:profiles(*),
          replies:comments(
            *,
            author:profiles(*)
          )
        `)
        .eq('post_id', post.id)
        .is('parent_comment_id', null)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setComments(data as Comment[]);
      }
      setIsLoadingComments(false);
    } else {
      setIsExpanded(false);
    }
  };

  const submitComment = async () => {
    if (!user || !commentText.trim()) return;

    const { error } = await supabase
      .from('comments')
      .insert({
        post_id: post.id,
        author_id: user.id,
        content: commentText,
        parent_comment_id: replyTo?.id || null
      });

    if (!error) {
      setCommentText('');
      setReplyTo(null);
      loadComments();
      if (onUpdate) onUpdate();
    }
  };

  const handleDelete = async () => {
    if (!isAuthor) return;
    
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', post.id);

    if (!error && onUpdate) {
      onUpdate();
    }
  };

  const handlePin = async () => {
    if (!isArtistView) return;
    
    const { error } = await supabase
      .from('posts')
      .update({ pinned: !post.pinned })
      .eq('id', post.id);

    if (!error && onUpdate) {
      onUpdate();
    }
  };

  const handleHighlight = async () => {
    if (!isArtistView) return;
    
    const { error } = await supabase
      .from('posts')
      .update({ highlighted: !post.highlighted })
      .eq('id', post.id);

    if (!error && onUpdate) {
      onUpdate();
    }
  };

  const handlePollVote = async (option: string) => {
    if (!user || selectedPollOption) return;
    
    setSelectedPollOption(option);
    // In a real implementation, you'd save this vote to the database
    // and update poll_results
  };

  const getPostTypeIcon = () => {
    switch (post.post_type) {
      case 'image': return <ImageIcon className="w-4 h-4" />;
      case 'audio': return <Music className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      case 'link': return <LinkIcon className="w-4 h-4" />;
      case 'poll': return <BarChart3 className="w-4 h-4" />;
      default: return null;
    }
  };

  const totalPollVotes = post.poll_results 
    ? Object.values(post.poll_results).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <article className={`bg-crwn-surface rounded-xl overflow-hidden ${
      post.highlighted ? 'ring-2 ring-crwn-gold' : ''
    } ${post.pinned ? 'border-l-4 border-crwn-gold' : ''}`}>
      {/* Post Header */}
      <div className="p-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-crwn-elevated overflow-hidden">
            {post.author?.avatar_url ? (
              <Image 
                src={post.author.avatar_url} 
                alt={post.author.display_name || ''}
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary">
                <span className="text-lg font-semibold">
                  {(post.author?.display_name || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-crwn-text">
                {post.author?.display_name || 'Unknown User'}
              </span>
              {post.author?.role === 'artist' && (
                <span className="text-xs bg-crwn-gold/20 text-crwn-gold px-2 py-0.5 rounded-full">
                  ARTIST
                </span>
              )}
              {post.pinned && (
                <span className="flex items-center gap-1 text-xs text-crwn-gold">
                  <Pin className="w-3 h-3" />
                  Pinned
                </span>
              )}
              {post.highlighted && (
                <span className="flex items-center gap-1 text-xs text-crwn-gold">
                  <Sparkles className="w-3 h-3" />
                  Highlighted
                </span>
              )}
            </div>
            <p className="text-xs text-crwn-text-secondary">
              {formatDistanceToNow(post.created_at)}
            </p>
          </div>
        </div>

        {/* Actions Menu */}
        <div className="relative">
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-2 hover:bg-crwn-elevated rounded-full transition-colors"
          >
            <MoreHorizontal className="w-5 h-5 text-crwn-text-secondary" />
          </button>
          
          {showActions && (
            <div className="absolute right-0 top-full mt-1 bg-crwn-elevated rounded-lg shadow-xl py-1 min-w-[160px] z-10">
              {isArtistView && (
                <>
                  <button
                    onClick={handlePin}
                    className="w-full px-4 py-2 text-left text-sm text-crwn-text hover:bg-crwn-surface flex items-center gap-2"
                  >
                    <Pin className="w-4 h-4" />
                    {post.pinned ? 'Unpin Post' : 'Pin Post'}
                  </button>
                  <button
                    onClick={handleHighlight}
                    className="w-full px-4 py-2 text-left text-sm text-crwn-text hover:bg-crwn-surface flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    {post.highlighted ? 'Remove Highlight' : 'Highlight Post'}
                  </button>
                </>
              )}
              {isAuthor && (
                <button
                  onClick={handleDelete}
                  className="w-full px-4 py-2 text-left text-sm text-crwn-error hover:bg-crwn-surface flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Post Content */}
      <div className="px-4 pb-4">
        {/* Post Type Badge */}
        {post.post_type !== 'text' && (
          <div className="flex items-center gap-2 text-crwn-text-secondary mb-3">
            {getPostTypeIcon()}
            <span className="text-xs uppercase tracking-wide">{post.post_type}</span>
          </div>
        )}

        {/* Text Content */}
        <p className="text-crwn-text whitespace-pre-wrap mb-4">{post.content}</p>

        {/* Media Content */}
        {post.post_type === 'image' && post.media_urls.length > 0 && (
          <div className={`grid gap-2 mb-4 ${
            post.media_urls.length === 1 ? 'grid-cols-1' :
            post.media_urls.length === 2 ? 'grid-cols-2' :
            'grid-cols-2 md:grid-cols-3'
          }`}>
            {post.media_urls.map((url, index) => (
              <div key={index} className="aspect-square rounded-lg overflow-hidden bg-crwn-elevated">
                <Image 
                  src={url} 
                  alt={`Post image ${index + 1}`}
                  width={300}
                  height={300}
                  className="w-full h-full object-cover hover:scale-105 transition-transform"
                />
              </div>
            ))}
          </div>
        )}

        {/* Link Preview */}
        {post.post_type === 'link' && post.link_url && (
          <a 
            href={post.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-4 bg-crwn-elevated rounded-lg hover:bg-crwn-elevated/80 transition-colors mb-4"
          >
            <div className="flex items-center gap-2 text-crwn-gold mb-2">
              <LinkIcon className="w-4 h-4" />
              <span className="text-sm truncate">{post.link_url}</span>
            </div>
            <p className="text-crwn-text-secondary text-sm">Click to open link</p>
          </a>
        )}

        {/* Poll */}
        {post.post_type === 'poll' && post.poll_options && (
          <div className="space-y-2 mb-4">
            {post.poll_options.map((option, index) => {
              const votes = post.poll_results?.[option] || 0;
              const percentage = totalPollVotes > 0 ? (votes / totalPollVotes) * 100 : 0;
              const isSelected = selectedPollOption === option;

              return (
                <button
                  key={index}
                  onClick={() => handlePollVote(option)}
                  disabled={!!selectedPollOption}
                  className={`w-full relative p-3 rounded-lg text-left transition-all ${
                    isSelected 
                      ? 'bg-crwn-gold/20 ring-1 ring-crwn-gold' 
                      : 'bg-crwn-elevated hover:bg-crwn-elevated/80'
                  }`}
                >
                  {/* Progress Bar */}
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-crwn-gold/10 rounded-lg transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                  <div className="relative flex items-center justify-between">
                    <span className="text-crwn-text">{option}</span>
                    {selectedPollOption && (
                      <span className="text-crwn-text-secondary text-sm">
                        {percentage.toFixed(0)}% ({votes} votes)
                      </span>
                    )}
                    {isSelected && <Check className="w-4 h-4 text-crwn-gold" />}
                  </div>
                </button>
              );
            })}
            <p className="text-xs text-crwn-text-secondary">
              {totalPollVotes} votes
            </p>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex items-center gap-6 pt-4 border-t border-crwn-elevated">
          <button
            onClick={handleLike}
            className={`flex items-center gap-2 transition-colors ${
              post.has_liked 
                ? 'text-crwn-error' 
                : 'text-crwn-text-secondary hover:text-crwn-error'
            }`}
          >
            <Heart className={`w-5 h-5 ${post.has_liked ? 'fill-current' : ''}`} />
            <span className="text-sm">{post.like_count || 0}</span>
          </button>

          <button
            onClick={loadComments}
            className="flex items-center gap-2 text-crwn-text-secondary hover:text-crwn-gold transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm">{post.comment_count || 0}</span>
          </button>

          <button className="flex items-center gap-2 text-crwn-text-secondary hover:text-crwn-gold transition-colors ml-auto">
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Comments Section */}
      {isExpanded && (
        <div className="border-t border-crwn-elevated p-4">
          {/* Comment Input */}
          {user && (
            <div className="mb-4">
              {replyTo && (
                <div className="flex items-center gap-2 mb-2 text-sm text-crwn-text-secondary">
                  <span>Replying to {replyTo.author?.display_name}</span>
                  <button 
                    onClick={() => setReplyTo(null)}
                    className="text-crwn-gold hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={replyTo ? 'Write a reply...' : 'Write a comment...'}
                  className="flex-1 bg-crwn-elevated border border-crwn-gold-muted/30 rounded-lg px-4 py-2 text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold"
                  onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                />
                <button
                  onClick={submitComment}
                  disabled={!commentText.trim()}
                  className="px-4 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold disabled:opacity-50 hover:bg-crwn-gold-hover transition-colors"
                >
                  Post
                </button>
              </div>
            </div>
          )}

          {/* Comments List */}
          {isLoadingComments ? (
            <div className="text-center py-4 text-crwn-text-secondary">
              Loading comments...
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-4 text-crwn-text-secondary">
              No comments yet. Be the first!
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  onReply={setReplyTo}
                  onUpdate={loadComments}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// Comment Item Component
interface CommentItemProps {
  comment: Comment;
  onReply: (comment: Comment) => void;
  onUpdate: () => void;
}

function CommentItem({ comment, onReply, onUpdate }: CommentItemProps) {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [showReplies, setShowReplies] = useState(false);

  const isAuthor = user?.id === comment.author_id;

  const handleLike = async () => {
    if (!user) return;
    
    await supabase.rpc('toggle_like', {
      p_user_id: user.id,
      p_likeable_type: 'comment',
      p_likeable_id: comment.id
    });

    onUpdate();
  };

  const handleDelete = async () => {
    if (!isAuthor) return;
    
    await supabase
      .from('comments')
      .delete()
      .eq('id', comment.id);

    onUpdate();
  };

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-crwn-elevated overflow-hidden flex-shrink-0">
        {comment.author?.avatar_url ? (
          <Image 
            src={comment.author.avatar_url} 
            alt={comment.author.display_name || ''}
            width={32}
            height={32}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary text-sm font-semibold">
            {(comment.author?.display_name || 'U').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="bg-crwn-elevated rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-crwn-text text-sm">
              {comment.author?.display_name}
            </span>
            {comment.author?.role === 'artist' && (
              <span className="text-[10px] bg-crwn-gold/20 text-crwn-gold px-1.5 py-0.5 rounded">
                ARTIST
              </span>
            )}
            <span className="text-xs text-crwn-text-secondary">
              {formatDistanceToNow(comment.created_at)}
            </span>
          </div>
          <p className="text-crwn-text text-sm whitespace-pre-wrap">{comment.content}</p>
        </div>

        {/* Comment Actions */}
        <div className="flex items-center gap-4 mt-1 ml-1">
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 text-xs transition-colors ${
              comment.has_liked ? 'text-crwn-error' : 'text-crwn-text-secondary hover:text-crwn-error'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${comment.has_liked ? 'fill-current' : ''}`} />
            <span>{comment.like_count || 0}</span>
          </button>

          <button
            onClick={() => onReply(comment)}
            className="text-xs text-crwn-text-secondary hover:text-crwn-gold transition-colors"
          >
            Reply
          </button>

          {isAuthor && (
            <button
              onClick={handleDelete}
              className="text-xs text-crwn-error hover:opacity-80 transition-opacity"
            >
              Delete
            </button>
          )}
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowReplies(!showReplies)}
              className="text-xs text-crwn-gold hover:underline"
            >
              {showReplies ? 'Hide' : 'Show'} {comment.replies.length} replies
            </button>

            {showReplies && (
              <div className="mt-2 space-y-3 pl-4 border-l-2 border-crwn-elevated">
                {comment.replies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    onReply={onReply}
                    onUpdate={onUpdate}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
