// engine.ts — the deterministic Constraint Engine.
//
// PURE. No database, no network, no AI, no mutation. Same evidence in, same answer out, which
// is what makes it testable, explainable and correctable. Nothing here writes to the artist's
// tiers, prices, promises, campaigns, quests or Revenue Ramp, and nothing here completes a
// roadmap step: the engine reads the world and returns an opinion about it.
//
// THE EVALUATION ORDER, and why it is not the funnel's causal order
// ------------------------------------------------------------------
// The obvious order is causal: reach, then capture, then conversion, then delivery, then
// retention. That is the right order for DIAGNOSING a machine. It is the wrong order for
// advising a person, for one reason:
//
//   Fulfillment and retention protect revenue the artist has ALREADY been paid.
//   Acquisition wins revenue they have not been paid yet.
//
// An artist with three overdue promises and no traffic has two problems, and the one that is
// actively costing them money is the promise they already took payment for. Sending them to
// recruit more fans into a system that is failing the fans already inside it makes the leak
// bigger. So fulfillment and retention are evaluated FIRST, and the causal funnel runs
// underneath them.
//
// (This departs from the illustrative numbering in the build brief, which listed fulfillment
// 7th and retention 8th, while its own acceptance criteria required fulfillment to outrank
// acquisition and retention to outrank expansion. Those two statements cannot both hold in one
// list; the criteria win, because they encode the product intent.)
//
// Stage 1 is not in this file at all. Launch readiness stays entirely owned by the Roadmap
// (src/lib/artistRoadmap.ts + the Quest Engine's DomainChecks). Re-deriving "has this artist
// launched" here would be a second completion oracle, which the codebase has paid for before.
// The engine only asks whether enough of the machine exists for its numbers to MEAN anything,
// and returns insufficient_evidence when it does not.

