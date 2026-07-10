'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Wizard, type WizardStep } from '@/components/ui/Wizard';
import { CAMPAIGN_GOALS, CAMPAIGN_GOAL_MAP, type CampaignGoalType } from '@/lib/roadCampaigns';
import { smartBack } from '@/lib/navigation';

interface Tier { id: string; name: string; price: number; }
interface Product { id: string; title: string; price: number; }

export default function NewCampaignPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [ready, setReady] = useState(false);
  const [isArtist, setIsArtist] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const [goalType, setGoalType] = useState<CampaignGoalType>('supporters');
  const [title, setTitle] = useState('');
  const [goalValue, setGoalValue] = useState(''); // dollars for money, count otherwise
  const [linkedTierId, setLinkedTierId] = useState<string | null>(null);
  const [linkedProductId, setLinkedProductId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');

  const check = useCallback(async () => {
    if (!user) return;
    const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
    setIsArtist(!!artist);
    if (artist) {
      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.from('subscription_tiers').select('id, name, price').eq('artist_id', artist.id).eq('is_active', true).order('price'),
        supabase.from('products').select('id, title, price').eq('artist_id', artist.id).eq('is_active', true),
      ]);
      setTiers((t as Tier[]) || []);
      setProducts((p as Product[]) || []);
    }
    setReady(true);
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    check();
  }, [authLoading, user, router, check]);

  const isMoney = goalType === 'money';
  const steps: WizardStep[] = useMemo(() => {
    const base: WizardStep[] = [
      { id: 'goal-type', group: 'Goal' },
      { id: 'title', group: 'Goal' },
      { id: 'goal-value', group: 'Goal' },
    ];
    if (isMoney) base.push({ id: 'link', group: 'Support' });
    base.push({ id: 'description', group: 'Details' }, { id: 'deadline', group: 'Details' }, { id: 'review', group: 'Launch' });
    return base;
  }, [isMoney]);

  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const goalDef = CAMPAIGN_GOAL_MAP[goalType];
  const canContinue = (): boolean => {
    if (step.id === 'title') return title.trim().length > 0;
    if (step.id === 'goal-value') return parseFloat(goalValue) > 0;
    return true;
  };

  const launch = async () => {
    setSaving(true);
    try {
      const goalValueNum = isMoney ? Math.round(parseFloat(goalValue) * 100) : parseInt(goalValue);
      const res = await fetch('/api/road-campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), goalType, goalValue: goalValueNum,
          linkedTierId, linkedProductId, description: description.trim() || null, deadline: deadline || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast('Campaign live', 'success');
      // If launched from a quest, return to Rise Mode where the celebration fires.
      const returnTo =
        typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null;
      router.push(returnTo || `/campaigns/${json.campaign.id}`);
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); setSaving(false); }
  };

  if (!ready || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Campaigns are for artists. Publish your artist page first.</p>
        <button onClick={() => router.push('/home')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full">Back to CRWN</button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => smartBack(router, '/campaigns')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold text-crwn-text">New Campaign</h1>
      </div>

      <Wizard
        steps={steps} currentIndex={stepIndex}
        onBack={() => setStepIndex(i => Math.max(0, i - 1))}
        onContinue={() => { if (stepIndex >= steps.length - 1) launch(); else setStepIndex(i => i + 1); }}
        continueLabel={stepIndex >= steps.length - 1 ? 'Launch campaign' : 'Continue'}
        continueDisabled={!canContinue()} continueLoading={saving}
      >
        {step.id === 'goal-type' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">What does the goal track?</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">Pick what fans move toward.</p>
            <div className="space-y-2">
              {CAMPAIGN_GOALS.map(g => (
                <button key={g.value} onClick={() => { setGoalType(g.value); if (g.value !== 'money') { setLinkedTierId(null); setLinkedProductId(null); } }} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${goalType === g.value ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card'}`}>
                  <span className="text-xl">{g.icon}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-crwn-text">{g.label}</p><p className="text-xs text-crwn-text-secondary">{g.hint}</p></div>
                  {goalType === g.value && <Check className="w-4 h-4 text-crwn-gold shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step.id === 'title' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Name the campaign</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">Start with "Road to…" if it fits.</p>
            <input type="text" value={title} autoFocus onChange={e => setTitle(e.target.value)} placeholder="Road to First Music Video"
              className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50" />
          </div>
        )}

        {step.id === 'goal-value' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Goal</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">{isMoney ? 'How much to raise?' : `How many ${goalDef.unit}?`}</p>
            <div className="relative">
              {isMoney && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-crwn-text-secondary">$</span>}
              <input type="number" min={1} value={goalValue} autoFocus onChange={e => setGoalValue(e.target.value)} placeholder={isMoney ? '1500' : '100'}
                className={`w-full ${isMoney ? 'pl-8' : 'pl-4'} pr-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text focus:outline-none focus:border-crwn-gold/50`} />
            </div>
          </div>
        )}

        {step.id === 'link' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">What do fans buy to support?</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">Optional. Link a tier or product. "Support" sends fans to check out. Skip to just send them to your page.</p>
            <div className="space-y-2">
              {tiers.map(t => (
                <button key={t.id} onClick={() => { setLinkedTierId(t.id); setLinkedProductId(null); }} className={`w-full flex items-center justify-between p-3 rounded-xl border text-left ${linkedTierId === t.id ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card'}`}>
                  <span className="text-sm text-crwn-text">👑 {t.name} · ${(t.price / 100).toFixed(0)}/mo</span>{linkedTierId === t.id && <Check className="w-4 h-4 text-crwn-gold" />}
                </button>
              ))}
              {products.map(p => (
                <button key={p.id} onClick={() => { setLinkedProductId(p.id); setLinkedTierId(null); }} className={`w-full flex items-center justify-between p-3 rounded-xl border text-left ${linkedProductId === p.id ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card'}`}>
                  <span className="text-sm text-crwn-text">🛍️ {p.title} · ${(p.price / 100).toFixed(0)}</span>{linkedProductId === p.id && <Check className="w-4 h-4 text-crwn-gold" />}
                </button>
              ))}
              {tiers.length === 0 && products.length === 0 && <p className="text-xs text-crwn-text-secondary">No tiers or products yet. Fans will be sent to your page to support.</p>}
            </div>
          </div>
        )}

        {step.id === 'description' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">What's the story? <span className="text-crwn-text-secondary text-sm font-normal">(optional)</span></h2>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Help me shoot my first real music video. Every supporter gets their name in the credits."
              className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50" />
          </div>
        )}

        {step.id === 'deadline' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Deadline <span className="text-crwn-text-secondary text-sm font-normal">(optional)</span></h2>
            <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)}
              className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text focus:outline-none focus:border-crwn-gold/50" />
          </div>
        )}

        {step.id === 'review' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-4">Review</h2>
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated divide-y divide-crwn-elevated/60">
              <Row label="Goal" value={`${goalDef.icon} ${goalDef.label}`} />
              <Row label="Title" value={title} />
              <Row label="Target" value={isMoney ? `$${goalValue}` : `${goalValue} ${goalDef.unit}`} />
              {isMoney && <Row label="Support via" value={linkedTierId ? (tiers.find(t => t.id === linkedTierId)?.name || 'Tier') : linkedProductId ? (products.find(p => p.id === linkedProductId)?.title || 'Product') : 'Your page'} />}
            </div>
            <p className="text-xs text-crwn-text-secondary mt-4">This becomes your Current Mission on your page. {isMoney ? 'Progress tracks real revenue during the campaign.' : 'Fans tap to support and the bar fills.'}</p>
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
      <span className="text-sm font-medium text-crwn-text text-right truncate">{value}</span>
    </div>
  );
}
