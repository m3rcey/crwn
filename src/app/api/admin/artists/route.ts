import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

/**
 * Admin: every artist on CRWN, and the founder's Featured switch.
 *
 * Featured is the founder's discretion (2026-09-26). `featured_on_home` is the ONE switch Home's
 * Featured row reads; artists cannot set it (frozen by trg_freeze_artist_profiles_cols in
 * schema-phase2-featured-on-home-opt-in.sql). Authority is the session admin from requireAdmin,
 * never a request field. The Stripe id never leaves this route: only whether one exists.
 */

type ArtistRow = {
  id: string;
  user_id: string;
  slug: string | null;
  created_at: string;
  platform_tier: string | null;
  stripe_connect_id: string | null;
  featured_hidden: boolean | null;
  featured_on_home?: boolean | null;
};

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const base = 'id, user_id, slug, created_at, platform_tier, stripe_connect_id, featured_hidden';
  // Tolerant of the pending migration: before featured_on_home exists the list still loads,
  // and the UI says the switch is not live yet instead of showing an empty page.
  let featuredColumn = true;
  const withFlag = await supabaseAdmin
    .from('artist_profiles')
    .select(`${base}, featured_on_home`)
    .order('created_at', { ascending: false });
  let rows = withFlag.data as ArtistRow[] | null;
  if (withFlag.error) {
    featuredColumn = false;
    const without = await supabaseAdmin.from('artist_profiles').select(base).order('created_at', { ascending: false });
    if (without.error) return NextResponse.json({ error: without.error.message }, { status: 500 });
    rows = without.data as ArtistRow[] | null;
  }

  const artists = rows || [];
  const userIds = artists.map((a) => a.user_id);
  const artistIds = artists.map((a) => a.id);

  const [profilesRes, tracksRes, subsRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, display_name, avatar_url, email, is_active').in('id', userIds),
    supabaseAdmin.from('tracks').select('artist_id').eq('is_active', true).in('artist_id', artistIds),
    supabaseAdmin.from('subscriptions').select('artist_id').eq('status', 'active').in('artist_id', artistIds),
  ]);

  const profiles = new Map((profilesRes.data || []).map((p) => [p.id as string, p]));
  const count = (rows: { artist_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows || []) m.set(r.artist_id, (m.get(r.artist_id) || 0) + 1);
    return m;
  };
  const tracks = count(tracksRes.data as { artist_id: string }[] | null);
  const members = count(subsRes.data as { artist_id: string }[] | null);

  return NextResponse.json({
    featuredColumn,
    artists: artists.map((a) => {
      const p = profiles.get(a.user_id);
      return {
        id: a.id,
        slug: a.slug,
        createdAt: a.created_at,
        displayName: p?.display_name ?? null,
        email: p?.email ?? null,
        avatarUrl: p?.avatar_url ?? null,
        accountActive: p?.is_active !== false,
        plan: a.platform_tier || 'starter',
        stripeConnected: !!a.stripe_connect_id,
        tracks: tracks.get(a.id) || 0,
        activeMembers: members.get(a.id) || 0,
        featured: a.featured_on_home === true,
        hidden: a.featured_hidden === true,
      };
    }),
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const artistId = body?.artistId;
  const featured = body?.featured;
  if (typeof artistId !== 'string' || !/^[0-9a-f-]{36}$/i.test(artistId) || typeof featured !== 'boolean') {
    return NextResponse.json({ error: 'artistId (uuid) and featured (boolean) are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('artist_profiles')
    .update({ featured_on_home: featured })
    .eq('id', artistId)
    .select('id, featured_on_home')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

  return NextResponse.json({ ok: true, featured: data.featured_on_home === true });
}
