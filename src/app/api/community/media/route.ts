// POST /api/community/media  { postIds }  ->  { media: { [postId]: (string | null)[] } }
//
// Turns the private media keys on room posts into one-hour signed URLs, for the posts the
// CALLER may read.
//
// The gate is the database, not this route (the /api/tracks/[id]/stream pattern). A
// REQUEST-SCOPED client reads community_posts_feed, whose redaction runs
// can_read_community_post as the caller and returns media_urls only to an entitled reader.
// A NULL media_urls therefore IS the refusal: this route never re-derives entitlement.
//
// SEC-009: signing uses the service role, so a stored key is signed only when it sits in
// the artist's own community prefix AND the post's author is the artist. A fan who wrote a
// wall post on the same page cannot point their post at the artist's private files.
// Public URLs (legacy posts) pass through untouched.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/r2/client';
import { isPrivateMediaKey, signableCommunityKey } from '@/lib/community/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const MAX_POSTS = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_SECONDS = 3600;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids = (Array.isArray(body.postIds) ? body.postIds : [])
    .filter((x: unknown): x is string => typeof x === 'string' && UUID_RE.test(x))
    .slice(0, MAX_POSTS);
  if (!ids.length) return NextResponse.json({ media: {} });

  const supabaseAsCaller = await createServerSupabaseClient();
  // Room posts are never public, so a signed-out reader can never be entitled to a private
  // key. Refusing them here also means the service-role signer below only ever runs for an
  // identified caller.
  const { data: { user } } = await supabaseAsCaller.auth.getUser();
  if (!user) return NextResponse.json({ media: {} });

  const { data: rows, error } = await supabaseAsCaller
    .from('community_posts_feed')
    .select('id, artist_id, author_id, media_urls')
    .in('id', ids);
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 502 });

  const visible = (rows || []).filter((r) => Array.isArray(r.media_urls) && r.media_urls.length > 0);
  if (!visible.length) return NextResponse.json({ media: {} });

  const artistIds = [...new Set(visible.map((r) => r.artist_id as string))];
  const { data: artists } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id')
    .in('id', artistIds);
  const ownerOf = new Map((artists || []).map((a: { id: string; user_id: string }) => [a.id, a.user_id]));

  const media: Record<string, (string | null)[]> = {};
  for (const row of visible) {
    const authoredByArtist = ownerOf.get(row.artist_id) === row.author_id;
    media[row.id] = await Promise.all(
      (row.media_urls as unknown[]).map(async (value) => {
        if (typeof value !== 'string') return null;
        if (!isPrivateMediaKey(value)) return value;
        if (!authoredByArtist || !signableCommunityKey(value, row.artist_id)) return null;
        try {
          return await getSignedDownloadUrl(value, TTL_SECONDS);
        } catch {
          return null;
        }
      }),
    );
  }

  return NextResponse.json({ media, expiresIn: TTL_SECONDS }, { headers: { 'Cache-Control': 'private, no-store' } });
}
