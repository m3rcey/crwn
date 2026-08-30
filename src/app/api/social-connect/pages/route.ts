// Facebook Page picker: list this artist's candidate Pages, activate exactly one.
// Owner-authorized on both verbs; candidate rows are owner-scoped so a foreign
// connectionId resolves to nothing.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import {
  getConnectionById,
  listConnections,
  markConnection,
  saveConnection,
} from '@/lib/fanAutomations/connections';
import { fbSubscribePage } from '@/lib/fanAutomations/metaGraph';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId') || '';
  const owner = await requireArtistOwner(artistId);
  if (!owner.ok) return owner.error;

  const all = await listConnections(supabaseAdmin, artistId);
  return NextResponse.json({
    candidates: all.filter((c) => c.provider === 'facebook' && c.status === 'candidate'),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const artistId = typeof body.artistId === 'string' ? body.artistId : '';
    const connectionId = typeof body.connectionId === 'string' ? body.connectionId : '';
    const owner = await requireArtistOwner(artistId);
    if (!owner.ok) return owner.error;

    const candidate = await getConnectionById(supabaseAdmin, artistId, connectionId);
    if (!candidate || candidate.status !== 'candidate' || candidate.provider !== 'facebook' || !candidate.accessToken) {
      return NextResponse.json({ error: 'That page is not available to connect.' }, { status: 404 });
    }

    const saved = await saveConnection(supabaseAdmin, {
      artistId,
      provider: 'facebook',
      providerAccountId: candidate.providerAccountId,
      providerUsername: candidate.providerUsername,
      accessToken: candidate.accessToken,
      expiresInSeconds: null,
    });
    if (!saved) return NextResponse.json({ error: 'Could not connect that page. Try again.' }, { status: 500 });

    const sub = await fbSubscribePage(candidate.accessToken, candidate.providerAccountId);
    if (sub.ok) await markConnection(supabaseAdmin, saved.id, { webhookSubscribed: true });
    else console.error('[social-connect] FB subscribe (picker) failed:', sub.status, sub.error);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[social-connect] page pick error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
