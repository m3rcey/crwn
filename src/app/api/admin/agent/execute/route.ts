import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

async function verifyAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role === 'admin';
}

interface AgentAction {
  type: string;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  params: Record<string, unknown>;
}

async function logAction(adminId: string, action: AgentAction, result: 'success' | 'failed', resultMessage: string) {
  await supabaseAdmin.from('agent_action_log').insert({
    admin_id: adminId,
    action_type: action.type,
    action_label: action.label,
    action_params: action.params,
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

async function executeUpdatePipelineStages(params: Record<string, unknown>): Promise<string> {
  const { from_stage, to_stage } = params as { from_stage: string; to_stage: string };

  const validStages = ['signed_up', 'onboarding', 'free', 'paid', 'at_risk', 'churned'];

  if (!from_stage || !to_stage) {
    throw new Error('Missing from_stage or to_stage parameter');
  }
  if (!validStages.includes(from_stage) || !validStages.includes(to_stage)) {
    throw new Error(`Invalid stage. Valid stages: ${validStages.join(', ')}`);
  }

  // Count how many artists will be affected
  const { count } = await supabaseAdmin
    .from('artist_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_stage', from_stage);

  if (!count || count === 0) {
    return `No artists found in "${from_stage}" stage — nothing to update`;
  }

  const { error } = await supabaseAdmin
    .from('artist_profiles')
    .update({ pipeline_stage: to_stage })
    .eq('pipeline_stage', from_stage);

  if (error) throw new Error(error.message);

  return `Moved ${count} artist${count === 1 ? '' : 's'} from "${from_stage}" to "${to_stage}"`;
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

async function executeFlagAtRisk(params: Record<string, unknown>): Promise<string> {
  const { from_stage, criteria } = params as { from_stage: string; criteria: string };

  if (!from_stage) {
    throw new Error('Missing from_stage parameter');
  }

  const validStages = ['signed_up', 'onboarding', 'free', 'paid'];
  if (!validStages.includes(from_stage)) {
    throw new Error(`Can only flag artists from stages: ${validStages.join(', ')}`);
  }

  const { count } = await supabaseAdmin
    .from('artist_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_stage', from_stage);

  if (!count || count === 0) {
    return `No artists found in "${from_stage}" stage — nothing to flag`;
  }

  const { error } = await supabaseAdmin
    .from('artist_profiles')
    .update({ pipeline_stage: 'at_risk' })
    .eq('pipeline_stage', from_stage);

  if (error) throw new Error(error.message);

  return `Flagged ${count} artist${count === 1 ? '' : 's'} from "${from_stage}" as at_risk (${criteria || 'agent recommendation'})`;
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
  if (!seq.is_active) throw new Error(`Sequence "${seq.name}" is disabled — enable it first`);

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

  // Deactivate all their partner codes
  const { data: codes } = await supabaseAdmin
    .from('partner_codes')
    .select('id')
    .eq('recruiter_id', recruiter_id)
    .eq('is_active', true);

  if (codes && codes.length > 0) {
    await supabaseAdmin
      .from('partner_codes')
      .update({ is_active: false })
      .eq('recruiter_id', recruiter_id);
  }

  return `Paused recruiter ${recruiter.referral_code} — deactivated ${codes?.length || 0} referral code${(codes?.length || 0) === 1 ? '' : 's'}. Reason: ${reason || 'agent recommendation'}`;
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
    .lte('enrolled_at', cutoff);

  if (!stale?.length) return `No stale enrollments found in sequence (stuck ${stuck_days || 30}+ days at step 0)`;

  const { error } = await supabaseAdmin
    .from('platform_sequence_enrollments')
    .update({ status: 'canceled' })
    .in('id', stale.map(s => s.id));

  if (error) throw new Error(error.message);
  return `Canceled ${stale.length} stale enrollment${stale.length === 1 ? '' : 's'} (stuck at step 0 for ${stuck_days || 30}+ days)`;
}

async function executeSendBriefing(): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const res = await fetch(`${baseUrl}/api/admin/agent/briefing`, {
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
    const { userId, action } = await req.json() as { userId: string; action: AgentAction };

    if (!userId || !action) {
      return NextResponse.json({ error: 'Missing userId or action' }, { status: 400 });
    }

    if (!(await verifyAdmin(userId))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const actionHandlers: Record<string, (params: Record<string, unknown>) => Promise<string>> = {
      toggle_sequence: (p) => executeToggleSequence(p),
      update_pipeline_stages: (p) => executeUpdatePipelineStages(p),
      send_briefing: () => executeSendBriefing(),
      add_pipeline_note: (p) => executeAddPipelineNote(p, userId),
      flag_at_risk: (p) => executeFlagAtRisk(p),
      enroll_in_sequence: (p) => executeEnrollInSequence(p),
      pause_recruiter: (p) => executePauseRecruiter(p),
      approve_application: (p) => executeApproveApplication(p),
      reject_application: (p) => executeRejectApplication(p),
      deactivate_code: (p) => executeDeactivateCode(p),
      cancel_stale_enrollments: (p) => executeCancelStaleEnrollments(p),
    };

    const handler = actionHandlers[action.type];
    if (!handler) {
      return NextResponse.json({ error: `Invalid action type: ${action.type}` }, { status: 400 });
    }

    let message: string;

    try {
      message = await handler(action.params);

      await logAction(userId, action, 'success', message);
      return NextResponse.json({ success: true, message });
    } catch (execError: unknown) {
      const errMsg = execError instanceof Error ? execError.message : 'Execution failed';
      await logAction(userId, action, 'failed', errMsg);
      return NextResponse.json({ success: false, message: errMsg }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('Agent execute error:', error);
    return NextResponse.json({ error: 'Execution failed' }, { status: 500 });
  }
}
