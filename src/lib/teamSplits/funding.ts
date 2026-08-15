// Team Splits — FUNDING math. Where the collaborator's money physically is.
//
// ============================================================================
// THE DEFECT THIS EXISTS TO CLOSE (audit finding F-3, 2026-08-12)
// ============================================================================
// CRWN sells through Stripe DESTINATION charges:
//   subscription_data.transfer_data.destination = <artist Connect account>
//   subscription_data.application_fee_percent   = platform fee + referral/clipper cut
// Stripe therefore settles (amount - application_fee) STRAIGHT INTO THE ARTIST'S
// Connect account and leaves only the application fee in CRWN's platform balance.
//
// On a $100 Launch sale with no referral: CRWN holds $12, the artist holds $88.
// A 50% Team Split accrues $44 to the collaborator, and the cashout route then
// ran stripe.transfers.create({ destination: <collaborator> }) with NO
// source_transaction, which draws on CRWN's PLATFORM balance. CRWN collected $12
// and paid out $44. The ledger said artist-funded; the cash movement was
// CRWN-funded. That is a straight subsidy on every split, forever.
//
// The referral rail already solves exactly this and is the model: it ADDS the
// commission to application_fee_percent, so the money is WITHHELD at charge time
// into CRWN's balance and CRWN later pays out of funds it actually holds. The
// artist's take is correspondingly smaller, which is what "artist-funded" means.
//
// ============================================================================
// THE RATIFIED BUSINESS RULE (do not reopen)
// ============================================================================
// A Team Split is an ARTIST-FUNDED collaborator revenue share, carved from the
// artist's qualifying net. CRWN platform revenue must NEVER fund it. Therefore:
//   - CRWN's fee is CRWN's revenue and is never reduced by a split.
//   - The collaborator's share reduces the ARTIST's proceeds, never CRWN's.
//   - A collaborator can never be owed more than the artist actually took.
//
// ============================================================================
// WHAT THIS MODULE IS, AND IS NOT
// ============================================================================
// This is the PURE, deterministic funding arithmetic: given a sale and the deals
// in force, how much must be RESERVED at charge time so the eventual accrual is
// funded, and does every cent reconcile.
//
// It is deliberately NOT wired into checkout yet. The cashout rail remains
// disabled (503). Wiring a charge-time reserve raised three questions with real
// economic consequences for artists; the founder RATIFIED all three (2026-08-12),
// recorded in FUNDING_RATIFIED_DECISIONS below (FUNDING_OPEN_QUESTIONS is the
// deprecated historical record). Settled decisions do not open the rail: it stays
// closed until the reserve wiring ships and a test-mode canary proves the payout
// source. Shipping the arithmetic first is what makes that wiring mechanical and
// testable rather than exploratory.
//
// Everything here is INTEGER CENTS. No floats reach a ledger.

/** A deal as the funding math needs to see it. Mirrors TeamSplitDeal's money fields. */
export interface FundingDeal {
  id: string;
  /** 0..100. The rate. */
  percentage: number;
  /** 'net_artist_revenue' (default) or 'gross_revenue'. */
  payout_basis: 'net_artist_revenue' | 'gross_revenue';
  /** Cumulative ceiling in cents, or null for uncapped. */
  cap_amount: number | null;
  /** Cents already accrued to this deal, for cap arithmetic. */
  already_accrued: number;
}

/** One sale, in the terms checkout already knows at charge time. */
export interface SaleInputs {
  /** What the fan is actually charged, in cents, AFTER any discount. */
  grossCents: number;
  /** The artist's plan fee percent (Launch 12 / Pro 8 / Scale 5). */
  platformFeePercent: number;
  /** Referral or clipper commission percent already added to the application fee. */
  attributedCutPercent: number;
}

export interface FundingBreakdown {
  /** What the fan paid. */
  grossCents: number;
  /** CRWN's own revenue. Never reduced by a split. */
  platformFeeCents: number;
  /** Referral/clipper commission. Artist-funded, paid to the referrer. */
  attributedCutCents: number;
  /** The artist's take BEFORE any collaborator reserve. This is earnings.net_amount. */
  artistNetCents: number;
  /** Total to withhold at charge time to fund collaborators. Artist-funded. */
  collaboratorReserveCents: number;
  /** Per-deal reserve, cap already applied. Sums to collaboratorReserveCents. */
  perDeal: { dealId: string; reserveCents: number }[];
  /** What actually lands in the artist's Connect account. */
  artistProceedsCents: number;
  /**
   * The percent to put in Stripe's application_fee_percent so the reserve is
   * withheld. Includes the platform fee and the attributed cut, exactly as today,
   * PLUS the collaborator reserve. Rounded to 2dp: Stripe accepts fractional
   * percents, and the residual rounding is reconciled in cents by this module.
   */
  applicationFeePercent: number;
}

