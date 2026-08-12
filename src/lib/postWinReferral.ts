// postWinReferral.ts — Post-Win Artist Referral, V1. PURE.
//
// One win, one ask, one link, one additive attribution dimension, one downstream measure.
//
// FOUNDER DECISIONS, RATIFIED 2026-08-11. These are not implementation preferences and must not be
// softened by a later change:
//
//   1. UNPAID, FOREVER. A Post-Win referral creates no commission, credit, discount, free month,
//      payout entitlement or financial liability, and it NEVER becomes retroactively commissionable
//      because CRWN later launches a paid Artist Affiliate program. That program would need its own
//      enrollment, attribution type, economics and effective date. Historical Post-Win referrals
//      stay unpaid.
//   2. NEVER THE RECRUITER RAIL. This system alone may not create `artist_referrals` or
//      `recruiter_payouts`, assign the $50 flat fee or recurring recruiter economics, promote
//      anyone to recruiter/partner, or reach any financial entitlement through any webhook.
//
// That is why the link carries `?artist_ref=` and NOT `?ref=`. `ref` already means
// "partner/recruiter code" and flows into `partner_code_used` / `recruited_by` /
// `artist_referrals`, whose rows carry `flat_fee_amount: 5000` written from a Stripe webhook.
// Overloading it would put an organic share one branch away from a commission obligation.
//
// IDENTITY is the artist's PUBLIC SLUG. It is already public (it is their page URL), already
// unique, already stable, and resolvable back to exactly one artist server-side, so V1 needs no
// token table, no signed payload and no schema. The slug is normalized by the shared attribution
// parser like any other tag, so a hostile value simply does not survive.

import { buildCampaignUrl } from '@/lib/analytics/campaignAttribution';

/**
 * Where a referred artist lands.
 *
 * The all-in-one Opportunity Calculator, NOT signup. A referred artist is still a prospect who has
 * to see what their own fan business looks like before an account means anything, and this keeps
 * them inside the acquisition journey CRWN already measures:
 *   referral -> calculator -> result -> builder -> account -> onboarding -> launch -> first paid.
 */
export const REFERRAL_DESTINATION = '/tools/opportunity-calculator';

/** The query parameter carrying the referring artist's public slug. Never `ref`. */
export const ARTIST_REF_PARAM = 'artist_ref';

/**
 * Build the shareable link for a referring artist.
 *
 * Uses the shared attribution serializer rather than string concatenation, so the parameter name
 * can only ever be the one the parser reads back. Returns null for a missing slug: a link that
 * cannot be attributed is worse than no link, because it silently looks like it worked.
 */
export function buildReferralLink(
  artistSlug: string | null | undefined,
  origin = 'https://thecrwn.app',
): string | null {
  const slug = (artistSlug ?? '').trim();
  if (!slug) return null;
  const path = buildCampaignUrl(REFERRAL_DESTINATION, { artistReferrer: slug });
  return `${origin.replace(/\/+$/, '')}${path}`;
}

/**
 * Is this attribution self-referral?
 *
 * An artist following their own link is not an acquisition. Compared on slug because that is the
 * identity the link carries; both sides are lowercased and trimmed so a copied link with different
 * casing still matches.
 *
 * Note this is only ONE of the two guards. The other is structural and stronger: an artist who
 * already has an account creates no `account_created` funnel event, so following any referral link
 * cannot register them as a new artist acquisition no matter whose link it was.
 */
export function isSelfReferral(
  artistReferrerSlug: string | null | undefined,
  viewerArtistSlug: string | null | undefined,
): boolean {
  const a = (artistReferrerSlug ?? '').trim().toLowerCase();
  const b = (viewerArtistSlug ?? '').trim().toLowerCase();
  return !!a && a === b;
}

/**
 * May this artist be asked to refer?
 *
 * Deterministic, and deliberately dull: an artist, with a canonical first-paid conversion on CRWN.
 * No model, no prediction, no cross-artist data, no Manager. The win itself is read from
 * `first_paid_conversion`, which is already deduped per artist across all six paid rails, so five
 * webhook entry points cannot produce five asks.
 */
export function isReferralAskEligible(args: {
  isArtist: boolean;
  hasFirstPaidConversion: boolean;
}): boolean {
  return args.isArtist && args.hasFirstPaidConversion;
}
