// Fan Automations CRUD: list with derived stats, and create.
//
// Owner-authorized on both verbs (requireArtistOwner). Stats are DERIVED here on read, the
// Fan Drives rule: receipts count the trigger side, leads count the capture side, and paid
// conversions come from joining subscriptions on the lead's fan_user_id, so no counter
// column exists anywhere to drift from the money truth.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { validateAutomationInput } from '@/lib/fanAutomations/automationInput';
import { getActiveConnection } from '@/lib/fanAutomations/connections';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId') || '';
  const owner = await requireArtistOwner(artistId);
  if (!owner.ok) return owner.error;

  const { data: automations } = await supabaseAdmin
    .from('fan_automations')
    .select('id, provider, status, public_token, trigger_media_ids, trigger_keywords, public_reply, dm_message, magnet_kind, magnet_title, magnet_description, magnet_file_name, magnet_track_id, gold_tier_id, gold_item_title, gold_item_description, silver_tier_id, connection_id, created_at, activated_at')
    .eq('artist_id', artistId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  const rows = automations || [];
  const ids = rows.map((a) => a.id);

  const stats: Record<string, { comments: number; dmsSent: number; leads: number; freeMembers: number; goldMembers: number; silverMembers: number }> = {};
  for (const id of ids) stats[id] = { comments: 0, dmsSent: 0, leads: 0, freeMembers: 0, goldMembers: 0, silverMembers: 0 };

  if (ids.length > 0) {
    const [{ data: receipts }, { data: leads }] = await Promise.all([
      supabaseAdmin
        .from('social_webhook_receipts')
        .select('automation_id, dm_status')
        .in('automation_id', ids),
      supabaseAdmin
        .from('fan_automation_leads')
        .select('automation_id, fan_user_id, membership_result')
        .in('automation_id', ids),
    ]);

    for (const r of receipts || []) {
      if (!r.automation_id) continue;
      stats[r.automation_id].comments += 1;
      if (r.dm_status === 'sent') stats[r.automation_id].dmsSent += 1;
    }
    for (const l of leads || []) {
      stats[l.automation_id].leads += 1;
      if (l.membership_result === 'created') stats[l.automation_id].freeMembers += 1;
    }

    // Paid conversions, derived from the subscription rows themselves.
    const fanIds = [...new Set((leads || []).map((l) => l.fan_user_id).filter((v): v is string => !!v))];
    if (fanIds.length > 0) {
      const { data: subs } = await supabaseAdmin
        .from('subscriptions')
        .select('fan_id, tier_id, status')
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .in('fan_id', fanIds);
      const tierByFan = new Map((subs || []).map((s) => [s.fan_id, s.tier_id]));
      for (const l of leads || []) {
        if (!l.fan_user_id) continue;
        const tierId = tierByFan.get(l.fan_user_id);
        if (!tierId) continue;
        const a = rows.find((x) => x.id === l.automation_id);
        if (!a) continue;
        if (tierId === a.gold_tier_id) stats[l.automation_id].goldMembers += 1;
        else if (tierId === a.silver_tier_id) stats[l.automation_id].silverMembers += 1;
      }
    }
  }

  return NextResponse.json({ automations: rows, stats });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const artistId = typeof body.artistId === 'string' ? body.artistId : '';
    const owner = await requireArtistOwner(artistId);
    if (!owner.ok) return owner.error;

    const { data: artist } = await supabaseAdmin
      .from('artist_profiles').select('slug').eq('id', artistId).maybeSingle();
    const [{ data: tiers }, { data: tracks }] = await Promise.all([
      supabaseAdmin.from('subscription_tiers').select('id').eq('artist_id', artistId).eq('is_active', true).gt('price', 0),
      supabaseAdmin.from('tracks').select('id').eq('artist_id', artistId).eq('is_free', true),
    ]);

    const validated = validateAutomationInput(body, {
      tierIds: (tiers || []).map((t) => t.id),
      freeTrackIds: (tracks || []).map((t) => t.id),
      magnetKeyPrefix: `${artist?.slug || artistId}/magnet/`,
    });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    const input = validated.value;

    const connection = await getActiveConnection(supabaseAdmin, artistId, input.provider);

    const { data: created, error } = await supabaseAdmin
      .from('fan_automations')
      .insert({
        artist_id: artistId,
        connection_id: connection?.id ?? null,
        provider: input.provider,
        status: 'draft',
        public_token: randomBytes(9).toString('base64url'),
        trigger_media_ids: input.triggerMediaIds,
        trigger_keywords: input.triggerKeywords,
        public_reply: input.publicReply || 'Check your DMs 👑',
        dm_message: input.dmMessage,
        magnet_kind: input.magnetKind,
        magnet_title: input.magnetTitle,
        magnet_description: input.magnetDescription,
        magnet_file_key: input.magnetFileKey,
        magnet_file_name: input.magnetFileName,
        magnet_track_id: input.magnetTrackId,
        gold_tier_id: input.goldTierId,
        gold_item_title: input.goldItemTitle,
        gold_item_description: input.goldItemDescription,
        silver_tier_id: input.silverTierId,
      })
      .select('id, public_token')
      .single();

    if (error || !created) {
      console.error('[fan-automations] create failed:', error?.code, error?.message);
      return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
    }
    return NextResponse.json({ id: created.id, publicToken: created.public_token });
  } catch (err) {
    console.error('[fan-automations] create error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
