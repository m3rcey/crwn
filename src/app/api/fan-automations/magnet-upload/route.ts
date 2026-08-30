// Signed R2 upload URL for a lead-magnet file. Owner-authorized.
//
// SEC-009 shape: the KEY IS SERVER-GENERATED under the artist's own prefix; the client names
// only the filename and content type, and the create/edit validator later refuses any key
// outside `<slug>/magnet/`. Delivery is always a short-lived signed download minted at claim
// time, so the file never gets a durable public URL (the products.file_url weakness this
// deliberately does not inherit).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { getSignedUploadUrl } from '@/lib/r2/client';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ALLOWED_TYPES = new Set([
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac',
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'image/jpeg', 'image/png', 'image/webp', 'video/mp4',
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const artistId = typeof body.artistId === 'string' ? body.artistId : '';
    const filename = typeof body.filename === 'string' ? body.filename.slice(0, 160) : '';
    const contentType = typeof body.contentType === 'string' ? body.contentType : '';
    const owner = await requireArtistOwner(artistId);
    if (!owner.ok) return owner.error;

    if (!filename) return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'That file type is not supported. Use audio, PDF, ZIP, image, or MP4.' }, { status: 400 });
    }

    const { data: artist } = await supabaseAdmin
      .from('artist_profiles').select('slug').eq('id', artistId).maybeSingle();
    if (!artist?.slug) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${artist.slug}/magnet/${Date.now()}-${sanitized}`;
    const uploadUrl = await getSignedUploadUrl(key, contentType, 300);

    return NextResponse.json({ uploadUrl, key, filename: sanitized });
  } catch (err) {
    console.error('[fan-automations] magnet upload error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
