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
  // Post-signup lifecycle send ledger. Admin-only RLS like the FRL tables below, so anon resolves
  // the table and gets [] once applied; 42P01/PGRST205 means the founder has not run it yet and
  // the lifecycle sequences are still sending unrecorded.
  ['platform sequence sends', 'platform_sequence_sends?select=id&limit=1', 'schema-phase2-platform-sequence-sends.sql'],
  // launch_partner is a server-only column (no client grants), so 42501 = applied.
  ['launch partner flag', 'artist_profiles?select=launch_partner&limit=1', 'schema-phase2-launch-partner.sql'],
  // Distribution Finder tables are admin-only with ALL revoked from anon, so 42501
  // (reads revoked, expected) is the applied signal; 42P01/PGRST205 means not run and the
  // finder still searches live but caches nothing.
  ['distribution pages', 'distribution_pages?select=id&limit=1', 'schema-phase3-distribution-finder.sql'],
  ['distribution mentions', 'distribution_mentions?select=id&limit=1', 'schema-phase3-distribution-finder.sql'],
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
  // Song Lab (GB experiment). The projects table has a public SELECT policy, so anon
  // resolves it and gets [] once applied; 42P01/PGRST205 means not run. The gate column is
  // server-only (no client grant) so 42501 is its applied signal, exactly like launch_partner.
  ['song lab projects', 'song_lab_projects?select=id&limit=1', 'schema-phase2-song-lab.sql'],
  ['song lab gate column', 'artist_profiles?select=song_lab_enabled&limit=1', 'schema-phase2-song-lab.sql'],
  // Live shows. song_lab_projects is publicly readable, so naming the new column resolves
  // 200 once applied and 42703 while pending. The claims column cannot be probed with the
  // anon key at all (that table is service-role only, correctly), so this one line is the
  // signal for both columns in the file.
  ['song lab show timezone', 'song_lab_projects?select=show_timezone&limit=1', 'schema-phase2-song-lab-live-shows.sql'],
  // Public votes are service-role only, so anon must NOT be able to read them: 42501 is the
  // APPLIED signal here (the table exists but is correctly ungranted), exactly like the
  // song_lab_votes probe. 42P01/PGRST205 means the migration has not run.
  ['song lab public votes', 'song_lab_public_votes?select=id&limit=1', 'schema-phase2-song-lab-public-votes.sql'],
  // Fan Testimonials V1. The PUBLIC VIEW is the probe target, not the base tables: the view is
  // granted to anon (the artist page reads it), so 200 with [] means applied. The two base tables
  // are deliberately CLOSED to anon and answer 42501, which this generic loop would file as
  // "exists, reads revoked" and therefore also read as applied. Both signals are correct here,
  // and the view is the one that also proves the SELECT list and the publication predicate landed.
  ['fan testimonials public view', 'fan_testimonials_public?select=id&limit=1', 'schema-phase2-fan-testimonials.sql'],
  ['fan testimonial requests (closed to anon)', 'fan_testimonial_requests?select=id&limit=1', 'schema-phase2-fan-testimonials.sql'],
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

// ---------------------------------------------------------------------------
// SECURITY MIGRATIONS (cybersecurity audit 2026-08-12).
// ---------------------------------------------------------------------------
// These need the OPPOSITE contract to the probes above. A normal migration is
// proved applied by data becoming READABLE; a security migration is proved
// applied by access becoming DENIED. So here 42501 is the PASS, and anything
// else is a failure, including a 200.
//
// The distinction that makes this worth a separate loop: an anon-executable
// volatile RPC answers 25006 ("cannot execute DELETE in a read-only transaction")
// over GET, because PostgREST runs GET in a READ ONLY transaction. 25006 means the
// privilege check PASSED and the function is still reachable. The generic loop
// above would file that under "unclear" and not count it, which is exactly how a
// still-open hole would look green.
//
// Every probe below is non-destructive. The GETs cannot commit a write, and the
// two POSTs carry a deliberately non-existent uuid, so even if a revoke were
// missing the statement fails on the foreign key without writing a row.
const RANDOM_UUID = '11111111-2222-3333-4444-555555555555';
const SECURITY_PROBES = [
  ['SEC-002 check_rate_limit locked', 'GET',
    `rpc/check_rate_limit?p_user_id=${RANDOM_UUID}&p_action=probe&p_window_seconds=60&p_max_requests=5`,
    null, 'schema-phase2-sec-002-rpc-execute-lockdown.sql'],
  ['SEC-011 redeem_invite locked', 'GET',
    `rpc/redeem_invite?p_code=__probe__&p_user=${RANDOM_UUID}`,
    null, 'schema-phase2-sec-002-rpc-execute-lockdown.sql'],
  ['V11 user_passes_artist_gate locked', 'GET',
    `rpc/user_passes_artist_gate?p_user=${RANDOM_UUID}`,
    null, 'schema-phase2-sec-002-rpc-execute-lockdown.sql'],
  ['SEC-004 notifications INSERT denied', 'POST', 'notifications',
    { user_id: RANDOM_UUID, type: 'probe', title: 'probe', message: 'probe' },
    'schema-phase2-sec-004-007-rls-notifications-tier-benefits.sql'],
  ['SEC-007 tier_benefits write denied', 'POST', 'tier_benefits',
    { tier_id: RANDOM_UUID, benefit_type: 'probe' },
    'schema-phase2-sec-004-007-rls-notifications-tier-benefits.sql'],
  ['SEC-012 referrals grants revoked', 'GET', 'referrals?select=*&limit=1', null,
    'schema-phase2-sec-012-money-table-rls-reproducibility.sql'],
  ['SEC-012 crm_contacts grants revoked', 'GET', 'crm_contacts?select=*&limit=1', null,
    'schema-phase2-sec-012-money-table-rls-reproducibility.sql'],
  // earnings and recruiters were held back from the migration above because both are
  // read by the browser, so a bare RLS enable with no policy would have broken an
  // artist reading their OWN earnings. Until this one runs they answer 200 [] to anon
  // (RLS is on in the live database but the anon GRANT is still there), which is why
  // "not a live leak, but not reproducible either" is the honest description: rebuild
  // the database from the repo and they come up open.
  ['SEC-EARN earnings grants revoked', 'GET', 'earnings?select=*&limit=1', null,
    'schema-phase2-sec-earnings-recruiters-select-policies.sql'],
  ['SEC-EARN recruiters grants revoked', 'GET', 'recruiters?select=*&limit=1', null,
    'schema-phase2-sec-earnings-recruiters-select-policies.sql'],
];

console.log('\nSecurity migrations (42501 = denied = PASS):\n');
let insecure = 0;
for (const [label, method, path, body, file] of SECURITY_PROBES) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let verdict;
  if (text.includes('42501') || /permission denied/i.test(text)) {
    verdict = 'DENIED (closed)';
  } else if (text.includes('25006')) {
    verdict = `STILL EXECUTABLE -> run supabase/${file}`;
    insecure += 1;
  } else {
    verdict = `NOT DENIED (${res.status}) -> run supabase/${file}`;
    insecure += 1;
  }
  console.log(`${label.padEnd(38)} ${verdict}`);
}

if (insecure > 0) {
  console.log(`\n${insecure} SECURITY probe(s) FAILED. A finding from the cybersecurity audit is open in production.`);
  process.exitCode = 1;
} else {
  console.log('\nAll security probes denied as expected.');
}
