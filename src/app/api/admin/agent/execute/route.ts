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
  type: 'toggle_sequence' | 'update_pipeline_stages' | 'send_briefing';
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

    const validTypes = ['toggle_sequence', 'update_pipeline_stages', 'send_briefing'];
    if (!validTypes.includes(action.type)) {
      return NextResponse.json({ error: `Invalid action type: ${action.type}` }, { status: 400 });
    }

    let message: string;

    try {
      switch (action.type) {
        case 'toggle_sequence':
          message = await executeToggleSequence(action.params);
          break;
        case 'update_pipeline_stages':
          message = await executeUpdatePipelineStages(action.params);
          break;
        case 'send_briefing':
          message = await executeSendBriefing();
          break;
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }

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
