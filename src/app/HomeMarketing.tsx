'use client';

// The homepage marketing narrative (Zero to One homepage rebuild, 2026-08-13).
//
// Renders BELOW the shared Opportunity Calculator funnel via HomeFunnel's `below` slot,
// so the marketing page begins only after the primary funnel (hero -> wizard -> result ->
// builder -> save boundary). It owns the ENTIRE lower homepage: the generic platform
// showcase is tool-route chrome and does not render on the homepage surface.
//
// Contract (pinned by pageComposition.test.ts):
//   - No second calculator, result, or builder: this component is presentation only and
//     fires no funnel analytics, so it cannot double-count the events emitted above it.
//   - Every claim traces to docs/POSITIONING.md (category, loop, claim-maturity table).
//     No network-effect or cross-artist intelligence claims until those systems ship.
//   - Pricing renders from TIER_PRICING / TIER_LIMITS, never restated from memory.
//   - The First Revenue Launch section reuses the EXISTING qualification architecture:
//     qualification is scored server-side from calculator answers (decideCallRequest),
//     and the hand-raiser (CallRequestCard) lives at the calculator's save boundary.
//     "See if I qualify" therefore returns the visitor to the funnel, never to a new
//     application system or a scheduling link.
//   - No fabricated social proof. The evidence section states the principles the product
//     actually keeps today; real case studies can replace or extend it later without a
//     redesign (swap the principle cards for case cards inside the same section shell).

import { ArrowRight, Check } from 'lucide-react';
import { TIER_PRICING, TIER_LIMITS } from '@/lib/platformTier';

// The whole page asks one thing. Every CTA returns to the funnel at the top: if the
// visitor has not run the calculator, that is the hero; if they have, it is their result
// and builder, where the call-request hand-raiser already lives.
const scrollToFunnel = () => window.scrollTo({ top: 0, behavior: 'smooth' });

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

const PATH_STEPS: { name: string; body: string }[] = [
  {
    name: 'Consolidate',
    body: 'Bring your fan relationships, buyer lists, catalog and offers into one operating system, so the people who already paid you stop living in six disconnected lists.',
  },
  {
    name: 'Build',
    body: 'Stand up the recurring offer your fans are most likely to buy: a free front door and a paid ladder your most committed fans can climb.',
  },
  {
    name: 'Convert',
    body: 'Start with your previous buyers, existing members and VIPs, before any public promotion. The warmest fans come first, on purpose.',
  },
  {
    name: 'Prove',
    body: 'Your first paid CRWN member. That is the bar. Not a published page, not a connected account: a real person paying you on a system you run.',
  },
  {
    name: 'Expand',
    body: 'From there, CRWN reads what actually happened and names the next highest-leverage move, with the evidence behind it.',
  },
];

// The operating loop in customer language (POSITIONING.md section 8, compressed form).
const LOOP = ['See it.', 'Find the block.', 'One move.', 'Deliver it.', 'Know if it worked.'];

// Evidence principles: every line here is on the allowed-today list in POSITIONING.md
// section 23. Real case studies slot into this section later.
const EVIDENCE = [
  {
    name: 'Your numbers',
    body: 'The result is computed from your inputs, and it changes when they change. Correct an answer and everything recalculates.',
  },
  {
    name: 'The assumptions',
    body: 'Every rate the math uses is visible and adjustable. The math is yours to check, not a black box to trust.',
  },
  {
    name: 'The reason',
    body: 'Every recommended move shows the evidence it was chosen on. Not a guess: the recommendation shows its work.',
  },
];

