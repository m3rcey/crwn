'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';
import { ArtistProfile } from '@/types';
import { CommunityFeed } from '@/components/community';
import { Loader2, Users } from 'lucide-react';

export default function CommunityPage() {
  const { user, profile } = useAuth();
  const [artistProfiles, setArtistProfiles] = useState<ArtistProfile[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<ArtistProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchArtistProfiles = async () => {
      const { data, error } = await supabase
        .from('artist_profiles')
        .select(`
          *,
          profile:profiles(*)
        `);

      if (!isMounted) return;

      if (!error && data) {
        setArtistProfiles(data as ArtistProfile[]);
        // If user is an artist, select their community by default
        if (profile?.role === 'artist') {
          const userArtist = data.find((a: ArtistProfile) => a.user_id === user?.id);
          if (userArtist) {
            setSelectedArtist(userArtist);
          } else if (data.length > 0) {
            setSelectedArtist(data[0]);
          }
        } else if (data.length > 0) {
          setSelectedArtist(data[0]);
        }
      }

      setIsLoading(false);
    };

    fetchArtistProfiles();

    return () => {
      isMounted = false;
    };
  }, [profile?.role, user?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (artistProfiles.length === 0) {
    return (
      <div className="min-h-screen bg-crwn-bg p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12 bg-crwn-surface rounded-xl">
            <Users className="w-12 h-12 text-crwn-text-secondary mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-crwn-text mb-2">
              No Communities Yet
            </h1>
            <p className="text-crwn-text-secondary">
              Communities will appear here when artists create them.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-crwn-bg p-4">
      <div className="max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-crwn-gold mb-2">Community</h1>
          <p className="text-crwn-text-secondary">
            Connect with artists and fans in exclusive community spaces
          </p>
        </div>

        {/* Artist Selector */}
        {artistProfiles.length > 1 && (
          <div className="mb-6 overflow-x-auto">
            <div className="flex items-center gap-3 pb-2">
              <span className="text-sm text-crwn-text-secondary whitespace-nowrap">
                Select Community:
              </span>
              <div className="flex items-center gap-2">
                {artistProfiles.map((artist) => (
                  <button
                    key={artist.id}
                    onClick={() => setSelectedArtist(artist)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors whitespace-nowrap ${
                      selectedArtist?.id === artist.id
                        ? 'bg-crwn-gold text-crwn-bg'
                        : 'bg-crwn-surface text-crwn-text hover:bg-crwn-elevated'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-crwn-elevated overflow-hidden">
                      {artist.profile?.avatar_url ? (
                        <img
                          src={artist.profile.avatar_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-semibold">
                          {(artist.profile?.display_name || 'A').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-medium">
                      {artist.profile?.display_name || 'Unknown Artist'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Community Feed */}
        {selectedArtist && (
          <CommunityFeed
            artistCommunityId={selectedArtist.id}
            artistProfile={selectedArtist}
          />
        )}
      </div>
    </div>
  );
}
