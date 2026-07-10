import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { artistNewPostEmail } from '@/lib/emails/artistNewPost';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// The email body is assembled as raw HTML, so anything that reaches it must be
// escaped. A post preview is plain text by the time a fan types it.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(request: NextRequest) {
  try {
    // This route SENDS MAIL from the CRWN domain. Unauthenticated, it let anyone
    // put arbitrary text into the subject line and the HTML body of an email
    // delivered to any artist. Rate limiting slowed that down; it did not stop it.
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const allowed = await checkRateLimit(user.id, 'artist-new-post-email', 60, 5);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { artistId, postPreview } = await request.json();

    if (!artistId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // The author is whoever is signed in, never a name supplied by the caller.
    const { data: senderProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .maybeSingle();
    const authorName = senderProfile?.display_name || senderProfile?.username || 'A fan';

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

    // artistNewPostEmail() interpolates straight into HTML, so escape here.
    const safePreview = escapeHtml(String(postPreview || '').slice(0, 300));

    await resend.emails.send({
      from: FROM_EMAIL,
      to: artistEmail,
      subject: `New community post from ${authorName} 💬`,
      html: artistNewPostEmail(artistDisplayName, escapeHtml(authorName), safePreview),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Artist new post email failed:', err);
    return NextResponse.json({ error: 'Email failed' }, { status: 500 });
  }
}
