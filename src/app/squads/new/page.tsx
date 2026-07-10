'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Wizard, type WizardStep } from '@/components/ui/Wizard';
import {
  SQUAD_TYPES, SQUAD_TYPE_MAP, VISIBILITY_LABELS,
  type SquadType, type SquadVisibility,
} from '@/lib/squads';
import { smartBack } from '@/lib/navigation';

const STEPS: WizardStep[] = [
  { id: 'type', group: 'Setup' },
  { id: 'name', group: 'Setup' },
  { id: 'visibility', group: 'Access' },
  { id: 'goal', group: 'Access' },
  { id: 'review', group: 'Launch' },
];

export default function NewSquadPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [ready, setReady] = useState(false);
  const [isArtist, setIsArtist] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<SquadType | null>(null);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<SquadVisibility>('invite_only');
  const [goal, setGoal] = useState('');

  const check = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).maybeSingle();
    setIsArtist(!!data);
    setReady(true);
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    check();
  }, [authLoading, user, router, check]);

  const applyType = (t: SquadType) => {
    setType(t);
    const def = SQUAD_TYPE_MAP[t];
    if (!name) setName(def.label);
    setVisibility(def.suggestedVisibility);
  };

  const step = STEPS[stepIndex];
  const canContinue = (): boolean => {
    if (step.id === 'type') return type !== null;
    if (step.id === 'name') return name.trim().length > 0;
    return true;
  };

  const launch = async () => {
    if (!type) return;
    setSaving(true);
    try {
      const res = await fetch('/api/squads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, name: name.trim(), visibility, goal: goal.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast('Squad created', 'success');
      router.push(`/squads/${json.squad.id}`);
    } catch (e: any) {
      showToast(e.message || 'Failed to create squad', 'error');
      setSaving(false);
    }
  };

  if (!ready || authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-crwn-gold" /></div>;
  }
  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Squads are for artists. Publish your artist page first.</p>
        <button onClick={() => router.push('/home')} className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full">Back to CRWN</button>
      </div>
    );
  }

  const def = type ? SQUAD_TYPE_MAP[type] : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => smartBack(router, '/squads')} className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-crwn-text">New Squad</h1>
      </div>

      <Wizard
        steps={STEPS}
        currentIndex={stepIndex}
        onBack={() => setStepIndex(i => Math.max(0, i - 1))}
        onContinue={() => { if (stepIndex >= STEPS.length - 1) launch(); else setStepIndex(i => i + 1); }}
        continueLabel={stepIndex >= STEPS.length - 1 ? 'Launch squad' : 'Continue'}
        continueDisabled={!canContinue()}
        continueLoading={saving}
      >
        {step.id === 'type' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">What kind of squad?</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">Pick a role for this team of fans.</p>
            <div className="grid grid-cols-1 gap-2">
              {SQUAD_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => applyType(t.value)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    type === t.value ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card hover:border-crwn-gold/40'
                  }`}
                >
                  <span className="text-xl">{t.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-crwn-text">{t.label}</p>
                    <p className="text-xs text-crwn-text-secondary">{t.description}</p>
                  </div>
                  {type === t.value && <Check className="w-4 h-4 text-crwn-gold shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step.id === 'name' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Name your squad</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">Fans will see this name.</p>
            <input
              type="text" value={name} autoFocus onChange={e => setName(e.target.value)}
              placeholder={def?.label || 'Squad name'}
              className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
            />
          </div>
        )}

        {step.id === 'visibility' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Who can join?</h2>
            <p className="text-sm text-crwn-text-secondary mb-4">You can change this later.</p>
            <div className="space-y-2">
              {(Object.keys(VISIBILITY_LABELS) as SquadVisibility[]).map(v => (
                <button
                  key={v} onClick={() => setVisibility(v)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                    visibility === v ? 'border-crwn-gold bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-card hover:border-crwn-gold/40'
                  }`}
                >
                  <span className="text-sm text-crwn-text">{VISIBILITY_LABELS[v]}</span>
                  {visibility === v && <Check className="w-4 h-4 text-crwn-gold" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step.id === 'goal' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-1">Squad goal <span className="text-crwn-text-secondary text-sm font-normal">(optional)</span></h2>
            <p className="text-sm text-crwn-text-secondary mb-4">What's this squad working toward?</p>
            <input
              type="text" value={goal} onChange={e => setGoal(e.target.value)}
              placeholder="e.g. 50 clips before the album drops"
              className="w-full px-4 py-3 bg-crwn-card border border-crwn-elevated rounded-xl text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
            />
          </div>
        )}

        {step.id === 'review' && (
          <div>
            <h2 className="text-lg font-semibold text-crwn-text mb-4">Review</h2>
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated divide-y divide-crwn-elevated/60">
              <ReviewRow label="Type" value={`${def?.icon || ''} ${def?.label || ''}`} />
              <ReviewRow label="Name" value={name} />
              <ReviewRow label="Who can join" value={VISIBILITY_LABELS[visibility]} />
              <ReviewRow label="Goal" value={goal || '-'} />
              {def?.badgeKey && <ReviewRow label="Members get badge" value={def.badgeKey.replace(/_/g, ' ')} />}
            </div>
            <p className="text-xs text-crwn-text-secondary mt-4">You'll add and invite members on the next screen.</p>
          </div>
        )}
      </Wizard>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-crwn-text-secondary">{label}</span>
      <span className="text-sm font-medium text-crwn-text capitalize text-right">{value}</span>
    </div>
  );
}
