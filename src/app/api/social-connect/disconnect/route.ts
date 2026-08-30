// Disconnect a provider for the signed-in artist owner. Marks the connection disconnected
// (the webhook stops resolving it immediately) and pauses every automation that rode it, so
// the list screen tells the truth instead of showing "active" automations that can never fire.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { getActiveConnection, markConnection } from '@/lib/fanAutomations/connections';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const artistId = typeof body.artistId === 'string' ? body.artistId : '';
    const provider = body.provider === 'facebook' ? 'facebook' : body.provider === 'instagram' ? 'instagram' : null;
    if (!provider) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });

    const owner = await requireArtistOwner(artistId);
    if (!owner.ok) return owner.error;

    const connection = await getActiveConnection(supabaseAdmin, artistId, provider);
    if (!connection) return NextResponse.json({ ok: true, wasConnected: false });

    await markConnection(supabaseAdmin, connection.id, { status: 'disconnected', webhookSubscribed: false });
    await supabaseAdmin
      .from('fan_automations')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('artist_id', artistId)
      .eq('connection_id', connection.id)
      .eq('status', 'active');

    return NextResponse.json({ ok: true, wasConnected: true });
  } catch (err) {
    console.error('[social-connect] disconnect error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
