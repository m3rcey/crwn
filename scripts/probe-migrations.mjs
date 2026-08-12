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
  // tier_events is server-write / owner-read, so the anon probe expects the TABLE to resolve
  // (RLS then returns zero rows, which is correct). A missing table 404s and fails the probe.
  ['tier events table', 'tier_events?select=id&limit=1', 'schema-phase2-tier-events.sql'],
  ['membership strategy columns', 'artist_profiles?select=membership_strategy&limit=1', 'schema-phase2-membership-strategy.sql'],
  ['track waterfall column', 'tracks?select=waterfall&limit=1', 'schema-phase2-track-waterfall.sql'],
  ['support chat resolution columns', 'support_conversations?select=resolved_by&limit=1', 'schema-phase2-support-chat-resolution.sql'],
  // Z3. The anon key sees the table but no rows (owner-only RLS), which is the correct pass here:
  // a 200 with [] proves the table exists, a 42P01 proves the migration has not run.
  ['constraint recommendation outcomes', 'constraint_recommendations?select=id&limit=1', 'schema-phase3-recommendation-outcomes.sql'],
  // Z8. Artist-read-only, so anon gets 200 with [] once applied; 42P01/PGRST205 means not run.
  ['tier transition history', 'tier_transitions?select=id&limit=1', 'schema-phase3-tier-transitions.sql'],
  // Z11. Artist-read-only RLS on both, so anon resolves the table and gets []; 42P01/PGRST205
  // means the migration has not run and the whole Virality surface is dark by design.
  ['fan campaigns', 'fan_campaigns?select=id&limit=1', 'schema-phase3-fan-campaigns.sql'],
  ['fan campaign participants', 'fan_campaign_participants?select=id&limit=1', 'schema-phase3-fan-campaigns.sql'],
  // launch_partner is a server-only column (no client grants), so 42501 = applied.
  ['launch partner flag', 'artist_profiles?select=launch_partner&limit=1', 'schema-phase2-launch-partner.sql'],
  // FRL tables are admin-only RLS: anon resolves the table (zero rows) = applied.
  ['frl engagements', 'frl_engagements?select=id&limit=1', 'schema-phase2-frl-engagements.sql'],
  ['frl work entries', 'frl_work_entries?select=id&limit=1', 'schema-phase2-frl-engagements.sql'],
  ['frl evidence', 'frl_evidence?select=id&limit=1', 'schema-phase2-frl-engagements.sql'],
  // Added 2026-08-12 after the founder's SQL check proved all four applied. These four had gone
  // unprobed for months, which is exactly why TODO and the Brain could disagree about them.
  // Owner-only RLS: anon resolves the table and gets [] once applied.
  ['royalty readiness', 'royalty_readiness?select=id&limit=1', 'schema-phase2-royalty-readiness.sql'],
  // Producer Sessions ships several objects; session_submissions is the one that cannot pre-exist.
  ['producer session submissions', 'session_submissions?select=id&limit=1', 'schema-phase2-producer-sessions.sql'],
  // sub_avatar_override is a NEW artist_profiles column with no client grant, so 42501 is the
  // correct applied signal here (42703 would mean the column is genuinely absent).
  ['sub-avatar override column', 'artist_profiles?select=sub_avatar_override&limit=1', 'schema-phase2-sub-avatar.sql'],
  ['sub-avatar audit table', 'sub_avatar_audit?select=id&limit=1', 'schema-phase2-sub-avatar.sql'],
  // NOT PROBED HERE, deliberately: schema-phase2-earnings-live-tip-type.sql only widens a CHECK
  // constraint (earnings_type_check), and PostgREST cannot see a constraint. Probing
  // `earnings?select=type` would return 200 whether or not the fix ran, i.e. it would certify
  // nothing while looking green. Its live check is the constraint introspection in
  // supabase/check-unverified-feature-state.sql, and EXPECTED_MIGRATION_STATE records that with
  // liveCheck: 'sql-check'.
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
