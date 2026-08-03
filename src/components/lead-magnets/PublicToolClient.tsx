'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { smartBack } from '@/lib/navigation';
import { LeadMagnetWizard } from './LeadMagnetWizard';
import { CrwnShowcase } from './CrwnShowcase';
import { ToolShowcase } from './ToolShowcase';
import { LeadMagnetResult } from './LeadMagnetResult';
import { ToolHero } from './ToolHero';
import { buildContinueUrl } from '@/lib/leadMagnets/continuationCta';
import { ResultToBuilder } from '@/components/opportunity/ResultToBuilder';
import { transitionFor, buildCtaFor } from '@/lib/opportunityDrafts/deliverableSpecs';
import { LeadCaptureForm, type LeadCaptureValues } from './LeadCaptureForm';
import { ResultActions } from './ResultActions';
import { ConvertToFeatureButton } from './ConvertToFeatureButton';
import { generateResult } from '@/lib/leadMagnets/resultGenerators';
import { resolveEntryContext } from '@/lib/leadMagnets/entryContext';
import { getTool, type LeadProfileValues } from '@/lib/acquisition/toolAdapters';
import { LM_EVENTS, trackLeadMagnet, readUtm } from '@/lib/leadMagnets/analytics';
import { OPPORTUNITY_EVENTS, JOURNEY_EVENTS, trackOpportunity, type OpportunityEventMeta } from '@/lib/opportunityFunnels/analytics';
import { getFunnelByToolKey } from '@/lib/opportunityFunnels/registry';
import { FanCaptureBuilder } from '@/components/opportunity/FanCaptureBuilder';
import { DeliverableBuilder } from '@/components/opportunity/DeliverableBuilder';
import { hasDeliverable } from '@/lib/opportunityDrafts/deliverableSpecs';
import { OYF_TOOL_KEY, type OwnYourFansDraft } from '@/lib/opportunityDrafts/ownYourFansDraft';
import { recordExperimentEntry } from '@/lib/experiments/client';
import { CallRequestCard } from './CallRequestCard';
import type { GeneratedResult, LeadMagnetConfig, LeadMagnetInputValues } from '@/lib/leadMagnets/types';

// One scrollable page, no view swapping. 'hero' renders the hero AND the wizard beneath it
// (the CTA jumps down to the wizard). 'full' renders the finished result, ungated, with the
// optional email ask below it. There is no 'preview' phase any more: we do not hold the
// result hostage for an email.
type Phase = 'loading' | 'hero' | 'full';

/**
 * Where this funnel is mounted. 'tool' is /tools/[slug] (unchanged default).
 * 'homepage' is `/`, which reuses this EXACT composition rather than owning a
 * second calculator: the only differences are the chrome (no "All tools" back
 * control, its own nav above), the signup ref, and a `surface` dimension on the
 * funnel analytics so homepage and tool traffic stay distinguishable.
 */
export type ToolSurface = 'tool' | 'homepage';

