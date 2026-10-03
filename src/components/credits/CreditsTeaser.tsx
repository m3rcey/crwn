// The way into a project's credits from anywhere else on CRWN: the artist page's Tiers and Shop
// tabs, and the drop page after the free song. A preview of the fan's own credit (their typed first
// name when we have it) and one link to the credits page, which is where the buying, the downsell
// and the offer tracking live. It sells nothing itself. On a phone the words and the button come
// first and the preview after: a call to action is always above the fold (founder, 2026-10-03).

import Link from 'next/link';
import { CreditCardPreview } from './CreditCardPreview';
import { RECOGNITION_ONLY } from '@/lib/projectCredits/credits';
import type { CreditsTeaserData } from '@/lib/projectCredits/server';

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export function CreditsTeaser({ teaser, name }: { teaser: CreditsTeaserData; name?: string | null }) {
  const href = name && name.trim() ? `${teaser.path}?name=${encodeURIComponent(name.trim())}` : teaser.path;
  const spots =
    teaser.seatsLeft !== null && teaser.cap !== null ? `, ${teaser.seatsLeft} of ${teaser.cap} spots left` : '';
  return (
    <section className="mt-8 rounded-2xl border border-[#D4AF37]/30 bg-[#1A1A1A] p-5">
      {/* Centred, words and button first, preview after (founder, 2026-10-03). */}
      <div className="flex flex-col items-center gap-5 text-center">
        <CreditCardPreview
          artistName={teaser.artistName}
          albumTitle={teaser.albumTitle}
          artUrl={teaser.artUrl}
          level="founding"
          number={teaser.nextNumber}
          name={name}
          className="order-last"
        />
        <div className="min-w-0 max-w-xl">
          <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Project credits</p>
          <h3 className="mt-1 text-xl font-bold text-white">{`Get Special Recognition on ${teaser.albumTitle}.`}</h3>
          <p className="mt-2 text-sm text-white/70">
            {`${teaser.artistName} is crediting the people who backed this project. Founding Supporter, ${dollars(teaser.priceCents)} one time${spots}.`}
          </p>
          {teaser.sessionLabel && (
            <p className="mt-2 text-sm text-white/70">{`Comes with a seat in ${teaser.artistName}'s private live session, ${teaser.sessionLabel}.`}</p>
          )}
          <Link
            href={href}
            prefetch
            className="mt-4 inline-block rounded-full bg-crwn-gold px-6 py-2.5 text-sm font-semibold text-crwn-bg"
          >
            See the Founding Supporter offer
          </Link>
          <p className="mt-2 text-xs text-white/40">{RECOGNITION_ONLY}</p>
        </div>
      </div>
    </section>
  );
}
