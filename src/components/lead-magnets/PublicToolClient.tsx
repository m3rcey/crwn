'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { smartBack } from '@/lib/navigation';
import { LeadMagnetWizard } from './LeadMagnetWizard';
import { CrwnShowcase } from './CrwnShowcase';
import { ToolShowcase } from './ToolShowcase';
import { ToolMarketing } from './ToolMarketing';
import { hasDoorway } from '@/lib/leadMagnets/positioning';
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
import { LM_EVENTS, trackLeadMagnet, readUtm, readCampaignAttribution } from '@/lib/leadMagnets/analytics';
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

/**
 * Stable scroll anchors on the two surfaces a supporting section may legitimately
 * want to send a reader back to. They exist because a CTA that lives BELOW the funnel
 * (the homepage narrative) cannot otherwise reach the funnel's own controls: it used to
 * scroll to the top of the page, which left the qualification hand-raiser thousands of
 * pixels away and off screen while the button claimed to open it.
 *
 * They are anchors, never authority: scrolling to the hand-raiser does not qualify
 * anybody. The server still rescores every request (`decideCallRequest`).
 */
export const PLAN_ANCHOR_ID = 'crwn-plan-builder';
export const QUALIFY_ANCHOR_ID = 'crwn-launch-call';
/**
 * The calculator itself. Every homepage CTA that means "go and run this" targets the wizard,
 * NOT the top of the document: the top is a headline the visitor has already read, and on a
 * finished page it is their result. Present only while the wizard is mounted, so callers fall
 * back to the top when there is no calculator on screen to send anybody to.
 */
export const WIZARD_ANCHOR_ID = 'crwn-calculator';

/** What the `below` slot is told about the funnel above it. One bit, deliberately. */
export interface BelowContext {
  /** A result is on screen, so the builder and the hand-raiser are mounted. */
  completed: boolean;
}

