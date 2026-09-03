// The personalized result page.
//
// Server-rendered on purpose: the inputs and the output are read on the SERVER from the
// token, so nothing sensitive ships in a client bundle and there is no API the browser could
// be tricked into calling with someone else's token. The URL carries ONLY the opaque token.
//
// For `worth`, this renders the REAL /worth calculator with her numbers already in it, rather
// than a bespoke read-only summary. Two reasons, and the second one is the important one:
//
//   1. One implementation. WorthExperience already IS the homepage and /worth. A second
//      renderer would be a second copy of the front door's logic, free to drift.
//   2. A number she cannot touch is a number she does not believe. On the real calculator she
//      can flip the presets, open the advanced sliders, and watch her own figure move. That
//      is the "correct the assumptions and recalculate" step, and it is worth more than any
//      amount of copy telling her the estimate is honest.
//
// The other four tools render their stored result sections, because their engines produce
// prose and checklists rather than a live model.

import { Fragment } from 'react';
import Link from 'next/link';
import { Check, Crown, ArrowRight, ArrowDown } from 'lucide-react';
import { getResultByToken, recordView } from '@/lib/leadResults/resultAccess';
import { CrwnShowcase } from '@/components/lead-magnets/CrwnShowcase';
import { ToolMarketing } from '@/components/lead-magnets/ToolMarketing';
import { LadderSection, type ModeledLadderRung } from '@/components/lead-magnets/LadderSection';
import { ExplainerVideoCard } from '@/components/lead-magnets/ExplainerVideoCard';
import { CallRequestCard } from '@/components/lead-magnets/CallRequestCard';
import { CALL_HAND_RAISER_TOOLS } from '@/lib/acquisition/callRequest';
import type { LeadMagnetInputValues } from '@/lib/leadMagnets/types';
import { hasDoorway } from '@/lib/leadMagnets/positioning';
import { ToolShowcase } from '@/components/lead-magnets/ToolShowcase';
import { LeadEmailCta } from '@/components/lead-magnets/LeadEmailCta';
import { continueCtaFor } from '@/lib/leadMagnets/continuationCta';
import { ESTIMATE_DISCLAIMER } from '@/lib/leadMagnets/disclaimers';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { restoreWizardValues, prefillQueryString } from '@/lib/leadMagnets/resumeInputs';
import { WorthExperience } from '@/app/(public)/worth/WorthExperience';
import type { ResultSection } from '@/lib/leadMagnets/types';
import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/shareMetadata';

export const dynamic = 'force-dynamic';

