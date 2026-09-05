// POST /api/fan-campaigns/[id]/winner — RECORD an already-determined winner.
//
// THIS ROUTE DOES NOT CHOOSE A WINNER. It writes down the result of a selection that happened
// under the artist's own Official Rules, outside the product. There is no randomness here, no
// ranking, no eligibility judgement and no reading of anyone's spend. See
// src/lib/campaigns/winnerSelection.ts for why that boundary is where it is.
//
// SECURITY: the artist comes from the SESSION. The campaign id in the URL is a POINTER that is
// matched against that artist, so artist A naming artist B's campaign gets 404 (the anti-IDOR
// shape the sibling PATCH route already uses). The fan id in the body is also only a pointer:
// it is accepted solely as "which of THIS campaign's participants", and a fan who never entered
// cannot be recorded, because the write is an UPDATE of an existing participation row.
//
// A fan cannot reach this route at all: they have no artist_profiles row, so they stop at 403.
// And they cannot reach the column another way either, because it is frozen by a database
// trigger against anon and authenticated (schema-phase3-campaign-winner-selection.sql).
//
// APPEND-ONLY. There is deliberately no PATCH and no DELETE. A recorded winner cannot be
// changed here, and the database refuses it too; a legal correction is a deliberate act on a
// direct connection, not a button.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readCampaign, recordCampaignWinner, selectedWinner } from '@/lib/campaigns/store';
import { canRecordWinner } from '@/lib/campaigns/winnerSelection';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const campaign = await readCampaign(supabaseAdmin, id);
  if (!campaign || campaign.artist_id !== artist.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const gate = canRecordWinner(campaign.status);
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 409 });

  let body: { fanId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const fanId = typeof body.fanId === 'string' ? body.fanId.trim() : '';
  if (!UUID.test(fanId)) return NextResponse.json({ error: 'A participant is required.' }, { status: 400 });

  const already = await selectedWinner(supabaseAdmin, campaign.id);
  if (already && already.fan_id !== fanId) {
    return NextResponse.json({ error: 'This campaign already has a recorded winner.' }, { status: 409 });
  }

  const result = await recordCampaignWinner(supabaseAdmin, campaign.id, fanId, new Date().toISOString());
  if (!result.recorded) {
    const status = result.reason === 'winner_already_selected' ? 409 : result.reason === 'not_a_participant' ? 404 : 400;
    const error =
      result.reason === 'winner_already_selected' ? 'This campaign already has a recorded winner.'
      : result.reason === 'not_a_participant' ? 'That fan did not take part in this campaign.'
      : result.reason === 'not_supported' ? 'Winner recording is not switched on yet.'
      : 'Could not record the winner.';
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ recorded: true, alreadyWinner: result.alreadyWinner });
}
