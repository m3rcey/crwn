// Signed PUT for one member-file object. Artist-only, and the KEY IS MINTED HERE.
//
// The caller supplies a filename, never a key. If a key came from the request an artist
// could write over another artist's audio, or place an object outside their own folder and
// then attach it to a bundle. The returned key is scoped to the caller's own artist id,
// which is also the prefix the create route re-validates against.
//
// The object lands in the PRIVATE R2 bucket, which has no public route, so the key alone
// is not a capability: bytes require a signed URL from the download route, and that route
// checks live entitlement first.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSignedUploadUrl } from '@/lib/r2/client';
import { checkRateLimit } from '@/lib/rateLimit';
import { requireMemberFilesArtist } from '@/lib/memberFiles/server';
import { memberFilePrefix, MAX_FILE_BYTES } from '@/lib/memberFiles/core';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 120) || 'file';
}

export async function POST(req: NextRequest) {
  const auth = await requireMemberFilesArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { filename, contentType, fileSize } = await req.json().catch(() => ({}));
  if (!filename || !contentType) {
    return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 });
  }
  if (typeof fileSize === 'number' && fileSize > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 200MB)' }, { status: 400 });
  }

  const allowed = await checkRateLimit(auth.userId, 'member-file-upload', 3600, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const key = `${memberFilePrefix(auth.artistId)}${Date.now()}-${sanitize(filename)}`;
  const uploadUrl = await getSignedUploadUrl(key, contentType, 600);

  return NextResponse.json({ uploadUrl, key });
}