/** Percent of gross, as cents, rounded half-up. Integer cents in, integer cents out. */
function pctOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

/**
 * THE CORE. Compute what must be withheld so a collaborator payout is funded by
 * the artist rather than by CRWN.
 *
 * Ordering is not arbitrary and must not be "simplified":
 *   1. CRWN's platform fee comes off first. It is CRWN's revenue.
 *   2. The referral/clipper cut comes next. It is artist-funded and already
 *      withheld today.
 *   3. The collaborator share is computed on what remains, so a collaborator can
 *      never be owed more than the artist actually took. This is the same order
 *      allocation.ts already uses when it accrues from earnings.net_amount, so the
 *      reserve and the later accrual agree by construction rather than by luck.
 *
 * Multiple deals are allocated in order and are collectively clamped to the
 * artist's net, so concurrent deals can never over-allocate (criterion I).
 */
export function computeFunding(sale: SaleInputs, deals: FundingDeal[]): FundingBreakdown {
  const grossCents = Math.max(0, Math.round(sale.grossCents));
  const platformFeePercent = Math.min(Math.max(sale.platformFeePercent, 0), 100);
  const attributedCutPercent = Math.min(Math.max(sale.attributedCutPercent, 0), 100 - platformFeePercent);

  const platformFeeCents = pctOf(grossCents, platformFeePercent);
  const attributedCutCents = pctOf(grossCents, attributedCutPercent);
  const artistNetCents = Math.max(0, grossCents - platformFeeCents - attributedCutCents);

  // Allocate each deal against its own basis, apply its cap, then clamp the
  // RUNNING TOTAL to the artist's net so the artist can never go negative no
  // matter how many deals exist or how they were configured.
  let remaining = artistNetCents;
  const perDeal: { dealId: string; reserveCents: number }[] = [];

  for (const deal of deals) {
    const basis = deal.payout_basis === 'gross_revenue' ? grossCents : artistNetCents;
    const pct = Math.min(Math.max(deal.percentage ?? 0, 0), 100);
    let want = basis <= 0 || pct <= 0 ? 0 : Math.round((basis * pct) / 100);

    // Cap is cumulative across the deal's lifetime, matching applyCap() in
    // allocation.ts. A deal that has already reached its cap reserves nothing.
    if (deal.cap_amount != null) {
      const headroom = deal.cap_amount - deal.already_accrued;
      want = headroom <= 0 ? 0 : Math.min(want, headroom);
    }

    const reserveCents = Math.max(0, Math.min(want, remaining));
    remaining -= reserveCents;
    perDeal.push({ dealId: deal.id, reserveCents });
  }

  const collaboratorReserveCents = perDeal.reduce((s, d) => s + d.reserveCents, 0);
  const artistProceedsCents = artistNetCents - collaboratorReserveCents;

  // Express the reserve as a percent of gross so it can ride Stripe's
  // application_fee_percent alongside the fee and the cut. Two decimals: Stripe
  // accepts fractional percents, and any sub-cent residual is immaterial because
  // the ledger below is authoritative in cents.
  const reservePercent = grossCents > 0
    ? Math.round((collaboratorReserveCents / grossCents) * 10000) / 100
    : 0;
  const applicationFeePercent = Math.min(
    100,
    Math.round((platformFeePercent + attributedCutPercent + reservePercent) * 100) / 100,
  );

  return {
    grossCents,
    platformFeeCents,
    attributedCutCents,
    artistNetCents,
    collaboratorReserveCents,
    perDeal,
    artistProceedsCents,
    applicationFeePercent,
  };
}

/**
 * CONSERVATION. Every cent the fan paid is accounted for exactly once, and CRWN's
 * revenue is exactly its own fee. If this ever returns false there is phantom
 * money and the sale must not proceed.
 */
