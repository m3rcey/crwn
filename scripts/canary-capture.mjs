// Read/write canary for the lead-capture -> nurture-enrollment path.
//
// Exercises the REAL tables with the REAL enroller semantics, then deletes everything it created.
// It does NOT hit the HTTP routes (that would send a live email to a fake address through Resend);
// it reproduces the exact row shapes the routes write, which is what proves the DB side works.
//
// Run: bash -c 'source ./load-env.sh; node scripts/canary-capture.mjs'

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing Supabase env'); process.exit(1); }
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const stamp = Date.now();
const EMAIL = `__canary_capture_${stamp}@example.invalid`;
const created = { leads: [], results: [], enrollments: [] };
let failures = 0;

const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

async function cleanup() {
  for (const id of created.enrollments) await db.from('prospect_nurture_enrollments').delete().eq('id', id);
  for (const id of created.results) await db.from('lead_magnet_results').delete().eq('id', id);
  for (const id of created.leads) await db.from('lead_magnet_leads').delete().eq('id', id);
  // Belt and braces: nothing matching the canary address may survive.
  await db.from('prospect_nurture_enrollments').delete().eq('email', EMAIL);
  await db.from('lead_magnet_leads').delete().eq('email', EMAIL);
}

try {
  // 1. lead row, as the capture route writes it
  const { data: lead, error: leadErr } = await db.from('lead_magnet_leads').insert({
    email: EMAIL, artist_name: 'Canary', tool_slug: 'worth',
    email_consent: true, sms_consent: false,
    consent_text_version: 'canary', consented_at: new Date().toISOString(),
  }).select('id').single();
  ok('lead row inserts', !!lead?.id, leadErr?.message || '');
  if (lead?.id) created.leads.push(lead.id);

  // 2. result row bound to that lead, in the shape the nurture tokens read
  const token = crypto.randomBytes(24).toString('base64url');
  const { data: res, error: resErr } = await db.from('lead_magnet_results').insert({
    tool_slug: 'worth', lead_id: lead?.id, status: 'completed', source: 'public',
    title: 'Canary', input_data: { monthly_listeners: 100000 },
    result_data: { heroValue: '$1,240', estimatedMonthlyCents: 124000, estimatedAnnualCents: 1488000 },
    public_token: token,
    public_token_expires_at: new Date(Date.now() + 86400_000).toISOString(),
  }).select('id, lead_id').single();
  ok('result row inserts and links to the lead', !!res?.id && res.lead_id === lead?.id, resErr?.message || '');
  if (res?.id) created.results.push(res.id);

  // 3. enrollment, as enrollProspect writes it
  const { data: enr, error: enrErr } = await db.from('prospect_nurture_enrollments').insert({
    lead_id: lead?.id, email: EMAIL, tool_slug: 'worth', result_id: res?.id,
    sequence_version: 3, phase: 'diagnose', current_step: 0, status: 'active',
    next_send_at: new Date(Date.now() + 86400_000).toISOString(),
    unsub_token: crypto.randomBytes(24).toString('base64url'),
  }).select('id').single();
  ok('enrollment inserts on sequence_version 3', !!enr?.id, enrErr?.message || '');
  if (enr?.id) created.enrollments.push(enr.id);

  // 4. the dedup guarantee: a second ACTIVE enrollment for the same email must be refused
  const { error: dupErr } = await db.from('prospect_nurture_enrollments').insert({
    lead_id: lead?.id, email: EMAIL, tool_slug: 'vault-revenue-planner', result_id: res?.id,
    sequence_version: 3, phase: 'diagnose', current_step: 0, status: 'active',
    next_send_at: new Date().toISOString(), unsub_token: crypto.randomBytes(24).toString('base64url'),
  }).select('id').single();
  ok('duplicate active enrollment is refused by the partial unique index', !!dupErr, dupErr?.code || 'NO ERROR RAISED');

  // 5. the send ledger's idempotency key
  if (enr?.id) {
    const a = await db.from('prospect_nurture_sends').insert({
      enrollment_id: enr.id, email_id: 'v3.a.what-it-means', sequence_version: 3, status: 'sent',
    }).select('id').single();
    const b = await db.from('prospect_nurture_sends').insert({
      enrollment_id: enr.id, email_id: 'v3.a.what-it-means', sequence_version: 3, status: 'sent',
    }).select('id').single();
    ok('first send claims its slot', !!a.data?.id, a.error?.message || '');
    ok('duplicate send of the same email id is refused', !!b.error, b.error?.code || 'NO ERROR RAISED');
    if (a.data?.id) await db.from('prospect_nurture_sends').delete().eq('id', a.data.id);
  }

  // 6. exit-on-account: cancelling by email is what exitProspectNurtureForUser does
  const { data: cancelled } = await db.from('prospect_nurture_enrollments')
    .update({ status: 'canceled', exit_reason: 'account_created', next_send_at: null })
    .eq('email', EMAIL).eq('status', 'active').select('id');
  ok('exit-on-signup cancels the active enrollment', (cancelled || []).length === 1);
} catch (e) {
  ok('canary ran without throwing', false, e.message);
} finally {
  await cleanup();
  const { data: leftLeads } = await db.from('lead_magnet_leads').select('id').eq('email', EMAIL);
  const { data: leftEnr } = await db.from('prospect_nurture_enrollments').select('id').eq('email', EMAIL);
  const { data: leftRes } = await db.from('lead_magnet_results').select('id').in('id', created.results);
  ok('cleanup left nothing behind', (leftLeads || []).length === 0 && (leftEnr || []).length === 0 && (leftRes || []).length === 0);
}

console.log(failures === 0 ? '\nALL CANARY CHECKS PASSED' : `\n${failures} CANARY CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
