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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error: e1 } = await supabaseAdmin
    .from('profiles')
    .update({ is_active: false })
    .eq('id', user.id);

  // Also deactivate artist profile if exists
  await supabaseAdmin
    .from('artist_profiles')
    .update({ is_active: false })
    .eq('user_id', user.id);

  if (e1) {
    return NextResponse.json({ error: 'Failed to deactivate' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
