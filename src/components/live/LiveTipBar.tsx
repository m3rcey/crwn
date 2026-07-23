'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { OptionSelect } from '@/components/ui/OptionSelect';
import {
  TIP_PRESETS_CENTS,
  MIN_TIP_CENTS,
  MAX_TIP_CENTS,
  MAX_TIP_MESSAGE_LEN,
  activeGoal,
  goalPercent,
  formatCents,
} from '@/lib/live/tips';
import type { LiveGoal } from '@/types/live';
import { Loader2, Trophy, X, Heart } from 'lucide-react';

interface TipFeedItem {
  id: string;
  name: string;
  amount: number;
  message: string | null;
  paidAt: string | null;
}

interface TipBoard {
  enabled: boolean;
  goals: LiveGoal[];
  totalCents: number;
  tips: TipFeedItem[];
  leaderboard: { fanId: string; name: string; amount: number }[];
}

const EMPTY: TipBoard = { enabled: false, goals: [], totalCents: 0, tips: [], leaderboard: [] };

interface LiveTipBarProps {
  sessionId: string;
  /** False for the broadcaster (an artist cannot tip their own live). */
  canTip: boolean;
}

/**
 * The tip goal bar. Renders nothing at all when the live_tips flag is off, so it
 * is safe to mount unconditionally on both the viewer and broadcaster views.
 *
 * Updates come from Supabase Realtime, not polling: a paid tip bumps the total
 * straight from the row payload, and a reconcile refetch (debounced) fills in
 * the tipper names and the leaderboard without every viewer stampeding the API
 * on each tip.
 */
