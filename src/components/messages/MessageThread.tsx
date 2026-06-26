'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Send, Loader2, ArrowLeft, BellOff, Bell, Crown } from 'lucide-react';

interface DMMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_is_artist: boolean;
  body: string;
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
  const [loading, setLoading] = useState(!!conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const payload = conversationId
        ? { conversationId, body: text }
        : { artistId: pendingArtist?.id, body: text };
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setInput('');
        // Optimistically show the just-sent message for pending threads
        // (realtime is only wired once a conversationId exists).
        if (!conversationId && data.message) {
          setMessages((prev) => [...prev, data.message]);
          if (data.conversationId) onCreated?.(data.conversationId);
        }
        onActivity?.();
      }
    } catch {
      /* network */
    } finally {
      setSending(false);
    }
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
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="p-3 border-t border-crwn-elevated flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          maxLength={2000}
          placeholder="Type a message..."
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
  );
}
