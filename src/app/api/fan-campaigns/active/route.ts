// GET /api/fan-campaigns/active?slug=<artist slug> — the fan-facing view of a drive.
//
// DELIBERATELY PUBLIC, and therefore CURATED FIELD BY FIELD. `fan_campaigns` has no public RLS
// policy on purpose: the row carries `source_constraint`, which is private commercial evidence
// ("REACH" means almost nobody visits this page), and RLS is row-level rather than column-level. So
// the public view is assembled here, from an allowlist, exactly as the deliberately-public
// /api/leaderboard is. Adding a field to this payload is a privacy decision, not a convenience.
//
// A DRAFT IS NEVER VISIBLE. An artist planning a drive is planning in private.
//
// The `you` block is the CALLER's own data only, and only when they are signed in: their link,
// whether they joined, and the conversions the referral rail already credits to them. It is never
// another participant's, and there is no ranking of any kind in this response.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { archetypeFor } from '@/lib/campaigns/archetypes';
import { isPubliclyVisible, windowClosed } from '@/lib/campaigns/lifecycle';
import { isParticipant, listParticipants, readActiveCampaign } from '@/lib/campaigns/store';
import { buildReferralUrl, generateReferralCode } from '@/lib/referrals';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, slug, user_id')
    .eq('slug', slug)
    .maybeSingle();
  if (!artist) return NextResponse.json({ campaign: null });

  const campaign = await readActiveCampaign(supabaseAdmin, artist.id as string);
  if (!campaign || !isPubliclyVisible(campaign)) return NextResponse.json({ campaign: null });

  const archetype = archetypeFor(campaign.archetype);
  if (!archetype) return NextResponse.json({ campaign: null });

  const now = new Date().toISOString();
  const closed = windowClosed({ endsAt: campaign.ends_at }, now);

  const participants = await listParticipants(supabaseAdmin, campaign.id);

  // The allowlist. Nothing from the row that is not on this list crosses the wire: no
  // source_constraint, no recommendation_action_key, no artist totals, no other participant.
  const publicCampaign = {
    id: campaign.id,
    title: campaign.title,
    archetypeLabel: archetype.label,
    endsAt: campaign.ends_at,
    closed,
    participantCount: participants.length,
    toolkit: {
      what_to_do: campaign.toolkit?.what_to_do ?? '',
      why_it_matters: campaign.toolkit?.why_it_matters ?? '',
      share_message: campaign.toolkit?.share_message ?? '',
    },
    incentive: archetype.incentive.description,
  };

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ campaign: publicCampaign, you: null });
  }

  const participation = await isParticipant(supabaseAdmin, campaign.id, user.id);

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  // The participant's attribution path is the referral link they ALREADY have. There is no
  // campaign-specific link, no campaign code and no second attribution system: the existing rail
  // decides who referred whom, and the campaign only reads it back.
  const referralUrl = buildReferralUrl(
    artist.slug as string,
    generateReferralCode((profile?.username as string) ?? null, user.id),
  );

  let verifiedPaidConversions: number | null = null;
  if (participation && campaign.starts_at) {
    const { count } = await supabaseAdmin
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artist.id)
      .eq('referrer_fan_id', user.id)
      .gte('created_at', campaign.starts_at)
      .lt('created_at', campaign.ends_at);
    verifiedPaidConversions = count ?? 0;
  }

  return NextResponse.json({
    campaign: publicCampaign,
    you: {
      isArtist: user.id === artist.user_id,
      joined: Boolean(participation),
      role: participation?.role ?? null,
      referralUrl,
      // Paying members the rail credits to this person inside the window. Free joins are absent
      // because CRWN cannot attribute one to anybody, and a 0 there would be a claim it cannot make.
      verifiedPaidConversions,
    },
  });
}
