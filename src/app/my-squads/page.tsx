'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { SQUAD_TYPE_MAP, type SquadType } from '@/lib/squads';

interface Membership {
  id: string; role: string; status: string; subscribers_attributed: number; contribution_score: number;
  artist_squads: { id: string; name: string; type: SquadType; description: string | null; status: string; badge_key: string | null } | null;
}

export default function MySquadsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [squads, setSquads] = useState<Membership[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/squads?scope=fan');
      const json = await res.json();
      setSquads(json.squads || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const respondInvite = async (m: Membership, accept: boolean) => {
    if (!m.artist_squads) return;
    try {
      const res = await fetch(`/api/squads/${m.artist_squads.id}/members`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: m.id, accept }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast(accept ? 'Joined the squad' : 'Declined', 'success');
      load();
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); }
  };

  if (loading || authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  }

  const invites = squads.filter(s => s.status === 'invited');
  const mine = squads.filter(s => s.status === 'active');
  const applied = squads.filter(s => s.status === 'applied');

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <div><h1 className="text-xl font-bold text-crwn-text">My Squads</h1><p className="text-xs text-crwn-text-secondary">Your roles across artists.</p></div>
      </div>

      {squads.length === 0 && (
        <div className="text-center py-16">
          <span className="text-5xl mb-4 block">🤝</span>
          <p className="text-sm text-crwn-text-secondary max-w-xs mx-auto">You're not in any squads yet. When an artist invites you, it'll show up here.</p>
        </div>
      )}

      {invites.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-crwn-gold uppercase tracking-wider mb-2">Invites</h2>
          <div className="space-y-2">
            {invites.map(m => {
              const def = m.artist_squads ? SQUAD_TYPE_MAP[m.artist_squads.type] : null;
              return (
                <div key={m.id} className="flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-gold/30 p-3">
                  <span className="text-xl">{def?.icon || '🤝'}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-crwn-text truncate">{m.artist_squads?.name}</p><p className="text-xs text-crwn-text-secondary">Invited</p></div>
                  <button onClick={() => respondInvite(m, true)} className="p-2 rounded-lg bg-crwn-gold/10 text-crwn-gold"><Check className="w-4 h-4" /></button>
                  <button onClick={() => respondInvite(m, false)} className="p-2 rounded-lg bg-crwn-elevated text-crwn-text-secondary"><X className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2">Active</h2>
          <div className="space-y-2">
            {mine.map(m => {
              const def = m.artist_squads ? SQUAD_TYPE_MAP[m.artist_squads.type] : null;
              return (
                <div key={m.id} className="flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-elevated p-3">
                  <span className="text-xl">{def?.icon || '🤝'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-crwn-text truncate">{m.artist_squads?.name}</p>
                    <p className="text-xs text-crwn-text-secondary capitalize">{m.role} · {m.subscribers_attributed} subs brought</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {applied.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2">Pending</h2>
          <div className="space-y-2">
            {applied.map(m => {
              const def = m.artist_squads ? SQUAD_TYPE_MAP[m.artist_squads.type] : null;
              return (
                <div key={m.id} className="flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-elevated p-3 opacity-70">
                  <span className="text-xl">{def?.icon || '🤝'}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-crwn-text truncate">{m.artist_squads?.name}</p><p className="text-xs text-crwn-text-secondary">Application pending</p></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
