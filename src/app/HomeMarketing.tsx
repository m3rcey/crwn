'use client';

// The homepage marketing narrative (Zero to One homepage rebuild 2026-08-13, tightened
// after the pre-traffic visual audit 2026-08-14).
//
// Renders BELOW the shared Opportunity Calculator funnel via HomeFunnel's `below` slot,
// so the marketing page begins only after the primary funnel (hero -> wizard -> result ->
// builder -> save boundary). It owns the ENTIRE lower homepage: the generic platform
// showcase is tool-route chrome and does not render on the homepage surface.
//
// Contract (pinned by pageComposition.test.ts):
//   - No second calculator, result, builder, or qualification component: this file is
//     presentation only and fires no funnel analytics, so it cannot double-count the
//     events emitted above it.
//   - Every claim traces to docs/POSITIONING.md (category, loop, claim-maturity table).
//     No network-effect or cross-artist intelligence claims until those systems ship.
//   - Pricing renders from TIER_PRICING / TIER_LIMITS, never restated from memory, and
//     never describes a paid plan as costing nothing until the artist earns.
//   - The First Revenue Launch section reuses the EXISTING qualification architecture.
//     "See if I qualify" scrolls to the funnel's own hand-raiser (CallRequestCard) when a
//     result is on screen, and otherwise returns the visitor to the calculator, because
//     qualification is scored server-side from those answers (decideCallRequest). It
//     never asserts eligibility, opens a scheduler, or posts an application.
//   - No fabricated social proof. The trust strip states the principles the product
//     actually keeps today; real case studies can be added inside that section later.
//   - The "one next move" claim is made ONCE, in the operating-loop section.

import { ArrowRight, ArrowDown, Check } from 'lucide-react';
import { SectionImage } from '@/components/ui/SectionImage';
import { SECTION_ART } from '@/lib/positioning/sectionImages';
import { TIER_PRICING, TIER_LIMITS } from '@/lib/platformTier';
import { PLAN_ANCHOR_ID, QUALIFY_ANCHOR_ID } from '@/components/lead-magnets/PublicToolClient';
// The canonical story is SHARED with every promoted calculator's lower page
// (src/lib/positioning/story.ts). Six acquisition doors drifted apart once; the fix is one
// source for the path, the loop and the First Revenue Launch offer, not six careful copies.
import {
  PATH_STEPS,
  LOOP,
  FRL_BODY,
  FRL_CAPACITY_NOTE,
  GUARANTEE_TITLE,
  GUARANTEE_BODY,
} from '@/lib/positioning/story';

// The funnel lives at the top of this page. A visitor who has not run it belongs back
// there; a visitor who has belongs at the specific control they asked for.
const scrollToFunnel = () => window.scrollTo({ top: 0, behavior: 'smooth' });

const scrollToAnchor = (id: string): boolean => {
  const el = typeof document === 'undefined' ? null : document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
};

const FRAGMENTED_STACK = [
  'Memberships in one tool',
  'Merch and products in a store',
  'Email contacts in a list manager',
  'Tickets in a ticketing platform',
  'Community in a chat app',
  'Followers on social platforms',
];

const CRWN_SIDE = [
  'One fan relationship',
  'One economic record',
  'One operating system',
  'One next move',
];


// The trust strip under the loop. Every line is on the allowed-today list in
// POSITIONING.md section 23. Real case studies slot into this section later.
const TRUST = [
  { name: 'Your numbers', body: 'The result is computed from your inputs, and it changes when they change.' },
  { name: 'Assumptions you can check', body: 'Every rate the math uses is visible and adjustable.' },
  { name: 'The reason for the move', body: 'Each recommendation shows the evidence it was chosen on.' },
];

