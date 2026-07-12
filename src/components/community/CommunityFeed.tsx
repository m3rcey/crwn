'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { CommunityPost, TierConfig } from '@/types';
import { PostComposer } from './PostComposer';
import { EmptyState } from '@/components/ui/EmptyState';
import { CommunityPostCard } from './CommunityPostCard';
import { CommunityChannels } from './CommunityChannels';
import { Loader2, Hash, MessageSquare } from 'lucide-react';

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
  // Posts stay the default view: it is the existing surface, and it is the one
  // that carries video. Chat is the new, opt-in half.
  const [view, setView] = useState<'posts' | 'chat'>('posts');

  const loadPosts = useCallback(async () => {
    try {
      // Read the VIEW, not the table. community_posts' RLS hides gated rows
      // outright; the view returns every active row but NULLs content and media
      // for readers who are not entitled, and reports `can_view`. That keeps the
      // locked teaser card (which drives subscriptions) without shipping the
      // paid body to the client. See schema-phase2-community-posts-rls.sql.
      //
      // Falls back to the base table when the view is absent, so this code can
      // ship before the migration is applied without emptying every feed. Once
      // the migration lands the table is locked down and this branch goes cold.
      let postsData: CommunityPost[] = [];
      const viewResult = await supabase
        .from('community_posts_feed')
        .select('*')
        .eq('artist_id', artistId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (viewResult.error) {
        const tableResult = await supabase
          .from('community_posts')
          .select('*')
          .eq('artist_id', artistId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(20);
        if (tableResult.error) throw tableResult.error;
        postsData = (tableResult.data || []) as unknown as CommunityPost[];
      } else {
        postsData = (viewResult.data || []) as unknown as CommunityPost[];
      }

      // A view carries no foreign key, so PostgREST cannot embed the author.
      // Fetch the profiles for this page of posts in one follow-up query.
      const authorIds = [...new Set((postsData || []).map((p) => p.author_id))];
      const authorMap: Record<string, { username: string | null; display_name: string | null; avatar_url: string | null }> = {};
      if (authorIds.length > 0) {
        const { data: authors } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', authorIds);
        (authors || []).forEach((a) => {
          authorMap[a.id] = { username: a.username, display_name: a.display_name, avatar_url: a.avatar_url };
        });
      }
      const withAuthors = (postsData || []).map((p) => ({ ...p, author: authorMap[p.author_id] || null }));

      // Check if current user liked each post
      let postsWithLikes = withAuthors;
      if (user) {
        const postIds = withAuthors.map(p => p.id);
        if (postIds.length > 0) {
          const { data: likesData } = await supabase
            .from('community_post_likes')
            .select('post_id')
            .eq('user_id', user.id)
            .in('post_id', postIds);

          const likedIds = new Set((likesData || []).map(l => l.post_id));
          postsWithLikes = withAuthors.map(p => ({
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

  const tabClass = (v: 'posts' | 'chat') =>
    `flex items-center gap-1.5 text-sm px-4 py-2 rounded-full transition-colors ${
      view === v
        ? 'bg-crwn-gold text-crwn-bg font-semibold'
        : 'text-crwn-text-secondary hover:text-crwn-text'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setView('posts')} className={tabClass('posts')}>
          <MessageSquare className="w-4 h-4" /> Posts
        </button>
        <button onClick={() => setView('chat')} className={tabClass('chat')}>
          <Hash className="w-4 h-4" /> Chat
        </button>
      </div>

      {view === 'chat' ? (
        <CommunityChannels
          artistId={artistId}
          artistSlug={artistSlug}
          isArtistProfile={isArtistProfile}
          tiers={tiers}
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
        </div>
      ) : (
        <>
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
                  artistId={artistId}
                  artistTierId={tierId || undefined}
                  isPostAuthor={user?.id === post.author_id}
                  isArtistProfile={isArtistProfile}
                  onLikeChanged={handleRefresh}
                  onPostDeleted={handleRefresh}
                />
              ))}
            </div>
          ) : (
            <div className="neu-raised p-8 text-center">
              <EmptyState icon="💬" title="No Posts Yet" description="Be the first to start a conversation!" />
              <p className="text-crwn-text-secondary text-sm">Be the first to post!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
