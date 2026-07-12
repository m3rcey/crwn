'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { smartBack } from '@/lib/navigation';
import { LeadMagnetWizard } from './LeadMagnetWizard';
import { LeadMagnetResult } from './LeadMagnetResult';
import { LeadCaptureForm, type LeadCaptureValues } from './LeadCaptureForm';
import { ResultActions } from './ResultActions';
import { ConvertToFeatureButton } from './ConvertToFeatureButton';
import { generateResult } from '@/lib/leadMagnets/resultGenerators';
import { LM_EVENTS, trackLeadMagnet, readUtm } from '@/lib/leadMagnets/analytics';
import type { GeneratedResult, LeadMagnetConfig, LeadMagnetInputValues } from '@/lib/leadMagnets/types';

// No 'capture' phase: the capture form sits INLINE beneath the preview, so the CTA
// scrolls the artist down to it instead of swapping the page out from under them.
type Phase = 'loading' | 'hero' | 'wizard' | 'preview' | 'full';

export function PublicToolClient({ config }: { config: LeadMagnetConfig }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const captureRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<LeadMagnetInputValues>({});
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [publicToken, setPublicToken] = useState<string | undefined>();
  const [resultId, setResultId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Resume from an emailed link (?result=token) or start fresh at the hero.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('result');
    trackLeadMagnet(LM_EVENTS.viewed, { toolSlug: config.slug, context: 'public', ...readUtm() });
    if (!token) {
      setPhase('hero');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/lead-magnets/results/resume?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok && data.result) {
          setResult(data.result);
          setPublicToken(token);
          setPhase('full');
          return;
        }
      } catch {
        /* fall through */
      }
      setPhase('hero');
    })();
  }, [config.slug]);

  const onComplete = (v: LeadMagnetInputValues) => {
    setValues(v);
    try {
      const r = generateResult(config.resultGeneratorKey, v);
      setResult(r);
      trackLeadMagnet(LM_EVENTS.resultGenerated, { toolSlug: config.slug, context: 'public', generatorVersion: r.generatorVersion });
      trackLeadMagnet(LM_EVENTS.previewViewed, { toolSlug: config.slug, context: 'public' });
      setPhase('preview');
    } catch {
      setError('Something went wrong generating your result. Please check your answers.');
    }
  };

  // The CTA drops the artist down to the form that is already on the page, and puts the
  // cursor in the first field, so the preview they just earned stays visible above it.
  const scrollToCapture = () => {
    trackLeadMagnet(LM_EVENTS.leadCaptureViewed, { toolSlug: config.slug, context: 'public' });
    captureRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    captureRef.current?.querySelector<HTMLInputElement>('input[type="email"]')?.focus({ preventScroll: true });
  };

  const submitCapture = async (lead: LeadCaptureValues) => {
    setSubmitting(true);
    setError('');
    try {
      const utm = readUtm();
      const res = await fetch('/api/lead-magnets/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolSlug: config.slug,
          inputs: values,
          lead: {
            email: lead.email,
            artistName: lead.artistName,
            phone: lead.phone,
            genre: lead.genre,
            socialHandle: lead.socialHandle,
            monthlyListeners: lead.monthlyListeners ? Number(lead.monthlyListeners) : undefined,
            mainGoal: lead.mainGoal,
            emailConsent: lead.emailConsent,
            smsConsent: lead.smsConsent,
          },
          utm: { source: utm.utmSource, medium: utm.utmMedium, campaign: utm.utmCampaign, content: utm.utmContent },
          sourceUrl: window.location.href.split('?')[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not unlock your result');
      setResult(data.result);
      setResultId(data.resultId);
      setPublicToken(data.publicToken);
      trackLeadMagnet(LM_EVENTS.resultUnlocked, { toolSlug: config.slug, context: 'public', resultId: data.resultId });
      setPhase('full');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unlock your result');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'loading') {
    return <div className="min-h-[60vh] flex items-center justify-center text-crwn-text-secondary">Loading…</div>;
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button onClick={() => smartBack(router, '/tools')} className="flex items-center gap-1.5 text-sm text-crwn-text-secondary mb-4">
        <ArrowLeft className="w-4 h-4" /> All tools
      </button>

      {error && <div className="mb-4 rounded-xl bg-crwn-error/10 border border-crwn-error/30 p-3 text-sm text-crwn-error">{error}</div>}

      {phase === 'hero' && <Hero config={config} onStart={() => setPhase('wizard')} />}

      {phase === 'wizard' && (
        <LeadMagnetWizard
          config={config}
          context="public"
          storageKey={`lm:${config.slug}:public`}
          submitLabel="See my result"
          onComplete={onComplete}
          onClose={() => setPhase('hero')}
        />
      )}

      {phase === 'preview' && result && (
        <div className="space-y-5">
          <LeadMagnetResult config={config} result={result} mode="preview" />
          <div className="rounded-2xl bg-crwn-elevated/60 border border-crwn-elevated p-4 text-center">
            <p className="text-sm text-crwn-text mb-3">Enter your email to unlock the full plan, and we will send you a copy.</p>
            <button onClick={scrollToCapture} className="w-full py-3 rounded-full bg-crwn-gold text-crwn-bg font-semibold">
              {config.cta.publicSecondary ? 'Unlock the full result' : 'Unlock'}
            </button>
          </div>

          <div ref={captureRef} className="scroll-mt-4">
            <LeadCaptureForm config={config} submitting={submitting} onSubmit={submitCapture} />
          </div>
        </div>
      )}

      {phase === 'full' && result && (
        <div className="space-y-5">
          <LeadMagnetResult config={config} result={result} mode="full" />
          <ResultActions config={config} result={result} context="public" publicToken={publicToken} resultId={resultId} />
          <div className="pt-2">
            <ConvertToFeatureButton config={config} result={result} context="public" publicToken={publicToken} resultId={resultId} />
            <button onClick={() => router.push('/tools')} className="w-full mt-3 text-sm text-crwn-text-secondary">
              Explore another CRWN tool
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Hero({ config, onStart }: { config: LeadMagnetConfig; onStart: () => void }) {
  return (
    <div className="py-6">
      <div className="text-4xl mb-4">{config.icon}</div>
      {config.hero.eyebrow && <div className="text-xs font-semibold uppercase tracking-wide text-crwn-gold mb-2">{config.hero.eyebrow}</div>}
      <h1 className="text-3xl font-bold text-crwn-text leading-tight">{config.hero.headline}</h1>
      <p className="text-base text-crwn-text-secondary mt-3 leading-relaxed">{config.hero.subheadline}</p>
      <p className="text-xs text-crwn-text-secondary mt-4">Takes about {config.timeToComplete}. Free.</p>
      <button onClick={onStart} className="w-full mt-6 py-3.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold">
        {config.hero.primaryCta}
      </button>
    </div>
  );
}
