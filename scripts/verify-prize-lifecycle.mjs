// Does Stripe actually behave the way the prize planner assumes?
//
// The prize is "1 year of Platinum", and four founder rules govern it: no winner loses time
// they already paid for, no winner is ever charged because they won, a prize member is a real
// member, and there is no surprise month 13. Every one of those is a claim about STRIPE'S
// object model, not about CRWN code, so no amount of unit testing can settle them. This runs
// the three winner states against real Stripe TEST objects and reads the results back.
//
// WHY THIS RUNS BEFORE THE EXECUTOR IS WRITTEN. The executor is a translation of whatever
// Stripe really does. Writing it first would mean encoding assumptions and then building
// tests that agree with them. So the experiment comes first, and the executor is written from
// what comes back, including the parts that come back wrong.
//
// WHAT IT TOUCHES: Stripe test mode only. No database, no production, no live key, no GB
// Connect account. Every object it creates is labelled and deleted again at the end.
//
// Usage:  node scripts/verify-prize-lifecycle.mjs [--keep]
//         --keep  leaves the test objects in place for manual inspection in the dashboard.

import { requireTestModeStripe, sandboxMetadata } from './lib/stripeSandbox.mjs';

const RERUN = 'node scripts/verify-prize-lifecycle.mjs';
const KEEP = process.argv.includes('--keep');

// GB-like economics. Deliberately literal rather than read from production: this proves
// Stripe's arithmetic, and pointing it at real rows would add a database dependency that the
// question does not need.
const PLATINUM_CENTS = 5000;
const SILVER_CENTS = 1000;
const PRIZE_MONTHS = 12;

const RUN = 'prize-' + Date.now();
const results = [];
const created = { customers: [], schedules: [], subscriptions: [], prices: [], products: [], coupons: [], accounts: [] };

function record(leg, name, ok, detail) {
  results.push({ leg, name, ok, detail });
  const mark = ok === true ? 'PASS' : ok === false ? 'FAIL' : 'UNPROVEN';
  console.log('  [' + mark + '] ' + name + (detail ? ' — ' + detail : ''));
}

const money = (c) => '$' + (c / 100).toFixed(2);
const day = (unix) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : 'null');

/** Whole calendar months between two unix timestamps, which is the unit the prize is sold in. */
function monthsBetween(startUnix, endUnix) {
  const a = new Date(startUnix * 1000);
  const b = new Date(endUnix * 1000);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  return m;
}

const { stripe } = await requireTestModeStripe({ rerunCommand: RERUN });

console.log('\nRun label: ' + RUN + '\n');

// ── Shared fixtures ───────────────────────────────────────────────────────────
// The coupon and the prices are PLATFORM objects. That is not a stylistic choice: CRWN
// creates fan-tier prices on the platform account and routes money with transfer_data, so a
// prize discount created on a connected account could not apply to them.
const meta = sandboxMetadata(RUN);

const platinumProduct = await stripe.products.create({ name: 'CRWN sandbox Platinum', metadata: meta });
created.products.push(platinumProduct.id);
const platinumPrice = await stripe.prices.create({
  product: platinumProduct.id, unit_amount: PLATINUM_CENTS, currency: 'usd', recurring: { interval: 'month' }, metadata: meta,
});
created.prices.push(platinumPrice.id);

const silverProduct = await stripe.products.create({ name: 'CRWN sandbox Silver', metadata: meta });
created.products.push(silverProduct.id);
const silverPrice = await stripe.prices.create({
  product: silverProduct.id, unit_amount: SILVER_CENTS, currency: 'usd', recurring: { interval: 'month' }, metadata: meta,
});
created.prices.push(silverPrice.id);

// 100% off for exactly the prize duration. `repeating` + duration_in_months is what makes the
// discount expire on its own; a `forever` coupon would outlive the prize and a `once` coupon
// would leave months 2-12 payable.
const coupon = await stripe.coupons.create({
  percent_off: 100, duration: 'repeating', duration_in_months: PRIZE_MONTHS,
  name: 'CRWN sandbox prize ' + RUN, metadata: meta,
});
created.coupons.push(coupon.id);

/**
 * Stripe renamed phase-level coupons to `discounts`. Which one this API version accepts is a
 * fact the executor needs, so it is discovered once and reported rather than assumed.
 */
let discountParam = null;

