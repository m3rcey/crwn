'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TierConfig } from '@/types';
import { Hash, Lock, Loader2, Send, Plus, X, Megaphone, Trash2 } from 'lucide-react';

interface Channel {
  id: string;
  artist_id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  is_free: boolean;
  allowed_tier_ids: string[] | null;
  artist_only_posting: boolean;
}

interface ChannelMessage {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface CommunityChannelsProps {
  artistId: string;
  artistSlug: string;
  isArtistProfile: boolean; // viewer owns this artist page
  tiers: TierConfig[];
}

const MESSAGE_LIMIT = 100;

export function CommunityChannels({ artistId, artistSlug, isArtistProfile, tiers }: CommunityChannelsProps) {
  const { user } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { tierId } = useSubscription(artistId);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Messages carry the channel they belong to. Switching channels then shows an
  // empty list until the new one loads, instead of briefly flashing the old
  // channel's messages under the new channel's name.
  const [loaded, setLoaded] = useState<{ channelId: string | null; list: ChannelMessage[] }>({ channelId: null, list: [] });
  const [input, setInput] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadChannels = useCallback(async () => {
    const { data } = await supabase
      .from('community_channels')
      .select('*')
      .eq('artist_id', artistId)
      .eq('is_active', true)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    const list = (data || []) as Channel[];
    setChannels(list);
    setActiveId((prev) => prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? null));
    setLoadingChannels(false);
  }, [artistId, supabase]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const active = channels.find((c) => c.id === activeId) || null;

  // Mirrors can_read_community_channel() in schema-phase2-community-channels.sql.
  // The DB is the gate; this only decides what to render.
  const canRead = useCallback((c: Channel) => {
    if (c.is_free) return true;
    if (isArtistProfile) return true;
    if (!tierId) return false;
    const allowed = c.allowed_tier_ids || [];
    return allowed.length === 0 || allowed.includes(tierId);
  }, [isArtistProfile, tierId]);

  const canPost = active
    ? !!user && canRead(active) && (!active.artist_only_posting || isArtistProfile)
    : false;

  // Only render messages that belong to the channel currently open. Memoized so
  // the scroll effect below does not re-run on every render.
  const messages = useMemo(
    () => (active && loaded.channelId === active.id ? loaded.list : []),
    [active, loaded],
  );
  const loadingMessages = !!active && canRead(active) && loaded.channelId !== active.id;

  const setMessages = useCallback((update: (prev: ChannelMessage[]) => ChannelMessage[]) => {
    setLoaded((prev) => ({ channelId: prev.channelId, list: update(prev.list) }));
  }, []);

  // Load messages for the active channel.
  useEffect(() => {
    if (!active || !canRead(active)) return;
    let cancelled = false;
    const channelId = active.id;
    supabase
      .from('community_channel_messages')
      .select('id, channel_id, author_id, body, created_at, author:profiles(username, display_name, avatar_url)')
      .eq('channel_id', channelId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_LIMIT)
      .then(({ data }) => {
        if (cancelled) return;
        // Query is newest-first so the LIMIT keeps the most RECENT messages;
        // flip it for display.
        setLoaded({ channelId, list: ((data || []) as unknown as ChannelMessage[]).slice().reverse() });
      });
    return () => { cancelled = true; };
  }, [active, canRead, supabase]);

  // Realtime: append inserts. RLS is replayed per row, so a locked channel
  // never pushes anything to a fan without the tier.
  useEffect(() => {
    if (!active || !canRead(active)) return;
    const channel = supabase
      .channel(`community-channel-${active.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'community_channel_messages',
        filter: `channel_id=eq.${active.id}`,
      }, async (payload) => {
        const row = payload.new as ChannelMessage;
        // The realtime payload carries no joined author, so fetch the profile.
        const { data: author } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', row.author_id)
          .maybeSingle();
        setMessages((prev) => prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, author }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [active, canRead, supabase, setMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || !active || !user || sending) return;
    setSending(true);
    setSendError(null);
    const { data, error } = await supabase
      .from('community_channel_messages')
      .insert({ channel_id: active.id, author_id: user.id, body: text.slice(0, 2000) })
      .select('id, channel_id, author_id, body, created_at')
      .single();
    if (error) {
      // RLS rejects a fan posting in an announce-only or locked channel.
      setSendError('Message not sent. You may not have access to post here.');
    } else {
      setInput('');
      // Realtime echoes our own insert back, and the dedupe on id makes this safe.
      if (data) setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data as ChannelMessage]);
    }
    setSending(false);
  };

  const deleteMessage = async (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await supabase.from('community_channel_messages').update({ is_deleted: true }).eq('id', id);
  };

  if (loadingChannels) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div>;
  }

  if (channels.length === 0) {
    return (
      <div className="neu-raised rounded-xl p-8 text-center">
        <Hash className="w-10 h-10 text-crwn-gold/30 mx-auto mb-3" />
        <p className="text-crwn-text font-medium">No channels yet</p>
        <p className="text-sm text-crwn-text-secondary mt-1 max-w-sm mx-auto">
          {isArtistProfile
            ? 'Channels are live chat rooms for your fans. Create one and give your community somewhere to hang out.'
            : 'This artist has not opened any chat channels yet.'}
        </p>
        {isArtistProfile && (
          <button
            onClick={() => setShowCreate(true)}
            className="mt-5 px-5 py-2 rounded-full font-semibold text-sm bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors"
          >
            Create a channel
          </button>
        )}
        {showCreate && (
          <CreateChannelModal
            artistId={artistId}
            tiers={tiers}
            existingCount={channels.length}
            onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); loadChannels(); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="neu-raised rounded-xl overflow-hidden flex h-[32rem]">
      {/* Channel list */}
      <div className="w-40 md:w-52 flex-shrink-0 border-r border-crwn-elevated flex flex-col">
        <div className="px-3 py-2.5 border-b border-crwn-elevated flex items-center justify-between">
          <span className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wide">Channels</span>
          {isArtistProfile && (
            <button onClick={() => setShowCreate(true)} className="text-crwn-text-secondary hover:text-crwn-gold" aria-label="New channel">
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {channels.map((c) => {
            const locked = !canRead(c);
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${
                  activeId === c.id ? 'bg-crwn-elevated/60 text-crwn-text' : 'text-crwn-text-secondary hover:bg-crwn-elevated/40'
                }`}
              >
                {locked ? <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                  : c.artist_only_posting ? <Megaphone className="w-3.5 h-3.5 flex-shrink-0" />
                  : <Hash className="w-3.5 h-3.5 flex-shrink-0" />}
                <span className="truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-w-0 flex flex-col">
        {active && (
          <div className="px-4 py-2.5 border-b border-crwn-elevated">
            <p className="text-sm font-semibold text-crwn-text flex items-center gap-1.5">
              {active.artist_only_posting ? <Megaphone className="w-3.5 h-3.5 text-crwn-gold" /> : <Hash className="w-3.5 h-3.5 text-crwn-text-secondary" />}
              {active.name}
            </p>
            {active.description && <p className="text-xs text-crwn-text-secondary truncate">{active.description}</p>}
          </div>
        )}

        {!active ? null : !canRead(active) ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <Lock className="w-8 h-8 text-crwn-gold/40 mb-3" />
            <p className="text-crwn-text font-medium text-sm">This channel is for subscribers</p>
            <p className="text-xs text-crwn-text-secondary mt-1 max-w-xs">
              {user ? 'Subscribe to unlock the conversation.' : 'Log in and subscribe to unlock the conversation.'}
            </p>
            <Link
              href={`/${artistSlug}`}
              className="mt-4 px-4 py-2 rounded-full text-sm font-semibold bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors"
            >
              See tiers
            </Link>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-0">
              {loadingMessages ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-crwn-text-secondary" /></div>
              ) : messages.length === 0 ? (
                <p className="text-crwn-text-secondary text-sm text-center py-8">Nothing here yet. Say something.</p>
              ) : messages.map((m) => {
                const mine = m.author_id === user?.id;
                const name = m.author?.display_name || m.author?.username || 'Fan';
                return (
                  <div key={m.id} className="group flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-crwn-elevated flex-shrink-0 flex items-center justify-center text-xs text-crwn-text-secondary overflow-hidden">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-crwn-text-secondary">
                        {name}
                        <span className="text-crwn-text-secondary ml-2">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </p>
                      <p className="text-sm text-crwn-text break-words whitespace-pre-wrap">{m.body}</p>
                    </div>
                    {(mine || isArtistProfile) && (
                      <button
                        onClick={() => deleteMessage(m.id)}
                        className="opacity-0 group-hover:opacity-100 text-crwn-text-secondary hover:text-crwn-error transition-opacity"
                        aria-label="Delete message"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {canPost ? (
              <div className="border-t border-crwn-elevated">
                {sendError && <p className="px-3 pt-2 text-xs text-crwn-error">{sendError}</p>}
                <div className="p-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                    maxLength={2000}
                    placeholder={`Message #${active.name}`}
                    className="neu-inset flex-1 px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none text-sm rounded-xl"
                  />
                  <button
                    onClick={send}
                    disabled={!input.trim() || sending}
                    className="neu-button-accent p-2 rounded-xl disabled:opacity-50"
                    aria-label="Send"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 border-t border-crwn-elevated text-center text-xs text-crwn-text-secondary">
                {!user
                  ? 'Log in to join the conversation.'
                  : active.artist_only_posting
                    ? 'Only the artist posts in this channel.'
                    : 'You cannot post here.'}
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreateChannelModal
          artistId={artistId}
          tiers={tiers}
          existingCount={channels.length}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadChannels(); }}
        />
      )}
    </div>
  );
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function CreateChannelModal({ artistId, tiers, existingCount, onClose, onCreated }: {
  artistId: string;
  tiers: TierConfig[];
  existingCount: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [name, setName] = useState('');
  const [isFree, setIsFree] = useState(true);
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [artistOnly, setArtistOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('community_channels').insert({
      artist_id: artistId,
      name: trimmed,
      slug: slugify(trimmed) || `channel-${existingCount + 1}`,
      position: existingCount,
      is_free: isFree,
      allowed_tier_ids: isFree ? [] : selectedTiers,
      artist_only_posting: artistOnly,
    });
    if (err) {
      setError(err.message.includes('duplicate') ? 'You already have a channel with that name.' : 'Could not create the channel.');
      setSaving(false);
      return;
    }
    onCreated();
  };

  const toggleTier = (id: string) =>
    setSelectedTiers((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="neu-modal bg-crwn-surface border border-crwn-elevated rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-crwn-text">New channel</h3>
          <button onClick={onClose} className="text-crwn-text-secondary hover:text-crwn-text"><X className="w-5 h-5" /></button>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="general"
          className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none text-sm rounded-xl mb-1"
        />
        {name.trim() && <p className="text-[11px] text-crwn-text-secondary mb-3">#{slugify(name) || 'channel'}</p>}

        <div className="space-y-2 mb-4 mt-3">
          <button
            onClick={() => setIsFree(true)}
            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${isFree ? 'border-crwn-gold bg-crwn-elevated/60' : 'border-crwn-elevated hover:bg-crwn-elevated/40'}`}
          >
            <p className="text-sm text-crwn-text">Open to everyone</p>
            <p className="text-[11px] text-crwn-text-secondary">Anyone who visits your page can read and post.</p>
          </button>
          <button
            onClick={() => setIsFree(false)}
            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${!isFree ? 'border-crwn-gold bg-crwn-elevated/60' : 'border-crwn-elevated hover:bg-crwn-elevated/40'}`}
          >
            <p className="text-sm text-crwn-text">Subscribers only</p>
            <p className="text-[11px] text-crwn-text-secondary">
              {selectedTiers.length > 0 ? 'Only the tiers you pick below.' : 'Any active subscriber. Pick tiers below to narrow it.'}
            </p>
          </button>
        </div>

        {!isFree && tiers.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-crwn-text-secondary mb-2">Limit to tiers (optional):</p>
            <div className="flex flex-wrap gap-2">
              {tiers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTier(t.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedTiers.includes(t.id)
                      ? 'bg-crwn-gold text-black border-crwn-gold font-medium'
                      : 'border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => setArtistOnly((v) => !v)}
          className="w-full flex items-start gap-2 text-left mb-4 px-3 py-2 rounded-lg border border-crwn-elevated hover:bg-crwn-elevated/40 transition-colors"
        >
          <span className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border ${artistOnly ? 'bg-crwn-gold border-crwn-gold' : 'border-crwn-text-secondary'}`} />
          <span>
            <span className="block text-sm text-crwn-text">Announcements only</span>
            <span className="block text-[11px] text-crwn-text-secondary">Only you can post. Fans read.</span>
          </span>
        </button>

        {error && <p className="text-sm text-crwn-error mb-3">{error}</p>}

        <button
          onClick={create}
          disabled={!name.trim() || saving}
          className="neu-button-accent w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create channel
        </button>
      </div>
    </div>
  );
}
