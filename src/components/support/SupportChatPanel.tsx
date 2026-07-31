'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, MessageCircle, Send, User as UserIcon, Crown, Sparkles } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'human';
  body: string;
  created_at: string;
}

interface ChatState {
  conversationId: string | null;
  status: string;
  messages: ChatMessage[];
}

// The /support live chat. Answers come from the CRWN AI assistant first; "Talk to a
// human" (or the AI flagging itself out of its depth) escalates to the founder, whose
// replies land in this same thread. Reads ride /api/support/chat (service-role behind
// session auth) with a light poll, plus realtime on support_messages once the
// migration's publication is live. If the API reports the table missing, the panel
// tells the user to use the form below instead of dying.
export function SupportChatPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<ChatState>({ conversationId: null, status: 'ai', messages: [] });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = chat.conversationId;

  const applyResponse = useCallback((data: { unavailable?: boolean; conversation?: { id: string; status: string } | null; messages?: ChatMessage[] }) => {
    if (data.unavailable) {
      setUnavailable(true);
      return;
    }
    if (data.conversation) {
      setChat({ conversationId: data.conversation.id, status: data.conversation.status, messages: data.messages || [] });
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const id = conversationIdRef.current;
      const res = await fetch(`/api/support/chat${id ? `?conversationId=${id}` : ''}`);
      if (!res.ok) return;
      applyResponse(await res.json());
    } catch {
      // Network blips are fine; the next poll retries.
    }
  }, [applyResponse]);

  // Load history when the panel opens.
  useEffect(() => {
    if (!open || !user) return;
    setLoadingHistory(true);
    refresh().finally(() => setLoadingHistory(false));
  }, [open, user, refresh]);

  // Poll while open so human replies arrive even without realtime.
  useEffect(() => {
    if (!open || !user || unavailable) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [open, user, unavailable, refresh]);

  // Realtime: instant delivery once support_messages is in the publication.
  useEffect(() => {
    if (!open || !user || !chat.conversationId) return;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`support-${chat.conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${chat.conversationId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setChat((prev) =>
            prev.messages.some((m) => m.id === msg.id) ? prev : { ...prev, messages: [...prev.messages, msg] }
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, user, chat.conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages.length, open]);

  const post = async (payload: Record<string, unknown>) => {
    setSending(true);
    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: chat.conversationId || undefined, ...payload }),
      });
      if (res.ok) applyResponse(await res.json());
    } catch {
      // Leave the draft in place so the user can retry.
      return;
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    // Optimistic echo so the send feels instant.
    setChat((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        { id: `local-${Date.now()}`, sender: 'user', body: text, created_at: new Date().toISOString() },
      ],
    }));
    await post({ action: 'send', message: text });
  };

  const humanRequested = chat.status === 'human_requested' || chat.status === 'human_active';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-4 bg-crwn-surface hover:bg-crwn-elevated rounded-xl p-5 text-left transition-colors"
      >
        <div className="w-11 h-11 rounded-full bg-crwn-gold/15 flex items-center justify-center shrink-0">
          <MessageCircle className="w-5 h-5 text-crwn-gold" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-crwn-text">Chat with CRWN</p>
          <p className="text-sm text-crwn-text-secondary">
            Answers in seconds. A real person steps in when you need one.
          </p>
        </div>
      </button>
    );
  }

  if (!authLoading && !user) {
    return (
      <div className="bg-crwn-surface rounded-xl p-6 text-center">
        <MessageCircle className="w-8 h-8 text-crwn-gold mx-auto mb-3" />
        <p className="text-crwn-text font-medium mb-1">Log in to chat</p>
        <p className="text-sm text-crwn-text-secondary mb-4">
          Chat is tied to your account so we can actually fix things. Not logged in? The form below works too.
        </p>
        <Link href="/login" className="inline-block bg-crwn-gold text-black font-semibold px-6 py-2.5 rounded-full">
          Log in
        </Link>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="bg-crwn-surface rounded-xl p-6">
        <p className="text-crwn-text font-medium mb-1">Chat is not available right now</p>
        <p className="text-sm text-crwn-text-secondary">
          Use the form below and we will get back to you by email.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-crwn-surface rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-crwn-elevated">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-crwn-gold" />
          <p className="text-sm font-semibold text-crwn-text">CRWN Support</p>
        </div>
        {!humanRequested ? (
          <button
            onClick={() => post({ action: 'escalate' })}
            disabled={sending}
            className="text-xs text-crwn-text-secondary hover:text-crwn-gold transition-colors disabled:opacity-50"
          >
            Talk to a human
          </button>
        ) : (
          <span className="text-xs text-crwn-gold">A person has been notified</span>
        )}
      </div>

      <div className="h-80 overflow-y-auto p-4 space-y-3">
        {loadingHistory ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-crwn-gold animate-spin" />
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <Sparkles className="w-6 h-6 text-crwn-gold mb-2" />
            <p className="text-sm text-crwn-text-secondary">
              Ask anything about CRWN: payouts, tiers, uploads, your page. If I cannot answer it, a real person will.
            </p>
          </div>
        ) : (
          chat.messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.sender !== 'user' && (
                <div className="w-7 h-7 rounded-full bg-crwn-gold/15 flex items-center justify-center shrink-0 mt-0.5">
                  {m.sender === 'human' ? (
                    <Crown className="w-3.5 h-3.5 text-crwn-gold" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-crwn-gold" />
                  )}
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                  m.sender === 'user' ? 'bg-crwn-gold text-black' : 'bg-crwn-elevated text-crwn-text'
                }`}
              >
                {m.sender === 'human' && (
                  <p className="text-[10px] font-semibold text-crwn-gold mb-0.5">CRWN team</p>
                )}
                {m.body}
              </div>
              {m.sender === 'user' && (
                <div className="w-7 h-7 rounded-full bg-crwn-elevated flex items-center justify-center shrink-0 mt-0.5">
                  <UserIcon className="w-3.5 h-3.5 text-crwn-text-secondary" />
                </div>
              )}
            </div>
          ))
        )}
        {sending && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-crwn-gold/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-crwn-gold" />
            </div>
            <div className="bg-crwn-elevated rounded-2xl px-3.5 py-2.5">
              <Loader2 className="w-4 h-4 text-crwn-text-secondary animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 p-3 border-t border-crwn-elevated">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={humanRequested ? 'Reply to the CRWN team...' : 'Ask about anything on CRWN...'}
          className="flex-1 bg-crwn-elevated rounded-full px-4 py-2.5 text-sm text-crwn-text placeholder:text-crwn-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-crwn-gold"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="w-10 h-10 rounded-full bg-crwn-gold text-black flex items-center justify-center disabled:opacity-40 shrink-0"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
