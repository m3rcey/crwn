// Project credits: the boundaries that make "recognition only, fulfilled automatically" true.
// Each assertion was mutation-tested when it landed (introduce the violation, watch it fail, revert).

import { describe, expect, it } from 'vitest';
import { listSourceFiles, readStripped, violation } from '@/lib/architecture/sourceScan';
import { creditProductCopy, RECOGNITION_ONLY, tapeProductCopy } from './credits';

const DOCS = 'supabase/schema-phase2-project-credits.sql';

describe('project credits boundaries', () => {
  it('no browser code names the credits tables: every read and write goes through a server route', () => {
    const offenders = listSourceFiles('src')
      .filter((f) => !f.startsWith('src/app/api/') && !f.startsWith('src/lib/'))
      .filter((f) => /from\(\s*['"](project_credits|product_offer_events)['"]/.test(readStripped(f)));
    expect(offenders, violation('CREDITS-001', 'a page or component reads a closed credits table directly', { docs: DOCS })).toEqual([]);
  });

  it('a checkout start cannot be forged by the beacon; it is recorded only inside product-checkout', () => {
    const beacon = readStripped('src/app/api/offer-events/route.ts');
    expect(beacon, violation('CREDITS-002', 'the offer beacon accepts offer_checkout_started', { file: 'src/app/api/offer-events/route.ts' })).not.toMatch(/offer_checkout_started/);
    expect(readStripped('src/app/api/stripe/product-checkout/route.ts')).toMatch(/eventType:\s*'offer_checkout_started'/);
  });

  it('both tracking write paths skip founder devices', () => {
    for (const f of ['src/app/api/offer-events/route.ts', 'src/app/api/stripe/product-checkout/route.ts']) {
      expect(readStripped(f), violation('CREDITS-003', 'a credits tracking path does not check requestHasDnt', { file: f })).toMatch(/requestHasDnt\(/);
    }
  });

  it('the credit is numbered on the settled purchase, and the assigner writes no money row', () => {
    const handlers = readStripped('src/lib/webhookHandlers.ts');
    const product = handlers.slice(handlers.indexOf('async function handleProductPurchase'));
    expect(product.slice(0, product.indexOf('\nexport async function'))).toMatch(/assignCreditForPurchase\(supabaseAdmin, purchase\.id\)/);
    const server = readStripped('src/lib/projectCredits/server.ts');
    expect(server, violation('CREDITS-004', 'project credits write to a money table')).not.toMatch(/from\(\s*'(earnings|purchases|subscriptions)'\s*\)\s*\.(insert|update|upsert|delete)/);
  });

  it('no live gate asks for a ticket alone: a Founding Supporter seat is honored everywhere a ticket is', () => {
    const gates = listSourceFiles('src').filter((f) => f !== 'src/lib/live/access.ts' && /hasPaidLiveTicket|paidTicketBuyersBySession/.test(readStripped(f)));
    expect(gates, violation('CREDITS-005', 'a live gate checks paid tickets without the credit seat; call hasLiveSeat / seatHoldersBySession', { file: 'src/lib/live/access.ts' })).toEqual([]);
  });

  it('the product copy Stripe shows says recognition only, in words, with no dash punctuation', () => {
    for (const level of ['founding', 'supporter'] as const) {
      const { title, description } = creditProductCopy(level, 'Stompin Thru The Trenches', 'Prince Dre');
      expect(description).toContain(RECOGNITION_ONLY);
      expect(`${title} ${description}`).not.toMatch(/[–—]/);
    }
    expect(creditProductCopy('founding', 'X', 'Dre').description).toMatch(/live session/);
    expect(creditProductCopy('supporter', 'X', 'Dre').description).not.toMatch(/live session/);
  });

  it('a credit claims the tape only when the gate grants it, and the tape copy sells songs, not a membership', () => {
    expect(creditProductCopy('founding', 'X', 'Dre').description).not.toMatch(/whole tape/);
    expect(creditProductCopy('founding', 'X', 'Dre', true).description).toMatch(/whole tape is yours/);
    expect(creditProductCopy('supporter', 'X', 'Dre', true).description).toMatch(/whole tape is yours/);
    const tape = tapeProductCopy('Stompin Thru The Trenches', 'Prince Dre', 16);
    expect(tape.description).toMatch(/All 16 songs/);
    expect(`${tape.title} ${tape.description}`).not.toMatch(/[\u2013\u2014]/);
  });

  it('the fan-facing page never promises a membership or income', () => {
    const page = readStripped('src/components/credits/CreditsOffer.tsx');
    // The one place those words may appear is RECOGNITION_ONLY itself, which says what this is NOT.
    // Tier names are matched case-SENSITIVELY, as a fan reads them: `bg-crwn-gold` is a class name.
    expect(page).not.toMatch(/\b(Platinum|Gold|Silver)\b/);
    expect(page).not.toMatch(/royalt|profit|equity|invest/i);
    expect(page).toContain('RECOGNITION_ONLY');
  });
});
