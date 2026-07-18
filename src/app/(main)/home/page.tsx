'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
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
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SkeletonCardGrid } from '@/components/ui/Skeleton';
import { startTour } from '@/lib/tour';
import { fanHomeTourSteps } from '@/lib/fanTourSteps';
import { artistHomeTourSteps } from '@/lib/artistHomeTourSteps';
import { useTourCheck } from '@/hooks/useTourCheck';
import { useArtistSetup } from '@/hooks/useArtistSetup';
import { SupporterMode } from '@/components/fan/SupporterMode';

// Rotating daily welcome. Deterministic per calendar day (same all day, changes at
// midnight), so it feels alive without a random flicker on every render. No em
// dashes. Lines read for both an artist and a fan looking at Home.
const WELCOME_LINES = [
  'Artists get supported. Fans get access. Everyone wins.',
  'A follow pays nothing. Backing an artist is what keeps the music coming.',
  'The fans who show up early are the ones who get remembered.',
  'Streams pay pennies. Direct support is what actually pays an artist.',
  'The artist you sleep on today is the one you will claim you found first.',
  'Access, not algorithms. Get closer to the people you actually care about.',
  'Support goes further when it goes direct, with no middle layer taking the cut.',
  'The best seat is on the inside. That is what being a member gets you.',
  'Quiet fans get forgotten. Show up and you stop being a stranger.',
  'Every great run started with one first supporter. Today that could be you.',
];

