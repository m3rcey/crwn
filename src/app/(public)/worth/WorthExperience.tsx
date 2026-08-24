'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { DeliverableBuilder } from '@/components/opportunity/DeliverableBuilder';
import { ResultToBuilder } from '@/components/opportunity/ResultToBuilder';
import { LeadMagnetWizard } from '@/components/lead-magnets/LeadMagnetWizard';
import { ToolHero } from '@/components/lead-magnets/ToolHero';
import { WIZARD_ANCHOR_ID } from '@/components/lead-magnets/PublicToolClient';
import type { LeadMagnetConfig } from '@/lib/leadMagnets/types';
import Link from 'next/link';
import { buildContinueUrl } from '@/lib/leadMagnets/continuationCta';
import { flagshipBridgeFor } from '@/lib/leadMagnets/flagshipBridge';
import { LM_EVENTS, trackLeadMagnet } from '@/lib/leadMagnets/analytics';
import { OPPORTUNITY_EVENTS, trackOpportunity } from '@/lib/opportunityFunnels/analytics';
import { useViewportExposure } from '@/hooks/useViewportExposure';
import { Check, ChevronDown, ArrowRight } from 'lucide-react';
import { SectionImage } from '@/components/ui/SectionImage';
import { SECTION_ART } from '@/lib/positioning/sectionImages';
import {
  calculate,
  getAssumptions,
  fmtDollars,
  fmtCount,
  RECOMMENDED_TIER_PRICES,
  type AggressivenessPreset,
  type CalcAssumptions,
} from '@/lib/leadCalculator';

import { ToolMarketing } from '@/components/lead-magnets/ToolMarketing';
import { continueCtaFor } from '@/lib/leadMagnets/continuationCta';

// Primary CTA target: the scheduling page where the artist books a Zoom call.
// The event page, not the profile page. The profile page is a list of event types and costs
// the visitor an extra click at the exact moment she is deciding whether to bother.
const BOOK_CALL_URL = 'https://cal.com/jnwcreative/15min';

// The Streaming Loss calculator's feature-specific continuation CTA (single source of truth).
const MEMBERSHIP_CTA = continueCtaFor('worth'); // "Build My Membership"

// Brand gold as RGB for inline opacity steps (single-hue composition bar).

const PRESETS: { key: AggressivenessPreset; label: string }[] = [
  { key: 'conservative', label: 'Conservative' },
  { key: 'punchy', label: 'Realistic' },
  { key: 'aggressive', label: 'Optimistic' },
];

// The recommended tier blueprint the calculator's math rests on.
// `subs` maps a paid tier to its computed headcount; the free tier has none.
const TIERS: { name: string; price: string; accent: boolean; subs?: 'tier1' | 'tier2' | 'tier3'; perks: string[] }[] = [
  {
    name: 'Bronze', price: 'Free', accent: false,
    perks: ['Free tracks and public posts', 'Join the community', 'Public livestream access', 'New music after the paid windows'],
  },
  {
    name: 'Silver', price: '$10/mo', accent: false, subs: 'tier1',
    perks: ['Exclusive tracks and demos', '7-day early access', 'Private community posts', 'Vote on cover art and drops', '10% shop discount'],
  },
  {
    name: 'Gold', price: '$25/mo', accent: true, subs: 'tier2',
    perks: ['Unreleased songs and alternate versions', '14-day early access', 'A monthly Vault unlock from your archive', 'Private listening-party replays', 'Early ticket and merch access', '15% shop discount'],
  },
  {
    name: 'Platinum', price: '$100/mo', accent: false, subs: 'tier3',
    perks: ['Everything in Gold', 'Day-0 private first listen', 'Limited membership', 'Supporter credits on releases', 'Private group listening events', '20% shop discount'],
  },
];

// Every revenue stream that adds up to the number at the top of the page.

// Illustrative revenue composition (a healthy artist's mix). Single-hue bar.


// Objections written for the artist CRWN is actually for (docs/ICP.md): someone who already
// sells to their fans and is doing it across five tools that do not talk to each other. They do
// not need convincing that fans will pay. They already know. The loss is the stack.

// How it ACTUALLY works, which is self-serve.
//
// This section used to open with "1. Book a quick call", on a page (and a homepage) whose every
// other CTA is "start free" and whose builder has already prefilled the artist's offer by the time
// they read this. Naming a 15-minute Zoom as step one turns an open funnel into a human-gated one in
// copy: the artist who will not book is told there is no path for them, and the artist who will book
// is told to stop building and wait. The launch call is a real offer and it stays on the page, once,
// framed as help beside the CTA. It is not the first step.


export interface WorthPrefill {
  listeners?: string;
  followers?: string;
  streaming?: string;
}

