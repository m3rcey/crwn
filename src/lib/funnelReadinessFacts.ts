// funnelReadinessFacts.ts: the SERVER-side reads behind src/lib/funnelReadiness.ts.
//
// Every loader takes the service-role client and an artist id the caller resolved from the
// SESSION, and scopes every query to that artist. The reads run through the service role
// because fan_automations, tier_offer_experiences and artist_profiles.stripe_connect_id are
// revoked from every browser role. Nothing here is exported to a client bundle.
//
// The loaders are NARROW on purpose. The Quest Engine evaluates its funnel DomainChecks in
// parallel on every Rise Mode load, so each check loads only the two or three tables its
// predicate reads; loadFunnelFacts composes them for the callers that want the whole picture
// (the roadmap's tested fact and the Test flow's route). A missing table or a read error reads
// as "no rows", never as a crash: readiness is a report, and a report that throws is a gate.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { normalizeOfferExperience } from '@/lib/offerExperience/normalize';
import {
  EMPTY_FUNNEL_FACTS,
  type FunnelAutomationFacts,
  type FunnelExperienceFacts,
  type FunnelFacts,
  type FunnelSequenceFacts,
  type FunnelTierFacts,
} from '@/lib/funnelReadiness';

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await q;
    return error ? [] : (data ?? []);
  } catch {
    return [];
  }
}

/** Every non-archived funnel row for the artist. pickFunnel (pure) decides which one counts. */
export async function loadFunnelAutomations(admin: any, artistId: string): Promise<FunnelAutomationFacts[]> {
  return rows<FunnelAutomationFacts>(
    admin
      .from('fan_automations')
      .select('id, status, magnet_kind, magnet_file_key, magnet_track_id, gold_tier_id, silver_tier_id, nurture_sequence_id, public_token, updated_at, activated_at')
      .eq('artist_id', artistId)
      .neq('status', 'archived'),
  );
}

/** The artist's active tiers with the one Stripe fact checkout needs. */
export async function loadFunnelTiers(admin: any, artistId: string): Promise<FunnelTierFacts[]> {
  const list = await rows<{ id: string; name: string; price: number | null; is_active: boolean | null; stripe_price_id: string | null }>(
    admin.from('subscription_tiers').select('id, name, price, is_active, stripe_price_id').eq('artist_id', artistId).eq('is_active', true),
  );
  return list.map((t) => ({ id: t.id, name: t.name, price: Number(t.price) || 0, is_active: t.is_active, stripe_price_id: t.stripe_price_id ?? null }));
}

export async function loadFunnelTracks(admin: any, artistId: string): Promise<{ id: string; is_active: boolean | null }[]> {
  return rows<{ id: string; is_active: boolean | null }>(admin.from('tracks').select('id, is_active').eq('artist_id', artistId));
}

export async function loadFunnelBenefits(admin: any, tierIds: string[]): Promise<{ tier_id: string; benefit_type: string }[]> {
  if (!tierIds.length) return [];
  return rows<{ tier_id: string; benefit_type: string }>(
    admin.from('tier_benefits').select('tier_id, benefit_type').in('tier_id', tierIds).eq('is_active', true),
  );
}

/**
 * Tier Offer Experience rows, each judged by the SAME normalizer the drop page reads through,
 * so "valid" here is exactly "renders as a sales page there". The config itself never leaves
 * this function: only the verdict does.
 */
export async function loadFunnelExperiences(
  admin: any,
  artistId: string,
  tiers: { id: string; name: string }[],
): Promise<FunnelExperienceFacts[]> {
  const list = await rows<{ tier_id: string; is_active: boolean | null; config: unknown }>(
    admin.from('tier_offer_experiences').select('tier_id, is_active, config').eq('artist_id', artistId),
  );
  return list.map((e) => ({
    tier_id: e.tier_id,
    is_active: e.is_active,
    valid: !!normalizeOfferExperience(e.config, tiers.find((t) => t.id === e.tier_id)?.name),
  }));
}

export async function loadFunnelSequences(admin: any, artistId: string): Promise<FunnelSequenceFacts[]> {
  const list = await rows<{ id: string; is_active: boolean | null; trigger_type: string | null; goal_tier_id: string | null }>(
    admin.from('sequences').select('id, is_active, trigger_type, goal_tier_id').eq('artist_id', artistId),
  );
  if (!list.length) return [];
  const steps = await rows<{ sequence_id: string }>(
    admin.from('sequence_steps').select('sequence_id').in('sequence_id', list.map((s) => s.id)),
  );
  const counts = new Map<string, number>();
  for (const s of steps) counts.set(s.sequence_id, (counts.get(s.sequence_id) ?? 0) + 1);
  return list.map((s) => ({ ...s, stepCount: counts.get(s.id) ?? 0 }));
}

/** Mirrors the Quest Engine's artist_stripe_connected: an account id AND the charges milestone. */
export async function loadStripeConnected(admin: any, artistId: string): Promise<boolean> {
  try {
    const { data } = await admin
      .from('artist_profiles')
      .select('stripe_connect_id, activation_milestones')
      .eq('id', artistId)
      .maybeSingle();
    const m = (data?.activation_milestones || {}) as Record<string, unknown>;
    return !!data?.stripe_connect_id && !!m.stripe_connected;
  } catch {
    return false;
  }
}

/** The whole picture, for the roadmap's tested fact and the Test flow. */
export async function loadFunnelFacts(admin: any, artistId: string): Promise<FunnelFacts> {
  const [automations, tiers, tracks, sequences, stripeConnected] = await Promise.all([
    loadFunnelAutomations(admin, artistId),
    loadFunnelTiers(admin, artistId),
    loadFunnelTracks(admin, artistId),
    loadFunnelSequences(admin, artistId),
    loadStripeConnected(admin, artistId),
  ]);
  const [benefits, experiences] = await Promise.all([
    loadFunnelBenefits(admin, tiers.map((t) => t.id)),
    loadFunnelExperiences(admin, artistId, tiers),
  ]);
  return { ...EMPTY_FUNNEL_FACTS, automations, tiers, tracks, benefits, stripeConnected, experiences, sequences };
}
