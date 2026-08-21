// Create a whole live-show night in one call: the EVENT (a Song Lab project), one poll
// per set (decisions with timezone-aware close times), and the single shared lead magnet
// whose URL becomes the printed QR code.
//
// This is a convenience assembler over the existing routes' rules, not a second model.
// Everything it writes is an ordinary Song Lab row, editable and deletable afterward
// through the same endpoints, and an artist who wants one poll keeps using the old flow.
//
// AUTHORIZATION: requireSongLabArtist. The caller never supplies an artist id, and every
// row is written against their own artist_profiles row.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSongLabArtist } from '@/lib/songLab/server';
import { normalizeOptions, normalizeOfferSlug, offerSlugFromName, MAX_TITLE_LENGTH } from '@/lib/songLab/core';
import { zonedTimeToUtc, isValidTimeZone, DEFAULT_SHOW_TIMEZONE } from '@/lib/songLab/schedule';
import { validateShowWindows, MAX_EVENT_NAME, type LiveShowInput } from '@/lib/songLab/liveShowTemplate';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));

  const eventName = typeof body.eventName === 'string' ? body.eventName.trim() : '';
  if (!eventName || eventName.length > MAX_EVENT_NAME) {
    return NextResponse.json({ error: 'Name the show, for example: St. James Live Sept 26' }, { status: 400 });
  }

  const date = typeof body.date === 'string' ? body.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Pick the date of the show' }, { status: 400 });
  }

  const timeZone = isValidTimeZone(body.timeZone) ? (body.timeZone as string) : DEFAULT_SHOW_TIMEZONE;

  const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!headline || !question || question.length > 300 || headline.length > 140) {
    return NextResponse.json({ error: 'The headline and the question are both required' }, { status: 400 });
  }

  const shows: LiveShowInput[] = Array.isArray(body.shows) ? body.shows.slice(0, 4) : [];
  const windowError = validateShowWindows(shows);
  if (windowError) return NextResponse.json({ error: windowError }, { status: 400 });

  // Every ballot is validated BEFORE anything is written, so a bad second show cannot
  // leave a half-built event behind (there is no transaction across PostgREST calls).
  const ballots = shows.map((s) => normalizeOptions(s.options));
  if (ballots.some((b) => !b)) {
    return NextResponse.json({ error: 'Each show needs 2 to 4 song titles' }, { status: 400 });
  }

  // Who may vote: the artist's own free tier, so the ballot the landing shows is the
  // ballot a free join can actually cast. Same rule the claim route re-checks.
  const { data: freeTier } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id')
    .eq('artist_id', auth.artistId)
    .eq('is_active', true)
    .eq('price', 0)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!freeTier) {
    return NextResponse.json({ error: 'Add a free tier first: the vote enrolls fans into it' }, { status: 409 });
  }

  const slug = normalizeOfferSlug(body.slug) ?? offerSlugFromName(eventName);
  if (!slug) {
    return NextResponse.json({ error: 'That show name has no letters or numbers to make a link from' }, { status: 400 });
  }

  // The link must be free BEFORE the event is built, so a duplicate name fails cleanly
  // instead of orphaning a project.
  const { data: slugTaken } = await supabaseAdmin
    .from('song_lab_offers')
    .select('id')
    .eq('artist_id', auth.artistId)
    .eq('slug', slug)
    .maybeSingle();
  if (slugTaken) {
    return NextResponse.json({ error: 'A link with that name already exists. Change the show name.' }, { status: 409 });
  }

  // 1. The event.
  const projectRow: Record<string, unknown> = {
    artist_id: auth.artistId,
    title: eventName.slice(0, MAX_TITLE_LENGTH),
    status: 'active',
    show_timezone: timeZone,
  };
  let { data: project, error: projectError } = await supabaseAdmin
    .from('song_lab_projects')
    .insert(projectRow)
    .select('id')
    .single();
  if (projectError && (projectError.code === 'PGRST204' || projectError.code === '42703')) {
    // Pre-migration: show_timezone does not exist yet. The event still works; the public
    // "opens at" line falls back to the default zone until the migration is applied.
    delete projectRow.show_timezone;
    ({ data: project, error: projectError } = await supabaseAdmin
      .from('song_lab_projects')
      .insert(projectRow)
      .select('id')
      .single());
  }
  if (projectError || !project) {
    return NextResponse.json({ error: 'Could not create the show' }, { status: 500 });
  }

  // 2. One poll per set, each with its own ballot and its own window.
  const created: Array<{ id: string; label: string; opensAt: string | null; closesAt: string | null }> = [];
  for (let i = 0; i < shows.length; i++) {
    const show = shows[i];
    const opensAt = show.opensAt ? zonedTimeToUtc(date, show.opensAt, timeZone) : null;
    const closesAt = show.closesAt ? zonedTimeToUtc(date, show.closesAt, timeZone) : null;

    const { data: decision, error: decisionError } = await supabaseAdmin
      .from('song_lab_decisions')
      .insert({
        project_id: project.id,
        artist_id: auth.artistId,
        stage_label: (show.label || `Show ${i + 1}`).slice(0, MAX_TITLE_LENGTH),
        question,
        options: ballots[i],
        // Published, not draft: the schedule decides when each one is live, and a draft
        // is invisible to the public resolver by design.
        status: 'open',
        is_free: false,
        allowed_tier_ids: [freeTier.id],
        opens_at: opensAt ? opensAt.toISOString() : null,
        closes_at: closesAt ? closesAt.toISOString() : null,
      })
      .select('id')
      .single();
    if (decisionError || !decision) {
      return NextResponse.json({
        error: `The show was created but ${show.label || `show ${i + 1}`} could not be added. Open it in Studio and add the vote.`,
      }, { status: 500 });
    }
    created.push({
      id: decision.id,
      label: show.label || `Show ${i + 1}`,
      opensAt: opensAt ? opensAt.toISOString() : null,
      closesAt: closesAt ? closesAt.toISOString() : null,
    });
  }

  // 3. ONE lead magnet for the whole night, bound to the PROJECT rather than to a single
  // poll. That binding is what lets one printed QR code follow the night from set to set.
  const { data: offer, error: offerError } = await supabaseAdmin
    .from('song_lab_offers')
    .insert({
      artist_id: auth.artistId,
      slug,
      name: `${eventName} Finale Vote`.slice(0, MAX_TITLE_LENGTH),
      headline,
      description: description || null,
      benefit_kind: 'vote',
      project_id: project.id,
      decision_id: null,
      tier_id: freeTier.id,
      is_active: true,
    })
    .select('id, slug')
    .single();
  if (offerError || !offer) {
    return NextResponse.json({
      error: 'The show and votes were created but the link was not. Add a lead magnet in Studio.',
    }, { status: 500 });
  }

  return NextResponse.json({
    projectId: project.id,
    offerId: offer.id,
    slug: offer.slug,
    path: `/${auth.slug}/join/${offer.slug}`,
    timeZone,
    shows: created,
  });
}
