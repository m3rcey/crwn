import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { readStripped, violation } from './architecture/sourceScan';

// Ledger integrity: the two things an `earnings` row must never get wrong.
//
// SEC-005 (cybersecurity audit, 2026-08-12) — WHO earned it.
//   `/api/stripe/booking-checkout` took an `artistId` from the request body and wrote it into the
//   Stripe metadata and the `booking_purchases` row. The money destination was always safe (the
//   transfer used the artist derived from the booking session), but the webhook trusts that
//   metadata into `earnings`, `checkAndAwardMilestones` and `recordFirstPaidConversion`, so a fan
//   could pay artist A and credit artist B. That route was DELETED on 2026-09-03 along with the
//   rest of the book-an-artist flow, which is a strictly stronger guarantee than the fix was: a
//   route that does not exist cannot be called with anything. The assertion below now pins its
//   absence, so re-adding a booking checkout fails here and has to come back with the fix in it.
//
// SEC-006 (same audit) — HOW MUCH was earned.
//   Subscription earnings recorded the tier's catalog price instead of the amount Stripe actually
//   collected, so a 100%-off code minted a full-price earning and a full net behind a $0 charge.
//   That phantom net funds real platform-funded transfers (recruiter commission, Team Splits) and
//   inflates GMV, milestones and the break-even pop-ups.
//
// Both handlers are I/O-bound webhook code with no seam to unit test, so these are source-scan
// assertions. They are mutation-tested: reintroducing either bug fails this suite.

const BOOKING_ROUTE_PATH = 'src/app/api/stripe/booking-checkout/route.ts';
const HANDLERS_PATH = 'src/lib/webhookHandlers.ts';

const HANDLERS = readStripped(HANDLERS_PATH);

