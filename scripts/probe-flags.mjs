// Which feature flags are actually ON in production?
//
// READ-ONLY. One GET against admin_settings. It never writes, and it must never
// be extended to write: flipping a flag is a founder decision, not a script's.
//
// This exists because a flag's CODE DEFAULT has lied about production more than
// once. `isPopupEngineEnabled` defaults false, and the docs said "off by
// default" long after the row was flipped on; the same drift then happened to
// quest_engine, live_tips, royalty_readiness and producer_sessions, which the
// Brain called dark while TODO called them live. No unit test can settle that
// (a test cannot read production), so this probe is the live layer that does.
// See docs/crwn-brain/26-PRODUCT-DRIFT-PREVENTION.md section 4.
//
// Usage: npm run verify:flags
//
// It needs the SERVICE ROLE key: admin_settings is admin-gated, so the anon key
// (correctly) sees nothing. That is the one probe in this repo that cannot use
// anon, and the reason is the point of the table.

import { readFileSync } from 'node:fs';

// Flags the product declares somewhere. Anything in admin_settings that is not
// here prints as UNDECLARED, and anything here missing from the DB prints as
// ABSENT (which reads as OFF through every gate, all of which fail closed).
const DECLARED = [
  ['quest_engine', 'Quest Engine / Rise Mode progression'],
  ['popup_engine', 'Pop-up Engine (interruption arbitration)'],
  ['acquisition_engine', 'Instagram/ManyChat acquisition engine'],
  ['experiments', 'Experiments engine'],
  ['live_tips', 'Live tips + tip goals'],
  ['royalty_readiness', 'Royalty Readiness Check'],
  ['producer_sessions', 'Executive Producer Sessions'],
  ['artist_gate', 'Artist approval gate (OFF = open signup)'],
];

// Not feature flags: configuration rows that live in the same table.
const CONFIG_KEYS = new Set(['fixed_costs', 'variable_costs', 'frl_cost_assumptions']);

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const pick = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
  if (!m) throw new Error(`${k} missing from .env.local`);
  return m[1].trim().replace(/^["']|["']$/g, '');
};
const url = pick('NEXT_PUBLIC_SUPABASE_URL');
const key = pick('SUPABASE_SERVICE_ROLE_KEY');

const res = await fetch(`${url}/rest/v1/admin_settings?select=key,value`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error(`admin_settings read failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const rows = await res.json();
const byKey = new Map(rows.map((r) => [r.key, r.value]));

console.log('Feature flags in production (read-only):\n');
for (const [flag, label] of DECLARED) {
  const value = byKey.get(flag);
  const state = value === undefined ? 'ABSENT (reads as OFF)' : value?.enabled === true ? 'ON' : 'OFF';
  console.log(`${flag.padEnd(20)} ${state.padEnd(22)} ${label}`);
}

const undeclared = rows.map((r) => r.key).filter((k) => !CONFIG_KEYS.has(k) && !DECLARED.some(([d]) => d === k));
if (undeclared.length) {
  console.log(`\nUNDECLARED keys in admin_settings (add them to DECLARED here and to the`);
  console.log(`FEATURES registry in src/lib/architecture/invariants.ts): ${undeclared.join(', ')}`);
}

console.log('\nA flag being ON is not proof the feature is reachable: the surface must exist too.');
console.log('Feature state (live/dark/dormant) lives in FEATURES, src/lib/architecture/invariants.ts.');
