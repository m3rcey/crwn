'use client';

import { useCallback, useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { MessageThread } from './MessageThread';
import { MessageSquare, Megaphone, Crown, X, Loader2, Send } from 'lucide-react';

interface ConvSummary {
  id: string;
  role: 'fan' | 'artist';
  otherName: string;
  otherSlug: string | null;
  unread: number;
  lastPreview: string | null;
  lastMessageAt: string | null;
  lastSenderIsArtist: boolean;
  muted: boolean;
  tierName: string | null;
}

interface MessagesInboxProps {
  currentUserId: string;
  initialArtistSlug?: string; // deep-link: start/open a thread with this artist
}

export function MessagesInbox({ currentUserId, initialArtistSlug }: MessagesInboxProps) {
  const supabase = createBrowserSupabaseClient();
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [isArtist, setIsArtist] = useState(false);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showBroadcast, setShowBroadcast] = useState(false);

  const refreshList = useCallback(async () => {
    const res = await fetch('/api/messages');
    const data = await res.json().catch(() => ({}));
    if (data.conversations) setConversations(data.conversations);
    if (typeof data.isArtist === 'boolean') setIsArtist(data.isArtist);
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/messages');
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      setConversations(data.conversations || []);
      setIsArtist(!!data.isArtist);

      if (data.isArtist) {
        const { data: ap } = await supabase
          .from('artist_profiles')
          .select('id')
          .eq('user_id', currentUserId)
          .maybeSingle();
        if (ap?.id) {
          setArtistId(ap.id);
          const { data: t } = await supabase
            .from('subscription_tiers')
            .select('id, name')
            .eq('artist_id', ap.id)
            .eq('is_active', true)
            .order('price', { ascending: true });
          setTiers(t || []);
        }
      }

      // Deep-link: open or start a thread with a specific artist.
      if (initialArtistSlug) {
        const g = await fetch(`/api/messages?slug=${encodeURIComponent(initialArtistSlug)}`).then((r) => r.json()).catch(() => null);
        if (g?.canMessage) {
          if (g.conversationId) {
            setSelectedId(g.conversationId);
          } else {
            setPending({ id: g.artistId, name: g.artistName });
          }
          setMobileThread(true);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentUserId, initialArtistSlug, supabase]);

  const selectConversation = (id: string) => {
    setPending(null);
    setSelectedId(id);
    setMobileThread(true);
    // optimistic unread clear
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, unread: 0 } : c));
  };

  const selected = conversations.find((c) => c.id === selectedId);
  const totalUnread = conversations.reduce((n, c) => n + (c.unread || 0), 0);

  return (
    <div className="flex h-[calc(100vh-8rem)] md:h-[calc(100vh-10rem)] border border-crwn-elevated rounded-xl overflow-hidden bg-crwn-card">
      {/* List */}
      <div className={`w-full md:w-80 md:flex-shrink-0 border-r border-crwn-elevated flex flex-col ${mobileThread ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-4 py-3 border-b border-crwn-elevated flex items-center justify-between">
          <h2 className="font-semibold text-crwn-text flex items-center gap-2">
            Messages
            {totalUnread > 0 && (
              <span className="text-xs bg-crwn-gold text-black font-bold rounded-full px-1.5 py-0.5">{totalUnread}</span>
            )}
          </h2>
          {isArtist && artistId && (
            <button
              onClick={() => setShowBroadcast(true)}
              className="flex items-center gap-1 text-xs text-crwn-gold hover:underline"
              title="Send a message to all your subscribers"
            >
              <Megaphone className="w-3.5 h-3.5" /> Broadcast
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-crwn-text-dim" /></div>
          ) : conversations.length === 0 && !pending ? (
            <div className="px-4 py-10 text-center text-crwn-text-dim text-sm">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No conversations yet.
            </div>
          ) : (
            <>
              {pending && (
                <button
                  onClick={() => setMobileThread(true)}
                  className="w-full text-left px-4 py-3 border-b border-crwn-elevated bg-crwn-elevated/40"
                >
                  <p className="text-sm font-medium text-crwn-text">{pending.name}</p>
                  <p className="text-xs text-crwn-text-dim">New message</p>
                </button>
              )}
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={`w-full text-left px-4 py-3 border-b border-crwn-elevated hover:bg-crwn-elevated/40 transition-colors ${
                    selectedId === c.id ? 'bg-crwn-elevated/60' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-crwn-text truncate flex items-center gap-1.5">
                      {c.role === 'artist' && c.tierName && <Crown className="w-3 h-3 text-crwn-gold flex-shrink-0" />}
                      {c.otherName}
                    </p>
                    {c.unread > 0 && (
                      <span className="text-[10px] bg-crwn-gold text-black font-bold rounded-full px-1.5 py-0.5 flex-shrink-0">{c.unread}</span>
                    )}
                  </div>
                  <p className="text-xs text-crwn-text-dim truncate mt-0.5">
                    {c.lastSenderIsArtist && c.role === 'artist' ? 'You: ' : ''}{c.lastPreview || 'No messages yet'}
                  </p>
                  {c.role === 'artist' && c.tierName && (
                    <p className="text-[10px] text-crwn-gold mt-0.5">{c.tierName}{c.muted ? ' · muted' : ''}</p>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Thread */}
      <div className={`flex-1 min-w-0 ${mobileThread ? 'flex' : 'hidden md:flex'} flex-col`}>
        {selectedId && selected ? (
          <MessageThread
            key={selectedId}
            conversationId={selectedId}
            currentUserId={currentUserId}
            viewerIsArtist={selected.role === 'artist'}
            onBack={() => setMobileThread(false)}
            onActivity={refreshList}
          />
        ) : pending ? (
          <MessageThread
            key="pending"
            conversationId={null}
            currentUserId={currentUserId}
            viewerIsArtist={false}
            pendingArtist={pending}
            onBack={() => setMobileThread(false)}
            onActivity={refreshList}
            onCreated={(id) => { setPending(null); setSelectedId(id); refreshList(); }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-crwn-text-dim text-sm">
            Select a conversation
          </div>
        )}
      </div>

      {/* Broadcast modal */}
      {showBroadcast && artistId && (
        <BroadcastModal
          artistId={artistId}
          tiers={tiers}
          onClose={() => setShowBroadcast(false)}
          onSent={() => { setShowBroadcast(false); refreshList(); }}
        />
      )}
    </div>
  );
}

function BroadcastModal({ artistId, tiers, onClose, onSent }: {
  artistId: string;
  tiers: { id: string; name: string }[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState('');
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const toggleTier = (id: string) =>
    setSelectedTiers((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/messages/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, body: text, tierIds: selectedTiers }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult(`Sent to ${data.sent} subscriber${data.sent === 1 ? '' : 's'}.`);
        setTimeout(onSent, 1200);
      } else {
        setResult(data.error || 'Failed to send.');
      }
    } catch {
      setResult('Failed to send.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="neu-modal bg-crwn-card border border-crwn-elevated rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-crwn-text flex items-center gap-2"><Megaphone className="w-4 h-4 text-crwn-gold" /> Broadcast</h3>
          <button onClick={onClose} className="text-crwn-text-secondary hover:text-crwn-text"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-crwn-text-dim mb-3">
          Sends one message to every active subscriber. It lands in each fan&apos;s DMs with you.
        </p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Write your announcement..."
          className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none text-sm rounded-xl mb-3"
        />
        {tiers.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-crwn-text-secondary mb-2">Send to (leave empty for all tiers):</p>
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
        {result && <p className="text-sm text-crwn-gold mb-3">{result}</p>}
        <button
          onClick={send}
          disabled={!body.trim() || sending}
          className="neu-button-accent w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send broadcast
        </button>
      </div>
    </div>
  );
}
