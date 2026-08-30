// Daily Instagram token refresh for artist social connections.
//
// Instagram long-lived tokens (Instagram Login) expire after 60 days and refresh via
// /refresh_access_token, but ONLY while still valid and at least 24 hours old. Refreshing
// anything expiring inside 10 days, once a day, keeps every healthy token alive with wide
// margin (Vercel Hobby allows daily crons only). Facebook Page tokens carry no expiry and
// are never rows here (token_expires_at NULL is skipped).
//
// A refresh REFUSED by Meta (revoked app access, deactivated account) marks the connection
// 'expired' so the artist UI can say reconnect, and pauses its automations: an automation
// that can never send again must not claim to be active.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { igRefreshToken } from '@/lib/fanAutomations/metaGraph';
import { getConnectionById, markConnection, updateConnectionToken } from '@/lib/fanAutomations/connections';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const horizon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const { data: due } = await supabaseAdmin
    .from('artist_social_connections')
    .select('id, artist_id')
    .eq('provider', 'instagram')
    .eq('status', 'active')
    .not('token_expires_at', 'is', null)
    .lt('token_expires_at', horizon)
    .limit(25);

  let refreshed = 0;
  let expired = 0;
  for (const row of due || []) {
    const connection = await getConnectionById(supabaseAdmin, row.artist_id, row.id);
    if (!connection?.accessToken) continue;

    const res = await igRefreshToken(connection.accessToken);
    if (res.ok && res.data?.access_token) {
      const ok = await updateConnectionToken(supabaseAdmin, connection.id, res.data.access_token, res.data.expires_in ?? 60 * 60 * 24 * 60);
      if (ok) refreshed += 1;
    } else {
      console.error('[social-token-refresh] refresh refused:', connection.id, res.status, res.error);
      await markConnection(supabaseAdmin, connection.id, { status: 'expired', webhookSubscribed: false });
      await supabaseAdmin
        .from('fan_automations')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('connection_id', connection.id)
        .eq('status', 'active');
      expired += 1;
    }
  }

  return NextResponse.json({ checked: (due || []).length, refreshed, expired });
}
