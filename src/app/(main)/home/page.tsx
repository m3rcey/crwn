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

const quickActions = [
  { 
    href: '/explore', 
    label: 'Explore Artists', 
    icon: Compass, 
    description: 'Discover new music',
    color: 'bg-crwn-gold'
  },
  { 
    href: '/library', 
    label: 'My Library', 
    icon: Library, 
    description: 'Your saved tracks',
    color: 'bg-crwn-elevated'
  },
  { 
    href: '/community', 
    label: 'Community', 
    icon: Users, 
    description: 'Join the conversation',
    color: 'bg-crwn-elevated'
  },
  { 
    href: '/profile/artist', 
    label: 'Become an Artist', 
    icon: Music, 
    description: 'Start creating',
    color: 'bg-crwn-elevated'
  },
];

export default function HomePage() {
  const { profile } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [featuredArtists, setFeaturedArtists] = useState<ArtistProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchArtists = async () => {
      const { data, error } = await supabase
        .from('artist_profiles')
        .select('*, profile:profiles(*)')
        .limit(6);

      if (!error && data) {
        setFeaturedArtists(data as ArtistProfile[]);
      }
      setIsLoading(false);
    };

    fetchArtists();
  }, [supabase]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Greeting */}
      <div className="bg-crwn-surface rounded-xl p-6">
        <h1 className="text-2xl md:text-3xl font-bold text-crwn-text">
          {getGreeting()}{profile?.display_name ? `, ${profile.display_name}` : ''}!
        </h1>
        <p className="text-crwn-text-secondary mt-2">
          Welcome to CRWN. Discover new music, connect with artists, and support the creative community.
        </p>
      </div>

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-semibold text-crwn-text mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="bg-crwn-surface hover:bg-crwn-elevated border border-crwn-elevated rounded-xl p-4 transition-colors group"
              >
                <div className={`w-10 h-10 rounded-lg ${action.color} flex items-center justify-center mb-3`}>
                  <Icon className="w-5 h-5 text-crwn-bg" />
                </div>
                <p className="font-medium text-crwn-text text-sm">{action.label}</p>
                <p className="text-xs text-crwn-text-secondary mt-1">{action.description}</p>
              </Link>
            );
          })}
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
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 text-crwn-gold animate-spin mx-auto" />
          </div>
        ) : featuredArtists.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {featuredArtists.map((artist) => (
              <Link
                key={artist.id}
                href={`/artist/${artist.slug}`}
                className="bg-crwn-surface hover:bg-crwn-elevated border border-crwn-elevated rounded-xl overflow-hidden transition-colors group"
              >
                <div className="relative h-24 md:h-32 bg-crwn-elevated">
                  {artist.banner_url ? (
                    <Image
                      src={artist.banner_url}
                      alt=""
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-crwn-gold/30" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-crwn-elevated overflow-hidden flex-shrink-0">
                      {artist.profile?.avatar_url ? (
                        <Image
                          src={artist.profile.avatar_url}
                          alt=""
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary font-semibold">
                          {(artist.profile?.display_name || 'A').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-crwn-text truncate">
                        {artist.profile?.display_name || 'Artist'}
                      </p>
                      {artist.tagline && (
                        <p className="text-xs text-crwn-text-secondary truncate">
                          {artist.tagline}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
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
