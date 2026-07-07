import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

// Artist-facing management of release credits (feature #3). The artist assigns
// which subscribing fans are credited on a specific release (track or album).
// Eligibility: fan holds an active subscription on a tier carrying the
// `credits_on_releases` benefit. Writes go through the service-role client after
// an ownership check; fans read the resulting credits via the public RLS policy.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

type ReleaseType = 'track' | 'album';

// Resolve the artist that owns a release, and confirm the caller owns that artist.
async function resolveOwnedArtist(userId: string, releaseType: ReleaseType, releaseId: string) {
  const table = releaseType === 'track' ? 'tracks' : 'albums';
  const { data: release } = await supabaseAdmin
    .from(table)
    .select('id, artist_id')
    .eq('id', releaseId)
    .maybeSingle();
  if (!release) return null;

  const { data: owned } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('id', release.artist_id)
    .eq('user_id', userId)
    .maybeSingle();
  return owned ? (release.artist_id as string) : null;
}

// Fans eligible to be credited: active subscribers whose tier has the
// credits_on_releases benefit. Returns the tier's configured role_label too.
async function loadEligibleFans(artistId: string) {
  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('fan_id, tier:tier_id(id, benefits:tier_benefits(benefit_type, config))')
    .eq('artist_id', artistId)
    .eq('status', 'active');

  const eligible: { fan_id: string; default_role: string }[] = [];
  for (const sub of subs || []) {
    const tier = sub.tier as any;
    const benefit = tier?.benefits?.find(
      (b: any) => b.benefit_type === 'credits_on_releases' && b.config?.enabled !== false
    );
    if (benefit) {
      eligible.push({
        fan_id: sub.fan_id as string,
        default_role: benefit.config?.role_label || 'Credited Supporter',
      });
    }
  }
  if (eligible.length === 0) return [];

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, avatar_url, username')
    .in('id', eligible.map((e) => e.fan_id));

  return (profiles || []).map((p) => {
    const e = eligible.find((x) => x.fan_id === p.id);
    return {
      fan_id: p.id,
      display_name: p.display_name,
      username: p.username,
      avatar_url: p.avatar_url,
      default_role: e?.default_role || 'Credited Supporter',
    };
  });
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const releaseType = request.nextUrl.searchParams.get('releaseType') as ReleaseType | null;
  const releaseId = request.nextUrl.searchParams.get('releaseId');
  if (!releaseType || !releaseId || (releaseType !== 'track' && releaseType !== 'album')) {
    return NextResponse.json({ error: 'Missing or invalid release' }, { status: 400 });
  }

  const artistId = await resolveOwnedArtist(user.id, releaseType, releaseId);
  if (!artistId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [{ data: credits }, eligible] = await Promise.all([
    supabaseAdmin
      .from('release_credits')
      .select('fan_id, role_label')
      .eq('release_type', releaseType)
      .eq('release_id', releaseId),
    loadEligibleFans(artistId),
  ]);

  return NextResponse.json({ credits: credits || [], eligible });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await checkRateLimit(user.id, 'release-credits', 60, 10);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await request.json().catch(() => null);
  const releaseType = body?.releaseType as ReleaseType | undefined;
  const releaseId = body?.releaseId as string | undefined;
  const credits = Array.isArray(body?.credits) ? body.credits : null;
  if (!releaseType || !releaseId || !credits || (releaseType !== 'track' && releaseType !== 'album')) {
    return NextResponse.json({ error: 'Missing or invalid payload' }, { status: 400 });
  }

  const artistId = await resolveOwnedArtist(user.id, releaseType, releaseId);
  if (!artistId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only fans whose tier actually carries the benefit can be credited.
  const eligible = await loadEligibleFans(artistId);
  const eligibleIds = new Set(eligible.map((e) => e.fan_id));

  const rows = credits
    .filter((c: any) => c?.fan_id && eligibleIds.has(c.fan_id))
    .map((c: any) => ({
      artist_id: artistId,
      release_type: releaseType,
      release_id: releaseId,
      fan_id: c.fan_id as string,
      role_label: (typeof c.role_label === 'string' && c.role_label.trim())
        ? c.role_label.trim().slice(0, 40)
        : (eligible.find((e) => e.fan_id === c.fan_id)?.default_role || 'Credited Supporter'),
    }));

  // Who is newly credited (for notifications)?
  const { data: existing } = await supabaseAdmin
    .from('release_credits')
    .select('fan_id')
    .eq('release_type', releaseType)
    .eq('release_id', releaseId);
  const existingIds = new Set((existing || []).map((r) => r.fan_id as string));

  // Replace the credit set for this release (delete-all-then-insert).
  await supabaseAdmin
    .from('release_credits')
    .delete()
    .eq('release_type', releaseType)
    .eq('release_id', releaseId);

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from('release_credits').insert(rows);
    if (error) {
      console.error('release_credits insert failed:', error);
      return NextResponse.json({ error: 'Failed to save credits' }, { status: 500 });
    }
  }

  // Notify newly credited fans — "you're credited on this release".
  const newlyCredited = rows.filter((r: any) => !existingIds.has(r.fan_id));
  if (newlyCredited.length > 0) {
    const table = releaseType === 'track' ? 'tracks' : 'albums';
    const { data: release } = await supabaseAdmin
      .from(table)
      .select('title, artist_id')
      .eq('id', releaseId)
      .maybeSingle();
    const { data: artistProfile } = await supabaseAdmin
      .from('artist_profiles')
      .select('slug, profile:profiles(display_name)')
      .eq('id', artistId)
      .maybeSingle();
    const artistName = (artistProfile?.profile as any)?.display_name || 'The artist';
    const title = release?.title || 'a new release';
    const link = artistProfile?.slug ? `/${artistProfile.slug}/${releaseType}/${releaseId}` : '/library';

    await supabaseAdmin.from('notifications').insert(
      newlyCredited.map((r: any) => ({
        user_id: r.fan_id,
        type: 'release_credit',
        title: '📝 You got a credit',
        message: `${artistName} credited you as "${r.role_label}" on ${title}`,
        link,
      }))
    );
  }

  return NextResponse.json({ ok: true, count: rows.length });
}
