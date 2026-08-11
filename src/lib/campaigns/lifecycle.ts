// lifecycle.ts — the campaign spine's states, its launch gate and its participation gate.
//
// PURE. No database, no network, no AI. `now` is threaded in, so the same campaign and the same
// instant always produce the same verdict.
//
// FOUR STATES, ON PURPOSE
// -----------------------
//   draft   -> being written. Private. Not discoverable, not joinable.
//   active  -> live, inside its window. Joinable. Publicly readable at the artist's own URL.
//   ended   -> window closed or the artist closed it. Results readable, NO new participants.
//   archived-> the artist put it away. Same as ended for everyone outside the artist.
//
// There is deliberately no `ready` state. "Ready" is derivable at any moment from the campaign
// itself (`checkLaunchReady`), and storing a derivable fact is how a row and reality start
// disagreeing. The same reasoning removed a stored `is_ready` from several CRWN features already.
//
// THE WINDOW IS NOT AN ATTRIBUTION WINDOW
// ---------------------------------------
// `starts_at .. ends_at` is the period during which the artist is ASKING people to act, and the
// only thing it governs is who may join and which observations the report covers. It is NOT a
// referral attribution window. CRWN's referral rail already owns that (a 30-day rolling cookie,
// last touch, current URL first: `src/components/shared/ReferralPersist.tsx`), it is unchanged by
// anything here, and a campaign may never redefine it. A conversion the rail attributes after the
// campaign closes still belongs to that participant on the rail; it simply falls outside what this
// report covers.

import { archetypeFor, capabilitiesSupported, type ToolkitSlot } from './archetypes';

export const CAMPAIGN_STATUSES = ['draft', 'active', 'ended', 'archived'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export function isCampaignStatus(s: unknown): s is CampaignStatus {
  return typeof s === 'string' && (CAMPAIGN_STATUSES as readonly string[]).includes(s);
}

/**
 * Product bounds on the window. These are hygiene, not business rules about money: a drive shorter
 * than a day cannot be run by a human, and one longer than a quarter stops being a drive and
 * becomes the artist's permanent Share-to-Earn programme, which already exists and is always on.
 */
export const MIN_WINDOW_DAYS = 1;
export const MAX_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

export interface CampaignDraft {
  archetype: string;
  title: string;
  /** ISO instant the window closes. */
  endsAt: string;
  /** Slot key -> the artist's copy. */
  toolkit: Record<string, string>;
}

export interface LaunchReadiness {
  ok: boolean;
  /** Plain sentences an artist can act on. Empty when ok. */
  problems: string[];
  /** Slot keys that are required and still empty, so a form can highlight them. */
  emptyRequiredSlots: string[];
}

function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function slotProblem(slot: ToolkitSlot, value: string): string | null {
  if (slot.required && !value) return `"${slot.label}" is still empty.`;
  if (value.length > slot.maxLength) {
    return `"${slot.label}" is longer than ${slot.maxLength} characters.`;
  }
  return null;
}

/**
 * May this campaign go live?
 *
 * The canonical rule from the architecture: A CAMPAIGN CANNOT LAUNCH WITH A REQUIRED TOOLKIT SLOT
 * EMPTY. That single check is what stops the whole product failing the way fan campaigns usually
 * fail, which is "join, then figure out what to make". A participant who opens a campaign and finds
 * a blank page does nothing, and the artist reads that as their fans not caring.
 *
 * `artistSlug` is required because without a public page there is no link for a recruiter to share,
 * so the campaign would be asking people to send strangers nowhere.
 */
export function checkLaunchReady(
  draft: CampaignDraft,
  opts: { now: string; artistSlug: string | null },
): LaunchReadiness {
  const problems: string[] = [];
  const emptyRequiredSlots: string[] = [];

  const archetype = archetypeFor(draft.archetype);
  if (!archetype) {
    return {
      ok: false,
      problems: ['That campaign type does not exist.'],
      emptyRequiredSlots: [],
    };
  }
  if (!capabilitiesSupported(archetype)) {
    return {
      ok: false,
      problems: [`${archetype.label} needs something CRWN has not built yet, so it cannot run.`],
      emptyRequiredSlots: [],
    };
  }

  if (!trimmed(draft.title)) problems.push('The campaign needs a title.');
  if (trimmed(draft.title).length > 120) problems.push('The title is longer than 120 characters.');

  if (!opts.artistSlug) {
    problems.push('Your public page is not live yet, so there is no link for anyone to share.');
  }

  const nowMs = new Date(opts.now).getTime();
  const endMs = new Date(draft.endsAt).getTime();
  if (!draft.endsAt || Number.isNaN(endMs)) {
    problems.push('The campaign needs an end date.');
  } else {
    const days = (endMs - nowMs) / DAY_MS;
    if (days < MIN_WINDOW_DAYS) {
      problems.push('The end date needs to be at least a day away.');
    } else if (days > MAX_WINDOW_DAYS) {
      problems.push(`A drive can run for up to ${MAX_WINDOW_DAYS} days.`);
    }
  }

  for (const slot of archetype.toolkit) {
    const value = trimmed(draft.toolkit?.[slot.key]);
    if (slot.required && !value) emptyRequiredSlots.push(slot.key);
    const problem = slotProblem(slot, value);
    if (problem) problems.push(problem);
  }

  return { ok: problems.length === 0, problems, emptyRequiredSlots };
}

/** The lifecycle transitions the spine allows. Anything not listed here is refused. */
export type CampaignAction = 'launch' | 'end' | 'archive';

export function nextStatus(current: CampaignStatus, action: CampaignAction): CampaignStatus | null {
  if (action === 'launch') return current === 'draft' ? 'active' : null;
  if (action === 'end') return current === 'active' ? 'ended' : null;
  if (action === 'archive') return current === 'ended' ? 'archived' : null;
  return null;
}

export interface ParticipationVerdict {
  ok: boolean;
  /** Fan-facing sentence when refused. */
  reason: string;
}

/**
 * May this person join?
 *
 * Two refusals matter and both are deliberate. An ENDED campaign never accepts a new participant,
 * because a join after the window would sit in a report it can never contribute to. And the ARTIST
 * cannot join their own drive: the referral rail already blocks a self-referral at the money
 * boundary (`src/lib/referrals.ts`), and letting the artist appear as their own recruiter would put
 * a row in the participant list that can never produce a verified outcome.
 */
export function canJoin(
  campaign: { status: CampaignStatus; endsAt: string; artistUserId: string },
  fanUserId: string,
  now: string,
): ParticipationVerdict {
  if (campaign.status !== 'active') {
    return { ok: false, reason: 'This drive is not running right now.' };
  }
  if (new Date(now).getTime() >= new Date(campaign.endsAt).getTime()) {
    return { ok: false, reason: 'This drive has closed.' };
  }
  if (fanUserId === campaign.artistUserId) {
    return { ok: false, reason: 'You cannot join your own drive.' };
  }
  return { ok: true, reason: '' };
}

/** Has the window passed? Used to close campaigns whose end date has gone by. */
export function windowClosed(campaign: { endsAt: string }, now: string): boolean {
  return new Date(now).getTime() >= new Date(campaign.endsAt).getTime();
}

/**
 * The public shape of a campaign: what a visitor to the artist's page may see.
 *
 * A DRAFT is never public. That is the whole point of the state: an artist writing a drive is
 * planning in private, and planning leaking to fans is the same failure the Promise Calendar's
 * private roadmap steps already caused once.
 */
export function isPubliclyVisible(campaign: { status: CampaignStatus }): boolean {
  return campaign.status === 'active' || campaign.status === 'ended';
}
