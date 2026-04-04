import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { snapshotArtistMetrics } from '@/lib/ai/snapshotMetrics';
import { buildLockKey, acquireLock, releaseLock } from '@/lib/ai/coordinationLock';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export interface ArtistAgentAction {
  type: string;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  params: Record<string, unknown>;
}

// ─── Action Handlers ──────────────────────────────────────────────────────────

async function executeToggleSequence(artistId: string, params: Record<string, unknown>): Promise<string> {
  const { sequence_id, enable } = params as { sequence_id: string; enable: boolean };
  if (!sequence_id) throw new Error('Missing sequence_id');

  const { data: seq } = await supabaseAdmin
    .from('sequences')
    .select('id, name, is_active')
    .eq('id', sequence_id)
    .eq('artist_id', artistId)
    .single();

  if (!seq) throw new Error('Sequence not found');
  if (seq.is_active === enable) return `"${seq.name}" is already ${enable ? 'active' : 'paused'}`;

  await supabaseAdmin
    .from('sequences')
    .update({ is_active: enable, updated_at: new Date().toISOString() })
    .eq('id', sequence_id);

  return `${enable ? 'Activated' : 'Paused'} sequence "${seq.name}"`;
}

async function executeCreateDiscountCode(artistId: string, params: Record<string, unknown>): Promise<string> {
  const { code, discount_type, discount_value, max_uses, expires_in_days } = params as {
    code: string;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    max_uses?: number;
    expires_in_days?: number;
  };

  if (!code || !discount_value) throw new Error('Missing code or discount_value');

  const expiresAt = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
    : null;

  const { error } = await supabaseAdmin.from('discount_codes').insert({
    artist_id: artistId,
    code: code.toUpperCase(),
    discount_type: discount_type || 'percent',
    discount_value: discount_value,
    max_uses: max_uses || null,
    expires_at: expiresAt,
    is_active: true,
  });

  if (error) throw new Error(error.message);
  return `Created discount code "${code.toUpperCase()}" (${discount_value}${discount_type === 'percent' ? '%' : '¢'} off)`;
}

async function executeGateTrack(artistId: string, params: Record<string, unknown>): Promise<string> {
  const { track_id, tier_ids } = params as { track_id: string; tier_ids: string[] };
  if (!track_id || !tier_ids?.length) throw new Error('Missing track_id or tier_ids');

  const { data: track } = await supabaseAdmin
    .from('tracks')
    .select('id, title')
    .eq('id', track_id)
    .eq('artist_id', artistId)
    .single();

  if (!track) throw new Error('Track not found');

  await supabaseAdmin
    .from('tracks')
    .update({ is_free: false, allowed_tier_ids: tier_ids })
    .eq('id', track_id);

  return `Gated "${track.title}" behind ${tier_ids.length} tier(s)`;
}

async function executeUngateTrack(artistId: string, params: Record<string, unknown>): Promise<string> {
  const { track_id } = params as { track_id: string };
  if (!track_id) throw new Error('Missing track_id');

  const { data: track } = await supabaseAdmin
    .from('tracks')
    .select('id, title')
    .eq('id', track_id)
    .eq('artist_id', artistId)
    .single();

  if (!track) throw new Error('Track not found');

  await supabaseAdmin
    .from('tracks')
    .update({ is_free: true, allowed_tier_ids: [] })
    .eq('id', track_id);

  return `Made "${track.title}" free for all listeners`;
}

async function executeScheduleCampaign(artistId: string, params: Record<string, unknown>): Promise<string> {
  const { name, subject, body, scheduled_in_hours } = params as {
    name: string;
    subject: string;
    body: string;
    scheduled_in_hours?: number;
  };

  if (!name || !subject || !body) throw new Error('Missing name, subject, or body');

  const scheduledAt = scheduled_in_hours
    ? new Date(Date.now() + scheduled_in_hours * 3600000).toISOString()
    : null;

  const { error } = await supabaseAdmin.from('campaigns').insert({
    artist_id: artistId,
    name,
    subject,
    body,
    status: 'draft',
    scheduled_at: scheduledAt,
  });

  if (error) throw new Error(error.message);
  return `Created campaign draft "${name}"${scheduledAt ? ` (scheduled)` : ''}`;
}

