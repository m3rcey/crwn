import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { subscriptionEarningNet } from './earningsNet';

// F-01 (product consistency audit, 2026-08-12).
//
// On an INITIAL referred subscription, Stripe charged the artist base fee + attributed cut
// (checkout adds the cut to application_fee_percent), but the earnings row stored
// gross - base fee only, so the ledger overstated the artist's take by the commission and
// Team Splits accrued a collaborator's share of money that belonged to the referrer.
// The renewal path subtracted correctly. These tests pin the ONE shared formula and the
// wiring that makes both webhook paths use it.
//
// All money is integer cents. No floating point.

describe('subscriptionEarningNet — the one net formula', () => {
  it('non-referred subscription: net = gross - base fee, commission 0', () => {
    // $10.00 tier, Launch plan 12% fee
    const r = subscriptionEarningNet({ grossCents: 1000, platformFeeCents: 120, attributedCutPercent: 0 });
    expect(r.commissionCents).toBe(0);
    expect(r.netCents).toBe(880);
  });

  it('referred first subscription: commission comes OUT of net', () => {
    // $10.00 tier, 12% base fee, artist runs a 10% fan-referral program.
    // Checkout charged 22% total; the artist's true take is $7.80, not $8.80.
    const r = subscriptionEarningNet({ grossCents: 1000, platformFeeCents: 120, attributedCutPercent: 10 });
    expect(r.commissionCents).toBe(100);
    expect(r.netCents).toBe(780);
    // The base platform fee is NOT touched by the commission: platform revenue unchanged.
    expect(1000 - 120 - r.commissionCents).toBe(r.netCents);
  });

  it('clipper-attributed subscription behaves identically to a fan referral', () => {
    // $25.00 tier, Pro 8% fee, clipper at 20%
    const r = subscriptionEarningNet({ grossCents: 2500, platformFeeCents: 200, attributedCutPercent: 20 });
    expect(r.commissionCents).toBe(500);
    expect(r.netCents).toBe(1800);
  });

  it('renewal equivalence: same inputs give the same outputs as the initial payment', () => {
    // The initial path feeds attributed_cut from checkout metadata; the renewal path feeds
    // referrals.commission_rate. Same tier, same locked rate -> identical ledger rows.
    const initial = subscriptionEarningNet({ grossCents: 1000, platformFeeCents: 80, attributedCutPercent: 10 });
    const renewal = subscriptionEarningNet({ grossCents: 1000, platformFeeCents: 80, attributedCutPercent: 10 });
    expect(initial).toEqual(renewal);
  });

  it('commission is capped at what the fee could cover — the platform never funds a gap', () => {
    // Absurd 95% cut on a 12% fee plan: commission caps at gross - fee, net floors at 0.
    const r = subscriptionEarningNet({ grossCents: 1000, platformFeeCents: 120, attributedCutPercent: 95 });
    expect(r.commissionCents).toBe(880);
    expect(r.netCents).toBe(0);
  });

  it('rounding matches the historical renewal formula exactly (Math.round of gross * pct)', () => {
    // $9.99 at 8% fee with a 10% referral: round(999 * 0.10) = 100, net = 999 - 80 - 100.
    const r = subscriptionEarningNet({ grossCents: 999, platformFeeCents: 80, attributedCutPercent: 10 });
    expect(r.commissionCents).toBe(Math.min(Math.round(999 * 0.1), 999 - 80));
    expect(r.netCents).toBe(999 - 80 - r.commissionCents);
  });

  it('never emits a negative number or a non-integer, whatever garbage arrives', () => {
    for (const input of [
      { grossCents: 0, platformFeeCents: 0, attributedCutPercent: 0 },
      { grossCents: -500, platformFeeCents: 120, attributedCutPercent: 10 },
      { grossCents: 1000, platformFeeCents: -5, attributedCutPercent: 10 },
      { grossCents: 1000, platformFeeCents: 120, attributedCutPercent: NaN },
      { grossCents: NaN, platformFeeCents: NaN, attributedCutPercent: 250 },
      { grossCents: 1000, platformFeeCents: 5000, attributedCutPercent: 10 },
    ]) {
      const r = subscriptionEarningNet(input);
      expect(r.commissionCents).toBeGreaterThanOrEqual(0);
      expect(r.netCents).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(r.commissionCents)).toBe(true);
      expect(Number.isInteger(r.netCents)).toBe(true);
    }
  });
});

// ── Source wiring: the formula is only worth anything if both webhook paths use it ──

const HANDLERS = readFileSync('src/lib/webhookHandlers.ts', 'utf8');
const CHECKOUT = readFileSync('src/app/api/stripe/checkout/route.ts', 'utf8');
const ALLOCATION = readFileSync('src/lib/teamSplits/allocation.ts', 'utf8');

