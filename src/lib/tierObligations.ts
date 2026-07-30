// tierObligations.ts — SERVER ONLY. Auto-generate Promise Calendar obligations
// from a tier's benefits. This is the "automatic fulfillment brain" premise: when
// an artist attaches a recurring benefit to a tier, CRWN creates the standing
// promise (and its first dated task) without the artist hand-entering it.
//
// Called from /api/tier-benefits POST (which replaces a tier's benefits). Best-
// effort — must never break benefit saving. Uses the caller's RLS client: the
// artist owns their tiers and obligations, so inserts satisfy the WITH CHECK.
//
// Launch Wizard Stage 3 rules (docs/ARTIST_LAUNCH_WIZARD.md): the pure decisions
// (what counts as a promise, cadence/title/first-due from config, multi-tier
// serve lists) live in promisePlan.ts and are shared with the wizard's review
// screen, so what the artist reviews is exactly what this creates.
//  - DEDUP: the same promise (benefit_type + title) on a second tier merges into
//    the ONE existing obligation (metadata.merged_tier_ids) instead of duplicating.
//  - INHERITANCE: a benefit whose config carries serves_higher_tiers also serves
//    every active tier priced above its anchor (metadata.serves_tier_ids, which
//    fan eligibility reads). Refreshed on every sync so ladder rungs created in
//    any order converge.
//  - FIRST DUE: config.first_due_at (the wizard's review screen) pins the first
//    event date; otherwise a week of runway.

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeNextDue } from '@/lib/fulfillment';
import {
  PROMISE_BENEFITS,
  recurrenceFromConfig,
  titleFromConfig,
  firstDueFromConfig,
  defaultFirstDue,
  computeServesTierIds,
  mergedTierIdsOf,
  servesTierIdsOf,
} from '@/lib/promisePlan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/** A benefit as stored in tier_benefits: its type plus its config blob. */
export interface BenefitInput {
  benefit_type: string;
  config?: Record<string, unknown> | null;
}

interface ObligationRow {
  id: string;
  benefit_type: string | null;
  status: string;
  source_tier_id: string | null;
  title: string;
  metadata: Record<string, unknown> | null;
}

/** The dedup identity: the same promise on two tiers is the same obligation. */
const identityOf = (benefitType: string, title: string) => `${benefitType}:${title.trim().toLowerCase()}`;

/**
 * Reconcile a tier's promise obligations against its current benefit list:
 *   • create an obligation (+ first event) for each new promise-worthy benefit,
 *   • merge instead of create when another tier already carries the same promise,
 *   • archive (or re-anchor) obligations whose benefit was removed,
 *   • refresh inherited multi-tier serve lists.
 * Idempotent per (tier_id, benefit_type). Never touches VIP-welcome obligations
 * (those carry a null benefit_type). Returns a small summary for logging.
 */
