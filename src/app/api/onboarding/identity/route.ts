import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { isReservedSlug } from '@/lib/reservedSlugs';
import { isEmailLike } from '@/lib/publicName';
import { slugify } from '@/lib/slugify';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { welcomeEmail } from '@/lib/emails/welcome';

// Saves the new user's identity (name + role, plus the CRWN link for artists)
// from the setup wizard's first screens. This replaced the /welcome page's
// client-side writes on 2026-07-30, for two reasons:
//
//  1. The browser CANNOT update `profiles` right now: the FOR UPDATE policy's
//     WITH CHECK subqueries read columns that schema-phase2-profiles-column-
//     privileges revoked from `authenticated`, so every client-side profiles
//     update dies with 42501 (this is what broke /welcome's save). The
//     display_name/onboarding_completed write therefore happens here with the
//     service-role client. Auth is enforced explicitly below — the admin client
//     bypasses RLS and middleware skips /api routes.
//  2. The artist_profiles INSERT deliberately stays on the USER-SESSION client:
//     that RLS insert is the exact path the daily onboarding canary
//     (/api/cron/onboarding-health) guards, and it fires trg_promote_to_artist
//     (fan -> artist promotion is server-side; the client must never write role).
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { displayName?: string; role?: string; handle?: string; recruiterCode?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid request.' }, { status: 400 });
  }

  const displayName = (body.displayName || '').trim().slice(0, 80);
  const role = body.role === 'fan' ? 'fan' : 'artist';

  if (!displayName) {
    return NextResponse.json(
      { error: 'invalid_name', message: 'Please enter a name.' },
      { status: 400 }
    );
  }
  // The name is public everywhere, so never let an email through as the artist
  // (or fan) name. Emails leak in via the DB default for display_name.
  if (isEmailLike(displayName)) {
    return NextResponse.json(
      {
        error: 'invalid_name',
        message:
          role === 'artist'
            ? 'Use your artist or stage name here, not your email.'
            : 'Please enter a name, not your email.',
      },
      { status: 400 }
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Don't downgrade an existing artist: if the row exists, they're an artist
  // regardless of what the client sent.
  const { data: existing } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle();
  const effectiveRole = existing ? 'artist' : role;

  let artistId: string | null = existing?.id ?? null;
  let slug: string | null = existing?.slug ?? null;

  if (effectiveRole === 'artist' && !existing) {
    // The handle becomes their permanent public link, so validate it up front
    // instead of silently deriving a bad slug from a legal name.
    const wantedSlug = slugify(body.handle || displayName);
    if (!wantedSlug) {
      return NextResponse.json(
        { error: 'invalid_slug', message: 'Pick a link with at least one letter or number.' },
        { status: 400 }
      );
    }
    if (isReservedSlug(wantedSlug)) {
      return NextResponse.json(
        { error: 'reserved_slug', message: 'That link is reserved. Please choose another.' },
        { status: 400 }
      );
    }

    // Acquisition source from the recruiter code (carried up from localStorage
    // by the client, exactly as /welcome did).
    const recruiterCode = (body.recruiterCode || '').trim() || null;
    let acquisitionSource = 'organic';
    if (recruiterCode) {
      const { data: recruiter } = await supabaseAdmin
        .from('recruiters')
        .select('is_partner')
        .eq('referral_code', recruiterCode)
        .eq('is_active', true)
        .maybeSingle();
      acquisitionSource = recruiter?.is_partner ? 'partner' : 'recruiter';
    }

    // USER-SESSION insert on purpose — see the header comment. This is done
    // BEFORE the profiles update so a taken handle fails clean: nothing written,
    // the wizard stays on the link screen, the artist retries.
    const { data: newArtist, error: insertError } = await supabase
      .from('artist_profiles')
      .insert({
        user_id: user.id,
        slug: wantedSlug,
        acquisition_source: acquisitionSource,
        ...(recruiterCode ? { recruited_by: recruiterCode } : {}),
      })
      .select('id')
      .single();

    if (insertError || !newArtist) {
      if (insertError?.code === '23505') {
        return NextResponse.json(
          { error: 'slug_taken', message: 'That link is already taken. Please choose another.' },
          { status: 409 }
        );
      }
      console.error('Onboarding artist_profiles insert failed:', insertError);
      return NextResponse.json(
        { error: 'save_failed', message: 'Something went wrong creating your page. Please try again.' },
        { status: 500 }
      );
    }
    artistId = newArtist.id;
    slug = wantedSlug;
  }

  // Was onboarding already completed once? Drives the one-time welcome email.
  const { data: prof } = await supabaseAdmin
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();
  const firstCompletion = !prof?.onboarding_completed;

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ display_name: displayName, onboarding_completed: true })
    .eq('id', user.id);

  if (profileError) {
    console.error('Onboarding profile update failed:', profileError);
    return NextResponse.json(
      { error: 'save_failed', message: 'Something went wrong saving your info. Please try again.' },
      { status: 500 }
    );
  }

  // Welcome email, once, on the completion that actually saved a name. This
  // moved here from /welcome's mount effect, which re-sent on every visit and
  // greeted people by the email-derived seed name instead of the name they chose.
  if (firstCompletion && user.email) {
    resend.emails
      .send({
        from: FROM_EMAIL,
        to: user.email,
        subject: 'Welcome to CRWN 👑',
        html: welcomeEmail(displayName.split(' ')[0] || 'there'),
      })
      .catch((e) => console.error('Welcome email failed:', e));
  }

  return NextResponse.json({ success: true, role: effectiveRole, artistId, slug });
}
