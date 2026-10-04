// Project credits: the pure rules (founder, 2026-10-03).
//
// A fan buys a one-time product and their NAME goes in a project's credits, numbered:
// "Founding Supporter #7 on Stompin Thru The Trenches". Recognition only. Schema and the reasons
// behind it: supabase/schema-phase2-project-credits.sql. Everything here is pure so the rules that
// decide what the public sees (a name only when the fan opted in, never an email, never a refunded
// credit) are tested in one place and read the same on every surface.

export type CreditLevel = 'founding' | 'supporter';

export const CREDIT_LEVELS: readonly CreditLevel[] = ['founding', 'supporter'];

export const CREDIT_LEVEL_LABEL: Record<CreditLevel, string> = {
  founding: 'Founding Supporter',
  supporter: 'Supporter',
};

/** Higher is more. A fan never pays twice for the same project at the same or a lower level. */
const RANK: Record<CreditLevel, number> = { founding: 2, supporter: 1 };

/** Printed on the offer, the confirmation and the card. The words are the boundary. */
export const RECOGNITION_ONLY =
  'Recognition only. This is not ownership, equity, royalties or a share of any income.';

export const CREDIT_NAME_MAX = 40;

export function isCreditLevel(v: unknown): v is CreditLevel {
  return v === 'founding' || v === 'supporter';
}

export function creditLabel(level: CreditLevel, n: number): string {
  return `${CREDIT_LEVEL_LABEL[level]} #${n}`;
}

/**
 * The name a fan typed for the credits, or null when it cannot be printed.
 *
 * Refuses anything that looks like contact details, because the one way a name reaches this field
 * by accident is an email address, and a credit is public.
 */
export function cleanCreditName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > CREDIT_NAME_MAX) return null;
  if (!/[\p{L}\p{N}]/u.test(s)) return null;
  if (s.includes('@')) return null;
  if (/https?:|www\.|\.(com|net|org|app|io|co)\b/i.test(s)) return null;
  if (/\d{7,}/.test(s.replace(/[\s().-]/g, ''))) return null; // a phone number
  return s;
}

/** The project's handle in a URL. Longer than an artist handle's 30 so titles do not collide. */
export function projectSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/**
 * Which of the artist's albums a URL names, by id or by title handle. Two albums that share a
 * handle resolve to neither, so a link can never quietly land on the wrong project.
 */
export function resolveProject<T extends { id: string; title: string }>(albums: T[], param: string): T | null {
  const byId = albums.find((a) => a.id === param);
  if (byId) return byId;
  const matches = albums.filter((a) => projectSlug(a.title) === param);
  return matches.length === 1 ? matches[0] : null;
}

export function creditsPath(artistSlug: string, albumTitle: string): string {
  return `/${artistSlug}/credits/${projectSlug(albumTitle)}`;
}

export function cardPath(artistSlug: string, albumTitle: string, level: CreditLevel, n: number): string {
  return `${creditsPath(artistSlug, albumTitle)}/${level}/${n}`;
}

/** The short ID printed on a credit's image and shown on its CRWN page ("CR-1A2B-3C4D"). It is
 *  the start of the credit row's own id, so it cannot be chosen, and anyone holding the image can
 *  check it against thecrwn.app. The image is never the proof; the page is. */
export function creditCode(id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase();
  return `CR-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/** A credit row as the server reads it: the credit joined to its purchase's status. */
export interface CreditRow {
  level: CreditLevel;
  credit_number: number;
  credit_name: string | null;
  listed: boolean;
  /** purchases.status. A refund turns it to 'refunded', which is what revokes the credit. */
  purchase_status: string | null;
}

export interface PublicCredit {
  level: CreditLevel;
  number: number;
  name: string;
}

export interface PublicCreditList {
  founding: PublicCredit[];
  supporter: PublicCredit[];
  /** Credited fans who chose not to be named. Counted, never identified. */
  unlisted: Record<CreditLevel, number>;
}

/** A credit that still stands: its purchase completed and was not refunded. */
export function creditStands(row: Pick<CreditRow, 'purchase_status'>): boolean {
  return row.purchase_status === 'completed';
}

/**
 * What the public may see. Only standing credits, and a NAME only where the fan opted in. Carries
 * no fan id, no purchase id and no email: this is the projection every public surface uses.
 */
export function publicCredits(rows: CreditRow[]): PublicCreditList {
  const out: PublicCreditList = { founding: [], supporter: [], unlisted: { founding: 0, supporter: 0 } };
  for (const r of rows) {
    if (!isCreditLevel(r.level) || !creditStands(r)) continue;
    const name = r.listed ? cleanCreditName(r.credit_name) : null;
    if (name) out[r.level].push({ level: r.level, number: r.credit_number, name });
    else out.unlisted[r.level] += 1;
  }
  out.founding.sort((a, b) => a.number - b.number);
  out.supporter.sort((a, b) => a.number - b.number);
  return out;
}

/**
 * Why this fan may not buy this level on this project, or null when they may. A fan who already
 * holds the same or a higher credit would be paying for nothing: the second purchase earns no
 * second credit. Supporter to Founding is allowed, because that is an upgrade they can see.
 */
export function blocksPurchase(held: CreditLevel[], buying: CreditLevel): string | null {
  const top = held.reduce<CreditLevel | null>((best, l) => (!best || RANK[l] > RANK[best] ? l : best), null);
  if (!top || RANK[top] < RANK[buying]) return null;
  return `You are already credited as a ${CREDIT_LEVEL_LABEL[top]} on this project.`;
}

/** Seats left on a capped product, or null when it has no cap. Never negative. */
export function seatsLeft(maxQuantity: number | null | undefined, sold: number | null | undefined): number | null {
  if (!maxQuantity || maxQuantity <= 0) return null;
  return Math.max(0, maxQuantity - (sold || 0));
}

/** The product's own title and description, which Stripe Checkout shows the fan. Generated here
 *  and never typed into a config, so the "recognition only" line is always on the receipt page. */
export function creditProductCopy(
  level: CreditLevel,
  albumTitle: string,
  artistName: string,
  includesTape = false,
): { title: string; description: string } {
  // The tape line is printed only once the playback gate actually grants it
  // (schema-phase2-tape-purchase.sql); before that it would be a promise nothing keeps.
  const tape = includesTape ? ` The whole tape is yours too, every song on ${artistName}'s page.` : '';
  if (level === 'founding') {
    return {
      title: `Founding Supporter: ${albumTitle}`,
      description: `Your name in the ${albumTitle} credits as a numbered Founding Supporter, listed first, plus a seat in ${artistName}'s private live session on it.${tape} ${RECOGNITION_ONLY}`,
    };
  }
  return {
    title: `Supporter: ${albumTitle}`,
    description: `Your name in the ${albumTitle} credits as a numbered Supporter.${tape} ${RECOGNITION_ONLY}`,
  };
}

