'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check, Radio } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Wizard, type WizardStep } from '@/components/ui/Wizard';
import {
  BOUNTY_TYPES, BOUNTY_TYPE_MAP, BOUNTY_REWARDS,
  type BountyType, type BountyRewardType, type BountyEligibility,
} from '@/lib/bounties';
import { smartBack } from '@/lib/navigation';

const STEPS: WizardStep[] = [
  { id: 'source', group: 'Source' },
  { id: 'type', group: 'Challenge' },
  { id: 'title', group: 'Challenge' },
  { id: 'reward', group: 'Reward' },
  { id: 'deadline', group: 'Rules' },
  { id: 'eligibility', group: 'Rules' },
  { id: 'review', group: 'Launch' },
];

interface Vod { id: string; title: string; vod_status: string; }

export default function NewBountyPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [ready, setReady] = useState(false);
  const [isArtist, setIsArtist] = useState(false);
  const [vods, setVods] = useState<Vod[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [bountyType, setBountyType] = useState<BountyType | null>(null);
  const [title, setTitle] = useState('');
  const [rewardType, setRewardType] = useState<BountyRewardType>('badge');
  const [rewardDetail, setRewardDetail] = useState('');
  const [deadline, setDeadline] = useState('');
  const [eligibility, setEligibility] = useState<BountyEligibility>('all');
  const [approvalRequired, setApprovalRequired] = useState(true);

  const check = useCallback(async () => {
    if (!user) return;
    const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
    setIsArtist(!!artist);
    if (artist) {
      const { data } = await supabase.from('live_sessions').select('id, title, vod_status').eq('artist_id', artist.id).order('created_at', { ascending: false }).limit(20);
      setVods((data || []) as Vod[]);
    }
    setReady(true);
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    check();
  }, [authLoading, user, router, check]);

  const applyType = (t: BountyType) => {
    setBountyType(t);
    if (!title) setTitle(BOUNTY_TYPE_MAP[t].label);
    // Metric-based types benefit from approval off is risky; keep approval on by default.
  };

  const step = STEPS[stepIndex];
  const rewardDef = BOUNTY_REWARDS.find(r => r.value === rewardType);
  const canContinue = (): boolean => {
    if (step.id === 'type') return bountyType !== null;
    if (step.id === 'title') return title.trim().length > 0;
    if (step.id === 'reward') return !rewardDef?.needsDetail || rewardDetail.trim().length > 0;
    return true;
  };

  const launch = async () => {
    if (!bountyType) return;
    setSaving(true);
    try {
      const res = await fetch('/api/bounties', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liveSessionId, bountyType, title: title.trim(),
          rewardType, rewardDetail: rewardDetail.trim() || null,
          deadline: deadline || null, eligibility, approvalRequired,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast('Bounty launched', 'success');
      router.push(`/bounties/${json.bounty.id}`);
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
      setSaving(false);
    }
  };

  if (!ready || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Bounties are for artists. Publish your artist page first.</p>
        <button onClick={() => router.push('/home')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full">Back to CRWN</button>
      </div>
    );
  }

  const typeDef = bountyType ? BOUNTY_TYPE_MAP[bountyType] : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => smartBack(router, '/bounties')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold text-crwn-text">New Bounty</h1>
      </div>

      <Wizard
        steps={STEPS}
        currentIndex={stepIndex}
        onBack={() => setStepIndex(i => Math.max(0, i - 1))}
        onContinue={() => { if (stepIndex >= STEPS.length - 1) launch(); else setStepIndex(i => i + 1); }}
        continueLabel={stepIndex >= STEPS.length - 1 ? 'Launch bounty' : 'Continue'}
        continueDisabled={!canContinue()}
        continueLoading={saving}
      >
        {step.id === 'source' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Which content?</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">Tie the bounty to a VOD or live, or leave it open.</p>
            <div className="space-y-2">
              <button onClick={() => setLiveSessionId(null)} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${liveSessionId === null ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card'}`}>
                <span className="text-xl">🌐</span><span className="text-sm text-crwn-text flex-1">No specific source (any clip)</span>{liveSessionId === null && <Check className="w-4 h-4 text-crwn-gold" />}
              </button>
              {vods.map(v => (
                <button key={v.id} onClick={() => setLiveSessionId(v.id)} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${liveSessionId === v.id ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card'}`}>
                  <Radio className="w-4 h-4 text-crwn-gold shrink-0" />
                  <div className="min-w-0 flex-1"><p className="text-sm text-crwn-text truncate">{v.title}</p><p className="text-xs text-crwn-text-secondary">{v.vod_status === 'ready' ? 'VOD ready' : v.vod_status}</p></div>
                  {liveSessionId === v.id && <Check className="w-4 h-4 text-crwn-gold" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step.id === 'type' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">What decides the winner?</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">Pick the challenge.</p>
            <div className="space-y-2">
              {BOUNTY_TYPES.map(t => (
                <button key={t.value} onClick={() => applyType(t.value)} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${bountyType === t.value ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card'}`}>
                  <span className="text-xl">{t.icon}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-crwn-text">{t.label}</p><p className="text-xs text-crwn-text-secondary">{t.hint}</p></div>
                  {bountyType === t.value && <Check className="w-4 h-4 text-crwn-gold shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step.id === 'title' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Name the bounty</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">Clippers see this.</p>
            <input type="text" value={title} autoFocus onChange={e => setTitle(e.target.value)} placeholder={typeDef?.label || 'Bounty title'}
              className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50" />
          </div>
        )}

        {step.id === 'reward' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Reward</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">v1 is non-cash. Cash bounties come later on the payout rail.</p>
            <div className="space-y-2 mb-3">
              {BOUNTY_REWARDS.map(r => (
                <button key={r.value} onClick={() => setRewardType(r.value)} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${rewardType === r.value ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card'}`}>
                  <span className="text-xl">{r.icon}</span><span className="text-sm text-crwn-text flex-1">{r.label}</span>{rewardType === r.value && <Check className="w-4 h-4 text-crwn-gold" />}
                </button>
              ))}
            </div>
            {rewardDef?.needsDetail && (
              <input type="text" value={rewardDetail} onChange={e => setRewardDetail(e.target.value)} placeholder="Describe the reward (e.g. Vault access for 30 days)"
                className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50" />
            )}
          </div>
        )}

        {step.id === 'deadline' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Deadline <span className="text-crwn-text-secondary text-sm font-normal">(optional)</span></h2>
            <p className="text-sm text-crwn-text-secondary mb-4">When does the bounty close?</p>
            <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)}
              className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text focus:outline-none focus:border-crwn-gold/50" />
          </div>
        )}

        {step.id === 'eligibility' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Who can enter?</h2>
            <div className="space-y-2 mb-5">
              {([['all', 'Anyone'], ['clippers', 'Clippers only'], ['subscribers', 'Subscribers only']] as [BountyEligibility, string][]).map(([v, label]) => (
                <button key={v} onClick={() => setEligibility(v)} className={`w-full flex items-center justify-between p-3 rounded-xl border text-left ${eligibility === v ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card'}`}>
                  <span className="text-sm text-crwn-text">{label}</span>{eligibility === v && <Check className="w-4 h-4 text-crwn-gold" />}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-crwn-elevated bg-crwn-card cursor-pointer">
              <input type="checkbox" checked={approvalRequired} onChange={e => setApprovalRequired(e.target.checked)} className="accent-crwn-gold" />
              <span className="text-sm text-crwn-text">Require my approval before a clip qualifies <span className="text-crwn-text-secondary">(recommended)</span></span>
            </label>
          </div>
        )}

        {step.id === 'review' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-4">Review</h2>
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated divide-y divide-crwn-elevated/60">
              <Row label="Source" value={liveSessionId ? (vods.find(v => v.id === liveSessionId)?.title || 'VOD') : 'Any clip'} />
              <Row label="Challenge" value={`${typeDef?.icon || ''} ${typeDef?.label || ''}`} />
              <Row label="Title" value={title} />
              <Row label="Reward" value={`${rewardDef?.label}${rewardDetail ? ` · ${rewardDetail}` : ''}`} />
              <Row label="Deadline" value={deadline ? new Date(deadline).toLocaleString() : 'Open'} />
              <Row label="Eligibility" value={eligibility} />
              <Row label="Approval" value={approvalRequired ? 'Required' : 'Auto-approve'} />
            </div>
          </div>
        )}
      </Wizard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <span className="text-sm text-crwn-text-secondary shrink-0">{label}</span>
      <span className="text-sm font-medium text-crwn-text capitalize text-right truncate">{value}</span>
    </div>
  );
}
