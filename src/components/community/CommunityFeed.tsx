'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';
import { Post, ArtistProfile } from '@/types';
import { PostCard } from './PostCard';
import { PostCreator } from './PostCreator';
import { Loader2, Users, Filter } from 'lucide-react';

interface CommunityFeedProps {
  artistCommunityId: string;
  artistProfile?: ArtistProfile;
}

export function CommunityFeed({ artistCommunityId, artistProfile }: CommunityFeedProps) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pinned' | 'highlighted'>('all');

  const isCommunityArtist = user?.id === artistProfile?.user_id;

  const loadPosts = useCallback(async () => {
    setIsLoading(true);

    let query = supabase
      .from('posts')
      .select(`
        *,
        author:profiles(*),
        artist:artist_profiles(*)
      `)
      .eq('artist_community_id', artistCommunityId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (activeFilter === 'pinned') {
      query = query.eq('pinned', true);
    } else if (activeFilter === 'highlighted') {
      query = query.eq('highlighted', true);
    }

    const { data, error } = await query;

    if (!error && data) {
      // Fetch like counts and user likes for each post
      const postsWithLikes = await Promise.all(
        data.map(async (post: Post) => {
          // Get like count
          const { count: likeCount } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('likeable_type', 'post')
            .eq('likeable_id', post.id);

          // Get comment count
          const { count: commentCount } = await supabase
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', post.id);

          // Check if user liked
          let hasLiked = false;
          if (user) {
            const { data: likeData } = await supabase
              .from('likes')
              .select('id')
              .eq('likeable_type', 'post')
              .eq('likeable_id', post.id)
              .eq('user_id', user.id)
              .single();
            hasLiked = !!likeData;
          }

          return {
            ...post,
            like_count: likeCount || 0,
            comment_count: commentCount || 0,
            has_liked: hasLiked,
          };
        })
      );

      setPosts(postsWithLikes);
    }

    setIsLoading(false);
  }, [artistCommunityId, activeFilter, user]);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    
    const fetchPosts = async () => {
      if (!isMounted) return;
      await loadPosts();
    };
    
    fetchPosts();
    
    return () => {
      isMounted = false;
    };
  }, [loadPosts]);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`community:${artistCommunityId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: `artist_community_id=eq.${artistCommunityId}`,
        },
        () => {
          loadPosts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
        },
        () => {
          loadPosts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'likes',
        },
        () => {
          loadPosts();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [artistCommunityId, loadPosts]);

  return (
    <div className="space-y-6">
      {/* Community Header */}
      <div className="bg-crwn-surface rounded-xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-crwn-elevated overflow-hidden">
            {artistProfile?.profile?.avatar_url ? (
              <img 
                src={artistProfile.profile.avatar_url}
                alt={artistProfile.profile.display_name || ''}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary">
                <Users className="w-8 h-8" />
              </div>
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-crwn-text">
              {artistProfile?.profile?.display_name || 'Community'}
            </h2>
            <p className="text-crwn-text-secondary">
              {posts.length} posts • Join the conversation
            </p>
          </div>
        </div>
      </div>

      {/* Post Creator */}
      {user && (
        <PostCreator
          artistCommunityId={artistCommunityId}
          onPostCreated={loadPosts}
        />
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Filter className="w-4 h-4 text-crwn-text-secondary flex-shrink-0" />
        {(['all', 'pinned', 'highlighted'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              activeFilter === filter
                ? 'bg-crwn-gold text-crwn-bg'
                : 'bg-crwn-surface text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* Posts Feed */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 bg-crwn-surface rounded-xl">
          <Users className="w-12 h-12 text-crwn-text-secondary mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-crwn-text mb-2">
            No posts yet
          </h3>
          <p className="text-crwn-text-secondary">
            {user 
              ? 'Be the first to start the conversation!'
              : 'Join the community to see posts and participate.'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onUpdate={loadPosts}
              isArtistView={isCommunityArtist}
            />
          ))}
        </div>
      )}
    </div>
  );
}
