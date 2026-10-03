// dropLink.ts: the personal link a drop page lives at, /drop/<artist>-<gift>.
//
// Prince Dre's drops were born with this shape (/drop/princedre-round-here, founder 2026-09-29),
// because the launch script set it; every artist who built a drop themselves got a random token
// instead (/drop/q3Xv9aB1kLmN). That is the one thing a self-built drop page lacked. The rule now
// lives here, PURE, and both the launch script's config (dropLinkSlug) and the activate route read
// it, so the two can never disagree about what a drop link looks like.
//
// The link is a POINTER to the funnel row, never authority: a draft still opens only for its
// owner, and the claim route still delivers only in exchange for an email. A guessable link
// exposes nothing the artist did not already publish.
//
// WHEN it is assigned is the safety property, and it belongs to the caller: only on a funnel's
// FIRST activation (activated_at is null). Before that moment the link 404s for everyone but the
// owner and no DM has carried it, so renaming it cannot break anything a fan holds. After it, the
// link may be printed on a poster or sitting in a DM, and it never changes again.

import { slugify } from '../slugify';

/** A clean drop link: lowercase letters, digits and hyphens, 3 to 64 characters. The drop page
 *  404s any token over 64 characters, so this cap is the page's own. */
export const DROP_LINK_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

const MAX_LEN = 64;
/** Room kept at the end for a "-9" when the plain link is taken. */
const SUFFIX_ROOM = 3;

/** True when a token already reads as a personal link, so it is never renamed. */
export function isPersonalDropLink(token: string | null | undefined): boolean {
  return typeof token === 'string' && DROP_LINK_RE.test(token);
}

/** `<artist slug>-<gift title>`, cut to fit. A gift with no usable title becomes `-drop`. */
export function personalDropLink(artistSlug: string, giftTitle: string | null | undefined): string | null {
  const artist = slugify(artistSlug || '');
  if (!artist) return null;
  const gift = slugify(giftTitle || '') || 'drop';
  const room = MAX_LEN - SUFFIX_ROOM - artist.length - 1;
  const cut = gift.slice(0, Math.max(room, 0)).replace(/-+$/g, '');
  const link = cut ? `${artist}-${cut}` : artist;
  return DROP_LINK_RE.test(link) ? link : null;
}

/** The links to try, in order: the plain one, then -2 through -9 for an artist who gives away the
 *  same song from two drops. Empty when no personal link can be formed (the random token stays). */
export function dropLinkCandidates(artistSlug: string, giftTitle: string | null | undefined): string[] {
  const base = personalDropLink(artistSlug, giftTitle);
  if (!base) return [];
  const out = [base];
  for (let n = 2; n <= 9; n += 1) out.push(`${base}-${n}`);
  return out.filter((l) => DROP_LINK_RE.test(l));
}
