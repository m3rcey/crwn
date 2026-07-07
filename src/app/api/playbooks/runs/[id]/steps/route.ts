import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { SQUAD_TYPE_MAP, slugifySquad, type SquadType } from '@/lib/squads';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getUserAndArtist() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, artistId: null };
  const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { user, artistId: artist?.id ?? null };
}

// Executes an approved CREATE step by inserting a real row via the shipped systems.
// Draft steps (message/post) create nothing — they are approved as drafts the artist
// sends from existing tools. Returns { resourceType, resourceId } or null.
async function executeStep(
  artistId: string, userId: string, stepType: string, payload: any,
): Promise<{ resourceType: string; resourceId: string } | null> {
  switch (stepType) {
    case 'create_squad': {
      const type = (payload.type || 'custom') as SquadType;
      const def = SQUAD_TYPE_MAP[type] || SQUAD_TYPE_MAP.custom;
      const name = payload.name || def.label;
      const { data, error } = await supabaseAdmin.from('artist_squads').insert({
        artist_id: artistId, name, slug: slugifySquad(name), type,
        description: def.description, status: 'active',
        visibility: payload.visibility || def.suggestedVisibility,
        linked_city: payload.linkedCity || null, badge_key: def.badgeKey ?? null, created_by: userId,
      }).select('id').single();
      if (error) throw new Error(error.message);
      return { resourceType: 'squad', resourceId: data.id };
    }
    case 'create_mission': {
      const { data, error } = await supabaseAdmin.from('missions').insert({
        artist_id: artistId, type: payload.type || 'custom', target_kind: 'none',
        goal_count: payload.goalCount || 100, reward_type: payload.rewardType || 'points',
        reward_detail: payload.rewardDetail || null, audience: 'all',
        title: payload.title || 'Mission', cta: payload.cta || null, status: 'active',
      }).select('id').single();
      if (error) throw new Error(error.message);
      return { resourceType: 'mission', resourceId: data.id };
    }
    case 'create_bounty': {
      const rewardType = ['points', 'badge', 'access', 'commission_boost', 'custom'].includes(payload.rewardType) ? payload.rewardType : 'badge';
      const { data, error } = await supabaseAdmin.from('clip_bounties').insert({
        artist_id: artistId, live_session_id: payload.liveSessionId || null,
        title: payload.title || 'Clip bounty', bounty_type: payload.bountyType || 'artist_pick',
        reward_type: rewardType, reward_detail: payload.rewardDetail || null,
        reward_badge_key: rewardType === 'badge' ? 'bounty_winner' : null,
        status: 'active', approval_required: true, eligibility: 'all', created_by: userId,
      }).select('id').single();
      if (error) throw new Error(error.message);
      return { resourceType: 'bounty', resourceId: data.id };
    }
    case 'create_city_unlock': {
      const city = (payload.targetCity || '').trim();
      if (!city) throw new Error('No city available — set a city and try again');
      const { data, error } = await supabaseAdmin.from('city_unlocks').insert({
        artist_id: artistId, title: payload.title || 'City unlock', target_city: city,
        unlock_type: payload.unlockType || 'event', goal_type: payload.goalType || 'supporters',
        goal_value: payload.goalValue || 50, status: 'active', created_by: userId,
      }).select('id').single();
      if (error) throw new Error(error.message);
      return { resourceType: 'city_unlock', resourceId: data.id };
    }
    // Drafts: nothing is created or sent.
    case 'draft_message':
    case 'draft_post':
      return null;
    default:
      return null;
  }
}

// PATCH /api/playbooks/runs/[id]/steps  { stepId, action: 'approve'|'skip' }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: runId } = await params;
  const { user, artistId } = await getUserAndArtist();
  if (!user || !artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { data: run } = await supabaseAdmin.from('artist_playbook_runs').select('id').eq('id', runId).eq('artist_id', artistId).single();
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { stepId, action } = await req.json();
  if (!stepId || !['approve', 'skip'].includes(action)) {
    return NextResponse.json({ error: 'Missing stepId or invalid action' }, { status: 400 });
  }

  const { data: step } = await supabaseAdmin.from('artist_playbook_steps').select('*').eq('id', stepId).eq('run_id', runId).single();
  if (!step) return NextResponse.json({ error: 'Step not found' }, { status: 404 });

  if (action === 'skip') {
    await supabaseAdmin.from('artist_playbook_steps').update({ status: 'skipped', updated_at: new Date().toISOString() }).eq('id', stepId);
  } else {
    // Approve → execute (create steps) or mark approved (draft steps)
    const isDraft = step.step_type === 'draft_message' || step.step_type === 'draft_post';
    try {
      const result = await executeStep(artistId, user.id, step.step_type, step.generated_payload);
      await supabaseAdmin.from('artist_playbook_steps').update({
        status: isDraft ? 'approved' : 'executed',
        executed_resource_type: result?.resourceType || null,
        executed_resource_id: result?.resourceId || null,
        updated_at: new Date().toISOString(),
      }).eq('id', stepId);
    } catch (e: any) {
      await supabaseAdmin.from('artist_playbook_steps').update({
        status: 'failed', updated_at: new Date().toISOString(),
      }).eq('id', stepId);
      return NextResponse.json({ error: e.message || 'Step failed' }, { status: 500 });
    }
  }

  // If every step is terminal, complete the run.
  const { data: allSteps } = await supabaseAdmin.from('artist_playbook_steps').select('status').eq('run_id', runId);
  const allDone = (allSteps || []).every((s: any) => ['executed', 'approved', 'skipped', 'failed'].includes(s.status));
  if (allDone && (allSteps || []).length > 0) {
    await supabaseAdmin.from('artist_playbook_runs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', runId);
  }

  const { data: steps } = await supabaseAdmin.from('artist_playbook_steps').select('*').eq('run_id', runId).order('step_index', { ascending: true });
  return NextResponse.json({ steps: steps || [], completed: allDone });
}