async function executeCreateCommunityPost(artistId: string, params: Record<string, unknown>): Promise<string> {
  const { content, tier_ids } = params as { content: string; tier_ids?: string[] };
  if (!content) throw new Error('Missing content');

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('user_id')
    .eq('id', artistId)
    .single();

  if (!artist) throw new Error('Artist not found');

  const { error } = await supabaseAdmin.from('community_posts').insert({
    artist_id: artistId,
    user_id: artist.user_id,
    content,
    allowed_tier_ids: tier_ids || [],
    is_active: true,
  });

  if (error) throw new Error(error.message);
  return `Published community post${tier_ids?.length ? ` (gated to ${tier_ids.length} tiers)` : ''}`;
}

async function executeSendReengagement(artistId: string, params: Record<string, unknown>): Promise<string> {
  const { fan_ids } = params as { fan_ids?: string[] };

  // Find the inactive_subscriber sequence
  const { data: seq } = await supabaseAdmin
    .from('sequences')
    .select('id, name')
    .eq('artist_id', artistId)
    .eq('trigger_type', 'inactive_subscriber')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!seq) throw new Error('No active re-engagement sequence found. Create one first.');

  // Get at-risk fans if not specified
  let targetFanIds = fan_ids || [];
  if (targetFanIds.length === 0) {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data: subs } = await supabaseAdmin
      .from('subscriptions')
      .select('fan_id')
      .eq('artist_id', artistId)
      .eq('status', 'active');

    // Find which of these are inactive (no recent plays)
    const { data: tracks } = await supabaseAdmin
      .from('tracks')
      .select('id')
      .eq('artist_id', artistId)
      .eq('is_active', true);

    const trackIds = (tracks || []).map(t => t.id);
    const allFanIds = (subs || []).map(s => s.fan_id);

    if (trackIds.length > 0 && allFanIds.length > 0) {
      const { data: recentPlays } = await supabaseAdmin
        .from('play_history')
        .select('user_id')
        .in('track_id', trackIds)
        .in('user_id', allFanIds)
        .gte('played_at', fourteenDaysAgo);

      const activeFans = new Set((recentPlays || []).map(p => p.user_id));
      targetFanIds = allFanIds.filter(id => !activeFans.has(id));
    }
  }

  if (targetFanIds.length === 0) return 'No inactive fans found — everyone is active!';

  // Enroll fans not already in this sequence
  let enrolled = 0;
  for (const fanId of targetFanIds.slice(0, 50)) {
    const { data: existing } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('id')
      .eq('sequence_id', seq.id)
      .eq('fan_id', fanId)
      .in('status', ['active', 'completed'])
      .maybeSingle();

    if (existing) continue;

    const { data: firstStep } = await supabaseAdmin
      .from('sequence_steps')
      .select('delay_days')
      .eq('sequence_id', seq.id)
      .eq('step_number', 1)
      .single();

    if (firstStep) {
      const nextSendAt = new Date(Date.now() + firstStep.delay_days * 86400000).toISOString();
      await supabaseAdmin.from('sequence_enrollments').insert({
        sequence_id: seq.id,
        fan_id: fanId,
        artist_id: artistId,
        current_step: 0,
        status: 'active',
        next_send_at: nextSendAt,
      });
      enrolled++;
    }
  }

  return `Enrolled ${enrolled} inactive fan${enrolled === 1 ? '' : 's'} in "${seq.name}"`;
}

async function executeAdjustTierPrice(artistId: string, params: Record<string, unknown>): Promise<string> {
  const { tier_id, new_price_cents } = params as { tier_id: string; new_price_cents: number };
  if (!tier_id || !new_price_cents) throw new Error('Missing tier_id or new_price_cents');

  const { data: tier } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, name, price')
    .eq('id', tier_id)
    .eq('artist_id', artistId)
    .single();

  if (!tier) throw new Error('Tier not found');

  const oldPrice = (tier.price / 100).toFixed(2);
  const newPrice = (new_price_cents / 100).toFixed(2);

  await supabaseAdmin
    .from('subscription_tiers')
    .update({ price: new_price_cents })
    .eq('id', tier_id);

  return `Updated "${tier.name}" price from $${oldPrice} to $${newPrice}/mo`;
}

// ─── Action Registry ──────────────────────────────────────────────────────────

const ACTION_HANDLERS: Record<string, (artistId: string, params: Record<string, unknown>) => Promise<string>> = {
  toggle_sequence: executeToggleSequence,
  create_discount_code: executeCreateDiscountCode,
  gate_track: executeGateTrack,
  ungate_track: executeUngateTrack,
  schedule_campaign: executeScheduleCampaign,
  create_community_post: executeCreateCommunityPost,
  send_reengagement: executeSendReengagement,
  adjust_tier_price: executeAdjustTierPrice,
};

