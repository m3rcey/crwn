// The Calculator VSL, offered on the result page as a POSTER LINK.
//
// Not an inline player, deliberately. The video is sixteen minutes and the page's job is to move
// the artist into the builder; an embedded player sitting between the result and the builder
// competes with that for attention and adds a lot of height in front of the one action that
// matters. A poster is roughly one row tall, reads as an offer rather than an interruption, and
// the artist who wants the long answer opts in.
//
// It carries the same calculator context every other continuation carries, so the watch page's own
// CTA sends them back into THEIR calculator rather than a different one.
import Link from 'next/link';
import { CALCULATOR_VSL, isVslLive } from '@/lib/vsl/catalog';
import { watchUrlFor } from '@/lib/vsl/continuation';

export function ExplainerVideoCard({
  toolSlug,
  resultToken,
}: {
  toolSlug: string | null;
  resultToken?: string | null;
}) {
  // Nothing renders while the video has no hosted URL, same rule the email block follows.
  if (!isVslLive(CALCULATOR_VSL)) return null;
  const href = watchUrlFor(CALCULATOR_VSL.slug, { tool: toolSlug, resultToken });

  return (
    <div className="mx-auto mt-8 w-full max-w-2xl px-4">
      <Link
        href={href}
        className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:border-[#D4AF37]/50 hover:bg-white/10"
      >
        <span className="relative flex-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={CALCULATOR_VSL.poster}
            alt=""
            className="h-16 w-28 rounded-lg object-cover"
            loading="lazy"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-lg text-white drop-shadow"
          >
            &#9654;
          </span>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white group-hover:text-[#D4AF37]">
            Not sure the number is real?
          </span>
          <span className="mt-0.5 block text-xs text-white/50">
            {CALCULATOR_VSL.title} · {CALCULATOR_VSL.minutes} min
          </span>
        </span>
      </Link>
    </div>
  );
}
