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

import Link from 'next/link';
import { getResultByToken, recordView } from '@/lib/leadResults/resultAccess';
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

  return (
    <main className="min-h-screen bg-crwn-bg text-white px-6 py-14">
      <div className="max-w-2xl mx-auto">
        <p className="text-[#D4AF37] text-xs tracking-widest uppercase mb-3">Your plan</p>
        <h1 className="text-3xl sm:text-4xl font-semibold leading-tight mb-4">
          {data.headline || 'Your result'}
        </h1>
        {data.summary && <p className="text-white/70 text-lg mb-10">{data.summary}</p>}

        <div className="space-y-8">
          {sections.map((s) => (
            <Section key={s.key} section={s} />
          ))}
        </div>

        {result.disclaimerVersion && (
          <p className="text-xs text-white/40 mt-10 leading-relaxed">{ESTIMATE_DISCLAIMER}</p>
        )}

        {/* The result is NOT gated. She sees all of it without giving an email (commit
            9cbab45 removed that behavior from the other tools; this does not reintroduce it). */}
        <div className="mt-12 border-t border-white/10 pt-8">
          {result.claimedAt ? (
            <Link
              href="/profile/artist"
              className="inline-block bg-[#D4AF37] text-black font-semibold px-6 py-3 rounded-full"
            >
              Open your dashboard
            </Link>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2">Want to actually build this?</h2>
              <p className="text-white/60 mb-6">
                Save it to a CRWN account and we will set the whole thing up with you.
              </p>
              <Link
                href={`/claim/${encodeURIComponent(token)}`}
                className="inline-block bg-[#D4AF37] text-black font-semibold px-6 py-3 rounded-full"
              >
                Save my result
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
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

      {section.kind === 'projection' && section.metrics && (
        <dl className="space-y-4">
          {section.metrics.map((m) => (
            <div key={m.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-white/70">{m.label}</dt>
              <dd className="text-right">
                <span className="text-xl font-semibold text-[#D4AF37]">{m.value}</span>
                {m.note && <span className="block text-xs text-white/40">{m.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {section.kind === 'score' && typeof section.score === 'number' && (
        <div>
          <p className="text-4xl font-semibold text-[#D4AF37]">
            {section.score}
            <span className="text-white/40 text-xl">/{section.scoreMax ?? 100}</span>
          </p>
          {section.scoreLabel && <p className="text-white/60 mt-1">{section.scoreLabel}</p>}
        </div>
      )}

      {(section.kind === 'summary' || section.kind === 'copy') && section.text && (
        <p className="text-white/80 whitespace-pre-line leading-relaxed">{section.text}</p>
      )}

      {(section.kind === 'list' || section.kind === 'checklist' || section.kind === 'nextSteps') &&
        section.items && (
          <ul className="space-y-2">
            {section.items.map((item, i) => (
              <li key={i} className="text-white/80 flex gap-3">
                <span className="text-[#D4AF37]">&bull;</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

      {section.kind === 'assumptions' && section.items && (
        <ul className="space-y-1">
          {section.items.map((item, i) => (
            <li key={i} className="text-white/50 text-sm">
              {item}
            </li>
          ))}
        </ul>
      )}

      {section.kind === 'schedule' && section.rows && (
        <div className="space-y-3">
          {section.rows.map((r, i) => (
            <div key={i} className="flex gap-4">
              <span className="text-[#D4AF37] text-sm w-16 shrink-0">{r.when}</span>
              <span className="text-white/80">{r.what}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
