// Does a scheduled tier DOWNGRADE actually bill the lower price at the paid boundary?
//
// THE DEFECT THIS EXISTS FOR (found 2026-10-02). /api/stripe/subscription-update recorded a
// downgrade as `pending_tier_id` in the database and changed NOTHING in Stripe. The webhook only
// applies a pending tier when Stripe bills that tier's price, which never happened, so a fan who
// stepped down kept paying the higher price indefinitely and the lower tier never applied.
//
// The fix schedules the change in Stripe itself, with the same from_subscription construction
// the prize rail proved on 2026-09-04: phase 0 is the period the fan already paid for, phase 1
// is the lower price, and end_behavior 'release' hands the subscription back as an ordinary
// subscription on that price. This harness proves, against real Stripe TEST objects on a test
// clock that is advanced past the boundary, that:
//   1. the paid period is not shortened and nothing is refunded,
//   2. the NEXT invoice is the lower price,
//   3. that invoice still routes to the artist's connected account with the platform fee,
//   4. after release the subscription is an ordinary one on the lower price (no schedule left).
//
// WHAT IT TOUCHES: Stripe test mode only (scripts/lib/stripeSandbox.mjs refuses live keys). No
// database. Every object is labelled and deleted at the end.
//
// Usage:  node scripts/verify-downgrade-schedule.mjs [--keep]

import { requireTestModeStripe, sandboxMetadata } from './lib/stripeSandbox.mjs';
import { downgradeScheduleUpdateParams } from '../src/lib/subscriptions/downgradeSchedule.ts';

const RERUN = 'node scripts/verify-downgrade-schedule.mjs';
const KEEP = process.argv.includes('--keep');
const GOLD_CENTS = 2500;
const SILVER_CENTS = 1000;
const FEE_PERCENT = 12;

const RUN = 'downgrade-' + Date.now();
const results = [];
const created = { customers: [], prices: [], products: [], accounts: [], clocks: [] };
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log('  [' + (ok === true ? 'PASS' : ok === false ? 'FAIL' : 'UNPROVEN') + '] ' + name + (detail ? ': ' + detail : ''));
}
const money = (c) => '$' + (c / 100).toFixed(2);
const day = (u) => (u ? new Date(u * 1000).toISOString().slice(0, 10) : 'null');
const priceOf = (i) => (typeof i.price === 'string' ? i.price : i.price.id);

const { stripe } = await requireTestModeStripe({ rerunCommand: RERUN });
const meta = sandboxMetadata(RUN);
console.log('\nRun label: ' + RUN + '\n');

