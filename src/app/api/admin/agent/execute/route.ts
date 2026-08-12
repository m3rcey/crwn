// The admin agent's EXECUTION boundary.
//
// SEC-010 (cybersecurity audit 2026-08-12): the model that proposes these actions reads public,
// attacker-writable text (lead names, slugs, cancellation reasons), so every value arriving here is
// treated as hostile even though the caller is an authenticated admin. Three things must happen
// before any mutation, in this order, and none of them may be skipped:
//
//   1. requireAdmin      identity, re-derived from the session cookie at execution time
//   2. validateActionParams   shape, allowlisted values, bounds, no unknown keys
//   3. verifyActionSignature  these exact params are the ones the server proposed to THIS admin
//
// Only the normalized params returned by step 2 reach a handler. The raw client object is never
// passed to a query, never logged as truth, and never used to build the lock key.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildLockKey, acquireLock, releaseLock } from '@/lib/ai/coordinationLock';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { PUBLIC_ORIGIN } from '@/lib/publicOrigin';
import {
  validateActionParams,
  MAX_PIPELINE_STAGE_MOVE,
  MAX_FLAG_AT_RISK,
  MAX_STALE_ENROLLMENT_CANCEL,
  type ValidatedParams,
} from '@/lib/ai/adminAgentActions';
import { verifyActionSignature } from '@/lib/ai/adminAgentSignature';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

interface AgentAction {
  type: string;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  params: Record<string, unknown>;
  /** Issued by /api/admin/agent/analyze over the validated params. Required; see adminAgentSignature.ts. */
  signature?: string;
}

/**
 * The audit log records the VALIDATED params, not the client's object. Logging the raw payload
 * would leave a record of something that never ran, which is exactly the wrong artifact to hold
 * after an injection attempt.
 */
async function logAction(
  adminId: string,
  action: AgentAction,
  params: ValidatedParams,
  result: 'success' | 'failed',
  resultMessage: string,
) {
  await supabaseAdmin.from('agent_action_log').insert({
    admin_id: adminId,
    action_type: action.type,
    action_label: action.label,
    action_params: params,
    result,
    result_message: resultMessage,
  });
}

async function executeToggleSequence(params: Record<string, unknown>): Promise<string> {
  const { sequence_trigger, enable } = params as { sequence_trigger: string; enable: boolean };

  if (!sequence_trigger || typeof enable !== 'boolean') {
    throw new Error('Missing sequence_trigger or enable parameter');
  }

  const { data: seq } = await supabaseAdmin
    .from('platform_sequences')
    .select('id, name, is_active')
    .eq('trigger', sequence_trigger)
    .single();

  if (!seq) {
    throw new Error(`Sequence with trigger "${sequence_trigger}" not found`);
  }

  if (seq.is_active === enable) {
    return `Sequence "${seq.name}" is already ${enable ? 'enabled' : 'disabled'}`;
  }

  const { error } = await supabaseAdmin
    .from('platform_sequences')
    .update({ is_active: enable, updated_at: new Date().toISOString() })
    .eq('id', seq.id);

  if (error) throw new Error(error.message);

  return `Sequence "${seq.name}" ${enable ? 'enabled' : 'disabled'} successfully`;
}

/**
 * BOUNDED bulk stage move. Stages are already enum-checked by `validateActionParams`; what this
 * adds is blast radius.
 *
 * Before SEC-010 this ran `update(...).eq('pipeline_stage', from_stage)`, which is "every artist on
 * the platform in that stage" with no ceiling. Now the matching rows are SELECTED first, refused
 * outright above the cap, and the update names those exact ids. The mutation can no longer be
 * larger than the set that was counted, and a single approval can never exceed the cap that the
 * approval card told the admin about.
 */
