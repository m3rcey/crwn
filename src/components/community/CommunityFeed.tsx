'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { CommunityPost, TierConfig } from '@/types';
import { PostComposer } from './PostComposer';
import { EmptyState } from '@/components/ui/EmptyState';
import { CommunityPostCard } from './CommunityPostCard';
import { CommunityChannels } from './CommunityChannels';
import { RoomJoinSheet } from './RoomJoinSheet';
import { Loader2, Hash, MessageSquare, Lock } from 'lucide-react';
import {
  planTierRooms, tierRoomsInOrder, roomAccessFor, entryTierFor, ropeHeadline, isPrivateMediaKey,
  type RoomChannel,
} from '@/lib/community/rooms';

interface CommunityFeedProps {
  artistId: string;
  artistSlug: string;
  isArtistProfile: boolean;
  tiers: TierConfig[];
}

const ALL = 'all';

export function CommunityFeed({ artistId, artistSlug, isArtistProfile, tiers }: CommunityFeedProps) {
  const { user } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { tierId } = useSubscription(artistId);
  const searchParams = useSearchParams();

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Posts stay the default view: it is the existing surface, and it is the one
  // that carries video. Chat is the artist's own chat channels, unchanged.
  const [view, setView] = useState<'posts' | 'chat'>('posts');

  // Tier rooms. ?room=<id> is a POINTER (the checkout return lands here): it is matched
  // against the rooms this page loaded for this artist, and an unknown id opens "All".
  const [channels, setChannels] = useState<RoomChannel[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const requestedRoom = searchParams.get('room');
  const [activeRoom, setActiveRoom] = useState<string>(requestedRoom || ALL);
  const [ropeOpen, setRopeOpen] = useState(false);
  const syncTried = useRef(false);
  const justJoined = searchParams.get('subscription') === 'success';

  const rooms = useMemo(() => tierRoomsInOrder(channels, tiers), [channels, tiers]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const room = activeRoom === ALL ? null : roomById.get(activeRoom) ?? null;

  const loadRooms = useCallback(async () => {
    const { data } = await supabase
      .from('community_channels')
      .select('*')
      .eq('artist_id', artistId)
      .eq('is_active', true);
    setChannels((data || []) as RoomChannel[]);
    setRoomsLoaded(true);
  }, [artistId, supabase]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // The owner's own visit sets up (and refreshes) their rooms, so every artist gets them,
  // not only the launch partners. Once per mount: before the migration lands the server
  // answers 503 and the tab carries on exactly as it did before rooms existed.
  useEffect(() => {
    if (!isArtistProfile || !roomsLoaded || syncTried.current || tiers.length === 0) return;
    const plan = planTierRooms(tiers, channels);
    if (!plan.create.length && !plan.update.length) return;
    syncTried.current = true;
    fetch('/api/community/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId }),
    })
      .then((res) => (res.ok ? loadRooms() : undefined))
      .catch(() => {});
  }, [isArtistProfile, roomsLoaded, tiers, channels, artistId, loadRooms]);

  // A stale or foreign ?room= falls back to All once the rooms are known.
  useEffect(() => {
    if (roomsLoaded && activeRoom !== ALL && !roomById.has(activeRoom)) setActiveRoom(ALL);
  }, [roomsLoaded, activeRoom, roomById]);

  const loadPosts = useCallback(async () => {
    try {
      // Read the VIEW, not the table. community_posts' RLS hides gated rows
      // outright; the view returns every active row but NULLs content and media
      // for readers who are not entitled, and reports `can_view`. That keeps the
      // locked teaser card (which drives subscriptions) without shipping the
      // paid body to the client. See schema-phase2-community-posts-rls.sql and
      // schema-phase2-community-tier-rooms.sql (what a room post's teaser may show).
      //
      // Falls back to the base table when the view is absent, so this code can
      // ship before the migration is applied without emptying every feed. Once
      // the migration lands the table is locked down and this branch goes cold.
      let postsData: CommunityPost[] = [];
      let viewQuery = supabase
        .from('community_posts_feed')
        .select('*')
        .eq('artist_id', artistId);
      if (activeRoom !== ALL) viewQuery = viewQuery.eq('channel_id', activeRoom);
      const viewResult = await viewQuery.order('created_at', { ascending: false }).limit(20);

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

      // A room post's media are private keys. The view hands them only to an entitled
      // reader; the media route re-reads the view as this caller and signs them.
      const needsSigning = postsData
        .filter((p) => Array.isArray(p.media_urls) && p.media_urls.some(isPrivateMediaKey))
        .map((p) => p.id);
      if (needsSigning.length) {
        try {
          const res = await fetch('/api/community/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postIds: needsSigning }),
          });
          const { media } = res.ok ? await res.json() : { media: {} };
          postsData = postsData.map((p) => {
            if (!needsSigning.includes(p.id)) return p;
            const signed = (media || {})[p.id] as (string | null)[] | undefined;
            // Unsigned keys render as nothing, never as a broken link to a private object.
            return { ...p, media_urls: (p.media_urls || []).map((v, i) => (isPrivateMediaKey(v) ? signed?.[i] || '' : v)) };
          });
        } catch {
          postsData = postsData.map((p) => (needsSigning.includes(p.id)
            ? { ...p, media_urls: (p.media_urls || []).map((v) => (isPrivateMediaKey(v) ? '' : v)) }
            : p));
        }
      }

      // A view carries no foreign key, so PostgREST cannot embed the author.
      // Fetch the profiles for this page of posts in one follow-up query.
      const authorIds = [...new Set((postsData || []).map((p) => p.author_id))];
      const authorMap: Record<string, { username: string; display_name: string; avatar_url: string }> = {};
      if (authorIds.length > 0) {
        const { data: authors } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', authorIds);
        (authors || []).forEach((a) => {
          authorMap[a.id] = { username: a.username, display_name: a.display_name, avatar_url: a.avatar_url };
        });
      }
      const withAuthors = (postsData || []).map((p) => ({ ...p, author: authorMap[p.author_id] || undefined }));

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
  }, [artistId, supabase, user, activeRoom]);

  useEffect(() => {
    setIsLoading(true);
    loadPosts();
  }, [loadPosts]);

  // Back from checkout: the membership is written by the Stripe webhook, which can land a
  // few seconds after the fan does. Read again so the room opens without a manual refresh.
  useEffect(() => {
    if (!justJoined) return;
    const timers = [3000, 8000].map((ms) => setTimeout(() => loadPosts(), ms));
    return () => timers.forEach(clearTimeout);
  }, [justJoined, loadPosts]);

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

  const roomPill = (active: boolean) =>
    `flex-shrink-0 inline-flex items-center gap-1 text-sm px-3.5 py-1.5 rounded-full border transition-colors ${
      active
        ? 'border-crwn-gold text-crwn-gold bg-crwn-gold/10 font-semibold'
        : 'border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
    }`;

  // The open room, seen from outside: who it is for, and the way in.
  const roomOpen = room ? roomAccessFor(room, tierId, isArtistProfile) : true;
  const roomTarget = room ? entryTierFor(room.allowed_tier_ids, tiers) : null;
  const currentTier = tiers.find((t) => t.id === tierId) ?? null;

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
      ) : (
        <>
          {/* Room tabs: the club floor. Every room is visible; a lock marks the ones this
              viewer is outside of. */}
          {rooms.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
              <button onClick={() => setActiveRoom(ALL)} className={roomPill(activeRoom === ALL)}>All</button>
              {rooms.map((r) => (
                <button key={r.id} onClick={() => setActiveRoom(r.id)} className={roomPill(activeRoom === r.id)}>
                  {!roomAccessFor(r, tierId, isArtistProfile) && <Lock className="w-3.5 h-3.5" />}
                  {r.name}
                </button>
              ))}
            </div>
          )}

          {justJoined && room && (
            <div className="neu-raised p-3 text-sm text-crwn-text text-center">
              {roomOpen ? `You're in. Welcome to the ${room.name} room.` : 'Unlocking your membership. This takes a few seconds.'}
            </div>
          )}

          {room && !roomOpen && roomTarget && (
            <div className="neu-raised p-4 flex items-center gap-3">
              <Lock className="w-5 h-5 text-crwn-gold flex-shrink-0" />
              <p className="flex-1 text-sm text-crwn-text">
                You&apos;re outside the {room.name} room. You can see what&apos;s going on, but only members get in.
              </p>
              <button
                onClick={() => setRopeOpen(true)}
                className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors"
              >
                {roomTarget.price === 0 ? 'Join free' : `Join ${roomTarget.name}`}
              </button>
              <RoomJoinSheet
                open={ropeOpen}
                onClose={() => setRopeOpen(false)}
                headline={ropeHeadline(roomTarget.name, 'room')}
                target={roomTarget}
                currentTier={currentTier}
                artistId={artistId}
                artistSlug={artistSlug}
                roomId={room.id}
              />
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
            </div>
          ) : (
            <>
              {/* Composer: the artist posts anywhere; a fan writes on the open wall only,
                  never inside a tier room (rooms are the artist's fulfillment floor). */}
              {user && (isArtistProfile || !room) && (
                <PostComposer
                  key={room?.id || ALL}
                  artistId={artistId}
                  isArtist={isArtistProfile}
                  tiers={tiers}
                  rooms={isArtistProfile ? rooms : []}
                  defaultRoomId={room?.id ?? null}
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
                      room={post.channel_id ? roomById.get(post.channel_id) ?? null : null}
                      tiers={tiers}
                      isPostAuthor={user?.id === post.author_id}
                      isArtistProfile={isArtistProfile}
                      onLikeChanged={handleRefresh}
                      onPostDeleted={handleRefresh}
                    />
                  ))}
                </div>
              ) : (
                <div className="neu-raised p-8 text-center">
                  {room ? (
                    <EmptyState
                      icon="🔒"
                      title={`Nothing in ${room.name} yet`}
                      description={isArtistProfile
                        ? `Post here and only ${room.name} members and up get the full thing.`
                        : `When the artist posts for ${room.name} members, it shows up here.`}
                    />
                  ) : (
                    <>
                      <EmptyState icon="💬" title="No Posts Yet" description="Be the first to start a conversation!" />
                      <p className="text-crwn-text-secondary text-sm">Be the first to post!</p>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
      {isRefreshing && <span className="sr-only">Refreshing</span>}
    </div>
  );
}
