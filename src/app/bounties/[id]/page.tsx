'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Check, X, Trophy, ExternalLink, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { BOUNTY_TYPE_MAP, type BountyType } from '@/lib/bounties';
import { smartBack } from '@/lib/navigation';

interface Submission {
  id: string; clipper_id: string; clip_url: string | null; status: string;
  display_name: string; avatar_url: string | null;
  subscribers_attributed: number; revenue_attributed: number; clicks: number;
}
interface Bounty {
  id: string; title: string; description: string | null; bounty_type: BountyType; status: string;
  reward_type: string; reward_detail: string | null; deadline: string | null; approval_required: boolean; eligibility: string;
}

export default function BountyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const bountyId = params?.id as string;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bounties/${bountyId}`);
      const json = await res.json();
      if (!res.ok) { showToast(json.error || 'Not found', 'error'); router.push('/bounties'); return; }
      setBounty(json.bounty);
      setSubmissions(json.submissions || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [bountyId, router, showToast]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const review = async (submissionId: string, action: 'approve' | 'reject' | 'winner') => {
    try {
      const res = await fetch(`/api/bounties/${bountyId}/submissions`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast(action === 'winner' ? 'Winner awarded 🏆' : action === 'approve' ? 'Approved' : 'Rejected', 'success');
      load();
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); }
  };

  const setStatus = async (status: string) => {
    await fetch(`/api/bounties/${bountyId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    load();
  };

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!bounty) return null;

  const def = BOUNTY_TYPE_MAP[bounty.bounty_type] || BOUNTY_TYPE_MAP.custom;
  const pending = submissions.filter(s => s.status === 'pending');
  const approved = submissions.filter(s => s.status === 'approved' || s.status === 'winner');

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => smartBack(router, '/bounties')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <span className="text-2xl">{def.icon}</span>
        <div className="flex-1 min-w-0"><h1 className="text-lg font-bold text-crwn-text truncate">{bounty.title}</h1><p className="text-xs text-crwn-text-secondary capitalize">{def.label} · {bounty.status}</p></div>
        {bounty.status === 'active' && <button onClick={() => setStatus('ended')} className="text-xs bg-crwn-elevated text-crwn-text-secondary px-3 py-1.5 rounded-full">End</button>}
      </div>

      <div className="bg-crwn-surface rounded-xl border border-crwn-elevated p-4 mb-5">
        <p className="text-sm text-crwn-text mb-1">🎁 {bounty.reward_detail || bounty.reward_type}</p>
        {bounty.deadline && <p className="text-xs text-crwn-text-secondary inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Closes {new Date(bounty.deadline).toLocaleString()}</p>}
        <p className="text-xs text-crwn-text-secondary mt-1 capitalize">Eligibility: {bounty.eligibility} · {bounty.approval_required ? 'Approval required' : 'Auto-approve'}</p>
      </div>

      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-crwn-gold uppercase tracking-wider mb-2">Pending review ({pending.length})</h2>
          <div className="space-y-2">
            {pending.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-crwn-surface rounded-xl border border-crwn-elevated p-3">
                <div className="w-8 h-8 rounded-full bg-crwn-elevated flex items-center justify-center text-xs text-crwn-text-secondary">{s.display_name.charAt(0).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-crwn-text truncate">{s.display_name}</p>
                  {s.clip_url && <a href={s.clip_url} target="_blank" rel="noreferrer" className="text-xs text-crwn-gold inline-flex items-center gap-1">View clip <ExternalLink className="w-3 h-3" /></a>}
                </div>
                <button onClick={() => review(s.id, 'approve')} className="p-2 rounded-lg bg-crwn-gold/10 text-crwn-gold"><Check className="w-4 h-4" /></button>
                <button onClick={() => review(s.id, 'reject')} className="p-2 rounded-lg bg-crwn-elevated text-crwn-text-secondary"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold text-crwn-text-secondary uppercase tracking-wider mb-2">Leaderboard</h2>
        {approved.length === 0 ? <p className="text-sm text-crwn-text-secondary text-center py-6">No approved clips yet.</p> : (
          <div className="space-y-2">
            {approved.map((s, i) => (
              <div key={s.id} className={`flex items-center gap-3 rounded-xl border p-3 ${s.status === 'winner' ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-surface'}`}>
                <span className="text-sm font-bold text-crwn-text-secondary w-5 text-center">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-crwn-text truncate flex items-center gap-1.5">{s.display_name} {s.status === 'winner' && <Trophy className="w-3.5 h-3.5 text-crwn-gold" />}</p>
                  <p className="text-xs text-crwn-text-secondary">{s.subscribers_attributed} subs · {s.clicks} clicks{s.clip_url ? '' : ''}</p>
                </div>
                {bounty.status !== 'awarded' && s.status !== 'winner' && (
                  <button onClick={() => review(s.id, 'winner')} className="text-xs bg-crwn-gold text-crwn-bg font-semibold px-3 py-1.5 rounded-full">Pick winner</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
