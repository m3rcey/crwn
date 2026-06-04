import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { newArtistSignupEmail } from '@/lib/emails/newArtistSignup';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const ADMIN_NOTIFY_EMAIL = 'joshn.wms@gmail.com';

// POST — pings the founder when the authenticated user just published their first
// artist page. Identity comes from the session, and the details are read server-side,
// so the client can't spoof or trigger this for anyone else.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('slug, recruited_by')
      .eq('user_id', user.id)
      .single();

    if (!artist?.slug) {
      return NextResponse.json({ error: 'No artist profile' }, { status: 404 });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    const email = newArtistSignupEmail({
      name: profile?.display_name || artist.slug,
      slug: artist.slug,
      recruiterCode: artist.recruited_by,
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_NOTIFY_EMAIL,
      subject: email.subject,
      html: email.html,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('new-artist notify error:', e);
    // Best-effort ping — never surface as a user-facing failure.
    return NextResponse.json({ ok: false });
  }
}
