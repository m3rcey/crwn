// results.ts — what a campaign produced, derived entirely from canonical rows.
//
// PURE. No database, no network, no AI. The caller fetches rows from the rails that already own
// them and hands them in; this file only shapes and labels.
//
// THE BOUNDARY THAT MATTERS
// -------------------------
// A campaign is a DIMENSION over existing evidence, never a second source of truth. Nothing here
// decides who referred whom, what a referral is worth, or what anyone is owed. Those questions are
// answered once, at the Stripe webhook, by `processReferral` writing `referrals` and
// `insertHeldReferralEarning` writing `referral_earnings`. This module reads those rows back and
// asks a narrower question: which of them belong to someone who joined this drive, inside its
// window. If a campaign figure and the rail can ever disagree about who earned what, the boundary
// has been violated.
//
// WHAT "ATTRIBUTED TO THE CAMPAIGN" HONESTLY MEANS
// ------------------------------------------------
// It means: a verified referral, on the canonical rail, credited to a person who joined this drive,
// recorded inside the drive's window. It does NOT mean the drive caused it. That participant may
// have sent the link before joining, and the artist may have run four other things that week. The
// vocabulary here is `observed`, never `caused`, `driven` or `lifted`, for the same reason
// `recommendationOutcome.ts` refuses causal language.
//
// NULL IS NEVER ZERO
// ------------------
// Free members brought in by a participant are UNMEASURABLE today, and that is a fact about CRWN,
// not about the campaign. `/api/stripe/free-subscribe` writes a `subscriptions` row and no referral
// row of any kind, so no free join is attributable to anybody. Reporting that as 0 would tell an
// artist their recruiters brought in nobody free, which CRWN does not know. It is reported
// `missing`, with the reason, exactly as `src/lib/frl/economics.ts` handles an unknown cost.

import type { MetricState, MoneyMetric } from '@/lib/frl/economics';

/** A counted observation. `value: null` means CRWN cannot see it, never that it is zero. */
export interface CountMetric {
  value: number | null;
  state: MetricState;
  /** Why the number is what it is, or why it is missing. Always populated. */
  note: string;
}

export interface ParticipantInput {
  fanId: string;
  displayName: string | null;
  joinedAt: string;
}

/** A row from `referrals`, the canonical attribution rail. Not recomputed here. */
export interface ReferralInput {
  id: string;
  referrerFanId: string;
  createdAt: string;
  status: string | null;
}

/** A row from `referral_earnings`, the canonical commission rail. Amount is read, never derived. */
export interface CommissionInput {
  referralId: string;
  commissionAmountCents: number | null;
}

export interface CampaignWindow {
  /** When the drive went live. Null while it is still a draft. */
  startsAt: string | null;
  endsAt: string;
}

export interface ParticipantResult {
  fanId: string;
  displayName: string | null;
  joinedAt: string;
  /** Paying members whose referral the rail credits to this person, inside the window. */
  verifiedPaidConversions: number;
}

export interface CampaignResults {
  window: CampaignWindow;
  /** Everyone who joined. A fact from the participation table, so always complete. */
  participants: number;
  /** Participants with at least one verified paid conversion in the window. */
  participantsWithVerifiedConversion: number;
  verifiedPaidConversions: CountMetric;
  freeJoinsAttributed: CountMetric;
  externalReach: CountMetric;
  /** Commission the artist's existing referral programme owes on those conversions. */
  commissionsOnThoseConversions: MoneyMetric;
  /** Highest first, then by join time. Artist-private: this is never a public ranking. */
  perParticipant: ParticipantResult[];
}

function inWindow(iso: string, window: CampaignWindow): boolean {
  if (!window.startsAt) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(window.startsAt).getTime() && t < new Date(window.endsAt).getTime();
}

/**
 * Shape the report.
 *
 * `referrals` rows are written ONLY by `processReferral`, which runs from the Stripe webhook after
 * a subscription is created. So every row counted here is a paying member, verified by a payment
 * that actually happened. That is why this is the one outcome V1 is willing to call verified.
 *
 * A referral is counted once. `referrals` carries a unique meaning per (artist, referred fan) and
 * the rail's own overwrite guard keeps the ORIGINAL referrer, so a resubscribe refreshes the
 * subscription link rather than creating a second conversion. De-duplicating by referral id here
 * makes a repeated row from a caller harmless too.
 */
