'use client';

// The Fan Automations screen: connection state, the list with its real numbers, and the
// wizard. Numbers here are DERIVED server-side from receipts, leads, and live subscription
// rows (see /api/fan-automations), so this screen can never disagree with the money truth.

import { useCallback, useEffect, useState } from 'react';
import { Instagram, Link2, MessageCircle, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/shared/Toast';
import { AutomationWizard } from '@/components/artist/automations/AutomationWizard';
import type { ArtistContext } from '@/hooks/useArtistContext';

interface ConnectionInfo {
  id: string;
  provider: 'instagram' | 'facebook';
  providerUsername: string | null;
  providerAccountId: string;
  status: string;
  webhookSubscribed: boolean;
}

interface AutomationRow {
  id: string;
  provider: string;
  status: string;
  public_token: string;
  trigger_keywords: string[];
  magnet_title: string;
  created_at: string;
}

interface Stats {
  comments: number; dmsSent: number; leads: number; freeMembers: number; goldMembers: number; silverMembers: number;
}

interface Candidate { id: string; providerUsername: string | null; }

export function FanAutomationsHome({ ctx }: { ctx: ArtistContext }) {
  const { showToast } = useToast();
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [availability, setAvailability] = useState<{ instagram: boolean; facebook: boolean; storageReady: boolean } | null>(null);
  const [automations, setAutomations] = useState<AutomationRow[]>([]);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, listRes] = await Promise.all([
        fetch(`/api/social-connect/status?artistId=${ctx.artistId}`),
        fetch(`/api/fan-automations?artistId=${ctx.artistId}`),
      ]);
      const status = await statusRes.json();
      const list = await listRes.json();
      if (statusRes.ok) {
        setConnections(status.connections || []);
        setAvailability(status.availability || null);
        if (status.hasCandidates) {
          const pick = await fetch(`/api/social-connect/pages?artistId=${ctx.artistId}`).then((r) => r.json()).catch(() => null);
          setCandidates(pick?.candidates || []);
        } else {
          setCandidates([]);
        }
      }
      if (listRes.ok) {
        setAutomations(list.automations || []);
        setStats(list.stats || {});
      }
    } finally {
      setLoading(false);
    }
  }, [ctx.artistId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('connected')) showToast('Account connected. Comments there can now become fans here.', 'success');
    if (q.get('connect_error')) showToast('The connection did not finish. Try again.', 'error');
  }, [showToast]);

  const patch = useCallback(async (id: string, action: 'activate' | 'pause' | 'archive') => {
    const res = await fetch(`/api/fan-automations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: ctx.artistId, action }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not update.', 'error');
      return;
    }
    void load();
  }, [ctx.artistId, load, showToast]);

  const pickPage = useCallback(async (connectionId: string) => {
    const res = await fetch('/api/social-connect/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId: ctx.artistId, connectionId }),
    });
    if (res.ok) {
      showToast('Page connected.', 'success');
      void load();
    } else {
      const data = await res.json();
      showToast(data.error || 'Could not connect that page.', 'error');
    }
  }, [ctx.artistId, load, showToast]);

  if (showWizard) {
    return (
      <AutomationWizard
        ctx={ctx}
        connections={connections}
        onClose={() => setShowWizard(false)}
        onSaved={() => { setShowWizard(false); void load(); }}
      />
    );
  }

  const active = connections.filter((c) => c.status === 'active');
  const unavailable = availability && (!availability.storageReady || (!availability.instagram && !availability.facebook));

  return (
    <div className="space-y-6">
      {unavailable && (
        <div className="neu-raised rounded-xl p-4 text-sm text-crwn-text-secondary">
          Fan Automations is being switched on. Connections open as soon as CRWN finishes setup with Instagram and Facebook.
        </div>
      )}

      {candidates.length > 0 && (
        <div className="neu-raised rounded-xl p-5">
          <p className="font-semibold text-crwn-text mb-1">Which Page should CRWN listen on?</p>
          <p className="text-sm text-crwn-text-secondary mb-3">Your Facebook login manages more than one Page. Pick the one for your music.</p>
          <div className="space-y-2">
            {candidates.map((c) => (
              <button key={c.id} onClick={() => pickPage(c.id)} className="w-full text-left rounded-xl bg-crwn-elevated px-4 py-3 text-sm text-crwn-text press-scale">
                {c.providerUsername || 'Untitled Page'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="neu-raised rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-crwn-text">Connected accounts</p>
            <p className="text-sm text-crwn-text-secondary mt-0.5">
              {active.length === 0
                ? 'Every comment on an unconnected account is a fan you never capture.'
                : active.map((c) => `${c.provider === 'instagram' ? 'Instagram' : 'Facebook'}${c.providerUsername ? ` (@${c.providerUsername})` : ''}`).join(' · ')}
            </p>
          </div>
          <Link2 className="w-5 h-5 text-crwn-gold shrink-0" />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-crwn-text-secondary">Loading…</p>
      ) : automations.length === 0 ? (
        <div className="neu-raised rounded-xl p-8 text-center">
          <MessageCircle className="w-10 h-10 text-crwn-gold/40 mx-auto mb-3" />
          <p className="font-medium text-crwn-text">Comments are already happening. Nothing is catching them.</p>
          <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">
            Set up one automation: a fan comments, CRWN DMs them your drop, they join your free list, and your membership offer does the rest.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => {
            const s = stats[a.id] || { comments: 0, dmsSent: 0, leads: 0, freeMembers: 0, goldMembers: 0, silverMembers: 0 };
            return (
              <div key={a.id} className="neu-raised rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {a.provider === 'link'
                        ? <Link2 className="w-4 h-4 text-crwn-gold shrink-0" />
                        : <Instagram className="w-4 h-4 text-crwn-gold shrink-0" />}
                      <p className="font-semibold text-crwn-text truncate">{a.magnet_title || 'Untitled drop'}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === 'active' ? 'bg-crwn-gold/15 text-crwn-gold' : 'bg-crwn-elevated text-crwn-text-secondary'}`}>
                        {a.status}
                      </span>
                    </div>
                    <p className="text-xs text-crwn-text-secondary mt-1">
                      {a.provider === 'link'
                        ? 'A link you share'
                        : `${a.trigger_keywords.length ? `Keyword: ${a.trigger_keywords.join(', ')}` : 'Any comment'} · ${a.provider}`}
                    </p>
                    {/* The URL IS the funnel for a link source, and useful for every other
                        one too: it is what a story sticker or a QR code points at. A draft
                        is shown greyed with why, because a link that 404s reads as broken. */}
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/drop/${a.public_token}`;
                        navigator.clipboard?.writeText(url).then(
                          () => showToast('Funnel link copied.', 'success'),
                          () => showToast(url, 'info'),
                        );
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-crwn-gold press-scale"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Copy funnel link
                    </button>
                    {a.status === 'draft' && (
                      <span className="ml-2 text-[11px] text-crwn-text-secondary">
                        Activate first, or the link will not open.
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {a.status === 'active' ? (
                      <button onClick={() => patch(a.id, 'pause')} aria-label="Pause" className="p-2 text-crwn-text-secondary press-scale"><Pause className="w-4 h-4" /></button>
                    ) : (
                      <button onClick={() => patch(a.id, 'activate')} aria-label="Activate" className="p-2 text-crwn-gold press-scale"><Play className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => patch(a.id, 'archive')} aria-label="Archive" className="p-2 text-crwn-text-secondary press-scale"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4 text-center">
                  {([
                    ['Comments', s.comments],
                    ['DMs sent', s.dmsSent],
                    ['Emails', s.leads],
                    ['Free fans', s.freeMembers],
                    ['Gold', s.goldMembers],
                    ['Silver', s.silverMembers],
                  ] as const).map(([label, n]) => (
                    <div key={label} className="rounded-lg bg-crwn-elevated py-2">
                      <p className="text-base font-semibold text-crwn-text">{n}</p>
                      <p className="text-[10px] text-crwn-text-secondary">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setShowWizard(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-semibold bg-crwn-gold text-crwn-bg press-scale"
      >
        <Plus className="w-4 h-4" /> New automation
      </button>
    </div>
  );
}
