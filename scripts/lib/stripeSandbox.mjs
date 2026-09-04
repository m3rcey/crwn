// Safe Stripe TEST-MODE execution. The one primitive every financial sandbox script uses.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: a financial sandbox script fails CLOSED on live
// credentials. It never reads STRIPE_SECRET_KEY, never falls back to it, and never uses
// "whatever Stripe key happens to exist". The app binds STRIPE_SECRET_KEY at module load in
// src/lib/stripe/client.ts, so a harness that imported the app's client would be live by
// construction. This builds its own client from a variable that can only ever be a test key.
//
// WHY A SHAPE CHECK IS NOT ENOUGH. "sk_test_" is a string a typo can produce and a restricted
// key can imitate. The only authority on whether a key is test mode is Stripe, so no client is
// handed back until Stripe itself answers livemode: false.
//
// THE SECRET NEVER LEAVES THIS FILE. It is read, passed to the Stripe constructor, and never
// logged, returned, stored, or interpolated into a message. Only the mode and the account id
// are ever printed.
//
// Reusable on purpose (Team Split funding validation will need exactly this and nothing
// prize-shaped), but deliberately narrow: a key guard, a verified client, and a label for
// disposable objects. It is not a Stripe framework.

import { readFileSync } from 'node:fs';
import Stripe from 'stripe';

/** The one test-mode variable. Introduced here because the repo had no convention. */
export const TEST_KEY_VAR = 'STRIPE_TEST_SECRET_KEY';

/** Stamped on every object the sandbox creates, so test data is identifiable and disposable. */
export const SANDBOX_LABEL = 'crwn-sandbox';

/**
 * Is this string a usable Stripe TEST secret, judged on shape alone?
 *
 * Pure and total: every input produces a verdict, and anything not positively identified as
 * test mode is refused. "unknown" and "live" are both refusals; they are separate only so the
 * operator gets a message naming what actually went wrong.
 */
export function classifyStripeKey(raw) {
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (!key) {
    return { ok: false, mode: 'missing', reason: TEST_KEY_VAR + ' is not set.' };
  }
  // Live is checked FIRST and by prefix, so a key that is live in any of Stripe's key
  // families (secret or restricted) is refused before any later rule can be generous.
  if (/^(sk|rk)_live_/.test(key)) {
    return {
      ok: false,
      mode: 'live',
      reason: TEST_KEY_VAR + ' holds a LIVE key. A financial sandbox refuses live credentials.',
    };
  }
  if (/^(sk|rk)_test_[A-Za-z0-9]/.test(key)) {
    return { ok: true, mode: 'test', reason: 'Test-mode key shape.' };
  }
  return { ok: false, mode: 'unknown', reason: TEST_KEY_VAR + ' is not recognisable as a Stripe test key.' };
}

/**
 * Read the test key from the process environment, falling back to .env.local ONLY for the
 * same variable name. There is deliberately no second variable and no second name: the
 * fallback is about WHERE the value is written, never about WHICH value is used.
 */
function readTestKey(envPath) {
  const fromProcess = process.env[TEST_KEY_VAR];
  if (fromProcess && fromProcess.trim()) return fromProcess.trim();
  try {
    const file = readFileSync(envPath, 'utf8');
    const m = file.match(new RegExp('^' + TEST_KEY_VAR + '=(.*)$', 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    // No .env.local is a normal state, not an error. The missing-key message covers it.
  }
  return '';
}

/** The exact founder handoff, printed whenever the sandbox cannot run. Never prints a key. */
export function printKeyRequired(reason, rerunCommand) {
  console.error('');
  console.error('# STRIPE TEST KEY REQUIRED');
  console.error('');
  console.error(reason);
  console.error('');
  console.error('  1. Open the Stripe Dashboard');
  console.error('  2. Switch to Test mode (the toggle at the top right), or open a Sandbox');
  console.error('  3. Developers, then API keys, then reveal the test-mode SECRET key (sk_test_...)');
  console.error('  4. Add it to .env.local as:  ' + TEST_KEY_VAR + '=sk_test_...');
  console.error('  5. Do not paste it into chat and do not commit it. .env.local is gitignored.');
  console.error('  6. Rerun:  ' + rerunCommand);
  console.error('');
  console.error('This never reads STRIPE_SECRET_KEY. The live key cannot satisfy ' + TEST_KEY_VAR + '.');
  console.error('');
}

/**
 * A Stripe client PROVEN to be in test mode, or a process that has already stopped.
 *
 * Two gates, and both must pass: the key shape refuses a live key without a network call, and
 * Stripe's own answer refuses anything the shape check let through by accident. Only after
 * both does a client exist to be used.
 */
export async function requireTestModeStripe(opts = {}) {
  const rerunCommand = opts.rerunCommand || '(see the script header)';
  const envPath = opts.envPath || new URL('../../.env.local', import.meta.url);
  const apiVersion = opts.apiVersion || '2026-02-25.clover';

  const key = readTestKey(envPath);
  const verdict = classifyStripeKey(key);
  if (!verdict.ok) {
    printKeyRequired(verdict.reason, rerunCommand);
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion });

  // Stripe is the authority, not the prefix. A key answering livemode: true here is a live
  // key wearing a test-looking name, and it must not be used for anything at all.
  let account;
  try {
    account = await stripe.accounts.retrieve();
  } catch (e) {
    console.error('\nSTOP: ' + TEST_KEY_VAR + ' was rejected by Stripe (' + e.message + '). Nothing was created.');
    process.exit(1);
  }

  const balance = await stripe.balance.retrieve();
  if (balance.livemode !== false) {
    console.error('\nSTOP: Stripe reports this key is LIVE mode. Refusing to create any object.');
    process.exit(1);
  }

  console.log('Stripe: TEST mode confirmed by Stripe (account ' + account.id + ', livemode=false).');
  return { stripe, accountId: account.id };
}

/** Metadata for a disposable sandbox object, so nothing created here is ever ambiguous. */
export function sandboxMetadata(run, extra = {}) {
  return { crwn_sandbox: SANDBOX_LABEL, crwn_sandbox_run: run, ...extra };
}
