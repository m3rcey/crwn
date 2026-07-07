'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Wizard, type WizardStep } from '@/components/ui/Wizard';
import { UNLOCK_TYPES, UNLOCK_TYPE_MAP, GOAL_TYPES, type UnlockType, type GoalType } from '@/lib/cityUnlocks';

const STEPS: WizardStep[] = [
  { id: 'city', group: 'City' },
  { id: 'unlock', group: 'Reward' },
  { id: 'goal-type', group: 'Goal' },
  { id: 'goal-value', group: 'Goal' },
  { id: 'message', group: 'Reward' },
  { id: 'review', group: 'Launch' },
];

export default function NewCityUnlockPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [ready, setReady] = useState(false);
  const [isArtist, setIsArtist] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [unlockType, setUnlockType] = useState<UnlockType>('event');
  const [title, setTitle] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('supporters');
  const [goalValue, setGoalValue] = useState('50');
  const [unlockMessage, setUnlockMessage] = useState('');

  const check = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
    setIsArtist(!!data); setReady(true);
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    check();
  }, [authLoading, user, router, check]);

  const step = STEPS[stepIndex];
  const canContinue = (): boolean => {
    if (step.id === 'city') return city.trim().length > 0;
    if (step.id === 'unlock') return title.trim().length > 0;
    if (step.id === 'goal-value') return parseInt(goalValue) > 0;
    return true;
  };

  const applyUnlock = (t: UnlockType) => {
    setUnlockType(t);
    if (!title && city) setTitle(`${UNLOCK_TYPE_MAP[t].label} in ${city}`);
  };

  const launch = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/city-unlocks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), targetCity: city.trim(), targetRegion: region.trim() || null, targetCountry: country.trim() || null,
          unlockType, goalType, goalValue, unlockMessage: unlockMessage.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast('City unlock live', 'success');
      router.push(`/city-unlocks/${json.unlock.id}`);
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); setSaving(false); }
  };

  if (!ready || authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">City Unlocks are for artists. Publish your artist page first.</p>
        <button onClick={() => router.push('/home')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full">Back to CRWN</button>
      </div>
    );
  }

  const unlockDef = UNLOCK_TYPE_MAP[unlockType];
  const goalDef = GOAL_TYPES.find(g => g.value === goalType);

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push('/city-unlocks')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-lg font-bold text-crwn-text">New City Unlock</h1>
      </div>

      <Wizard
        steps={STEPS} currentIndex={stepIndex}
        onBack={() => setStepIndex(i => Math.max(0, i - 1))}
        onContinue={() => { if (stepIndex >= STEPS.length - 1) launch(); else setStepIndex(i => i + 1); }}
        continueLabel={stepIndex >= STEPS.length - 1 ? 'Launch unlock' : 'Continue'}
        continueDisabled={!canContinue()} continueLoading={saving}
      >
        {step.id === 'city' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Which city?</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">Pick a city where you already have fans.</p>
            <input type="text" value={city} autoFocus onChange={e => setCity(e.target.value)} placeholder="City (e.g. St. Louis)"
              className="w-full px-4 py-3 mb-2 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50" />
            <div className="flex gap-2">
              <input type="text" value={region} onChange={e => setRegion(e.target.value)} placeholder="State (opt)"
                className="flex-1 px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50" />
              <input type="text" value={country} onChange={e => setCountry(e.target.value)} placeholder="Country (opt)"
                className="flex-1 px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50" />
            </div>
          </div>
        )}

        {step.id === 'unlock' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">What unlocks?</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">What does the city earn?</p>
            <div className="space-y-2 mb-3">
              {UNLOCK_TYPES.map(t => (
                <button key={t.value} onClick={() => applyUnlock(t.value)} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left ${unlockType === t.value ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card'}`}>
                  <span className="text-xl">{t.icon}</span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-crwn-text">{t.label}</p><p className="text-xs text-crwn-text-secondary">{t.hint}</p></div>
                  {unlockType === t.value && <Check className="w-4 h-4 text-crwn-gold shrink-0" />}
                </button>
              ))}
            </div>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title fans see"
              className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50" />
          </div>
        )}

        {step.id === 'goal-type' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">How does the city prove demand?</h2>
            <div className="space-y-2">
              {GOAL_TYPES.map(g => (
                <button key={g.value} onClick={() => setGoalType(g.value)} className={`w-full flex items-center justify-between p-3 rounded-xl border text-left ${goalType === g.value ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card'}`}>
                  <span className="text-sm text-crwn-text">{g.label}</span>{goalType === g.value && <Check className="w-4 h-4 text-crwn-gold" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step.id === 'goal-value' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Goal</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">How many {goalDef?.unit} to unlock?</p>
            <input type="number" min={1} value={goalValue} autoFocus onChange={e => setGoalValue(e.target.value)}
              className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text focus:outline-none focus:border-crwn-gold/50" />
          </div>
        )}

        {step.id === 'message' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Unlock message <span className="text-crwn-text-secondary text-sm font-normal">(optional)</span></h2>
            <p className="text-sm text-crwn-text-secondary mb-4">What fans see when the city unlocks. Keep it a next step (e.g. "Tickets drop here"), not a guarantee.</p>
            <textarea value={unlockMessage} onChange={e => setUnlockMessage(e.target.value)} rows={3} placeholder="You did it, St. Louis. Listening party details drop here Friday."
              className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50" />
          </div>
        )}

        {step.id === 'review' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-4">Review</h2>
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated divide-y divide-crwn-elevated/60">
              <Row label="City" value={[city, region, country].filter(Boolean).join(', ')} />
              <Row label="Unlocks" value={`${unlockDef.icon} ${title}`} />
              <Row label="Goal" value={`${goalValue} ${goalDef?.unit}`} />
            </div>
            <p className="text-xs text-crwn-text-secondary mt-4">Share the city link from the next screen to rally local fans.</p>
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
