'use client';

import { useEffect, useMemo, useState, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { roleLabel } from '@/lib/teamSplits/constants';
import { TEAM_SPLIT_DISCLAIMER_PARAGRAPHS } from '@/lib/teamSplits/disclaimer';
import type { TeamSplitDeal, TeamSplitDeliverable, TeamSplitEarning, CollaboratorBalance } from '@/lib/teamSplits/types';
import { Loader2, ArrowLeft, Check, Clock } from 'lucide-react';

function money(c: number) { return `$${(c / 100).toFixed(2)}`; }

export default function TeamDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<TeamSplitDeal | null>(null);
  const [deliverables, setDeliverables] = useState<TeamSplitDeliverable[]>([]);
  const [earnings, setEarnings] = useState<TeamSplitEarning[]>([]);
  const [balance, setBalance] = useState<CollaboratorBalance | null>(null);
  const [isArtist, setIsArtist] = useState(false);
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [hasPayout, setHasPayout] = useState(true);
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/team-splits/${id}`);
    if (res.status === 401) { router.push(`/login`); return; }
    if (!res.ok) { setLoading(false); return; }
    const d = await res.json();
    setDeal(d.deal); setDeliverables(d.deliverables); setEarnings(d.earnings);
    setBalance(d.balance); setIsArtist(d.isArtist); setIsCollaborator(d.isCollaborator);
    setLoading(false);
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    load();
    supabase.from('profiles').select('stripe_connect_id').eq('id', user.id).maybeSingle()
      .then(({ data }) => setHasPayout(!!data?.stripe_connect_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  async function act(url: string, body?: Record<string, unknown>, method = 'POST') {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      await load();
      return data;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(false); }
  }

  async function setupPayouts() {
    setBusy(true);
    try {
      const res = await fetch('/api/stripe/fan-connect', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setMsg('Could not start payout setup.');
    } catch { setMsg('Could not start payout setup.'); } finally { setBusy(false); }
  }

  async function cashout() {
    const data = await act('/api/stripe/team-split-cashout', {});
    if (data?.success) setMsg(`Cashed out ${money(data.amount)}.`);
  }

  if (authLoading || loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 text-crwn-gold animate-spin" /></div>;
  }
  if (!deal) {
    return <div className="max-w-lg mx-auto px-4 py-16 text-center text-crwn-text-secondary">Deal not found.</div>;
  }

  const canRespond = isCollaborator && ['sent', 'viewed', 'changes_requested'].includes(deal.status);
  // Deterministic back: return to where the user came from (the artist's Team
  // tab, or the collaborator dashboard) — never the bare dashboard. router.back()
  // is unreliable here because the dashboard tab switch doesn't change the URL.
  const backHref = isArtist ? '/studio/team' : '/team';

  return (
    <div className="max-w-lg mx-auto px-4 py-6 page-fade-in">
      <button onClick={() => router.push(backHref)} className="flex items-center gap-1 text-sm text-crwn-text-secondary mb-4"><ArrowLeft className="w-4 h-4" /> Back</button>

      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold bg-crwn-elevated text-crwn-text-secondary">{deal.status.replace(/_/g, ' ')}</span>
        {deal.is_high_risk && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold bg-amber-500/15 text-amber-300">Review terms</span>}
      </div>
      <h1 className="text-xl font-bold text-crwn-text">{deal.title}</h1>
      <p className="text-sm text-crwn-text-secondary">{roleLabel(deal.role, deal.custom_role)} · {deal.collaborator_name || deal.collaborator_email}</p>

      {/* terms */}
      <div className="bg-crwn-surface rounded-xl p-4 mt-4 text-sm space-y-1.5">
        {deal.percentage != null && <Row k="Split" v={`${deal.percentage}% of ${deal.payout_basis === 'gross_revenue' ? 'gross' : 'net'} revenue`} />}
        {deal.milestone_amount != null && <Row k="Bonus" v={money(deal.milestone_amount)} />}
        {deal.revenue_source_label && <Row k="Source" v={deal.revenue_source_label} />}
        {deal.cap_amount != null && <Row k="Cap" v={money(deal.cap_amount)} />}
        {deal.upfront_amount != null && <Row k="Upfront (off-platform)" v={money(deal.upfront_amount)} />}
        {deal.ends_at && <Row k="Ends" v={new Date(deal.ends_at).toLocaleDateString()} />}
        <Row k="Refund hold" v={`${deal.hold_period_days} days`} />
        <Row k="Payout after deliverables" v={deal.payout_starts_after_deliverable_approval ? 'Yes' : 'No'} />
      </div>
      {deal.rights_notes && <p className="text-xs text-crwn-text-secondary mt-2"><strong>Rights notes:</strong> {deal.rights_notes}</p>}

      {/* money (collaborator) */}
      {isCollaborator && balance && (
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Money label="Held" v={balance.estimatedHeld} />
          <Money label="Available" v={balance.available} highlight />
          <Money label="Paid" v={balance.paid} />
        </div>
      )}
      {isCollaborator && balance && (
        <div className="mt-3">
          {!hasPayout ? (
            <button disabled={busy} onClick={setupPayouts} className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-full disabled:opacity-40">Set up payouts to cash out</button>
          ) : (
            <button disabled={busy || balance.available < 2500} onClick={cashout} className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-full disabled:opacity-40">
              {balance.available < 2500 ? 'Minimum cashout is $25.00' : `Cash out ${money(balance.available)}`}
            </button>
          )}
        </div>
      )}

      {/* collaborator response */}
      {canRespond && (
        <div className="bg-crwn-surface rounded-xl p-4 mt-4 space-y-3">
          <div className="text-xs text-crwn-text-secondary space-y-2 max-h-32 overflow-y-auto">
            {TEAM_SPLIT_DISCLAIMER_PARAGRAPHS.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <label className="flex items-start gap-2 text-sm text-crwn-text">
            <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            I accept these terms.
          </label>
          <div className="flex gap-2">
            <button disabled={busy || !agree} onClick={() => act(`/api/team-splits/${id}/respond`, { action: 'accept', agreementAccepted: true })}
              className="flex-1 bg-crwn-gold text-crwn-bg font-semibold py-2.5 rounded-full disabled:opacity-40">Accept</button>
            <button disabled={busy} onClick={() => { const note = prompt('What would you like to change?'); if (note) act(`/api/team-splits/${id}/respond`, { action: 'request_changes', note }); }}
              className="px-4 py-2.5 rounded-full bg-crwn-elevated text-crwn-text text-sm">Request changes</button>
            <button disabled={busy} onClick={() => { if (confirm('Reject this deal?')) act(`/api/team-splits/${id}/respond`, { action: 'reject' }); }}
              className="px-4 py-2.5 rounded-full bg-crwn-elevated text-crwn-text text-sm">Reject</button>
          </div>
        </div>
      )}

      {/* deliverables */}
      {deliverables.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-crwn-text mb-2">Deliverables</h3>
          <div className="space-y-2">
            {deliverables.map((d) => (
              <div key={d.id} className="bg-crwn-surface rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-crwn-text font-medium">{d.title}</p>
                  <DeliverableBadge status={d.status} />
                </div>
                {d.due_at && <p className="text-xs text-crwn-text-secondary mt-0.5">Due {new Date(d.due_at).toLocaleDateString()}</p>}
                {d.rejection_reason && <p className="text-xs text-amber-300 mt-1">Revision: {d.rejection_reason}</p>}
                {/* collaborator submits */}
                {isCollaborator && ['pending', 'revision_requested'].includes(d.status) && (
                  <button disabled={busy} onClick={() => { const link = prompt('Paste a link to your deliverable (file or URL):') || ''; act(`/api/team-splits/${id}/deliverables/${d.id}`, { action: 'submit', externalLink: link }, 'PATCH'); }}
                    className="mt-2 text-xs bg-crwn-gold text-crwn-bg font-semibold px-3 py-1.5 rounded-full">Submit</button>
                )}
                {/* artist approves */}
                {isArtist && d.status === 'submitted' && (
                  <div className="flex gap-2 mt-2">
                    {d.external_link && <a href={d.external_link} target="_blank" rel="noreferrer" className="text-xs text-crwn-gold underline">View submission</a>}
                    <button disabled={busy} onClick={() => act(`/api/team-splits/${id}/deliverables/${d.id}`, { action: 'approve' }, 'PATCH')} className="text-xs bg-crwn-gold text-crwn-bg font-semibold px-3 py-1.5 rounded-full">Approve</button>
                    <button disabled={busy} onClick={() => { const reason = prompt('What needs fixing?'); if (reason) act(`/api/team-splits/${id}/deliverables/${d.id}`, { action: 'reject', rejectionReason: reason }, 'PATCH'); }} className="text-xs bg-crwn-elevated text-crwn-text px-3 py-1.5 rounded-full">Request revision</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* artist actions */}
      {isArtist && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-semibold text-crwn-text">Manage</h3>
          <div className="flex flex-wrap gap-2">
            {['active', 'accepted', 'paused'].includes(deal.status) && (
              <button disabled={busy} onClick={() => act(`/api/team-splits/${id}/release`, {})} className="bg-crwn-gold text-crwn-bg font-semibold text-sm px-4 py-2 rounded-full">Release matured payouts</button>
            )}
            {deal.milestone_amount != null && (
              <button disabled={busy} onClick={() => act(`/api/team-splits/${id}`, { action: 'award_milestone' }, 'PATCH')} className="bg-crwn-surface text-crwn-text text-sm px-4 py-2 rounded-full">Award milestone bonus</button>
            )}
            {deal.status === 'active' && <button disabled={busy} onClick={() => act(`/api/team-splits/${id}`, { action: 'pause' }, 'PATCH')} className="bg-crwn-surface text-crwn-text text-sm px-4 py-2 rounded-full">Pause</button>}
            {deal.status === 'paused' && <button disabled={busy} onClick={() => act(`/api/team-splits/${id}`, { action: 'resume' }, 'PATCH')} className="bg-crwn-surface text-crwn-text text-sm px-4 py-2 rounded-full">Resume</button>}
            {!['completed', 'terminated', 'cancelled', 'archived'].includes(deal.status) && (
              <button disabled={busy} onClick={() => { if (confirm('Terminate this deal? Accrued earnings remain payable.')) act(`/api/team-splits/${id}`, { action: 'terminate' }, 'PATCH'); }} className="bg-crwn-surface text-red-300 text-sm px-4 py-2 rounded-full">Terminate</button>
            )}
          </div>
        </div>
      )}

      {/* revenue events */}
      {earnings.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-crwn-text mb-2">Earnings history</h3>
          <div className="divide-y divide-crwn-elevated">
            {earnings.slice(0, 30).map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  {e.released_at ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clock className="w-3.5 h-3.5 text-crwn-text-secondary" />}
                  <span className="text-crwn-text-secondary">{new Date(e.created_at).toLocaleDateString()}{e.reason === 'refund_clawback' ? ' · refund' : ''}</span>
                </div>
                <span className={e.commission_amount < 0 ? 'text-red-300' : 'text-crwn-text'}>{money(e.commission_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* dispute */}
      {['active', 'accepted', 'paused', 'completed'].includes(deal.status) && (
        <button disabled={busy} onClick={() => { const desc = prompt('Describe the issue for admin review:'); if (desc) act(`/api/team-splits/${id}/disputes`, { description: desc, disputeType: 'other' }); }}
          className="mt-6 text-xs text-crwn-text-secondary underline">Open a dispute</button>
      )}

      {msg && <p className="text-sm text-crwn-gold mt-4">{msg}</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-crwn-text-secondary">{k}</span><span className="text-crwn-text text-right font-medium">{v}</span></div>;
}
function Money({ label, v, highlight }: { label: string; v: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-center ${highlight ? 'bg-crwn-gold/15' : 'bg-crwn-surface'}`}>
      <p className="text-[10px] uppercase tracking-wide text-crwn-text-secondary">{label}</p>
      <p className={`font-bold ${highlight ? 'text-crwn-gold' : 'text-crwn-text'}`}>{money(v)}</p>
    </div>
  );
}
function DeliverableBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-crwn-elevated text-crwn-text-secondary', submitted: 'bg-blue-500/15 text-blue-300',
    revision_requested: 'bg-amber-500/15 text-amber-300', approved: 'bg-emerald-500/15 text-emerald-300',
    rejected: 'bg-red-500/15 text-red-300', cancelled: 'bg-crwn-elevated text-crwn-text-secondary',
  };
  return <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold ${map[status] || ''}`}>{status.replace(/_/g, ' ')}</span>;
}