export function reconciles(b: FundingBreakdown): boolean {
  const parts =
    b.platformFeeCents + b.attributedCutCents + b.collaboratorReserveCents + b.artistProceedsCents;
  return (
    parts === b.grossCents &&
    b.artistProceedsCents >= 0 &&
    b.collaboratorReserveCents >= 0 &&
    b.collaboratorReserveCents <= b.artistNetCents
  );
}

/**
 * Proof obligation for the ratified rule: CRWN's revenue on a sale must be its
 * platform fee, no more and no less, whatever the splits are. The reserve is held
 * BY CRWN but is not OWNED by CRWN, so it must never be booked as revenue.
 */
export function crwnRevenueCents(b: FundingBreakdown): number {
  return b.platformFeeCents;
}

/**
 * Clawback on refund. A refund must unwind the reserve in the same proportion it
 * was taken, otherwise a refunded sale leaves a collaborator funded by nobody.
 * Returns the reserve to give back, per deal, for a refund of `refundCents`.
 */
export function reserveClawback(b: FundingBreakdown, refundCents: number): { dealId: string; clawbackCents: number }[] {
  const refund = Math.max(0, Math.min(Math.round(refundCents), b.grossCents));
  if (refund === 0 || b.grossCents === 0) return b.perDeal.map(d => ({ dealId: d.dealId, clawbackCents: 0 }));
  const ratio = refund / b.grossCents;
  return b.perDeal.map(d => ({
    dealId: d.dealId,
    clawbackCents: Math.min(d.reserveCents, Math.round(d.reserveCents * ratio)),
  }));
}

// ============================================================================
// THE FUNDING BOUNDARY (ratified 2026-08-12)
// ============================================================================
// Three founder rules, and one mechanism that enforces all three at once.
//
//   1. EFFECTIVE DATE. A split never applies retroactively to a payment that
//      settled before the deal became effective.
//   2. NO PRE-DEAL ACCRUAL. An earning that was never reserved does not become a
//      collaborator obligation later, even if the source qualifies, even for an
//      all_earnings deal, even if the cap has room.
//   3. NO UNFUNDED ACCRUAL. CRWN must never create a positive collaborator
//      payable balance unless the money is actually reserved. The ledger promise
//      follows the money, never the other way round.
//
// The mechanism: an earning may only produce an accrual if that EARNING ITSELF
// carries proof that a reserve was withheld for that deal. Proof lives on
// `earnings.metadata.team_split_reserved`, a map of dealId to cents, written at
// settlement from what checkout actually withheld.
//
// Why this one rule covers all three: an earning that predates the deal has no
// reserve recorded, so it cannot accrue (rules 1 and 2). An earning from an
// existing subscription whose future invoice CRWN could not amend in time has no
// reserve, so it cannot accrue (rule 1's renewal case). And nothing can ever
// accrue beyond what was withheld (rule 3). The failure mode is "the collaborator
// is owed nothing", never "the collaborator is owed money nobody funded".
//
// It reuses `earnings.metadata`, which already carries `attributed_commission`
// for exactly the same concept: an artist-funded pass-through that must not be
// mistaken for CRWN revenue. No new table, no wallet, no second revenue ledger.

/** Where the funded reserve is recorded on an earning. */
export const RESERVE_METADATA_KEY = 'team_split_reserved';

/** The shape stored at `earnings.metadata.team_split_reserved`. */
export type ReserveRecord = Record<string, number>;

/**
 * How many cents were actually withheld for this deal against this earning.
 * Returns 0 for anything unproven, which is what makes the guard fail SAFE:
 * a missing, malformed, negative or non-numeric record funds nothing.
 */
export function fundedReserveFor(
  earningMetadata: unknown,
  dealId: string,
): number {
  if (!earningMetadata || typeof earningMetadata !== 'object') return 0;
  const bag = (earningMetadata as Record<string, unknown>)[RESERVE_METADATA_KEY];
  if (!bag || typeof bag !== 'object') return 0;
  const raw = (bag as Record<string, unknown>)[dealId];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
}

/**
 * The accrual guard. Given what the split math WANTS to accrue and what was
 * actually funded, return what may be accrued.
 *
 * This is the enforcement point for rule 3. It is deliberately a hard floor
 * rather than a warning: if the reserve is absent the answer is zero, and an
 * accrual of zero is simply not written. An artist is never billed for a
 * collaborator obligation CRWN failed to fund, and a collaborator is never shown
 * a balance that no money stands behind.
 */