export default async function ResultPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const lookup = await getResultByToken(token);

  // Invalid, expired, and revoked all render the SAME page. Someone poking at tokens cannot
  // tell "never existed" from "expired last week", so there is no oracle to probe.
  if (!lookup.ok) {
    return (
      <main className="min-h-screen bg-crwn-bg text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-3">This link is no longer live</h1>
          <p className="text-white/60 mb-8">
            Result links expire. You can run the numbers again in about a minute.
          </p>
          <Link
            href="/worth"
            className="inline-block bg-[#D4AF37] text-black font-semibold px-6 py-3 rounded-full"
          >
            Run it again
          </Link>
        </div>
      </main>
    );
  }

  const { result } = lookup;
  await recordView(result.id);

  // ---- The worth tool: the real calculator, her numbers, live. ----
  if (slug === 'worth' || result.toolSlug === 'worth') {
    const input = result.inputData as {
      monthly_listeners?: number;
      social_followers?: number;
      streaming_revenue_cents?: number;
      monetization_status?: string;
    };

    return (
      <WorthExperience
        prefill={{
          listeners: num(input.monthly_listeners),
          followers: num(input.social_followers),
          // The UI takes DOLLARS and converts to cents itself. We store cents. Convert back,
          // or she sees a streaming figure 100x too big and stops trusting the whole page.
          streaming: centsToDollars(input.streaming_revenue_cents),
          // The DM now asks the proof question, so a lead arriving from Instagram already
          // answered it. Carrying it here is what lets their hand-raiser qualify without
          // asking the same question twice on two surfaces.
          monetization: typeof input.monetization_status === 'string' ? input.monetization_status : undefined,
        }}
        claimHref={result.claimedAt ? undefined : `/claim/${encodeURIComponent(token)}`}
        resultToken={token}
      />
    );
  }

  // ---- Every other tool: its stored result sections. ----
  const data = result.resultData as {
    headline?: string;
    summary?: string;
    sections?: ResultSection[];
    heroValue?: string;
    heroSuffix?: string;
    heroEyebrow?: string;
    conversionPayload?: { ladder?: unknown };
  };
  // The modeled tier ladder the generator stored, when this tool models one. Renders the SAME
  // shared LadderSection the live calculator page shows, in the same position (right under the
  // result), so a ManyChat arrival and a direct visit read the same page.
  const modeledLadder: ModeledLadderRung[] = Array.isArray(data.conversionPayload?.ladder)
    ? (data.conversionPayload.ladder as ModeledLadderRung[])
    : [];
  const sections = Array.isArray(data.sections) ? data.sections : [];
  // Worth-style hero: pull the estimate tiles into the big-number card.
  const heroTiles = data.heroValue ? sections.find((s) => s.kind === 'projection') : undefined;
  const bodySections = heroTiles ? sections.filter((s) => s !== heroTiles) : sections;

  // HOW MUCH OF THIS NUMBER IS ACTUALLY THEIRS.
  //
  // A DM collects one or two answers. The same calculator on the web asks between two and
  // fourteen, and every question the DM did not ask fell back to a conservative default, so a
  // ManyChat lead reads a deliberately understated figure. The adapters justify that trade by
  // saying the result page lets the artist correct it. On this page it did not: there is no
  // wizard here, and the only way out was the claim link. So the thinnest results in the funnel
  // were also the only ones nobody could improve.
  //
  // Derived, never stored: count the tool's OWN declared inputs that this row actually carries.
  // A direct visitor who answered everything sees nothing, which is why this is a count and not
  // a "came from Instagram" flag.
  const toolConfig = getLeadMagnet(result.toolSlug || slug);
  const alreadyAnswered = toolConfig ? restoreWizardValues(toolConfig, result.inputData) : {};
  const answeredCount = Object.keys(alreadyAnswered).length;
  const unansweredCount = toolConfig ? Math.max(0, toolConfig.inputs.length - answeredCount) : 0;
  // Carry those answers into the wizard, or "answer the rest" opens on a question they already
  // answered in the DM. Read back through the tool's own input definitions on arrival, so a URL
  // can only ever set a value that field would have accepted anyway.
  const sharpenQuery = prefillQueryString(alreadyAnswered);
  const sharpenHref = toolConfig
    ? `${toolConfig.publicRoute}${sharpenQuery ? `?${sharpenQuery}` : ''}`
    : '';

  const claimed = !!result.claimedAt;
  const claimHref = `/claim/${encodeURIComponent(token)}`;
  const continueLabel = continueCtaFor(result.toolSlug || slug);
  const midIndex = Math.floor(bodySections.length / 2);

  return (
    <main className="min-h-screen bg-crwn-bg text-white">
      <div className="max-w-2xl mx-auto px-6 py-8 sm:py-16">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-8 sm:mb-14">
          <Crown className="w-5 h-5 text-[#D4AF37]" />
          <span className="font-semibold tracking-[0.08em] text-sm">CRWN</span>
        </div>

        {/* Hero: a bold gold number card when we have one (worth-style), else the editorial
            statement. The number is the first thing the reader sees. */}
        {data.heroValue ? (
          <div className="mb-6 sm:mb-10 rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-b from-[#D4AF37]/10 to-white/[0.02] p-6 sm:p-10">
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/50 mb-3">{data.heroEyebrow || 'Your result'}</p>
              <div className="text-5xl sm:text-7xl font-bold text-[#D4AF37] leading-none">
                {data.heroValue}
                <span className="text-3xl sm:text-4xl font-bold">{data.heroSuffix}</span>
              </div>
              {data.summary && <p className="text-white/50 text-sm sm:text-base mt-4 leading-relaxed max-w-lg mx-auto">{data.summary}</p>}
            </div>
          </div>
        ) : (
          <div className="mb-16">
            <p className="text-[#D4AF37] text-[11px] tracking-[0.28em] uppercase mb-6">Your result</p>
            <h1 className="text-[2rem] sm:text-[2.75rem] font-semibold leading-[1.12] tracking-tight">
              {renderHeadline(data.headline || 'Your result')}
            </h1>
            {data.summary && <p className="text-white/50 text-lg mt-6 leading-relaxed max-w-lg">{data.summary}</p>}
          </div>
        )}

        {/* The correction control, in the same slot the live calculator page puts it: directly
            under the result, low emphasis, before anything is asked for. It is the honest
            counterpart to a two-question DM. Shown only when questions really were left
            unanswered, so a visitor who filled the whole wizard is never told their own number
            is thin. It gates nothing and is deliberately not gold: the CTA on this page is the
            email ask below. */}
        {toolConfig && answeredCount >= 1 && unansweredCount >= 2 && (
          <p className="mb-6 sm:mb-10 text-sm text-white/50 leading-relaxed">
            This is built from the {answeredCount === 1 ? 'one answer' : `${answeredCount} answers`} you
            gave. The other {unansweredCount} questions used conservative defaults, so treat this as
            the floor.{' '}
            <Link href={sharpenHref} className="text-[#D4AF37] underline underline-offset-4">
              Answer the rest and see your real number.
            </Link>
          </p>
        )}

        {/* THE EMAIL ASK FIRST, then the ladder (founder decision 2026-08-26, matching the live
            calculator page). It used to sit under the ladder, which on a tier-modeling tool put a
            whole ladder section between the number and the only ask on the page. The ladder is
            evidence for the number and evidence can come after the ask, the same reasoning that
            already moved the supporting tiles below it. */}
        <LeadEmailCta claimed={claimed} claimHref={claimHref} toolSlug={result.toolSlug || slug} ctaLabel={continueLabel} />

        {modeledLadder.length > 0 && (
          <div className="mt-6 sm:mt-10">
            <LadderSection modeled={modeledLadder} />
          </div>
        )}

        {/* The calculator explainer. This page is where a DM arrival lands, so it shows the
            same evidence a direct visitor gets, in the same position. */}
        <ExplainerVideoCard toolSlug={result.toolSlug || slug} resultToken={token} />

        {/* The supporting tiles sit BELOW the ask, not inside the hero card above it. On a phone
            that 2x2 grid was roughly 230px of detail wedged between the number and the only
            buttons on the page, which put every CTA off the first screen. The number and its one
            sentence are the promise; these are the evidence for it, and evidence can come after
            the ask. */}
        {heroTiles?.metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-6">
            {heroTiles.metrics.map((m, i) => (
              <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-4">
                <p className="text-xl font-bold text-[#D4AF37] leading-tight">{m.value}</p>
                <p className="text-sm text-white/55 mt-1 leading-tight">{m.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Sections, with a CTA woven into the middle */}
        <div className="space-y-8 mt-16">
          {bodySections.map((s, i) => (
            <Fragment key={s.key}>
              <Section section={s} />
              {i === midIndex && bodySections.length > 2 && (
                <SignupCta
                  claimed={claimed}
                  claimHref={claimHref}
                  ctaLabel={continueLabel}
                  heading="This does not build itself"
                  sub="CRWN gives you the tiers, the page, and the payouts to actually run it."
                />
              )}
            </Fragment>
          ))}
        </div>

        {result.disclaimerVersion && (
          <p className="text-[11px] text-white/30 mt-12 leading-relaxed">{ESTIMATE_DISCLAIMER}</p>
        )}

        {/* The call hand-raiser, same contract as the live calculator page: after the email
            ask, only on tools the call-request route accepts, scored server-side from the
            STORED answers. Unqualified requests are recorded, never alerted. */}
        {CALL_HAND_RAISER_TOOLS.has(result.toolSlug || slug) && (
          <div className="mt-10">
            <CallRequestCard
              toolSlug={result.toolSlug || slug}
              calculatorInputs={(result.inputData || {}) as LeadMagnetInputValues}
              planSummary={data.heroValue ? `${data.heroValue}${data.heroSuffix || ''} system` : data.headline || null}
              publicToken={token}
            />
          </div>
        )}

        {/* THE LOWER PAGE. A PROMOTED tool gets the same Zero to One narrative its own funnel
            page renders (what this reveals, one fan economy, the path to a first paid member,
            First Revenue Launch, close). This route was missed when that pass shipped, so a lead
            arriving from a ManyChat link still met the OLD generic showcase, whose mockups
            advertise the leaderboard, Sync, the AI actions feed, the clipper program and email
            sequences: five surfaces the pre-PMF reduction hid. It is the highest-intent audience
            CRWN has, and it was the last one still being shown a product that is not there.

            `continueHref` because this page has no funnel of its own: no wizard, no builder, no
            hand-raiser. Without it the narrative's two controls would scroll to the top of the
            page while claiming to open something. With it they point at the claim flow, which is
            the actual next step here.

            Paused tools keep the old showcase. They have no doorway, so `ToolMarketing` would
            render nothing and their old Reels would land on a result with no pitch under it. */}
        {hasDoorway(result.toolSlug || slug) ? (
          <ToolMarketing slug={result.toolSlug || slug} continueHref={claimed ? '/profile/artist' : claimHref} />
        ) : (
          <>
            <ToolShowcase slug={result.toolSlug || slug} />
            <CrwnShowcase claimed={claimed} claimHref={claimHref} />
          </>
        )}
      </div>
    </main>
  );
}

/** Emphasize the first dollar amount (or bare number) in gold, an elegant focal point. */
function renderHeadline(headline: string) {
  const m = headline.match(/\$[\d,]+(?:\.\d+)?|\b\d[\d,]*\b/);
  if (!m) return headline;
  const idx = headline.indexOf(m[0]);
  return (
    <>
      {headline.slice(0, idx)}
      <span className="text-[#D4AF37]">{m[0]}</span>
      {headline.slice(idx + m[0].length)}
    </>
  );
}

function SignupCta({
  claimed,
  claimHref,
  heading,
  sub,
  big,
  ctaLabel,
}: {
  claimed: boolean;
  claimHref: string;
  heading: string;
  sub: string;
  big?: boolean;
  ctaLabel?: string;
}) {
  const pad = big ? 'p-8 sm:p-10 text-center' : 'p-6 sm:p-7';
  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] ${pad}`}>
      <h3 className={`font-semibold mb-1.5 tracking-tight ${big ? 'text-2xl' : 'text-lg'}`}>{heading}</h3>
      <p className="text-white/50 mb-6 leading-relaxed text-sm max-w-md">{sub}</p>
      <Link
        href={claimed ? '/profile/artist' : claimHref}
        className="inline-flex items-center gap-2 bg-[#D4AF37] text-black font-semibold text-sm px-6 py-3 rounded-full hover:opacity-90 transition"
      >
        {claimed ? 'Open your dashboard' : ctaLabel || 'Claim it on CRWN'}
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

/** A missing value must render as an EMPTY input, never as "0" or "undefined". */
function num(v: number | undefined): string | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? String(v) : undefined;
}

function centsToDollars(cents: number | undefined): string | undefined {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) return undefined;
  return String(Math.round(cents / 100));
}

function Section({ section }: { section: ResultSection }) {
  // Assumptions collapse behind a click so they never wall the page.
  if (section.kind === 'assumptions') {
    return (
      <details className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-7">
        <summary className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]/80 cursor-pointer select-none">
          {section.title}
        </summary>
        <ul className="space-y-1.5 mt-4">
          {(section.items || []).map((item, i) => (
            <li key={i} className="text-white/45 text-sm leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      </details>
    );
  }
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-7">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]/80 mb-5">{section.title}</h2>

      {/* projection -> metric tiles */}
      {section.kind === 'projection' && section.metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {section.metrics.map((m) => (
            <div key={m.label} className="rounded-xl bg-crwn-elevated p-4">
              <p className="text-2xl font-bold text-[#D4AF37]">{m.value}</p>
              <p className="text-sm text-white/60 mt-1">{m.label}</p>
              {m.note && <p className="text-xs text-white/40 mt-0.5">{m.note}</p>}
            </div>
          ))}
        </div>
      )}

      {/* score -> number + gauge */}
      {section.kind === 'score' && typeof section.score === 'number' && (
        <div>
          <div className="flex items-end justify-between gap-4">
            <p className="text-4xl font-bold text-[#D4AF37]">
              {section.score}
              <span className="text-white/40 text-xl font-medium">/{section.scoreMax ?? 100}</span>
            </p>
            {section.scoreLabel && <p className="text-white/60 text-sm text-right">{section.scoreLabel}</p>}
          </div>
          <div className="h-2 rounded-full bg-white/10 mt-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#D4AF37]"
              style={{ width: `${Math.min(100, Math.round((section.score / (section.scoreMax ?? 100)) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* summary -> prose */}
      {section.kind === 'summary' && section.text && (
        <p className="text-white/80 whitespace-pre-line leading-relaxed">{section.text}</p>
      )}

      {/* copy (the fan pitch) -> a quotable block */}
      {section.kind === 'copy' && section.text && (
        <div className="rounded-xl bg-crwn-elevated/60 border-l-2 border-[#D4AF37] p-4">
          <p className="text-white/90 whitespace-pre-line leading-relaxed italic">{section.text}</p>
        </div>
      )}

      {/* list: a single fact becomes a STAT (celebrate the number); several become numbered rows */}
      {section.kind === 'list' && section.items && (
        section.items.length === 1 ? (
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight">{renderHeadline(section.items[0])}</p>
        ) : (
          <ul className="space-y-3">
            {section.items.map((item, i) => (
              <li key={i} className="text-white/85 flex gap-3.5 items-start">
                <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full border border-[#D4AF37]/30 flex items-center justify-center text-[11px] font-semibold text-[#D4AF37]">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        )
      )}

      {/* checklist / nextSteps -> checkmarks */}
      {(section.kind === 'checklist' || section.kind === 'nextSteps') && section.items && (
        <ul className="space-y-3">
          {section.items.map((item, i) => (
            <li key={i} className="text-white/90 flex gap-3 items-start">
              <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-[#D4AF37]/15 flex items-center justify-center">
                <Check className="w-3 h-3 text-[#D4AF37]" />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {/* schedule -> vertical timeline */}
      {section.kind === 'schedule' && section.rows && (
        <div className="relative pl-6 space-y-5 border-l border-white/10">
          {section.rows.map((r, i) => (
            <div key={i} className="relative">
              <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-[#D4AF37] ring-4 ring-[#1a1a1a]" />
              <p className="text-[#D4AF37] text-sm font-medium">{r.when}</p>
              <p className="text-white/80 mt-0.5">{r.what}</p>
            </div>
          ))}
        </div>
      )}

      {/* scenarios -> conservative / expected / high, the middle emphasized */}
      {section.kind === 'scenarios' && section.metrics && (
        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
          {section.metrics.map((m, i) => {
            const mid = i === 1;
            return (
              <div
                key={m.label}
                // `min-w-0` lets a grid item shrink below its content instead of forcing the track
                // wider than the column, which is what let these values spill into each other.
                className={`min-w-0 rounded-xl p-2 sm:p-4 text-center ${
                  mid ? 'bg-[#D4AF37]/10 border border-[#D4AF37]/30' : 'bg-white/[0.02] border border-white/[0.06]'
                }`}
              >
                <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-white/50 mb-1 sm:mb-1.5 leading-tight">
                  {m.label}
                </p>
                <p
                  className={`font-bold leading-tight break-words ${
                    mid ? 'text-base sm:text-2xl text-[#D4AF37]' : 'text-sm sm:text-xl text-white/90'
                  }`}
                >
                  {m.value}
                </p>
                {m.note && <p className="text-[9px] sm:text-[10px] text-white/40 mt-1 leading-tight">{m.note}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* fanLoss -> scannable tags, not a paragraph */}
      {section.kind === 'fanLoss' && section.text && (
        <div className="flex flex-wrap gap-2">
          {section.text
            .replace(/^your fans miss\s*/i, '')
            .replace(/\.$/, '')
            .split(/,\s*(?:and\s+)?/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((c, i) => (
              <span key={i} className="text-sm text-white/85 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5">
                {c}
              </span>
            ))}
        </div>
      )}

      {/* derivation -> the "how we got to the number" chain, read in one glance: each row is a
          step (label + big value), arrows down, the last row is the total in gold. */}
      {section.kind === 'derivation' && section.metrics && (
        <div className="space-y-1.5">
          {section.metrics.map((m, i) => {
            const last = i === section.metrics!.length - 1;
            return (
              <Fragment key={m.label}>
                <div
                  className={`rounded-xl px-4 py-3 flex items-center justify-between gap-4 ${
                    last ? 'bg-[#D4AF37]/10 border border-[#D4AF37]/30' : 'bg-white/[0.03] border border-white/[0.08]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`text-sm leading-tight ${last ? 'text-[#D4AF37] font-medium' : 'text-white/70'}`}>{m.label}</p>
                    {m.note && <p className="text-xs text-white/40 mt-0.5 leading-tight">{m.note}</p>}
                  </div>
                  <p className={`font-bold whitespace-nowrap ${last ? 'text-2xl sm:text-3xl text-[#D4AF37]' : 'text-xl text-white/90'}`}>
                    {m.value}
                  </p>
                </div>
                {!last && (
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="w-4 h-4 text-[#D4AF37]/50" />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      {/* flow -> the recovery diagram (loss -> setup -> fan action -> recovered) */}
      {section.kind === 'flow' && section.items && (
        <div className="space-y-1.5">
          {section.items.map((node, i) => {
            const last = i === section.items!.length - 1;
            return (
              <Fragment key={i}>
                <div
                  className={`rounded-xl px-4 py-3 text-center text-sm ${
                    last
                      ? 'bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] font-semibold'
                      : 'bg-white/[0.03] border border-white/[0.08] text-white/85'
                  }`}
                >
                  {node}
                </div>
                {!last && (
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="w-4 h-4 text-[#D4AF37]/50" />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const config = getLeadMagnet(slug);
  // A result link is personal and unguessable. It gets a real preview so the person who
  // sends it can see what it is, and noindex so it never lands in a search result.
  return {
    ...shareMetadata({
      title: config ? `Your ${config.name}` : 'Your CRWN result',
      description: config?.description || 'Your saved CRWN result.',
    }),
    robots: { index: false, follow: false },
  };
}