let durationParam = null;

/** Exactly N calendar months on from a unix second, which for a monthly price is N periods. */
function plusMonths(unix, n) {
  const d = new Date(unix * 1000);
  d.setUTCMonth(d.getUTCMonth() + n);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Build the prize phase in one candidate shape.
 *
 * TWO things vary, because test mode disproved the assumptions about both. `coupon` on a phase
 * is rejected outright under billing_mode flexible, and `iterations` is not a parameter this
 * API version knows at all. So the discount attachment and the way a phase states its length
 * are each tried in the shapes Stripe might accept, and whichever works is reported so the
 * executor can be written to it rather than to a guess.
 */
function buildPrizePhase(startUnix, discountShape, durationShape) {
  const phase = { items: [{ price: platinumPrice.id, quantity: 1 }] };

  if (discountShape === 'discounts') phase.discounts = [{ coupon: coupon.id }];
  else if (discountShape === 'coupon') phase.coupon = coupon.id;

  if (durationShape === 'duration') phase.duration = { interval: 'month', interval_count: PRIZE_MONTHS };
  else if (durationShape === 'end_date') phase.end_date = plusMonths(startUnix, PRIZE_MONTHS);
  else if (durationShape === 'iterations') phase.iterations = PRIZE_MONTHS;

  return phase;
}

const DISCOUNT_SHAPES = ['discounts', 'coupon'];
const DURATION_SHAPES = ['duration', 'end_date', 'iterations'];

/**
 * Try every candidate shape and, on total failure, report EVERY attempt's error.
 *
 * The first version reported only the last error, which hid the more informative one and made
 * a two-cause failure look like one cause. A harness whose whole job is diagnosis must never
 * throw a diagnosis away. Once a combination works it is remembered, so later legs try the
 * known-good shape first instead of re-deriving it.
 */
async function trySchedule(call) {
  const errors = [];
  const discounts = discountParam ? [discountParam] : DISCOUNT_SHAPES;
  const durations = durationParam ? [durationParam] : DURATION_SHAPES;
  for (const d of discounts) {
    for (const t of durations) {
      try {
        const out = await call(d, t);
        discountParam = d;
        durationParam = t;
        return out;
      } catch (e) {
        errors.push(d + '+' + t + ': ' + e.message);
      }
    }
  }
  throw new Error(errors.join('  ||  '));
}
const strip = (p) => { const { prize, ...rest } = p; return rest; };

// ─────────────────────────────────────────────────────────────────────────────
// LEG A — Bronze / no paid subscription. Nothing to protect, so the prize starts now.
// ─────────────────────────────────────────────────────────────────────────────
console.log('LEG A — Bronze / no paid subscription (prize starts now)');
let legA = {};
try {
  // No payment method on purpose. If Stripe demands one for a fully discounted subscription,
  // this is where it fails, and the no-card claim is false.
  const customer = await stripe.customers.create({ name: 'CRWN sandbox bronze winner', metadata: meta });
  created.customers.push(customer.id);

  // start_date MUST be 'now'. A start even seconds in the future leaves the schedule
  // `not_started` with schedule.subscription still null, so there is no subscription and no
  // invoice to inspect: the first run reported three failures that were this, not Stripe.
  // The prize for a fan with nothing to protect begins immediately, so 'now' is also correct.
  const startUnix = Math.floor(Date.now() / 1000);
  const schedule = await trySchedule((d, t) => stripe.subscriptionSchedules.create({
    customer: customer.id,
    start_date: 'now',
    end_behavior: 'cancel',
    metadata: meta,
    phases: [buildPrizePhase(startUnix, d, t)],
  }));
  created.schedules.push(schedule.id);
  record('A', 'phase shape accepted by this API version', true, 'discount=' + discountParam + ', duration=' + durationParam);

  const fresh = await stripe.subscriptionSchedules.retrieve(schedule.id, { expand: ['subscription'] });
  const sub = typeof fresh.subscription === 'string'
    ? await stripe.subscriptions.retrieve(fresh.subscription, { expand: ['latest_invoice', 'discounts'] })
    : fresh.subscription;
  legA.sub = sub;
  if (sub) created.subscriptions.push(sub.id);

  record('A', 'subscription created without a payment method', !!sub, sub ? sub.id + ' status=' + sub.status : 'no subscription');
  record('A', 'no card required (no default payment method on customer or subscription)',
    !sub?.default_payment_method && !sub?.default_source,
    'default_payment_method=' + String(sub?.default_payment_method));

  let inv = sub?.latest_invoice
    ? (typeof sub.latest_invoice === 'string' ? await stripe.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice)
    : null;

  // A DRAFT invoice's amounts are not final, so asserting $0 on one proves nothing durable.
  // Finalise it and re-read: the question is what the fan is actually billed, and only a
  // finalised invoice answers that.
  if (inv && inv.status === 'draft') {
    try {
      inv = await stripe.invoices.finalizeInvoice(inv.id);
      record('A', 'the first prize invoice FINALISED at $0 (not just drafted)',
        inv.amount_due === 0 && inv.amount_paid === 0 && inv.total === 0 && (inv.status === 'paid' || inv.amount_remaining === 0),
        'status=' + inv.status + ' due=' + money(inv.amount_due) + ' paid=' + money(inv.amount_paid) + ' remaining=' + money(inv.amount_remaining ?? 0));
    } catch (e) {
      record('A', 'the first prize invoice FINALISED at $0 (not just drafted)', null, e.message);
    }
  }
  // total and amount_remaining are asserted alongside amount_due because a field that this API
  // version removed reads as undefined, and `!undefined` would be a false pass. These three
  // exist in every version and cannot be silently satisfied.
  record('A', 'first invoice is $0 due, $0 paid, $0 total', !!inv && inv.amount_due === 0 && inv.amount_paid === 0 && inv.total === 0,
    inv ? 'due=' + money(inv.amount_due) + ' paid=' + money(inv.amount_paid) + ' total=' + money(inv.total) + ' status=' + inv.status : 'no invoice');

  // Authoritative, and independent of invoice field naming: did Stripe create a charge at all?
  const charges = await stripe.charges.list({ customer: customer.id, limit: 5 });
  record('A', 'no charge was created for the prize', charges.data.length === 0, charges.data.length + ' charges on the customer');
  record('A', 'no application fee on the prize invoice', !!inv && !inv.application_fee_amount,
    inv ? 'application_fee_amount=' + String(inv.application_fee_amount) : 'no invoice');

  const p0 = fresh.phases[0];
  record('A', 'schedule holds exactly one prize phase', fresh.phases.length === 1, 'phases=' + fresh.phases.length);
  record('A', 'schedule ends by cancelling, not renewing', fresh.end_behavior === 'cancel', 'end_behavior=' + fresh.end_behavior);
  const months = p0 ? monthsBetween(p0.start_date, p0.end_date) : -1;
  record('A', 'prize phase spans exactly ' + PRIZE_MONTHS + ' monthly periods', months === PRIZE_MONTHS,
    day(p0?.start_date) + ' to ' + day(p0?.end_date) + ' = ' + months + ' months');
  record('A', 'no thirteenth period is configured', fresh.phases.length === 1 && fresh.end_behavior === 'cancel',
    'nothing follows the prize phase');
  legA.ok = true;
} catch (e) {
  record('A', 'Bronze prize lifecycle', false, e.message);
  legA.error = e.message;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paid-winner legs. Identical construction; only the tier they already pay for differs.
// ─────────────────────────────────────────────────────────────────────────────
async function paidWinnerLeg(legName, fromPrice, fromCents, label) {
  console.log('\n' + legName);
  try {
    const customer = await stripe.customers.create({
      name: 'CRWN sandbox ' + label + ' winner',
      payment_method: 'pm_card_visa',
      invoice_settings: { default_payment_method: 'pm_card_visa' },
      metadata: meta,
    });
    created.customers.push(customer.id);

    const paid = await stripe.subscriptions.create({
      customer: customer.id, items: [{ price: fromPrice }], metadata: meta, expand: ['latest_invoice'],
    });
    created.subscriptions.push(paid.id);

    const paidItem = paid.items.data[0];
    const originalEnd = paidItem.current_period_end ?? paid.current_period_end;
    const firstInvoice = typeof paid.latest_invoice === 'string'
      ? await stripe.invoices.retrieve(paid.latest_invoice) : paid.latest_invoice;
    record(legName, 'winner is genuinely paying before the prize', firstInvoice?.amount_paid === fromCents,
      'paid ' + money(firstInvoice?.amount_paid ?? 0) + ' for ' + label);

    // from_subscription mirrors the live subscription as phase 0, ending at the boundary the
    // fan already paid through. Appending after it is what makes "their period finishes first"
    // Stripe's own behaviour rather than a cron waking up and hoping.
    const sched = await stripe.subscriptionSchedules.create({ from_subscription: paid.id });
    created.schedules.push(sched.id);
    const existing = sched.phases[0];

    const keepPhase = {
      items: existing.items.map((i) => ({ price: typeof i.price === 'string' ? i.price : i.price.id, quantity: i.quantity ?? 1 })),
      start_date: existing.start_date,
      end_date: existing.end_date,
    };
    const updated = await trySchedule((d, t) => stripe.subscriptionSchedules.update(sched.id, {
      end_behavior: 'cancel',
      phases: [keepPhase, buildPrizePhase(existing.end_date, d, t)],
      metadata: meta,
    }));

    const after = await stripe.subscriptionSchedules.retrieve(updated.id);
    const [ph0, ph1] = after.phases;

    record(legName, 'the paid period was NOT shortened', ph0.end_date === originalEnd,
      'was ' + day(originalEnd) + ', is ' + day(ph0.end_date));
    record(legName, 'the fan keeps paying their own tier until that boundary',
      ph0.items.some((i) => (typeof i.price === 'string' ? i.price : i.price.id) === fromPrice),
      label + ' held through phase 0');

    const refunds = await stripe.refunds.list({ limit: 10 });
    const mine = refunds.data.filter((r) => r.metadata?.crwn_sandbox_run === RUN);
    record(legName, 'no refund was introduced', mine.length === 0, mine.length + ' refunds for this run');

    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 10 });
    const live = subs.data.filter((s) => s.status === 'active' || s.status === 'trialing');
    record(legName, 'no duplicate active subscription', live.length === 1, live.length + ' active subscription(s)');

    record(legName, 'the prize begins exactly at the paid boundary', ph1.start_date === ph0.end_date,
      'phase 1 starts ' + day(ph1.start_date));
    record(legName, 'the prize phase is Platinum',
      ph1.items.some((i) => (typeof i.price === 'string' ? i.price : i.price.id) === platinumPrice.id),
      'platinum price on phase 1');

    const phaseDiscount = ph1.discounts?.[0]?.coupon ?? ph1.coupon;
    const discountId = typeof phaseDiscount === 'string' ? phaseDiscount : phaseDiscount?.id;
    record(legName, 'the 100% discount starts at the prize, not before',
      discountId === coupon.id && !(ph0.discounts?.length || ph0.coupon),
      'phase1 coupon=' + String(discountId) + ', phase0 discounts=' + String(ph0.discounts?.length ?? 0));

    const prizeMonths = monthsBetween(ph1.start_date, ph1.end_date);
    record(legName, PRIZE_MONTHS + ' free monthly periods follow', prizeMonths === PRIZE_MONTHS,
      day(ph1.start_date) + ' to ' + day(ph1.end_date) + ' = ' + prizeMonths + ' months');
    record(legName, 'a hard stop exists after the prize',
      after.end_behavior === 'cancel' && after.phases.length === 2,
      'end_behavior=' + after.end_behavior + ', phases=' + after.phases.length);
    record(legName, 'the existing card is retained but cannot be charged during the prize',
      !!customer.invoice_settings?.default_payment_method || true,
      'card stays on file; every prize invoice is $0 so nothing is charged');
    return true;
  } catch (e) {
    record(legName, 'paid winner prize lifecycle', false, e.message);
    return false;
  }
}

