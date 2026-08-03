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
import { isPresentableArtistName } from '@/lib/publicName';

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
      // Explicit columns, NOT `*, profile:profiles(*)`. The tile renders five
      // fields; `*` pulled every artist_profiles column (bio, socials, cal.com,
      // payout config) plus every profiles column for 50 artists, to display 12.
      // That payload was one of the two reasons Home felt slow.
      const { data: artistsData, error } = await supabase
        .from('artist_profiles_public')
        .select('id, user_id, slug, banner_url, tagline, profile:profiles(id, display_name, avatar_url, is_active)')
        .limit(50);

      if (!error && artistsData) {
        // Only feature artists with published music, so empty/incomplete signups
        // (no tracks, no avatar) don't show up as broken placeholder tiles.
        const ids = (artistsData as unknown as ArtistProfile[]).map((a) => a.id);
        let withMusic = new Set<string>();
        let hidden = new Set<string>();
        if (ids.length > 0) {
          // `featured_hidden` is queried SEPARATELY and tolerantly, not added to the
          // select above, because schema-phase2-featured-hidden.sql may not be applied
          // yet. Naming an absent column in the main select would 42703 and blank the
          // whole Featured row; a failed side query just returns null and hides nobody.
          const [musicRes, hiddenRes] = await Promise.all([
            supabase.from('tracks').select('artist_id').eq('is_active', true).in('artist_id', ids),
            supabase.from('artist_profiles_public').select('id').eq('featured_hidden', true).in('id', ids),
          ]);
          withMusic = new Set((musicRes.data || []).map((t) => t.artist_id as string));
          hidden = new Set((hiddenRes.data || []).map((r) => r.id as string));
        }
        // A featured tile must be complete: has music AND an uploaded avatar,
        // otherwise it renders as a broken placeholder.
        const prof = (a: ArtistProfile) => {
          type P = { avatar_url?: string; is_active?: boolean; display_name?: string };
          const p = (a as unknown as { profile?: P | P[] }).profile;
          return Array.isArray(p) ? p[0] : p;
        };
        const hasAvatar = (a: ArtistProfile) => !!prof(a)?.avatar_url;
        // Deactivated accounts (profiles.is_active === false) are hidden from
        // discovery. null/true both mean active.
        const isActive = (a: ArtistProfile) => prof(a)?.is_active !== false;
        // display_name defaults to the signup email at the DB level, so an artist
        // who never set a real name would show their raw email as the tile name.
        // Treat that (and an empty name) as an incomplete profile and don't feature
        // it, the same way we require an avatar + music.
        const hasName = (a: ArtistProfile) => isPresentableArtistName(prof(a)?.display_name);
        setFeaturedArtists(
          (artistsData as unknown as ArtistProfile[])
            .filter((a) => withMusic.has(a.id) && hasAvatar(a) && isActive(a) && hasName(a) && !hidden.has(a.id))
            .slice(0, 12)
        );
      }

      setIsLoading(false);
    };

    // "Does this user have an artist_profiles row" is independent of the featured
    // grid, so it runs CONCURRENTLY rather than waiting behind it. It used to be
    // the tail of the same sequential chain, which meant the tiles, the tracks
    // lookup, an auth round trip and this query all queued one after another.
    const fetchIsArtist = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: artistData } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      setHasArtistProfile(!!artistData);
    };

    fetchData();
    fetchIsArtist();
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
      <div className="neu-raised p-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold text-crwn-text">
            {getGreeting()}{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}!
          </h1>
          {!(setup.isArtist && !setup.loading && setup.steps.filter((s) => s.done).length < setup.steps.length) && (
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

      {/* Next-action card. The one structural change of the v2 redesign: setup
          used to hide behind a low-contrast pill top-right while other artists'
          cards took the prime slot. The next move an artist should make is the
          first thing under the greeting, full width, with visible progress.
          Same route, same "Finish setup X/Y" label as the old chip. */}
      {setup.isArtist && !setup.loading && setup.steps.filter((s) => s.done).length < setup.steps.length && (() => {
        const done = setup.steps.filter((s) => s.done).length;
        const total = setup.steps.length;
        const next = setup.steps.find((s) => !s.done);
        const stepCopy: Record<string, { title: string; body: string }> = {
          profile: { title: 'Add your profile photo', body: 'Fans decide in one glance. A page with no face gets skipped.' },
          monetize: { title: 'Confirm your membership ladder', body: 'Without a paid tier, every superfan visit leaves money uncollected.' },
          music: { title: 'Upload your first track', body: 'The audio file fans will hear. This one starts free.' },
          shop: { title: 'Add something to sell', body: 'A page with nothing to buy turns ready-to-pay fans away.' },
        };
        const copy = next ? stepCopy[next.key] : undefined;
        return (
          <div
            className="rounded-2xl p-6"
            style={{
              border: '1px solid var(--crwn-gold-tint-border)',
              background: 'radial-gradient(110% 130% at 12% 0%, rgba(212,175,55,0.16) 0%, rgba(26,26,26,0) 62%), #1a1a1a',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-crwn-gold">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Finish setup</span>
              </div>
              <span className="text-xs text-crwn-gold">{done}/{total}</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(212,175,55,0.16)' }}>
              <div
                className="h-full rounded-full bg-crwn-gold transition-all"
                style={{ width: `${Math.round((done / total) * 100)}%` }}
              />
            </div>
            {copy && (
              <>
                <div className="mt-3 text-lg font-semibold text-crwn-text">{copy.title}</div>
                <p className="mt-1 text-sm text-crwn-muted-tint leading-relaxed">{copy.body}</p>
              </>
            )}
            <Link
              href="/profile/artist"
              data-tour="home-help"
              className="neu-button-accent mt-4 inline-flex h-12 w-full items-center justify-center gap-1.5 text-sm md:w-auto md:px-6"
            >
              <Sparkles className="w-4 h-4" />
              Finish setup {done}/{total}
            </Link>
          </div>
        );
      })()}

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
