import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { artistNewPostEmail } from '@/lib/emails/artistNewPost';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const allowed = await checkRateLimit(`ip:${ip}`, 'artist-new-post-email', 60, 5);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { artistId, authorName, postPreview } = await request.json();

    if (!artistId || !authorName) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Get artist user_id
    const { data: artistProfile } = await supabaseAdmin
      .from('artist_profiles')
      .select('user_id')
      .eq('id', artistId)
      .single();

    if (!artistProfile) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // Get artist email
    const { data: { user: artistAuthUser } } = await supabaseAdmin.auth.admin.getUserById(artistProfile.user_id);
    const artistEmail = artistAuthUser?.email;

    if (!artistEmail) {
      return NextResponse.json({ error: 'No artist email' }, { status: 404 });
    }

    // Get artist display name
    const { data: artistNameData } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', artistProfile.user_id)
      .single();
    const artistDisplayName = artistNameData?.display_name || 'there';

    await resend.emails.send({
      from: FROM_EMAIL,
      to: artistEmail,
      subject: `New community post from ${authorName} 💬`,
      html: artistNewPostEmail(artistDisplayName, authorName, postPreview || ''),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Artist new post email failed:', err);
    return NextResponse.json({ error: 'Email failed' }, { status: 500 });
  }
}