async function executeUpdatePipelineStages(params: Record<string, unknown>): Promise<string> {
  const { from_stage, to_stage } = params as { from_stage: string; to_stage: string };

  const { data: matches, error: readError } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('pipeline_stage', from_stage)
    .limit(MAX_PIPELINE_STAGE_MOVE + 1);

  if (readError) throw new Error(readError.message);

  const rows = matches || [];
  if (rows.length === 0) {
    return `No artists found in "${from_stage}" stage. Nothing to update`;
  }
  if (rows.length > MAX_PIPELINE_STAGE_MOVE) {
    throw new Error(
      `Refused: more than ${MAX_PIPELINE_STAGE_MOVE} artists are in "${from_stage}". One approval may not rewrite that many rows. Move them in smaller, deliberate batches.`
    );
  }

  const ids = rows.map(r => r.id);
  const { error } = await supabaseAdmin
    .from('artist_profiles')
    .update({ pipeline_stage: to_stage })
    .in('id', ids);

  if (error) throw new Error(error.message);

  return `Moved ${ids.length} artist${ids.length === 1 ? '' : 's'} from "${from_stage}" to "${to_stage}"`;
}

async function executeAddPipelineNote(params: Record<string, unknown>, adminId: string): Promise<string> {
  const { artist_ids, note } = params as { artist_ids: string[]; note: string };

  if (!artist_ids?.length || !note?.trim()) {
    throw new Error('Missing artist_ids or note');
  }

  if (artist_ids.length > 20) {
    throw new Error('Cannot add notes to more than 20 artists at once');
  }

  const records = artist_ids.map(id => ({
    artist_id: id,
    admin_id: adminId,
    body: `[Agent] ${note.trim()}`,
  }));

  const { error } = await supabaseAdmin
    .from('artist_notes')
    .insert(records);

  if (error) throw new Error(error.message);

  return `Added note to ${artist_ids.length} artist${artist_ids.length === 1 ? '' : 's'}`;
}

/** BOUNDED. Same defect and same fix as executeUpdatePipelineStages: select, cap, update by id. */
async function executeFlagAtRisk(params: Record<string, unknown>): Promise<string> {
  const { from_stage, criteria } = params as { from_stage: string; criteria?: string };

  const { data: matches, error: readError } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('pipeline_stage', from_stage)
    .limit(MAX_FLAG_AT_RISK + 1);

  if (readError) throw new Error(readError.message);

  const rows = matches || [];
  if (rows.length === 0) {
    return `No artists found in "${from_stage}" stage. Nothing to flag`;
  }
  if (rows.length > MAX_FLAG_AT_RISK) {
    throw new Error(
      `Refused: more than ${MAX_FLAG_AT_RISK} artists are in "${from_stage}". One approval may not flag that many rows. Narrow it down first.`
    );
  }

  const ids = rows.map(r => r.id);
  const { error } = await supabaseAdmin
    .from('artist_profiles')
    .update({ pipeline_stage: 'at_risk' })
    .in('id', ids);

  if (error) throw new Error(error.message);

  return `Flagged ${ids.length} artist${ids.length === 1 ? '' : 's'} from "${from_stage}" as at_risk (${criteria || 'agent recommendation'})`;
}

