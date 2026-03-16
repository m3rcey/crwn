import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');
  const platformTier = req.nextUrl.searchParams.get('tier') || 'starter';

  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  // Get artist's location and genres
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('city, state, genres')
    .eq('id', artistId)
    .single();

  // Fetch all active opportunities
  const { data: opportunities } = await supabaseAdmin
    .from('sync_opportunities')
    .select('*')
    .eq('is_active', true)
    .order('event_date', { ascending: true });

  const opps = opportunities || [];
  const artistGenres = (artist?.genres || []) as string[];
  const artistState = artist?.state || '';

  // For Starter tier: return limited data (just titles, dates, counts)
  if (platformTier === 'starter') {
    return NextResponse.json({
      opportunities: opps.map(o => ({
        id: o.id,
        title: o.title,
        type: o.type,
        event_date: o.event_date,
        is_online: o.is_online,
        location_state: o.location_state,
        is_featured: o.is_featured,
        // Omit: description, URLs, brief_details, looking_for, registration_url
        locked: true,
      })),
      total: opps.length,
      nearYou: opps.filter(o => o.location_state === artistState).length,
      genreMatches: opps.filter(o => {
        const oppGenres = (o.genres || []) as string[];
        return oppGenres.includes('all') || oppGenres.some((g: string) => artistGenres.includes(g));
      }).length,
    });
  }

  // For Pro+: return full data with matching scores
  const enriched = opps.map(o => {
    const oppGenres = (o.genres || []) as string[];
    const genreMatch = oppGenres.includes('all') || oppGenres.some((g: string) => artistGenres.includes(g));
    const locationMatch = o.is_online || o.location_state === artistState;
    const isExpired = o.deadline ? new Date(o.deadline) < new Date() : (o.event_date ? new Date(o.event_date) < new Date() : false);

    return {
      ...o,
      genreMatch,
      locationMatch,
      isExpired,
      locked: false,
    };
  }).filter(o => !o.isExpired); // Hide expired

  // Sort: featured first, then location matches, then date
  enriched.sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    if (a.locationMatch !== b.locationMatch) return a.locationMatch ? -1 : 1;
    return new Date(a.event_date || '').getTime() - new Date(b.event_date || '').getTime();
  });

  // For Label+: add "recommended" flag for genre + location matches
  if (platformTier === 'label' || platformTier === 'empire') {
    enriched.forEach(o => {
      (o as any).recommended = o.genreMatch && o.locationMatch;
    });
  }

  return NextResponse.json({
    opportunities: enriched,
    total: enriched.length,
    nearYou: enriched.filter(o => o.locationMatch).length,
    genreMatches: enriched.filter(o => o.genreMatch).length,
  });
}
