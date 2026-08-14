'use client';

// The lower page for a PROMOTED calculator.
//
// This is the calculator-route counterpart to `HomeMarketing`, and it exists because the six
// promoted tools were the last acquisition surfaces still arguing an older CRWN. Underneath every
// tool result sat `CrwnShowcase`, a generic pitch whose mockups advertised the leaderboard, the
// Sync marketplace, the AI actions feed, the clipper program and email sequences: five surfaces
// the pre-PMF product reduction deliberately hid. A calculator that promises a product the visitor
// cannot find is a worse problem than a calculator that promises too little.
//
// It is DELIBERATELY shorter than the homepage. The homepage has to make the whole argument to a
// cold visitor; a calculator page has already made its argument with the artist's own number, so
// this only has to do four things: say what that number means, connect it to one system, show the
// path to the first real paying member, and make the assisted launch available without ever
// implying it is required.
//
// Contract (pinned by `toolPositioning.test.ts`):
//   - Presentation only. No calculator, result, builder or qualification component, and no funnel
//     analytics, so it cannot double-count the events the funnel above it already emitted.
//   - The canonical story comes from `@/lib/positioning/story`, shared with the homepage, so the
//     six doors cannot drift back apart. Only the doorway copy is per-tool.
//   - "See if I qualify" scrolls to the funnel's OWN hand-raiser when a result is on screen, and
//     otherwise returns the visitor to the calculator, because qualification is scored server-side
//     from those answers. It never asserts eligibility or opens a scheduler.
//   - No hidden surface is named. Feature names stay subordinate to the job they do.

import { ArrowRight, Check, Users, Route, Rocket, Crown } from 'lucide-react';
import { SectionIcon } from '@/components/ui/SectionIcon';
import { getDoorway } from '@/lib/leadMagnets/positioning';
import { toolIcon } from '@/lib/leadMagnets/toolIcons';
import {
  PATH_STEPS,
  LOOP,
  ONE_SYSTEM,
  FRL_BODY,
  FRL_CAPACITY_NOTE,
  GUARANTEE_TITLE,
  GUARANTEE_BODY,
} from '@/lib/positioning/story';
import { PLAN_ANCHOR_ID, QUALIFY_ANCHOR_ID } from './PublicToolClient';

const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

const scrollToAnchor = (id: string): boolean => {
  const el = typeof document === 'undefined' ? null : document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
};

type SectionIconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

