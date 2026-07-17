'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { smartBack } from '@/lib/navigation';
import { LeadMagnetWizard } from './LeadMagnetWizard';
import { CrwnShowcase } from './CrwnShowcase';
import { ToolShowcase } from './ToolShowcase';
import { LeadMagnetResult } from './LeadMagnetResult';
import { LeadCaptureForm, type LeadCaptureValues } from './LeadCaptureForm';
import { ResultActions } from './ResultActions';
import { ConvertToFeatureButton } from './ConvertToFeatureButton';
import { generateResult } from '@/lib/leadMagnets/resultGenerators';
import { getTool, type LeadProfileValues } from '@/lib/acquisition/toolAdapters';
import { LM_EVENTS, trackLeadMagnet, readUtm } from '@/lib/leadMagnets/analytics';
import type { GeneratedResult, LeadMagnetConfig, LeadMagnetInputValues } from '@/lib/leadMagnets/types';

// One scrollable page, no view swapping. 'hero' renders the hero AND the wizard beneath it
// (the CTA jumps down to the wizard). 'full' renders the finished result, ungated, with the
// optional email ask below it. There is no 'preview' phase any more: we do not hold the
// result hostage for an email.
type Phase = 'loading' | 'hero' | 'full';

export function PublicToolClient({ config }: { config: LeadMagnetConfig }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const wizardRef = useRef<HTMLDivElement>(null);
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
      const r =
        config.usesLossEngine && getTool(config.slug)
          ? getTool(config.slug)!.execute(v as unknown as LeadProfileValues)
          : generateResult(config.resultGeneratorKey, v);
      setResult(r);
      trackLeadMagnet(LM_EVENTS.resultGenerated, { toolSlug: config.slug, context: 'public', generatorVersion: r.generatorVersion });
      trackLeadMagnet(LM_EVENTS.resultUnlocked, { toolSlug: config.slug, context: 'public' });
      // Straight to the full result. No email wall.
      setPhase('full');
      // The wizard was mid-page; the result replaces it, so start the artist at the top of it.
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch {
      setError('Something went wrong generating your result. Please check your answers.');
    }
  };

  // The hero CTA jumps down to the wizard, which is already on the page below it.
  const scrollToWizard = () => {
    trackLeadMagnet(LM_EVENTS.started, { toolSlug: config.slug, context: 'public' });
    wizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // The hero gets a wide two-column canvas; everything after it (wizard, result) stays in
  // the narrow single-column reading width.
  return (
    <div className={`${phase === 'hero' ? 'max-w-5xl' : 'max-w-lg'} mx-auto px-4 py-6`}>
      <button onClick={() => smartBack(router, '/tools')} className="flex items-center gap-1.5 text-sm text-crwn-text-secondary mb-4">
        <ArrowLeft className="w-4 h-4" /> All tools
      </button>

      {error && <div className="mb-4 rounded-xl bg-crwn-error/10 border border-crwn-error/30 p-3 text-sm text-crwn-error">{error}</div>}

      {phase === 'hero' && (
        <>
          <Hero config={config} onStart={scrollToWizard} />

          {/* The wizard lives on the SAME page, directly below the hero. The CTA scrolls
              here rather than swapping the view, so the pitch stays one continuous page. */}
          <div ref={wizardRef} className="max-w-lg mx-auto scroll-mt-4 pt-10 md:pt-14">
            <LeadMagnetWizard
              config={config}
              context="public"
              storageKey={`lm:${config.slug}:public`}
              submitLabel="See my result"
              onComplete={onComplete}
              onClose={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            />
          </div>

          {/* Below the tool, this tool's own product mockups first (if it has any),
              then the full CRWN pitch (what it is, the product mockups, the
              comparisons, CTAs throughout), the same continuous-funnel model as /worth. */}
          <div className="max-w-2xl mx-auto">
            <ToolShowcase slug={config.slug} />
            <CrwnShowcase claimed={false} claimHref={`/signup?ref=tool-${config.slug}`} />
          </div>
        </>
      )}

      {phase === 'full' && result && (
        // The result is NOT gated. They already paid with 2-3 minutes in the wizard, so
        // walling the reward behind an email is the worst possible place to add friction.
        // Show the plan, then ask: build it in CRWN (what we actually want), or optionally
        // have it emailed. Same model as /worth.
        <div className="space-y-5">
          <LeadMagnetResult config={config} result={result} mode="full" />

          <div className="pt-1">
            <ConvertToFeatureButton config={config} result={result} context="public" publicToken={publicToken} resultId={resultId} />
          </div>

          {resultId ? (
            <ResultActions config={config} result={result} context="public" publicToken={publicToken} resultId={resultId} />
          ) : (
            <div ref={captureRef} className="scroll-mt-4 rounded-2xl bg-crwn-surface border border-crwn-elevated p-4">
              <LeadCaptureForm config={config} submitting={submitting} onSubmit={submitCapture} />
            </div>
          )}

          <button onClick={() => router.push('/tools')} className="w-full text-sm text-crwn-text-secondary">
            Explore another CRWN tool
          </button>

          {/* This tool's own mockups (the thing the result tells them to build), then
              the full CRWN pitch under it, same as the tokenized result page. */}
          <ToolShowcase slug={config.slug} />
          <CrwnShowcase claimed={false} claimHref={`/signup?ref=tool-${config.slug}`} />
        </div>
      )}
    </div>
  );
}

function Hero({ config, onStart }: { config: LeadMagnetConfig; onStart: () => void }) {
  return (
    // MOBILE: the hero claims the screen (min-h in svh, so Safari's toolbars are counted)
    // and the CTA is pushed to the bottom with mt-auto, so there is no dead space under it.
    // The photo keeps its own 4:3 ratio so it is NOT cropped, capped at 40vh so a short
    // phone (iPhone SE) still fits the CTA above the fold.
    // DESKTOP: the photo sits beside the copy, costing no vertical height.
    // Re-measure the fold on a 375x667 phone before growing any of these heights.
    <div className="flex flex-col md:grid md:grid-cols-2 md:items-center gap-5 md:gap-10 min-h-[calc(100svh-9rem)] md:min-h-0 md:py-6">
      {/* The photo keeps its native 4:3 so it is not cropped. The cap is height-aware: a
          short phone (iPhone SE, 667px) crops it to 30vh so the CTA still clears the fold,
          while any phone taller than 700px shows the FULL uncropped frame. Caps are scoped
          to max-md so they never clamp the desktop image. */}
      <div className="relative w-full aspect-[4/3] max-md:max-h-[30vh] max-md:[@media(min-height:700px)]:max-h-[45vh] md:aspect-auto md:h-[420px] shrink-0 rounded-2xl overflow-hidden border border-crwn-elevated md:order-2">
        <Image
          src={config.hero.image}
          alt={config.hero.imageAlt}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg/70 via-transparent to-transparent" />
      </div>

      <div className="flex flex-1 flex-col md:block md:order-1">
        {config.hero.eyebrow && <div className="text-xs font-semibold uppercase tracking-wide text-crwn-gold mb-2">{config.hero.eyebrow}</div>}
        <h1 className="text-3xl md:text-4xl font-bold text-crwn-text leading-tight">{config.hero.headline}</h1>
        <p className="text-base text-crwn-text-secondary mt-3 leading-relaxed">{config.hero.subheadline}</p>
        <p className="text-xs text-crwn-text-secondary mt-4">Takes about {config.timeToComplete}. Free.</p>
        <div className="mt-auto pt-5 md:mt-5 md:pt-0">
          <button
            onClick={onStart}
            className="w-full md:w-auto md:px-12 py-3.5 rounded-full bg-crwn-gold text-crwn-bg font-semibold"
          >
            {config.hero.primaryCta}
          </button>
        </div>
      </div>
    </div>
  );
}
