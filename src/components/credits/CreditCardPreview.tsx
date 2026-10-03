// What a fan's credit will look like, drawn in HTML from the same fields as the real story image
// (src/lib/projectCredits/cardImage.tsx). A PREVIEW: it is never a credit, it carries a "Preview"
// mark, and it is rendered in the fan's own browser rather than as an image on CRWN's domain, so a
// typed name can never become a shareable picture of a credit nobody bought.

import { CREDIT_LEVEL_LABEL, type CreditLevel } from '@/lib/projectCredits/credits';

export const PREVIEW_NAME_FALLBACK = 'Your name here';

interface Props {
  artistName: string;
  albumTitle: string;
  artUrl: string | null;
  level: CreditLevel;
  number: number;
  name?: string | null;
  className?: string;
}

export function CreditCardPreview({ artistName, albumTitle, artUrl, level, number, name, className = '' }: Props) {
  const shown = name && name.trim() ? name.trim() : PREVIEW_NAME_FALLBACK;
  return (
    <div
      className={`relative mx-auto w-full max-w-[240px] overflow-hidden rounded-2xl bg-[#0D0D0D] px-5 pb-5 pt-5 text-center ring-1 ring-[#D4AF37]/30 ${className}`}
      aria-label={`Preview: ${shown}, ${CREDIT_LEVEL_LABEL[level]} number ${number} on ${albumTitle}`}
    >
      <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/70">
        Preview
      </span>
      {artUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artUrl} alt="" className="mx-auto aspect-square w-full rounded-xl object-cover" />
      ) : (
        <div className="mx-auto aspect-square w-full rounded-xl bg-[#1A1A1A]" />
      )}
      <p className="mt-3 text-[10px] uppercase tracking-[0.25em] text-[#D4AF37]">{artistName}</p>
      <p className="mt-1 text-sm font-semibold leading-tight text-white">{albumTitle}</p>
      <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#D4AF37]">{CREDIT_LEVEL_LABEL[level]}</p>
      <p className="text-5xl font-bold leading-none text-[#D4AF37]">{`#${number}`}</p>
      <p className={`mt-2 truncate text-lg ${shown === PREVIEW_NAME_FALLBACK ? 'text-white/40' : 'text-white'}`}>{shown}</p>
    </div>
  );
}