export function PublicToolClient({
  config,
  surface = 'tool',
  below,
}: {
  config: LeadMagnetConfig;
  surface?: ToolSurface;
  /**
   * Route-specific supporting sections, rendered AFTER the whole funnel, at their own
   * width. Pass a function to receive the funnel's completion state (the homepage does,
   * so its closing CTAs can point at the plan the visitor just built instead of
   * re-offering a number they already have).
   */
  below?: ReactNode | ((ctx: BelowContext) => ReactNode);
}) {
  const router = useRouter();
  // The 'loading' first render exists to avoid flashing the hero at someone who
  // arrived on an emailed ?result=<token> link before the resume resolves. Every
  // one of those links is built from `config.publicRoute` (/tools/<slug>), so
  // NOTHING ever points at `/?result=`, and on the homepage that gate would only
  // cost the page its server-rendered body: the marketing sections below the
  // funnel are the homepage's SEO, and a "Loading…" placeholder ships none of
  // them. The homepage therefore starts at the hero. A token would still resume
  // (the effect sets 'full'), just with a flash nobody can reach.
  const [phase, setPhase] = useState<Phase>(surface === 'homepage' ? 'hero' : 'loading');
  // The artist is back in the wizard CORRECTING an answer after seeing the result. A number built on
  // a typo (25,000 followers instead of 250,000) used to be unfixable: the wizard unmounted with the
  // result and nothing brought it back, so the only move left was to leave. A number you cannot
  // touch is a number you do not believe.
  const [editing, setEditing] = useState(false);
  // Whether the funnel-stage events for this run have already fired. A re-run after a correction is
  // the SAME visitor completing the SAME calculator, so it must not add a second
  // `calculator_completed` / `result_revealed`; it emits `estimateRecalculated` instead, which is
  // deliberately not mirrored into `funnel_events`.
  const completedOnce = useRef(false);
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
      const isCorrection = completedOnce.current;
      if (isCorrection) {
        // A correction, not a new completion. One non-funnel event so the behavior is observable
        // without moving a single funnel ratio.
        trackOpportunity(OPPORTUNITY_EVENTS.estimateRecalculated, opportunityMeta({ resultVersion: r.generatorVersion }));
      } else {
        completedOnce.current = true;
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
      }
      // Experiment entry (inert unless an experiment is running for this experience). The server
      // derives the variant deterministically; if it assigns the 'preview' arm of the signup-timing
      // experiment, the builder moves its save boundary one step earlier. Default stays 'save'.
      // Entered ONCE per visitor: correcting an answer is not a second entry into the experiment,
      // and recording it as one would inflate the arm's denominator.
      if (config.slug === OYF_TOOL_KEY && !isCorrection) {
        const utm = readUtm();
        void recordExperimentEntry('own-your-fans', { toolKey: config.slug, sourceVideo: utm.utmContent, campaign: utm.utmCampaign }).then(
          (variant) => {
            if (variant === 'preview') setSignupBoundary('preview');
          },
        );
      }
      // Straight to the full result. No email wall.
      setEditing(false);
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
          // The normalized campaign tag (which video, angle, ManyChat keyword). Persisted onto the
          // RESULT ROW server-side, which is what carries the video past signup: the claim path
          // already binds that row to the account. Re-validated server-side; never trusted raw.
          attribution: readCampaignAttribution(),
          // Which sub-avatar funnel brought them (docs/SUB_AVATARS.md). Stored server-side on the
          // result so the acquisition cohort survives signup, instead of living only in analytics.
          entryContext,
          sourceUrl: window.location.href.split('?')[0],
        }),
      });
      const data = await res.json();
      // Nothing is being unlocked here: the result is already rendered. This ask only emails a copy.
      if (!res.ok) throw new Error(data.error || 'Could not send your result');
      setResult(data.result);
      setResultId(data.resultId);
      setPublicToken(data.publicToken);
      trackLeadMagnet(LM_EVENTS.resultUnlocked, { toolSlug: config.slug, context: 'public', resultId: data.resultId });
      setPhase('full');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your result');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'loading') {
    return <div className="min-h-[60vh] flex items-center justify-center text-crwn-text-secondary">Loading…</div>;
  }

  // The funnel's own width is phase-dependent: the hero gets a wide two-column canvas,
  // and everything after it (wizard, result, builder) stays in the narrow single-column
  // reading width a form and a result card want.
  //
  // The `below` slot must NOT inherit that. It is a page, not a card: when it rode inside
  // this wrapper the homepage narrative rendered at max-w-2xl for a fresh visitor and
  // max-w-lg for a visitor who had just completed the calculator, which made the page 16%
  // longer and visibly weaker for the highest-intent reader. It now renders once, after
  // the funnel, at its own width.
  const completed = phase === 'full' && !!result && !editing;

  // A PROMOTED tool owns a Zero to One lower page (`ToolMarketing`) instead of the generic
  // platform showcase. That showcase's mockups advertise the leaderboard, Sync, the AI actions
  // feed, the clipper program and email sequences, all of which the pre-PMF product reduction
  // hid: a promoted acquisition door may not promise a product the visitor cannot then find.
  // Paused tools keep the showcase untouched; they are out of scope for this pass and their
  // routes must keep working exactly as they did.
  const promotedMarketing = surface === 'tool' && hasDoorway(config.slug);
  const showGenericShowcase = surface === 'tool' && !promotedMarketing;

  const belowContent =
    typeof below === 'function'
      ? below({ completed })
      : (below ?? (promotedMarketing ? <ToolMarketing slug={config.slug} completed={completed} /> : null));

  return (
    <>
    <div className={`${phase === 'hero' ? 'max-w-5xl' : 'max-w-lg'} mx-auto px-4 py-6`}>
      {surface === 'tool' && (
        <button onClick={() => smartBack(router, '/tools')} className="flex items-center gap-1.5 text-sm text-crwn-text-secondary mb-4">
          <ArrowLeft className="w-4 h-4" /> All tools
        </button>
      )}

      {error && <div className="mb-4 rounded-xl bg-crwn-error/10 border border-crwn-error/30 p-3 text-sm text-crwn-error">{error}</div>}

      {phase === 'hero' && (
        <>
          {/* EVERY surface now runs the lean hero (founder call, 2026-08-15): no qualifying
              eyebrow and no "takes about N, free" line, on the calculators as well as the
              homepage, so the photo gets that height back and the headline carries the whole
              first screen. The per-surface conditional that used to live here is gone with
              them. Both remain registry DATA (the /tools directory and the automation
              dispatcher still read timeToComplete); only the hero stopped rendering them. */}
          <ToolHero
            headline={config.hero.headline}
            subheadline={config.hero.subheadline}
            image={config.hero.image}
            imageAlt={config.hero.imageAlt}
            ctaLabel={config.hero.primaryCta}
            onStart={scrollToWizard}
          />

          {/* The wizard lives on the SAME page, directly below the hero. The CTA scrolls
              here rather than swapping the view, so the pitch stays one continuous page. */}
          {/* `scroll-mt-20` clears the homepage's sticky nav when a CTA further down the page
              scrolls here by anchor; the hero CTA's own scrollIntoView uses the same offset. */}
          <div id={WIZARD_ANCHOR_ID} ref={wizardRef} className="max-w-lg mx-auto scroll-mt-20 pt-10 md:pt-14">
            <LeadMagnetWizard
              config={config}
              context="public"
              entryContext={entryContext}
              storageKey={`lm:${config.slug}:public`}
              // The submit button is the real conversion moment, so it repeats the promise the hero
              // CTA made instead of a generic "See my result": the artist clicked "See what I am
              // leaving", and that is what the button that reveals it should say.
              submitLabel={config.hero.primaryCta}
              onComplete={onComplete}
              onClose={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            />
          </div>

          {/* Below the tool: on the TOOL routes, this tool's own product mockups first
              (if it has any), then the full CRWN pitch. On the homepage the `below`
              slot (HomeMarketing) owns the entire lower page, so the generic showcase
              stays tool-route chrome and never stacks a second marketing narrative. */}
          {showGenericShowcase && (
            <div className="max-w-2xl mx-auto">
              <ToolShowcase slug={config.slug} />
              <CrwnShowcase claimed={false} claimHref={`/signup?ref=tool-${config.slug}`} />
            </div>
          )}
        </>
      )}

      {phase === 'full' && result && editing && (
        <div className="max-w-lg mx-auto">
          <LeadMagnetWizard
            config={config}
            context="public"
            entryContext={entryContext}
            initialValues={values}
            storageKey={`lm:${config.slug}:public`}
            submitLabel="Update my result"
            // Not a new start: see `trackStart`.
            trackStart={false}
            onComplete={onComplete}
            onClose={() => setEditing(false)}
          />
        </div>
      )}

      {phase === 'full' && result && !editing && (
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

          {/* The number is theirs to correct. Low emphasis, so it never competes with the builder
              below, but present: an artist who reads a figure built on a mistyped follower count
              (or who wants to see what a different answer does) has somewhere to go other than away.
              Hidden when there are no answers to adjust: a tool with no questions, or an emailed
              ?result= link resumed on a device that never ran the wizard. */}
          {config.inputs.length > 0 && Object.keys(values).length > 0 && (
            <button
              onClick={() => {
                setEditing(true);
                window.scrollTo({ top: 0, behavior: 'auto' });
              }}
              className="w-full text-sm text-crwn-text-secondary underline decoration-crwn-text-secondary/40 underline-offset-4"
            >
              These are your numbers. Change an answer and recalculate.
            </button>
          )}

          {/* OPTIONAL EMAIL CONTINUATION, above the builder. Founder decision 2026-08-15.
              THE RULE IT SATISFIES: the result is never gated, and the builder is never gated. This
              is not the same as "capture may never precede the builder", which is what the previous
              wording implied and what kept this card unreachable.

              WHY ABOVE: the builder's own primary action is `stickyFooter` (Wizard renders it
              `sticky bottom-0 z-20`), so its Continue/Save button is pinned to the viewport the
              entire time the builder is on screen, and the last press calls `router.push` to signup.
              Anything BELOW the builder therefore sits behind a permanently visible exit. Moving
              this card from "after the hand-raiser" to "directly after the builder" only shortened
              the distance to that exit; it did not remove it. Production had zero captures across
              every calculator.

              WHY IT STILL DOES NOT GATE: `ResultToBuilder` (the gold primary CTA inside the result
              above) scrolls straight to `builderRef`, so an artist who wants to build jumps past
              this card entirely. It is skippable by design, `leadCapture.required` is false on every
              tool, and nothing here blocks or precedes the RESULT itself.

              Deliberately NOT gold: the gold primary CTA is ResultToBuilder, immediately above. A
              second gold block here would read as the required next step, which is the opposite of
              what this is. */}
          {resultId ? (
            <ResultActions config={config} result={result} context="public" publicToken={publicToken} resultId={resultId} />
          ) : (
            <div ref={captureRef} className="scroll-mt-4 rounded-2xl bg-crwn-surface border border-crwn-elevated p-4">
              <LeadCaptureForm config={config} submitting={submitting} onSubmit={submitCapture} />
            </div>
          )}

          {/* THE BUILDER: the immediate continuation of the result. Carries a stable id so a
              closing CTA below the funnel can return the visitor to the plan they built. */}
          {/* `scroll-mt` is doing real work on small screens, not spacing. Measured on a 375x667
              phone: the result plus its disclaimer occupy 588px, so the capture card starts below
              the fold, and a `block:'start'` scroll to the builder used to land it flush at the top
              with the card 0% visible. A visitor who tapped the gold CTA immediately therefore never
              saw the offer at all. A ~200px margin lands the builder just below the fold line and
              leaves the tail of the capture card (its consent line and button) on screen, so the
              offer is glimpsed rather than skipped. Deliberately BELOW the 50% exposure threshold,
              so this improves the experience without manufacturing a `capture_viewed`. Desktop
              already shows the card at ~68% on load and keeps the tighter margin. */}
          <div id={PLAN_ANCHOR_ID} ref={builderRef} className="scroll-mt-[200px] sm:scroll-mt-4 pt-1">
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
              founder alert fires; unqualified requests are recorded, never alerted. It sits after
              the email ask deliberately: this is the higher-commitment rung of the same ladder. */}
          {config.slug === 'opportunity-calculator' && (
            <div id={QUALIFY_ANCHOR_ID} className="scroll-mt-4">
              <CallRequestCard
                toolSlug={config.slug}
                calculatorInputs={values}
                planSummary={result.heroValue ? `${result.heroValue}${result.heroSuffix || ''} system` : result.headline}
                publicToken={publicToken}
              />
            </div>
          )}

          {surface === 'tool' && (
            <button onClick={() => router.push('/tools')} className="w-full text-sm text-crwn-text-secondary">
              Explore another CRWN tool
            </button>
          )}

          {/* Supporting content, last: this tool's own mockups, then the CRWN app
              explanation. Tool routes only; the homepage's `below` slot owns its lower page. */}
          {showGenericShowcase && (
            <>
              <ToolShowcase slug={config.slug} />
              <CrwnShowcase claimed={false} claimHref={`/signup?ref=tool-${config.slug}`} />
            </>
          )}
        </div>
      )}
    </div>

    {/* Route-specific supporting sections, LAST and at their own width, so the page
        below the funnel does not get narrower just because the visitor finished it. */}
    {belowContent && <div className="max-w-2xl mx-auto px-4 pb-6">{belowContent}</div>}
    </>
  );
}

