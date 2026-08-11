// /api/fan-campaigns — the artist's own drives. GET reads, POST creates.
//
// SECURITY: the artist is resolved FROM THE SESSION and there is no artistId parameter, matching
// /api/artist/constraint, /api/campaign-hub and /api/action-plan. Middleware skips /api/, so this
// route authenticates itself. A client-supplied id is never read, so artist A cannot name artist B.
//
// THE CONSTRAINT GATE IS SERVER-SIDE AND IS NOT ADVISORY. Creating a drive is REFUSED when the
// canonical diagnosis is one a campaign must not answer (fulfillment, retention) or when there is no
// diagnosis at all. Putting that check only in the UI would make it a suggestion.
//
// THIS ROUTE IS A READER OF THE CONSTRAINT ENGINE, NEVER A SECOND ISSUER (Z3/Z4). It calls
// `readConstraint` to decide eligibility and deliberately does NOT call
// `recordIssuedRecommendation`: only /api/artist/constraint issues, so a diagnosis surfaced here and
// on the dashboard is still ONE logical recommendation with one durable identity. The campaign row
// stores that existing identity (`recommendation_action_key`) rather than minting a new one.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { assembleConstraintEvidence } from '@/lib/constraint/assembler';
import { readConstraint } from '@/lib/constraint/engine';
import { actionKeyFor } from '@/lib/constraint/recommendationOutcome';
import { isDiagnosed } from '@/lib/constraint/types';
import { archetypeFor } from '@/lib/campaigns/archetypes';
import { campaignOfferFor } from '@/lib/campaigns/eligibility';
import { checkLaunchReady } from '@/lib/campaigns/lifecycle';
import {
  createCampaign,
  listArtistCampaigns,
  readCampaignResults,
  type CampaignRow,
} from '@/lib/campaigns/store';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** How many campaigns get a full results assembly per request. Older ones list without one. */
const RESULTS_BUDGET = 6;

async function resolveArtist(): Promise<{
  artistId: string;
  userId: string;
  slug: string | null;
} | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // NOTE: never `select('*')` here. `artist_profiles` carries SELECT-revoked columns
  // (stripe_connect_id and friends) and naming one from a session client fails the ENTIRE
  // statement with 42501, which reads as "not found".
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) return null;
  return { artistId: artist.id as string, userId: user.id, slug: (artist.slug as string) ?? null };
}

/** The canonical diagnosis, read and never issued. */
async function readOffer(artistId: string, userId: string) {
  try {
    const evidence = await assembleConstraintEvidence(supabaseAdmin, { artistId, userId });
    const result = readConstraint(evidence);
    return { offer: campaignOfferFor(result), result };
  } catch (err) {
    console.error('campaign eligibility read failed:', err);
    // Fail CLOSED. A dropped constraint read must never become permission to run a growth drive
    // during a fulfillment crisis.
    return { offer: campaignOfferFor(null), result: null };
  }
}

export async function GET() {
  const artist = await resolveArtist();
  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const campaigns = await listArtistCampaigns(supabaseAdmin, artist.artistId);
  const { offer } = await readOffer(artist.artistId, artist.userId);

  const withResults = await Promise.all(
    campaigns.slice(0, RESULTS_BUDGET).map(async (c) => ({
      campaign: c,
      archetype: archetypeFor(c.archetype),
      results: await readCampaignResults(supabaseAdmin, c),
    })),
  );

  return NextResponse.json({
    slug: artist.slug,
    offer: {
      eligible: offer.eligible,
      reason: offer.reason,
      constraint: offer.constraint,
      archetype: offer.archetype,
      canonicalAction: offer.canonicalAction,
    },
    campaigns: withResults,
    olderCampaigns: campaigns.slice(RESULTS_BUDGET).map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      created_at: c.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const artist = await resolveArtist();
  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  let body: {
    archetype?: string;
    title?: string;
    endsAt?: string;
    toolkit?: Record<string, string>;
    launch?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const archetype = archetypeFor(body.archetype);
  if (!archetype) {
    return NextResponse.json({ error: 'That campaign type does not exist.' }, { status: 400 });
  }

  const { offer, result } = await readOffer(artist.artistId, artist.userId);
  if (!offer.eligible || offer.archetype?.key !== archetype.key) {
    return NextResponse.json(
      { error: offer.reason, constraint: offer.constraint, canonicalAction: offer.canonicalAction },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const draft = {
    archetype: archetype.key,
    title: String(body.title ?? '').trim(),
    endsAt: String(body.endsAt ?? ''),
    toolkit: body.toolkit ?? {},
  };

  // A drive may be SAVED incomplete. It may never LAUNCH incomplete: a participant who opens a
  // campaign and finds a blank page does nothing, and the artist reads that as their fans not
  // caring.
  const launch = body.launch !== false;
  if (launch) {
    const readiness = checkLaunchReady(draft, { now, artistSlug: artist.slug });
    if (!readiness.ok) {
      return NextResponse.json(
        { error: readiness.problems[0], problems: readiness.problems, emptyRequiredSlots: readiness.emptyRequiredSlots },
        { status: 400 },
      );
    }
  } else if (!draft.title) {
    return NextResponse.json({ error: 'The campaign needs a title.' }, { status: 400 });
  }

  const created = await createCampaign(supabaseAdmin, {
    artistId: artist.artistId,
    archetype: archetype.key,
    title: draft.title,
    endsAt: draft.endsAt || new Date(Date.now() + 14 * 86_400_000).toISOString(),
    toolkit: draft.toolkit,
    // Z3 linkage: the constraint that was standing, and Z3's OWN durable action identity.
    sourceConstraint: offer.constraint,
    recommendationActionKey:
      result && isDiagnosed(result)
        ? actionKeyFor(result.constraint, result.action.verifiedBy ?? null)
        : null,
    launch,
    now,
  });

  if (created.error || !created.campaign) {
    return NextResponse.json({ error: created.error ?? 'Could not create the drive.' }, { status: 400 });
  }

  return NextResponse.json({ campaign: created.campaign satisfies CampaignRow });
}
