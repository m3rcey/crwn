'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { 
  Compass, 
  Library, 
  Users, 
  Music,
  ArrowRight,
  Sparkles,
  Loader2
} from 'lucide-react';
import Image from 'next/image';
import { FadeIn } from '@/components/ui/FadeIn';
import { SkeletonCardGrid } from '@/components/ui/Skeleton';

interface ArtistProfile {
  id: string;
  user_id: string;
  slug: string;
  banner_url: string | null;
  tagline: string | null;
  profile?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export default function HomePage() {
  const { profile } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [featuredArtists, setFeaturedArtists] = useState<ArtistProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasArtistProfile, setHasArtistProfile] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch featured artists
      const { data: artistsData, error } = await supabase
        .from('artist_profiles')
        .select('*, profile:profiles(*)')
        .limit(6);

      if (!error && artistsData) {
        setFeaturedArtists(artistsData as ArtistProfile[]);
      }

      // Check if current user has an artist profile
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: artistData } = await supabase
          .from('artist_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        setHasArtistProfile(!!artistData);
      }

      setIsLoading(false);
    };

    fetchData();
  }, [supabase]);

  const quickActions = [
    {
      href: '/explore',
      label: 'Explore Artists',
      image: '/homepage_explore.png',
    },
    {
      href: '/library',
      label: 'My Library',
      image: '/homepage_library.png',
    },
    hasArtistProfile
      ? { href: '/profile/artist', label: 'Artist Dashboard', image: '/homepage_artistdashboard.png' }
      : { href: '/profile/artist', label: 'Become an Artist', image: '/homepage_artistdashboard.png' }
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 stagger-fade-in">
      {/* Greeting */}
      <div className="bg-crwn-surface rounded-xl p-6">
        <h1 className="text-2xl md:text-3xl font-bold text-crwn-text">
          {getGreeting()}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!
        </h1>
        <p className="text-crwn-text-secondary mt-2">
          Welcome to CRWN. Artists get supported. Fans get access. Everyone wins.
        </p>
      </div>

      {/* Program Links */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl stagger-fade-in">
        {hasArtistProfile && (
          <Link
            href="/founding-artists"
            className="rounded-xl overflow-hidden press-scale hover:scale-[1.03] transition-transform"
          >
            <div className="aspect-square relative max-w-[200px] mx-auto w-full rounded-xl overflow-hidden bg-crwn-elevated">
              <Image
                src="/homepage_founding-artist.png"
                alt="Founding Artist Program"
                fill
                priority
                className="object-cover"
              />
            </div>
            <p className="font-medium text-crwn-gold text-sm mt-2 text-center">Founding Artist Program</p>
          </Link>
        )}
        <Link
          href="/recruit"
          className="rounded-xl overflow-hidden press-scale hover:scale-[1.03] transition-transform"
        >
          <div className="aspect-square relative max-w-[200px] mx-auto w-full rounded-xl overflow-hidden bg-crwn-elevated">
            <Image
              src="/homepage_recruit.png"
              alt="Earn by Referring Artists"
              fill
              className="object-cover opacity-0 transition-opacity duration-500"
              onLoad={(e) => (e.target as HTMLImageElement).classList.remove('opacity-0')}
            />
          </div>
          <p className="font-medium text-green-400 text-sm mt-2 text-center">Earn by Referring Artists</p>
        </Link>
      </div>

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-semibold text-crwn-text mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl">
          {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-xl overflow-hidden press-scale hover:scale-[1.03] transition-transform"
              >
                <div className="aspect-square relative max-w-[200px] mx-auto w-full rounded-xl overflow-hidden bg-crwn-elevated">
                  <Image
                    src={action.image}
                    alt={action.label}
                    fill
                    className="object-cover opacity-0 transition-opacity duration-500"
                    onLoad={(e) => (e.target as HTMLImageElement).classList.remove('opacity-0')}
                  />
                </div>
                <p className="font-medium text-crwn-text text-sm mt-2 text-center">{action.label}</p>
              </Link>
          ))}
        </div>
      </section>

      {/* Featured Artists */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-crwn-text">Featured Artists</h2>
          <Link 
            href="/explore" 
            className="text-crwn-gold hover:text-crwn-gold-hover text-sm flex items-center gap-1"
          >
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl">
            {[1,2].map(i => <div key={i}><div className="aspect-square max-w-[200px] mx-auto w-full bg-crwn-elevated rounded-xl animate-pulse" /><div className="h-4 bg-crwn-elevated rounded w-3/4 mx-auto mt-2 animate-pulse" /></div>)}
          </div>
        ) : featuredArtists.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl">
            {featuredArtists.map((artist) => (
              <Link
                key={artist.id}
                href={`/${artist.slug}`}
                className="rounded-xl overflow-hidden press-scale hover:scale-[1.03] transition-transform"
              >
                <div className="aspect-square relative bg-crwn-elevated rounded-xl overflow-hidden max-w-[200px] mx-auto w-full">
                  {artist.profile?.avatar_url ? (
                    <Image
                      src={artist.profile.avatar_url}
                      alt={artist.profile?.display_name || 'Artist'}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary text-4xl font-semibold">
                      {(artist.profile?.display_name || 'A').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="font-medium text-crwn-text text-sm mt-2 text-center">
                  {artist.profile?.display_name || 'Artist'}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-crwn-surface rounded-xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-crwn-elevated flex items-center justify-center mx-auto mb-4">
              <Compass className="w-8 h-8 text-crwn-text-secondary" />
            </div>
            <h3 className="text-lg font-semibold text-crwn-text mb-2">
              No Artists Yet
            </h3>
            <p className="text-crwn-text-secondary mb-4">
              Be the first to explore and follow artists on CRWN!
            </p>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-4 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors"
            >
              Explore Artists
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
