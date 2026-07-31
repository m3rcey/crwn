import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getConnectAccountByUserId } from '@/lib/stripe/connectAccount';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reconcileStripeConnect, NOT_CONNECTED } from '@/lib/stripe/connectReconcile';

// funnel_events revokes INSERT from `authenticated`, so the funnel write below needs the
// service role. Build-safe fallbacks per CLAUDE.md.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Returns the artist's real Stripe Connect status (charges_enabled), and records the
// `stripe_connected` activation milestone ONLY when the account can actually take money.
// The verify + persist logic lives in reconcileStripeConnect (shared with the roadmap
// route's self-heal), so the truth cannot fork between surfaces.
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    // The account id is read service-side: SELECT on stripe_connect_id is revoked
    // from `authenticated`, so naming it here 42501s the query above and this
    // route answered "not connected" for every artist who is.
    const connectAccountId = artist ? await getConnectAccountByUserId(user.id) : null;

    if (!artist || !connectAccountId) {
      return NextResponse.json(NOT_CONNECTED);
    }

    const state = await reconcileStripeConnect(supabaseAdmin, {
      artistId: artist.id,
      userId: user.id,
      connectAccountId,
    });
    return NextResponse.json(state);
  } catch (error) {
    console.error('Stripe connect status error:', error);
    return NextResponse.json({ ...NOT_CONNECTED, error: 'status_check_failed' }, { status: 200 });
  }
}
