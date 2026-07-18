'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { smartBack } from '@/lib/navigation';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/shared/Toast';
import { LeadMagnetWizard } from './LeadMagnetWizard';
import { LeadMagnetResult } from './LeadMagnetResult';
import { ResultActions } from './ResultActions';
import { ConvertToFeatureButton } from './ConvertToFeatureButton';
import { generateResult } from '@/lib/leadMagnets/resultGenerators';
import { getTool, type LeadProfileValues } from '@/lib/acquisition/toolAdapters';
import { LM_EVENTS, trackLeadMagnet } from '@/lib/leadMagnets/analytics';
import type { GeneratedResult, LeadMagnetConfig, LeadMagnetInputValues } from '@/lib/leadMagnets/types';

type Phase = 'loading' | 'wizard' | 'full';

export function ArtistToolClient({ config }: { config: LeadMagnetConfig }) {
  const router = useRouter();
  const { user, profile, isLoading } = useAuth();
  const { showToast } = useToast();
  const [phase, setPhase] = useState<Phase>('loading');
  const [artistId, setArtistId] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<LeadMagnetInputValues | undefined>();
  const [values, setValues] = useState<LeadMagnetInputValues>({});
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [resultId, setResultId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isLoading || !user) return;
    (async () => {
      trackLeadMagnet(LM_EVENTS.viewed, { toolSlug: config.slug, context: 'artist', authed: true });

      // Own the artist_profiles row (gate on the row, not profile.role, which lags).
      const { data: ap } = await supabase.from('artist_profiles').select('id, genres').eq('user_id', user.id).maybeSingle();
      const aId = ap?.id ?? null;
      setArtistId(aId);

      const prefill: LeadMagnetInputValues = {};
      if (config.inputs.some((i) => i.key === 'artistName') && profile?.display_name) prefill.artistName = profile.display_name;
      if (config.inputs.some((i) => i.key === 'genre') && Array.isArray(ap?.genres) && ap!.genres.length) prefill.genre = ap!.genres[0];

      const params = new URLSearchParams(window.location.search);
      const token = params.get('result');
      const existingId = params.get('resultId');

      // Import a public result created before signup.
      if (token) {
        try {
          const res = await fetch(`/api/lead-magnets/results/resume?token=${encodeURIComponent(token)}`);
          const data = await res.json();
          if (res.ok && data.inputs) {
            setInitialValues({ ...prefill, ...data.inputs });
            setPhase('wizard');
            return;
          }
        } catch {
          /* ignore */
        }
      }

      // Reopen a saved result to edit.
      if (existingId) {
        try {
          const res = await fetch(`/api/lead-magnets/results/${existingId}`);
          const data = await res.json();
          if (res.ok && data.result) {
            setInitialValues({ ...prefill, ...(data.result.input_data || {}) });
            setValues(data.result.input_data || {});
            setResult(data.result.result_data as GeneratedResult);
            setResultId(existingId);
            setSaved(true);
            setPhase('full');
            return;
          }
        } catch {
          /* ignore */
        }
      }

      setInitialValues(prefill);
      setPhase('wizard');
    })();
  }, [isLoading, user, profile?.display_name, config]);

  const onComplete = (v: LeadMagnetInputValues) => {
    setValues(v);
    try {
      const lossTool = config.usesLossEngine ? getTool(config.slug) : null;
      let r;
      if (lossTool) {
        // Currency inputs are entered in DOLLARS; loss-engine fields ending in _cents want cents.
        const profile: Record<string, unknown> = { ...v };
        for (const inp of config.inputs) {
          if (inp.type === 'currency' && inp.key.endsWith('_cents') && typeof profile[inp.key] === 'number') {
            profile[inp.key] = Math.round((profile[inp.key] as number) * 100);
          }
        }
        r = lossTool.execute(profile as unknown as LeadProfileValues);
      } else {
        r = generateResult(config.resultGeneratorKey, v);
      }
      setResult(r);
      setSaved(false);
      trackLeadMagnet(LM_EVENTS.resultGenerated, { toolSlug: config.slug, context: 'artist', authed: true, generatorVersion: r.generatorVersion });
      setPhase('full');
    } catch {
      showToast('Could not generate result. Check your answers.', 'error');
    }
  };

  const saveResult = async () => {
    if (!artistId) {
      showToast('Publish your artist page first to save results.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (resultId) {
        const res = await fetch(`/api/lead-magnets/results/${resultId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: values }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Could not save');
      } else {
        const res = await fetch('/api/lead-magnets/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artistId, toolSlug: config.slug, inputs: values }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save');
        setResultId(data.resultId);
      }
      setSaved(true);
      showToast('Saved to your tools.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (phase === 'loading' || isLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-crwn-text-secondary">Loading…</div>;
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button onClick={() => smartBack(router, '/artist/tools')} className="flex items-center gap-1.5 text-sm text-crwn-text-secondary mb-4">
        <ArrowLeft className="w-4 h-4" /> My tools
      </button>

      {phase === 'wizard' && (
        <>
          <div className="mb-5">
            <div className="text-3xl mb-2">{config.icon}</div>
            <h1 className="text-2xl font-bold text-crwn-text">{config.name}</h1>
            <p className="text-sm text-crwn-text-secondary mt-1">{config.description}</p>
          </div>
          <LeadMagnetWizard
            config={config}
            context="artist"
            initialValues={initialValues}
            storageKey={`lm:${config.slug}:artist`}
            submitLabel="Generate my result"
            onComplete={onComplete}
          />
        </>
      )}

      {phase === 'full' && result && (
        <div className="space-y-5">
          <LeadMagnetResult config={config} result={result} mode="full" />
          <ResultActions config={config} result={result} context="artist" resultId={resultId} onSave={saveResult} saving={saving} saved={saved} />
          <div className="pt-2">
            <ConvertToFeatureButton config={config} result={result} context="artist" resultId={resultId} />
            <button onClick={() => { setPhase('wizard'); setSaved(false); }} className="w-full mt-3 text-sm text-crwn-text-secondary">
              Edit my answers
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