async function waitForClock(id) {
  for (let i = 0; i < 60; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(id);
    if (c.status === 'ready') return c;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('test clock never became ready');
}

try {
  const product = await stripe.products.create({ name: 'CRWN sandbox tier', metadata: meta });
  created.products.push(product.id);
  const gold = await stripe.prices.create({ product: product.id, unit_amount: GOLD_CENTS, currency: 'usd', recurring: { interval: 'month' }, metadata: meta });
  const silver = await stripe.prices.create({ product: product.id, unit_amount: SILVER_CENTS, currency: 'usd', recurring: { interval: 'month' }, metadata: meta });
  created.prices.push(gold.id, silver.id);

  // A transfers-enabled TEST connected account, built exactly as the prize harness builds it.
  const acct = await stripe.accounts.create({
    type: 'custom', country: 'US', business_type: 'individual', email: 'sandbox@example.com',
    capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    business_profile: { mcc: '5734', url: 'https://thecrwn.app', product_description: 'CRWN sandbox' },
    individual: {
      first_name: 'Sandbox', last_name: 'Tester', email: 'sandbox@example.com', phone: '+15555555555',
      ssn_last_4: '0000', id_number: '000000000', dob: { day: 1, month: 1, year: 1990 },
      address: { line1: 'address_full_match', city: 'Beverly Hills', state: 'CA', postal_code: '90210', country: 'US' },
    },
    external_account: 'btok_us_verified',
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '8.8.8.8' },
    metadata: meta,
  });
  created.accounts.push(acct.id);
  const routed = acct.capabilities?.transfers === 'active';
  record('a transfers-enabled TEST connected account exists', routed, acct.id);

  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: RUN });
  created.clocks.push(clock.id);
  const customer = await stripe.customers.create({
    name: 'CRWN sandbox downgrading fan', test_clock: clock.id,
    payment_method: 'pm_card_visa', invoice_settings: { default_payment_method: 'pm_card_visa' }, metadata: meta,
  });
  created.customers.push(customer.id);

  // The fan's Gold subscription, routed the way /api/stripe/checkout routes every fan subscription.
  const sub = await stripe.subscriptions.create({
    customer: customer.id, items: [{ price: gold.id }], metadata: meta,
    ...(routed ? { transfer_data: { destination: acct.id }, application_fee_percent: FEE_PERCENT } : {}),
    expand: ['latest_invoice'],
  });
  const paidEnd = sub.items.data[0].current_period_end ?? sub.current_period_end;
  record('the fan is genuinely paying Gold first', sub.latest_invoice?.amount_paid === GOLD_CENTS, 'paid ' + money(sub.latest_invoice?.amount_paid ?? 0));

  // THE CONSTRUCTION UNDER TEST: the exact params the route sends.
  const sched = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
  const ph0 = sched.phases[0];
  await stripe.subscriptionSchedules.update(sched.id, downgradeScheduleUpdateParams({
    existingPhase: {
      items: ph0.items.map((i) => ({ price: priceOf(i), quantity: i.quantity ?? 1 })),
      start_date: ph0.start_date,
      end_date: ph0.end_date,
    },
    newStripePriceId: silver.id,
    metadata: meta,
  }));
  const after = await stripe.subscriptionSchedules.retrieve(sched.id);
  record('the paid Gold period is NOT shortened', after.phases[0].end_date === paidEnd, day(after.phases[0].end_date));
  record('Silver starts exactly at the paid boundary', after.phases[1].start_date === paidEnd && priceOf(after.phases[1].items[0]) === silver.id, day(after.phases[1].start_date));
  record('the schedule releases afterwards (no forced end)', after.end_behavior === 'release', after.end_behavior);
  if (routed) {
    record('artist routing is on the schedule', after.default_settings?.transfer_data?.destination === acct.id,
      'destination=' + String(after.default_settings?.transfer_data?.destination) + ' fee=' + String(after.default_settings?.application_fee_percent));
  }
  const live0 = await stripe.subscriptions.retrieve(sub.id);
  record('Stripe still bills Gold before the boundary (access is not cut early)', priceOf(live0.items.data[0]) === gold.id);

  // Cross the boundary, then a second one so the schedule's single Silver phase ends and releases.
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: paidEnd + 3 * 86400 });
  await waitForClock(clock.id);
  const live1 = await stripe.subscriptions.retrieve(sub.id, { expand: ['latest_invoice'] });
  const inv = live1.latest_invoice;
  record('after the boundary the subscription bills Silver', priceOf(live1.items.data[0]) === silver.id, priceOf(live1.items.data[0]));
  record('the next invoice is the Silver price, with no proration', inv?.amount_due === SILVER_CENTS, 'amount_due ' + money(inv?.amount_due ?? 0));
  if (routed) {
    // Newer API versions drop `invoice.charge`; the charge is found by customer and amount instead.
    const charges = await stripe.charges.list({ customer: customer.id, limit: 10 });
    const charge = charges.data.find((c) => c.amount === SILVER_CENTS && c.paid) ?? null;
    const dest = charge?.destination ?? charge?.transfer_data?.destination ?? null;
    const fee = charge?.application_fee_amount ?? null;
    if (charge) {
      record('the Silver charge still routes to the artist', (typeof dest === 'string' ? dest : dest?.id) === acct.id, 'destination=' + String(typeof dest === 'string' ? dest : dest?.id));
      record('the platform fee is applied to the Silver charge', fee === Math.round(SILVER_CENTS * FEE_PERCENT / 100), 'fee=' + String(fee));
    } else {
      record('Silver invoice charge inspected', null, 'invoice ' + String(inv?.id) + ' status=' + String(inv?.status) + ' has no charge object on this API version');
    }
  }
  const refunds = await stripe.refunds.list({ limit: 20 });
  record('nothing was refunded', refunds.data.filter((r) => r.metadata?.crwn_sandbox_run === RUN).length === 0);

  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: paidEnd + 35 * 86400 });
  await waitForClock(clock.id);
  const live2 = await stripe.subscriptions.retrieve(sub.id);
  record('after release it is an ordinary active Silver subscription', live2.status === 'active' && priceOf(live2.items.data[0]) === silver.id && !live2.schedule,
    'status=' + live2.status + ' schedule=' + String(live2.schedule));
} catch (e) {
  record('downgrade lifecycle', false, e.message);
}

