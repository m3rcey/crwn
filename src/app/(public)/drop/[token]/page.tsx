// The artist-branded drop page a Fan Automation DM links to. PUBLIC.
//
// Server component: resolves the automation by its unguessable token, loads the artist and
// their live tiers with the service role, derives the Gold/Silver offer server-side
// (src/lib/fanAutomations/offerTiers.ts), and hands the client component METADATA ONLY:
// tier names, prices, benefit lines, and the artist-written standout item. No protected
// media, no signed URL, no token ever renders here; the magnet URL exists only in the claim
// response after a valid email.

import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { deriveOfferTiers, resolveTierPointer, type OfferTierRow } from '@/lib/fanAutomations/offerTiers';
import { isPresentableArtistName } from '@/lib/publicName';
import { DropFunnelClient, type DropOfferTier } from '@/components/drop/DropFunnelClient';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function toOffer(tier: OfferTierRow | null, benefits: Record<string, string[]>): DropOfferTier | null {
  if (!tier) return null;
  return {
    id: tier.id,
    name: tier.name,
    priceCents: tier.price,
    description: tier.description || '',
    benefits: (benefits[tier.id] || []).slice(0, 6),
  };
}

export default async function DropPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length > 64) notFound();

  const { data: automation } = await supabaseAdmin
    .from('fan_automations')
    .select('id, artist_id, status, public_token, magnet_kind, magnet_title, magnet_description, gold_tier_id, gold_item_title, gold_item_description, silver_tier_id')
    .eq('public_token', token)
    .in('status', ['active', 'paused'])
    .maybeSingle();
  if (!automation) notFound();

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, slug, user_id, banner_url')
    .eq('id', automation.artist_id)
    .maybeSingle();
  if (!artist) notFound();

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', artist.user_id)
    .maybeSingle();
  const artistName = isPresentableArtistName(profile?.display_name ?? null)
    ? (profile!.display_name as string)
    : 'This artist';

  const { data: tierRows } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id, name, price, description, is_active, access_config')
    .eq('artist_id', artist.id)
    .eq('is_active', true);
  const tiers: OfferTierRow[] = (tierRows || []).map((t) => ({
    id: t.id, name: t.name, price: t.price, description: t.description, is_active: t.is_active,
  }));
  const benefitLines: Record<string, string[]> = {};
  for (const t of tierRows || []) {
    const b = (t.access_config as { benefits?: unknown } | null)?.benefits;
    benefitLines[t.id] = Array.isArray(b) ? b.filter((x): x is string => typeof x === 'string') : [];
  }

  // Stored tier pointers are validated against LIVE rows; a stale pointer falls back to the
  // derived rung, and the ladder never inverts (silver must sit under gold).
  const derived = deriveOfferTiers(tiers);
  const gold = resolveTierPointer(tiers, automation.gold_tier_id) ?? derived.gold;
  let silver = resolveTierPointer(tiers, automation.silver_tier_id) ?? derived.silver;
  if (silver && gold && (silver.id === gold.id || silver.price >= gold.price)) silver = derived.silver;
  if (silver && gold && silver.id === gold.id) silver = null;

  return (
    <DropFunnelClient
      token={automation.public_token}
      artist={{ name: artistName, slug: artist.slug, avatarUrl: profile?.avatar_url ?? null }}
      magnet={{
        kind: (automation.magnet_kind as 'upload' | 'track' | null) ?? null,
        title: automation.magnet_title || '',
        description: automation.magnet_description || '',
      }}
      gold={toOffer(gold, benefitLines)}
      goldItem={{
        title: automation.gold_item_title || '',
        description: automation.gold_item_description || '',
      }}
      silver={toOffer(silver, benefitLines)}
    />
  );
}
