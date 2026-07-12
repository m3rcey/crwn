// The personalized result page.
//
// Server-rendered on purpose. The inputs and the output are read on the SERVER from the
// token, so nothing sensitive is shipped in a client bundle and there is no API the browser
// could be tricked into calling with someone else's token.
//
// The URL contains ONLY the opaque token. No email, no handle, no numbers, no database id.

import Link from 'next/link';
import { getResultByToken, recordView } from '@/lib/leadResults/resultAccess';
import { ESTIMATE_DISCLAIMER } from '@/lib/leadMagnets/disclaimers';
import type { ResultSection } from '@/lib/leadMagnets/types';

export const dynamic = 'force-dynamic';

export default async function ResultPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { token } = await params;
  const lookup = await getResultByToken(token);

  // Invalid, expired, and revoked all render the SAME page. A stranger poking at tokens
  // cannot tell "this never existed" from "this expired last week", which would otherwise be
  // a free oracle for probing.
  if (!lookup.ok) {
    return (
      <main className="min-h-screen bg-crwn-bg text-white flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-3">This link is no longer live</h1>
          <p className="text-white/60 mb-8">
            Result links expire. You can run the numbers again in about a minute.
          </p>
          <Link
            href="/tools"
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

  const data = result.resultData as {
    headline?: string;
    summary?: string;
    sections?: ResultSection[];
  };
  const sections = Array.isArray(data.sections) ? data.sections : [];

  return (
    <main className="min-h-screen bg-crwn-bg text-white px-6 py-14">
      <div className="max-w-2xl mx-auto">
        <p className="text-[#D4AF37] text-xs tracking-widest uppercase mb-3">Your numbers</p>
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

        {/* The next step. A logged-out visitor sees the result in full: we do not hold it
            hostage for an email (commit 9cbab45 removed that behavior from the other tools,
            and this one is not going to reintroduce it). */}
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
                Save these numbers to a CRWN account and we will set the whole thing up with you.
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
