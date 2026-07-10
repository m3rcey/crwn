'use client';

import { useEffect, useState } from 'react';
import { Radio, Check } from 'lucide-react';

interface LiveQuest {
  id: string;
  artistId: string;
  title: string;
  subtitle: string | null;
  whyItMatters: string | null;
}

// A fixed overlay pill shown on the live page when the artist is running a Live
// Quest. Additive — it never touches the LiveKit room. Fans get a Participate
// button that records a live_join event (which can complete their live quests).
export function LiveQuestBar({
  sessionId,
  isOwner,
}: {
  sessionId: string;
  isOwner: boolean;
}) {
  const [quest, setQuest] = useState<LiveQuest | null>(null);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/quests/live?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled) setQuest(json.liveQuest);
      } catch {
        /* silent — engine may be dark */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!quest) return null;

  async function participate() {
    if (busy || joined) return;
    setBusy(true);
    try {
      await fetch('/api/quests/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId: quest!.artistId, eventType: 'live_join', refKind: 'live', refId: sessionId }),
      });
      setJoined(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-[92vw]">
      <div className="flex items-center gap-3 rounded-full border border-crwn-gold/40 bg-black/85 backdrop-blur px-4 py-2 shadow-lg">
        <span className="flex items-center gap-1.5 text-crwn-gold shrink-0">
          <Radio className="w-4 h-4 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Live Quest</span>
        </span>
        <span className="text-sm text-crwn-text truncate">{quest.title}</span>
        {!isOwner &&
          (joined ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400 shrink-0">
              <Check className="w-3.5 h-3.5" /> In
            </span>
          ) : (
            <button
              onClick={participate}
              disabled={busy}
              className="shrink-0 text-xs font-semibold text-black bg-crwn-gold rounded-full px-3 py-1 disabled:opacity-50"
            >
              Participate
            </button>
          ))}
      </div>
    </div>
  );
}
