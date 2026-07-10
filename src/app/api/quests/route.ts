import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ensureRoleQuests,
  refreshQuests,
  getQuests,
  isQuestEngineEnabled,
  levelFromXp,
  recommendNextQuest,
} from '@/lib/quests';
import type { QuestRole } from '@/lib/quests';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// GET /api/quests — the caller's current quests + progression.
// Resolves role from artist_profiles ownership, ensures eligible quests are
// assigned, auto-completes any now satisfied, and returns the board.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await isQuestEngineEnabled(supabaseAdmin))) {
    return NextResponse.json({ enabled: false, quests: [], progression: null });
  }

  // Role is derived from the artist_profiles row existing (NOT profile.role, which
  // lags a token refresh right after publish — see CLAUDE.md onboarding notes).
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  let role: QuestRole = 'fan';
  let artistId: string | null = null;
  let artistCount = 0;
  let primaryArtist: { id: string; slug: string; displayName: string; avatarUrl: string | null } | null = null;

  if (artist) {
    role = 'artist';
    artistId = artist.id;
  } else {
    // Fan: how many distinct artists do they actively support? Drives the adaptive
    // Supporter Mode layout (0 / 1 / 2-3 / 4+). Anchor to the most recent one.
    const { data: subs } = await supabaseAdmin
      .from('subscriptions')
      .select('artist_id, current_period_start')
      .eq('fan_id', user.id)
      .eq('status', 'active')
      .order('current_period_start', { ascending: false });
    const distinct = [...new Set((subs ?? []).map((s: any) => s.artist_id))];
    artistCount = distinct.length;
    artistId = distinct[0] ?? null;

    if (artistId) {
      const { data: ap } = await supabaseAdmin
        .from('artist_profiles')
        .select('id, slug, user_id')
        .eq('id', artistId)
        .maybeSingle();
      if (ap) {
        const { data: prof } = await supabaseAdmin
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', ap.user_id)
          .maybeSingle();
        primaryArtist = {
          id: ap.id,
          slug: ap.slug,
          displayName: prof?.display_name || 'Artist',
          avatarUrl: prof?.avatar_url ?? null,
        };
      }
    }
  }

  // Only assign/refresh when we have an artist world to anchor to.
  let completions: any[] = [];
  if (artistId) {
    await ensureRoleQuests(supabaseAdmin, { userId: user.id, role, artistId });
    const res = await refreshQuests(supabaseAdmin, { userId: user.id, role });
    completions = res.completions;
  }

  const quests = await getQuests(supabaseAdmin, { userId: user.id, role });

  const { data: prog } = await supabaseAdmin
    .from('user_progression')
    .select('*')
    .eq('user_id', user.id)
    .is('artist_id', null)
    .maybeSingle();

  const xp = prog?.xp ?? 0;
  const level = levelFromXp(role, xp);

  return NextResponse.json({
    enabled: true,
    role,
    artistId,
    artistCount,
    primaryArtist,
    quests,
    completions,
    recommended: recommendNextQuest(quests),
    build: {
      primary: prog?.artist_build_primary ?? null,
      secondary: prog?.artist_build_secondary ?? null,
    },
    progression: {
      xp,
      ...level,
      streak: prog?.streak_count ?? 0,
      fanRole: prog?.fan_role ?? null,
    },
  });
}