/** The whole-tape product's own title and description, which Stripe Checkout shows. */
export function tapeProductCopy(albumTitle: string, artistName: string, songCount: number): { title: string; description: string } {
  return {
    title: `${albumTitle} (the whole tape)`,
    description: `All ${songCount} songs on ${albumTitle}, playing on ${artistName}'s page whenever you want. One payment, no membership.`,
  };
}

/** What a signed-in fan already holds on a project before buying its credit (viewerAlreadyHolds in
 *  server.ts reads it). Rendering only: it never decides a seat or a play. */
export interface AlreadyHeld {
  /** Their active tier on this artist, for "with Platinum". Null when they hold none. */
  tierName: string | null;
  /** The project's credit session already lets them in (free, or their tier is on its list). */
  session: boolean;
  /** Every song on the project already plays for them. */
  tape: boolean;
}

export interface OfferBenefit {
  text: string;
  /** The viewer holds this already. It is shown as theirs, never sold to them. */
  held: boolean;
}

const SHARE_LINE = 'A shareable image of your credit to post anywhere, with a link that proves it is real.';

/**
 * The lines under a credit offer, new things first. Nothing the viewer already holds is sold to them
 * again (founder, 2026-10-03: a Platinum member read "plus a seat in the live session" and asked why
 * they would pay for a seat they have). A held seat or tape moves to the end as "Already yours".
 */
export function offerBenefits(
  level: CreditLevel,
  artistName: string,
  albumTitle: string,
  sessionLabel: string | null,
  tapeIncluded: boolean,
  already: AlreadyHeld | null,
): OfferBenefit[] {
  const out: OfferBenefit[] = [
    {
      text:
        level === 'founding'
          ? `Your name in the ${albumTitle} credits as a Founding Supporter, numbered in the order you joined, listed first.`
          : `Your name in the ${albumTitle} credits as a Supporter, numbered in the order you joined.`,
      held: false,
    },
    { text: SHARE_LINE, held: false },
  ];
  if (level === 'founding' && !already?.session) {
    out.push({
      text: sessionLabel
        ? `A seat in ${artistName}'s private live session on ${albumTitle}, ${sessionLabel}.`
        : `A seat in ${artistName}'s private live session on ${albumTitle}.`,
      held: false,
    });
  }
  if (tapeIncluded && !already?.tape) {
    out.push({ text: `The whole ${albumTitle} tape, every song, playing on ${artistName}'s page.`, held: false });
  }
  if (already?.session) {
    const via = already.tierName ? ` with ${already.tierName}` : '';
    out.push({ text: `Already yours${via}: your seat in ${artistName}'s live session on ${albumTitle}.`, held: true });
  }
  if (tapeIncluded && already?.tape) {
    out.push({ text: `Already yours: the whole ${albumTitle} tape plays for you.`, held: true });
  }
  return out;
}

/**
 * The line under the offer's headline. The downsell's says what is DIFFERENT, so a smaller price
 * never reads as the same thing marked down (founder, 2026-10-03).
 */
export function offerLine(
  stage: 'primary' | 'downsell',
  artistName: string,
  albumTitle: string,
  already: AlreadyHeld | null,
  foundingCap: number | null,
): string {
  const via = already?.tierName ? ` with ${already.tierName}` : '';
  if (stage === 'downsell') {
    if (already?.session) {
      return `Your name still goes in the ${albumTitle} credits, numbered, listed after the Founding Supporters. Your live session seat stays yours${via}.`;
    }
    const founders = foundingCap ? `the ${foundingCap} Founding Supporters` : 'the Founding Supporters';
    return `Your name still goes in the ${albumTitle} credits, numbered. Supporters are listed after ${founders}, with no seat in the live session.`;
  }
  if (already?.session) {
    return `You are already in the live session${via}. This is your name on the project: credited, numbered, and yours for good.`;
  }
  return `${artistName} is crediting the people who backed this project. The credit you get is yours for good.`;
}
