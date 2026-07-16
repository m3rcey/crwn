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
import { Check, Crown, ArrowRight } from 'lucide-react';
import { getResultByToken, recordView } from '@/lib/leadResults/resultAccess';
import { CrwnShowcase } from '@/components/lead-magnets/CrwnShowcase';
import { ESTIMATE_DISCLAIMER } from '@/lib/leadMagnets/disclaimers';
import { WorthExperience } from '@/app/(public)/worth/WorthExperience';
import type { ResultSection } from '@/lib/leadMagnets/types';

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
    };

    return (
      <WorthExperience
        prefill={{
          listeners: num(input.monthly_listeners),
          followers: num(input.social_followers),
          // The UI takes DOLLARS and converts to cents itself. We store cents. Convert back,
          // or she sees a streaming figure 100x too big and stops trusting the whole page.
          streaming: centsToDollars(input.streaming_revenue_cents),
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
  };
  const sections = Array.isArray(data.sections) ? data.sections : [];

  const claimed = !!result.claimedAt;
  const claimHref = `/claim/${encodeURIComponent(token)}`;
  const midIndex = Math.floor(sections.length / 2);

  return (
    <main className="min-h-screen bg-crwn-bg text-white">
      <div className="max-w-2xl mx-auto px-5 py-10 sm:py-14">
        {/* Brand */}
        <div className="flex items-center gap-2 mb-8">
          <Crown className="w-5 h-5 text-[#D4AF37]" />
          <span className="font-semibold tracking-wide">CRWN</span>
        </div>

        {/* Hero: the number, front and center */}
        <div className="rounded-3xl border border-[#D4AF37]/25 bg-gradient-to-b from-[#D4AF37]/10 to-transparent p-7 sm:p-9 mb-6">
          <p className="text-[#D4AF37] text-xs tracking-widest uppercase mb-4">Your result</p>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{data.headline || 'Your result'}</h1>
          {data.summary && <p className="text-white/70 text-lg mt-4 leading-relaxed">{data.summary}</p>}
        </div>

        {/* CTA on the number */}
        <SignupCta
          claimed={claimed}
          claimHref={claimHref}
          heading="Start collecting this"
          sub="Every month you wait, it keeps going to a platform instead of to you. Set it up on CRWN, free."
        />

        {/* Sections, with a CTA woven into the middle */}
        <div className="space-y-5 mt-8">
          {sections.map((s, i) => (
            <Fragment key={s.key}>
              <Section section={s} />
              {i === midIndex && sections.length > 2 && (
                <SignupCta
                  claimed={claimed}
                  claimHref={claimHref}
                  heading="This does not build itself"
                  sub="CRWN gives you the tiers, the page, and the payouts to actually run it."
                />
              )}
            </Fragment>
          ))}
        </div>

        {result.disclaimerVersion && (
          <p className="text-xs text-white/40 mt-8 leading-relaxed">{ESTIMATE_DISCLAIMER}</p>
        )}

        {/* The full CRWN pitch: what it is and everything it offers, then the closing CTA. The
            result itself is NOT gated; all of it renders without an email. */}
        <CrwnShowcase claimed={claimed} claimHref={claimHref} />
      </div>
    </main>
  );
}

function SignupCta({
  claimed,
  claimHref,
  heading,
  sub,
  big,
}: {
  claimed: boolean;
  claimHref: string;
  heading: string;
  sub: string;
  big?: boolean;
}) {
  const pad = big ? 'p-7 sm:p-9 text-center' : 'p-6';
  return (
    <div className={`rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-b from-[#D4AF37]/10 to-transparent ${pad}`}>
      <h3 className={`font-semibold mb-1 ${big ? 'text-2xl' : 'text-xl'}`}>{heading}</h3>
      <p className="text-white/60 mb-5 leading-relaxed">{sub}</p>
      <Link
        href={claimed ? '/profile/artist' : claimHref}
        className="inline-flex items-center gap-2 bg-[#D4AF37] text-black font-semibold px-6 py-3 rounded-full hover:opacity-90 transition"
      >
        {claimed ? 'Open your dashboard' : 'Claim it on CRWN'}
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
  return (
    <section className="bg-crwn-surface-solid rounded-2xl p-6">
      <h2 className="text-sm uppercase tracking-wider text-white/50 mb-4">{section.title}</h2>

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

      {/* list -> bullets */}
      {section.kind === 'list' && section.items && (
        <ul className="space-y-2">
          {section.items.map((item, i) => (
            <li key={i} className="text-white/80 flex gap-3">
              <span className="text-[#D4AF37] mt-1">&bull;</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
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

      {/* assumptions -> dimmed footnotes */}
      {section.kind === 'assumptions' && section.items && (
        <ul className="space-y-1.5">
          {section.items.map((item, i) => (
            <li key={i} className="text-white/45 text-sm leading-relaxed">
              {item}
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
    </section>
  );
}