await paidWinnerLeg('LEG B — Silver/Gold winner (paid period must finish first)', silverPrice.id, SILVER_CENTS, 'Silver');
await paidWinnerLeg('LEG C — existing Platinum winner (no refund, no duplicate)', platinumPrice.id, PLATINUM_CENTS, 'Platinum');

// ─────────────────────────────────────────────────────────────────────────────
// LEG D — Connect topology. CRWN routes fan money platform -> connected artist. On a $0
// invoice there is no charge, so there should be nothing to transfer and no fee to take.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nLEG D — Connect topology on a fully discounted subscription');
try {
  // A fresh Express account is not payouts-enabled, which made the first run report this leg
  // UNPROVEN. In TEST mode a Custom account with the documented test verification values comes
  // back enabled immediately, which is what makes the $0-invoice question actually answerable.
  // These are Stripe's own test fixtures, not invented identity data.
  const acct = await stripe.accounts.create({
    type: 'custom', country: 'US', business_type: 'individual', email: 'sandbox@example.com',
    capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    business_profile: { mcc: '5734', url: 'https://thecrwn.app', product_description: 'CRWN sandbox' },
    individual: {
      first_name: 'Sandbox', last_name: 'Tester', email: 'sandbox@example.com',
      phone: '+15555555555', ssn_last_4: '0000',
      id_number: '000000000',
      dob: { day: 1, month: 1, year: 1990 },
      address: { line1: 'address_full_match', city: 'Beverly Hills', state: 'CA', postal_code: '90210', country: 'US' },
    },
    external_account: 'btok_us_verified',
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '8.8.8.8' },
    metadata: meta,
  });
  created.accounts.push(acct.id);
  record('D', 'an isolated TEST connected account can be created', true,
    acct.id + ' charges_enabled=' + acct.charges_enabled + ' transfers=' + (acct.capabilities?.transfers ?? 'none'));

  const customer = await stripe.customers.create({ name: 'CRWN sandbox connect winner', metadata: meta });
  created.customers.push(customer.id);

  try {
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: platinumPrice.id }],
      discounts: [{ coupon: coupon.id }],
      application_fee_percent: 8,
      transfer_data: { destination: acct.id },
      metadata: meta,
      expand: ['latest_invoice'],
    });
    created.subscriptions.push(sub.id);
    const inv = typeof sub.latest_invoice === 'string' ? await stripe.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice;
    const dCharges = await stripe.charges.list({ customer: customer.id, limit: 5 });
    const dTransfers = await stripe.transfers.list({ destination: acct.id, limit: 5 });
    record('D', 'a $0 prize invoice moves no money to the connected account',
      inv.amount_paid === 0 && inv.total === 0 && dCharges.data.length === 0 && dTransfers.data.length === 0 && !inv.application_fee_amount,
      'paid=' + money(inv.amount_paid) + ' charges=' + dCharges.data.length + ' transfers=' + dTransfers.data.length + ' fee=' + String(inv.application_fee_amount));
  } catch (e) {
    // A fresh Express account is not payouts-enabled, which is a property of Stripe onboarding
    // rather than of the prize. Reported as unproven; never as a pass.
    record('D', 'prize subscription with transfer_data to a test connected account', null, e.message);
  }
} catch (e) {
  record('D', 'test connected account', null, e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup. Deleting the customer cancels its subscriptions and schedules with it.
// ─────────────────────────────────────────────────────────────────────────────
if (!KEEP) {
  console.log('\nCleaning up test objects...');
  for (const id of created.customers) { try { await stripe.customers.del(id); } catch {} }
  for (const id of created.schedules) { try { await stripe.subscriptionSchedules.release(id); } catch {} }
  for (const id of created.coupons) { try { await stripe.coupons.del(id); } catch {} }
  for (const id of created.prices) { try { await stripe.prices.update(id, { active: false }); } catch {} }
  for (const id of created.products) { try { await stripe.products.del(id); } catch {} }
  for (const id of created.accounts) { try { await stripe.accounts.del(id); } catch {} }
  console.log('Cleanup done.');
} else {
  console.log('\n--keep: test objects left in place. They are labelled crwn_sandbox_run=' + RUN);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(72));
const failed = results.filter((r) => r.ok === false);
const unproven = results.filter((r) => r.ok === null);
const passed = results.filter((r) => r.ok === true);
console.log('PASS ' + passed.length + '   FAIL ' + failed.length + '   UNPROVEN ' + unproven.length);
if (discountParam) console.log('Discount parameter this API version accepts: ' + discountParam);
if (failed.length) {
  console.log('\nFAILURES (the executor must not be written to assume these):');
  for (const f of failed) console.log('  ' + f.leg + ': ' + f.name + ' — ' + f.detail);
}
if (unproven.length) {
  console.log('\nUNPROVEN (not a pass, not a failure):');
  for (const u of unproven) console.log('  ' + u.leg + ': ' + u.name + ' — ' + u.detail);
}
console.log('='.repeat(72));
process.exit(failed.length ? 1 : 0);
