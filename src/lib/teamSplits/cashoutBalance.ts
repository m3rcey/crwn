// Team Splits — THE CANONICAL CASHOUT BALANCE (TS-MONEY-005, TS-MONEY-019).
//
// ONE definition of what a collaborator may withdraw. Written as a pure function so the rule can be
// tested rather than trusted, and so no route can quietly invent a second answer.
//
// available =
//     FUNDED and RELEASED accruals        money that exists and is no longer held
//   - already PAID                        including pending payouts, or a double cashout races
//   - CLAWBACKS                           refunds and lost disputes, always counted
//   - NEGATIVE CARRY                      an unrecovered balance from a past refund/dispute
//   - FROZEN                              disputed sources have ZERO availability
//
// A PROVISIONAL reservation contributes NOTHING: it is an intention to withhold, not money.
// Artist-RETURNED surplus contributes NOTHING: those cents went home.
// A recovery SHORTFALL contributes NOTHING: money CRWN failed to claw back is not money it holds.

export interface CashoutInputs {
  /** Sum of accruals that are funded, released, cleared, and not reversed/disputed. Cents. */
  fundedReleasedCents: number;
  /** Completed AND pending payouts. Pending counts, or two requests can both spend it. */
  paidCents: number;
  /** Negative accrual rows (refund/dispute clawbacks). Pass as a POSITIVE magnitude. */
  clawbackCents: number;
  /** Carried negative balance from a past unrecovered event. Positive magnitude. */
  negativeCarryCents: number;
  /** Accruals whose funding source is frozen by a live Stripe dispute. Positive magnitude. */
  frozenCents: number;
}

/**
 * What the collaborator may actually withdraw, in integer cents. Never negative: a collaborator in
 * the red withdraws zero, and the debt persists in `negativeCarryCents` until future earnings clear
 * it. CRWN does not pursue it beyond that, which is the residual credit risk stated in doc 28.
 */
export function availableCashoutCents(i: CashoutInputs): number {
  const positive = Math.max(0, Math.floor(i.fundedReleasedCents));
  const deductions =
    Math.max(0, Math.floor(i.paidCents)) +
    Math.max(0, Math.floor(i.clawbackCents)) +
    Math.max(0, Math.floor(i.negativeCarryCents)) +
    Math.max(0, Math.floor(i.frozenCents));
  return Math.max(0, positive - deductions);
}

/**
 * May the rail pay out at all? Separate from the amount, because "how much" and "are the controls
 * in place" are different questions and conflating them is how a gate gets flipped by accident.
 *
 * Every clause must hold. This is the function the 503 gate consults once the canary passes.
 */
export interface CashoutReadiness {
  reservationLedgerApplied: boolean;
  /** Every eligible payment rail withholds through the atomic grant. */
  allRailsFunded: boolean;
  /** A production/test-mode canary has proven conservation end to end. */
  canaryPassed: boolean;
}

export function cashoutRailReady(r: CashoutReadiness): boolean {
  return r.reservationLedgerApplied && r.allRailsFunded && r.canaryPassed;
}
