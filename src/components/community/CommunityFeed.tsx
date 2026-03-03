'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { CommunityPost, TierConfig } from '@/types';
import { PostComposer } from './PostComposer';
import { CommunityPostCard } from './CommunityPostCard';
import { Loader2 } from 'lucide-react';

interface CommunityFeedProps {
  artistId: string;
  artistSlug: string;
  isArtistProfile: boolean;
  tiers: TierConfig[];
}

export function CommunityFeed({ artistId, artistSlug, isArtistProfile, tiers }: CommunityFeedProps) {
  const { user, profile } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const { tierId } = useSubscription(artistId);
  
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      // Get posts with author info
      const { data: postsData, error } = await supabase
        .from('community_posts')
        .select(`
          *,
          author:profiles(
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('artist_id', artistId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Check if current user liked each post
      let postsWithLikes = postsData || [];
      if (user) {
        const postIds = (postsData || []).map(p => p.id);
        if (postIds.length > 0) {
          const { data: likesData } = await supabase
            .from('community_post_likes')
            .select('post_id')
            .eq('user_id', user.id)
            .in('post_id', postIds);

          const likedIds = new Set((likesData || []).map(l => l.post_id));
          postsWithLikes = (postsData || []).map(p => ({
            ...p,
            has_liked: likedIds.has(p.id),
          }));
        }
      }

      setPosts(postsWithLikes as CommunityPost[]);
    } catch (error) {
      console.error('Error loading posts:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [artistId, supabase, user]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadPosts();
  };

  const handlePostCreated = () => {
    loadPosts();
  };

  const isPostAuthor = user?.id === posts[0]?.author_id;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Post composer - only show if logged in */}
      {user && (
        <PostComposer
          artistId={artistId}
          isArtist={isArtistProfile}
          tiers={tiers}
          onPostCreated={handlePostCreated}
        />
      )}

      {/* Posts */}
      {posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <CommunityPostCard
              key={post.id}
              post={post}
              artistSlug={artistSlug}
              artistTierId={tierId || undefined}
              isPostAuthor={user?.id === post.author_id}
              isArtistProfile={isArtistProfile}
              onLikeChanged={handleRefresh}
            />
          ))}
        </div>
      ) : (
        <div className="neu-raised p-8 text-center">
          <p className="text-crwn-text-secondary mb-2">No posts yet</p>
          <p className="text-crwn-text-dim text-sm">Be the first to post!</p>
        </div>
      )}
    </div>
  );
}
