import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Image from 'next/image';
import { SubscribeButton, TierCards } from '@/components/artist/SubscribeSection';
import { MessageArtistButton } from '@/components/messages/MessageArtistButton';
import { ShopSection } from '@/components/artist/ShopSection';
import { SubscribeCTA } from '@/components/gating';
import { TierConfig, TierBenefit } from '@/types';
import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { ArtistProfileContent } from '@/components/artist/ArtistProfileContent';
import { ShareButtons } from '@/components/shared/ShareButtons';
import { FoundingBadge } from '@/components/shared/FoundingBadge';
import { PublicTestimonials } from '@/components/artist/PublicTestimonials';
import { publicTestimonialsFor } from '@/lib/testimonials/publicRead';
import { ShareEarnWrapper } from '@/components/shared/ShareEarnWrapper';
import { ClipperProgram } from '@/components/shared/ClipperProgram';
import { ArtistPreviewProvider } from '@/hooks/useArtistPreview';
import { PreviewBar } from '@/components/artist/PreviewBar';
import type { Metadata } from 'next';
import { getBenefitDisplayText, BENEFIT_CATALOG } from '@/lib/benefitCatalog';
import { tierCardBenefitLines, cardLinesModeOf } from '@/lib/tierCardBenefits';
import { accentPageVars } from '@/lib/contrast';
import { PaletteBackfill } from '@/components/artist/PaletteBackfill';
import { BannerReposition } from '@/components/artist/BannerReposition';
import type { CSSProperties } from 'react';