function slice(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  expect(start, `marker not found: ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `marker not found: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

const INITIAL_SUBSCRIPTION = slice(
  HANDLERS,
  'export async function handleCheckoutCompleted',
  'export async function handleInvoicePaid',
);
const RENEWAL = slice(
  HANDLERS,
  'export async function handleSubscriptionRenewal',
  'export async function handleInvoicePaymentFailed',
);
const BOOKING_HANDLER = slice(
  HANDLERS,
  'export async function handleBookingPurchase',
  'export async function handleLiveTicketPurchase',
);

const DOCS = 'docs/CYBERSECURITY_AUDIT_2026-08-12.md';

// ── Positive control: none of the assertions below can pass on an empty read ──

describe('positive control — the scanned sources are real', () => {
  it('both files were read and are substantial', () => {
    expect(HANDLERS.length).toBeGreaterThan(10000);
  });

  it('every scanned handler slice is non-empty and is the handler it claims to be', () => {
    for (const [name, body] of [
      ['handleCheckoutCompleted', INITIAL_SUBSCRIPTION],
      ['handleSubscriptionRenewal', RENEWAL],
      ['handleBookingPurchase', BOOKING_HANDLER],
    ] as const) {
      expect(body.length, name).toBeGreaterThan(500);
      expect(body, name).toContain("from('earnings')");
    }
  });
});

// ── SEC-005 — the artist credited is derived, never client-supplied ──

describe('SEC-005 — no client-supplied artist id reaches the booking ledger', () => {
  it('there is no booking checkout route at all', () => {
    expect(
      existsSync(BOOKING_ROUTE_PATH),
      violation('SEC-005', 'a booking checkout route is back; booking an artist was removed on 2026-09-03, and the route this replaces took a client-supplied artistId into the ledger', {
        file: BOOKING_ROUTE_PATH,
        docs: DOCS,
      }),
    ).toBe(false);
  });

  it('the booking webhook credits the booking session owner, not session metadata', () => {
    expect(
      /const\s*\{[^}]*\bartist_id\b[^}]*\}\s*=\s*metadata/.test(BOOKING_HANDLER),
      violation('SEC-005', 'handleBookingPurchase takes the credited artist from Stripe metadata', {
        file: HANDLERS_PATH,
        docs: DOCS,
      }),
    ).toBe(false);
    expect(/metadata[?]?\.artist_id/.test(BOOKING_HANDLER)).toBe(false);
    expect(BOOKING_HANDLER).toContain('booking.artist_id');
    expect(BOOKING_HANDLER).toContain("from('booking_sessions')");
  });

  it('the credited artist is the one used by every ledger consumer in that handler', () => {
    // earnings row, milestone award and first-paid conversion all read the same derived id.
    expect(BOOKING_HANDLER).toMatch(/checkAndAwardMilestones\(artist_id,/);
    expect(BOOKING_HANDLER).toMatch(/artistId:\s*artist_id/);
  });
});

// ── SEC-006 — the gross recorded is the amount actually charged ──

describe('SEC-006 — subscription earnings book the amount charged, not the sticker price', () => {
  it('the initial subscription rail no longer uses the bare tier price as gross', () => {
    expect(
      /grossAmount\s*=\s*tierData\?\.price/.test(INITIAL_SUBSCRIPTION),
      violation('SEC-006', 'handleCheckoutCompleted books the tier catalog price as gross earnings', {
        file: HANDLERS_PATH,
        docs: DOCS,
      }),
    ).toBe(false);
    expect(INITIAL_SUBSCRIPTION).toMatch(/grossAmount\s*=\s*session\.amount_total\s*\?\?/);
  });

  it('the renewal rail no longer uses the bare tier price as gross', () => {
    expect(
      /grossAmount\s*=\s*tier\?\.price/.test(RENEWAL),
      violation('SEC-006', 'handleSubscriptionRenewal books the tier catalog price as gross earnings', {
        file: HANDLERS_PATH,
        docs: DOCS,
      }),
    ).toBe(false);
    expect(RENEWAL).toContain('amount_paid');
    expect(RENEWAL).toMatch(/grossAmount\s*=\s*invoiceAmountPaid\s*\?\?/);
  });

  it('a real $0 charge stays $0: the charged amount is never coalesced with ||', () => {
    // `||` would turn a 100%-off checkout (amount_total 0) straight back into the sticker price,
    // which is the entire bug. Only null/undefined may fall back.
    for (const [name, body] of [
      ['handleCheckoutCompleted', INITIAL_SUBSCRIPTION],
      ['handleSubscriptionRenewal', RENEWAL],
    ] as const) {
      expect(
        /amount_total\s*\|\|/.test(body) || /amount_paid\s*\|\|/.test(body) || /invoiceAmountPaid\s*\|\|/.test(body),
        violation('SEC-006', `${name} falls back from a charged amount with || instead of ??`, {
          file: HANDLERS_PATH,
          docs: DOCS,
        }),
      ).toBe(false);
    }
  });

  it('platform fee, net and the stored gross all come from the corrected gross', () => {
    for (const [name, body] of [
      ['handleCheckoutCompleted', INITIAL_SUBSCRIPTION],
      ['handleSubscriptionRenewal', RENEWAL],
    ] as const) {
      expect(body, name).toContain('const platformFee = Math.round(grossAmount * (feePercent / 100));');
      expect(body, name).toContain('grossCents: grossAmount');
      expect(body, name).toContain('gross_amount: grossAmount');
    }
  });

  it('the catalog price survives as the tier price, so a discount is reconcilable', () => {
    // gross_amount = charged, metadata.tierPrice = catalog. The difference IS the discount.
    for (const [name, body] of [
      ['handleCheckoutCompleted', INITIAL_SUBSCRIPTION],
      ['handleSubscriptionRenewal', RENEWAL],
    ] as const) {
      expect(body, name).toContain('tierPrice: tierPriceCents');
    }
  });

  it('the product rail, the pattern this was copied from, is unchanged', () => {
    expect(HANDLERS).toContain('const grossAmount = session.amount_total ?? product.price ?? 0;');
  });
});
