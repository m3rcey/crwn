'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Send, Loader2, ArrowLeft, BellOff, Bell, Crown, Megaphone, Lock } from 'lucide-react';
import { VoiceRecorderButton } from './VoiceRecorderButton';

interface DMMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_is_artist: boolean;
  body: string;
  audio_url?: string | null;
  audio_duration_ms?: number | null;
  is_broadcast?: boolean;
  replies_disabled?: boolean;
  is_deleted: boolean;
  created_at: string;
}

interface MessageThreadProps {
  // null when starting a brand-new thread (use pendingArtist instead)
  conversationId: string | null;
  currentUserId: string;
  // viewer's role in THIS conversation, from the list/gate
  viewerIsArtist: boolean;
  // for a not-yet-created fan->artist thread
  pendingArtist?: { id: string; name: string };
  onBack?: () => void;
  onActivity?: () => void; // notify parent to refresh the list (unread/preview)
  onCreated?: (conversationId: string) => void; // fired when a pending thread is created
}

export function MessageThread({ conversationId, currentUserId, viewerIsArtist, pendingArtist, onBack, onActivity, onCreated }: MessageThreadProps) {
  const supabase = createBrowserSupabaseClient();
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [otherName, setOtherName] = useState(pendingArtist?.name || '');
  const [tierName, setTierName] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // `dm_messages.audio_url` is a path into the private `audio` bucket, never a
  // playable link. Resolve it to a short-lived signed url here rather than in the
  // thread route, because realtime hands us rows straight from Postgres and they
  // never pass through an API route at all.
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});

  // Replies are off while the NEWEST message is an announce-only broadcast.
  // Derived from `messages` (which realtime keeps current) rather than held in
  // state, so the artist's next repliable message reopens the composer live.
  const newest = messages.length > 0 ? messages[messages.length - 1] : null;
  const repliesLocked = !viewerIsArtist && !!newest?.sender_is_artist && !!newest?.replies_disabled;

  // Initial load (also clears unread server-side). Skipped for pending threads.
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/messages/${conversationId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || data.error) return;
        setMessages(data.messages || []);
        setOtherName(data.otherName || '');
        setTierName(data.tierName || null);
        setMuted(!!data.muted);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conversationId]);

  // A different thread means different signatures; forget what we asked for.
  // Declared BEFORE the signer so that on mount it cannot wipe the ref the
  // signer just populated -- effects fire in declaration order.
  const requestedVoiceIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    requestedVoiceIds.current = new Set();
    setVoiceUrls({});
  }, [conversationId]);

  // Sign any voice note we have not asked about yet, however it arrived.
  //
  // Keyed off that "already requested" ref, not off `voiceUrls`. A message whose
  // signing fails would otherwise stay unsigned forever while every empty
  // response minted a fresh `voiceUrls` object, re-firing this effect in a loop.
  // One attempt per message id; a failure leaves the player empty, not spinning.
  useEffect(() => {
    if (!conversationId) return;
    const unsigned = messages
      .filter((m) => m.audio_url && !requestedVoiceIds.current.has(m.id))
      .map((m) => m.id);
    if (unsigned.length === 0) return;
    unsigned.forEach((id) => requestedVoiceIds.current.add(id));

    let cancelled = false;
    fetch(`/api/messages/${conversationId}/voice-urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unsigned }),
    })
      .then((r) => (r.ok ? r.json() : { urls: {} }))
      .then((data) => {
        if (cancelled || !data.urls || Object.keys(data.urls).length === 0) return;
        setVoiceUrls((prev) => ({ ...prev, ...data.urls }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [messages, conversationId]);

  // Realtime: append new messages in this conversation.
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`dm-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'dm_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const row = payload.new as DMMessage;
        setMessages((prev) => prev.some((m) => m.id === row.id) ? prev : [...prev, row]);
        // Clear unread for incoming messages from the other party.
        if (row.sender_id !== currentUserId) {
          fetch(`/api/messages/${conversationId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'read' }),
          }).catch(() => {});
          onActivity?.();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, supabase, currentUserId, onActivity]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Shared sender for both text and voice. `extra` carries audioUrl/audioDurationMs
  // for a voice note (no typed body needed).
  const postMessage = async (extra: Record<string, unknown>) => {
    setSending(true);
    setSendError(null);
    try {
      const target = conversationId ? { conversationId } : { artistId: pendingArtist?.id };
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setInput('');
        // Optimistically show the just-sent message for pending threads
        // (realtime is only wired once a conversationId exists).
        if (!conversationId && data.message) {
          setMessages((prev) => [...prev, data.message]);
          if (data.conversationId) onCreated?.(data.conversationId);
        }
        onActivity?.();
      } else {
        // A rejected send used to vanish silently, leaving the fan's text sitting
        // in the box looking sent. Say what happened.
        setSendError(
          data.reason === 'replies_disabled'
            ? 'Replies are off for this announcement.'
            : data.error === 'Slow down'
              ? 'You are sending too fast. Wait a moment.'
              : 'Message not sent. Try again.'
        );
      }
    } catch {
      setSendError('Message not sent. Check your connection.');
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    await postMessage({ body: text });
  };

  const sendVoice = async (audioUrl: string, durationMs: number) => {
    if (sending) return;
    await postMessage({ audioUrl, audioDurationMs: durationMs });
  };

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    await fetch(`/api/messages/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: next ? 'mute' : 'unmute' }),
    }).catch(() => setMuted(!next));
  };

  return (
    <div className="flex flex-col h-full bg-crwn-card">
      {/* Header */}
      <div className="px-4 py-3 border-b border-crwn-elevated flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="md:hidden text-crwn-text-secondary hover:text-crwn-gold" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-crwn-text font-semibold text-sm truncate flex items-center gap-1.5">
            {viewerIsArtist && tierName && <Crown className="w-3.5 h-3.5 text-crwn-gold flex-shrink-0" />}
            {otherName || '...'}
          </p>
          {viewerIsArtist && tierName && (
            <p className="text-xs text-crwn-gold">{tierName}</p>
          )}
        </div>
        {viewerIsArtist && (
          <button
            onClick={toggleMute}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
              muted ? 'text-crwn-error' : 'text-crwn-text-secondary hover:text-crwn-gold'
            }`}
            title={muted ? 'Muted (no notifications from this fan)' : 'Mute this fan'}
          >
            {muted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
            {muted ? 'Muted' : 'Mute'}
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2 min-h-0">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-crwn-text-dim" /></div>
        ) : messages.length === 0 ? (
          <p className="text-crwn-text-dim text-sm text-center py-8">No messages yet. Say hey.</p>
        ) : messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm break-words ${
                mine ? 'bg-crwn-gold text-black rounded-br-sm' : 'bg-crwn-elevated text-crwn-text rounded-bl-sm'
              }`}>
                {m.is_broadcast && (
                  <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide mb-1 ${
                    mine ? 'text-black/60' : 'text-crwn-gold'
                  }`}>
                    <Megaphone className="w-3 h-3" /> Announcement
                  </span>
                )}
                {m.audio_url ? (
                  <span className="flex flex-col gap-1">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio controls src={voiceUrls[m.id] || undefined} className="max-w-[220px]" />
                    {m.audio_duration_ms ? (
                      <span className={`text-[10px] ${mine ? 'text-black/60' : 'text-crwn-text-secondary'}`}>
                        🎤 {Math.round(m.audio_duration_ms / 1000)}s
                      </span>
                    ) : null}
                  </span>
                ) : (
                  m.body
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer — replaced by a notice while the artist has replies switched off. */}
      {repliesLocked ? (
        <div className="p-3 border-t border-crwn-elevated flex items-center justify-center gap-2 text-crwn-text-dim text-xs">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
          Replies are off for this announcement.
        </div>
      ) : (
        <div className="border-t border-crwn-elevated">
          {sendError && (
            <p className="px-3 pt-2 text-xs text-crwn-error">{sendError}</p>
          )}
          <div className="p-3 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              maxLength={2000}
              placeholder="Type a message..."
              className="neu-inset flex-1 px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none text-sm rounded-xl"
            />
            {/* Voice note: shown when there's nothing typed; sending swaps to text send. */}
            {input.trim() ? (
              <button
                onClick={send}
                disabled={sending}
                className="neu-button-accent p-2 rounded-xl disabled:opacity-50"
                aria-label="Send"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            ) : (
              <VoiceRecorderButton onRecorded={sendVoice} disabled={sending} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
