import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { sendNewArtistAlerts } from '@/lib/newArtistAlert';
import { isEmailLike } from '@/lib/publicName';

/**
 * Founder alert for an artist page created from the BROWSER (ArtistProfileForm on
 * /account/profile, a fan becoming an artist after setup). The setup wizard's path does
 * not call this: /api/onboarding/identity creates the row server-side and alerts itself.
 *
 * Authority is the session. The route reads the CALLER'S OWN artist row and takes nothing
 * from the request body, and it only alerts for a row created in the last 10 minutes, so
 * it cannot be used to announce someone else or to re-announce an old page.
 */
const FRESH_MS = 10 * 60 * 1000;

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('slug, created_at, recruited_by')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist?.slug) return NextResponse.json({ ok: false, reason: 'no_artist' }, { status: 404 });
  if (Date.now() - new Date(artist.created_at).getTime() > FRESH_MS) {
    return NextResponse.json({ ok: false, reason: 'not_new' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  const sent = await sendNewArtistAlerts({
    slug: artist.slug,
    displayName: profile?.display_name && !isEmailLike(profile.display_name) ? profile.display_name : artist.slug,
    recruitedBy: artist.recruited_by,
    artistEmail: user.email,
  });
  return NextResponse.json({ ok: true, ...sent });
}
