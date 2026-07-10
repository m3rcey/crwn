import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  assignQuest,
  getTemplate,
  liveQuestTemplates,
  generateConnectedFanQuests,
  isQuestEngineEnabled,
} from '@/lib/quests';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/quests/live — the signed-in artist starts a Live Quest, optionally
// tied to a live session. Creates the live_quest instance (active) for the artist.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const templateKey = body?.templateKey as string | undefined;
  const liveSessionId = (body?.liveSessionId as string | undefined) ?? null;
  const template = templateKey ? getTemplate(templateKey) : undefined;
  if (!templateKey || !template || !template.onDemand || template.requiredRole !== 'artist') {
    return NextResponse.json({ error: 'Unknown live quest' }, { status: 400 });
  }

  const id = await assignQuest(supabaseAdmin, {
    userId: user.id,
    role: 'artist',
    artistId: artist.id,
    templateKey,
    related: liveSessionId ? { liveId: liveSessionId } : undefined,
    source: 'live',
  });

  if (id) {
    await supabaseAdmin
      .from('quest_instances')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', id);
  }

  return NextResponse.json({ ok: true, questId: id });
}

// GET /api/quests/live?sessionId=... — the active Live Quest for a session, plus
// (for a signed-in non-owner fan) assigns the connected fan participation quests.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ liveQuest: null });
  if (!(await isQuestEngineEnabled(supabaseAdmin))) return NextResponse.json({ liveQuest: null });

  const { data: inst } = await supabaseAdmin
    .from('quest_instances')
    .select('id, artist_id, template_key, title, subtitle, why_it_matters, status')
    .eq('related_live_id', sessionId)
    .eq('quest_type', 'live_quest')
    .in('status', ['active', 'in_progress'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!inst) return NextResponse.json({ liveQuest: null });

  // Assign connected fan quests to a viewing fan (not the owner) so participating
  // gives them real assignments + XP.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && inst.template_key && inst.artist_id) {
    const { data: ap } = await supabaseAdmin
      .from('artist_profiles')
      .select('user_id')
      .eq('id', inst.artist_id)
      .maybeSingle();
    if (ap && ap.user_id !== user.id) {
      await generateConnectedFanQuests(supabaseAdmin, {
        fanId: user.id,
        artistId: inst.artist_id,
        artistTemplateKey: inst.template_key,
        related: { liveId: sessionId },
      });
    }
  }

  return NextResponse.json({
    liveQuest: {
      id: inst.id,
      artistId: inst.artist_id,
      title: inst.title,
      subtitle: inst.subtitle,
      whyItMatters: inst.why_it_matters,
    },
  });
}
