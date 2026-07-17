import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Burst cap (stops a rapid loop) plus a daily cap (stops slow-drip overkill).
  // A fan who gets pinged all day mutes the bell, and a muted fan is a fan you no
  // longer reach. The platform protects the artist's own audience from that here.
  const underBurst = await checkRateLimit(user.id, 'notify-subscribers', 60, 5);
  if (!underBurst) {
    return NextResponse.json({ error: 'Too many notifications at once. Give it a minute.' }, { status: 429 });
  }
  const underDaily = await checkRateLimit(user.id, 'notify-subscribers-daily', 86400, 8);
  if (!underDaily) {
    return NextResponse.json(
      { error: 'You have pinged your fans a lot today. Past this they start tuning the bell out, so save it for what matters. Try again tomorrow.' },
      { status: 429 },
    );
  }

  const body = await req.json();
  const { artistId, type, title, message, link } = body;

  if (!artistId || !type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  // Verify the caller owns this artist profile
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();

  if (!artist) {
    return NextResponse.json({ error: 'Not your artist profile' }, { status: 403 });
  }

  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('fan_id')
    .eq('artist_id', artistId)
    .eq('status', 'active');

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

  return NextResponse.json({ notified: subs.length });
}