// ── LEG 2: a fan who scheduled a step-down, then changes their mind ──────────────────────────
// An upgrade or a cancel must replace the pending step-down. The route releases the CRWN schedule
// first; this proves the subscription is then an ordinary one that takes either change, and that
// releasing does not move the price or the paid boundary.
console.log('\nLEG 2: release, then upgrade or cancel');
try {
  const product = await stripe.products.create({ name: 'CRWN sandbox tier 2', metadata: meta });
  created.products.push(product.id);
  const gold = await stripe.prices.create({ product: product.id, unit_amount: GOLD_CENTS, currency: 'usd', recurring: { interval: 'month' }, metadata: meta });
  const silver = await stripe.prices.create({ product: product.id, unit_amount: SILVER_CENTS, currency: 'usd', recurring: { interval: 'month' }, metadata: meta });
  const platinum = await stripe.prices.create({ product: product.id, unit_amount: 5000, currency: 'usd', recurring: { interval: 'month' }, metadata: meta });
  created.prices.push(gold.id, silver.id, platinum.id);

  for (const next of ['upgrade', 'cancel']) {
    const customer = await stripe.customers.create({
      name: 'CRWN sandbox ' + next + ' fan', payment_method: 'pm_card_visa',
      invoice_settings: { default_payment_method: 'pm_card_visa' }, metadata: meta,
    });
    created.customers.push(customer.id);
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: gold.id }], metadata: meta });
    const end = sub.items.data[0].current_period_end ?? sub.current_period_end;
    const sched = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
    const ph0 = sched.phases[0];
    await stripe.subscriptionSchedules.update(sched.id, downgradeScheduleUpdateParams({
      existingPhase: { items: ph0.items.map((i) => ({ price: priceOf(i), quantity: i.quantity ?? 1 })), start_date: ph0.start_date, end_date: ph0.end_date },
      newStripePriceId: silver.id,
      metadata: meta,
    }));
    await stripe.subscriptionSchedules.release(sched.id);
    const released = await stripe.subscriptions.retrieve(sub.id);
    record(next + ': release leaves Gold and the paid boundary untouched',
      !released.schedule && priceOf(released.items.data[0]) === gold.id && (released.items.data[0].current_period_end ?? released.current_period_end) === end);
    if (next === 'upgrade') {
      const up = await stripe.subscriptions.update(sub.id, {
        items: [{ id: released.items.data[0].id, price: platinum.id }], proration_behavior: 'create_prorations',
      });
      record('upgrade after release takes effect', priceOf(up.items.data[0]) === platinum.id);
    } else {
      const c = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      record('cancel at period end after release takes effect', c.cancel_at_period_end === true && c.status === 'active');
    }
  }
} catch (e) {
  record('release then change', false, e.message);
}

if (!KEEP) {
  for (const id of created.customers) { try { await stripe.customers.del(id); } catch {} }
  for (const id of created.clocks) { try { await stripe.testHelpers.testClocks.del(id); } catch {} }
  for (const id of created.prices) { try { await stripe.prices.update(id, { active: false }); } catch {} }
  for (const id of created.products) { try { await stripe.products.update(id, { active: false }); } catch {} }
  for (const id of created.accounts) { try { await stripe.accounts.del(id); } catch {} }
}

const failed = results.filter((r) => r.ok === false);
console.log('\nPASS ' + results.filter((r) => r.ok === true).length + '   FAIL ' + failed.length + '   UNPROVEN ' + results.filter((r) => r.ok === null).length);
process.exit(failed.length ? 1 : 0);