function Eyebrow({ children, icon }: { children: React.ReactNode; icon?: SectionIconType }) {
  return (
    <>
      {icon && <SectionIcon icon={icon} />}
      <p className="text-[11px] uppercase tracking-[0.2em] text-crwn-gold font-semibold mb-3">{children}</p>
    </>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl sm:text-3xl font-bold leading-tight mb-4">{children}</h2>;
}

export function ToolMarketing({ slug, completed = false }: { slug: string; completed?: boolean }) {
  const door = getDoorway(slug);
  // A tool without a doorway is not promoted and must not render this narrative. Returning null
  // is the safe direction: the route keeps working with no lower page rather than asserting a
  // story that was never written for it.
  if (!door) return null;

  // The hand-raiser only exists once a result is on screen, which is exactly the prerequisite for
  // qualification: the score is derived from those answers. A fresh visitor goes back to the
  // calculator rather than to a control that would ask for a phone number CRWN could not score.
  const goToQualification = () => {
    if (!scrollToAnchor(QUALIFY_ANCHOR_ID)) scrollToTop();
  };

  // The close. Before completion it re-offers the calculator; after completion it returns the
  // visitor to the plan they already built rather than to the top of a page they have read.
  const goToContinuation = () => {
    if (!completed || !scrollToAnchor(PLAN_ANCHOR_ID)) scrollToTop();
  };

  return (
    <div className="mt-16 space-y-20 text-crwn-text">
      <div className="border-t border-crwn-elevated" />

      {/* A. WHAT THIS REVEALS. The one section that is genuinely different per calculator. */}
      <section>
        <Eyebrow icon={toolIcon(slug)}>{door.lens}</Eyebrow>
        <H2>{door.revealsTitle}</H2>
        <p className="text-crwn-text-secondary text-lg leading-relaxed">{door.revealsBody}</p>
      </section>

      {/* B. FROM ONE OPPORTUNITY TO ONE SYSTEM. The beat that stops six calculators reading as
          six businesses. The per-tool line carries the specific non-double-counting truth. */}
      <section>
        <Eyebrow icon={Users}>One fan economy</Eyebrow>
        <H2>This is one lens, not a separate business.</H2>
        <p className="text-crwn-text-secondary text-lg leading-relaxed mb-6">{door.connectsBody}</p>
        <ul className="grid sm:grid-cols-2 gap-3">
          {ONE_SYSTEM.map((t) => (
            <li
              key={t}
              className="flex items-start gap-2 rounded-2xl border border-crwn-gold/30 bg-gradient-to-b from-crwn-gold/10 to-crwn-surface p-4 font-medium"
            >
              <Check className="w-4 h-4 text-crwn-gold shrink-0 mt-1" aria-hidden="true" /> {t}
            </li>
          ))}
        </ul>
      </section>

      {/* C. THE PATH TO FIRST PROOF, compact. Shared with the homepage, so "Prove" means the
          same thing on every surface: a real person paying on a system the artist runs. */}
      <section>
        <Eyebrow icon={Route}>The path</Eyebrow>
        <H2>From the number above to your first paid member.</H2>
        <div className="space-y-0">
          {PATH_STEPS.map((s, i) => (
            <div key={s.name} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-crwn-gold/15 border border-crwn-gold/40 flex items-center justify-center text-sm font-bold text-crwn-gold shrink-0">
                  {i + 1}
                </div>
                {i < PATH_STEPS.length - 1 && <div className="w-px flex-1 bg-crwn-elevated my-1" />}
              </div>
              <div className={i < PATH_STEPS.length - 1 ? 'pb-6' : ''}>
                <p className="font-semibold">{s.name}</p>
                <p className="text-crwn-text-secondary text-sm leading-relaxed mt-1">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-lg font-semibold mt-8">
          {LOOP.map((w) => (
            <span key={w} className="mr-2 inline-block">
              {w}
            </span>
          ))}
        </p>
      </section>

      {/* D. FIRST REVENUE LAUNCH. Layered on top of the self-serve path, never a gate on it. */}
      <section>
        <Eyebrow icon={Rocket}>First Revenue Launch</Eyebrow>
        <H2>Want us to launch it with you?</H2>
        <p className="text-crwn-text-secondary text-lg leading-relaxed mb-6">{FRL_BODY}</p>
        <div className="rounded-2xl border border-crwn-gold/30 bg-crwn-surface p-6 mb-6">
          <p className="font-semibold mb-2">{GUARANTEE_TITLE}</p>
          <p className="text-sm text-crwn-text-secondary leading-relaxed">{GUARANTEE_BODY}</p>
        </div>
        <p className="text-sm text-crwn-text-secondary leading-relaxed mb-8">{FRL_CAPACITY_NOTE}</p>
        <div className="text-center">
          <button
            onClick={goToQualification}
            className="inline-flex items-center gap-2 bg-crwn-surface border border-crwn-gold/40 text-crwn-text font-semibold py-3 px-7 rounded-full hover:border-crwn-gold transition-colors"
          >
            See if I qualify <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-sm text-crwn-text-secondary mt-3">
            {completed
              ? 'Qualification is measured from the answers you already gave, not an application form.'
              : 'Qualification is measured from your calculator answers, not an application form. Run your numbers first.'}
          </p>
        </div>
      </section>

      {/* E. FINAL CTA. The gold button on this page, so the assisted path above stays secondary. */}
      <section className="rounded-3xl border border-crwn-gold/25 bg-gradient-to-b from-crwn-gold/10 to-crwn-surface p-8 sm:p-10 text-center">
        {/* Centered here, unlike the left-aligned section icons, because the whole card is centered. */}
        <SectionIcon icon={Crown} className="mx-auto" />
        <H2>{completed ? 'Your plan is already built above.' : 'Start with your own numbers.'}</H2>
        <p className="text-crwn-text-secondary leading-relaxed mb-7 max-w-xl mx-auto">
          {completed
            ? 'Everything above was computed from your answers. Save it and CRWN turns it into the ladder, the calendar and the one next move you work from.'
            : 'It takes a couple of minutes and nothing is gated. You get the figure, the offer we would build, and the first move to make.'}
        </p>
        <button
          onClick={goToContinuation}
          className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold py-4 px-8 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          {completed ? 'Back to my plan' : 'Run my numbers'} <ArrowRight className="w-5 h-5" />
        </button>
      </section>
    </div>
  );
}
