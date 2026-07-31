'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, RefreshCw, Send, X, Sparkles, User as UserIcon, Crown } from 'lucide-react';

interface Conversation {
  id: string;
  user_id: string;
  status: string;
  last_message_at: string;
  last_message_preview: string | null;
  founder_unread: number;
  user_name: string;
  user_email: string | null;
  user_role: string;
}

interface Message {
  id: string;
  sender: 'user' | 'ai' | 'human';
  body: string;
  created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  human_requested: { label: 'Needs you', className: 'bg-crwn-gold/15 text-crwn-gold' },
  human_active: { label: 'With you', className: 'bg-green-500/15 text-green-400' },
  ai: { label: 'AI handled', className: 'bg-crwn-elevated text-crwn-text-secondary' },
  closed: { label: 'Closed', className: 'bg-crwn-elevated text-crwn-text-secondary/60' },
};

// The founder's side of the support chat. Escalated conversations sort first; opening
// one clears its unread count; a reply flips it to human_active and emails the user.
// Polls every 6 seconds while a thread is open (the admin console has no realtime).
export default function SupportChatView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/support-chat');
      const data = await res.json();
      if (data.unavailable) setUnavailable(true);
      setConversations(data.conversations || []);
    } catch {
      // Refresh button retries.
    }
    setLoading(false);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support-chat?conversationId=${id}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      // Poll retries.
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!activeId) return;
    setThreadLoading(true);
    loadThread(activeId).finally(() => setThreadLoading(false));
    const interval = setInterval(() => loadThread(activeId), 6000);
    return () => clearInterval(interval);
  }, [activeId, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages.length]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    setReply('');
    await fetch('/api/admin/support-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: activeId, action: 'reply', body: text }),
    });
    await loadThread(activeId);
    await loadList();
    setSending(false);
  };

  const closeThread = async (id: string) => {
    await fetch('/api/admin/support-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: id, action: 'close' }),
    });
    setActiveId(null);
    await loadList();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="max-w-2xl">
        <p className="text-crwn-text font-medium mb-1">Support chat tables are missing</p>
        <p className="text-sm text-crwn-text-secondary">
          Run supabase/schema-phase2-support-chat.sql in the Supabase SQL editor. The /support page falls back to the
          contact form until then.
        </p>
      </div>
    );
  }

  const active = conversations.find((c) => c.id === activeId) || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      {/* Conversation list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-crwn-text">Conversations</p>
          <button onClick={loadList} className="p-1.5 text-crwn-text-secondary hover:text-crwn-text" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {conversations.length === 0 ? (
          <div className="bg-crwn-surface rounded-xl p-6 text-center">
            <MessageCircle className="w-6 h-6 text-crwn-text-secondary mx-auto mb-2" />
            <p className="text-sm text-crwn-text-secondary">No support chats yet.</p>
          </div>
        ) : (
          conversations.map((c) => {
            const badge = STATUS_LABEL[c.status] ?? STATUS_LABEL.ai;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left bg-crwn-surface rounded-xl p-3.5 transition-colors hover:bg-crwn-elevated ${
                  activeId === c.id ? 'ring-1 ring-crwn-gold/50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-crwn-text truncate">
                    {c.user_name}
                    <span className="text-crwn-text-secondary font-normal"> · {c.user_role}</span>
                  </p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${badge.className}`}>{badge.label}</span>
                </div>
                <p className="text-xs text-crwn-text-secondary truncate">
                  {c.founder_unread > 0 && <span className="text-crwn-gold font-semibold">{c.founder_unread} new · </span>}
                  {c.last_message_preview || 'No messages'}
                </p>
              </button>
            );
          })
        )}
      </div>

      {/* Thread */}
      <div className="bg-crwn-surface rounded-xl overflow-hidden flex flex-col min-h-[420px]">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-sm text-crwn-text-secondary">
            Pick a conversation
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-crwn-elevated">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-crwn-text truncate">{active.user_name}</p>
                <p className="text-xs text-crwn-text-secondary truncate">{active.user_email || 'no email'}</p>
              </div>
              {active.status !== 'closed' && (
                <button
                  onClick={() => closeThread(active.id)}
                  className="flex items-center gap-1 text-xs text-crwn-text-secondary hover:text-crwn-text px-2 py-1"
                >
                  <X className="w-3.5 h-3.5" /> Close thread
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[50vh]">
              {threadLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-crwn-gold animate-spin" />
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex gap-2 ${m.sender === 'human' ? 'justify-end' : 'justify-start'}`}>
                    {m.sender !== 'human' && (
                      <div className="w-7 h-7 rounded-full bg-crwn-elevated flex items-center justify-center shrink-0 mt-0.5">
                        {m.sender === 'ai' ? (
                          <Sparkles className="w-3.5 h-3.5 text-crwn-text-secondary" />
                        ) : (
                          <UserIcon className="w-3.5 h-3.5 text-crwn-text-secondary" />
                        )}
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                        m.sender === 'human' ? 'bg-crwn-gold text-black' : 'bg-crwn-elevated text-crwn-text'
                      }`}
                    >
                      {m.body}
                    </div>
                    {m.sender === 'human' && (
                      <div className="w-7 h-7 rounded-full bg-crwn-gold/15 flex items-center justify-center shrink-0 mt-0.5">
                        <Crown className="w-3.5 h-3.5 text-crwn-gold" />
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <div className="flex items-center gap-2 p-3 border-t border-crwn-elevated">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendReply();
                  }
                }}
                placeholder="Reply as CRWN..."
                className="flex-1 bg-crwn-elevated rounded-full px-4 py-2.5 text-sm text-crwn-text placeholder:text-crwn-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-crwn-gold"
              />
              <button
                onClick={sendReply}
                disabled={sending || !reply.trim()}
                className="w-10 h-10 rounded-full bg-crwn-gold text-black flex items-center justify-center disabled:opacity-40 shrink-0"
                aria-label="Send reply"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
