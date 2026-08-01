// GET /api/stripe/platform-status — the artist's REAL platform plan.
//
// The billing screen used to read artist_profiles directly, which meant a stale
// row (a paid tier whose Stripe subscription no longer exists) displayed as a
// live plan forever: portal errors, cancel 404s, and the plan picker greys out a
// plan the artist is not actually paying for. This route asks Stripe and
// corrects the row before answering, the same self-healing pattern the Connect
// status route uses.
//
// Middleware skips /api/, so this authenticates itself.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reconcilePlatformPlan } from '@/lib/stripe/platformPlanReconcile';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Ownership comes from the session, never from a query param.
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

  const state = await reconcilePlatformPlan(supabaseAdmin, artist.id as string);
  if (!state) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

  return NextResponse.json(state);
}
