// PATCH /api/fan-campaigns/[id] — the one mutation route for a campaign's lifecycle.
//
// SECURITY: the artist is resolved from the SESSION, then the campaign is loaded and its
// `artist_id` is compared to it. A campaign id in the URL is therefore not an authorization: artist
// A naming artist B's campaign gets 404, which is the anti-IDOR shape used elsewhere in CRWN.
//
// Every transition is guarded on the state it is coming FROM, both here (nextStatus) and in the
// UPDATE's own `.eq('status', from)`, so a double-click writes once.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkLaunchReady, nextStatus, type CampaignAction } from '@/lib/campaigns/lifecycle';
import { badgeEarners } from '@/lib/campaigns/results';
import {
  awardCampaignBadges,
  readCampaign,
  readCampaignResults,
  transitionCampaign,
  updateDraft,
} from '@/lib/campaigns/store';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ACTIONS: CampaignAction[] = ['launch', 'end', 'archive'];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const campaign = await readCampaign(supabaseAdmin, id);
  // Not-found rather than forbidden: a 403 would confirm the campaign exists.
  if (!campaign || campaign.artist_id !== artist.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: {
    action?: string;
    title?: string;
    endsAt?: string;
    toolkit?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const now = new Date().toISOString();

  // Editing is DRAFT ONLY. An active drive's terms do not change under the people already running
  // it: a participant who was asked for one thing must not find they were measured on another.
  if (!body.action) {
    if (campaign.status !== 'draft') {
      return NextResponse.json({ error: 'A running drive cannot be edited.' }, { status: 409 });
    }
    const ok = await updateDraft(supabaseAdmin, campaign.id, {
      ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
      ...(body.endsAt !== undefined ? { endsAt: String(body.endsAt) } : {}),
      ...(body.toolkit !== undefined ? { toolkit: body.toolkit } : {}),
    });
    return ok
      ? NextResponse.json({ updated: true })
      : NextResponse.json({ error: 'Could not save.' }, { status: 400 });
  }

  const action = body.action as CampaignAction;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const to = nextStatus(campaign.status, action);
  if (!to) {
    return NextResponse.json({ error: 'That is not something this drive can do now.' }, { status: 409 });
  }

  if (action === 'launch') {
    const readiness = checkLaunchReady(
      {
        archetype: campaign.archetype,
        title: campaign.title,
        endsAt: campaign.ends_at,
        toolkit: campaign.toolkit,
      },
      { now, artistSlug: (artist.slug as string) ?? null },
    );
    if (!readiness.ok) {
      return NextResponse.json(
        { error: readiness.problems[0], problems: readiness.problems, emptyRequiredSlots: readiness.emptyRequiredSlots },
        { status: 400 },
      );
    }
  }

  const moved = await transitionCampaign(supabaseAdmin, campaign.id, campaign.status, to, now);
  if (!moved) return NextResponse.json({ error: 'Could not update the drive.' }, { status: 400 });

  // Non-cash recognition, granted once at the close. The rule is the referral rail's own verdict
  // (it already recorded a paying member against this person), never a campaign-invented one, and
  // `awardFanBadge` is idempotent per fan+artist+badge so a repeat end grants nothing new.
  // Named for what it is: how many participants HOLD the badge after this call, not how many rows
  // were inserted. The badge upsert ignores duplicates silently, so "newly granted" is not a number
  // this path can honestly produce, and reporting it as one would overstate a repeat close.
  let promotersRecognized = 0;
  if (to === 'ended') {
    const ended = await readCampaign(supabaseAdmin, campaign.id);
    if (ended) {
      const results = await readCampaignResults(supabaseAdmin, ended);
      promotersRecognized = await awardCampaignBadges(supabaseAdmin, ended, badgeEarners(results));
    }
  }

  return NextResponse.json({ status: to, promotersRecognized });
}