// Core capabilities grouped into the four economic jobs required to understand the
// promise (POSITIONING.md section 20: no feature is ever the headline). Only surfaces in
// the current default product are described; hidden pre-PMF surfaces are not advertised.
const JOBS: { job: string; body: string }[] = [
  {
    job: 'Build what fans can buy',
    body: 'An offer builder and a membership ladder, so your most committed fans have somewhere to go. The higher rungs are where most recurring revenue lives.',
  },
  {
    job: 'Monetize the direct fan relationship',
    body: 'Your music, albums and products in one storefront, with premium access for members, so years of catalog stop earning only streaming rates.',
  },
  {
    job: 'Deliver what you sold',
    body: 'Live moments your members show up for, and a running record of what you promised each tier and when it is due.',
  },
  {
    job: 'See who creates the value',
    body: 'Who actually pays you, what each relationship is worth, and what you still owe them, in one place. That record is what your next move is calculated from.',
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'I already use Patreon, Shopify, Discord and a mailing tool.',
    a: 'Then you already proved the model, and you are running it across tools that cannot see the same fan. Each one does its job. What none of them can do, alone or together, is show you the whole economic relationship or tell you what to do next. Keep any tool for as long as it earns its place, and keep releasing on streaming exactly as you do now: that is your discovery engine, and CRWN works on the direct side.',
  },
  {
    q: 'Will I have to move everything at once?',
    a: 'No. Most artists start by importing their fan contacts (a CSV works, and a Patreon member export is recognized automatically, with tier matching suggested) and building the ladder. Products and catalog follow at your pace. For qualified artists on the assisted launch, CRWN does the migration work with you by hand.',
  },
  {
    q: 'I do not have time to run another platform.',
    a: 'The time you are spending now is the fragmented version: five logins, no shared record, and every decision made from memory. CRWN hands you one next move instead of another dashboard, and it tracks what you promised fans so keeping your word does not depend on remembering it.',
  },
  {
    q: 'What does CRWN cost?',
    a: 'A free plan and two paid plans, listed above. Launch has no monthly fee: you pay the platform percentage only when you earn. Pro and Scale add a monthly subscription and take a lower percentage as the business grows.',
  },
  {
    q: 'What happens first after I sign up?',
    a: 'A short setup: your artist page, the recommended four-rung ladder with the workload each promise creates shown before you commit, payments, and your first import of warm fans. Then the roadmap points you at one thing: your first paid member.',
  },
];

const PLANS: { name: string; monthly: number; feePercent: number; line: string }[] = [
  {
    name: 'Launch',
    monthly: 0,
    feePercent: TIER_LIMITS.starter.platformFeePercent,
    line: 'Prove your first direct-to-fan offer.',
  },
  {
    name: 'Pro',
    monthly: TIER_PRICING.pro.monthlyDisplay,
    feePercent: TIER_LIMITS.pro.platformFeePercent,
    line: 'Operate a serious direct-to-fan business.',
  },
  {
    name: 'Scale',
    monthly: TIER_PRICING.scale.monthlyDisplay,
    feePercent: TIER_LIMITS.scale.platformFeePercent,
    line: 'Higher volume, with a team behind it.',
  },
];

