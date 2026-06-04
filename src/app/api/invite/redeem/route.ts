import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

// Service-role client (bypasses RLS) — only used inside this API route.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// POST { code } — redeems an invite code for the logged-in user, approving them
// to create an artist profile. The user id comes from the verified session, NOT
// the request body, so a code can only approve the person actually holding it.
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin.rpc('redeem_invite', {
      p_code: code.trim(),
      p_user: user.id,
    });

    if (error) {
      console.error('redeem_invite error:', error);
      return NextResponse.json({ error: 'Redemption failed' }, { status: 500 });
    }

    // data === true when the code was valid and the user is now approved.
    return NextResponse.json({ approved: data === true });
  } catch (e) {
    console.error('invite/redeem error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