interface ArtistPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ArtistPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles_public')
    // NEVER profiles(*): profiles.email/phone have SELECT revoked from anon/authenticated, and
    // naming a revoked column 42501s the WHOLE embedded query, so the page reads "no row" and 404s.
    // Select only PUBLIC profile columns explicitly.
    .select('*, profile:profiles(id, display_name, username, avatar_url, bio, social_links, is_active)')
    .eq('slug', slug)
    .single();

  if (!artist) {
    return { title: 'Artist Not Found | CRWN' };
  }

  const displayName = artist.profile?.display_name || 'Artist';
  const tagline = artist.tagline || `Listen to ${displayName} on CRWN`;
  const avatarUrl = artist.profile?.avatar_url || null;
  const bannerUrl = artist.banner_url || null;
  const ogImage = bannerUrl || avatarUrl || '/icon-512x512.png';
  const artistUrl = `https://thecrwn.app/${slug}`;

  // Get track count and subscriber count for description
  const { count: trackCount } = await supabase
    .from('tracks')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artist.id)
    .eq('is_active', true);

  const { count: subCount } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artist.id)
    .eq('status', 'active');

  const description = `${tagline} • ${trackCount || 0} tracks • ${subCount || 0} supporters`;

  return {
    title: `${displayName} | CRWN`,
    description,
    openGraph: {
      title: `${displayName} on CRWN`,
      description,
      url: artistUrl,
      siteName: 'CRWN',
      images: ogImage ? [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${displayName} on CRWN`,
        },
      ] : [],
      type: 'profile',
    },
    twitter: {
      card: bannerUrl ? 'summary_large_image' : 'summary',
      title: `${displayName} on CRWN`,
      description,
      images: ogImage ? [ogImage] : [],
    },
    other: {
      'og:profile:username': slug,
    },
  };
}

export default async function ArtistPage({ params, searchParams }: ArtistPageProps) {
  const { slug } = await params;
  const resolvedSearch = await searchParams;
  const previewParam = resolvedSearch?.preview;
  const initialPersona = typeof previewParam === 'string' ? previewParam : null;
  // Rendered inside the onboarding live preview. The page is otherwise identical
  // to what a fan gets (that is the whole point); `embedded` only strips the
  // owner's preview bar and makes checkout inert.
  const embedded = resolvedSearch?.embed === '1';
  const supabase = await createServerSupabaseClient();

  const { data: { session } } = await supabase.auth.getSession();

  // Fetch artist profile. artist_profiles_public: the base table no longer allows
  // `select('*')` (the Stripe ids are withheld by column grant, and PostgREST
  // expands `*` in the database).
  const { data: artist, error } = await supabase
    .from('artist_profiles_public')
    // NEVER profiles(*): profiles.email/phone have SELECT revoked from anon/authenticated, and
    // naming a revoked column 42501s the WHOLE embedded query, so the page reads "no row" and 404s.
    // Select only PUBLIC profile columns explicitly.
    .select('*, profile:profiles(id, display_name, username, avatar_url, bio, social_links, is_active)')
    .eq('slug', slug)
    .single();

  if (error || !artist) {
    notFound();
  }

  // Deactivated accounts (profiles.is_active === false) are hidden from the public.
  // The owner can reactivate by logging back in. null/true both mean active, so
  // only an explicit false hides the page (safe for existing rows with no flag).
  const artistProfile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;
  if (artistProfile?.is_active === false) {
    notFound();
  }

  // Fetch tiers from subscription_tiers table
  const { data: subscriptionTiers } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .order('price', { ascending: true });

  // Fetch tier benefits for structured benefits display
  const tierIds = (subscriptionTiers || []).map((t) => t.id);
  const { data: allTierBenefits } = tierIds.length > 0
    ? await supabase
        .from('tier_benefits')
        .select('*')
        .in('tier_id', tierIds)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
    : { data: [] };

  // Group benefits by tier_id
  const benefitsByTierId: Record<string, TierBenefit[]> = {};
  (allTierBenefits || []).forEach((benefit: TierBenefit) => {
    if (!benefitsByTierId[benefit.tier_id]) {
      benefitsByTierId[benefit.tier_id] = [];
    }
    benefitsByTierId[benefit.tier_id].push(benefit);
  });

  const tiers: TierConfig[] = (subscriptionTiers || []).map((t) => {
    const tierBenefits = benefitsByTierId[t.id] || [];
    // Structured tier_benefits rows first, then the artist's own access_config prose.
    // tierCardBenefitLines is the one place that order lives; see its note.
    const benefits = tierCardBenefitLines(tierBenefits, t.access_config?.benefits, cardLinesModeOf(t.access_config));
    
    return {
      id: t.id,
      name: t.name,
      price: t.price,
      description: t.description,
      benefits,
      tierBenefits: tierBenefits, // Store structured benefits for advanced features
      offersAnnual: t.offers_annual !== false,
      annualDiscountPercent: t.annual_discount_percent ?? 25,
    };
  });

  // Fetch artist's tracks. tracks_public redacts audio_url_* for readers who are
  // not entitled, so locked-track cards still render without exposing the file.
  const { data: tracks } = await supabase
    .from('tracks_public')
    .select('*')
    .eq('is_active', true)
    .eq('artist_id', artist.id);

  // Sort by position, then by created_at for tracks without position
  const sortedTracks = (tracks || []).sort((a: unknown, b: unknown) => {
    const trackA = a as { position: number | null; created_at: string };
    const trackB = b as { position: number | null; created_at: string };
    if (trackA.position != null && trackB.position != null) return trackA.position - trackB.position;
    if (trackA.position != null) return -1;
    if (trackB.position != null) return 1;
    return new Date(trackB.created_at).getTime() - new Date(trackA.created_at).getTime();
  });

  // Fetch artist's albums
  const { data: albums } = await supabase
    .from('albums')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .order('release_date', { ascending: false });

  // Get album track counts (single batched query, not N+1)
  const albumIds = (albums || []).map(a => a.id);
  const albumTrackCounts: Record<string, number> = {};
  if (albumIds.length > 0) {
    const { data: atData } = await supabase
      .from('album_tracks')
      .select('album_id, track:tracks(is_active)')
      .in('album_id', albumIds);
    for (const at of (atData || []) as any[]) {
      if (at.track?.is_active !== false) {
        albumTrackCounts[at.album_id] = (albumTrackCounts[at.album_id] || 0) + 1;
      }
    }
  }
  const albumsWithCounts = (albums || []).map((album) => ({
    ...album,
    track_count: albumTrackCounts[album.id] || 0,
  }));

  // Fetch artist's playlists
  const { data: playlists } = await supabase
    .from('playlists')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_artist_playlist', true)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Get playlist track counts (single batched query, not N+1)
  const playlistIds = (playlists || []).map(p => p.id);
  const playlistTrackCounts: Record<string, number> = {};
  if (playlistIds.length > 0) {
    const { data: ptData } = await supabase
      .from('playlist_tracks')
      .select('playlist_id, track:tracks(is_active)')
      .in('playlist_id', playlistIds);
    for (const pt of (ptData || []) as any[]) {
      if (pt.track?.is_active !== false) {
        playlistTrackCounts[pt.playlist_id] = (playlistTrackCounts[pt.playlist_id] || 0) + 1;
      }
    }
  }
  const playlistsWithCounts = (playlists || []).map((playlist) => ({
    ...playlist,
    track_count: playlistTrackCounts[playlist.id] || 0,
  }));

  // Fetch shop products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Currently-live session (for the "Live now" banner)
  const { data: liveNow } = await supabase
    .from('live_sessions')
    .select('id, title')
    .eq('artist_id', artist.id)
    .eq('status', 'live')
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Public live sessions + recordings for the "Live & Recordings" tab. Excludes
  // private uploads (owner-only clipper footage); access to watch/download is
  // gated per-session client-side.
  const { data: liveSessions } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });


  // Featured fan testimonials. ONE bounded query against the public view, which applies the
  // publication predicate (consented + featured + not withdrawn + not hidden + not blocked) and
  // derives the verification badge from the live relationship. Returns [] before the migration
  // runs and on any error, so the section simply does not render.
  const testimonials = await publicTestimonialsFor(supabase, artist.id);

  // The REAL ownership check. Never "does this viewer have an artist row": a
  // rival artist is not the owner of this page, and treating them as one handed
  // them owner-only controls on someone else's community.
  const isOwner = !!session?.user?.id && session.user.id === artist.user_id;

  return (
    <ArtistPreviewProvider
      isOwner={isOwner}
      tiers={tiers.map((t) => ({ id: t.id, name: t.name, price: t.price }))}
      initialPersona={initialPersona}
      embedded={embedded}
    >
    {/* Artist accent (v2 redesign): the page's gold utilities compile to
        var(--crwn-gold), so overriding the variable here recolours every gold
        surface inside — tabs, play glyphs, tier cards, CTAs — with the colour
        sampled from this artist's own banner. accentPageVars returns null (keep
        CRWN gold) when there is no stored palette or the hue cannot clear
        4.5:1 on the dark ground. Scoped to this subtree only; the rest of the
        app stays gold. */}
    <div
      className="relative min-h-screen pb-20 md:pb-0 page-fade-in"
      style={(accentPageVars((artist as { accent_hex?: string | null }).accent_hex) ?? undefined) as CSSProperties | undefined}
    >
      <BackgroundImage src="/backgrounds/bg-artist.jpg" overlayOpacity="bg-black/80" />
      {/* Ambient accent wash (v2): a contained pool of the artist's light at the
          top of the page, fading into the ground. Pure CSS (the shader tier is a
          later pass); color-mix keeps it on the sampled accent, gold before one
          exists. Never a full-bleed field: the glow enters from the top only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[480px]"
        style={{
          background:
            'radial-gradient(120% 65% at 50% -12%, color-mix(in srgb, var(--crwn-gold) 30%, transparent) 0%, color-mix(in srgb, var(--crwn-gold) 8%, transparent) 48%, transparent 78%)',
        }}
      />
      <div className="relative z-10">
        {/* The preview bar is the OWNER's persona switcher. Inside the onboarding
            preview the persona is already fixed to "a visitor", and a second bar
            of chrome inside the little page frame would only be noise. */}
        {!embedded && <PreviewBar />}
        <PaletteBackfill
          artistId={artist.id}
          bannerUrl={artist.banner_url ?? null}
          isOwner={isOwner}
          hasPalette={!!(artist as { accent_hex?: string | null }).accent_hex}
        />
        {/* Live now banner */}
        {liveNow && (
          <a
            href={`/${artist.slug}/live/${liveNow.id}`}
            className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 transition-colors text-white px-4 py-3 text-center text-sm font-semibold"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            {(artist.profile?.display_name || 'Artist')} is live now: {liveNow.title}. Tap to join.
          </a>
        )}
        {/* Banner (v2): a rounded media card inset from the page edges, not a
            full-bleed strip. The soft shadow below it is the accent glow. */}
        <div className="px-4 sm:px-6 lg:px-8 pt-4">
          {artist.banner_url ? (
            <BannerReposition
              artistId={artist.id}
              bannerUrl={artist.banner_url}
              alt={`${artist.profile?.display_name || 'Artist'} banner`}
              isOwner={isOwner}
              initialX={Number((artist as { banner_pos_x?: number | null }).banner_pos_x ?? 50)}
              initialY={Number((artist as { banner_pos_y?: number | null }).banner_pos_y ?? 50)}
            />
          ) : (
            <div
              className="relative h-48 sm:h-64 md:h-72 w-full rounded-2xl md:rounded-[20px] overflow-hidden"
              style={{ boxShadow: '0 24px 60px color-mix(in srgb, var(--crwn-gold) 20%, transparent)' }}
            >
              <div className="w-full h-full bg-gradient-to-b from-crwn-elevated to-crwn-bg" />
              <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg/70 via-transparent to-transparent" />
            </div>
          )}
        </div>

        {/* Profile Header */}
        <div className="px-4 sm:px-6 lg:px-8 -mt-12 relative z-10" data-tour="artist-page-header">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 sm:gap-6">
            {/* Avatar (v2): rounded tile, hairline border, deep lift */}
            <div
              className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-2xl md:rounded-[20px] border border-white/15 overflow-hidden bg-crwn-surface-solid"
              style={{ boxShadow: '0 18px 40px rgba(0,0,0,0.5)' }}
            >
              {artist.profile?.avatar_url ? (
                <Image
                  src={artist.profile.avatar_url}
                  alt={artist.profile?.display_name || 'Artist'}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl text-crwn-text-secondary">
                  🎵
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 mb-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-3xl sm:text-4xl md:text-[44px] font-bold text-crwn-text tracking-tight leading-none">
                  {artist.profile?.display_name || 'Artist Name'}
                </h1>
                {artist.is_verified && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-crwn-text"
                    style={{ background: 'color-mix(in srgb, var(--crwn-gold) 14%, transparent)' }}
                    title="Verified Artist"
                  >
                    <span className="text-crwn-gold">✓</span> Verified
                  </span>
                )}
                {artist.is_founding_artist && artist.founding_artist_number && (
                  <span data-tour="founding-badge"><span data-tour="founding-badge"><FoundingBadge number={artist.founding_artist_number} size="sm" /></span></span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ShareEarnWrapper
                  artistSlug={artist.slug}
                  artistId={artist.id}
                  commissionRate={artist.referral_commission_rate ?? 0}
                  isOwner={session?.user?.id === artist.user_id}
                />
                <ClipperProgram
                  artistSlug={artist.slug}
                  artistName={artist.profile?.display_name || 'this artist'}
                  platformTier={artist.platform_tier}
                  standardRate={artist.clipper_commission_rate || 0}
                  schedule={artist.clipper_rate_schedule}
                  campaignStartedAt={artist.clipper_campaign_started_at}
                />
              </div>
              {artist.tagline && (
                <p className="text-crwn-text-secondary mt-1">{artist.tagline}</p>
              )}
            </div>

            {/* Subscribe Button */}
            <div className="mt-2">
              <MessageArtistButton
                artistId={artist.id}
                artistSlug={artist.slug}
                isOwnProfile={session?.user?.id === artist.user_id}
              />
            </div>
          </div>

          {/* Bio */}
          {artist.profile?.bio && (
            <div className="mt-2 mb-6 max-w-2xl">
              <p className="text-crwn-text-secondary whitespace-pre-wrap">
                {artist.profile.bio}
              </p>
            </div>
          )}

        </div>

        {/* What supporters are saying. Self-hides when the artist has featured nothing. */}
        <PublicTestimonials testimonials={testimonials} />

        {/* Content with Tabs */}
        <ArtistProfileContent
          artist={artist}
          tiers={tiers}
          albums={albumsWithCounts}
          playlists={playlistsWithCounts}
          products={products || []}
          tracks={tracks || []}
          isOwner={isOwner}
          commissionRate={artist.referral_commission_rate ?? 0}
          liveSessions={liveSessions || []}
        />
      </div>
    </div>
    </ArtistPreviewProvider>
  );
}
