import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { conversationRole } from '@/lib/messaging';
import {
  signAudioValue,
  storagePathFromAudioValue,
  isVoiceNotePath,
  SIGNED_URL_TTL_SECONDS,
} from '@/lib/storage/signedAudio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const MAX_IDS = 50;

/**
 * POST /api/messages/[conversationId]/voice-urls   { ids: string[] }
 *   -> { urls: { [messageId]: signedUrl } }
 *
 * Voice notes live in the private `audio` bucket under `voice/<uid>/...`, so
 * `dm_messages.audio_url` holds a storage path, not a link.
 *
 * This exists as its own endpoint rather than signing inside the thread GET
 * because realtime delivers rows straight from Postgres to the client, carrying
 * the raw path and never passing through an API route. One lazy resolver covers
 * both arrival paths; signing in GET/POST/broadcast would have covered neither
 * the realtime insert nor the other two routes without triplicating the logic.
 *
 * Membership is proven before anything is signed, and the id list is constrained
 * to this conversation, so a participant cannot sign another thread's audio by
 * passing its message ids.
 *
 * Membership is not enough on its own. This route signs with the SERVICE ROLE,
 * so it also refuses to sign anything that is not shaped like a voice note
 * (`voice/<uploader uuid>/<file>`). The write gate in /api/messages already
 * refuses to store anything else, so this is the second lock: a row written
 * before that gate existed, or by any future path, cannot turn a track master
 * key into a signed URL (SEC-009).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await conversationRole(supabaseAdmin, user.id, conversationId);
  if (!role) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let ids: unknown;
  try {
    ({ ids } = await req.json());
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ urls: {} });
  }
  const wanted = ids.filter((i): i is string => typeof i === 'string').slice(0, MAX_IDS);

  // Scoped to THIS conversation, so foreign message ids simply do not come back.
  const { data: rows } = await supabaseAdmin
    .from('dm_messages')
    .select('id, audio_url')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .in('id', wanted);

  const urls: Record<string, string> = {};
  await Promise.all(
    (rows || [])
      // Normalize first (a legacy row may hold the old public URL), then sign
      // ONLY a voice-note key. Anything else stays unsigned.
      .map((r) => ({ id: r.id, path: storagePathFromAudioValue(r.audio_url) }))
      .filter((r) => isVoiceNotePath(r.path))
      .map(async (r) => {
        const signed = await signAudioValue(r.path);
        if (signed) urls[r.id] = signed;
      })
  );

  return NextResponse.json(
    { urls, expiresIn: SIGNED_URL_TTL_SECONDS },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