export function buildCampaignResults(input: {
  window: CampaignWindow;
  participants: ParticipantInput[];
  /** Referral rows for THIS artist. Filtering to participants and window happens here. */
  referrals: ReferralInput[];
  commissions: CommissionInput[];
}): CampaignResults {
  const { window, participants } = input;
  const participantIds = new Set(participants.map((p) => p.fanId));

  const seen = new Set<string>();
  const countsByFan = new Map<string, number>();
  const countedReferralIds: string[] = [];

  for (const r of input.referrals) {
    if (seen.has(r.id)) continue;
    if (!participantIds.has(r.referrerFanId)) continue;
    if (!inWindow(r.createdAt, window)) continue;
    seen.add(r.id);
    countedReferralIds.push(r.id);
    countsByFan.set(r.referrerFanId, (countsByFan.get(r.referrerFanId) ?? 0) + 1);
  }

  const perParticipant: ParticipantResult[] = participants
    .map((p) => ({
      fanId: p.fanId,
      displayName: p.displayName,
      joinedAt: p.joinedAt,
      verifiedPaidConversions: countsByFan.get(p.fanId) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.verifiedPaidConversions - a.verifiedPaidConversions ||
        new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
    );

  const totalConversions = countedReferralIds.length;

  // Commission is READ off the earnings rail for exactly the referrals counted above. It is not
  // recomputed from a rate, because a rate multiplied here and a rate stored there are two numbers
  // that will eventually disagree, and one of them pays a real person.
  const countedSet = new Set(countedReferralIds);
  const relevant = input.commissions.filter((c) => countedSet.has(c.referralId));
  const missingAmounts = relevant.filter((c) => c.commissionAmountCents === null).length;
  const commissionsOnThoseConversions: MoneyMetric =
    totalConversions === 0
      ? {
          cents: 0,
          state: 'complete',
          missing: [],
          note: 'No verified conversions yet, so nothing is owed on this drive.',
        }
      : missingAmounts > 0 || relevant.length < totalConversions
        ? {
            cents: null,
            state: 'missing',
            missing: ['referral_earnings'],
            note: 'Commission has not been recorded for every conversion yet, so the total is unknown rather than zero.',
          }
        : {
            cents: relevant.reduce((sum, c) => sum + (c.commissionAmountCents ?? 0), 0),
            state: 'complete',
            missing: [],
            note: 'Read from your referral earnings. This is your existing programme, not a campaign payout.',
          };

  return {
    window,
    participants: participants.length,
    participantsWithVerifiedConversion: perParticipant.filter(
      (p) => p.verifiedPaidConversions > 0,
    ).length,
    verifiedPaidConversions: {
      value: window.startsAt ? totalConversions : null,
      state: window.startsAt ? 'complete' : 'missing',
      note: window.startsAt
        ? 'Paying members whose referral CRWN recorded at the payment, credited to someone in this drive, inside the window.'
        : 'This drive has not launched, so there is no window to measure.',
    },
    freeJoinsAttributed: {
      value: null,
      state: 'missing',
      note: 'CRWN cannot see this. Joining a free tier records no referral, so no free member can be traced to a recruiter.',
    },
    externalReach: {
      value: null,
      state: 'missing',
      note: 'CRWN has no connection to any social platform and will not count views someone typed in.',
    },
    commissionsOnThoseConversions,
    perParticipant,
  };
}

/**
 * Which participants have earned the archetype's non-cash badge?
 *
 * The rule is the rail's own verdict, not one CRWN invented: the referral rail already decided this
 * person brought in a paying member. That is deliberately NOT an answer to the open founder question
 * of what a "qualifying conversion" is (canonical architecture 25.2), because nothing here creates
 * a monetary entitlement. It grants recognition on a fact that already exists.
 */
export function badgeEarners(results: CampaignResults): string[] {
  return results.perParticipant.filter((p) => p.verifiedPaidConversions > 0).map((p) => p.fanId);
}
