import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { PLAYBOOKS, PLAYBOOK_MAP, recommendPlaybooks, generatePlaybookSteps, type ArtistSnapshot } from '@/lib/playbooks';

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

// Cheap artist snapshot for recommendations + step prefill.
async function computeSnapshot(artistId: string): Promise<ArtistSnapshot> {
  const [{ data: subs }, { data: earn }, { count: leadCount }, { data: vod }] = await Promise.all([
    supabaseAdmin.from('subscriptions').select('status').eq('artist_id', artistId),
    supabaseAdmin.from('earnings').select('fan_city').eq('artist_id', artistId).not('fan_city', 'is', null),
    supabaseAdmin.from('fan_contacts').select('id', { count: 'exact', head: true }).eq('artist_id', artistId),
    supabaseAdmin.from('live_sessions').select('id, title').eq('artist_id', artistId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const subscriberCount = (subs || []).filter((s: any) => s.status === 'active').length;
  const churnedCount = (subs || []).filter((s: any) => s.status === 'canceled').length;
  const cityTally: Record<string, number> = {};
  (earn || []).forEach((e: any) => { if (e.fan_city) cityTally[e.fan_city] = (cityTally[e.fan_city] || 0) + 1; });
  const topCity = Object.entries(cityTally).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return {
    subscriberCount, churnedCount, freeCount: leadCount || 0, topCity,
    latestVodId: (vod as any)?.id || null, latestVodTitle: (vod as any)?.title || null,
  };
}

// GET /api/playbooks — catalog + recommendations + active runs
export async function GET() {
  const { artistId } = await getUserAndArtist();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const snapshot = await computeSnapshot(artistId);
  const recs = recommendPlaybooks(snapshot).map(r => ({ ...r, playbook: PLAYBOOK_MAP[r.id] }));

  const { data: runs } = await supabaseAdmin
    .from('artist_playbook_runs').select('*').eq('artist_id', artistId)
    .in('status', ['active', 'paused']).order('started_at', { ascending: false });

  return NextResponse.json({ playbooks: PLAYBOOKS, recommendations: recs, snapshot, activeRuns: runs || [] });
}

// POST /api/playbooks  { playbookId } — start a run: generate steps (all pending)
export async function POST(req: NextRequest) {
  const { user, artistId } = await getUserAndArtist();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const { playbookId } = await req.json();
  const def = PLAYBOOK_MAP[playbookId];
  if (!def) return NextResponse.json({ error: 'Unknown playbook' }, { status: 400 });

  const snapshot = await computeSnapshot(artistId);
  const steps = generatePlaybookSteps(playbookId, snapshot);
  if (steps.length === 0) return NextResponse.json({ error: 'No steps generated' }, { status: 400 });

  const { data: run, error } = await supabaseAdmin.from('artist_playbook_runs').insert({
    artist_id: artistId, playbook_id: playbookId, playbook_name: def.name,
    status: 'active', goal_metadata: snapshot, created_by: user!.id,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stepRows = steps.map((s, i) => ({
    run_id: run.id, step_index: i, step_type: s.stepType, title: s.title,
    description: s.description, status: 'pending', generated_payload: s.payload,
  }));
  await supabaseAdmin.from('artist_playbook_steps').insert(stepRows);

  return NextResponse.json({ run });
}
