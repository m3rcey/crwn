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
import { ShareEarnWrapper } from '@/components/shared/ShareEarnWrapper';
import type { Metadata } from 'next';
import { getBenefitDisplayText, BENEFIT_CATALOG } from '@/lib/benefitCatalog';

interface ArtistPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ArtistPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('*, profile:profiles(*)')
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

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  // Check if user is logged in and if this is their profile
  const { data: { session } } = await supabase.auth.getSession();
  
  let isArtistProfile = false;
  if (session?.user) {
    const { data: artistProfile } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle();
    
    isArtistProfile = artistProfile?.id !== undefined;
  }

  // Fetch artist profile
  const { data: artist, error } = await supabase
    .from('artist_profiles')
    .select('*, profile:profiles(*)')
    .eq('slug', slug)
    .single();

  if (error || !artist) {
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
    // Convert tier benefits to display strings with icons
    const benefitStrings = tierBenefits.map((tb) => {
      const def = BENEFIT_CATALOG?.find((b) => b.type === tb.benefit_type);
      const icon = def?.icon || '✓';
      const text = getBenefitDisplayText(tb.benefit_type, tb.config);
      return `${icon} ${text}`;
    });
    // Also include legacy benefits from access_config for backward compatibility
    const legacyBenefits = t.access_config?.benefits || [];
    
    return {
      id: t.id,
      name: t.name,
      price: t.price,
      description: t.description,
      benefits: [...benefitStrings, ...legacyBenefits],
      tierBenefits: tierBenefits, // Store structured benefits for advanced features
      offersAnnual: t.offers_annual !== false,
      annualDiscountPercent: t.annual_discount_percent ?? 25,
    };
  });

  // Fetch artist's tracks
  const { data: tracks } = await supabase
    .from('tracks')
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


  return (
    <div className="relative min-h-screen pb-20 md:pb-0 page-fade-in">
      <BackgroundImage src="/backgrounds/bg-artist.jpg" overlayOpacity="bg-black/80" />
      <div className="relative z-10">
        {/* Live now banner */}
        {liveNow && (
          <a
            href={`/${artist.slug}/live/${liveNow.id}`}
            className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 transition-colors text-white px-4 py-3 text-center text-sm font-semibold"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            {(artist.profile?.display_name || 'Artist')} is live now — {liveNow.title}. Tap to join.
          </a>
        )}
        {/* Banner */}
        <div className="relative h-48 sm:h-64 md:h-80 w-full">
          {artist.banner_url ? (
            <Image
              src={artist.banner_url}
              alt={`${artist.profile?.display_name || 'Artist'} banner`}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-crwn-elevated to-crwn-bg" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg via-transparent to-transparent" />
        </div>

        {/* Profile Header */}
        <div className="px-4 sm:px-6 lg:px-8 -mt-16 relative z-10" data-tour="artist-page-header">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 sm:gap-6">
            {/* Avatar */}
            <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-crwn-bg overflow-hidden bg-crwn-surface">
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
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-crwn-text">
                  {artist.profile?.display_name || 'Artist Name'}
                </h1>
                {artist.is_verified && (
                  <span className="text-crwn-gold" title="Verified Artist">✓</span>
                )}
                {artist.is_founding_artist && artist.founding_artist_number && (
                  <span data-tour="founding-badge"><span data-tour="founding-badge"><FoundingBadge number={artist.founding_artist_number} size="sm" /></span></span>
                )}
              </div>
              <ShareEarnWrapper
                artistSlug={artist.slug}
                artistId={artist.id}
                commissionRate={artist.referral_commission_rate || 10}
              />
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

        {/* Content with Tabs */}
        <ArtistProfileContent
          artist={artist}
          tiers={tiers}
          albums={albumsWithCounts}
          playlists={playlistsWithCounts}
          products={products || []}
          tracks={tracks || []}
          isArtistProfile={isArtistProfile}
          commissionRate={artist.referral_commission_rate || 10}
        />
      </div>
    </div>
  );
}
