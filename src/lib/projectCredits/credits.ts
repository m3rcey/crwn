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
export function creditProductCopy(level: CreditLevel, albumTitle: string, artistName: string): { title: string; description: string } {
  if (level === 'founding') {
    return {
      title: `Founding Supporter: ${albumTitle}`,
      description: `Your name in the ${albumTitle} credits as a numbered Founding Supporter, listed first, plus a seat at ${artistName}'s private listening session for it. ${RECOGNITION_ONLY}`,
    };
  }
  return {
    title: `Supporter: ${albumTitle}`,
    description: `Your name in the ${albumTitle} credits as a numbered Supporter. ${RECOGNITION_ONLY}`,
  };
}