describe('F-01 wiring — both subscription paths share the formula', () => {
  it('webhookHandlers imports and calls subscriptionEarningNet at least twice (initial + renewal)', () => {
    expect(HANDLERS).toContain("from '@/lib/earningsNet'");
    expect((HANDLERS.match(/subscriptionEarningNet\(\{/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('the initial path reads the cut checkout charged, from attributed_cut metadata', () => {
    expect(HANDLERS).toContain("session.metadata?.attributed_cut");
    expect(CHECKOUT).toContain('attributed_cut: String(attributedCut)');
  });

  it('the old asymmetric formulas are gone from the SUBSCRIPTION handlers', () => {
    // Scope to the two subscription functions: the non-subscription rails (product, track,
    // booking, live ticket, tip) carry no referral commission, so gross - fee IS their
    // correct net and they legitimately keep the plain formula.
    const initial = HANDLERS.slice(
      HANDLERS.indexOf('export async function handleCheckoutCompleted'),
      HANDLERS.indexOf('export async function handleInvoicePaid'),
    );
    const renewal = HANDLERS.slice(
      HANDLERS.indexOf('export async function handleSubscriptionRenewal'),
      HANDLERS.indexOf('export async function handleInvoicePaymentFailed'),
    );
    expect(initial.length).toBeGreaterThan(0);
    expect(renewal.length).toBeGreaterThan(0);
    for (const body of [initial, renewal]) {
      expect(body).not.toContain('const netAmount = grossAmount - platformFee;');
      expect(body).not.toMatch(/netAmount\s*-\s*referralCommission/);
      expect(body).toContain('subscriptionEarningNet({');
    }
  });

  it('Stripe application-fee semantics are unchanged: checkout still charges base + cut', () => {
    // The referral cut is still added to the platform fee. That formula is untouched.
    expect(CHECKOUT).toContain('const effectiveFeePercent = platformFeePercent + attributedCut;');
    // 2026-08-13: the value SENT to Stripe is now `subscriptionFeePercent`, which is
    // `effectiveFeePercent` plus the Team Split reserve, and falls back to `effectiveFeePercent`
    // exactly when no split qualifies. The F-01 property this test protects is that the referral
    // cut is never dropped, so assert the FALLBACK rather than the old literal: a subscription with
    // no Team Split must be byte-for-byte the economics it had before the reserve existed.
    expect(CHECKOUT).toContain('application_fee_percent: subscriptionFeePercent');
    expect(CHECKOUT).toContain(': effectiveFeePercent;');
    // 2026-08-13: the reserve percentage now comes from the CEILING plan (firstChargeFeePlan), not
    // from computeFunding's percent, because Stripe's two-decimal limit could otherwise retain
    // fewer cents than the collaborator accepted. The F-01 property is unchanged: no split still
    // means exactly effectiveFeePercent.
    expect(CHECKOUT).toContain('firstChargeFeePlan({');
  });

  it('platform_fee stays the base cut — admin revenue is not polluted by pass-through commission', () => {
    // Both handlers write platform_fee from the base-percent computation only.
    expect((HANDLERS.match(/platform_fee:\s*platformFee/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(HANDLERS).not.toMatch(/platform_fee:\s*platformFee\s*\+/);
  });

  it('F-09: renewal notification shows the ledger value, not the pre-commission value', () => {
    // The renewal earning notification (now routed through createNotification, F-06) renders
    // artistNet — the exact value the earnings row stored.
    expect(HANDLERS).toMatch(/createNotification\([^)]*'earning', `💰 \+\$\$\{\(artistNet \/ 100\)\.toFixed\(2\)\}`/);
    // And the stale pre-commission render is gone.
    expect(HANDLERS).not.toContain('(netAmount / 100).toFixed(2)}`, `${fanName} renewed');
  });

  it('Team Split net basis reads earnings.net_amount, and gross basis stays gross', () => {
    expect(ALLOCATION).toContain(
      "deal.payout_basis === 'gross_revenue' ? earning.gross_amount : earning.net_amount",
    );
  });

  it('refund clawback path is untouched: still keyed on the _refund idempotency marker', () => {
    expect(HANDLERS).toContain("paymentIntentId + '_refund'");
    expect(HANDLERS).toContain('insertHeldReferralEarning');
  });

  it('no double commission: exactly one commission writer per path (processReferral / insertHeldReferralEarning)', () => {
    // The net subtraction must not ALSO write a referral_earnings row; only the existing
    // referral machinery pays. processReferral is called once, from the initial path.
    expect((HANDLERS.match(/processReferral\(\{/g) || []).length).toBe(1);
  });
});
