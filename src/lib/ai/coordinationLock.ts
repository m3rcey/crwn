import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Agent coordination lock — prevents conflicting concurrent actions.
 *
 * Lock key format: `{action_type}:{target_id}` e.g. "adjust_tier_price:uuid-123"
 * For actions without a specific target: `{action_type}:{artist_id}`
 *
 * Locks expire after 1 hour (safety net for crashed processes).
 */

export interface LockResult {
  acquired: boolean;
  lockId: string | null;
  conflict: string | null; // description of what holds the conflicting lock
}

/**
 * Build a lock key from an action. The key determines what "resource" is being locked.
 * Two actions with the same lock key cannot run concurrently.
 */
export function buildLockKey(actionType: string, targetId: string, params?: Record<string, unknown>): string {
  // For actions that target a specific resource, include that in the key
  switch (actionType) {
    case 'adjust_tier_price':
      return `adjust_tier_price:${params?.tier_id || targetId}`;
    case 'gate_track':
    case 'ungate_track':
      return `track_access:${params?.track_id || targetId}`;
    case 'toggle_sequence':
      return `toggle_sequence:${params?.sequence_id || params?.sequence_trigger || targetId}`;
    case 'create_discount_code':
      return `discount:${targetId}`;
    case 'update_pipeline_stages':
      return `pipeline_stages:${params?.from_stage || 'all'}`;
    case 'flag_at_risk':
      return `flag_at_risk:${params?.from_stage || 'all'}`;
    default:
      return `${actionType}:${targetId}`;
  }
}

/**
 * Attempt to acquire a coordination lock.
 * Returns { acquired: true, lockId } on success.
 * Returns { acquired: false, conflict } if another agent holds the lock.
 */
export async function acquireLock(
  supabaseAdmin: SupabaseClient,
  agentType: 'platform' | 'artist',
  agentScope: string,
  targetId: string | null,
  actionType: string,
  lockKey: string,
): Promise<LockResult> {
  // Check for existing active lock on this key
  const { data: existing } = await supabaseAdmin
    .from('agent_coordination')
    .select('id, agent_type, agent_scope, started_at, expires_at')
    .eq('lock_key', lockKey)
    .eq('status', 'running')
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      acquired: false,
      lockId: null,
      conflict: `${existing.agent_type}/${existing.agent_scope} holds lock since ${existing.started_at}`,
    };
  }

  // Acquire the lock
  const { data: lock, error } = await supabaseAdmin
    .from('agent_coordination')
    .insert({
      agent_type: agentType,
      agent_scope: agentScope,
      target_id: targetId,
      action_type: actionType,
      lock_key: lockKey,
      status: 'running',
      expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    })
    .select('id')
    .single();

  if (error) {
    console.error('Lock acquisition failed:', error);
    return { acquired: false, lockId: null, conflict: `Lock insert failed: ${error.message}` };
  }

  return { acquired: true, lockId: lock.id, conflict: null };
}

/**
 * Release a coordination lock after action completes.
 */
export async function releaseLock(
  supabaseAdmin: SupabaseClient,
  lockId: string,
  status: 'completed' | 'failed' = 'completed',
): Promise<void> {
  await supabaseAdmin
    .from('agent_coordination')
    .update({
      status,
      completed_at: new Date().toISOString(),
    })
    .eq('id', lockId);
}

/**
 * Expire all stale locks (safety cleanup). Called from outcome-measure cron.
 */
export async function expireStallLocks(supabaseAdmin: SupabaseClient): Promise<number> {
  const { data } = await supabaseAdmin
    .from('agent_coordination')
    .update({ status: 'expired', completed_at: new Date().toISOString() })
    .eq('status', 'running')
    .lt('expires_at', new Date().toISOString())
    .select('id');

  return data?.length || 0;
}
