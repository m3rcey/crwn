import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('username, full_name')
    .eq('id', userId)
    .single();

  if (!profile?.username) {
    return NextResponse.json({ error: 'Username required to become a recruiter' }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from('recruiters')
    .select('id, referral_code')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ id: existing.id, referralCode: existing.referral_code });
  }

  const { data, error } = await supabaseAdmin
    .from('recruiters')
    .insert({
      user_id: userId,
      referral_code: profile.username,
    })
    .select('id, referral_code')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, referralCode: data.referral_code });
}