export async function syncTierObligations(
  supabase: Client,
  args: { tierId: string; artistId: string; benefits: BenefitInput[] },
): Promise<{ created: number; archived: number; merged: number }> {
  const { tierId, artistId, benefits } = args;
  const nowIso = new Date().toISOString();

  // Keep the first occurrence of each promise-worthy benefit type (config and all).
  const wantedByType = new Map<string, BenefitInput>();
  for (const b of benefits) {
    if (b.benefit_type in PROMISE_BENEFITS && !wantedByType.has(b.benefit_type)) {
      wantedByType.set(b.benefit_type, b);
    }
  }
  const wantedSet = new Set(wantedByType.keys());
  const wantedIdentities = new Set(
    [...wantedByType.entries()].map(([type, b]) =>
      identityOf(type, titleFromConfig(b.config ?? null, PROMISE_BENEFITS[type].title)),
    ),
  );

  // The artist's active tiers (for inheritance) and ALL their tier-sourced promise
  // obligations (this tier's for create/archive, the rest for dedup + inheritance).
  const { data: tiers } = await supabase
    .from('subscription_tiers')
    .select('id, price, is_active')
    .eq('artist_id', artistId);
  const activeTiers = (tiers || [])
    .filter((t: { is_active?: boolean | null }) => t.is_active !== false)
    .map((t: { id: string; price: number | null }) => ({ id: t.id, price: t.price ?? 0 }));
  const priceOf = (id: string | null) => activeTiers.find((t) => t.id === id)?.price ?? 0;

  const { data: existing } = await supabase
    .from('fulfillment_obligations')
    .select('id, benefit_type, status, source_tier_id, title, metadata')
    .eq('artist_id', artistId)
    .eq('source_type', 'tier')
    .not('benefit_type', 'is', null);
  const all = (existing || []) as ObligationRow[];
  const anchoredHere = all.filter((o) => o.source_tier_id === tierId);
  const anchoredHereByType = new Map(anchoredHere.map((o) => [o.benefit_type as string, o]));

  let created = 0;
  let archived = 0;
  let merged = 0;

  const updateMeta = async (o: ObligationRow, patch: Record<string, unknown>) => {
    const metadata = { ...(o.metadata ?? {}), ...patch };
    await supabase
      .from('fulfillment_obligations')
      .update({ metadata, updated_at: nowIso })
      .eq('id', o.id);
    o.metadata = metadata;
  };

  const recomputeServes = async (o: ObligationRow) => {
    const inheritsUp = (o.metadata ?? {}).inherits_up === true;
    const serves = computeServesTierIds({
      anchorTierId: o.source_tier_id ?? '',
      anchorPriceCents: priceOf(o.source_tier_id),
      inheritsUp,
      mergedTierIds: mergedTierIdsOf(o.metadata),
      activeTiers,
    });
    const current = servesTierIdsOf(o.metadata);
    if (serves.length !== current.length || serves.some((id) => !current.includes(id))) {
      await updateMeta(o, { serves_tier_ids: serves });
    }
  };

  // Create (or merge into) obligations for the wanted promise benefits.
  for (const [benefitType, benefit] of wantedByType) {
    const config = benefit.config ?? null;
    const def = PROMISE_BENEFITS[benefitType];
    const title = titleFromConfig(config, def.title);

    const anchored = anchoredHereByType.get(benefitType);
    if (anchored) {
      // Re-activate if it was previously archived (benefit re-added).
      if (anchored.status === 'archived') {
        await supabase
          .from('fulfillment_obligations')
          .update({ status: 'active', updated_at: nowIso })
          .eq('id', anchored.id);
        anchored.status = 'active';
      }
      continue;
    }

    // DEDUP: the same promise already lives on another tier — serve this tier
    // from the ONE existing obligation instead of creating a duplicate.
    const elsewhere = all.find(
      (o) =>
        o.status === 'active' &&
        o.source_tier_id !== tierId &&
        o.benefit_type === benefitType &&
        identityOf(benefitType, o.title) === identityOf(benefitType, title),
    );
    if (elsewhere) {
      const mergedIds = new Set(mergedTierIdsOf(elsewhere.metadata));
      if (!mergedIds.has(tierId)) {
        mergedIds.add(tierId);
        await updateMeta(elsewhere, { merged_tier_ids: [...mergedIds] });
        merged += 1;
      }
      await recomputeServes(elsewhere);
      continue;
    }

    const recurrence = recurrenceFromConfig(config, def.recurrence);
    const inheritsUp = (config as Record<string, unknown> | null)?.serves_higher_tiers === true;
    const firstDue = firstDueFromConfig(config) ?? defaultFirstDue(new Date());
    const following = computeNextDue(recurrence, firstDue);
    const serves = computeServesTierIds({
      anchorTierId: tierId,
      anchorPriceCents: priceOf(tierId),
      inheritsUp,
      mergedTierIds: [],
      activeTiers,
    });

    const { data: obligation } = await supabase
      .from('fulfillment_obligations')
      .insert({
        artist_id: artistId,
        source_type: 'tier',
        source_tier_id: tierId,
        benefit_type: benefitType,
        title,
        description: 'Auto-created from a tier benefit. Edit or pause anytime.',
        fulfillment_type: def.fulfillmentType,
        recurrence,
        next_due_at: following ? following.toISOString() : null,
        audience_kind: 'tier',
        audience_id: tierId,
        requires_completion: true,
        auto_create_fan_items: true,
        metadata: {
          source: 'tier_benefit_sync',
          ...(inheritsUp ? { inherits_up: true } : {}),
          ...(serves.length ? { serves_tier_ids: serves } : {}),
        },
      })
      .select('id')
      .single();

    if (obligation) {
      created += 1;
      all.push({
        id: obligation.id,
        benefit_type: benefitType,
        status: 'active',
        source_tier_id: tierId,
        title,
        metadata: { source: 'tier_benefit_sync', ...(inheritsUp ? { inherits_up: true } : {}), serves_tier_ids: serves },
      });
      await supabase.from('fulfillment_events').insert({
        obligation_id: obligation.id,
        artist_id: artistId,
        title,
        due_at: firstDue.toISOString(),
        status: 'pending',
      });
    }
  }

  // Removal pass 1: obligations ANCHORED here whose benefit was removed.
  for (const o of anchoredHere) {
    if (!o.benefit_type || wantedSet.has(o.benefit_type) || o.status === 'archived') continue;
    const mergedIds = mergedTierIdsOf(o.metadata).filter((id) => id !== tierId);
    const nextAnchor = mergedIds.find((id) => activeTiers.some((t) => t.id === id));
    if (nextAnchor) {
      // Other tiers still carry this promise: re-anchor instead of archiving, so
      // their members keep what they were promised.
      await supabase
        .from('fulfillment_obligations')
        .update({
          source_tier_id: nextAnchor,
          audience_id: nextAnchor,
          metadata: { ...(o.metadata ?? {}), merged_tier_ids: mergedIds.filter((id) => id !== nextAnchor) },
          updated_at: nowIso,
        })
        .eq('id', o.id);
      o.source_tier_id = nextAnchor;
      o.metadata = { ...(o.metadata ?? {}), merged_tier_ids: mergedIds.filter((id) => id !== nextAnchor) };
      await recomputeServes(o);
      continue;
    }
    await supabase
      .from('fulfillment_obligations')
      .update({ status: 'archived', updated_at: nowIso })
      .eq('id', o.id);
    o.status = 'archived';
    // Cancel its still-pending events so they drop off the calendar.
    await supabase
      .from('fulfillment_events')
      .update({ status: 'cancelled', updated_at: nowIso })
      .eq('obligation_id', o.id)
      .eq('status', 'pending');
    archived += 1;
  }

  // Removal pass 2: obligations anchored ELSEWHERE that served this tier via a
  // merge, where this tier no longer carries the promise.
  for (const o of all) {
    if (o.source_tier_id === tierId || o.status !== 'active' || !o.benefit_type) continue;
    if (!mergedTierIdsOf(o.metadata).includes(tierId)) continue;
    if (wantedIdentities.has(identityOf(o.benefit_type, o.title))) continue;
    await updateMeta(o, { merged_tier_ids: mergedTierIdsOf(o.metadata).filter((id) => id !== tierId) });
    await recomputeServes(o);
  }

  // Inheritance refresh: serve lists depend on which tiers exist ABOVE each
  // anchor, so any tier change can shift them (the wizard creates Gold before
  // Platinum; Platinum's sync is what adds it to Gold's serve list).
  for (const o of all) {
    if (o.status !== 'active') continue;
    if ((o.metadata ?? {}).inherits_up === true) await recomputeServes(o);
  }

  return { created, archived, merged };
}