// Actions safe to auto-execute without artist approval
export const SAFE_ACTION_TYPES = [
  'toggle_sequence',
  'send_reengagement',
];

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Support both auth modes: user session (manual approve) or cron secret (autonomous)
  const authHeader = req.headers.get('authorization');
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  let artistId: string;

  if (isCron) {
    const body = await req.json();
    artistId = body.artistId;
    const action = body.action as ArtistAgentAction;
    if (!artistId || !action) {
      return NextResponse.json({ error: 'Missing artistId or action' }, { status: 400 });
    }
    return executeAction(artistId, action, 'autonomous');
  }

  // User session auth
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { actionId, approve } = body as { actionId: string; approve: boolean };

  if (!actionId) {
    return NextResponse.json({ error: 'Missing actionId' }, { status: 400 });
  }

  // Get the pending action
  const { data: pendingAction } = await supabaseAdmin
    .from('artist_agent_actions')
    .select('*')
    .eq('id', actionId)
    .eq('status', 'pending')
    .single();

  if (!pendingAction) {
    return NextResponse.json({ error: 'Action not found or already processed' }, { status: 404 });
  }

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', pendingAction.artist_id)
    .eq('user_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  if (!approve) {
    // Reject the action
    await supabaseAdmin
      .from('artist_agent_actions')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', actionId);

    return NextResponse.json({ success: true, message: 'Action rejected' });
  }

  // Execute the approved action
  const action: ArtistAgentAction = {
    type: pendingAction.action_type,
    label: pendingAction.action_label,
    description: pendingAction.action_description || '',
    risk: pendingAction.risk,
    params: pendingAction.action_params || {},
  };

  return executeAction(pendingAction.artist_id, action, 'approved', actionId);
}

async function executeAction(
  artistId: string,
  action: ArtistAgentAction,
  mode: 'autonomous' | 'approved',
  existingActionId?: string,
) {
  const handler = ACTION_HANDLERS[action.type];
  if (!handler) {
    return NextResponse.json({ error: `Unknown action type: ${action.type}` }, { status: 400 });
  }

  // Acquire coordination lock to prevent conflicting concurrent actions
  const lockKey = buildLockKey(action.type, artistId, action.params);
  const lock = await acquireLock(supabaseAdmin, 'artist', 'artist_manager', artistId, action.type, lockKey);

  if (!lock.acquired) {
    const msg = `Action blocked — another agent is already running: ${lock.conflict}`;
    if (existingActionId) {
      await supabaseAdmin
        .from('artist_agent_actions')
        .update({ status: 'failed', result_message: msg, executed_at: new Date().toISOString() })
        .eq('id', existingActionId);
    }
    return NextResponse.json({ success: false, message: msg }, { status: 409 });
  }

  try {
    // Snapshot baseline metrics before executing
    let baseline = null;
    try {
      baseline = await snapshotArtistMetrics(supabaseAdmin, artistId);
    } catch (snapErr) {
      console.error('Baseline snapshot failed (non-fatal):', snapErr);
    }

    const message = await handler(artistId, action.params);

    if (existingActionId) {
      // Update existing pending action
      await supabaseAdmin
        .from('artist_agent_actions')
        .update({
          status: mode === 'autonomous' ? 'auto_executed' : 'executed',
          result_message: message,
          executed_at: new Date().toISOString(),
          reviewed_at: mode === 'approved' ? new Date().toISOString() : undefined,
          baseline_metrics: baseline,
        })
        .eq('id', existingActionId);
    } else {
      // Log new action (autonomous)
      await supabaseAdmin.from('artist_agent_actions').insert({
        artist_id: artistId,
        action_type: action.type,
        action_label: action.label,
        action_description: action.description,
        action_params: action.params,
        risk: action.risk,
        status: 'auto_executed',
        result_message: message,
        executed_at: new Date().toISOString(),
        baseline_metrics: baseline,
      });
    }

    await releaseLock(supabaseAdmin, lock.lockId!, 'completed');
    return NextResponse.json({ success: true, message });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Execution failed';

    await releaseLock(supabaseAdmin, lock.lockId!, 'failed');

    if (existingActionId) {
      await supabaseAdmin
        .from('artist_agent_actions')
        .update({ status: 'failed', result_message: errMsg, executed_at: new Date().toISOString() })
        .eq('id', existingActionId);
    }

    return NextResponse.json({ success: false, message: errMsg }, { status: 400 });
  }
}