function Eyebrow({ children, art }: { children: React.ReactNode; art?: { src: string; alt: string } }) {
  return (
    <>
      {art && <SectionImage src={art.src} alt={art.alt} />}
      <p className="text-[11px] uppercase tracking-[0.2em] text-crwn-gold font-semibold mb-3">{children}</p>
    </>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl sm:text-3xl font-bold leading-tight mb-4">{children}</h2>;
}

function Cta({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) {
  return (
    <div className="text-center">
      <button
        onClick={onClick}
        className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold py-4 px-8 rounded-full hover:bg-crwn-gold/90 transition-colors"
      >
        {label} <ArrowRight className="w-5 h-5" />
      </button>
      {sub && <p className="text-sm text-crwn-text-secondary mt-3">{sub}</p>}
    </div>
  );
}

export function HomeMarketing({ completed = false }: { completed?: boolean }) {
  // The hand-raiser only exists once the calculator has produced a result, which is
  // exactly the prerequisite for qualification: the score is derived from those answers.
  // So a fresh visitor is returned to the calculator rather than to a control that would
  // ask them for a phone number CRWN could not yet score.
  const goToQualification = () => {
    if (!scrollToAnchor(QUALIFY_ANCHOR_ID)) scrollToFunnel();
  };

  // The close. Before completion it re-offers the calculator; after completion it returns
  // the visitor to the plan they built, because they already have the number.
  const goToContinuation = () => {
    if (!completed || !scrollToAnchor(PLAN_ANCHOR_ID)) scrollToFunnel();
  };

  return (
    <div className="mt-20 space-y-24 text-crwn-text">
      <div className="border-t border-crwn-elevated" />

      {/* A. THE FRAGMENTATION PROBLEM */}
      <section>
        <Eyebrow art={SECTION_ART.problem}>The problem</Eyebrow>
        <H2>Your audience is visible. Your fan economy isn&apos;t.</H2>
        <p className="text-crwn-text-secondary text-lg leading-relaxed mb-8">
          You already sell direct. The proof is spread across a membership tool, a store, an email
          list, a ticketing platform and a chat server. Each one sees its own piece of the fan.
          None of them can see the whole relationship, so the decision about what to do next still
          lives in your head. The cost is not the software bills. It is the fans who already proved
          they would buy from you, sitting in six lists nobody is deliberately building.
        </p>
        {/* The transformation has to read on a phone too: the horizontal arrow becomes a
            vertical one when the columns stack, or the two cards read as unrelated lists.
            Cards are content-aligned rather than stretched, so the shorter CRWN side looks
            deliberate instead of half empty. */}
        <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-4 items-start">
          <div className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-5">
            <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-3">
              The fragmented stack
            </p>
            <ul className="space-y-2">
              {FRAGMENTED_STACK.map((t) => (
                <li key={t} className="text-sm text-crwn-text-secondary border-b border-crwn-elevated/60 pb-2 last:border-0 last:pb-0">
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-center sm:h-full">
            <ArrowDown className="w-6 h-6 text-crwn-gold sm:hidden" aria-hidden="true" />
            <ArrowRight className="hidden sm:block w-6 h-6 text-crwn-gold" aria-hidden="true" />
          </div>
          <div className="rounded-2xl border border-crwn-gold/40 bg-gradient-to-b from-crwn-gold/10 to-crwn-surface p-5">
            <p className="text-[11px] uppercase tracking-wide text-crwn-gold mb-3">CRWN</p>
            <ul className="space-y-3">
              {CRWN_SIDE.map((t) => (
                <li key={t} className="flex items-start gap-2 text-base font-medium">
                  <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-1" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* B. THE FIRST-REVENUE PATH */}
      <section id="how-it-works" className="scroll-mt-20">
        <Eyebrow art={SECTION_ART.path}>The path</Eyebrow>
        <H2>Turn the audience you already built into a business you can operate.</H2>
        <div className="space-y-0">
          {PATH_STEPS.map((s, i) => (
            <div key={s.name} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-crwn-gold/15 border border-crwn-gold/40 flex items-center justify-center text-sm font-bold text-crwn-gold shrink-0">
                  {i + 1}
                </div>
                {i < PATH_STEPS.length - 1 && <div className="w-px flex-1 bg-crwn-elevated my-1" />}
              </div>
              <div className={i < PATH_STEPS.length - 1 ? 'pb-7' : ''}>
                <p className="font-semibold">{s.name}</p>
                <p className="text-crwn-text-secondary text-sm leading-relaxed mt-1">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* C. THE CRWN OPERATING LOOP, and the trust strip that used to be its own section.
          This is the ONE place the next-move claim is made in full. */}
      <section>
        <Eyebrow art={SECTION_ART.operatingSystem}>The operating system</Eyebrow>
        <H2>One fan economy. One next move.</H2>
        <p className="text-crwn-text-secondary text-lg leading-relaxed mb-6">
          Most tools give you the numbers and leave the next decision to you. CRWN shows you the one
          move your numbers support next, tracks what you promised fans, and measures what changed.
        </p>
        <p className="text-lg font-semibold mb-8">
          {LOOP.map((w) => (
            <span key={w} className="mr-2 inline-block">
              {w}
            </span>
          ))}
        </p>
        {/* A representative example of the surface, not a diagnosis of the reader: it renders
            no numbers, because a number here would claim CRWN measured this visitor. */}
        <div className="rounded-2xl border border-crwn-gold/30 bg-gradient-to-b from-crwn-gold/10 to-crwn-surface p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-crwn-gold font-semibold mb-2">
            Your next move
          </p>
          <p className="text-lg font-semibold leading-snug">
            Invite the buyers you already have before the public launch
          </p>
          <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mt-4 mb-1">
            Why this
          </p>
          <p className="text-sm text-crwn-text-secondary leading-relaxed">
            Fans who bought from you before are the most likely first members, and they cannot
            join an offer nobody has put in front of them.
          </p>
          <p className="text-sm text-crwn-text-secondary mt-4">
            After this: open the offer to the rest of your list.
          </p>
        </div>
        <p className="text-xs text-crwn-text-secondary/70 mt-3">
          A representative example. Your move is derived from your own account.
        </p>

        <div className="grid sm:grid-cols-3 gap-x-6 gap-y-4 mt-10 pt-8 border-t border-crwn-elevated">
          {TRUST.map((t) => (
            <div key={t.name}>
              <p className="text-[11px] uppercase tracking-wide text-crwn-gold mb-1.5">{t.name}</p>
              <p className="text-sm text-crwn-text-secondary leading-relaxed">{t.body}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-crwn-text-secondary mt-5">
          And when there is not enough evidence to be sure, CRWN tells you that instead of guessing.
        </p>
      </section>

      {/* D. FIRST REVENUE LAUNCH (assisted path). Layered on top of self-serve, never a gate. */}
      <section>
        <Eyebrow art={SECTION_ART.launch}>First Revenue Launch</Eyebrow>
        <H2>Want us to launch it with you?</H2>
        <p className="text-crwn-text-secondary text-lg leading-relaxed mb-6">{FRL_BODY}</p>
        <div className="rounded-2xl border border-crwn-gold/30 bg-crwn-surface p-6 mb-6">
          <p className="font-semibold mb-2">{GUARANTEE_TITLE}</p>
          <p className="text-sm text-crwn-text-secondary leading-relaxed">{GUARANTEE_BODY}</p>
        </div>
        <p className="text-sm text-crwn-text-secondary leading-relaxed mb-8">{FRL_CAPACITY_NOTE}</p>
        <Cta
          label="See if I qualify"
          onClick={goToQualification}
          sub={
            completed
              ? 'Qualification is measured from the answers you already gave, not an application form.'
              : 'Qualification is measured from your calculator answers, not an application form. Run your numbers first.'
          }
        />
      </section>

      {/* E. CORE CAPABILITIES BY ECONOMIC JOB */}
      <section>
        <Eyebrow art={SECTION_ART.operates}>What it operates</Eyebrow>
        <H2>The jobs underneath the promise.</H2>
        <div className="divide-y divide-crwn-elevated">
          {JOBS.map((j) => (
            <div key={j.job} className="py-4">
              <p className="font-semibold">{j.job}</p>
              <p className="text-sm text-crwn-text-secondary leading-relaxed mt-1">{j.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* F. PRICING: rendered from the canonical constants, never restated. */}
      <section id="pricing" className="scroll-mt-20">
        <Eyebrow art={SECTION_ART.pricing}>Pricing</Eyebrow>
        <H2>What it costs to operate at your size.</H2>
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl p-5 border ${
                p.name === 'Pro' ? 'border-crwn-gold/50 bg-crwn-gold/5' : 'border-crwn-elevated bg-crwn-surface'
              }`}
            >
              <p className="font-semibold">{p.name}</p>
              <p className="text-2xl font-bold text-crwn-gold mt-1">
                {`$${p.monthly}`}
                <span className="text-sm font-medium text-crwn-text-secondary">/mo</span>
              </p>
              <p className="text-sm text-crwn-text-secondary mt-1">{`+ ${p.feePercent}% of what you earn`}</p>
              <p className="text-sm text-crwn-text-secondary mt-3 leading-relaxed">{p.line}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-crwn-text-secondary leading-relaxed">
          Launch has no monthly fee. Pro and Scale add a monthly subscription and take a lower
          percentage of what you earn. The First Revenue Launch is a separate,
          qualification-based service priced per engagement, not a software plan.
        </p>
      </section>

      {/* G. FAQ */}
      <section id="faq" className="scroll-mt-20">
        <Eyebrow art={SECTION_ART.questions}>Questions</Eyebrow>
        <H2>Asked by artists who already run a business.</H2>
        <div className="divide-y divide-crwn-elevated">
          {FAQS.map((f) => (
            <div key={f.q} className="py-5">
              <p className="font-semibold mb-1.5">&ldquo;{f.q}&rdquo;</p>
              <p className="text-sm text-crwn-text-secondary leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* H. FINAL CTA: one action, back into the funnel or the plan already built. */}
      <section className="rounded-3xl border border-crwn-gold/25 bg-gradient-to-b from-crwn-gold/10 to-crwn-surface p-8 sm:p-10 text-center">
        <SectionImage src={SECTION_ART.close.src} alt={SECTION_ART.close.alt} />
        <h2 className="text-2xl sm:text-3xl font-bold leading-tight mb-3">
          You already built the audience. Now operate the part that pays.
        </h2>
        <p className="text-crwn-text-secondary mb-8">
          {completed
            ? 'Your plan is ready to finish. Nothing is live until you publish it.'
            : 'One number from your own inputs, the offer to build first, and the next move after that.'}
        </p>
        <Cta
          label={completed ? 'Back to my plan' : 'See what my fans are worth'}
          onClick={goToContinuation}
          sub={
            completed
              ? 'Pick up where you left off.'
              : 'Free to run. Your numbers, your math, one next move.'
          }
        />
      </section>
    </div>
  );
}
