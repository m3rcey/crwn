// THE only route to a member file's bytes.
//
// Order matters and is deliberate: authenticate, load the bundle server-side, resolve the
// caller's LIVE tier for the bundle's OWN artist, then check entitlement, and only then
// mint a short-lived signed URL. The fan supplies a bundle id and a file index; they never
// supply an artist, a tier, or a key.
//
// Why an index and not a key: if the request carried the key, possession of a key would be
// the capability, and keys leak (logs, screenshots, a shared payload). Here a key never
// leaves the server at all — the index is resolved against the row the server just loaded.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/r2/client';
import { checkRateLimit } from '@/lib/rateLimit';
import { activeTierFor } from '@/lib/memberFiles/server';
import { checkFileAccess, type MemberFileEntry } from '@/lib/memberFiles/core';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id') || '';
  const index = Number(req.nextUrl.searchParams.get('i') ?? '0');
  if (!id || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const allowed = await checkRateLimit(user.id, 'member-file-download', 3600, 120);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { data: bundle, error } = await supabaseAdmin
    .from('member_files')
    .select('id, artist_id, files, allowed_tier_ids, is_active')
    .eq('id', id)
    .maybeSingle();

  if (error || !bundle) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The artist's own files are always reachable to them; everyone else needs a live tier.
  const { data: ownerRow } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('id', bundle.artist_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!ownerRow) {
    // Tier is read for the OWNING artist, never an artist named by the caller, so a fan's
    // Gold membership with one artist can never unlock another artist's files.
    const tierId = await activeTierFor(supabaseAdmin, bundle.artist_id, user.id);
    const verdict = checkFileAccess(bundle, tierId);
    if (!verdict.ok) {
      return NextResponse.json(
        {
          error: verdict.reason === 'inactive'
            ? 'This is no longer available.'
            : 'This is for members on a higher tier.',
          reason: verdict.reason,
        },
        { status: verdict.reason === 'inactive' ? 404 : 403 },
      );
    }
  }

  const files = (bundle.files || []) as MemberFileEntry[];
  const file = files[index];
  if (!file?.key) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Short-lived and download-dispositioned. Five minutes is enough to start a transfer and
  // short enough that a shared link is worthless by the time it travels.
  const safeName = (file.name || 'file').replace(/[^a-zA-Z0-9 ._-]/g, '_');
  const url = await getSignedDownloadUrl(file.key, 300, safeName);

  return NextResponse.json({ url, name: file.name });
}
