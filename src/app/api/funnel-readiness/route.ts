// GET /api/funnel-readiness: "is my funnel whole?", for the Test and Launch guided flows.
//
// Authority: the SESSION. Nothing in the request names an artist. The reads are the same
// loaders the Quest Engine's funnel checks and the roadmap use (funnelReadinessFacts), judged
// by the same pure module (funnelReadiness), so the checklist an artist reads is exactly what
// completes the quest. The response carries the funnel's public token for the owner, because
// the token IS the link the Launch flow hands out; it is a pointer to the artist's own row,
// never authority over anything.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { assessFunnel } from '@/lib/funnelReadiness';
import { loadFunnelFacts } from '@/lib/funnelReadinessFacts';
import { PUBLIC_ORIGIN } from '@/lib/publicOrigin';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: 'No artist profile' }, { status: 403 });

  const facts = await loadFunnelFacts(supabaseAdmin, artist.id as string);
  const a = assessFunnel(facts);
  const primary = a.primaryTierId ? facts.tiers.find((t) => t.id === a.primaryTierId) ?? null : null;

  return NextResponse.json({
    checks: a.checks,
    readyForTraffic: a.readyForTraffic,
    activationBlockers: a.activationBlockers.map((c) => c.key),
    nextFlow: a.nextFlow,
    funnel: a.funnel
      ? {
          id: a.funnel.id,
          status: a.funnel.status,
          publicToken: a.funnel.public_token,
          url: a.funnel.public_token ? `${PUBLIC_ORIGIN}/drop/${a.funnel.public_token}` : null,
        }
      : null,
    primaryTier: primary ? { id: primary.id, name: primary.name, price: primary.price } : null,
    artistSlug: (artist.slug as string) || null,
  });
}
