'use client';

// The acquisition panel. Three tabs, and two of them exist to retire raw SQL from Josh's
// morning routine:
//
//   Leads         the funnel: who came in, from which post, how far they got
//   Needs you     leads CRWN could not understand and handed to a human. That human is Josh.
//   Failed        dead-lettered jobs. Should always be empty.
//
// Every mutation goes through /api/admin/acquisition, which verifies admin from the SESSION
// and writes an audit row. Nothing here is trusted.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Check, Ban, Instagram } from 'lucide-react';

type View = 'leads' | 'human_review' | 'dead_letter';

interface Row {
  id: string;
  state?: string;
  status?: string;
  lead_magnet_id?: string;
  keyword?: string;
  source_post_id?: string;
  current_question_key?: string;
  last_activity_at?: string;
  created_at?: string;
  event_name?: string;
  last_error_code?: string;
  attempt_count?: number;
  lead_identity_id?: string;
  identity?: { instagram_username?: string; email?: string; claimed_at?: string; status?: string } | null;
  profile?: { lead_score?: number; score_band?: string; monthly_listeners?: number; primary_blocker?: string } | null;
  result?: { viewed_at?: string; claimed_at?: string; recalculated_at?: string } | null;
}

const BAND_COLOR: Record<string, string> = {
  sales_priority: 'text-crwn-gold',
  self_serve: 'text-green-400',
  nurture: 'text-blue-400',
  unqualified: 'text-crwn-text-secondary',
  human_review: 'text-orange-400',
};

export default function AcquisitionView() {
  const [view, setView] = useState<View>('leads');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [notReady, setNotReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/acquisition?view=${view}`);
      const json = await res.json();
      setRows(json.rows ?? []);
      setNotReady(!!json.notReady);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: string, id: string) => {
    setBusy(id);
    await fetch('/api/admin/acquisition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id }),
    });
    setBusy(null);
    load();
  };

  const TABS: { key: View; label: string }[] = [
    { key: 'leads', label: 'Leads' },
    { key: 'human_review', label: 'Needs you' },
    { key: 'dead_letter', label: 'Failed' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                view === t.key
                  ? 'bg-crwn-elevated text-crwn-text'
                  : 'text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="text-crwn-text-secondary hover:text-crwn-text p-2"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
        </div>
      ) : notReady ? (
        <Empty
          title="The acquisition engine is not migrated yet"
          body="Run supabase/schema-phase2-instagram-acquisition-engine.sql, then set MANYCHAT_WEBHOOK_SECRET in Vercel. See TODO.md."
        />
      ) : rows.length === 0 ? (
        <Empty
          title={
            view === 'dead_letter'
              ? 'Nothing has failed'
              : view === 'human_review'
              ? 'Nobody is waiting on you'
              : 'No leads yet'
          }
          body={
            view === 'dead_letter'
              ? 'This is the state you want. If jobs start piling up here, the ManyChat token is the first thing to check.'
              : view === 'human_review'
              ? 'When CRWN cannot understand a lead, it stops asking rather than looping, and hands them here.'
              : 'Leads appear here the moment someone comments your keyword on Instagram.'
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="bg-crwn-surface-solid rounded-xl p-4 flex items-center gap-4 flex-wrap"
            >
              {view === 'dead_letter' ? (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-crwn-text font-medium">{r.event_name}</p>
                    <p className="text-sm text-red-400">
                      {r.last_error_code} &middot; {r.attempt_count} attempts
                    </p>
                  </div>
                  <button
                    onClick={() => act('retry_event', r.id)}
                    disabled={busy === r.id}
                    className="bg-crwn-gold text-crwn-bg font-semibold text-sm px-4 py-2 rounded-full disabled:opacity-50"
                  >
                    {busy === r.id ? 'Retrying…' : 'Retry'}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Instagram className="w-4 h-4 text-crwn-text-secondary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-crwn-text font-medium truncate">
                        {r.identity?.instagram_username
                          ? `@${r.identity.instagram_username}`
                          : 'Anonymous lead'}
                      </p>
                      <p className="text-sm text-crwn-text-secondary truncate">
                        {view === 'human_review'
                          ? `Stuck on: ${r.current_question_key ?? 'unknown'}`
                          : [
                              r.lead_magnet_id,
                              r.profile?.monthly_listeners
                                ? `${r.profile.monthly_listeners.toLocaleString()} listeners`
                                : null,
                              r.profile?.primary_blocker,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                      </p>
                    </div>
                  </div>

                  {r.profile?.lead_score != null && (
                    <div className="text-right shrink-0">
                      <p className={`font-semibold ${BAND_COLOR[r.profile.score_band ?? ''] ?? 'text-crwn-text'}`}>
                        {r.profile.lead_score}
                      </p>
                      <p className="text-xs text-crwn-text-secondary">
                        {(r.profile.score_band ?? '').replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}

                  <div className="shrink-0 text-xs text-crwn-text-secondary w-28">
                    {r.result?.claimed_at
                      ? 'Claimed'
                      : r.result?.recalculated_at
                      ? 'Edited numbers'
                      : r.result?.viewed_at
                      ? 'Opened result'
                      : r.state?.replace(/_/g, ' ') ?? ''}
                  </div>

                  {view === 'human_review' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => act('resolve_review', r.id)}
                        disabled={busy === r.id}
                        className="bg-crwn-gold text-crwn-bg font-semibold text-sm px-3 py-2 rounded-full disabled:opacity-50 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Handled
                      </button>
                      {r.lead_identity_id && (
                        <button
                          onClick={() => act('disqualify', r.lead_identity_id!)}
                          disabled={busy === r.lead_identity_id}
                          className="text-crwn-text-secondary hover:text-red-400 text-sm px-3 py-2 rounded-full flex items-center gap-1"
                        >
                          <Ban className="w-3.5 h-3.5" /> Not a lead
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-16 max-w-md mx-auto">
      <h3 className="text-crwn-text font-semibold mb-2">{title}</h3>
      <p className="text-crwn-text-secondary text-sm leading-relaxed">{body}</p>
    </div>
  );
}
