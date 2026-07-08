import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { newArtistSignupEmail } from '@/lib/emails/newArtistSignup';
import { artistWelcomeEmail } from '@/lib/emails/artistWelcome';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const ADMIN_NOTIFY_EMAIL = 'joshn.wms@gmail.com';

// Called server-side by the artist_profiles INSERT trigger (pg_net), NOT the browser.
// Authenticated by a shared secret header, since there's no user session here.
// Payload: { user_id, slug, recruited_by } from the newly-inserted row.
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-webhook-secret');
    const expected = process.env.NEW_ARTIST_WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user_id, slug, recruited_by } = await req.json();
    if (!slug) {
      return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    }

    // Skip the synthetic onboarding-health canary (it inserts + deletes a row daily).
    if (slug.startsWith('__canary')) {
      return NextResponse.json({ ok: true, skipped: 'canary' });
    }

    let displayName = slug;
    if (user_id) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('display_name')
        .eq('id', user_id)
        .single();
      if (profile?.display_name) displayName = profile.display_name;
    }

    const email = newArtistSignupEmail({
      name: displayName,
      slug,
      recruiterCode: recruited_by || null,
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_NOTIFY_EMAIL,
      subject: email.subject,
      html: email.html,
    });

    // Personal welcome from Josh to the artist, with the Cal.com onboarding-call
    // link. Best-effort: a failure here must NOT fail the founder notify above.
    if (user_id) {
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(user_id);
        const artistEmail = authUser?.user?.email;
        if (artistEmail) {
          const welcome = artistWelcomeEmail({ name: displayName });
          await resend.emails.send({
            from: 'Josh at CRWN <hello@thecrwn.app>',
            replyTo: 'joshn.wms@gmail.com',
            to: artistEmail,
            subject: welcome.subject,
            html: welcome.html,
          });
        }
      } catch (welcomeErr) {
        console.error('new-artist-hook: artist welcome email failed:', welcomeErr);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('new-artist-hook error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