async function executeEnrollInSequence(params: Record<string, unknown>): Promise<string> {
  const { sequence_trigger, artist_ids } = params as { sequence_trigger: string; artist_ids: string[] };

  if (!sequence_trigger || !artist_ids?.length) {
    throw new Error('Missing sequence_trigger or artist_ids');
  }

  if (artist_ids.length > 20) {
    throw new Error('Cannot enroll more than 20 artists at once');
  }

  // Find the sequence
  const { data: seq } = await supabaseAdmin
    .from('platform_sequences')
    .select('id, name, is_active')
    .eq('trigger', sequence_trigger)
    .single();

  if (!seq) throw new Error(`Sequence "${sequence_trigger}" not found`);
  if (!seq.is_active) throw new Error(`Sequence "${seq.name}" is disabled. Enable it first`);

  // Get user_ids for the artist_ids
  const { data: artists } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id')
    .in('id', artist_ids);

  if (!artists?.length) throw new Error('No matching artists found');

  // Check for existing active enrollments
  const userIds = artists.map(a => a.user_id);
  const { data: existing } = await supabaseAdmin
    .from('platform_sequence_enrollments')
    .select('artist_user_id')
    .eq('sequence_id', seq.id)
    .eq('status', 'active')
    .in('artist_user_id', userIds);

  const alreadyEnrolled = new Set((existing || []).map((e: any) => e.artist_user_id));
  const toEnroll = artists.filter(a => !alreadyEnrolled.has(a.user_id));

  if (toEnroll.length === 0) {
    return `All ${artist_ids.length} artists are already enrolled in "${seq.name}"`;
  }

  const records = toEnroll.map(a => ({
    sequence_id: seq.id,
    artist_user_id: a.user_id,
    status: 'active',
    current_step: 0,
    enrolled_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('platform_sequence_enrollments')
    .insert(records);

  if (error) throw new Error(error.message);

  return `Enrolled ${toEnroll.length} artist${toEnroll.length === 1 ? '' : 's'} in "${seq.name}"${alreadyEnrolled.size > 0 ? ` (${alreadyEnrolled.size} already enrolled)` : ''}`;
}

async function executePauseRecruiter(params: Record<string, unknown>): Promise<string> {
  const { recruiter_id, reason } = params as { recruiter_id: string; reason: string };

  if (!recruiter_id) throw new Error('Missing recruiter_id');

  // Get recruiter info
  const { data: recruiter } = await supabaseAdmin
    .from('recruiters')
    .select('id, referral_code, is_partner')
    .eq('id', recruiter_id)
    .single();

  if (!recruiter) throw new Error(`Recruiter "${recruiter_id}" not found`);

  // Deactivate their ACTIVE partner codes, by id.
  // The update used to re-select on `recruiter_id`, so it could touch rows the count above never
  // saw (including codes already inactive). Mutating exactly the rows that were counted is what
  // makes the reported number honest.
  const { data: codes } = await supabaseAdmin
    .from('partner_codes')
    .select('id')
    .eq('recruiter_id', recruiter_id)
    .eq('is_active', true);

  const codeIds = (codes || []).map(c => c.id);
  if (codeIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('partner_codes')
      .update({ is_active: false })
      .in('id', codeIds);
    if (error) throw new Error(error.message);
  }

  return `Paused recruiter ${recruiter.referral_code}, deactivated ${codeIds.length} referral code${codeIds.length === 1 ? '' : 's'}. Reason: ${reason || 'agent recommendation'}`;
}

async function executeApproveApplication(params: Record<string, unknown>): Promise<string> {
  const { application_id } = params as { application_id: string };
  if (!application_id) throw new Error('Missing application_id');

  const { data: app } = await supabaseAdmin
    .from('partner_applications')
    .select('id, full_name, status')
    .eq('id', application_id)
    .single();

  if (!app) throw new Error(`Application "${application_id}" not found`);
  if (app.status !== 'pending') return `Application from "${app.full_name}" is already ${app.status}`;

  const { error } = await supabaseAdmin
    .from('partner_applications')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), notes: 'Approved by agent recommendation' })
    .eq('id', application_id);

  if (error) throw new Error(error.message);
  return `Approved partner application from "${app.full_name}"`;
}

async function executeRejectApplication(params: Record<string, unknown>): Promise<string> {
  const { application_id, reason } = params as { application_id: string; reason: string };
  if (!application_id) throw new Error('Missing application_id');

  const { data: app } = await supabaseAdmin
    .from('partner_applications')
    .select('id, full_name, status')
    .eq('id', application_id)
    .single();

  if (!app) throw new Error(`Application "${application_id}" not found`);
  if (app.status !== 'pending') return `Application from "${app.full_name}" is already ${app.status}`;

  const { error } = await supabaseAdmin
    .from('partner_applications')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), notes: reason || 'Rejected by agent recommendation' })
    .eq('id', application_id);

  if (error) throw new Error(error.message);
  return `Rejected partner application from "${app.full_name}". Reason: ${reason || 'agent recommendation'}`;
}

async function executeDeactivateCode(params: Record<string, unknown>): Promise<string> {
  const { code_id, reason } = params as { code_id: string; reason: string };
  if (!code_id) throw new Error('Missing code_id');

  const { data: code } = await supabaseAdmin
    .from('partner_codes')
    .select('id, code, is_active')
    .eq('id', code_id)
    .single();

  if (!code) throw new Error(`Code "${code_id}" not found`);
  if (!code.is_active) return `Code "${code.code}" is already inactive`;

  const { error } = await supabaseAdmin
    .from('partner_codes')
    .update({ is_active: false })
    .eq('id', code_id);

  if (error) throw new Error(error.message);
  return `Deactivated code "${code.code}". Reason: ${reason || 'agent recommendation'}`;
}

