// Recent posts for the automation wizard's post picker. Owner-authorized; the token is
// used server-side and only post metadata (id, caption snippet, thumbnail, permalink)
// reaches the browser. Provider ids are the stored identifiers; thumbnails are display-only.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { getActiveConnection } from '@/lib/fanAutomations/connections';
import { igRecentMedia, fbRecentPosts } from '@/lib/fanAutomations/metaGraph';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId') || '';
  const providerRaw = req.nextUrl.searchParams.get('provider');
  const provider = providerRaw === 'facebook' ? 'facebook' : providerRaw === 'instagram' ? 'instagram' : null;
  if (!provider) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });

  const owner = await requireArtistOwner(artistId);
  if (!owner.ok) return owner.error;

  const connection = await getActiveConnection(supabaseAdmin, artistId, provider);
  if (!connection?.accessToken) {
    return NextResponse.json({ error: 'Connect this account first.' }, { status: 409 });
  }

  const result = provider === 'instagram'
    ? await igRecentMedia(connection.accessToken)
    : await fbRecentPosts(connection.accessToken, connection.providerAccountId);

  if (!result.ok || !result.data) {
    console.error('[social-connect] media list failed:', provider, result.status, result.error);
    return NextResponse.json({ error: 'Could not load your recent posts. Try again.' }, { status: 502 });
  }
  return NextResponse.json({ posts: result.data });
}
