'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { formatCents } from '@/lib/live/tips';
import type { LiveGoal } from '@/types/live';
import { Loader2, Plus, Trash2, Trophy, X } from 'lucide-react';

interface LiveGoalsEditorProps {
  sessionId: string;
  artistId: string;
  sessionTitle: string;
  onClose: () => void;
}

/**
 * Tip goals for one live session: "$500 -> play the unreleased song".
 *
 * Writes go straight through RLS (the artist_manages_own_goals policy), so there
 * is no API route to keep in sync. reached_at is frozen by a trigger and stamped
 * only by the Stripe webhook, so nothing here can fake an unlock.
 */
export function LiveGoalsEditor({ sessionId, artistId, sessionTitle, onClose }: LiveGoalsEditorProps) {
  const supabase = createBrowserSupabaseClient();
  const [goals, setGoals] = useState<LiveGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [targetDollars, setTargetDollars] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('live_goals')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .order('target_amount', { ascending: true });
    setGoals((data as LiveGoal[]) || []);
    setLoading(false);
  }, [sessionId, supabase]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const target = Math.round(parseFloat(targetDollars || '0') * 100);
    if (!title.trim() || !Number.isFinite(target) || target <= 0) {
      setError('Add what the goal unlocks and a dollar target.');
      return;
    }
    if (goals.some((g) => g.target_amount === target)) {
      setError('You already have a goal at that amount.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from('live_goals').insert({
      session_id: sessionId,
      artist_id: artistId,
      title: title.trim(),
      metric: 'tips',
      target_amount: target,
      sort_order: goals.length,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTitle('');
    setTargetDollars('');
    load();
  };

  // Soft delete, so a goal that was already reached keeps its earnings history.
  const remove = async (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    await supabase.from('live_goals').update({ is_active: false }).eq('id', id);
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-crwn-surface-solid rounded-2xl border border-crwn-elevated p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-crwn-text font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-crwn-gold" />
            Tip goals
          </h3>
          <button onClick={onClose} className="text-crwn-text-secondary hover:text-crwn-text" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-crwn-text-secondary text-sm mb-4">{sessionTitle}</p>

        <p className="text-crwn-text-secondary text-xs mb-4">
          Fans fund these together during the stream. Without a goal on screen, a tip is just
          a button nobody presses: the bar filling up is what makes them press it.
        </p>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div>
        ) : goals.length === 0 ? (
          <p className="text-crwn-text-secondary text-sm py-4 text-center">No goals yet.</p>
        ) : (
          <ul className="mb-5">
            {goals.map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-3 border-b border-crwn-elevated last:border-0">
                <span className="text-crwn-gold font-bold text-sm w-16 flex-shrink-0">
                  {formatCents(g.target_amount)}
                </span>
                <span className="flex-1 min-w-0 text-crwn-text text-sm truncate">{g.title}</span>
                {g.reached_at && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-crwn-gold text-black px-1.5 py-0.5 rounded flex-shrink-0">
                    Hit
                  </span>
                )}
                <button
                  onClick={() => remove(g.id)}
                  className="text-crwn-text-secondary hover:text-crwn-error flex-shrink-0"
                  aria-label={`Remove ${g.title}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="block text-crwn-text-secondary text-xs mb-1.5">What it unlocks</label>
        <input
          type="text"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Play the unreleased song"
          className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none mb-3"
        />

        <label className="block text-crwn-text-secondary text-xs mb-1.5">Target (dollars)</label>
        <input
          type="number"
          inputMode="decimal"
          min="1"
          step="1"
          value={targetDollars}
          onChange={(e) => setTargetDollars(e.target.value)}
          placeholder="500"
          className="neu-inset w-full px-3 py-2 text-crwn-text placeholder-crwn-text-secondary focus:outline-none mb-4"
        />

        {error && <p className="text-crwn-error text-sm mb-3">{error}</p>}

        <button
          onClick={add}
          disabled={saving}
          className="neu-button-accent w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          Add goal
        </button>
      </div>
    </div>,
    document.body
  );
}
