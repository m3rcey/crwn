// POST /api/fan-campaigns/join — a fan joins a drive.
//
// SECURITY: the participant is the SESSION USER and nothing else. There is no fanId parameter, so
// fan A cannot enrol fan B or move fan B's participation. The campaign is loaded server-side and
// its state is checked there, so a closed drive cannot be joined by replaying an old request.
//
// IDEMPOTENT. UNIQUE (campaign_id, fan_id) is the guarantee; a double submit reports
// already-joined rather than creating a second participation.
//
// JOINING IS NOT AN OUTCOME. It records that someone volunteered. It is never counted as a share,
// a referral or a new fan, and the results reader keeps the two apart on purpose.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { archetypeFor } from '@/lib/campaigns/archetypes';
import { canJoin } from '@/lib/campaigns/lifecycle';
import { joinCampaign, readCampaign } from '@/lib/campaigns/store';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to join.' }, { status: 401 });

  const allowed = await checkRateLimit(user.id, 'campaign-join', 60, 10);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: { campaignId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!body.campaignId) return NextResponse.json({ error: 'Missing campaign' }, { status: 400 });

  const campaign = await readCampaign(supabaseAdmin, body.campaignId);
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const archetype = archetypeFor(campaign.archetype);
  if (!archetype) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('user_id')
    .eq('id', campaign.artist_id)
    .maybeSingle();

  const verdict = canJoin(
    {
      status: campaign.status,
      endsAt: campaign.ends_at,
      artistUserId: (artist?.user_id as string) ?? '',
    },
    user.id,
    new Date().toISOString(),
  );
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 409 });

  // The role comes from the ARCHETYPE, never from the request. A role is descriptive and never
  // authorizes anything, but a client-chosen string would still let anyone write whatever they
  // liked into the artist's participant list.
  const role = archetype.acceptedRoles[0] ?? 'recruiter';

  const result = await joinCampaign(supabaseAdmin, campaign.id, user.id, role);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ joined: true, alreadyJoined: result.alreadyJoined, role });
}
