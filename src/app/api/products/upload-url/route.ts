// Signed PUT for a digital product file. Artist-only, key minted server-side.
//
// Replaces the previous path, which uploaded the file to the PUBLIC media bucket and
// stored its permanent public URL on a row every visitor can read. Nothing had ever
// exercised that (zero products carry a file in production, verified 2026-09-01), so it
// was a latent defect rather than a live leak — but the first paid download would have
// been fetchable by anyone who saw the URL, with no purchase and no account.
//
// The object now lands in the PRIVATE R2 bucket. The stored value is an object KEY, and a
// key is not a capability: there is no public route to the bucket, so bytes require a
// signed URL from the download route, which checks the purchase first.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSignedUploadUrl } from '@/lib/r2/client';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const MAX_PRODUCT_FILE_BYTES = 500 * 1024 * 1024;

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 120) || 'file';
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // The artist is resolved from the SESSION. A caller never names whose folder to write to.
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: 'No artist profile' }, { status: 403 });

  const { filename, contentType, fileSize } = await req.json().catch(() => ({}));
  if (!filename || !contentType) {
    return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 });
  }
  if (typeof fileSize === 'number' && fileSize > MAX_PRODUCT_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 500MB)' }, { status: 400 });
  }

  const allowed = await checkRateLimit(user.id, 'product-file-upload', 3600, 40);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const key = `product-files/${artist.id}/${Date.now()}-${sanitize(filename)}`;
  const uploadUrl = await getSignedUploadUrl(key, contentType, 600);

  return NextResponse.json({ uploadUrl, key });
}
