// Artist-facing testimonial API: the private library, feature/hide, and the D4 automation toggle.
//
// AUTHORITY MODEL. The artist is resolved as `artist_profiles.user_id = session.user.id`, and the
// resolved id is what every query filters on. A caller-supplied artistId is never read, so Artist A
// cannot enumerate, feature or hide Artist B's testimonials no matter what they post. Middleware
// excludes /api/ and the service role bypasses RLS, so this route establishes its own authority.
//
// THERE IS NO BODY PARAMETER HERE, on purpose (TESTIMONIAL-001). Visibility ownership is not
// content authorship: the artist decides whether a testimonial is shown, never what it says. The
// database freeze trigger is the second line if this route is ever changed.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  automationEnabled,
  listArtistTestimonials,
  setAutomationEnabled,
  setTestimonialVisibility,
  suppressPendingRequests,
} from '@/lib/testimonials/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** The one ownership resolution. Returns the artist id this SESSION owns, or null. */
async function ownedArtistId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  return data?.id ?? null;
}

/** GET /api/artist/testimonials — the private library plus the automation setting. */
export async function GET() {
  const artistId = await ownedArtistId();
  if (!artistId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [testimonials, enabled] = await Promise.all([
    listArtistTestimonials(supabaseAdmin, artistId),
    automationEnabled(supabaseAdmin, artistId),
  ]);

  return NextResponse.json({
    testimonials,
    automationEnabled: enabled,
    counts: {
      total: testimonials.length,
      publishable: testimonials.filter((t) => t.publishable).length,
      featured: testimonials.filter((t) => t.featured).length,
      verified: testimonials.filter((t) => !!t.verificationLabel).length,
    },
  });
}

/**
 * POST /api/artist/testimonials
 *   { action: 'feature' | 'unfeature' | 'hide' | 'unhide', testimonialId }
 *   { action: 'set-automation', enabled: boolean }
 */
export async function POST(req: Request) {
  const artistId = await ownedArtistId();
  if (!artistId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const action = payload?.action;

  if (action === 'set-automation') {
    const enabled = payload?.enabled === true;
    const ok = await setAutomationEnabled(supabaseAdmin, artistId, enabled);
    if (!ok) return NextResponse.json({ error: 'Could not save that' }, { status: 500 });
    // D4 semantics: OFF suppresses asks that have not been answered yet. It never deletes a
    // submitted testimonial, never unfeatures one, and never revokes consent a fan already gave.
    const suppressed = enabled ? 0 : await suppressPendingRequests(supabaseAdmin, artistId);
    return NextResponse.json({ ok: true, automationEnabled: enabled, suppressed });
  }

  if (!['feature', 'unfeature', 'hide', 'unhide'].includes(action)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (typeof payload?.testimonialId !== 'string') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const result = await setTestimonialVisibility(supabaseAdmin, artistId, payload.testimonialId, action);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
