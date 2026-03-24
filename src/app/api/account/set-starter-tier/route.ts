import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Only allow setting starter tier — paid tiers go through Stripe checkout
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('platform_tier')
    .eq('user_id', user.id)
    .single();

  if (!artist) {
    return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });
  }

  // Only allow if they don't already have a paid tier via Stripe
  // (starter is the default/free tier — no Stripe subscription needed)
  const { error: e1 } = await supabaseAdmin
    .from('artist_profiles')
    .update({ platform_tier: 'starter' })
    .eq('user_id', user.id);

  const { error: e2 } = await supabaseAdmin
    .from('profiles')
    .update({ platform_tier: 'starter' })
    .eq('id', user.id);

  if (e1 || e2) {
    return NextResponse.json({ error: 'Failed to set tier' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