// Core capabilities mapped to economic jobs (POSITIONING.md section 20: no feature is
// ever the headline). Feature names stay subordinate to the job.
const JOBS: { job: string; body: string }[] = [
  {
    job: 'Build what fans can buy',
    body: 'A membership ladder and offer builder, so your most committed fans have somewhere to go. The higher rungs are where most recurring revenue lives.',
  },
  {
    job: 'Monetize the catalog you already made',
    body: 'Your music and albums, with premium access for members, so years of work stop earning only streaming rates.',
  },
  {
    job: 'Sell beyond the membership',
    body: 'A shop for direct products alongside the membership, sold to the same identifiable fans.',
  },
  {
    job: 'Create paid fan moments',
    body: 'Live sessions your most committed fans show up for, as a ticket or a member benefit.',
  },
  {
    job: 'Know who creates the value',
    body: 'The fan relationships you own, in one place, with what each one is worth and what you have promised them.',
  },
  {
    job: 'Know what to do next',
    body: 'One evidence-backed next move, derived from your own account. Not a dashboard that leaves the deciding to you.',
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'I already use Patreon, Shopify, Discord and a mailing tool.',
    a: 'Then you already proved the model, and you are running it across tools that cannot see the same fan. Each one does its job. What none of them can do, alone or together, is show you the whole economic relationship or tell you what to do next. CRWN is the layer that operates it whole, and you can keep any tool for as long as it earns its place.',
  },
  {
    q: 'Will I have to move everything at once?',
    a: 'No. Most artists start by importing their fan contacts (a CSV works, and a Patreon member export is recognized automatically, with tier matching suggested) and building the ladder. Products and catalog follow at your pace. For qualified artists on the assisted launch, CRWN does the migration work with you by hand.',
  },
  {
    q: 'I do not have time to run another platform.',
    a: 'The time you are spending now is the fragmented version: five logins, no shared record, and every decision made from memory. CRWN is built to hand you one next move instead of another dashboard, and it tracks what you promised fans so keeping your word does not depend on your calendar memory.',
  },
  {
    q: 'Can I keep releasing on Spotify and Apple?',
    a: 'Yes. Streaming is your discovery engine and it is good at that job. CRWN does a different job: it turns the reach streaming creates into identifiable, paying fan relationships. You can even give paying members new music first and release wide after.',
  },
  {
    q: 'What does CRWN cost?',
    a: 'A free plan and two paid plans, listed above. Every plan takes its percentage only on money you actually earn, so the software costs nothing until the fan economy is paying you.',
  },
  {
    q: 'What does CRWN replace, and what does it coexist with?',
    a: 'It coexists with streaming and social: those create reach, and reach matters. Over time it can replace the separate membership tool, store, email list and spreadsheet you use to run the direct side, because those relationships reconcile in one place on CRWN.',
  },
  {
    q: 'What happens first after I sign up?',
    a: 'A short setup: your artist page, the recommended four-rung ladder with the workload each promise creates shown before you commit, Stripe, and your first import of warm fans. Then the roadmap points you at one thing: your first paid member.',
  },
  {
    q: 'Can CRWN help me launch this?',
    a: 'For qualified artists, yes: the First Revenue Launch is a founder-assisted launch where CRWN consolidates, builds and launches alongside you. Qualification is measured from your calculator answers, so the way to raise your hand is to run your numbers first.',
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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.2em] text-crwn-gold font-semibold mb-3">{children}</p>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl sm:text-3xl font-bold leading-tight mb-4">{children}</h2>;
}

function FunnelCta({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="text-center">
      <button
        onClick={scrollToFunnel}
        className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold py-4 px-8 rounded-full hover:bg-crwn-gold/90 transition-colors"
      >
        {label} <ArrowRight className="w-5 h-5" />
      </button>
      {sub && <p className="text-sm text-crwn-text-secondary mt-3">{sub}</p>}
    </div>
  );
}