async function executeCancelStaleEnrollments(params: Record<string, unknown>): Promise<string> {
  const { sequence_id, stuck_days } = params as { sequence_id: string; stuck_days: number };
  if (!sequence_id) throw new Error('Missing sequence_id');

  const cutoff = new Date(Date.now() - (stuck_days || 30) * 86400000).toISOString();

  const { data: stale } = await supabaseAdmin
    .from('platform_sequence_enrollments')
    .select('id')
    .eq('sequence_id', sequence_id)
    .eq('status', 'active')
    .eq('current_step', 0)
    .lte('enrolled_at', cutoff)
    .limit(MAX_STALE_ENROLLMENT_CANCEL + 1);

  if (!stale?.length) return `No stale enrollments found in sequence (stuck ${stuck_days || 30}+ days at step 0)`;
  if (stale.length > MAX_STALE_ENROLLMENT_CANCEL) {
    throw new Error(
      `Refused: more than ${MAX_STALE_ENROLLMENT_CANCEL} enrollments match. One approval may not cancel that many. Raise stuck_days to narrow it.`
    );
  }

  const { error } = await supabaseAdmin
    .from('platform_sequence_enrollments')
    .update({ status: 'canceled' })
    .in('id', stale.map(s => s.id));

  if (error) throw new Error(error.message);
  return `Canceled ${stale.length} stale enrollment${stale.length === 1 ? '' : 's'} (stuck at step 0 for ${stuck_days || 30}+ days)`;
}

