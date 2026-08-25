// The "own your fans" independence pitch. One reusable section, rendered on every squeeze
// (public tool) page via CrwnShowcase AND on the homepage (WorthExperience). It reframes the
// core CRWN promise around platform risk: the apps an artist builds on can change owners,
// payouts, or reach overnight, and the artist owns none of the fans on them. Loss-framed, no
// em dashes. Pair it with the Own Your Fans calculator lead magnet.

import Link from 'next/link';
import { ArrowRight, Home, Lock, Unlock } from 'lucide-react';

const GOLD = '#D4AF37';

// What you rent on other platforms vs what you own on CRWN.
const RENT_VS_OWN = [
  { rent: 'The algorithm decides who sees you', own: 'A direct line to every fan' },
  { rent: 'You get none of their contact info', own: 'Names, emails, and phones you keep' },
  { rent: 'Their rules, their cut of your income', own: 'Paid to your bank, up to 95%' },
  { rent: 'Leave, and your audience is gone', own: 'Your fans go with you, anywhere' },
];

export function IndependenceSection({
  href = '/signup',
  ctaLabel = 'Claim your fans on CRWN',
}: {
  href?: string;
  ctaLabel?: string;
}) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span className="w-9 h-9 rounded-full bg-[#D4AF37]/15 flex items-center justify-center shrink-0">
          <Home className="w-4 h-4" style={{ color: GOLD }} />
        </span>
        <h2 className="text-2xl font-bold leading-tight text-crwn-text">
          The apps you built on can change owners overnight
        </h2>
      </div>

      <p className="text-crwn-text-secondary leading-relaxed mb-6">
        Your distributor, your streaming, your socials: they all sit between you and your fans.
        When a distributor gets sold, when an app cuts its payouts, when the algorithm buries your
        posts, you cannot stop any of it. Because you do not own those fans. You rent them. CRWN is
        the one place your fans are actually yours.
      </p>

      <div className="rounded-2xl border border-crwn-elevated overflow-hidden divide-y divide-white/[0.06]">
        <div className="grid grid-cols-2 text-xs uppercase tracking-wide">
          <div className="p-3 text-crwn-text-secondary flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" /> What you rent
          </div>
          <div className="p-3 font-semibold bg-[#D4AF37]/5 flex items-center gap-1.5" style={{ color: GOLD }}>
            <Unlock className="w-3.5 h-3.5 shrink-0" /> What you own on CRWN
          </div>
        </div>
        {RENT_VS_OWN.map((row) => (
          <div key={row.own} className="grid grid-cols-2 text-sm items-stretch">
            <div className="p-3 text-crwn-text-secondary">{row.rent}</div>
            <div className="p-3 text-crwn-text bg-[#D4AF37]/5">{row.own}</div>
          </div>
        ))}
      </div>

      <p className="text-crwn-text-secondary leading-relaxed mt-6 mb-5">
        A distributor changing hands should not be able to touch your fan list. Build the part of
        your career you can actually keep.
      </p>

      <div className="text-center py-1">
        <Link
          href={href}
          className="inline-flex items-center gap-2 bg-[#D4AF37] text-black font-semibold px-7 py-3.5 rounded-full hover:opacity-90 transition"
        >
          {ctaLabel}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