import {
  CONSTRAINT_THRESHOLDS,
  type ConstraintThresholds,
} from './thresholds';
import type {
  ConfidenceLevel,
  ConstraintEvidence,
  ConstraintResult,
  CorrectiveAction,
  DiagnosedConstraint,
  EvidenceItem,
  InsufficientEvidence,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sample sufficiency, expressed as confidence.
 * At the minimum: medium. At the multiple: high. Below: the caller must not diagnose at all.
 */
function confidenceFromSample(
  sample: number,
  minimum: number,
  t: ConstraintThresholds,
): ConfidenceLevel {
  if (minimum <= 0) return 'medium';
  if (sample >= minimum * t.confidence.highConfidenceSampleMultiple) return 'high';
  if (sample >= minimum) return 'medium';
  return 'low';
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(rate < 0.1 ? 1 : 0)}%`;
}

function n(value: number): string {
  return value.toLocaleString('en-US');
}

function insufficient(reason: string, missing: string[], now: string): InsufficientEvidence {
  return { status: 'insufficient_evidence', reason, missingEvidence: missing, evaluatedAt: now };
}

function diagnose(
  d: Omit<DiagnosedConstraint, 'status' | 'evaluatedAt'>,
  now: string,
): DiagnosedConstraint {
  return { status: 'diagnosed', evaluatedAt: now, ...d };
}

/** Share destination. Falls back to the artist's own profile when there is no slug yet. */
function shareHref(slug: string | null): string {
  return slug ? `/${slug}` : '/account/profile';
}

/**
 * THE DESTINATION IS PART OF THE ADVICE.
 *
 * A corrective action that lands the artist on a general-purpose hub asks them to find, a second
 * time, the exact thing the engine just named. These helpers point at the most specific state the
 * EXISTING screens already support: the Promise Calendar's overdue tab and its own event
 * highlight, the Fan CRM's import dialog, a specific tier's editor.
 *
 * Every one of these params is a POINTER, never authority. The destination screens load the
 * signed-in artist's own rows and match against them, so an id belonging to somebody else matches
 * nothing and changes no permission. Nothing here decides what the action IS; it only decides
 * where the artist lands to do it.
 */
const PROMISE_OVERDUE = '/studio/promise?tab=overdue';
function overduePromiseHref(id: string | null | undefined): string {
  return id ? `${PROMISE_OVERDUE}&event=${encodeURIComponent(id)}` : PROMISE_OVERDUE;
}
/** The Fan CRM with its import dialog already open. */
const CONTACTS_IMPORT = '/studio/fans?import=1';
function tierHref(tierId?: string | null): string {
  return tierId ? `/account/tiers?tier=${encodeURIComponent(tierId)}` : '/account/tiers';
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export function readConstraint(
  evidence: ConstraintEvidence,
  thresholds: ConstraintThresholds = CONSTRAINT_THRESHOLDS,
): ConstraintResult {
  const now = evidence.now;
  const t = thresholds;

  // ---- Stage 0: is there enough machine for any number to mean anything? ----
  // Deliberately minimal, and deliberately NOT a re-implementation of the roadmap. If the
  // artist cannot yet take money or has nothing to take money for, every downstream rate is
  // measuring a system that does not exist, and the roadmap already knows exactly which piece
  // is missing.
  const { pageLive, stripeConnected, tierPurchasable, hasTrack, daysLive } = evidence.launch;
  if (!pageLive || !stripeConnected || !tierPurchasable || !hasTrack) {
    const missing: string[] = [];
    if (!pageLive) missing.push('a live public artist page');
    if (!hasTrack) missing.push('at least one track');
    if (!stripeConnected) missing.push('Stripe connected with charges enabled');
    if (!tierPurchasable) missing.push('a paid tier with a live price');
    return insufficient(
      'The artist has not finished launching, so performance cannot be evaluated yet. The roadmap owns this stage.',
      missing,
      now,
    );
  }

  if (daysLive !== null && daysLive < t.reach.minimumDaysLive) {
    return insufficient(
      `Live for ${daysLive} day${daysLive === 1 ? '' : 's'}. Nothing is measurable this early, and a diagnosis now would be noise.`,
      [`at least ${t.reach.minimumDaysLive} days live`],
      now,
    );
  }

  // ---- Stage 1: FULFILLMENT. Money already collected, promises already owed. ----
  const p = evidence.promises;

  // 1a. An overdue promise is an active breach to someone who has already paid. It outranks
  //     every growth question at n = 1, because the harm is happening now rather than being a
  //     pattern inferred from a sample. Confidence stays `low` for a single one on purpose:
  //     it is certainly real, but it is not yet evidence of a systemic problem.
  if ((p.overdueNow ?? 0) > 0) {
    const overdue = p.overdueNow as number;
    const oldest = p.oldestOverdue;
    const ev: EvidenceItem[] = [
      {
        label:
          overdue === 1
            ? 'One promise to your supporters is past due.'
            : `${n(overdue)} promises to your supporters are past due.`,
        metric: 'promises_overdue',
        value: overdue,
        unit: 'count',
      },
    ];
    if (oldest) {
      ev.push({
        label: `The oldest is "${oldest.title}", due ${new Date(oldest.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
        metric: 'oldest_overdue_due_at',
        value: null,
      });
    }
    return diagnose(
      {
        constraint: 'FULFILLMENT',
        confidence: overdue >= t.fulfillment.minimumDuePromises ? 'high' : 'low',
        title: overdue === 1 ? 'A promise is past due' : `${n(overdue)} promises are past due`,
        explanation:
          'These fans have already paid for something they have not received. Delivering the oldest one is worth more than any new fan you could win this week.',
        evidence: ev,
        action: {
          label: oldest ? `Deliver "${oldest.title}"` : 'Open your Promise Calendar',
          why: 'A kept promise is a renewed subscription. A broken one is a cancellation with a delay on it.',
          // Straight to the overdue list, with this exact promise highlighted. Naming a promise
          // and then dropping the artist on the "This week" tab made them hunt for it again.
          href: overduePromiseHref(oldest?.id),
          verifiedBy: 'artist_promise_fulfilled',
        },
      },
      now,
    );
  }

  // 1b. The rate. Needs a real sample: three promises and a bad month is not a pattern, and
  //     telling an artist they are failing their supporters on that basis is the most
  //     expensive wrong message the product can send.
  const resolved = p.resolved ?? 0;
  if (resolved >= t.fulfillment.minimumDuePromises && p.completionRate !== null) {
    if (p.completionRate < t.fulfillment.minimumCompletionRate) {
      return diagnose(
        {
          constraint: 'FULFILLMENT',
          confidence: confidenceFromSample(resolved, t.fulfillment.minimumDuePromises, t),
          title: 'Promises are being missed more often than they are kept',
          explanation:
            'Supporters renew for what actually arrives. Before adding anything new, the calendar you already have needs to be one you can keep.',
          evidence: [
            {
              label: `${n(p.completed ?? 0)} of ${n(resolved)} due promises were delivered in the last ${p.lookbackDays} days, a ${pct(p.completionRate)} completion rate.`,
              metric: 'promise_completion_rate',
              value: p.completionRate,
              unit: 'rate',
            },
            {
              label: `${n(p.missed ?? 0)} were missed.`,
              metric: 'promises_missed',
              value: p.missed,
              unit: 'count',
            },
          ],
          action: {
            label: 'Review your promise workload',
            why: 'A calendar you cannot keep costs more than a smaller one you can. Look at what is repeating and how often.',
            href: '/studio/promise',
            verifiedBy: null,
          },
        },
        now,
      );
    }
  }

  // ---- Stage 2: RETENTION. Never recommend filling a bucket that is leaking. ----
  const r = evidence.retention;
  const paidMembers = evidence.membership.paidMembers ?? 0;
  if (
    paidMembers >= t.retention.minimumPaidMembers &&
    r.churnRatePct !== null &&
    r.platformChurnRatePct !== null &&
    r.platformChurnRatePct > 0
  ) {
    const multiple = r.churnRatePct / r.platformChurnRatePct;
    if (multiple >= t.retention.unhealthyBenchmarkMultiplier) {
      const hasReasons = (r.cancelReasonResponses ?? 0) > 0;
      return diagnose(
        {
          constraint: 'RETENTION',
          confidence: confidenceFromSample(paidMembers, t.retention.minimumPaidMembers, t),
          title: 'Paying supporters are leaving faster than usual',
          explanation:
            'Every new member you win is landing in a bucket with a hole in it. Fixing why people leave is worth more right now than winning more of them.',
          evidence: [
            {
              label: `Your paid-member churn is ${multiple.toFixed(1)} times the comparable platform rate.`,
              metric: 'churn_vs_benchmark',
              value: multiple,
              unit: 'multiple',
            },
            {
              label: `${r.churnRatePct.toFixed(1)}% of your paying members cancelled this month, against a platform average of ${r.platformChurnRatePct.toFixed(1)}%.`,
              metric: 'churn_rate_pct',
              value: r.churnRatePct,
              unit: 'rate',
            },
          ],
          action: hasReasons
            ? {
                label: 'Read why members cancelled',
                why: 'Your leavers already told you why. Their reasons are recorded and unread.',
                href: '/studio/analytics',
                verifiedBy: null,
              }
            : {
                label: 'Deliver your next promise early',
                why: 'The cheapest retention move you have is arriving before you said you would.',
                href: '/studio/promise',
                verifiedBy: null,
              },
        },
        now,
      );
    }
  }

  // ---- Stage 3: REACH. Nobody is coming. ----
  const visits = evidence.reach.uniqueVisits;
  if (visits === null) {
    return insufficient(
      'Visit data is unavailable, so nothing downstream of traffic can be evaluated honestly.',
      ['unique page visits'],
      now,
    );
  }
  if (visits < t.reach.minimumVisitsForEvaluation) {
    return diagnose(
      {
        constraint: 'REACH',
        confidence: 'high', // A count this low is a fact, not a sample.
        title: 'Almost nobody is seeing your page',
        explanation:
          'Nothing about your offer has been tested yet, because too few people have looked at it. This is a distribution problem, and the fix is different from an offer problem.',
        evidence: [
          {
            label: `${n(visits)} unique visitor${visits === 1 ? '' : 's'} in the last ${evidence.reach.lookbackDays} days.`,
            metric: 'unique_visits',
            value: visits,
            unit: 'count',
          },
          {
            label: `You have been live for ${daysLive === null ? 'a while' : `${n(daysLive)} days`}.`,
            metric: 'days_live',
            value: daysLive,
            unit: 'days',
          },
        ],
        action:
          (evidence.membership.freeMembers ?? 0) === 0
            ? {
                label: 'Import your fan contacts',
                why: 'The fans scattered across your other platforms cannot join a page they have never been sent.',
                href: CONTACTS_IMPORT,
                verifiedBy: 'artist_has_fan_contacts',
              }
            : {
                label: 'Send your launch announcement',
                why: 'Your imported fans cannot join a page they never heard about. The Launch Kit already wrote it.',
                href: '/studio/fans?view=campaigns',
                verifiedBy: 'artist_sent_campaign',
              },
      },
      now,
    );
  }

  // ---- Stage 4: FREE CAPTURE. They come and leave without joining. ----
  const freeJoins = evidence.membership.freeJoinsInWindow;
  if (visits >= t.freeCapture.minimumVisits && freeJoins !== null) {
    const captureRate = freeJoins / visits;
    if (captureRate < t.freeCapture.minimumHealthyRate) {
      return diagnose(
        {
          constraint: 'FREE_CAPTURE',
          confidence: confidenceFromSample(visits, t.freeCapture.minimumVisits, t),
          title: 'Visitors are arriving but not joining',
          explanation:
            'People are finding your page and leaving without giving you a way to reach them again. The free front door is where that is decided, before anything is priced.',
          evidence: [
            {
              label: `${n(freeJoins)} of ${n(visits)} visitors joined the free tier, a ${pct(captureRate)} capture rate.`,
              metric: 'free_capture_rate',
              value: captureRate,
              unit: 'rate',
            },
          ],
          action: {
            label: 'Sharpen your free tier',
            why: 'Give a first-time visitor one clear, immediate reason to join before they decide to think about it later.',
            href: '/account/tiers',
            verifiedBy: null,
          },
        },
        now,
      );
    }
  }

  // ---- Stage 5: FIRST PAID. The list exists and nobody has ever bought. ----
  const hasPaid = evidence.membership.hasFirstPaidConversion;
  const freeMembers = evidence.membership.freeMembers ?? 0;
  const daysSinceFirstFree = evidence.membership.daysSinceFirstFreeMember;
  if (
    hasPaid === false &&
    freeMembers >= t.firstPaid.minimumFreeMembers &&
    daysSinceFirstFree !== null &&
    daysSinceFirstFree >= t.firstPaid.minimumDaysSinceFirstFreeMember
  ) {
    return diagnose(
      {
        constraint: 'FIRST_PAID',
        confidence: confidenceFromSample(freeMembers, t.firstPaid.minimumFreeMembers, t),
        title: 'You have an audience but no paying supporters yet',
        explanation:
          'The hard part is done: these people already said yes once. What is missing is a clear reason to say yes again at a price.',
        evidence: [
          {
            label: `${n(freeMembers)} free members, none of whom have paid.`,
            metric: 'free_members',
            value: freeMembers,
            unit: 'count',
          },
          {
            label: `Your first free member joined ${n(daysSinceFirstFree)} days ago.`,
            metric: 'days_since_first_free_member',
            value: daysSinceFirstFree,
            unit: 'days',
          },
        ],
        action: {
          label: 'Strengthen your first paid tier',
          why: 'One specific, concrete thing a paying member gets that a free member does not. Not a list, one thing.',
          href: '/account/tiers',
          verifiedBy: null,
        },
      },
      now,
    );
  }

  // ---- Stage 6 and 7 need tier interaction data, which is forward-looking from the ----
  // ---- migration date. Below the sample thresholds these simply do not fire.        ----
  const paidRungs = evidence.tiers.paidRungs;
  if (evidence.tiers.interactionDataAvailable && paidRungs.length > 0) {
    // Evaluate the EARLIEST rung with a problem: the cheapest paid tier is the one a fan meets
    // first, and a blockage there is upstream of everything above it.
    for (const rung of paidRungs) {
      if (rung.views < t.paidTierInterest.minimumTierViews) continue;
      const startRate = rung.checkoutStarts / rung.views;
      if (startRate < t.paidTierInterest.minimumCheckoutStartRate) {
        return diagnose(
          {
            constraint: 'PAID_TIER_INTEREST',
            confidence: confidenceFromSample(rung.views, t.paidTierInterest.minimumTierViews, t),
            title: `Fans are viewing ${rung.tierName} but few are starting checkout`,
            explanation:
              'People are looking and deciding not to begin. That happens before any payment screen, so it is about what the tier promises rather than how it is paid for.',
            evidence: [
              {
                label: `${n(rung.views)} fans viewed ${rung.tierName} and ${n(rung.checkoutStarts)} started checkout, a ${pct(startRate)} rate.`,
                metric: 'tier_view_to_checkout_rate',
                value: startRate,
                unit: 'rate',
              },
              {
                label: `${rung.tierName} is priced at $${(rung.priceCents / 100).toFixed(2)}.`,
                metric: 'tier_price_cents',
                value: rung.priceCents,
                unit: 'cents',
              },
            ],
            action: {
              label: `Review what ${rung.tierName} promises`,
              why: 'The benefits are what a fan is weighing at this moment. Make the first one concrete enough to picture.',
              // The engine already knows WHICH rung is failing, so open that rung's editor
              // rather than a list of tiers the artist has to re-identify.
              href: tierHref(rung.tierId),
              verifiedBy: null,
            },
          },
          now,
        );
      }
    }

    // Checkout completion, on the same earliest-rung-first principle.
    for (const rung of paidRungs) {
      if (rung.checkoutStarts < t.checkoutCompletion.minimumCheckoutStarts) continue;
      // PRODUCT-FAILURE SAFETY: more joins than checkout starts means the two are not
      // measuring the same population (members who joined before instrumentation, or a fan
      // who started on one day and paid on another). The completion rate would be a fiction,
      // so the engine declines to diagnose rather than blaming the artist for our data.
      if (rung.joins > rung.checkoutStarts) continue;
      const completion = rung.joins / rung.checkoutStarts;
      if (completion < t.checkoutCompletion.minimumCompletionRate) {
        return diagnose(
          {
            constraint: 'CHECKOUT_COMPLETION',
            confidence: confidenceFromSample(
              rung.checkoutStarts,
              t.checkoutCompletion.minimumCheckoutStarts,
              t,
            ),
            title: `Fans are starting checkout on ${rung.tierName} and not finishing`,
            explanation:
              'Something between deciding to pay and paying is stopping them. The evidence does not say whether that is price, trust or a payment problem, only that it happens after the decision.',
            evidence: [
              {
                label: `${n(rung.checkoutStarts)} checkouts started on ${rung.tierName} and ${n(rung.joins)} became paid memberships, a ${pct(completion)} completion rate.`,
                metric: 'checkout_completion_rate',
                value: completion,
                unit: 'rate',
              },
            ],
            action: {
              label: 'Walk your own checkout',
              why: 'Open your page as a fan and buy your own tier. Most drop-off at this point is something you can only see by doing it.',
              href: shareHref(evidence.slug),
              verifiedBy: null,
            },
          },
          now,
        );
      }
    }
  }

  // ---- Stage 8: DEPTH. The ladder works at the bottom and nowhere else. ----
  const premiumShare = evidence.membership.premiumMrrShare;
  if (paidMembers >= t.depth.minimumPaidMembers && premiumShare !== null) {
    if (premiumShare < t.depth.minimumPremiumMrrShare) {
      return diagnose(
        {
          constraint: 'DEPTH',
          confidence: confidenceFromSample(paidMembers, t.depth.minimumPaidMembers, t),
          title: 'Almost all of your recurring revenue comes from your cheapest paid tier',
          explanation:
            'Your entry tier is working. The rungs above it are not yet giving your most committed fans a reason to go further, and those fans are worth several entry members each.',
          evidence: [
            {
              label: `${pct(premiumShare)} of your paid monthly revenue comes from your top two tiers.`,
              metric: 'premium_mrr_share',
              value: premiumShare,
              unit: 'rate',
            },
            {
              label: `${n(paidMembers)} paying members in total.`,
              metric: 'paid_members',
              value: paidMembers,
              unit: 'count',
            },
          ],
          action: {
            label: 'Deepen your middle tier',
            why: 'One benefit at the middle rung that a fan cannot get by paying less. Depth is where the money is, and it fills last.',
            href: '/account/tiers',
            verifiedBy: null,
          },
        },
        now,
      );
    }
  }

  // ---- Nothing is blocking. Do not manufacture a problem. ----
  return insufficient(
    'No constraint is blocking this artist right now. The roadmap next step is the right thing to show.',
    [],
    now,
  );
}
