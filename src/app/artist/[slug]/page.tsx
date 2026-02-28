import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Image from 'next/image';
import { TrackList } from '@/components/player/TrackList';
import { SubscribeButton } from '@/components/artist/SubscribeButton';

interface ArtistPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  // Fetch artist profile with user profile
  const { data: artist, error } = await supabase
    .from('artist_profiles')
    .select(`
      *,
      profile:profiles(*)
    `)
    .eq('slug', slug)
    .single();

  if (error || !artist) {
    notFound();
  }

  // Fetch artist's tracks
  const { data: tracks } = await supabase
    .from('tracks')
    .select('*')
    .eq('artist_id', artist.id)
    .order('created_at', { ascending: false });

  // Fetch subscription tiers
  const tiers = artist.tier_config || [];

  return (
    <div className="min-h-screen bg-crwn-bg">
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
            </div>
            {artist.tagline && (
              <p className="text-crwn-text-secondary mt-1">{artist.tagline}</p>
            )}
          </div>

          {/* Subscribe Button */}
          <SubscribeButton tiers={tiers} artistSlug={slug} />
        </div>

        {/* Bio */}
        {artist.profile?.bio && (
          <div className="mt-6 max-w-2xl">
            <p className="text-crwn-text-secondary whitespace-pre-wrap">
              {artist.profile.bio}
            </p>
          </div>
        )}

        {/* Social Links */}
        {artist.profile?.social_links && Object.keys(artist.profile.social_links).length > 0 && (
          <div className="mt-4 flex gap-3">
            {Object.entries(artist.profile.social_links).map(([platform, url]) => (
              <a
                key={platform}
                href={url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="text-crwn-gold hover:text-crwn-gold-hover text-sm capitalize"
              >
                {platform}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Subscription Tiers */}
        {tiers.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-crwn-text mb-4">Subscription Tiers</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tiers.map((tier: any) => (
                <div
                  key={tier.id}
                  className="bg-crwn-surface border border-crwn-elevated rounded-xl p-4"
                >
                  <h3 className="font-semibold text-crwn-gold">{tier.name}</h3>
                  <p className="text-2xl font-bold text-crwn-text mt-2">
                    ${(tier.price / 100).toFixed(2)}/mo
                  </p>
                  <p className="text-crwn-text-secondary text-sm mt-2">
                    {tier.description}
                  </p>
                  {tier.benefits && tier.benefits.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {tier.benefits.map((benefit: string, idx: number) => (
                        <li key={idx} className="text-sm text-crwn-text-secondary flex items-center gap-2">
                          <span className="text-crwn-gold">✓</span> {benefit}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tracks */}
        <section>
          <h2 className="text-xl font-semibold text-crwn-text mb-4">Music</h2>
          {tracks && tracks.length > 0 ? (
            <TrackList tracks={tracks} artistSlug={slug} />
          ) : (
            <p className="text-crwn-text-secondary">No tracks released yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
