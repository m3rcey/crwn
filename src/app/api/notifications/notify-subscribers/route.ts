import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { artistId, type, title, message, link } = body;
  console.log('Notify subscribers called:', JSON.stringify(body));

  if (!artistId || !type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('fan_id')
    .eq('artist_id', artistId)
    .eq('status', 'active');

  console.log('Subscribers found:', subs?.length || 0);
  if (!subs || subs.length === 0) {
    return NextResponse.json({ notified: 0 });
  }

  const notifications = subs.map(sub => ({
    user_id: sub.fan_id,
    type,
    title,
    message,
    link,
  }));

  const { error } = await supabaseAdmin.from('notifications').insert(notifications);

  if (error) {
    console.error('Notify subscribers error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('Notifications inserted for', subs.length, 'subscribers');
  return NextResponse.json({ notified: subs.length });
}