export function HomeMarketing() {
  return (
    <div className="mt-20 space-y-24 text-crwn-text">
      <div className="border-t border-crwn-elevated" />

      {/* A. THE FRAGMENTATION PROBLEM */}
      <section>
        <Eyebrow>The problem</Eyebrow>
        <H2>Your audience is visible. Your fan economy isn&apos;t.</H2>
        <p className="text-crwn-text-secondary text-lg leading-relaxed mb-8">
          You already sell direct. The proof is spread across a membership tool, a store, an email
          list, a ticketing platform and a chat server. Each one sees its own piece of the fan.
          None of them can see the whole relationship, so the decision about what to do next still
          lives in your head. The cost is not the software bills. It is the fans who already proved
          they would buy from you, sitting in six lists nobody is deliberately building.
        </p>
        <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
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
          <div className="hidden sm:flex items-center">
            <ArrowRight className="w-6 h-6 text-crwn-gold" />
          </div>
          <div className="rounded-2xl border border-crwn-gold/40 bg-gradient-to-b from-crwn-gold/10 to-crwn-surface p-5">
            <p className="text-[11px] uppercase tracking-wide text-crwn-gold mb-3">CRWN</p>
            <ul className="space-y-2">
              {CRWN_SIDE.map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-0.5" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* B. THE FIRST-REVENUE PATH */}
      <section id="how-it-works" className="scroll-mt-20">
        <Eyebrow>The path</Eyebrow>
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

      {/* C. THE CRWN OPERATING LOOP */}
      <section>
        <Eyebrow>The operating system</Eyebrow>
        <H2>One fan economy. One next move.</H2>
        <p className="text-crwn-text-secondary text-lg leading-relaxed mb-6">
          Every tool you run hands you numbers and leaves the deciding to you. CRWN is a decision
          layer. It watches the whole fan business in one place, finds the one thing holding it
          back right now, and puts a single move in front of you with the numbers behind it. Then
          it tracks what you promised fans, and measures what changed.
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
        <div className="max-w-md">
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
            A representative example. Your move is derived from your own account, and it always
            shows its evidence.
          </p>
        </div>
      </section>

      {/* D. EVIDENCE / PROOF: principles the product actually keeps. Real case studies
          replace or extend these cards later, inside the same section. */}
      <section>
        <Eyebrow>Why trust it</Eyebrow>
        <H2>Guidance built from your numbers, not a template.</H2>
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          {EVIDENCE.map((e) => (
            <div key={e.name} className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-5">
              <p className="text-[11px] uppercase tracking-wide text-crwn-gold mb-2">{e.name}</p>
              <p className="text-sm text-crwn-text-secondary leading-relaxed">{e.body}</p>
            </div>
          ))}
        </div>
        <p className="text-crwn-text-secondary text-sm">
          And when we do not have enough data to be sure, we tell you that instead of guessing.
        </p>
      </section>

      {/* E. FIRST REVENUE LAUNCH (assisted path). Layered on top of self-serve, never a gate. */}
      <section>
        <Eyebrow>First Revenue Launch</Eyebrow>
        <H2>Want us to launch it with you?</H2>
        <p className="text-crwn-text-secondary text-lg leading-relaxed mb-6">
          For qualified artists, CRWN works alongside you to consolidate your existing
          direct-to-fan operation, build the recurring offer best suited to your fans, bring your
          warmest buyers in first, and launch. What you get is not software access or setup help.
          It is a consolidated, launched direct-to-fan operation with real paying members.
        </p>
        <div className="rounded-2xl border border-crwn-gold/30 bg-crwn-surface p-6 mb-6">
          <p className="font-semibold mb-2">The First Paid Member Guarantee</p>
          <p className="text-sm text-crwn-text-secondary leading-relaxed">
            Qualified artists who complete the documented required actions acquire at least one
            paid member within 30 days, or CRWN rebuilds and relaunches the offer at no additional
            service charge. It is not an income guarantee, and we will not pretend it is. Both
            sides see the same live checklist, so the guarantee runs on evidence, not
            self-reporting.
          </p>
        </div>
        <p className="text-sm text-crwn-text-secondary leading-relaxed mb-8">
          Launches are capacity-limited because the work is real: each one includes a hands-on
          audit, migration and launch campaign with the founder. The self-serve product stays open
          to everyone either way.
        </p>
        <FunnelCta
          label="See if I qualify"
          sub="Qualification is measured from your calculator answers, not an application form. Run your numbers; a qualified plan can request a call at the end."
        />
      </section>

      {/* F. CORE CAPABILITIES BY ECONOMIC JOB */}
      <section>
        <Eyebrow>What it operates</Eyebrow>
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

      {/* G. PRICING: rendered from the canonical constants, never restated. */}
      <section id="pricing" className="scroll-mt-20">
        <Eyebrow>Pricing</Eyebrow>
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
          Every plan takes its percentage only on money you actually earn. The First Revenue
          Launch is a separate, qualification-based service priced per engagement; it is not a
          software plan.
        </p>
      </section>

      {/* H. FAQ */}
      <section id="faq" className="scroll-mt-20">
        <Eyebrow>Questions</Eyebrow>
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

      {/* I. FINAL CTA: one action, back into the core funnel. */}
      <section className="rounded-3xl border border-crwn-gold/25 bg-gradient-to-b from-crwn-gold/10 to-crwn-surface p-8 sm:p-10 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold leading-tight mb-3">
          You already built the audience. Now operate the part that pays.
        </h2>
        <p className="text-crwn-text-secondary mb-8">
          One number from your own inputs, the offer to build first, and the next move after that.
        </p>
        <FunnelCta label="See what my fans are worth" sub="Free to run. Your numbers, your math, one next move." />
      </section>
    </div>
  );
}
