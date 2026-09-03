// GET /api/tier-benefits/readiness — the Promise to Delivery panel's one read.
//
// Authority: the SESSION. The artist is resolved from auth.uid() -> artist_profiles.user_id
// and nothing in the request names an artist, a tier, or a benefit. Every table read is
// scoped to that artist id inside loadDeliveryReport (src/lib/benefitReadinessFacts.ts), and
// the reads run through the service role only because member_files and a few flag columns
// are revoked from the authenticated role.
//
// The response is counts and dates (see benefitReadiness.ts). No object key, file name,
// signed URL, fan identity or price leaves this route. Readiness is a report on the
// entitlement fields; it never writes one and never widens one.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadDeliveryReport } from '@/lib/benefitReadinessFacts';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await admin
    .from('artist_profiles')
    .select('id, slug, song_lab_enabled')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: 'No artist profile' }, { status: 403 });

  const report = await loadDeliveryReport(admin, {
    id: artist.id as string,
    slug: (artist.slug as string) || null,
    song_lab_enabled: (artist as { song_lab_enabled?: boolean | null }).song_lab_enabled,
  });

  return NextResponse.json({
    artistSlug: artist.slug ?? null,
    tiers: report.tiers,
    rows: report.rows,
  });
}
