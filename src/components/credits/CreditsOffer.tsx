'use client';

// The project-credits page body: the $250 Founding offer, the $150 Supporter downsell shown only
// after "No thanks", the fan's own credit once they have one, and the public credits list.
//
// Every benefit line here is something CRWN delivers without anyone lifting a finger: the credit is
// numbered by the webhook, the name prints the moment the fan saves it, the card is generated from
// the row, and the listening-session seat is granted by src/lib/live/access.ts to every standing
// Founding credit. Nothing on this page may promise more than that. Recognition only.

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Copy, Download, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  CREDIT_LEVEL_LABEL,
  CREDIT_NAME_MAX,
  RECOGNITION_ONLY,
  cardPath,
  creditLabel,
  type CreditLevel,
  type PublicCreditList,
} from '@/lib/projectCredits/credits';
import type { CreditOffer } from '@/lib/projectCredits/server';

interface Props {
  artist: { slug: string; name: string };
  album: { id: string; title: string; artUrl: string | null };
  offers: Partial<Record<CreditLevel, CreditOffer>>;
  credits: PublicCreditList;
  path: string;
}

interface MyCredit {
  id: string;
  level: CreditLevel;
  number: number;
  name: string | null;
  listed: boolean;
  standing: boolean;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

function beacon(productId: string, eventType: 'offer_viewed' | 'offer_declined', placement: 'primary' | 'downsell') {
  try {
    fetch('/api/offer-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, eventType, placement }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics never breaks the page */
  }
}

function benefitsFor(level: CreditLevel, artistName: string, albumTitle: string): string[] {
  if (level === 'founding') {
    return [
      `Your name in the ${albumTitle} credits as a Founding Supporter, numbered in the order you joined, listed first.`,
      `A seat at ${artistName}'s private listening session for ${albumTitle}.`,
      'Your own credit card to post anywhere, with a link that proves it is real.',
    ];
  }
  return [
    `Your name in the ${albumTitle} credits as a Supporter, numbered in the order you joined.`,
    'Your own credit card to post anywhere, with a link that proves it is real.',
  ];
}

export function CreditsOffer({ artist, album, offers, credits, path }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const { user } = useAuth();
  const justCredited = search.get('credited') === '1';

  const founding = offers.founding && offers.founding.seatsLeft !== 0 ? offers.founding : null;
  const supporter = offers.supporter && offers.supporter.seatsLeft !== 0 ? offers.supporter : null;
  // The downsell exists only behind a "no thanks". When Founding is gone, Supporter is simply the offer.
  const [stage, setStage] = useState<'primary' | 'downsell' | 'closed'>('primary');
  const shown: CreditOffer | null = stage === 'primary' ? founding ?? supporter : stage === 'downsell' ? supporter : null;
  const placement: 'primary' | 'downsell' = stage === 'downsell' ? 'downsell' : 'primary';

  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyCredit[] | null>(null);

  const viewed = useRef(new Set<string>());
  useEffect(() => {
    if (!shown) return;
    const key = `${shown.id}:${placement}`;
    if (viewed.current.has(key)) return;
    viewed.current.add(key);
    beacon(shown.id, 'offer_viewed', placement);
  }, [shown, placement]);

  // The fan's own credits. Right after checkout the webhook may not have landed yet, so poll briefly.
  const loadMine = useCallback(async (): Promise<MyCredit[]> => {
    const res = await fetch(`/api/project-credits?album=${album.id}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.credits) ? data.credits : [];
  }, [album.id]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < (justCredited ? 8 : 1); attempt++) {
        const rows = await loadMine();
        if (cancelled) return;
        if (rows.length || !justCredited) {
          setMine(rows);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setMine([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, justCredited, loadMine]);

  const standing = (mine || []).filter((c) => c.standing);
  const holdsFounding = standing.some((c) => c.level === 'founding');
  const holdsAny = standing.length > 0;

  async function buy(offer: CreditOffer) {
    setError(null);
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(path)}`);
      return;
    }
    setBuying(true);
    try {
      const res = await fetch('/api/stripe/product-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: offer.id, placement }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url; // Stripe is an external page
        return;
      }
      setError(data.error || 'Checkout did not start. Try again.');
    } catch {
      setError('Checkout did not start. Try again.');
    } finally {
      setBuying(false);
    }
  }

  function noThanks() {
    if (shown) beacon(shown.id, 'offer_declined', placement);
    setStage(stage === 'primary' && founding && supporter ? 'downsell' : 'closed');
  }

  const showOffer = shown && !holdsFounding && !(holdsAny && shown.level === 'supporter');

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white">
      <div className="mx-auto max-w-xl px-4 pb-24 pt-8">
        <Link href={`/${artist.slug}`} className="text-sm text-white/50 hover:text-white">
          {artist.name}
        </Link>

        <div className="mt-4 flex items-center gap-4">
          {album.artUrl ? (
            <Image
              src={album.artUrl}
              alt={album.title}
              width={88}
              height={88}
              className="h-[88px] w-[88px] shrink-0 rounded-lg object-cover"
              unoptimized
            />
          ) : null}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Project credits</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight">{album.title}</h1>
          </div>
        </div>

        {standing.length > 0 && (
          <MyCredits credits={standing} artistSlug={artist.slug} albumTitle={album.title} onSaved={async () => setMine(await loadMine())} />
        )}
        {justCredited && user && mine !== null && standing.length === 0 && (
          <p className="mt-6 rounded-xl bg-[#1A1A1A] p-4 text-sm text-white/70">
            Your payment went through. Your credit is still being numbered: refresh this page in a minute.
          </p>
        )}

        {showOffer && shown && (
          <section className="mt-8 rounded-2xl bg-[#1A1A1A] p-5">
            <h2 className="text-xl font-bold">
              {stage === 'downsell' ? 'Still want your name on it?' : `Put your name on ${album.title}.`}
            </h2>
            <p className="mt-2 text-sm text-white/70">
              {stage === 'downsell'
                ? `Supporters are credited on ${album.title} too, listed after the Founding Supporters. No listening session.`
                : `${artist.name} is crediting the people who backed this project. The number you get is yours for good.`}
            </p>
            <ul className="mt-4 space-y-2">
              {benefitsFor(shown.level, artist.name, album.title).map((b) => (
                <li key={b} className="flex gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            {shown.seatsLeft !== null && shown.cap !== null && (
              <p className="mt-4 text-sm font-semibold text-[#D4AF37]">
                {`${shown.seatsLeft} of ${shown.cap} ${CREDIT_LEVEL_LABEL[shown.level]} spots left`}
              </p>
            )}
            <button
              type="button"
              onClick={() => buy(shown)}
              disabled={buying}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#D4AF37] px-6 py-3 font-semibold text-black disabled:opacity-60"
            >
              {buying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {`${shown.level === 'founding' ? 'Become a Founding Supporter' : 'Get credited'}, ${dollars(shown.priceCents)}`}
            </button>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <p className="mt-3 text-xs text-white/50">{`One-time payment. ${RECOGNITION_ONLY}`}</p>
            <button type="button" onClick={noThanks} className="mt-4 w-full text-center text-sm text-white/50 hover:text-white">
              No thanks
            </button>
          </section>
        )}

        {!founding && !supporter && !holdsAny && (
          <p className="mt-8 rounded-xl bg-[#1A1A1A] p-4 text-sm text-white/70">{`Every credit on ${album.title} is taken.`}</p>
        )}

        <CreditsList credits={credits} albumTitle={album.title} />
      </div>
    </div>
  );
}

function MyCredits({
  credits,
  artistSlug,
  albumTitle,
  onSaved,
}: {
  credits: MyCredit[];
  artistSlug: string;
  albumTitle: string;
  onSaved: () => Promise<void>;
}) {
  // A fan holding both levels shows the Founding one: that is the credit worth printing.
  const credit = credits.find((c) => c.level === 'founding') ?? credits[0];
  const [name, setName] = useState(credit.name ?? '');
  const [listed, setListed] = useState(credit.listed || !credit.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const card = cardPath(artistSlug, albumTitle, credit.level, credit.number);
  const cardUrl = typeof window !== 'undefined' ? `${window.location.origin}${card}` : card;
  const imageUrl = `/api/credit-card/${artistSlug}/${card.split('/credits/')[1]}?format=story`;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/project-credits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditId: credit.id, name: name.trim(), listed: listed && !!name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Could not save. Try again.');
      else await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-[#D4AF37]/40 bg-[#1A1A1A] p-5">
      <p className="text-xs uppercase tracking-widest text-[#D4AF37]">Your credit</p>
      <h2 className="mt-1 text-2xl font-bold">{creditLabel(credit.level, credit.number)}</h2>
      <p className="mt-1 text-sm text-white/60">{`on ${albumTitle}`}</p>

      <label className="mt-5 block text-sm font-medium" htmlFor="credit-name">
        The name printed in the credits
      </label>
      <input
        id="credit-name"
        value={name}
        maxLength={CREDIT_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        placeholder="How you want to be credited"
        className="mt-2 w-full rounded-xl bg-[#0D0D0D] px-4 py-3 text-white outline-none ring-1 ring-white/10 focus:ring-[#D4AF37]"
      />
      <label className="mt-3 flex items-center gap-2 text-sm text-white/80">
        <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} className="accent-[#D4AF37]" />
        Print my name in the credits and make my card public
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 rounded-full bg-[#D4AF37] px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
      >
        {saving ? 'Saving' : 'Save'}
      </button>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {credit.listed && credit.name ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={card} prefetch className="rounded-full bg-white/10 px-4 py-2 text-sm">
            View my card
          </Link>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(cardUrl).then(() => setCopied(true), () => {});
            }}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <a href={imageUrl} download className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm">
            <Download className="h-4 w-4" />
            Story image
          </a>
        </div>
      ) : (
        <p className="mt-4 text-xs text-white/50">Your card goes public once your name is printed. Until then you are counted, never named.</p>
      )}
    </section>
  );
}

function CreditsList({ credits, albumTitle }: { credits: PublicCreditList; albumTitle: string }) {
  const total =
    credits.founding.length + credits.supporter.length + credits.unlisted.founding + credits.unlisted.supporter;
  if (total === 0) {
    return <p className="mt-10 text-center text-sm text-white/50">{`Nobody is credited on ${albumTitle} yet. The first number is still open.`}</p>;
  }
  return (
    <section className="mt-10">
      <h2 className="text-sm uppercase tracking-widest text-white/50">Credits</h2>
      {(['founding', 'supporter'] as const).map((level) => {
        const named = credits[level];
        const hidden = credits.unlisted[level];
        if (!named.length && !hidden) return null;
        return (
          <div key={level} className="mt-4">
            <h3 className="font-semibold text-[#D4AF37]">{CREDIT_LEVEL_LABEL[level]}s</h3>
            <ul className="mt-2 divide-y divide-white/5">
              {named.map((c) => (
                <li key={c.number} className="flex justify-between py-2 text-sm">
                  <span>{c.name}</span>
                  <span className="text-white/40">#{c.number}</span>
                </li>
              ))}
            </ul>
            {hidden > 0 && (
              <p className="mt-1 text-xs text-white/40">
                {`and ${hidden} more who chose not to be named`}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