async function executeBulkUpdateStatus(params: Record<string, unknown>): Promise<string> {
  const { contact_ids, status } = params as { contact_ids: string[]; status: string };

  if (!contact_ids?.length || !status) {
    throw new Error('Missing contact_ids or status');
  }

  const validStatuses = ['lead', 'contacted', 'onboarding', 'active', 'churned'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Valid: ${validStatuses.join(', ')}`);
  }

  if (contact_ids.length > 50) {
    throw new Error('Cannot update more than 50 contacts at once');
  }

  const { error } = await supabaseAdmin
    .from('crm_contacts')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', contact_ids);

  if (error) throw new Error(error.message);

  return `Updated ${contact_ids.length} contact${contact_ids.length === 1 ? '' : 's'} to "${status}"`;
}

async function executeAddCrmNote(params: Record<string, unknown>): Promise<string> {
  const { contact_ids, note } = params as { contact_ids: string[]; note: string };

  if (!contact_ids?.length || !note?.trim()) {
    throw new Error('Missing contact_ids or note');
  }

  if (contact_ids.length > 50) {
    throw new Error('Cannot add notes to more than 50 contacts at once');
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const noteText = `[${timestamp}] [Agent] ${note.trim()}`;

  // Get existing notes
  const { data: contacts } = await supabaseAdmin
    .from('crm_contacts')
    .select('id, notes')
    .in('id', contact_ids);

  if (!contacts?.length) throw new Error('No matching contacts found');

  // Update each contact
  for (const c of contacts) {
    const updatedNotes = `${noteText}\n${c.notes || ''}`;
    await supabaseAdmin
      .from('crm_contacts')
      .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
      .eq('id', c.id);
  }

  return `Added note to ${contacts.length} contact${contacts.length === 1 ? '' : 's'}`;
}

async function executeAddCrmTags(params: Record<string, unknown>): Promise<string> {
  const { contact_ids, tags } = params as { contact_ids: string[]; tags: string[] };

  if (!contact_ids?.length || !tags?.length) {
    throw new Error('Missing contact_ids or tags');
  }

  if (contact_ids.length > 50) {
    throw new Error('Cannot tag more than 50 contacts at once');
  }

  const { data: contacts } = await supabaseAdmin
    .from('crm_contacts')
    .select('id, tags')
    .in('id', contact_ids);

  if (!contacts?.length) throw new Error('No matching contacts found');

  for (const c of contacts) {
    const existingTags = (c.tags || []) as string[];
    const merged = [...new Set([...existingTags, ...tags])];
    await supabaseAdmin
      .from('crm_contacts')
      .update({ tags: merged, updated_at: new Date().toISOString() })
      .eq('id', c.id);
  }

  return `Added tags [${tags.join(', ')}] to ${contacts.length} contact${contacts.length === 1 ? '' : 's'}`;
}

async function executeSendBriefing(): Promise<string> {
  const res = await fetch(`${PUBLIC_ORIGIN}/api/admin/agent/briefing`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(data.error || `Briefing failed (${res.status})`);
  }

  return 'Admin briefing email sent successfully';
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { action } = await req.json() as { action: AgentAction };

    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    // STEP 2 of the boundary: shape, allowlisted values, bounds, no unknown keys.
    // `validated.params` is a fresh object rebuilt from checked values, so anything the model (or a
    // tampered client) added that the schema does not name cannot reach a query.
    const validated = validateActionParams(action.type, action.params);
    if (!validated.ok) {
      return NextResponse.json({ success: false, message: `Refused: ${validated.error}` }, { status: 400 });
    }
    const params = validated.params;

    // STEP 3: the params about to run must be the params the server proposed to THIS admin, within
    // the last hour. Fails closed: no signature, wrong admin, edited value, or expired all refuse.
    const signatureCheck = verifyActionSignature(action.signature, admin.id, validated.type, params);
    if (!signatureCheck.ok) {
      await logAction(admin.id, action, params, 'failed', signatureCheck.error);
      return NextResponse.json({ success: false, message: `Refused: ${signatureCheck.error}` }, { status: 400 });
    }

    const actionHandlers: Record<string, (params: Record<string, unknown>) => Promise<string>> = {
      toggle_sequence: (p) => executeToggleSequence(p),
      update_pipeline_stages: (p) => executeUpdatePipelineStages(p),
      send_briefing: () => executeSendBriefing(),
      add_pipeline_note: (p) => executeAddPipelineNote(p, admin.id),
      flag_at_risk: (p) => executeFlagAtRisk(p),
      enroll_in_sequence: (p) => executeEnrollInSequence(p),
      pause_recruiter: (p) => executePauseRecruiter(p),
      approve_application: (p) => executeApproveApplication(p),
      reject_application: (p) => executeRejectApplication(p),
      deactivate_code: (p) => executeDeactivateCode(p),
      cancel_stale_enrollments: (p) => executeCancelStaleEnrollments(p),
      bulk_update_status: (p) => executeBulkUpdateStatus(p),
      add_crm_note: (p) => executeAddCrmNote(p),
      add_crm_tags: (p) => executeAddCrmTags(p),
    };

    const handler = actionHandlers[validated.type];
    if (!handler) {
      return NextResponse.json({ error: `Invalid action type: ${validated.type}` }, { status: 400 });
    }

    // Acquire coordination lock. Keyed off the VALIDATED params so the lock names the same
    // resource the mutation will touch.
    const lockKey = buildLockKey(validated.type, 'platform', params);
    const lock = await acquireLock(supabaseAdmin, 'platform', 'admin_agent', null, validated.type, lockKey);

    if (!lock.acquired) {
      const msg = `Action blocked: another agent is already running: ${lock.conflict}`;
      await logAction(admin.id, action, params, 'failed', msg);
      return NextResponse.json({ success: false, message: msg }, { status: 409 });
    }

    let message: string;

    try {
      message = await handler(params);

      await releaseLock(supabaseAdmin, lock.lockId!, 'completed');
      await logAction(admin.id, action, params, 'success', message);
      return NextResponse.json({ success: true, message });
    } catch (execError: unknown) {
      const errMsg = execError instanceof Error ? execError.message : 'Execution failed';
      await releaseLock(supabaseAdmin, lock.lockId!, 'failed');
      await logAction(admin.id, action, params, 'failed', errMsg);
      return NextResponse.json({ success: false, message: errMsg }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('Agent execute error:', error);
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 });
  }
}