export function LiveTipBar({ sessionId, canTip }: LiveTipBarProps) {
  const supabase = createBrowserSupabaseClient();
  const [board, setBoard] = useState<TipBoard>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState<string | null>(null);
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tip ids already added to the running total by a Realtime event, so a second
  // UPDATE on the same row cannot count the money twice.
  const countedTips = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/tips?sessionId=${sessionId}`);
      if (!res.ok) return;
      const next: TipBoard = await res.json();
      // The server total is authoritative and heals any optimistic drift.
      for (const t of next.tips || []) countedTips.current.add(t.id);
      setBoard(next);
    } catch {
      /* leave the last known board on screen */
    } finally {
      setLoaded(true);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // Reconcile names/leaderboard a beat after a burst of tips, not per tip.
  const scheduleReconcile = useCallback(() => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    reconcileTimer.current = setTimeout(() => { load(); }, 4000);
  }, [load]);

  useEffect(() => {
    if (!board.enabled) return;
    const channel = supabase
      .channel(`live-tips-${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'live_tips',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const row = payload.new as { id: string; status: string; amount: number };
        if (row.status !== 'paid') return;
        // payload.old carries ONLY the primary key unless the table is REPLICA
        // IDENTITY FULL, so there is no reliable "was it already paid" to test.
        // Count each tip id at most once instead: later UPDATEs on the same row
        // (the artist hiding a message) then cannot re-add the money.
        if (countedTips.current.has(row.id)) return;
        countedTips.current.add(row.id);
        setBoard((prev) => ({ ...prev, totalCents: prev.totalCents + (row.amount || 0) }));
        scheduleReconcile();
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'live_goals',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const row = payload.new as LiveGoal;
        setBoard((prev) => ({
          ...prev,
          goals: prev.goals.map((g) => (g.id === row.id ? { ...g, ...row } : g)),
        }));
        if (row.reached_at) {
          setJustUnlocked(row.title);
          setTimeout(() => setJustUnlocked(null), 12000);
        }
      })
      .subscribe();
    return () => {
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
      supabase.removeChannel(channel);
    };
  }, [sessionId, supabase, board.enabled, scheduleReconcile]);

  // Returning from Stripe: refresh so the fan sees their own tip land.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('tip') !== 'success') return;
    url.searchParams.delete('tip');
    window.history.replaceState({}, '', url.toString());
    load();
  }, [load]);

  if (!loaded || !board.enabled) return null;

  const goal = activeGoal(board.goals, board.totalCents);
  const allGoals = board.goals.filter((g) => g.metric === 'tips');
  const reachedCount = allGoals.filter((g) => board.totalCents >= g.target_amount).length;
  const percent = goal ? goalPercent(board.totalCents, goal.target_amount) : 100;

  return (
    <div className="bg-crwn-surface-solid border-b border-crwn-elevated px-4 py-3">
      {justUnlocked && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-crwn-gold/15 border border-crwn-gold/40 px-3 py-2">
          <Trophy className="w-4 h-4 text-crwn-gold flex-shrink-0" />
          <span className="text-crwn-gold text-sm font-semibold">Unlocked: {justUnlocked}!</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          {goal ? (
            <p className="text-crwn-text text-sm font-semibold truncate">{goal.title}</p>
          ) : allGoals.length ? (
            <p className="text-crwn-gold text-sm font-semibold">Every goal unlocked!</p>
          ) : (
            <p className="text-crwn-text text-sm font-semibold">Support the stream</p>
          )}
          <p className="text-crwn-text-secondary text-xs">
            {formatCents(board.totalCents)}
            {goal ? ` of ${formatCents(goal.target_amount)}` : ' raised'}
            {allGoals.length > 0 && ` · ${reachedCount}/${allGoals.length} unlocked`}
          </p>
        </div>
        {canTip && (
          <button
            onClick={() => setOpen(true)}
            className="neu-button-accent px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 flex-shrink-0"
          >
            <Heart className="w-4 h-4" />
            Tip
          </button>
        )}
      </div>

      {(goal || allGoals.length > 0) && (
        <div className="h-2 rounded-full bg-crwn-elevated overflow-hidden">
          <div
            className="h-full rounded-full bg-crwn-gold transition-all duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {board.tips.length > 0 && (
        <p className="text-crwn-text-secondary text-xs mt-2 truncate">
          <span className="text-crwn-gold font-medium">{board.tips[0].name}</span>
          {` tipped ${formatCents(board.tips[0].amount)}`}
          {board.tips[0].message ? `: ${board.tips[0].message}` : ''}
        </p>
      )}

      {open && <TipModal sessionId={sessionId} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ── Tip composer ────────────────────────────────────────────────────────────
// Amount is a dropdown per the CLAUDE.md pick-one-of-many rule, with a Custom
// option that reveals a dollar field.

const CUSTOM = 'custom';

function TipModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [choice, setChoice] = useState<string>(String(TIP_PRESETS_CENTS[1]));
  const [customDollars, setCustomDollars] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = [
    ...TIP_PRESETS_CENTS.map((c) => ({ value: String(c), label: formatCents(c) })),
    { value: CUSTOM, label: 'Custom amount' },
  ];

  const amountCents =
    choice === CUSTOM
      ? Math.round(parseFloat(customDollars || '0') * 100)
      : parseInt(choice, 10);

  const valid = Number.isFinite(amountCents) && amountCents >= MIN_TIP_CENTS && amountCents <= MAX_TIP_CENTS;

  const send = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/live-tip-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, amount: amountCents, message }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not start checkout');
        return;
      }
      // External Stripe URL: a full navigation is correct here.
      window.location.href = data.url;
    } catch {
      setError('Network error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-crwn-surface-solid rounded-2xl border border-crwn-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-crwn-text font-bold">Send a tip</h3>
          <button onClick={onClose} className="text-crwn-text-secondary hover:text-crwn-text" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-crwn-text-secondary text-xs mb-1.5">Amount</label>
        <OptionSelect options={options} value={choice} onChange={setChoice} className="mb-3" />

        {choice === CUSTOM && (
          <input
            type="number"
            inputMode="decimal"
            min={MIN_TIP_CENTS / 100}
            max={MAX_TIP_CENTS / 100}
            step="1"
            value={customDollars}
            onChange={(e) => setCustomDollars(e.target.value)}
            placeholder={`$1 to $${MAX_TIP_CENTS / 100}`}
            className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none mb-3"
          />
        )}

        <label className="block text-crwn-text-secondary text-xs mb-1.5">
          Say something (optional)
        </label>
        <input
          type="text"
          value={message}
          maxLength={MAX_TIP_MESSAGE_LEN}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Shown on the stream"
          className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none mb-4"
        />

        {error && <p className="text-crwn-error text-sm mb-3">{error}</p>}

        <button
          onClick={send}
          disabled={!valid || sending}
          className="neu-button-accent w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
          {valid ? `Tip ${formatCents(amountCents)}` : 'Choose an amount'}
        </button>
      </div>
    </div>
  );
}
