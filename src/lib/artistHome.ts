// artistHome.ts — what Artist Home may SHOW, decided from answers other systems already gave.
//
// The principle (founder, 2026-10-03): within five seconds of opening CRWN an artist should know
// how their fan business is doing and the single highest-value thing to do next.
//
// WHAT THIS IS NOT. It is not a recommendation engine, a lifecycle state machine or a revenue
// calculator. Every judgement here was already made by a canonical owner:
//   - the next move:        Constraint Engine + Roadmap, flattened by `resolveRiseNextMove`
//   - paying members, MRR:  `/api/artist/roadmap` stats (countsAsPaying, the ONE paying rule,
//                           shared with the constraint assembler and /api/analytics)
//   - first paid:           the roadmap's `revenue-first-paid` step (first_paid_conversion)
//   - earned this month:    `/api/analytics` revenue.thisMonth (refund-netted earnings ledger)
// This module only reads those back and answers three presentation questions: is there real
// money evidence to put at the top, may the money row render, and is the storefront the loudest
// thing on the screen. It holds no threshold and ranks nothing.
//
// The lifecycle "states" are DERIVED on every read and stored nowhere:
//   loading  - the canonical reads have not landed
//   unknown  - they failed; we say nothing rather than guess (missing evidence is not zero)
//   building - no paid evidence yet; the move (setup, funnel, first paid) leads, no "$0" banner
//   earning  - a fan has paid; the money row leads, the move follows
// Setup-incomplete and established artists need no state of their own: the roadmap's Foundation
// stage names the setup step, and a diagnosed constraint names the established artist's move.

/** The `stats` block `/api/artist/roadmap` already returns. Nothing here recomputes it. */
export interface RoadmapStats {
  members: number;
  paidMembers: number;
  mrrCents: number;
}

export type ArtistHomeState = 'loading' | 'unknown' | 'building' | 'earning';

export interface ArtistHomeMoney {
  /** Net earned since the 1st, from /api/analytics. Null = not known (never rendered as $0). */
  earnedThisMonthCents: number | null;
  /** True while that read is still in flight, so the slot can hold a skeleton. */
  earnedPending: boolean;
  /** Canonical MRR (active paying members' tier prices). */
  recurringMonthlyCents: number;
  payingMembers: number;
}

export interface ArtistHomeView {
  state: ArtistHomeState;
  /** Null means do not render a money row at all. */
  money: ArtistHomeMoney | null;
  /** Render the one-move card (or its skeleton). False only when both canonical reads failed. */
  showMove: boolean;
  /**
   * The storefront card's voice. `loss` keeps "Nobody can pay you from a link you never send."
   * for an artist who has not been paid yet, where sharing the link really is the road to a first
   * fan. `utility` demotes it to a plain "Your storefront" once money is flowing.
   */
  storefrontVoice: 'loss' | 'utility';
  /** The storefront button is gold only when no move holds the screen's one gold button. */
  storefrontPrimary: boolean;
}

export interface ArtistHomeInput {
  /** True only for a session resolved as an artist. A fan never reaches the money row. */
  isArtist: boolean;
  /** Both canonical reads (constraint + roadmap) have settled, successfully or not. */
  settled: boolean;
  /** True when either canonical read returned an answer. */
  haveCanonicalAnswer: boolean;
  /** The resolved move exists (resolveRiseNextMove(...).move !== null). */
  hasMove: boolean;
  stats: RoadmapStats | null;
  /** The roadmap's `revenue-first-paid` step, or null when the roadmap did not load. */
  firstPaidDone: boolean | null;
  /** undefined = still loading; null = failed or unavailable; number = the canonical figure. */
  earnedThisMonthCents: number | null | undefined;
}

export const FIRST_PAID_STEP_KEY = 'revenue-first-paid';

export function resolveArtistHome(input: ArtistHomeInput): ArtistHomeView {
  const quiet: ArtistHomeView = {
    state: 'loading',
    money: null,
    showMove: false,
    storefrontVoice: 'loss',
    storefrontPrimary: false,
  };
  if (!input.isArtist) return quiet;
  if (!input.settled) return { ...quiet, showMove: true };
  if (!input.haveCanonicalAnswer) {
    // Both reads failed. Nothing is claimed, and the storefront is the one thing left to act on.
    return { ...quiet, state: 'unknown', storefrontPrimary: true };
  }

  // Paid evidence comes from the canonical owners only. Either a member paying right now, or the
  // roadmap's first-paid fact (which also covers one-time buyers and lapsed members).
  const paying = input.stats ? input.stats.paidMembers : null;
  const earning = (paying !== null && paying > 0) || input.firstPaidDone === true;

  const base: ArtistHomeView = {
    state: earning ? 'earning' : 'building',
    money: null,
    showMove: true,
    storefrontVoice: earning ? 'utility' : 'loss',
    storefrontPrimary: !input.hasMove,
  };

  // The money row needs the canonical stats. Without them we know the artist was paid but not
  // what they hold now, and a guessed number is worse than none.
  if (!earning || !input.stats) return base;

  return {
    ...base,
    money: {
      earnedThisMonthCents:
        typeof input.earnedThisMonthCents === 'number' && Number.isFinite(input.earnedThisMonthCents)
          ? input.earnedThisMonthCents
          : null,
      earnedPending: input.earnedThisMonthCents === undefined,
      recurringMonthlyCents: input.stats.mrrCents,
      payingMembers: input.stats.paidMembers,
    },
  };
}

/** "$1,240" for whole dollars, "$12.50" otherwise. Cents in, display string out. */
export function formatHomeMoney(cents: number): string {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}
