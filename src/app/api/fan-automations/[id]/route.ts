// Edit, activate, pause, and archive one automation. Owner-authorized; the row is loaded
// scoped to the caller's artist, so a foreign id is a 404, never someone else's automation.
//
// Changing an automation never mutates historical attribution: receipts and leads keep the
// automation_id they were written under, and stats derive from those rows, not from the
// current config.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireArtistOwner } from '@/lib/apiAuth';
import { activationBlockers, validateAutomationInput } from '@/lib/fanAutomations/automationInput';
import { getActiveConnection } from '@/lib/fanAutomations/connections';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const artistId = typeof body.artistId === 'string' ? body.artistId : '';
    const owner = await requireArtistOwner(artistId);
    if (!owner.ok) return owner.error;

    const { data: existing } = await supabaseAdmin
      .from('fan_automations')
      .select('id, status, provider, connection_id, dm_message, magnet_kind, gold_tier_id')
      .eq('id', id)
      .eq('artist_id', artistId)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // Status transition, if requested.
    const action = typeof body.action === 'string' ? body.action : null;
    if (action === 'activate') {
      // A link funnel listens on nothing; activation must not go looking for an account.
      const connection = existing.provider === 'link'
        ? null
        : await getActiveConnection(supabaseAdmin, artistId, existing.provider);
      // The offered tier must be purchasable before the switch goes on: checkout reads its
      // stored Stripe price id directly (Rise Mode Guided Setup, 2026-09-03).
      let goldPurchasable: boolean | null = null;
      if (existing.gold_tier_id) {
        const { data: goldTier } = await supabaseAdmin
          .from('subscription_tiers')
          .select('stripe_price_id, is_active')
          .eq('id', existing.gold_tier_id)
          .eq('artist_id', artistId)
          .maybeSingle();
        goldPurchasable = goldTier ? goldTier.is_active !== false && !!goldTier.stripe_price_id : null;
      }
      const merged = {
        connection_id: connection?.id ?? null,
        dm_message: typeof body.dmMessage === 'string' ? body.dmMessage : existing.dm_message,
        magnet_kind: existing.magnet_kind,
        gold_tier_id: existing.gold_tier_id,
        gold_tier_purchasable: goldPurchasable,
      };
      const blockers = activationBlockers(merged);
      if (blockers.length > 0) {
        return NextResponse.json({ error: blockers[0], blockers }, { status: 409 });
      }
      update.status = 'active';
      // Optional: an external-traffic funnel activates with no connection, and the
      // matching engine simply never routes a comment to it.
      update.connection_id = connection?.id ?? null;
      update.activated_at = new Date().toISOString();
    } else if (action === 'pause') {
      update.status = 'paused';
    } else if (action === 'archive') {
      update.status = 'archived';
    }

    // Field edits, if any, through the same validator as create.
    if (body.fields && typeof body.fields === 'object') {
      const { data: artist } = await supabaseAdmin
        .from('artist_profiles').select('slug').eq('id', artistId).maybeSingle();
      const [{ data: tiers }, { data: tracks }, { data: sequences }] = await Promise.all([
        supabaseAdmin.from('subscription_tiers').select('id').eq('artist_id', artistId).eq('is_active', true).gt('price', 0),
        supabaseAdmin.from('tracks').select('id').eq('artist_id', artistId),
        supabaseAdmin.from('sequences').select('id').eq('artist_id', artistId).eq('is_active', true),
      ]);
      const validated = validateAutomationInput(
        { provider: existing.provider, ...body.fields },
        {
          tierIds: (tiers || []).map((t) => t.id),
          magnetTrackIds: (tracks || []).map((t) => t.id),
          sequenceIds: (sequences || []).map((q: { id: string }) => q.id),
          magnetKeyPrefix: `${artist?.slug || artistId}/magnet/`,
        },
      );
      if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
      const v = validated.value;
      Object.assign(update, {
        trigger_media_ids: v.triggerMediaIds,
        trigger_keywords: v.triggerKeywords,
        public_reply: v.publicReply || 'Check your DMs 👑',
        dm_message: v.dmMessage,
        magnet_kind: v.magnetKind,
        magnet_title: v.magnetTitle,
        magnet_description: v.magnetDescription,
        magnet_file_key: v.magnetFileKey,
        magnet_file_name: v.magnetFileName,
        magnet_track_id: v.magnetTrackId,
        gold_tier_id: v.goldTierId,
        gold_item_title: v.goldItemTitle,
        gold_item_description: v.goldItemDescription,
        silver_tier_id: v.silverTierId,
        nurture_sequence_id: v.nurtureSequenceId,
      });
    }

    let { error } = await supabaseAdmin
      .from('fan_automations')
      .update(update)
      .eq('id', id)
      .eq('artist_id', artistId);
    // Pre-foundation-migration, nurture_sequence_id is an unknown column and fails the
    // whole update. Every other edit matters more than the pointer: retry without it.
    if (error && 'nurture_sequence_id' in update) {
      delete update.nurture_sequence_id;
      ({ error } = await supabaseAdmin
        .from('fan_automations')
        .update(update)
        .eq('id', id)
        .eq('artist_id', artistId));
    }
    if (error) {
      console.error('[fan-automations] update failed:', error.code, error.message);
      return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[fan-automations] patch error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
