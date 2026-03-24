import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Gather all artist relationships
  const [{ data: subs }, { data: earnings }, { data: smsSubs }] = await Promise.all([
    supabaseAdmin
      .from('subscriptions')
      .select('artist_id')
      .eq('fan_id', user.id),
    supabaseAdmin
      .from('earnings')
      .select('artist_id')
      .eq('fan_id', user.id),
    supabaseAdmin
      .from('sms_subscribers')
      .select('artist_id')
      .eq('fan_id', user.id)
      .eq('status', 'active'),
  ]);

  const artistIds = new Set<string>();
  (subs || []).forEach(s => artistIds.add(s.artist_id));
  (earnings || []).forEach(e => artistIds.add(e.artist_id));
  (smsSubs || []).forEach(s => artistIds.add(s.artist_id));

  if (artistIds.size === 0) {
    return NextResponse.json({ success: true, count: 0 });
  }

  // Opt out of email + SMS marketing for every artist
  const upserts = Array.from(artistIds).map(artist_id => ({
    fan_id: user.id,
    artist_id,
    email_marketing: false,
    sms_marketing: false,
    updated_at: new Date().toISOString(),
  }));

  await supabaseAdmin
    .from('fan_communication_prefs')
    .upsert(upserts, { onConflict: 'fan_id,artist_id' });

  // Unsubscribe all active SMS subscriptions
  await supabaseAdmin
    .from('sms_subscribers')
    .update({ status: 'unsubscribed', opted_out_at: new Date().toISOString() })
    .eq('fan_id', user.id)
    .eq('status', 'active');

  return NextResponse.json({ success: true, count: artistIds.size });
}