export function accruableAmount(wantCents: number, fundedCents: number): number {
  if (!Number.isFinite(wantCents) || wantCents <= 0) return 0;
  if (!Number.isFinite(fundedCents) || fundedCents <= 0) return 0;
  return Math.min(Math.floor(wantCents), Math.floor(fundedCents));
}

/**
 * Reserve that is deterministically no longer owed to any collaborator and
 * therefore belongs to the ARTIST. Never CRWN revenue.
 *
 * Ratified: surplus arises when a cap lands below what was reserved, a deal is
 * cancelled under valid terms, multi-deal reconciliation leaves excess, or the
 * payout rounds below the reserve. It is NOT surplus while money is still
 * legitimately at risk (refund window, dispute, deliverable condition, hold), so
 * callers must resolve those first and pass the settled figures.
 */
export function surplusToArtist(reservedCents: number, finallyOwedCents: number): number {
  const reserved = Number.isFinite(reservedCents) ? Math.max(0, Math.floor(reservedCents)) : 0;
  const owed = Number.isFinite(finallyOwedCents) ? Math.max(0, Math.floor(finallyOwedCents)) : 0;
  return Math.max(0, reserved - owed);
}

/**
 * Is this earning inside the deal's funding boundary?
 *
 * Belt and braces alongside the reserve check: even if a reserve record somehow
 * appeared on an older earning, an earning that predates the deal's effective
 * moment can never accrue. Rule 1 and rule 2 stated directly rather than inferred.
 */
export function withinFundingBoundary(
  earningCreatedAt: string | Date,
  dealEffectiveAt: string | Date | null | undefined,
): boolean {
  if (!dealEffectiveAt) return false; // no effective date means no funded boundary
  const e = new Date(earningCreatedAt).getTime();
  const d = new Date(dealEffectiveAt).getTime();
  if (!Number.isFinite(e) || !Number.isFinite(d)) return false;
  return e >= d;
}

/**
 * The founder decisions, now RATIFIED (2026-08-12). Kept as the record of what
 * was decided and why, because each one changes what an artist takes home.
 */
export const FUNDING_RATIFIED_DECISIONS = [
  'Existing subscriptions: a split applies to a FUTURE payment only if the reserve was established before that payment settled. If CRWN could not amend the invoice in time, that renewal accrues nothing.',
  'Pre-deal earnings: no accrual may ever be created from an earning that predates the deal effective funding boundary. Historical artist money is not rewritten.',
  'Surplus: any reserve that becomes deterministically unowed belongs to the ARTIST, never CRWN revenue, and is released through a traceable idempotent path.',
] as const;

/** @deprecated Superseded by FUNDING_RATIFIED_DECISIONS. Retained so the history reads honestly. */
export const FUNDING_OPEN_QUESTIONS = [
  // 1. Existing subscriptions. application_fee_percent is fixed when a subscription
  //    is created. A deal accepted later does not change subscriptions already
  //    running, so their renewals would accrue without a reserve. Either CRWN
  //    updates every affected live subscription in Stripe when a deal is accepted
  //    (a bulk, rate-limited, partially-failing operation), or splits apply only to
  //    subscriptions created after the deal. The second is safer and easier to
  //    explain to an artist; the first matches what artists will expect.
  'Do splits apply to subscriptions that already exist, or only to new ones?',

  // 2. Pre-deal earnings. Accruals are computed by a daily cron from the earnings
  //    ledger, so a new deal can currently accrue against sales that happened
  //    BEFORE the deal existed and were never reserved. Those accruals are
  //    structurally unfunded. Either the cron only qualifies earnings created after
  //    the deal was accepted, or the artist owes the difference from later sales.
  'Can a deal accrue against earnings that predate it, which were never reserved?',

  // 3. Cap over-collection. The reserve is taken per sale, but the cap is
  //    cumulative. A sale can reserve money that the cap later makes unowed. That
  //    surplus sits in CRWN's balance belonging to the artist and must be returned,
  //    which is a new platform-to-artist transfer that does not exist today.
  'When a cap makes reserved money unowed, how is the surplus returned to the artist?',
] as const;
