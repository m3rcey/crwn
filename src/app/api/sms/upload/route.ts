import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { MMS_ALLOWED_TYPES, MMS_MAX_FILE_SIZE } from '@/lib/twilio';
import { getSmsLimit } from '@/lib/platformTier';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const artistId = formData.get('artistId') as string | null;

  if (!file || !artistId) {
    return NextResponse.json({ error: 'Missing file or artistId' }, { status: 400 });
  }

  // Validate file type
  if (!MMS_ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({
      error: `Invalid file type. Allowed: JPEG, PNG, GIF, WebP`,
    }, { status: 400 });
  }

  // Validate file size (Twilio MMS limit is 5MB)
  if (file.size > MMS_MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large. Max 5MB for MMS.' }, { status: 400 });
  }

  // Verify ownership and tier
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, platform_tier')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  if (getSmsLimit(artist.platform_tier) === 0) {
    return NextResponse.json({ error: 'SMS/MMS requires Pro or higher' }, { status: 403 });
  }

  // Upload to Supabase Storage
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${Date.now()}.${ext}`;
  const path = `${artistId}/mms/${fileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from('album-art')
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
  }

  // Get public URL — Twilio needs a publicly accessible URL to fetch the media
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('album-art')
    .getPublicUrl(path);

  return NextResponse.json({ url: publicUrl });
}
