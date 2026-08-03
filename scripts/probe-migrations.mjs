// Which migrations are actually applied in production?
//
// "I ran the migrations" has meant "I ran some of them" often enough that this
// exists. Run it after any migration hand-off instead of trusting the SQL
// editor's OK. Usage: node scripts/probe-migrations.mjs
//
// It probes with the ANON key on purpose (never a superuser session: a
// privileged session passes checks that a real caller would fail). PostgREST
// tells us which of three states each object is in:
//   200                      -> exists and is readable
//   42501 / permission denied-> exists, reads revoked (expected for hardened columns)
//   42703 / 42P01 / no exist -> the migration has NOT been applied
//
// Add a line to PROBES when you ship a migration. A trigger's existence is
// invisible to anon; probe the TABLE or COLUMN it depends on, and verify the
// trigger's data effect separately where it is observable.

import { readFileSync } from 'node:fs';

const PROBES = [
  ['plan recommendation columns', 'artist_profiles?select=recommended_plan&limit=1', 'schema-phase2-platform-plan-recommendation.sql'],
  ['support chat tables', 'support_conversations?select=id&limit=1', 'schema-phase2-support-chat.sql'],
  ['funnel events', 'funnel_events?select=id&limit=1', 'schema-phase2-funnel-events.sql'],
  ['promise calendar', 'fulfillment_events?select=id&limit=1', 'schema-phase2-promise-calendar.sql'],
  ['opportunity ledger', 'opportunity_ledger?select=id&limit=1', 'schema-phase2-opportunity-ledger.sql'],
  ['experiments', 'experiments?select=id&limit=1', 'schema-phase2-experiments.sql'],
  ['community channels', 'community_channels?select=id&limit=1', 'schema-phase2-community-channels.sql'],
  ['quest engine', 'quest_instances?select=id&limit=1', 'schema-phase2-quest-engine.sql'],
  ['artist palette columns', 'artist_profiles?select=accent_hex&limit=1', 'schema-phase2-artist-palette.sql'],
  ['banner position columns', 'artist_profiles?select=banner_pos_x&limit=1', 'schema-phase2-banner-position.sql'],
  ['membership strategy columns', 'artist_profiles?select=membership_strategy&limit=1', 'schema-phase2-membership-strategy.sql'],
  ['track waterfall column', 'tracks?select=waterfall&limit=1', 'schema-phase2-track-waterfall.sql'],
  ['support chat resolution columns', 'support_conversations?select=resolved_by&limit=1', 'schema-phase2-support-chat-resolution.sql'],
];

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const pick = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
  if (!m) throw new Error(`${k} missing from .env.local`);
  return m[1].trim().replace(/^["']|["']$/g, '');
};
const anon = pick('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const url = pick('NEXT_PUBLIC_SUPABASE_URL');

let missing = 0;
for (const [label, path, file] of PROBES) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: anon } });
  const body = await res.text();
  let verdict;
  if (res.ok) {
    verdict = 'applied (readable)';
  } else if (body.includes('42501') || /permission denied/i.test(body)) {
    verdict = 'applied (reads revoked, expected)';
  } else if (body.includes('42703') || body.includes('42P01') || /does not exist|could not find/i.test(body)) {
    verdict = `NOT APPLIED -> run supabase/${file}`;
    missing += 1;
  } else {
    verdict = `unclear: ${res.status} ${body.slice(0, 100)}`;
  }
  console.log(`${label.padEnd(30)} ${verdict}`);
}

console.log(`\n${missing} migration(s) not applied.`);
