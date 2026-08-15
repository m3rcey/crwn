// Read-only check of the LIVE platform-sequence email copy.
//
// Exists because the copy lives in the database, not in the repo, so nothing in `npm test` can see
// it and the anon migration probe cannot either: `platform_sequences` returns 200 with [] under
// RLS, which proves the table exists and nothing about its contents.
//
// It is a FILE rather than an inline one-liner on purpose. Three separate shell-escaped `node -e`
// checks during this work returned false readings because `\$` and `\/` were mangled on the way
// through bash, and one of them reported "migration applied" when it had not been.
//
// Run: bash -c 'source ./load-env.sh; node scripts/verify-platform-sequence-copy.mjs'
// Exit 0 = clean. Exit 1 = something live is wrong, and it says what.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Canonical truth, mirrored from src/lib/platformTier.ts. If Pro's price moves, change it there
// first, then here, then write a migration for the copy.
const PRO_MONTHLY_DISPLAY = 49;

/**
 * Every class of untruth found by reading all 27 live bodies on 2026-08-15. Ordered worst first.
 * A rule here is one that reached real artists, not a hypothetical.
 */
const CONTENT_RULES = [
  [/[0-9]+x (more|less|likely)|[0-9]{2,}% (more|of artists)/i, 'invented statistic'],
  [/Basic \(\$|Middle \(\$|Premium \(\$/i, 'wrong tier ladder (canonical: Bronze free / Silver 10 / Gold 25 / Platinum 100)'],
  [/most artists|top artists|artists on CRWN are/i, 'implied peer proof CRWN does not have'],
  [/\bSMS\b/i, 'removed feature (SMS)'],
  [/9\.99|\$50\/mo|\$200\/mo|\$99\/mo/, 'stale or non-canonical price'],
  [/\?tab=/, 'legacy ?tab= link (tiers: /account/tiers, music: /studio/music)'],
  [/\bguarantee/i, 'guarantee claim'],
];

const { data: sequences, error: seqErr } = await db.from('platform_sequences').select('id, name, trigger_type, is_active');
if (seqErr) {
  console.error('Could not read platform_sequences:', seqErr.message);
  process.exit(1);
}
const triggerById = Object.fromEntries(sequences.map((s) => [s.id, s.trigger_type]));

const { data: steps, error: stepErr } = await db
  .from('platform_sequence_steps')
  .select('sequence_id, step_number, subject, body');
if (stepErr) {
  console.error('Could not read platform_sequence_steps:', stepErr.message);
  process.exit(1);
}

const where = (s) => `${triggerById[s.sequence_id] ?? '?'} step${s.step_number}`;
const failures = [];

// 1-2. Every content rule, against subject AND body.
for (const s of steps) {
  const text = `${s.subject ?? ''} \n ${s.body ?? ''}`;
  for (const [re, label] of CONTENT_RULES) {
    const m = text.match(re);
    if (m) failures.push(`${label} in ${where(s)}: "${m[0].trim()}"`);
  }
}

// 3. No em or en dash, per the standing copy rule.
const dashed = steps.filter((s) => /[—–]/.test(`${s.subject ?? ''}${s.body ?? ''}`));
if (dashed.length) failures.push(`${dashed.length} of ${steps.length} steps contain an em or en dash`);

// 4. The Pro upgrade email quotes the real price.
const proStep = steps.find((s) => triggerById[s.sequence_id] === 'starter_upgrade_nudge' && s.step_number === 1);
if (!proStep) {
  failures.push('starter_upgrade_nudge step 1 is missing entirely');
} else if (!proStep.body.includes(`$${PRO_MONTHLY_DISPLAY}/mo`)) {
  failures.push(`Pro upgrade step 1 does not quote $${PRO_MONTHLY_DISPLAY}/mo`);
}

// 5. The Stripe nudge exists, because it guards the money gate.
if (!sequences.some((s) => s.trigger_type === 'activation_no_stripe' && s.is_active)) {
  failures.push('no ACTIVE activation_no_stripe sequence: artists with tiers but no Stripe are never nudged');
}

console.log(`platform sequences: ${sequences.length}   steps: ${steps.length}`);
if (failures.length === 0) {
  console.log('\nPASS. Live copy quotes the real price, promises no removed feature, and has no em dashes.');
  process.exit(0);
}
console.log(`\nFAIL. ${failures.length} problem(s) in LIVE email copy:\n`);
for (const f of failures) console.log(`  - ${f}`);
console.log('\nFix: run supabase/schema-phase2-platform-sequence-copy-truth.sql in the Supabase SQL editor.');
process.exit(1);
