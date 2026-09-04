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
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveFunnelOffers, type OfferTierRow } from '@/lib/fanAutomations/offerTiers';
import { offerExperiencesForTiers } from '@/lib/offerExperience/server';
import { accentPageVars } from '@/lib/contrast';
import { presentCampaign, type CampaignRow } from '@/lib/campaigns/giveaway';
import { PRIZE_RAIL } from '@/lib/campaigns/prizeState';
import type { CSSProperties } from 'react';
import { isPresentableArtistName } from '@/lib/publicName';
import { DropFunnelClient, type DropOfferTier } from '@/components/drop/DropFunnelClient';
import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/shareMetadata';

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
    .in('status', ['active', 'paused', 'draft'])
    .maybeSingle();
  if (!automation) notFound();

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, slug, user_id, banner_url, accent_hex')
    .eq('id', automation.artist_id)
    .maybeSingle();
  if (!artist) notFound();

  // A DRAFT renders only for its owner, as a preview (Rise Mode Guided Setup, 2026-09-03):
  // the artist sees the real page their link will open before turning it on. Everyone else
  // gets the same 404 a draft always produced. Owner means the SESSION user is the artist's
  // user, the same check the artist page uses; the token alone never opens a draft.
  let preview = false;
  if (automation.status === 'draft') {
    const session = await createServerSupabaseClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user || user.id !== artist.user_id) notFound();
    preview = true;
  }

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

  // Generic engine semantics: the funnel leads with its PRIMARY paid offer and may hold
  // a cheaper DOWNSELL. Stored pointers are validated against LIVE rows inside
  // resolveFunnelOffers (a stale or cross-artist pointer falls back to derivation), the
  // primary is always paid, and the downsell is always strictly cheaper or absent.
  // GB's Platinum-then-Gold funnel is configuration of these two pointers, not code.
  const { primary: gold, downsell: silver } = resolveFunnelOffers(tiers, automation);

  // ── The temporary campaign layer, if one is running. ──────────────────────────
  //
  // FAILS CLOSED, always: a campaign that is draft, outside its window, misconfigured, or
  // a giveaway missing any legal fact resolves to null and this page renders the ordinary
  // evergreen funnel. The fan never sees a half-configured sweepstakes, and the magnet,
  // the free join and both offers below are untouched either way.
  //
  // prizeFulfillable is a PRODUCT capability, read from PRIZE_RAIL rather than typed here.
  // The delivery rail (executor, proven Stripe construction, webhook transitions, prize-aware
  // accounting) shipped 2026-09-04; what still holds it at false is that no surface can
  // record a selected winner, so nothing can invoke it. Until that lands, a campaign offering
  // a membership prize cannot go public, which is exactly the intended behaviour.
  let campaign = null;
  try {
    const { data: row } = await supabaseAdmin
      .from('fan_campaigns')
      .select('id, artist_id, archetype, title, status, toolkit, starts_at, ends_at')
      .eq('artist_id', artist.id)
      .eq('status', 'active')
      .maybeSingle();
    if (row) {
      campaign = presentCampaign(row as CampaignRow, new Date(), { prizeFulfillable: PRIZE_RAIL.ready });
    }
  } catch {
    /* no campaign spine, or a read fault: the evergreen funnel is the answer */
  }

  // Tier Offer Experiences, when the artist has them: the full merchandised sales
  // presentation for the primary and downsell tiers, read server-side and fail-soft.
  // No config means the funnel renders its compact cards exactly as before.
  const experiences = await offerExperiencesForTiers(
    supabaseAdmin,
    artist.id,
    [gold, silver].filter((t): t is NonNullable<typeof t> => !!t).map((t) => ({ id: t.id, name: t.name })),
  );

  return (
    <div
      style={(accentPageVars(artist.accent_hex) ?? undefined) as CSSProperties | undefined}
    >
    {preview && (
      <div className="bg-crwn-gold text-crwn-bg text-center text-sm font-semibold px-4 py-2">
        Preview. Only you can see this until you turn the funnel on; the email box does not deliver yet.
      </div>
    )}
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
      experiences={experiences}
      campaign={campaign}
    />
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const generic = shareMetadata({ title: 'CRWN', description: 'This link is no longer live.' });
  if (!token || token.length > 64) return generic;

  const { data: automation } = await supabaseAdmin
    .from('fan_automations')
    .select('artist_id, magnet_title, magnet_description')
    .eq('public_token', token)
    .in('status', ['active', 'paused'])
    .maybeSingle();
  if (!automation) return generic;

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('user_id, banner_url')
    .eq('id', automation.artist_id)
    .maybeSingle();

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', artist?.user_id || '')
    .maybeSingle();
  const rawName = profile?.display_name ?? null;
  const name = isPresentableArtistName(rawName) ? (rawName as string) : 'This artist';

  return shareMetadata({
    title: automation.magnet_title || `${name} on CRWN`,
    description: automation.magnet_description || `${name} is sending this out on CRWN.`,
    path: `/drop/${token}`,
    image: artist?.banner_url || profile?.avatar_url || null,
  });
}
