'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Clock, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { BOUNTY_TYPE_MAP, type BountyType } from '@/lib/bounties';

interface FanBounty {
  id: string; title: string; bounty_type: BountyType; reward_type: string; reward_detail: string | null;
  deadline: string | null; artistName: string; alreadySubmitted: boolean; eligibility: string;
}

export default function MyBountiesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bounties, setBounties] = useState<FanBounty[]>([]);
  const [submitFor, setSubmitFor] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bounties?scope=fan');
      const json = await res.json();
      setBounties(json.bounties || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    load();
  }, [authLoading, user, router, load]);

  const submit = async (bountyId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bounties/${bountyId}/submissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipUrl: clipUrl.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast('Clip submitted', 'success');
      setSubmitFor(null); setClipUrl('');
      load();
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); } finally { setSubmitting(false); }
  };

  if (loading || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <div><h1 className="text-xl font-bold text-crwn-text">Clip Bounties</h1><p className="text-xs text-crwn-text-secondary">Challenges from artists you support.</p></div>
      </div>

      {bounties.length === 0 ? (
        <div className="text-center py-16">
          <span className="text-5xl mb-4 block">🏆</span>
          <p className="text-sm text-crwn-text-secondary max-w-xs mx-auto">No open bounties right now. When an artist you support posts one, it'll show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bounties.map(b => {
            const def = BOUNTY_TYPE_MAP[b.bounty_type] || BOUNTY_TYPE_MAP.custom;
            return (
              <div key={b.id} className="bg-crwn-surface rounded-xl border border-crwn-elevated p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{def.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-crwn-text truncate">{b.title}</p>
                    <p className="text-xs text-crwn-text-secondary">{b.artistName} · {def.label}</p>
                  </div>
                </div>
                <p className="text-sm text-crwn-text mt-3">🎁 {b.reward_detail || b.reward_type}</p>
                {b.deadline && <p className="text-xs text-crwn-text-secondary inline-flex items-center gap-1 mt-1"><Clock className="w-3 h-3" /> Closes {new Date(b.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}

                {b.alreadySubmitted ? (
                  <p className="text-xs text-crwn-gold inline-flex items-center gap-1 mt-3"><Check className="w-3.5 h-3.5" /> Submitted</p>
                ) : submitFor === b.id ? (
                  <div className="mt-3 flex gap-2">
                    <input value={clipUrl} onChange={e => setClipUrl(e.target.value)} autoFocus placeholder="Paste your clip link"
                      className="flex-1 px-3 py-2 bg-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none" />
                    <button onClick={() => submit(b.id)} disabled={submitting} className="px-3 py-2 bg-crwn-gold text-crwn-bg rounded-lg text-xs font-semibold disabled:opacity-50">{submitting ? '…' : 'Submit'}</button>
                  </div>
                ) : (
                  <button onClick={() => { setSubmitFor(b.id); setClipUrl(''); }} className="mt-3 w-full py-2 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold">Submit a clip</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
