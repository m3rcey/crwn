// The artist content terms every artist accepts before using CRWN (founder, 2026-09-30).
//
// ONE definition: the version, the words the artist agrees to, and the rule for whether an
// account still owes an acceptance. The gate (`ArtistTermsGate`), the route
// (`/api/artist/terms`) and the tests all read this file, so the text an artist accepted and
// the text the gate checks for can never be two different things.
//
// Where the acceptance lives: `auth.users.app_metadata.artist_terms`, an append-only list
// written ONLY by the service role in `/api/artist/terms` (a user can write their own
// user_metadata, never their app_metadata). Each entry records the version, the typed name,
// the time, the IP and the user agent. No migration: the gate is enforceable the day it ships.
//
// Bump ARTIST_TERMS_VERSION when the words below change in substance, and every artist is asked
// again on their next visit. Fixing a typo is not a new version.
//
// The launch addendum is for artists in the First Revenue Launch cohort
// (`artist_profiles.launch_partner`). Its conditions are the SAME measured conditions
// `src/lib/launchPartner.ts` checks, and the numbers come from there, so the promise an artist
// signs and the checklist that decides it cannot drift.

import { GUARANTEE_MIN_CONTACTS, GUARANTEE_MIN_PROVEN_BUYERS } from '@/lib/launchPartner';

export const ARTIST_TERMS_VERSION = '2026-09-30';
export const LAUNCH_ADDENDUM_VERSION = '2026-09-30';
export const OPERATOR = 'JNW Creative Enterprises, Inc.';

/** What the artist agrees to, in the order the gate shows it. Full text: /artist-agreement. */
export const ARTIST_TERMS_POINTS: string[] = [
  'You own, or have written permission to use, everything you upload or post: the recordings, the songs, any samples, every featured artist, the artwork, the video, and the names and likeness of anyone in them.',
  'Samples, features and producers are cleared, and anyone owed a share of your money is paid by you. CRWN does not split your earnings with collaborators unless you set that up yourself.',
  'You give CRWN permission to store, stream, display and deliver your content to the fans you choose, for as long as it is on CRWN.',
  `You will defend, indemnify and hold harmless ${OPERATOR} (the company that operates CRWN), its officers, directors, employees and agents from any claim, lawsuit, damage, loss, settlement, cost or attorney's fee that comes from content you upload or post, including a claim that it uses someone else's copyright, trademark, name, likeness or other rights, or from your breaking these terms.`,
  'CRWN may remove content and suspend or close your account when it receives a copyright notice or a rights claim about your content. Repeat infringers lose their account.',
  'These terms add to the Artist Agreement and the Terms of Service, which still apply in full.',
];

/** The First Revenue Launch conditions, in the words the artist signs. */
export const LAUNCH_ADDENDUM_TITLE = 'Your First Revenue Launch';
export const LAUNCH_ADDENDUM_INTRO =
  'If you do not get your first paid fan within 30 days of launch, CRWN rebuilds and relaunches your offer at no additional service charge. That promise only holds if you complete every required step:';
export const LAUNCH_ADDENDUM_STEPS: string[] = [
  'Connect Stripe so fans can pay you.',
  `Import at least ${GUARANTEE_MIN_CONTACTS} fans, or at least ${GUARANTEE_MIN_PROVEN_BUYERS} proven buyers (fans who have already paid you).`,
  'Send your launch campaign to them.',
  'Post on your CRWN page, so the fans you invite find you there.',
];
export const LAUNCH_ADDENDUM_OUTRO =
  'If a required step is not done, the rebuild and relaunch does not apply. This is not a promise of any amount of money.';

export interface ArtistTermsAcceptance {
  version: string;
  launchAddendumVersion: string | null;
  acceptedAt: string;
  name: string;
  ip: string | null;
  userAgent: string | null;
}

export interface ArtistTermsStatus {
  /** Owes the current artist terms. */
  needsTerms: boolean;
  /** Owes the current launch addendum (launch partners only). */
  needsAddendum: boolean;
  /** Anything owed: the gate shows. */
  required: boolean;
}

/** The recorded acceptances, defensively: app_metadata is JSON anyone with the service key wrote. */
export function readAcceptances(appMetadata: unknown): ArtistTermsAcceptance[] {
  const list = (appMetadata as { artist_terms?: unknown } | null | undefined)?.artist_terms;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (a): a is ArtistTermsAcceptance =>
      !!a && typeof a === 'object' && typeof (a as ArtistTermsAcceptance).version === 'string' && typeof (a as ArtistTermsAcceptance).acceptedAt === 'string',
  );
}

/**
 * Who owes what. Only an ARTIST (has an artist_profiles row) owes the terms: a fan uploads
 * nothing. The addendum is owed only by a launch partner.
 */
export function artistTermsStatus(appMetadata: unknown, opts: { isArtist: boolean; launchPartner: boolean }): ArtistTermsStatus {
  if (!opts.isArtist) return { needsTerms: false, needsAddendum: false, required: false };
  const accepted = readAcceptances(appMetadata);
  const needsTerms = !accepted.some((a) => a.version === ARTIST_TERMS_VERSION);
  const needsAddendum = opts.launchPartner && !accepted.some((a) => a.launchAddendumVersion === LAUNCH_ADDENDUM_VERSION);
  return { needsTerms, needsAddendum, required: needsTerms || needsAddendum };
}

/** Append one acceptance, keeping the most recent 20 (a history, never a rewrite). */
export function appendAcceptance(existing: unknown, next: ArtistTermsAcceptance): ArtistTermsAcceptance[] {
  return [...readAcceptances({ artist_terms: existing }), next].slice(-20);
}

/** The typed signature: a real name, not a checkbox click. */
export function cleanSignature(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 120) return null;
  return name;
}