export function PublicToolClient({
  config,
  surface = 'tool',
  below,
}: {
  config: LeadMagnetConfig;
  surface?: ToolSurface;
  /** Route-specific supporting sections, rendered AFTER the whole funnel. */
  below?: ReactNode;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  // Signup-timing experiment variant for the Own Your Fans builder. 'save' = control (current).
  const [signupBoundary, setSignupBoundary] = useState<'save' | 'preview'>('save');
  // Anchor for the result-to-builder transition ("the builder is the CTA").
  const builderRef = useRef<HTMLDivElement>(null);
  const wizardRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<LeadMagnetInputValues>({});
  // Which opportunity's video/keyword sent them here (?from=vault-revenue-planner). Reorders the
  // wizard so a single-opportunity campaign does not land on a generic questionnaire.
  const [entryContext, setEntryContext] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [publicToken, setPublicToken] = useState<string | undefined>();
  const [resultId, setResultId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Base attribution for the shared Opportunity Funnel events. Non-sensitive dimensions only; the
  // tracker sanitizes again before anything leaves the browser.
  const opportunityMeta = (extra?: Partial<OpportunityEventMeta>): OpportunityEventMeta => {
    const funnel = getFunnelByToolKey(config.slug);
    const utm = readUtm();
    return {
      opportunityKey: funnel?.opportunityKey ?? config.slug,
      toolKey: config.slug,
      toolVersion: funnel?.toolVersion,
      resultVersion: funnel?.resultVersion,
      utmSource: utm.utmSource,
      utmMedium: utm.utmMedium,
      utmCampaign: utm.utmCampaign,
      utmContent: utm.utmContent,
      referralSource: utm.source,
      // Already resolved against the tool's declared entry contexts, so this is never raw URL text.
      entryContext: entryContext ?? undefined,
      context: 'public',
      // Which page this funnel ran on. Same events, same names: one extra
      // dimension so homepage traffic is separable from /tools traffic.
      surface,
      ...extra,
    };
  };

  // Resume from an emailed link (?result=token) or start fresh at the hero.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('result');
    setEntryContext(resolveEntryContext(config, params.get('from')));
    trackLeadMagnet(LM_EVENTS.viewed, { toolSlug: config.slug, context: 'public', ...readUtm() });
    trackOpportunity(OPPORTUNITY_EVENTS.funnelViewed, opportunityMeta());
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
          trackOpportunity(OPPORTUNITY_EVENTS.resultViewed, opportunityMeta({ resultVersion: data.result?.generatorVersion }));
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
      trackLeadMagnet(LM_EVENTS.resultGenerated, { toolSlug: config.slug, context: 'public', generatorVersion: r.generatorVersion });
      trackLeadMagnet(LM_EVENTS.resultUnlocked, { toolSlug: config.slug, context: 'public' });
      trackOpportunity(OPPORTUNITY_EVENTS.funnelCompleted, opportunityMeta({ resultVersion: r.generatorVersion }));
      trackOpportunity(OPPORTUNITY_EVENTS.resultViewed, opportunityMeta({ resultVersion: r.generatorVersion }));
      trackOpportunity(OPPORTUNITY_EVENTS.recommendationViewed, opportunityMeta({ resultVersion: r.generatorVersion }));
      // A result that models several opportunities at once has to show what it deliberately did
      // NOT add together. Recording that the disclosure was shown is how we can tell later whether
      // artists actually read it.
      if (r.sections.some((s) => s.key === 'overlap')) {
        trackOpportunity(OPPORTUNITY_EVENTS.overlapExplained, opportunityMeta({ resultVersion: r.generatorVersion }));
      }
      // Experiment entry (inert unless an experiment is running for this experience). The server
      // derives the variant deterministically; if it assigns the 'preview' arm of the signup-timing
      // experiment, the builder moves its save boundary one step earlier. Default stays 'save'.
      if (config.slug === OYF_TOOL_KEY) {
        const utm = readUtm();
        void recordExperimentEntry('own-your-fans', { toolKey: config.slug, sourceVideo: utm.utmContent, campaign: utm.utmCampaign }).then(
          (variant) => {
            if (variant === 'preview') setSignupBoundary('preview');
          },
        );
      }
      // Straight to the full result. No email wall.
      setPhase('full');
      // The wizard was mid-page; the result replaces it, so start the artist at the top of it.
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch {
      setError('Something went wrong generating your result. Please check your answers.');
    }
  };

  // Own Your Fans save boundary: the artist has built a fan-capture page and now needs an account to
  // keep it. Route through the EXISTING signup with the durable draft token so auto-claim binds it.
  const onFinishFanPage = (token: string | null, _draft: OwnYourFansDraft) => {
    trackOpportunity(JOURNEY_EVENTS.signupStartedFromOpportunity, {
      opportunityKey: 'own-your-fans',
      toolKey: OYF_TOOL_KEY,
      resultVersion: 'lossResult@1',
    });
    router.push(buildContinueUrl(OYF_TOOL_KEY, token || publicToken));
  };

  // The universal save boundary: the artist built and previewed a real deliverable, and now needs an
  // account to keep it. Route through the EXISTING signup with the durable draft token so auto-claim
  // binds it and the resolver restores them exactly here.
  const onSaveDeliverable = (token: string | null) => {
    trackOpportunity(JOURNEY_EVENTS.signupStartedFromOpportunity, {
      opportunityKey: config.slug,
      toolKey: config.slug,
    });
    router.push(buildContinueUrl(config.slug, token || publicToken));
  };

  // The hero CTA jumps down to the wizard, which is already on the page below it.
  const scrollToWizard = () => {
    trackLeadMagnet(LM_EVENTS.started, { toolSlug: config.slug, context: 'public' });
    trackOpportunity(OPPORTUNITY_EVENTS.funnelStarted, opportunityMeta());
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
      {surface === 'tool' && (
        <button onClick={() => smartBack(router, '/tools')} className="flex items-center gap-1.5 text-sm text-crwn-text-secondary mb-4">
          <ArrowLeft className="w-4 h-4" /> All tools
        </button>
      )}

      {error && <div className="mb-4 rounded-xl bg-crwn-error/10 border border-crwn-error/30 p-3 text-sm text-crwn-error">{error}</div>}

      {phase === 'hero' && (
        <>
          <ToolHero
            eyebrow={config.hero.eyebrow}
            headline={config.hero.headline}
            subheadline={config.hero.subheadline}
            timeToComplete={config.timeToComplete}
            image={config.hero.image}
            imageAlt={config.hero.imageAlt}
            ctaLabel={config.hero.primaryCta}
            onStart={scrollToWizard}
          />

          {/* The wizard lives on the SAME page, directly below the hero. The CTA scrolls
              here rather than swapping the view, so the pitch stays one continuous page. */}
          <div ref={wizardRef} className="max-w-lg mx-auto scroll-mt-4 pt-10 md:pt-14">
            <LeadMagnetWizard
              config={config}
              context="public"
              entryContext={entryContext}
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
            <CrwnShowcase claimed={false} claimHref={surface === 'homepage' ? '/signup?ref=homepage' : `/signup?ref=tool-${config.slug}`} />
            {/* Route-specific supporting sections, LAST: the homepage keeps its
                existing marketing sections here, below the whole funnel. */}
            {below}
          </div>
        </>
      )}

      {phase === 'full' && result && (
        // Universal Opportunity Funnel page order: result -> transition -> BUILDER -> save boundary,
        // then (and only then) secondary actions and supporting content. The builder IS the CTA.
        // No signup link, email gate, or booking block may appear before the builder.
        <div className="space-y-5">
          <LeadMagnetResult
            config={config}
            result={result}
            mode="full"
            afterHero={
              <ResultToBuilder
                toolSlug={config.slug}
                transition={config.slug === OYF_TOOL_KEY ? 'Turn this into a fan page you actually own.' : transitionFor(config.slug)}
                buildCta={config.slug === OYF_TOOL_KEY ? 'Build my fan page' : buildCtaFor(config.slug)}
                builderRef={builderRef}
              />
            }
          />

          {/* THE BUILDER: the immediate continuation of the result. */}
          <div ref={builderRef} className="scroll-mt-4 pt-1">
            {config.slug === OYF_TOOL_KEY ? (
              <FanCaptureBuilder
                mode="anonymous"
                inputs={{ social_followers: Number(values.social_followers) || 0 }}
                signupBoundary={signupBoundary}
                onFinish={onFinishFanPage}
                finishLabel="Save my fan system"
              />
            ) : hasDeliverable(config.slug) ? (
              <DeliverableBuilder
                toolSlug={config.slug}
                conversionPayload={(result.conversionPayload || {}) as Record<string, unknown>}
                opportunitySummary={result.heroValue ? `${result.heroValue}${result.heroSuffix || ''}` : result.headline}
                onSave={onSaveDeliverable}
              />
            ) : (
              <ConvertToFeatureButton config={config} result={result} context="public" publicToken={publicToken} resultId={resultId} />
            )}
          </div>

          {/* Optional hand-raiser, BELOW the builder (nothing may gate the builder): a qualified
              artist can request an immediate launch call. The server alone decides whether a
              founder alert fires; unqualified requests are recorded, never alerted. */}
          {config.slug === 'opportunity-calculator' && (
            <CallRequestCard
              toolSlug={config.slug}
              calculatorInputs={values}
              planSummary={result.heroValue ? `${result.heroValue}${result.heroSuffix || ''} system` : result.headline}
              publicToken={publicToken}
            />
          )}

          {/* Secondary action, BELOW the builder: optional "email my results" with real consent
              (persists the result + nurture attribution). Clearly subordinate to the save boundary. */}
          {resultId ? (
            <ResultActions config={config} result={result} context="public" publicToken={publicToken} resultId={resultId} />
          ) : (
            <div ref={captureRef} className="scroll-mt-4 rounded-2xl bg-crwn-surface border border-crwn-elevated p-4">
              <LeadCaptureForm config={config} submitting={submitting} onSubmit={submitCapture} />
            </div>
          )}

          {surface === 'tool' && (
            <button onClick={() => router.push('/tools')} className="w-full text-sm text-crwn-text-secondary">
              Explore another CRWN tool
            </button>
          )}

          {/* Supporting content, last: this tool's own mockups, then the CRWN app explanation. */}
          <ToolShowcase slug={config.slug} />
          <CrwnShowcase claimed={false} claimHref={surface === 'homepage' ? '/signup?ref=homepage' : `/signup?ref=tool-${config.slug}`} />
          {below}
        </div>
      )}
    </div>
  );
}

