'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Send, Trash2, Loader2, Crown } from 'lucide-react';

interface ChatMessage {
  id: string;
  user_id: string;
  body: string;
  is_deleted: boolean;
  created_at: string;
  authorName: string;
  tierRank: number;
  tierName: string | null;
}

// Tier-prioritized visibility: higher tiers get a stronger highlight + badge.
// rank 0 = free/no sub, 1..N = tiers by price ascending, 99 = artist.
function tierStyle(rank: number): { row: string; name: string; badge: string } | null {
  if (rank >= 99) return { row: 'bg-crwn-gold/15 border border-crwn-gold/30', name: 'text-crwn-gold font-bold', badge: 'bg-crwn-gold text-black' };
  if (rank >= 3) return { row: 'bg-crwn-gold/10', name: 'text-crwn-gold font-bold', badge: 'bg-crwn-gold/80 text-black' };
  if (rank === 2) return { row: 'bg-crwn-elevated/60', name: 'text-crwn-gold font-semibold', badge: 'bg-crwn-elevated text-crwn-gold' };
  if (rank === 1) return { row: '', name: 'text-crwn-gold font-medium', badge: 'bg-crwn-elevated text-crwn-text-dim' };
  return null; // free / no sub: plain
}

interface LiveChatPanelProps {
  sessionId: string;
  currentUserId: string;
  canPost: boolean;
  canModerate: boolean;
}

export function LiveChatPanel({ sessionId, currentUserId, canPost, canModerate }: LiveChatPanelProps) {
  const supabase = createBrowserSupabaseClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const nameCache = useRef<Map<string, string>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  const resolveName = useCallback(async (userId: string): Promise<string> => {
    const cached = nameCache.current.get(userId);
    if (cached) return cached;
    const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    const name = data?.display_name || 'Fan';
    nameCache.current.set(userId, name);
    return name;
  }, [supabase]);

  // Initial load (last 100 non-deleted)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('live_session_messages')
        .select('id, user_id, body, is_deleted, created_at, sender_tier_rank, sender_tier_name, author:profiles(display_name)')
        .eq('session_id', sessionId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(100);
      if (cancelled || !data) return;
      const mapped = data.map((m) => {
        const name = (m.author as unknown as { display_name: string } | null)?.display_name || 'Fan';
        nameCache.current.set(m.user_id, name);
        return { id: m.id, user_id: m.user_id, body: m.body, is_deleted: m.is_deleted, created_at: m.created_at, authorName: name, tierRank: m.sender_tier_rank ?? 0, tierName: m.sender_tier_name ?? null };
      });
      setMessages(mapped);
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId, supabase]);

  // Realtime INSERT + UPDATE (soft-delete)
  useEffect(() => {
    const channel = supabase
      .channel(`live-chat-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'live_session_messages',
        filter: `session_id=eq.${sessionId}`,
      }, async (payload) => {
        const row = payload.new as { id: string; user_id: string; body: string; is_deleted: boolean; created_at: string; sender_tier_rank?: number; sender_tier_name?: string | null };
        const authorName = await resolveName(row.user_id);
        setMessages((prev) => prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, authorName, tierRank: row.sender_tier_rank ?? 0, tierName: row.sender_tier_name ?? null }]);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'live_session_messages',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const row = payload.new as { id: string; is_deleted: boolean };
        if (row.is_deleted) setMessages((prev) => prev.filter((m) => m.id !== row.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, supabase, resolveName]);

  // Auto-scroll to newest
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/live/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, body: text }),
      });
      if (res.ok) setInput('');
    } catch {
      /* network */
    } finally {
      setSending(false);
    }
  };

  const remove = async (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId)); // optimistic
    await fetch('/api/live/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId }),
    }).catch(() => {});
  };

  return (
    <div className="flex flex-col h-full bg-crwn-card border-l border-crwn-elevated">
      <div className="px-4 py-3 border-b border-crwn-elevated">
        <h3 className="text-crwn-text font-semibold text-sm">Live Chat</h3>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
        {messages.length === 0 ? (
          <p className="text-crwn-text-dim text-sm text-center py-6">Be the first to say something.</p>
        ) : messages.map((m) => {
          const style = tierStyle(m.tierRank);
          return (
            <div key={m.id} className={`group flex items-start gap-2 text-sm ${style?.row ? `${style.row} rounded-lg px-2 py-1.5` : ''}`}>
              <div className="flex-1 min-w-0">
                {style?.badge && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded mr-1.5 align-middle ${style.badge}`}>
                    {m.tierRank >= 99 && <Crown className="w-2.5 h-2.5" />}
                    {m.tierRank >= 99 ? 'Artist' : m.tierName}
                  </span>
                )}
                <span className={style?.name || 'text-crwn-text-dim font-medium'}>{m.authorName}</span>{' '}
                <span className="text-crwn-text break-words">{m.body}</span>
              </div>
              {(canModerate || m.user_id === currentUserId) && (
                <button
                  onClick={() => remove(m.id)}
                  className="opacity-0 group-hover:opacity-100 text-crwn-text-dim hover:text-crwn-error transition-opacity flex-shrink-0"
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
        <div className="p-3 border-t border-crwn-elevated flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            maxLength={500}
            placeholder="Say something..."
            className="neu-inset flex-1 px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none text-sm"
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
      ) : (
        <div className="p-3 border-t border-crwn-elevated text-center text-crwn-text-dim text-xs">
          Subscribe to join the chat
        </div>
      )}
    </div>
  );
}
