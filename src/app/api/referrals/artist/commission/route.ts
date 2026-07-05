import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  const { artistId, commissionRate } = await req.json();

  if (!artistId || commissionRate === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // The admin client below bypasses RLS, so ownership must be checked explicitly —
  // otherwise any caller could set any artist's commission rate.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: owned } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!owned) {
    return NextResponse.json({ error: 'Not your artist profile' }, { status: 403 });
  }

  // Validate: 0-50% range
  const rate = Math.min(50, Math.max(0, Math.round(Number(commissionRate))));

  const { error } = await supabaseAdmin
    .from('artist_profiles')
    .update({ referral_commission_rate: rate })
    .eq('id', artistId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, commissionRate: rate });
}
