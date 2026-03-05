import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return NextResponse.json({ userId: user?.id || 'not authenticated' });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const fanId = user?.id;
  
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('fan_id', fanId)
    .eq('artist_id', body.artistId)
    .eq('status', 'active');

  return NextResponse.json({ fanId, artistId: body.artistId, subscriptions: data, error });
}
