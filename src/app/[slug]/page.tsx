import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Image from 'next/image';
import { SubscribeButton, TierCards } from '@/components/artist/SubscribeSection';
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

  // Get album track counts
  const albumsWithCounts = await Promise.all(
    ( albums || []).map(async (album) => {
      const { data: atData } = await supabase
        .from('album_tracks')
        .select('track:tracks(is_active)')
        .eq('album_id', album.id);
      const activeCount = (atData || []).filter((at: any) => at.track?.is_active !== false).length;
      return { ...album, track_count: activeCount };
    })
  );

  // Fetch artist's playlists
  const { data: playlists } = await supabase
    .from('playlists')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_artist_playlist', true)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Get playlist track counts
  const playlistsWithCounts = await Promise.all(
    (playlists || []).map(async (playlist) => {
      const { data: ptData } = await supabase
        .from('playlist_tracks')
        .select('track:tracks(is_active)')
        .eq('playlist_id', playlist.id);
      const activeCount = (ptData || []).filter((pt: any) => pt.track?.is_active !== false).length;
      return { ...playlist, track_count: activeCount };
    })
  );

  // Fetch shop products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  // Fetch booking sessions
  const { data: bookingSessions } = await supabase
    .from('booking_sessions')
    .select('*')
    .eq('artist_id', artist.id)
    .eq('is_active', true);

  const hasBookingSessions = (bookingSessions || []).length > 0;

  return (
    <div className="relative min-h-screen pb-20 md:pb-0">
      <BackgroundImage src="/backgrounds/bg-artist.jpg" overlayOpacity="bg-black/80" />
      <div className="relative z-10">
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
        <div className="px-4 sm:px-6 lg:px-8 -mt-16 relative z-10">
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
                  <FoundingBadge number={artist.founding_artist_number} size="sm" />
                )}
              </div>
              {artist.tagline && (
                <p className="text-crwn-text-secondary mt-1">{artist.tagline}</p>
              )}
            </div>

            {/* Subscribe Button */}

          </div>

          {/* Bio */}
          {artist.profile?.bio && (
            <div className="mt-4 mb-6 max-w-2xl">
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
          hasBookingSessions={hasBookingSessions}
          commissionRate={artist.referral_commission_rate || 10}
        />
      </div>
    </div>
  );
}