/**
 * The Streaming Loss calculator. Two live surfaces, one implementation:
 *
 *   /worth         cold outreach (book-a-call CTA)
 *   /tools/worth/result/[token]  a lead's PERSONALIZED result from the Instagram funnel
 *
 * (The homepage stopped embedding this component in the 2026-08-13 Zero to One rebuild;
 * its marketing narrative lives in src/app/HomeMarketing.tsx. `homepage` survives only as
 * HomeFunnel's registry-missing fallback.)
 *
 * `prefill` seeds the inputs server-side for the token surface, so an artist who answered
 * one question in an Instagram DM lands on her own number, in the real calculator, with the
 * presets and sliders live. She can correct an assumption and watch it recalculate, which is
 * the whole point: a number she cannot touch is a number she does not believe.
 *
 * `claimHref` swaps the CTA to "save this to an account" instead of "book a call".
 */
export function WorthExperience({
  homepage = false,
  prefill,
  claimHref,
  resultToken,
}: {
  /**
   * Legacy-fallback flag: HomeFunnel renders `<WorthExperience homepage />` ONLY
   * if the Opportunity Calculator ever vanished from the registry. The live
   * homepage no longer embeds this component (the Zero to One rebuild,
   * 2026-08-13, gave the homepage its own narrative in HomeMarketing), so this
   * flag now just swaps the CTAs to signup and renders the nav + marketing hero.
   */
  homepage?: boolean;
  prefill?: WorthPrefill;
  claimHref?: string;
  /** Set only on a personalized result page. Persists her corrections. */
  resultToken?: string;
}) {
  const router = useRouter();
  const worthBuilderRef = useRef<HTMLDivElement>(null);
  const worthWizardRef = useRef<HTMLDivElement>(null);
  // Cold /worth starts as a one-question-per-screen wizard (matching every other calculator);
  // the homepage and a personalized lead link keep their original immediate-number experience.
  const [entryStep, setEntryStep] = useState(0);
  const [entryDone, setEntryDone] = useState(false);
  // The default IS the implied avatar: whatever number is sitting in the box tells a visitor
  // whether this tool was built for someone their size. CRWN's ICP floor is 100k monthly
  // listeners / 250k followers (docs/ICP.md), so the placeholder starts inside that band
  // instead of the old 50k, which quietly said "this is for smaller artists than you".
  const [listeners, setListeners] = useState(prefill?.listeners || '150000');
  const [followers, setFollowers] = useState(prefill?.followers || '');
  const [streaming, setStreaming] = useState(prefill?.streaming || '');
  const [preset, setPreset] = useState<AggressivenessPreset>('conservative');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced overrides (start from preset, let the artist tune down/up).
  const base = useMemo(() => getAssumptions(preset), [preset]);
  const [superfanPct, setSuperfanPct] = useState<number | null>(null);
  const [alacarte, setAlacarte] = useState<number | null>(null);

  const [email, setEmail] = useState('');
  // Marketing permission. NEVER pre-checked, and never inferred from typing an email: the breakdown
  // is transactional and sends without it. Only this box routes into the canonical prospect nurture.
  const [emailConsent, setEmailConsent] = useState(false);
  // Observed for real viewport exposure, so `capture_viewed` cannot mean "rendered off screen".
  const captureExposureRef = useRef<HTMLDivElement>(null);
  const [captureState, setCaptureState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  // Prefill inputs from URL query params so outreach links land on the artist's
  // own number, e.g. /worth?listeners=50000&followers=20000 (followers optional).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const l = params.get('listeners');
    const f = params.get('followers');
    const s = params.get('streaming');
    if (l && /\d/.test(l)) setListeners(l.replace(/\D/g, ''));
    if (f && /\d/.test(f)) setFollowers(f.replace(/\D/g, ''));
    if (s && /[\d.]/.test(s)) setStreaming(s.replace(/[^\d.]/g, ''));
  }, []);

  const assumptions: CalcAssumptions = {
    ...base,
    superfanRate: superfanPct != null ? superfanPct / 100 : base.superfanRate,
    alacarteArpuCents: alacarte != null ? alacarte * 100 : base.alacarteArpuCents,
  };

  const inputs = {
    monthlyListeners: parseInt(listeners.replace(/\D/g, ''), 10) || 0,
    engagedFollowers: parseInt(followers.replace(/\D/g, ''), 10) || 0,
    currentStreamingCents: Math.round((parseFloat(streaming.replace(/[^\d.]/g, '')) || 0) * 100),
  };

  const result = useMemo(() => calculate(inputs, assumptions), [
    inputs.monthlyListeners, inputs.engagedFollowers, inputs.currentStreamingCents,
    assumptions.superfanRate, assumptions.alacarteArpuCents, assumptions.reachRate,
  ]);

  // Persist her corrections, but ONLY on a personalized result page.
  //
  // She told us "40k" in an Instagram DM. Here she can say "actually it's 62k, and I do have
  // an email list". That correction is the most valuable thing she will give us all funnel:
  // it is a higher-trust number than anything we parsed out of a chat message, and CRWN's
  // trust ordering treats it that way.
  //
  // Debounced, because this fires on every keystroke and every slider drag. Guarded on
  // resultToken, so the homepage and /worth do exactly what they did before: nothing.
  useEffect(() => {
    if (!resultToken) return;

    const t = setTimeout(() => {
      fetch(`/api/lead-results/${encodeURIComponent(resultToken)}/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listeners: inputs.monthlyListeners,
          followers: inputs.engagedFollowers,
          streamingCents: inputs.currentStreamingCents,
        }),
      }).catch(() => {
        // Never let a failed save break the page she is reading.
      });
    }, 1500);

    return () => clearTimeout(t);
  }, [resultToken, inputs.monthlyListeners, inputs.engagedFollowers, inputs.currentStreamingCents]);

  const handleCapture = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setCaptureState('error');
      return;
    }
    // Same two capture events the registry calculators emit, so /worth is comparable in the funnel
    // instead of being a blind spot. Consent state rides on reason_code.
    trackLeadMagnet(LM_EVENTS.leadSubmitted, {
      toolSlug: 'worth',
      context: 'public',
      reasonCode: emailConsent ? 'consented' : 'no_consent',
    });
    setCaptureState('sending');
    try {
      const res = await fetch('/api/leads/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          monthlyListeners: inputs.monthlyListeners,
          netAnnualCents: result.netAnnualCents,
          netMrrCents: result.netMrrCents,
          // Explicit marketing permission, unchecked by default. The breakdown below is
          // transactional and is sent either way; only this box enrolls the canonical nurture.
          emailConsent,
          // Bind to the draft they already built so the nurture personalizes from the numbers they
          // actually read, rather than a second copy of them.
          resultToken: resultToken || undefined,
        }),
      });
      setCaptureState(res.ok ? 'done' : 'error');
    } catch {
      setCaptureState('error');
    }
  };

  const hasNumber = inputs.monthlyListeners > 0 || inputs.engagedFollowers > 0;
  const monthlyLabel = hasNumber ? `${fmtDollars(result.netMrrCents)}/mo` : 'money';
  const annualLabel = hasNumber ? fmtDollars(result.netAnnualCents) : '';

  // Assumptions controls (presets + advanced sliders), shown inside the input card.
  const assumptionsBlock = (
    <>
      <div className="mt-6">
        <div className="text-lg text-crwn-text-secondary mb-2">Assumptions</div>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`py-2 px-2 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                preset === p.key
                  ? 'bg-crwn-gold text-crwn-bg'
                  : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="mt-4 flex items-center gap-1 text-lg text-crwn-text-secondary hover:text-crwn-gold transition-colors"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        Adjust the assumptions yourself
      </button>
      {showAdvanced && (
        <div className="mt-4 space-y-5 border-t border-crwn-elevated pt-4">
          <Slider
            label="% of your audience who ever pay"
            value={superfanPct ?? Math.round(base.superfanRate * 100)}
            min={1} max={10} step={1} suffix="%"
            onChange={setSuperfanPct}
          />
          <Slider
            label="Extra spend per paying fan / mo (stems, sessions, custom work)"
            value={alacarte ?? Math.round(base.alacarteArpuCents / 100)}
            min={0} max={25} step={1} prefix="$"
            onChange={setAlacarte}
          />
          <p className="text-lg text-crwn-text-secondary/70">
            Reach: {Math.round(assumptions.reachRate * 100)}% of your audience counted as engaged · Tier prices: $
            {RECOMMENDED_TIER_PRICES.tier1PriceCents / 100} / $
            {RECOMMENDED_TIER_PRICES.tier2PriceCents / 100} / $
            {RECOMMENDED_TIER_PRICES.tier3PriceCents / 100} · Whale split 70 / 22 / 8 · Fee 8% (Pro)
          </p>
        </div>
      )}
    </>
  );

  // Supporting stats. Inside the result card on /worth; a separate card below the
  // CTA on the homepage (so the reveal pairs the number with the ask).
  const statsGrid = hasNumber ? (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
        <Stat label="Per year" value={fmtDollars(result.netAnnualCents)} />
        <Stat label="Paying superfans" value={fmtCount(result.payers)} />
        <Stat
          label="vs. streaming income"
          value={result.multipleVsStreaming ? `${Math.round(result.multipleVsStreaming)}×` : '-'}
        />
        <Stat label="Subscriptions / mo" value={fmtDollars(result.subsMrrCents)} />
        <Stat label="À la carte / mo" value={fmtDollars(result.alacarteMrrCents)} />
        <Stat label="Streaming / mo" value={fmtDollars(result.streamingMrrCents)} />
      </div>
      <p className="text-lg text-crwn-text-secondary/70 mt-4">
        Estimate from {fmtCount(result.addressable)} addressable fans ·{' '}
        {Math.round(assumptions.superfanRate * 1000) / 10}% become paying superfans. Flip the presets
        to adjust. The math is yours to check.
      </p>
    </>
  ) : null;

  const emailCaptureCard = (
    <div ref={captureExposureRef} className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-6 mb-14">
      {captureState === 'done' ? (
        <div className="flex items-center gap-2 text-crwn-gold justify-center py-2">
          <Check className="w-5 h-5" /> On its way. Check your inbox for the full breakdown.
        </div>
      ) : (
        <>
          <div className="text-center mb-4">
            <div className="font-semibold mb-1">Get your full breakdown + the setup blueprint</div>
            <div className="text-xl text-crwn-text-secondary">
              We&apos;ll email the numbers and the exact tier setup to copy.
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (captureState === 'error') setCaptureState('idle'); }}
              placeholder="you@email.com"
              className="flex-1 px-4 py-3 bg-crwn-bg border border-crwn-elevated rounded-xl text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold transition-colors"
            />
            <button
              onClick={handleCapture}
              disabled={captureState === 'sending'}
              className="px-6 py-3 bg-crwn-elevated text-crwn-text font-medium rounded-full hover:bg-crwn-elevated/70 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {captureState === 'sending' ? 'Sending…' : 'Email it to me'}
            </button>
          </div>
          {/* Explicit, unchecked marketing opt-in. The breakdown above is transactional and sends
              either way; this box is the only thing that enrolls the ongoing follow-up, and it
              carries the same scope as the registry calculators' consent copy. */}
          <label className="flex gap-3 items-start cursor-pointer mt-3">
            <input
              type="checkbox"
              className="mt-1 accent-[#D4AF37] w-4 h-4"
              checked={emailConsent}
              onChange={(e) => setEmailConsent(e.target.checked)}
            />
            <span className="text-xs text-crwn-text-secondary leading-relaxed">
              Email me my breakdown, plus the follow-up emails on how to launch it. Unsubscribe anytime.
            </span>
          </label>
          {captureState === 'error' && (
            <p className="text-xs text-red-400 mt-2 text-center">Enter a valid email and try again.</p>
          )}
        </>
      )}
    </div>
  );

  // The account/membership CTA. SPLIT OUT of the email card on 2026-08-15 and deliberately left
  // BELOW the builder: the email ask moved above the builder so it is not stranded behind the
  // builder's sticky exit, but a signup CTA above the builder would let a visitor skip the builder
  // entirely, which is the thing the page composition exists to prevent.
  const claimCtaCard = (
    <div className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-6 mb-14">
      {claimHref ? (
        <a
          href={claimHref}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold py-4 px-6 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          {MEMBERSHIP_CTA} <ArrowRight className="w-5 h-5" />
        </a>
      ) : homepage ? (
        <a
          href="/signup?ref=homepage"
          className="mt-4 w-full flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold py-4 px-6 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Set up my page free, keep this money <ArrowRight className="w-5 h-5" />
        </a>
      ) : null}
      <p className="text-center text-lg text-crwn-text-secondary mt-3">
        {claimHref
          ? 'Free to start. No card required. Your numbers save to your account.'
          : homepage
            ? 'Free to start. No card required. Set up your tiers in minutes.'
            : 'Optional. Your offer above is the real next step.'}
      </p>
    </div>
  );

  // ISSUE 2: the primary builder CTA, immediately under the "holy grail" result card, so the next
  // action is visible without scrolling past the derivation.
  const resultCta = (
    <div className="mb-6">
      <ResultToBuilder
        toolSlug="worth"
        transition="Turn this estimate into an offer your fans can join."
        buildCta="Build my membership"
        builderRef={worthBuilderRef}
      />
    </div>
  );

  // THE BUILDER: the immediate continuation of the result, on every surface including the
  // homepage. Result -> concise derivation -> this. Saving the draft carries the result
  // token into signup (buildContinueUrl), so the homepage no longer drops continuation
  // context at its highest-intent moment.
  // `scroll-mt` below is doing measured work, not spacing. On a 375x667 phone the result, stats and
  // derivation push the capture card to y=1385, and a flush `block:'start'` scroll to the builder
  // landed at 1756 with the card 0% visible, so a visitor who tapped the gold CTA never saw the
  // offer at all. The margin leaves its tail on screen. Deliberately under the 50% exposure
  // threshold on mobile, so it improves the experience without manufacturing a `capture_viewed`.
  // Applied at EVERY breakpoint here, unlike the registry calculators: /worth stacks a result card,
  // a stats grid and a derivation card above the ask, so its capture card is below the fold on
  // desktop too (measured at 1280x900), where the registry version is already ~68% visible on load.
  const builderSection = (
    <section ref={worthBuilderRef} className="mb-14 scroll-mt-[200px]">
      <SectionHeading>Turn this estimate into an offer your fans can join</SectionHeading>
      <p className="text-crwn-text-secondary text-xl mb-5 max-w-2xl mx-auto text-center">
        We prefilled it from your numbers. Edit anything. Nothing is live until you publish it.
      </p>
      <div className="max-w-lg">
        <DeliverableBuilder
          toolSlug="worth"
          conversionPayload={{
            ladder: [
              { name: 'Silver', priceCents: RECOMMENDED_TIER_PRICES.tier1PriceCents },
            ],
          }}
          opportunitySummary={hasNumber ? `${fmtDollars(result.netMrrCents)}/mo on the table` : undefined}
          onSave={(token) => router.push(buildContinueUrl('worth', token || resultToken))}
        />
      </div>
    </section>
  );

  // THE FLAGSHIP BRIDGE (founder decision 2026-08-24), same contract as the registry tools:
  // after the complete narrow result and BELOW the navigating builder, offer the whole-business
  // Opportunity Calculator with this tool as the originating context. Secondary treatment, never
  // gold: the builder above is the CTA on this page. Eligibility and copy come from the one
  // shared helper, so /worth cannot drift from the registry tools' bridge.
  const worthBridge = flagshipBridgeFor('worth');
  const flagshipBridgeCard = worthBridge ? (
    <Link
      href={worthBridge.href}
      prefetch
      onClick={() =>
        trackOpportunity(OPPORTUNITY_EVENTS.ctaClicked, {
          toolKey: 'worth',
          opportunityKey: 'crwn-opportunity',
          variant: 'flagship_bridge',
          context: 'public',
        })
      }
      className="block rounded-2xl bg-crwn-surface border border-crwn-elevated p-5 mb-14"
    >
      <div className="font-semibold text-crwn-text">{worthBridge.label}</div>
      <p className="text-crwn-text-secondary mt-1">{worthBridge.body}</p>
    </Link>
  ) : null;

  // Arrived from an Instagram comment/DM: her number is already in, so lead with the loss.
  const leadView = !!resultToken;

  // ISSUE 1: one question per screen, the same interaction model as every other CRWN calculator.
  // Scoped to the cold /worth view: the homepage keeps its instant-number marketing behavior and a
  // personalized lead link already arrives with the numbers filled in.
  // The SAME wizard component every other CRWN calculator uses (LeadMagnetWizard -> LeadMagnetField),
  // driven by a synthetic config, so /worth is pixel-consistent with the tool pages: Audience /
  // Review chips, per-step title, one question per screen, identical field and button rendering.
  const ENTRY_CONFIG = useMemo(
    () =>
      ({
        slug: 'worth',
        name: 'Streaming Loss Calculator',
        wizardSteps: [
          { id: 'listeners', group: 'Audience', title: 'How big is your audience?', subtitle: 'A rough number is fine.' },
          { id: 'followers', group: 'Audience', title: 'And your socials?', subtitle: 'Instagram, TikTok, all of it.' },
          { id: 'streaming', group: 'Audience', title: 'What does streaming pay you?', subtitle: 'Optional. We estimate it if you skip.' },
          { id: 'review', group: 'Review', title: 'Review', subtitle: 'Check your answers, then see what you are worth.' },
        ],
        inputs: [
          {
            key: 'monthly_listeners',
            type: 'number',
            label: 'Roughly how many monthly listeners do you have?',
            required: true,
            min: 0,
            max: 100000000,
            step: 'listeners',
          },
          {
            key: 'followers',
            type: 'number',
            label: 'Roughly how many followers do you have across your socials?',
            help: 'Leave blank if you are not sure.',
            min: 0,
            max: 100000000,
            step: 'followers',
          },
          {
            key: 'streaming_revenue',
            type: 'currency',
            label: 'What do you make from streaming each month?',
            help: 'Optional. We estimate it from your listeners if you leave it blank.',
            min: 0,
            max: 1000000,
            step: 'streaming',
          },
        ],
      }) as unknown as LeadMagnetConfig,
    [],
  );

  const useEntryWizard = !homepage && !leadView && !entryDone;

  // EXPOSURE, not mount, same rule as the registry calculators. `enabled` also holds it off while
  // the entry wizard is showing, because the capture card is not on that surface at all: an
  // exposure event that can fire when the card is unreachable manufactures a conversion problem
  // that does not exist.
  useViewportExposure(captureExposureRef, {
    key: 'crwn_capture_seen:worth',
    enabled: !useEntryWizard,
    onExposed: () => trackLeadMagnet(LM_EVENTS.leadCaptureViewed, { toolSlug: 'worth', context: 'public' }),
  });

  const entryWizard = (
    <div id={WIZARD_ANCHOR_ID} ref={worthWizardRef} className="max-w-lg mx-auto mb-10 scroll-mt-4 pt-10 md:pt-14">
      <LeadMagnetWizard
        config={ENTRY_CONFIG}
        context="public"
        storageKey="lm:worth:public"
        initialValues={{
          monthly_listeners: Number(listeners) || undefined,
          followers: Number(followers) || undefined,
          streaming_revenue: Number(streaming) || undefined,
        } as unknown as Record<string, never>}
        submitLabel="See what I am worth"
        onComplete={(v) => {
          const num = (x: unknown) => (Number.isFinite(Number(x)) && Number(x) > 0 ? String(Math.round(Number(x))) : '');
          if (num(v.monthly_listeners)) setListeners(num(v.monthly_listeners));
          if (num(v.followers)) setFollowers(num(v.followers));
          if (num(v.streaming_revenue)) setStreaming(num(v.streaming_revenue));
          // The canonical completion event, at the same moment PublicToolClient emits it (the
          // wizard finished and the result is about to render). /worth was the ONE calculator
          // that never emitted it, so its funnel line showed starts with zero completions and
          // the decisive stage was invisible. The wizard unmounts on entryDone, so this fires
          // once per completion; a tokenized ?result= arrival never runs the wizard and rightly
          // never emits it, mirroring the registry tools' resume semantics.
          trackLeadMagnet(LM_EVENTS.resultGenerated, { toolSlug: 'worth', context: 'public' });
          setEntryDone(true);
          // The wizard sat below a full-height hero, so unmounting it leaves the browser at that
          // scroll offset, landing mid-page instead of on the result. Same reset PublicToolClient
          // does when its result replaces the wizard.
          window.scrollTo({ top: 0, behavior: 'auto' });
        }}
      />
    </div>
  );


  const inputsCard = (
    <div className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-6 mb-4">
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Monthly listeners" hint="if you have it" value={listeners} onChange={setListeners} placeholder="150,000" />
        <Field label="Followers" hint="if you have it" value={followers} onChange={setFollowers} placeholder="250,000" />
        <Field label="Streaming $ / mo" hint="optional" value={streaming} onChange={setStreaming} placeholder="auto" prefix="$" />
      </div>
      <p className="text-lg text-crwn-text-secondary/70 mt-3">
        {leadView
          ? 'These are the numbers you gave us. Change any of them and the figure above recalculates.'
          : 'Enter whatever you have. Just monthly listeners or just followers (Instagram, TikTok) is enough, both is sharper.'}
      </p>
      {assumptionsBlock}
    </div>
  );

  const resultCard = (
    <div id="worth-result" className="scroll-mt-20 bg-gradient-to-b from-crwn-gold/10 to-crwn-surface border border-crwn-gold/30 rounded-2xl p-6 sm:p-8 mb-6 text-center">
      <div className="text-sm uppercase tracking-wide text-crwn-text-secondary mb-2">
        You&apos;re leaving roughly
      </div>
      <div className="text-5xl sm:text-6xl font-bold text-crwn-gold mb-1">
        {hasNumber ? fmtDollars(result.netMrrCents) : '-'}<span className="text-2xl sm:text-3xl font-bold">/mo</span>
      </div>
      <div className="text-crwn-text-secondary mb-6">
        on the table every month{hasNumber ? `. That's ${fmtDollars(result.netAnnualCents)} a year` : ''}
      </div>
      {/* PRIMARY CTA sits directly under the number, above the supporting stats, so it is in the
          first viewport on a phone. The derivation and everything else stay below. */}
      {resultCta}
      {statsGrid}
    </div>
  );

  // How the number was built, step by step, from HER inputs. A number she can trace is a
  // number she believes.
  const derivationCard = hasNumber ? (
    <div className="bg-crwn-surface border border-crwn-elevated rounded-2xl p-6 mb-6">
      <div className="text-sm uppercase tracking-wide text-crwn-text-secondary mb-4">
        How we got to {fmtDollars(result.netMrrCents)}/mo
      </div>
      <div className="space-y-2.5">
        <DerivRow
          n="1"
          label="Your audience"
          value={`${fmtCount(inputs.monthlyListeners)}${inputs.engagedFollowers ? ' + ' + fmtCount(inputs.engagedFollowers) + ' followers' : ' listeners'}`}
        />
        <DerivRow n="2" label={`Reachable (~${Math.round(assumptions.reachRate * 100)}%)`} value={`~${fmtCount(result.addressable)} fans`} />
        <DerivRow n="3" label={`Ever pay (~${Math.round(assumptions.superfanRate * 1000) / 10}%)`} value={`~${fmtCount(result.payers)} superfans`} />
        <DerivRow n="4" label="Memberships + à la carte" value={`${fmtDollars(result.subsMrrCents)} + ${fmtDollars(result.alacarteMrrCents)}/mo`} />
        <DerivRow n="5" label="After the 8% Pro fee" value={`${fmtDollars(result.netMrrCents)}/mo net`} highlight />
      </div>
      <p className="text-[11px] text-crwn-text-secondary/70 mt-4">
        Change your numbers below, or flip the presets, and every step recalculates.
      </p>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-crwn-bg text-crwn-text">
      {homepage && <HomeNav />}
      <div className="max-w-3xl mx-auto px-4 page-fade-in py-12 sm:py-16">
        {/* The fallback marketing view keeps its centered hero. The CALCULATOR renders the
            same tool hero as every other funnel on the cold view, and no hero at all once
            the result is on screen (the number is the headline at that point). */}
        {homepage && (
          <div className="text-center mb-8">
            <SectionImage src={SECTION_ART.reveals.src} alt={SECTION_ART.reveals.alt} />
            <h1 className="font-bold mb-3 text-3xl sm:text-4xl">
              Streaming built your reach. It cannot tell you who pays.
            </h1>
            <p className="text-crwn-text-secondary max-w-xl mx-auto text-xl sm:text-2xl">
              {'Put in your listeners and followers, and see what the paying group inside them is worth every month.'}
            </p>
          </div>
        )}

        {useEntryWizard && (
          <ToolHero
            headline="Streaming built your reach. It cannot tell you who pays."
            subheadline="Put in your listeners and followers, and see what the paying group inside them is worth every month."
            image="/hero-worth.webp"
            imageAlt="Illustration of an artist alone on a stool in a dark studio looking at a glowing phone"
            ctaLabel="See what I am worth"
            onStart={() => worthWizardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
        )}

        {/* Lead view (arrived from an Instagram comment): lead with the loss and the ask,
            then the derivation, then the inputs to adjust. Cold view: inputs first, because
            there is no number yet. */}
        {useEntryWizard ? (
          entryWizard
        ) : (
          <>
            {resultCard}
            {derivationCard}
            {/* Optional email continuation sits ABOVE the builder for the same reason it does on
                the registry calculators: `builderSection` mounts the shared DeliverableBuilder,
                whose Wizard footer is `sticky bottom-0` and whose final press navigates to signup.
                Anything after it is behind a permanently visible exit. The result and the
                derivation are both above this, so value is still delivered first, and nothing here
                gates the builder or the inputs. */}
            {emailCaptureCard}
            {builderSection}
            {flagshipBridgeCard}
            {inputsCard}
            {claimCtaCard}
          </>
        )}

        {/* THE LADDER, personalized. This section is what survived the 2026-08-14 positioning
            pass, because it is the ONE place on this page that shows economic depth from the
            artist's OWN result: their payers, split across the real rungs. That is evidence, not
            a benchmark, which is exactly the beat POSITIONING.md permits. Everything that used to
            follow it (the revenue-mix bar, the "what is CRWN" mock, the streaming comparison
            table, the six-way monetization grid and the shop mock, the objections, the steps and
            the FAQ) was a feature-led marketing stack from an older era, and two of its entries
            advertised surfaces the pre-PMF reduction has hidden. The shared Zero to One narrative
            below replaces all of it. */}
        <section className="mb-14">
          <SectionHeading>The ladder that holds it</SectionHeading>
          <p className="text-crwn-text-secondary text-xl mb-5 max-w-2xl mx-auto text-center">
            A free front door to identify everyone, then paid rungs for your most committed fans.
            The smallest rung carries the most money, which is why one flat tier stalls well short
            of your number.
            {hasNumber ? ' Here is how your ' + fmtCount(result.payers) + ' paying fans split across them:' : ''}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TIERS.map((t) => {
              const subsById: Record<string, number> = { tier1: result.tier1Subs, tier2: result.tier2Subs, tier3: result.tier3Subs };
              const count = hasNumber && t.subs ? Math.floor(subsById[t.subs]) : null;
              return (
                <div
                  key={t.name}
                  className={`rounded-2xl p-5 border ${
                    t.accent ? 'border-crwn-gold/50 bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-surface'
                  }`}
                >
                  <div className="font-semibold">{t.name}</div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-crwn-gold text-lg font-bold">{t.price}</span>
                    {count !== null && (
                      <span className="text-xs text-crwn-text-secondary">{count.toLocaleString('en-US')} fans</span>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {t.perks.map((perk) => (
                      <li key={perk} className="text-sm text-crwn-text-secondary flex items-start gap-2">
                        <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-0.5" /> {perk}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* The SHARED Zero to One narrative, identical to the one under every other promoted
            calculator. /worth keeps its own calculator internals (they work, and forcing it into
            the registry architecture would be risk for no customer gain); what it no longer keeps
            is its own private story. */}
        {/* Calculator route only. `homepage` is the degenerate fallback that renders ONLY if the
            registry ever loses the Opportunity Calculator, and it keeps its original close below
            rather than inheriting a second one. */}
        {!homepage && <ToolMarketing slug="worth" completed={hasNumber} />}

        {/* Final recap CTA, FALLBACK PATH ONLY. On the calculator route `ToolMarketing` owns the
            close, and stacking a second closing CTA under it is the duplicate-CTA problem this
            positioning pass exists to remove. */}
        {homepage && (
          <div className="bg-gradient-to-b from-crwn-gold/10 to-crwn-surface border border-crwn-gold/30 rounded-2xl p-8 text-center">
            <SectionImage src={SECTION_ART.close.src} alt={SECTION_ART.close.alt} />
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">
              Turn the audience you already built into a business you can operate.
            </h2>
            <p className="text-crwn-text-secondary">
              Set up your page free, identify the fans who actually pay, and work from one next move.
            </p>
            <PrimaryCTA homepage={homepage} claimHref={claimHref} sub="Free to start. No card required. Keep up to 95%.">
              Start free on CRWN
            </PrimaryCTA>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Presentational helpers ----

// Exported so the homepage wrapper can render the CRWN nav above the shared
// Opportunity Calculator funnel. Deliberately small (Zero to One homepage,
// 2026-08-13): two anchors into the marketing narrative below the funnel, log
// in, and ONE primary CTA that returns to the funnel at the top of the page
// (the hero if the visitor has not run the calculator, their result if they
// have). No features menu, and no hidden pre-PMF surface gets a nav slot.
export function HomeNav() {
  return (
    <nav className="sticky top-0 z-50 bg-crwn-bg/90 backdrop-blur border-b border-crwn-elevated">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <span className="text-xl font-bold text-crwn-gold">CRWN</span>
        <div className="flex items-center gap-4 text-sm">
          <a href="#how-it-works" className="hidden sm:inline text-crwn-text-secondary hover:text-crwn-text transition-colors">
            How it works
          </a>
          <a href="#pricing" className="hidden sm:inline text-crwn-text-secondary hover:text-crwn-text transition-colors">
            Pricing
          </a>
          <a href="/login" className="text-crwn-text hover:text-crwn-gold transition-colors">Log in</a>
          <button
            onClick={() => {
              // The calculator, not the top of the document. The top is a headline the visitor
              // has already read, and on a finished page it is their result, so it falls back
              // there only when there is no wizard mounted to send them to.
              const el = document.getElementById(WIZARD_ANCHOR_ID);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              else window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="bg-crwn-gold text-crwn-bg font-semibold px-4 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors"
          >
            See my opportunity
          </button>
        </div>
      </div>
    </nav>
  );
}

// Primary CTA, peppered through the page. Three destinations:
//   homepage      -> signup
//   claimHref set -> save the result to an account (the Instagram funnel)
//   otherwise     -> book a call
//
// When claimHref is set we override the per-section copy with ONE consistent ask. A lead who
// arrived from a DM already has her number in front of her; five differently-worded CTAs is
// five decisions, and the whole page should be asking her exactly one thing.
function PrimaryCTA({
  children,
  sub,
  homepage,
  claimHref,
}: {
  children: ReactNode;
  sub?: string;
  homepage?: boolean;
  claimHref?: string;
}) {
  const cls = 'inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold py-4 px-8 rounded-full hover:bg-crwn-gold/90 transition-colors';
  return (
    <div className="text-center my-12">
      {claimHref ? (
        <a href={claimHref} className={cls}>
          {MEMBERSHIP_CTA} <ArrowRight className="w-5 h-5" />
        </a>
      ) : homepage ? (
        <a href="/signup?ref=homepage" className={cls}>
          {children} <ArrowRight className="w-5 h-5" />
        </a>
      ) : (
        <a href={BOOK_CALL_URL} target="_blank" rel="noopener noreferrer" className={cls}>
          {children} <ArrowRight className="w-5 h-5" />
        </a>
      )}
      {sub && <p className="text-lg text-crwn-text-secondary mt-3">{sub}</p>}
    </div>
  );
}

// These two headings sit INSIDE the calculator flow, beside a result card and the builder, not in
// the marketing narrative. They stay plain: a full-width photograph between an artist's number and
// the offer built from it would interrupt the one sequence on this page that must not be
// interrupted. The section photography belongs to ToolMarketing, below the funnel.
function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-center">{children}</h2>;
}


// Single-hue composition bar (magnitude by opacity step, direct-labeled).

function Field({
  label, hint, value, onChange, placeholder, prefix,
}: {
  label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string; prefix?: string;
}) {
  return (
    <div>
      <label className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[10px] uppercase tracking-wide text-crwn-text-secondary/60">{hint}</span>
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-crwn-text-secondary">{prefix}</span>
        )}
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${prefix ? 'pl-7' : 'pl-4'} pr-4 py-3 bg-crwn-bg border border-crwn-elevated rounded-xl text-crwn-text placeholder-crwn-text-secondary/40 focus:outline-none focus:border-crwn-gold transition-colors`}
        />
      </div>
    </div>
  );
}

function Slider({
  label, value, min, max, step, prefix, suffix, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  prefix?: string; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xl text-crwn-text-secondary">{label}</span>
        <span className="text-sm font-semibold text-crwn-gold">{prefix}{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-crwn-gold"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-crwn-bg/40 rounded-xl p-3">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-lg text-crwn-text-secondary">{label}</div>
    </div>
  );
}

function DerivRow({ n, label, value, highlight }: { n: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full border border-crwn-gold/30 flex items-center justify-center text-[11px] font-semibold text-crwn-gold">
        {n}
      </span>
      <span className="text-crwn-text-secondary text-sm">{label}</span>
      <span className={`ml-auto font-semibold ${highlight ? 'text-crwn-gold text-lg' : 'text-crwn-text'}`}>{value}</span>
    </div>
  );
}