function getDailyWelcome(): string {
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return WELCOME_LINES[dayIndex % WELCOME_LINES.length];
}

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
  const { profile, isArtist } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [featuredArtists, setFeaturedArtists] = useState<ArtistProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasArtistProfile, setHasArtistProfile] = useState(false);
  const setup = useArtistSetup();

  useEffect(() => {
    const fetchData = async () => {
      // Fetch featured artists
      // artist_profiles_public: same rows, minus the Stripe ids. `select('*')` on
      // the base table now fails (42501) because the audio/Stripe columns are
      // withheld by column grant and PostgREST expands `*` in the database.
      const { data: artistsData, error } = await supabase
        .from('artist_profiles_public')
        .select('*, profile:profiles(*)')
        .limit(50);

      if (!error && artistsData) {
        // Only feature artists with published music, so empty/incomplete signups
        // (no tracks, no avatar) don't show up as broken placeholder tiles.
        const ids = (artistsData as ArtistProfile[]).map((a) => a.id);
        let withMusic = new Set<string>();
        if (ids.length > 0) {
          const { data: musicRows } = await supabase
            .from('tracks')
            .select('artist_id')
            .eq('is_active', true)
            .in('artist_id', ids);
          withMusic = new Set((musicRows || []).map((t) => t.artist_id as string));
        }
        // A featured tile must be complete: has music AND an uploaded avatar,
        // otherwise it renders as a broken placeholder.
        const prof = (a: ArtistProfile) => {
          const p = (a as unknown as { profile?: { avatar_url?: string; is_active?: boolean } | { avatar_url?: string; is_active?: boolean }[] }).profile;
          return Array.isArray(p) ? p[0] : p;
        };
        const hasAvatar = (a: ArtistProfile) => !!prof(a)?.avatar_url;
        // Deactivated accounts (profiles.is_active === false) are hidden from
        // discovery. null/true both mean active.
        const isActive = (a: ArtistProfile) => prof(a)?.is_active !== false;
        setFeaturedArtists(
          (artistsData as ArtistProfile[])
            .filter((a) => withMusic.has(a.id) && hasAvatar(a) && isActive(a))
            .slice(0, 12)
        );
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

  // Trigger tour on first visit (split by role)
  const { shouldShowTour: shouldShowHomeTour, startStep: homeStartStep, markComplete: markHomeTourComplete, saveStep: saveHomeStep } = useTourCheck('home', profile?.id);

  const [showTourPrompt, setShowTourPrompt] = useState(false);

  useEffect(() => {
    if (!shouldShowHomeTour || !profile) return;

    // Artists are already onboarded via the setup wizard + the dashboard tour —
    // don't nag them with a SECOND, separate home tour right after. Silently mark
    // it done so the prompt never pops up on Home. Fans still get the home tour.
    if (profile.role === 'artist') {
      markHomeTourComplete();
      return;
    }

    // Fans: resume a partially completed tour, or prompt on first visit.
    if (homeStartStep > 0) {
      const timer = setTimeout(() => {
        startTour(fanHomeTourSteps, markHomeTourComplete, saveHomeStep, homeStartStep);
      }, 1500);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => setShowTourPrompt(true), 1000);
    return () => clearTimeout(timer);
  }, [shouldShowHomeTour, profile, homeStartStep, markHomeTourComplete, saveHomeStep]);

  // Launch the tour when arriving from the AccountHub "Replay the app tour" action
  // (it routes to /home?tour=1). Clean the URL so a refresh doesn't relaunch it.
  useEffect(() => {
    if (!profile || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('tour') !== '1') return;
    window.history.replaceState({}, '', '/home');
    const steps = profile.role === 'artist' ? artistHomeTourSteps : fanHomeTourSteps;
    const t = setTimeout(() => startTour(steps), 300);
    return () => clearTimeout(t);
  }, [profile]);

  const handleStartTour = () => {
    setShowTourPrompt(false);
    if (profile?.role === 'artist') {
      startTour(artistHomeTourSteps, markHomeTourComplete, saveHomeStep, 0);
    } else {
      startTour(fanHomeTourSteps, markHomeTourComplete, saveHomeStep, 0);
    }
  };

  const handleSkipTour = () => {
    setShowTourPrompt(false);
    markHomeTourComplete();
  };

  const quickActions = [
    {
      href: '/explore',
      label: 'Explore Artists',
      image: '/homepage_explore.jpg',
    },
    {
      href: '/library',
      label: 'My Library',
      image: '/homepage_library.jpg',
    },
    // Artist mode gets Studio + Artist Dashboard. Gated on isArtist() (the SAME
    // role-based signal the bottom nav uses for the Studio slot, true for role
    // 'artist' or 'admin'), so these can never disappear while Studio is in the
    // nav. hasArtistProfile (the DB row) is a belt-and-suspenders for a brand-new
    // artist whose profile.role still lags right after publishing.
    ...(isArtist() || hasArtistProfile
      ? [
          { href: '/studio', label: 'Studio', image: '/homepage_studio.jpg' },
          { href: '/profile/artist', label: 'Artist Dashboard', image: '/homepage_artistdashboard.jpg' },
        ]
      : [])
  ];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 stagger-fade-in">
      <ConfirmModal
        isOpen={showTourPrompt}
        title="Welcome to CRWN!"
        message="Want a quick tour to see how everything works? It only takes a minute."
        confirmText="Start Tour"
        cancelText="No Thanks"
        onConfirm={handleStartTour}
        onCancel={handleSkipTour}
      />
      {/* Greeting. The setup / Getting Started pill sits in NORMAL FLOW (a flex row,
          right-aligned, shrink-0) instead of absolutely positioned, so it reserves
          its own space and can never overlap the heading or anything else, on mobile
          or desktop. data-tour="home-help" stays so the home tours still land. */}
      <div className="bg-crwn-surface rounded-xl p-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold text-crwn-text">
            {getGreeting()}{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}!
          </h1>
          {setup.isArtist && !setup.loading && setup.steps.filter((s) => s.done).length < setup.steps.length ? (
            <Link
              href="/profile/artist"
              data-tour="home-help"
              className="flex-shrink-0 whitespace-nowrap mt-1 inline-flex items-center gap-1.5 rounded-full bg-crwn-elevated px-3 py-1.5 text-xs font-semibold text-crwn-gold hover:bg-crwn-elevated/80 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Finish setup {setup.steps.filter((s) => s.done).length}/{setup.steps.length}
            </Link>
          ) : (
            <Link
              href={`/getting-started?role=${profile?.role || 'fan'}`}
              data-tour="home-help"
              className="flex-shrink-0 whitespace-nowrap mt-1 inline-flex items-center gap-1.5 rounded-full bg-crwn-elevated px-3 py-1.5 text-xs font-medium text-crwn-text-secondary hover:text-crwn-gold transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Getting started
            </Link>
          )}
        </div>
        <p className="text-crwn-text-secondary mt-2">
          {getDailyWelcome()}
        </p>
      </div>

      {/* Supporter Mode — fans only (users without an artist profile). Renders
          nothing while the quest engine is dark-launched. Artists keep the
          standard home; their guided mode is Rise Mode on the dashboard. */}
      {!hasArtistProfile && <SupporterMode />}

      {/* Featured Artists */}
      <section data-tour="home-feed">
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
                      sizes="(max-width: 768px) 50vw, 200px"
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

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-semibold text-crwn-text mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl" data-tour="home-quick-actions">
          {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                data-tour={action.label === 'Artist Dashboard' ? 'home-artist-dashboard' : undefined}
                className="rounded-xl overflow-hidden press-scale hover:scale-[1.03] transition-transform"
              >
                <div className="aspect-square relative max-w-[200px] mx-auto w-full rounded-xl overflow-hidden bg-crwn-elevated">
                  <Image
                    src={action.image}
                    alt={action.label}
                    fill
                    sizes="(max-width: 768px) 50vw, 200px"
                    className="object-cover opacity-0 transition-opacity duration-500"
                    onLoad={(e) => (e.target as HTMLImageElement).classList.remove('opacity-0')}
                  />
                </div>
                <p className="font-medium text-crwn-text text-sm mt-2 text-center">{action.label}</p>
              </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
