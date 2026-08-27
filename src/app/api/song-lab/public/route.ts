// Song Lab public payload — what an Instagram viewer (or a member) sees on /{slug}/lab.
//
// Public by design: projects, non-draft decisions and aggregate tallies are the marketing
// surface that earns the signup. Individual votes are NEVER returned; the only per-fan
// data is the CALLER'S own votes (session-derived). Drafts and archived projects stay
// invisible, and a non-enabled or unknown slug 404s identically (no enumeration signal).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { songLabArtistBySlug } from '@/lib/songLab/access';
import { effectiveStatus, tally, type DecisionOption, type SongLabDecisionCore } from '@/lib/songLab/core';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('artist') || '';
  const artist = await songLabArtistBySlug(supabaseAdmin, slug);
  if (!artist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date();

  const [{ data: projects }, { data: decisions }] = await Promise.all([
    supabaseAdmin
      .from('song_lab_projects')
      .select('id, title, artwork_url, status, next_note, created_at')
      .eq('artist_id', artist.artistId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('song_lab_decisions')
      .select('id, project_id, stage_label, question, options, status, is_free, allowed_tier_ids, opens_at, closes_at, winning_option_id, created_at, closed_at')
      .eq('artist_id', artist.artistId)
      .neq('status', 'draft')
      .order('created_at', { ascending: true }),
  ]);

  const decisionIds = (decisions || []).map((d) => d.id);
  let votes: Array<{ decision_id: string; option_id: string; fan_id: string }> = [];
  if (decisionIds.length) {
    const { data: v } = await supabaseAdmin
      .from('song_lab_votes')
      .select('decision_id, option_id, fan_id')
      .in('decision_id', decisionIds);
    votes = v || [];
  }

  // The caller's own membership + votes, session-derived only.
  let myVotes: Record<string, string> = {};
  let myTierId: string | null = null;
  let signedIn = false;
  let isOwner = false;
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      signedIn = true;
      myVotes = Object.fromEntries(
        votes.filter((v) => v.fan_id === user.id).map((v) => [v.decision_id, v.option_id]),
      );
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('tier_id')
        .eq('fan_id', user.id)
        .eq('artist_id', artist.artistId)
        .eq('status', 'active')
        .maybeSingle();
      myTierId = sub?.tier_id ?? null;
      // Is this the artist looking at their own Lab? Used only to stop offering them a
      // vote button the server would refuse; the bar itself lives in checkVote.
      isOwner = user.id === artist.userId;
    }
  } catch {
    // anonymous view is fine
  }

  const participantIds = new Set(votes.map((v) => v.fan_id));

  // The artist's free tier, so the Lab can offer a one-tap free join in place
  // (the join itself still goes through the canonical authorized route).
  const { data: freeTier } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id')
    .eq('artist_id', artist.artistId)
    .eq('is_active', true)
    .eq('price', 0)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const shaped = (decisions || []).map((d) => {
    const core = d as unknown as SongLabDecisionCore;
    const options = (d.options || []) as DecisionOption[];
    const dVotes = votes.filter((v) => v.decision_id === d.id);
    const t = tally(options, dVotes);
    const eff = effectiveStatus(core, now);
    return {
      id: d.id,
      projectId: d.project_id,
      stageLabel: d.stage_label,
      question: d.question,
      options,
      status: eff,
      isFree: d.is_free,
      allowedTierIds: d.allowed_tier_ids,
      opensAt: d.opens_at,
      closesAt: d.closes_at,
      winningOptionId: d.winning_option_id,
      totalVotes: t.total,
      // Counts are shown once a decision is CLOSED (the reveal). While open, only the
      // total rides along, so the Instagram-style "don't anchor the vote" dynamic holds.
      counts: eff === 'closed' ? t.counts : null,
      myVote: myVotes[d.id] ?? null,
      eligible: d.is_free || (!!myTierId && Array.isArray(d.allowed_tier_ids) && (d.allowed_tier_ids as string[]).includes(myTierId)),
    };
  });

  return NextResponse.json({
    artist: { slug: artist.slug },
    projects: projects || [],
    decisions: shaped,
    participantCount: participantIds.size,
    freeTierId: freeTier?.id ?? null,
    viewer: { signedIn, isMember: !!myTierId, isOwner, participatedCount: Object.keys(myVotes).length },
  });
}
