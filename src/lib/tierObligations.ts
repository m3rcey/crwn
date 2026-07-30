// tierObligations.ts — SERVER ONLY. Auto-generate Promise Calendar obligations
// from a tier's benefits. This is the "automatic fulfillment brain" premise: when
// an artist attaches a recurring benefit to a tier, CRWN creates the standing
// promise (and its first dated task) without the artist hand-entering it.
//
// Called from /api/tier-benefits POST (which replaces a tier's benefits). Best-
// effort — must never break benefit saving. Uses the caller's RLS client: the
// artist owns their tiers and obligations, so inserts satisfy the WITH CHECK.

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeNextDue, type Recurrence } from '@/lib/fulfillment';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/** A benefit as stored in tier_benefits: its type plus its config blob. */
export interface BenefitInput {
  benefit_type: string;
  config?: Record<string, unknown> | null;
}

// Only benefits that imply a RECURRING ARTIST ACTION become promises. Access /
// passive perks (early_access, direct_messaging, shop_discount, badges, …) are
// not scheduled fulfillment and are intentionally absent.
const PROMISE_BENEFITS: Record<
  string,
  { fulfillmentType: string; recurrence: Recurrence; title: string }
> = {
  group_live_qa: { fulfillmentType: 'livestream', recurrence: 'monthly', title: 'Group live Q&A' },
  one_on_one_call: { fulfillmentType: 'event', recurrence: 'monthly', title: '1-on-1 call' },
  monthly_merch: { fulfillmentType: 'shipment', recurrence: 'monthly', title: 'Monthly merch' },
  exclusive_posts: { fulfillmentType: 'content_drop', recurrence: 'monthly', title: 'Supporter-only post' },
};

const ALLOWED_RECURRENCES: Recurrence[] = ['weekly', 'biweekly', 'monthly', 'quarterly'];

/** A benefit's config can override the default cadence (e.g. Platinum's quarterly). */
function recurrenceFromConfig(config: BenefitInput['config'], fallback: Recurrence): Recurrence {
  const freq = config?.frequency;
  return typeof freq === 'string' && (ALLOWED_RECURRENCES as string[]).includes(freq)
    ? (freq as Recurrence)
    : fallback;
}

/** A benefit's config can give the obligation a specific, artist-facing title. */
function titleFromConfig(config: BenefitInput['config'], fallback: string): string {
  const t = config?.obligation_title;
  return typeof t === 'string' && t.trim() ? t.trim() : fallback;
}

/**
 * Reconcile a tier's promise obligations against its current benefit list:
 *   • create an obligation (+ first event) for each new promise-worthy benefit,
 *   • archive obligations whose benefit was removed.
 * Idempotent per (tier_id, benefit_type). Never touches VIP-welcome obligations
 * (those carry a null benefit_type). Returns a small summary for logging.
 */
export async function syncTierObligations(
  supabase: Client,
  args: { tierId: string; artistId: string; benefits: BenefitInput[] },
): Promise<{ created: number; archived: number }> {
  const { tierId, artistId, benefits } = args;
  // Keep the first occurrence of each promise-worthy benefit type (config and all).
  const wantedByType = new Map<string, BenefitInput>();
  for (const b of benefits) {
    if (b.benefit_type in PROMISE_BENEFITS && !wantedByType.has(b.benefit_type)) {
      wantedByType.set(b.benefit_type, b);
    }
  }
  const wanted = [...wantedByType.keys()];
  const wantedSet = new Set(wanted);

  let created = 0;
  let archived = 0;

  // Existing promise obligations for this tier (only ones with a benefit_type —
  // leaves VIP-welcome and other manual obligations alone).
  const { data: existing } = await supabase
    .from('fulfillment_obligations')
    .select('id, benefit_type, status')
    .eq('source_tier_id', tierId)
    .not('benefit_type', 'is', null);
  const existingByType = new Map<string, { id: string; status: string }>();
  for (const o of existing || []) {
    if (o.benefit_type) existingByType.set(o.benefit_type, { id: o.id, status: o.status });
  }

  // Create for newly-added promise benefits.
  for (const benefitType of wanted) {
    const found = existingByType.get(benefitType);
    if (found) {
      // Re-activate if it was previously archived (benefit re-added).
      if (found.status === 'archived') {
        await supabase
          .from('fulfillment_obligations')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', found.id);
      }
      continue;
    }
    const def = PROMISE_BENEFITS[benefitType];
    const config = wantedByType.get(benefitType)?.config ?? null;
    const recurrence = recurrenceFromConfig(config, def.recurrence);
    const title = titleFromConfig(config, def.title);
    const firstDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // a week of runway
    firstDue.setHours(12, 0, 0, 0);
    const following = computeNextDue(recurrence, firstDue);

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
        metadata: { source: 'tier_benefit_sync' },
      })
      .select('id')
      .single();

    if (obligation) {
      created += 1;
      await supabase.from('fulfillment_events').insert({
        obligation_id: obligation.id,
        artist_id: artistId,
        title,
        due_at: firstDue.toISOString(),
        status: 'pending',
      });
    }
  }

  // Archive obligations whose benefit was removed from the tier.
  for (const [benefitType, o] of existingByType) {
    if (!wantedSet.has(benefitType) && o.status !== 'archived') {
      await supabase
        .from('fulfillment_obligations')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', o.id);
      // Cancel its still-pending events so they drop off the calendar.
      await supabase
        .from('fulfillment_events')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('obligation_id', o.id)
        .eq('status', 'pending');
      archived += 1;
    }
  }

  return { created, archived };
}
