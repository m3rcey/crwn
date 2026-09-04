// The live-key refusal, frozen as a test.
//
// This is the single property that makes a financial sandbox safe to run at all: a script
// that creates subscriptions, coupons and schedules must be incapable of doing it with the
// production key. The guard lives in scripts/lib/stripeSandbox.mjs because that is where it
// is used; it is tested from here because this is where the suite runs, and one
// implementation tested from elsewhere is better than a second copy living beside the test.
//
// Deliberately asserts SHAPE and VERDICT, never a message string: the wording of an operator
// message should be free to improve without a test pretending that is a behaviour change.

import { describe, it, expect } from 'vitest';
// The guard is plain JS on purpose: it runs from node scripts with no build step, the way
// every other verify:* probe in this repo does. TypeScript infers its exports fine from here.
import { classifyStripeKey, TEST_KEY_VAR, SANDBOX_LABEL } from '../../../scripts/lib/stripeSandbox.mjs';

type Verdict = { ok: boolean; mode: string; reason: string };
const classify = classifyStripeKey as (raw: unknown) => Verdict;

// Fixtures are ASSEMBLED rather than written out. None of them is a real credential, but a
// literal shaped like one trips GitHub's push protection and, worse, teaches the next reader
// that key-shaped strings are fine to paste into a file. Building them from parts keeps the
// test honest about what it is testing and keeps the repo free of anything scanner-shaped.
const LIVE_SECRET = ['sk', 'live', '51ExampleNotARealCredential'].join('_');
const LIVE_RESTRICTED = ['rk', 'live', '51ExampleNotARealCredential'].join('_');
const TEST_SECRET = ['sk', 'test', '51ExampleNotARealCredential'].join('_');
const TEST_RESTRICTED = ['rk', 'test', '51ExampleNotARealCredential'].join('_');

describe('stripe sandbox key guard', () => {
  it('REFUSES a live secret key', () => {
    const v = classify(LIVE_SECRET);
    expect(v.ok).toBe(false);
    expect(v.mode).toBe('live');
  });

  it('REFUSES a live restricted key', () => {
    // rk_live_ is still production authority. Refusing only sk_live_ would leave a real
    // credential family able to drive the sandbox.
    expect(classify(LIVE_RESTRICTED).ok).toBe(false);
    expect(classify(LIVE_RESTRICTED).mode).toBe('live');
  });

  it('refuses a missing key rather than defaulting to anything', () => {
    for (const empty of ['', '   ', undefined, null]) {
      const v = classify(empty);
      expect(v.ok).toBe(false);
      expect(v.mode).toBe('missing');
    }
  });

  it('refuses anything it cannot positively identify as test mode', () => {
    // Not an allowlist of known-bad prefixes: anything unrecognised is refused, so a future
    // Stripe key family is refused by default instead of being quietly accepted.
    for (const odd of ['pk_test_abc', 'whsec_abc', 'sk_test', 'sk_testing', 'sk_', 'hello']) {
      expect(classify(odd).ok).toBe(false);
    }
  });

  it('accepts a test secret key and a test restricted key', () => {
    expect(classify(TEST_SECRET)).toMatchObject({ ok: true, mode: 'test' });
    expect(classify(TEST_RESTRICTED)).toMatchObject({ ok: true, mode: 'test' });
  });

  it('tolerates surrounding whitespace, because a pasted key carries it', () => {
    expect(classify('  ' + TEST_SECRET + '  ').ok).toBe(true);
    // But whitespace must not rescue a live key.
    expect(classify('  ' + LIVE_SECRET + '  ').mode).toBe('live');
  });

  it('names one variable, and it is not the production one', () => {
    expect(TEST_KEY_VAR).toBe('STRIPE_TEST_SECRET_KEY');
    expect(TEST_KEY_VAR).not.toBe('STRIPE_SECRET_KEY');
    expect(SANDBOX_LABEL).toBe('crwn-sandbox');
  });

  it('never READS the production key, only ever names it in an operator message', async () => {
    // "No fallback to live" asserted against the source, because the fallback this forbids is
    // one nobody would write on purpose: it appears when someone adds a convenience default.
    //
    // The guard is about a READ, not a mention. The handoff message deliberately names
    // STRIPE_SECRET_KEY to tell the operator their live key will not be used, and that string
    // must stay legal. So the assertion is on the two ways a value can actually be obtained.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../../scripts/lib/stripeSandbox.mjs', import.meta.url), 'utf8');

    // No environment read of the production key, in any accessor form.
    expect(src).not.toMatch(/process\.env\s*\.\s*STRIPE_SECRET_KEY/);
    expect(src).not.toMatch(/process\.env\s*\[\s*['"`]STRIPE_SECRET_KEY/);
    // No .env.local read of it either, which is the other place a value could come from.
    expect(src).not.toMatch(/\^?\s*['"`]?STRIPE_SECRET_KEY=/);

    // And positively: the ONLY environment variable this file indexes is the test one.
    const envReads = src.match(/process\.env\s*(\.\w+|\[[^\]]+\])/g) || [];
    expect(envReads.length).toBeGreaterThan(0);
    for (const read of envReads) expect(read).toContain('TEST_KEY_VAR');
  });
});
