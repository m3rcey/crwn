// The VSL watch page: one video playing, the rest of the series beside it.
//
// Deep-linked on purpose. A nurture email links to ITS video, and the lead lands on exactly what
// the email promised, with the other three visible as a rail. That is the YouTube playlist shape,
// and it is why there is no separate "watch all" destination and no second CTA in the emails: the
// sequence is a drip, and a binge link at day 1 collapses eighteen days of touches into one session
// and removes the reason to open emails two through four. The lead who wants to binge still can.
//
// Only LIVE videos exist here. A catalogued slug with no hosted URL is a 404, so this route cannot
// show a player with nothing behind it while the cuts are still in Premiere.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getVsl, isVslLive, liveVsls, VSLS } from '@/lib/vsl/catalog';
import { vslContinuation, watchUrlFor } from '@/lib/vsl/continuation';

// Dynamic, not static: the CTA depends on the viewer's own calculator context, which arrives on
// the query string from their nurture email. A prerendered page would bake one lead's answer in.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const v = getVsl(slug);
  if (!isVslLive(v)) return { title: 'CRWN' };
  return {
    title: `${v.title} | CRWN`,
    description: v.question,
    openGraph: { title: v.title, description: v.question, images: [v.poster], type: 'video.other' },
  };
}

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

  // The lead's ORIGINATING calculator, carried from the nurture email. Never the video they are
  // watching: the four VSLs are one series and which one they opened is not a routing input.
  const cont = vslContinuation(one(sp.tool), one(sp.result));
  const current = getVsl(slug);
  if (!isVslLive(current)) notFound();

  const series = liveVsls();
  const total = VSLS.length;

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-white/50 hover:text-white">
          CRWN
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
              {/* Native controls: this is a marketing video on a cold lead's first visit, and a
                  custom player is one more thing that can fail on a phone browser. */}
              <video
                key={current.slug}
                className="aspect-video w-full"
                controls
                autoPlay
                playsInline
                preload="metadata"
                poster={current.poster}
                src={current.url ?? undefined}
              />
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#D4AF37]">
              {current.n} of {total}
            </p>
            <h1 className="mt-2 text-2xl font-bold leading-tight md:text-3xl">{current.title}</h1>
            <p className="mt-3 max-w-2xl text-white/60">{current.question}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={cont.href}
                className="rounded-full bg-[#D4AF37] px-6 py-3 text-sm font-bold text-black hover:opacity-90"
              >
                {cont.label}
              </Link>
            </div>
          </div>

          <aside>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
              The series
            </h2>
            <ol className="space-y-2">
              {series.map((v) => {
                const active = v.slug === current.slug;
                return (
                  <li key={v.slug}>
                    <Link
                      href={watchUrlFor(v.slug, { tool: one(sp.tool), resultToken: one(sp.result) })}
                      aria-current={active ? 'true' : undefined}
                      className={`flex gap-3 rounded-xl p-2 transition ${
                        active ? 'bg-white/10' : 'hover:bg-white/5'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={v.poster}
                        alt=""
                        className="h-14 w-24 flex-none rounded-lg object-cover"
                      />
                      <span className="min-w-0">
                        <span
                          className={`block text-sm font-semibold leading-snug ${
                            active ? 'text-[#D4AF37]' : 'text-white/90'
                          }`}
                        >
                          {v.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-white/40">
                          {v.n} of {total}
                          {v.minutes > 0 ? ` · ${v.minutes} min` : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      </div>
    </div>
  );
}
