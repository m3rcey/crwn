'use client';

// Rule-based "next best action" strip for the Fan Growth CRM. Pulls
// /api/crm/suggestions (recommendations only — nothing is sent/awarded here) and
// lets the artist act. Badge awards happen only when the artist taps the CTA.

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/shared/Toast';
import { Sparkles, ChevronRight, X } from 'lucide-react';

interface CrmSuggestion {
  id: string;
  type: string;
  icon: string;
  title: string;
  body: string;
  fanId?: string;
  fanName?: string;
  cta: { label: string; action: string };
}

interface Props {
  onSegment?: (lifecycle: string) => void;
}

export function FanCrmSuggestions({ onSegment }: Props) {
  const { showToast } = useToast();
  const [suggestions, setSuggestions] = useState<CrmSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/suggestions');
      const json = await res.json();
      if (res.ok) setSuggestions(json.suggestions || []);
    } catch { /* silent */ } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (s: CrmSuggestion) => {
    const [action, arg] = s.cta.action.split(':');
    if (action === 'segment' && onSegment) { onSegment(arg); return; }

    if (action === 'thank' || action === 'award_badge') {
      if (!s.fanId) return;
      setBusy(s.id);
      try {
        const metadata = action === 'award_badge' ? { badgeKey: arg } : {};
        const res = await fetch('/api/crm/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fanId: s.fanId, actionType: action, metadata, source: 'ai' }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        showToast(action === 'award_badge' ? 'Badge awarded' : `Thanked ${s.fanName || 'fan'}`, 'success');
        setDismissed(d => new Set(d).add(s.id));
      } catch (e: any) {
        showToast(e.message || 'Failed', 'error');
      } finally {
        setBusy(null);
      }
    }
  };

  const visible = suggestions.filter(s => !dismissed.has(s.id));
  if (!loaded || visible.length === 0) return null;

  return (
    <div className="bg-crwn-card rounded-xl border border-crwn-gold/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-crwn-gold" />
        <h3 className="text-sm font-semibold text-crwn-text">Suggested moves</h3>
        <span className="text-xs text-crwn-text-secondary">({visible.length})</span>
      </div>
      <div className="space-y-2">
        {visible.map(s => (
          <div key={s.id} className="flex items-center gap-3 bg-crwn-elevated/40 rounded-lg px-3 py-2.5">
            <span className="text-lg shrink-0">{s.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-crwn-text truncate">{s.title}</p>
              <p className="text-xs text-crwn-text-secondary">{s.body}</p>
            </div>
            <button
              onClick={() => act(s)}
              disabled={busy === s.id}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold text-crwn-bg disabled:opacity-50"
            >
              {busy === s.id ? '…' : s.cta.label}
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => setDismissed(d => new Set(d).add(s.id))}
              className="shrink-0 text-crwn-text-secondary hover:text-crwn-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
