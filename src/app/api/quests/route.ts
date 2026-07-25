import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  ensureRoleQuests,
  unlockEligibleQuests,
  refreshQuests,
  reconcileXp,
  getQuests,
  isQuestEngineEnabled,
  levelFromXp,
  recommendNextQuest,
} from '@/lib/quests';
import type { QuestRole } from '@/lib/quests';
import { buildLeadMagnetMissions } from '@/lib/leadResults/leadMagnetMissions';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';

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

  // Only assign/refresh when we have an artist world to anchor to. Cascade:
  // assign the ladder, then loop unlock→complete so one load fully settles and the
  // TRUE next move surfaces (the ladder starts fully locked at assign-time).
  let completions: any[] = [];
  if (artistId) {
    await ensureRoleQuests(supabaseAdmin, { userId: user.id, role, artistId });
    // Loop deep enough to settle the full 10-level ladder in one load (it starts
    // fully locked at assign-time). Breaks early as soon as nothing changes, so a
    // shallow account costs only a couple of passes.
    for (let i = 0; i < 12; i++) {
      const unlocked = await unlockEligibleQuests(supabaseAdmin, { userId: user.id, artistId });
      const res = await refreshQuests(supabaseAdmin, { userId: user.id, role });
      completions = completions.concat(res.completions);
      if (unlocked === 0 && res.completions.length === 0) break;
    }
    // Self-heal: grant XP for quests that completed before XP granting worked.
    await reconcileXp(supabaseAdmin, { userId: user.id, role });
  }

  const quests = await getQuests(supabaseAdmin, { userId: user.id, role });

  // Personalized first mission: the top mission from the calculators this artist completed, so
  // Rise Mode opens on "Build Membership ($X/mo)" instead of a cold, generic board. Same shared
  // generator the Action Plan uses, so the two never become separate mission systems. Null when
  // no calculator was completed, in which case the normal board leads unchanged.
  let leadMagnet: {
    toolSlug: string;
    toolName: string;
    title: string;
    monthlyValue: string | null;
    href: string;
  } | null = null;
  if (artistId) {
    const missions = await buildLeadMagnetMissions(supabaseAdmin, { userId: user.id, artistId });
    const top = missions[0];
    if (top) {
      leadMagnet = {
        toolSlug: top.toolSlug,
        toolName: top.toolName,
        title: top.title,
        monthlyValue: top.monthlyValue,
        href: top.href,
      };
    }
  }

  // Funnel: Rise Mode Started (once per artist per day) and Mission Completed (once per quest).
  // Reuses the quest system's own completion signal, so there is no second mission system.
  if (artistId) {
    const today = new Date().toISOString().slice(0, 10);
    await recordFunnelEvent(supabaseAdmin, {
      stage: 'rise_mode_started',
      artistId,
      userId: user.id,
      calculator: leadMagnet?.toolSlug ?? null,
      dedupeKey: `${artistId}:${today}`,
    });
    for (const c of completions) {
      const qid = (c as { questId?: string; id?: string })?.questId || (c as { id?: string })?.id;
      if (!qid) continue;
      await recordFunnelEvent(supabaseAdmin, {
        stage: 'mission_completed',
        artistId,
        userId: user.id,
        calculator: leadMagnet?.toolSlug ?? null,
        dedupeKey: String(qid),
        metadata: { title: (c as { title?: string })?.title ?? null },
      });
    }
  }

  const { data: prog } = await supabaseAdmin
    .from('user_progression')
    .select('*')
    .eq('user_id', user.id)
    .is('artist_id', null)
    .maybeSingle();

  const xp = prog?.xp ?? 0;
  const level = levelFromXp(role, xp);

  // Main-game victory: the artist_beat_rise_mode boss (an authoritative composite)
  // is completed. Build the summary ONLY from real counts, never fabricated metrics.
  let victory: {
    tracks: number;
    supporters: number;
    campaigns: number;
    referrals: number;
    xp: number;
    level: number;
  } | null = null;
  if (role === 'artist' && artistId && quests.some((q) => q.template_key === 'artist_beat_rise_mode' && q.status === 'completed')) {
    const q = (table: string, match: Record<string, unknown>) => {
      let b = supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
      for (const [k, v] of Object.entries(match)) b = b.eq(k, v);
      return b;
    };
    const [t, s, c, r] = await Promise.all([
      supabaseAdmin.from('tracks').select('id', { count: 'exact', head: true }).eq('artist_id', artistId).not('is_active', 'is', false),
      q('subscriptions', { artist_id: artistId, status: 'active' }),
      q('road_campaigns', { artist_id: artistId }),
      q('referrals', { artist_id: artistId, status: 'active' }),
    ]);
    victory = {
      tracks: t.count || 0,
      supporters: s.count || 0,
      campaigns: c.count || 0,
      referrals: r.count || 0,
      xp,
      level: level.level,
    };
  }

  // Adaptive recap: when this load auto-recognized MULTIPLE already-done quests
  // (an established artist entering Rise for the first time), surface one
  // consolidated recap instead of a burst of individual celebrations. XP is
  // granted idempotently by the cascade, so this is display-only and safe to
  // recompute every load — it only appears while >1 quest completes at once.
  const recap =
    completions.length >= 2
      ? {
          count: completions.length,
          xpAwarded: completions.reduce((sum: number, c: any) => sum + (c?.xpAwarded ?? 0), 0),
          leveledUp: completions.some((c: any) => c?.leveledUp),
          newLevel: level.level,
          levelTitle: level.levelTitle,
          titles: completions.map((c: any) => c?.title).filter(Boolean),
        }
      : null;

  return NextResponse.json({
    enabled: true,
    role,
    artistId,
    artistCount,
    primaryArtist,
    quests,
    completions,
    recap,
    victory,
    leadMagnet,
    recommended: recommendNextQuest(quests, prog?.artist_build_primary ?? null),
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
