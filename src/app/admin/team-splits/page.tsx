'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldAlert } from 'lucide-react';

interface Deal { id: string; title: string; percentage: number | null; revenue_source_type: string; status: string; is_high_risk: boolean; collaborator_name: string | null; }
interface Dispute { id: string; deal_id: string; dispute_type: string; description: string; status: string; created_at: string; }

export default function AdminTeamSplitsPage() {
  const [filter, setFilter] = useState<'high_risk' | 'disputed' | 'all'>('high_risk');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/team-splits?filter=${filter}`);
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const data = await res.json();
    setDeals(data.deals || []); setDisputes(data.disputes || []); setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  async function act(body: Record<string, unknown>) {
    await fetch('/api/admin/team-splits', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  }

  if (forbidden) return <div className="max-w-lg mx-auto px-4 py-20 text-center text-crwn-text-secondary">Admins only.</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-crwn-text mb-3 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-crwn-gold" /> Team Splits: Review</h1>
      <div className="flex gap-2 mb-4">
        {(['high_risk', 'disputed', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs ${filter === f ? 'bg-crwn-gold text-crwn-bg font-semibold' : 'bg-crwn-card text-crwn-text-secondary'}`}>{f.replace('_', ' ')}</button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div> : (
        <>
          {disputes.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-crwn-text mb-2">Open disputes</h2>
              <div className="space-y-2">
                {disputes.map((d) => (
                  <div key={d.id} className="bg-crwn-card rounded-xl p-3">
                    <p className="text-sm text-crwn-text">{d.dispute_type}</p>
                    <p className="text-xs text-crwn-text-secondary mt-1">{d.description}</p>
                    <div className="flex gap-2 mt-2">
                      <Link href={`/team/${d.deal_id}`} className="text-xs text-crwn-gold underline">Open deal</Link>
                      <button onClick={() => act({ action: 'resolve_dispute', disputeId: d.id, dealId: d.deal_id, status: 'resolved', reactivate: true })} className="text-xs bg-crwn-elevated text-crwn-text px-3 py-1 rounded-full">Resolve & reactivate</button>
                      <button onClick={() => act({ action: 'resolve_dispute', disputeId: d.id, status: 'rejected' })} className="text-xs bg-crwn-elevated text-crwn-text px-3 py-1 rounded-full">Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold text-crwn-text mb-2">Deals</h2>
          <div className="space-y-2">
            {deals.map((d) => (
              <div key={d.id} className="bg-crwn-card rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-crwn-text truncate">{d.title}</p>
                  <p className="text-xs text-crwn-text-secondary">{d.collaborator_name || '-'} · {d.percentage != null ? `${d.percentage}%` : 'bonus'} · {d.revenue_source_type} · {d.status}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {d.is_high_risk && <button onClick={() => act({ action: 'clear_flag', dealId: d.id })} className="text-xs bg-crwn-elevated text-crwn-text px-3 py-1 rounded-full">Clear flag</button>}
                  <button onClick={() => { if (confirm('Terminate this deal?')) act({ action: 'terminate', dealId: d.id }); }} className="text-xs bg-crwn-elevated text-red-300 px-3 py-1 rounded-full">Terminate</button>
                </div>
              </div>
            ))}
            {deals.length === 0 && <p className="text-sm text-crwn-text-secondary">Nothing to review.</p>}
          </div>
        </>
      )}
    </div>
  );
}
