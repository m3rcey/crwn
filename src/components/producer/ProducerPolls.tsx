'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, BarChart3, X, Check } from 'lucide-react';
import type { SessionPollWithTally } from '@/types/producer';

interface Props {
  sessionId: string;
  canManage: boolean; // artist owner: create + close. fan: vote only.
}

// In-session polls. The artist (canManage) creates and closes them; fans vote once.
// Advisory only, so the UI never implies the result binds the artist. Polls the
// route (no realtime) on a short interval while mounted.
export function ProducerPolls({ sessionId, canManage }: Props) {
  const [polls, setPolls] = useState<SessionPollWithTally[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/producer/polls?sessionId=${sessionId}`);
      const data = await res.json();
      if (data.polls) setPolls(data.polls);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [load]);

  const create = async () => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) return;
    setBusy(true);
    try {
      const res = await fetch('/api/producer/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, question: question.trim(), options: opts }),
      });
      const data = await res.json();
      if (data.poll) {
        setPolls((prev) => [data.poll, ...prev]);
        setQuestion(''); setOptions(['', '']); setCreating(false);
      }
    } finally { setBusy(false); }
  };

  const close = async (pollId: string) => {
    setBusy(true);
    try {
      await fetch('/api/producer/polls', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pollId }) });
      setPolls((prev) => prev.map((p) => (p.id === pollId ? { ...p, status: 'closed' } : p)));
    } finally { setBusy(false); }
  };

  const vote = async (pollId: string, optionId: string) => {
    setVoting(pollId);
    try {
      const res = await fetch('/api/producer/polls/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId, optionId }),
      });
      if (res.ok) {
        setPolls((prev) => prev.map((p) => {
          if (p.id !== pollId) return p;
          const tally = { ...p.tally };
          if (p.myVote && p.myVote !== optionId) tally[p.myVote] = Math.max(0, (tally[p.myVote] || 1) - 1);
          if (p.myVote !== optionId) tally[optionId] = (tally[optionId] || 0) + 1;
          const totalVotes = Object.values(tally).reduce((s, n) => s + n, 0);
          return { ...p, tally, totalVotes, myVote: optionId };
        }));
      }
    } finally { setVoting(null); }
  };

  if (loading) return <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 text-crwn-gold animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-crwn-text font-semibold flex items-center gap-2 text-sm"><BarChart3 className="w-4 h-4 text-crwn-gold" /> Polls</h3>
        {canManage && !creating && (
          <button onClick={() => setCreating(true)} className="neu-button px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> New</button>
        )}
      </div>

      {canManage && creating && (
        <div className="rounded-xl border border-crwn-elevated/60 p-3 space-y-2">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask the room…" className="neu-inset w-full px-3 py-2 text-sm text-crwn-text placeholder-crwn-text-secondary focus:outline-none" />
          {options.map((o, i) => (
            <input key={i} value={o} onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} className="neu-inset w-full px-3 py-1.5 text-sm text-crwn-text placeholder-crwn-text-secondary focus:outline-none" />
          ))}
          <div className="flex items-center gap-2">
            {options.length < 8 && <button onClick={() => setOptions((p) => [...p, ''])} className="text-crwn-gold text-xs font-semibold">+ Option</button>}
            <button onClick={create} disabled={busy} className="neu-button-accent px-3 py-1.5 rounded-full text-xs font-semibold ml-auto disabled:opacity-50">{busy ? '…' : 'Launch'}</button>
            <button onClick={() => setCreating(false)} className="text-crwn-text-secondary p-1"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {polls.length === 0 && !creating && <p className="text-crwn-text-secondary text-xs">No polls yet.</p>}

      {polls.map((p) => (
        <div key={p.id} className="rounded-xl border border-crwn-elevated/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-crwn-text text-sm font-medium">{p.question}</p>
            {p.status === 'open' ? (
              canManage && <button onClick={() => close(p.id)} disabled={busy} className="text-crwn-text-secondary text-xs shrink-0">Close</button>
            ) : (
              <span className="text-crwn-text-secondary text-[11px] shrink-0">Closed</span>
            )}
          </div>
          <div className="mt-2 space-y-1.5">
            {p.options.map((o) => {
              const count = p.tally[o.id] || 0;
              const pct = p.totalVotes > 0 ? Math.round((count / p.totalVotes) * 100) : 0;
              const mine = p.myVote === o.id;
              const canVote = !canManage && p.status === 'open';
              return (
                <button
                  key={o.id}
                  onClick={() => canVote && vote(p.id, o.id)}
                  disabled={!canVote || voting === p.id}
                  className={`relative w-full text-left rounded-lg overflow-hidden border ${mine ? 'border-crwn-gold' : 'border-crwn-elevated/60'} ${canVote ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span className="absolute inset-y-0 left-0 bg-crwn-gold/15" style={{ width: `${pct}%` }} />
                  <span className="relative flex items-center justify-between px-3 py-1.5 text-sm">
                    <span className="text-crwn-text flex items-center gap-1.5">{mine && <Check className="w-3.5 h-3.5 text-crwn-gold" />}{o.label}</span>
                    <span className="text-crwn-text-secondary text-xs">{pct}%</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-crwn-text-secondary text-[11px] mt-1.5">{p.totalVotes} vote{p.totalVotes === 1 ? '' : 's'}</p>
        </div>
      ))}
    </div>
  );
}
