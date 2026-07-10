import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOwnedArtistIds } from '@/lib/messaging';
import { buildAudience, applyAudienceFilters, type FanRecord } from '@/lib/audience';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  // This route reads with the service-role client, so RLS cannot protect it and
  // middleware skips /api/. Without this check anyone holding an artist UUID can
  // dump that artist's whole fan list, including email addresses. Every caller
  // already passes an artistId derived from their OWN artist_profiles row.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owned = await getOwnedArtistIds(supabaseAdmin, user.id);
  if (!owned.includes(artistId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sortBy = req.nextUrl.searchParams.get('sortBy') || 'engagement_score';
  const sortDir = req.nextUrl.searchParams.get('sortDir') || 'desc';
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 100);

  const { fans: allFans, lifecycleCounts } = await buildAudience(supabaseAdmin, artistId);

  if (allFans.length === 0) {
    return NextResponse.json({
      fans: [],
      total: 0,
      page,
      limit,
      totalSubscribers: 0,
      totalAudience: 0,
      lifecycleCounts,
    });
  }

  const fans = applyAudienceFilters(allFans, {
    tier: req.nextUrl.searchParams.get('tier'),
    location: req.nextUrl.searchParams.get('location'),
    minSpend: req.nextUrl.searchParams.get('minSpend'),
    maxSpend: req.nextUrl.searchParams.get('maxSpend'),
    engagement: req.nextUrl.searchParams.get('engagement'),
    lifecycle: req.nextUrl.searchParams.get('lifecycle'),
    search: req.nextUrl.searchParams.get('search'),
  });

  // Counts after filters, before pagination.
  const totalSubscribers = fans.filter((f) => f.is_subscriber).length;
  const totalAudience = fans.length;

  // Sort
  const validSortFields: (keyof FanRecord)[] = [
    'display_name', 'tier_name', 'total_spent', 'subscribed_at',
    'last_active', 'engagement_score', 'referral_count',
  ];
  const sortField = validSortFields.includes(sortBy as keyof FanRecord)
    ? (sortBy as keyof FanRecord)
    : 'engagement_score';

  const sorted = [...fans].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  // Paginate
  const offset = (page - 1) * limit;
  const paginatedFans = sorted.slice(offset, offset + limit);

  return NextResponse.json({
    fans: paginatedFans,
    total: totalAudience,
    page,
    limit,
    totalSubscribers,
    totalAudience,
    lifecycleCounts,
  });
}
