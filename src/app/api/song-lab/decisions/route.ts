// Song Lab decisions — artist management. Create as draft or open; edit while draft;
// open/close/finalize. ADVISORY ONLY: the tally never finalizes anything, the artist
// names the winner (same ratified rule as session_polls).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSongLabArtist } from '@/lib/songLab/server';
import { normalizeOptions, mergeOptionEdit, MAX_TITLE_LENGTH, type DecisionOption } from '@/lib/songLab/core';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function parseWhen(raw: unknown): string | null | undefined {
  if (raw === null) return null;               // explicit clear
  if (typeof raw !== 'string' || !raw) return undefined; // not provided
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
}

async function ownTierIds(artistId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id')
    .eq('artist_id', artistId)
    .eq('is_active', true);
  return (data || []).map((t) => t.id);
}

/** Eligibility lists may only name the caller's OWN active tiers. */
async function normalizeEligibility(
  artistId: string,
  isFree: unknown,
  allowedTierIds: unknown,
): Promise<{ is_free: boolean; allowed_tier_ids: string[] } | null> {
  const free = isFree === true;
  const raw = Array.isArray(allowedTierIds) ? allowedTierIds.filter((x) => typeof x === 'string') : [];
  const own = await ownTierIds(artistId);
  const allowed = raw.filter((id) => own.includes(id));
  if (!free && allowed.length === 0) return null; // nobody could ever vote: refuse to save it
  return { is_free: free, allowed_tier_ids: allowed };
}

export async function POST(req: NextRequest) {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const stageLabel = typeof body.stageLabel === 'string' ? body.stageLabel.trim() : '';
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!projectId || !stageLabel || stageLabel.length > MAX_TITLE_LENGTH || !question || question.length > 300) {
    return NextResponse.json({ error: 'A decision needs a stage and a question' }, { status: 400 });
  }

  // The project must be the caller's own.
  const { data: project } = await supabaseAdmin
    .from('song_lab_projects')
    .select('id')
    .eq('id', projectId)
    .eq('artist_id', auth.artistId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const options = normalizeOptions(body.options);
  if (!options) return NextResponse.json({ error: 'A decision needs 2 to 4 options' }, { status: 400 });

  const eligibility = await normalizeEligibility(auth.artistId, body.isFree, body.allowedTierIds);
  if (!eligibility) {
    return NextResponse.json({ error: 'Pick at least one eligible tier, or open the vote to everyone' }, { status: 400 });
  }

  const status = body.status === 'open' ? 'open' : 'draft';
  const { data, error } = await supabaseAdmin
    .from('song_lab_decisions')
    .insert({
      project_id: projectId,
      artist_id: auth.artistId,
      stage_label: stageLabel,
      question,
      options,
      status,
      ...eligibility,
      opens_at: parseWhen(body.opensAt) ?? null,
      closes_at: parseWhen(body.closesAt) ?? null,
    })
    .select('id')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Failed to create decision' }, { status: 500 });

  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const decisionId = typeof body.decisionId === 'string' ? body.decisionId : '';
  const action = typeof body.action === 'string' ? body.action : 'edit';
  if (!decisionId) return NextResponse.json({ error: 'Missing decisionId' }, { status: 400 });

  const { data: decision } = await supabaseAdmin
    .from('song_lab_decisions')
    .select('id, status, options')
    .eq('id', decisionId)
    .eq('artist_id', auth.artistId)
    .maybeSingle();
  if (!decision) return NextResponse.json({ error: 'Decision not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};

  if (action === 'open') {
    if (decision.status === 'closed') return NextResponse.json({ error: 'A closed decision stays closed' }, { status: 409 });
    updates.status = 'open';
  } else if (action === 'close') {
    updates.status = 'closed';
    updates.closed_at = new Date().toISOString();
  } else if (action === 'finalize') {
    const winner = typeof body.winningOptionId === 'string' ? body.winningOptionId : '';
    const opts = (decision.options || []) as DecisionOption[];
    if (!opts.some((o) => o.id === winner)) {
      return NextResponse.json({ error: 'Winner must be one of the options' }, { status: 400 });
    }
    updates.winning_option_id = winner;
    if (decision.status !== 'closed') {
      updates.status = 'closed';
      updates.closed_at = new Date().toISOString();
    }
  } else if (action === 'edit') {
    if (typeof body.question === 'string') {
      const q = body.question.trim();
      if (!q || q.length > 300) return NextResponse.json({ error: 'Invalid question' }, { status: 400 });
      updates.question = q;
    }
    if (typeof body.stageLabel === 'string') {
      const s = body.stageLabel.trim();
      if (!s || s.length > MAX_TITLE_LENGTH) return NextResponse.json({ error: 'Invalid stage label' }, { status: 400 });
      updates.stage_label = s;
    }
    if (Array.isArray(body.optionLabels)) {
      // Labels edit in place by position so cast votes keep their meaning. Shrinking the
      // ballot after votes exist would orphan votes, so option COUNT only changes on drafts.
      const merged = mergeOptionEdit((decision.options || []) as DecisionOption[], body.optionLabels.filter((l: unknown) => typeof l === 'string'));
      if (!merged) return NextResponse.json({ error: 'A decision needs 2 to 4 options' }, { status: 400 });
      const existingCount = ((decision.options || []) as DecisionOption[]).length;
      if (decision.status !== 'draft' && merged.length < existingCount) {
        return NextResponse.json({ error: 'Options cannot be removed after the vote opens' }, { status: 409 });
      }
      updates.options = merged;
    }
    if ('isFree' in body || 'allowedTierIds' in body) {
      const eligibility = await normalizeEligibility(auth.artistId, body.isFree, body.allowedTierIds);
      if (!eligibility) {
        return NextResponse.json({ error: 'Pick at least one eligible tier, or open the vote to everyone' }, { status: 400 });
      }
      updates.is_free = eligibility.is_free;
      updates.allowed_tier_ids = eligibility.allowed_tier_ids;
    }
    const opens = parseWhen(body.opensAt);
    if (opens !== undefined) updates.opens_at = opens;
    const closes = parseWhen(body.closesAt);
    if (closes !== undefined) updates.closes_at = closes;
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  if (!Object.keys(updates).length) return NextResponse.json({ success: true });

  const { error } = await supabaseAdmin
    .from('song_lab_decisions')
    .update(updates)
    .eq('id', decisionId)
    .eq('artist_id', auth.artistId);
  if (error) return NextResponse.json({ error: 'Failed to update decision' }, { status: 500 });

  return NextResponse.json({ success: true });
}
