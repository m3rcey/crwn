'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useShowArtistUI } from '@/hooks/useServerRole';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Compass, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { FadeIn } from '@/components/ui/FadeIn';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SkeletonCardGrid } from '@/components/ui/Skeleton';
import { startTour } from '@/lib/tour';
import { fanHomeTourSteps } from '@/lib/fanTourSteps';
import { artistHomeTourSteps } from '@/lib/artistHomeTourSteps';
import { useTourCheck } from '@/hooks/useTourCheck';
import { useArtistContext } from '@/hooks/useArtistContext';
import { NextMoveCard } from '@/components/artist/NextMoveCard';
import { resolveOperatingFlow } from '@/lib/constraint/presentation';
import { resolveRiseNextMove } from '@/lib/riseNextMove';
import {
  resolveArtistHome,
  formatHomeMoney,
  FIRST_PAID_STEP_KEY,
  type RoadmapStats,
} from '@/lib/artistHome';
import type { ConstraintResult } from '@/lib/constraint/types';
import type { ArtistRoadmap } from '@/lib/artistRoadmap';
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
  // The server already resolved the role for this request, so the artist tiles and
  // Supporter Mode are decided before the first paint. Reading it only through
  // useAuth meant this page rendered its FAN layout on every load and swapped once
  // the profile row arrived.
  const showArtistUI = useShowArtistUI(isArtist());
  const supabase = createBrowserSupabaseClient();
  const [featuredArtists, setFeaturedArtists] = useState<ArtistProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasArtistProfile, setHasArtistProfile] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // ARTIST HOME: the economic command center (2026-10-03). Home decides NOTHING here. It reads
  // the same two canonical answers Rise Mode reads (Constraint Engine + Roadmap), flattens them
  // with the same resolver, and adds the one month figure /api/analytics already computes. All
  // three routes derive the artist from the SESSION (analytics re-checks the id against it), so a
  // fan never receives an artist's books, and nothing is fetched until the session resolves to an
  // artist. What may render is decided by `resolveArtistHome` (src/lib/artistHome.ts).
  const { status: artistStatus, context: artistContext } = useArtistContext();
  const artistId = artistContext?.artistId ?? null;
  const [constraintResult, setConstraintResult] = useState<ConstraintResult | null>(null);
  const [roadmap, setRoadmap] = useState<ArtistRoadmap | null>(null);
  const [roadmapStats, setRoadmapStats] = useState<RoadmapStats | null>(null);
  const [canonicalSettled, setCanonicalSettled] = useState(false);
  // undefined = in flight, null = unavailable. Never collapsed into 0.
  const [earnedThisMonth, setEarnedThisMonth] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (artistStatus !== 'artist' || !artistId) return;
    let active = true;
    const json = (r: Response) => (r.ok ? r.json() : null);
    // In parallel: the move and the money row must not queue behind each other.
    Promise.all([
      fetch('/api/artist/constraint').then(json).catch(() => null),
      fetch('/api/artist/roadmap').then(json).catch(() => null),
    ]).then(([c, r]) => {
      if (!active) return;
      setConstraintResult(c?.constraint ?? null);
      setRoadmap(r?.roadmap ?? null);
      const st = r?.stats;
      setRoadmapStats(
        st && typeof st.paidMembers === 'number' && typeof st.mrrCents === 'number'
          ? { members: Number(st.members) || 0, paidMembers: st.paidMembers, mrrCents: st.mrrCents }
          : null,
      );
      setCanonicalSettled(true);
    });
    fetch(`/api/analytics?artistId=${encodeURIComponent(artistId)}`)
      .then(json)
      .then((a) => {
        if (!active) return;
        const v = a?.revenue?.thisMonth;
        setEarnedThisMonth(typeof v === 'number' && Number.isFinite(v) ? v : null);
      })
      .catch(() => {
        if (active) setEarnedThisMonth(null);
      });
    return () => {
      active = false;
    };
  }, [artistStatus, artistId]);

  const isArtistHome = artistStatus === 'artist';
  // The SAME move Rise Mode shows, pointed back at Home: a flow started here returns here.
  const nextMove = resolveRiseNextMove(resolveOperatingFlow(constraintResult), roadmap, '/home');
  const firstPaidDone = roadmap
    ? roadmap.stages.flatMap((st) => st.steps).find((st) => st.key === FIRST_PAID_STEP_KEY)?.done ?? null
    : null;
  const home = resolveArtistHome({
    isArtist: isArtistHome,
    settled: canonicalSettled,
    haveCanonicalAnswer: Boolean(constraintResult || roadmap),
    hasMove: Boolean(nextMove.move),
    stats: roadmapStats,
    firstPaidDone,
    earnedThisMonthCents: earnedThisMonth,
  });
  const artistSlug = isArtistHome ? artistContext?.slug || null : null;

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
        // null = the opt-in column is not there yet, so nobody is filtered by it.
        let optedIn: Set<string> | null = null;
        if (ids.length > 0) {
          // `featured_hidden` is queried SEPARATELY and tolerantly, not added to the
          // select above, because schema-phase2-featured-hidden.sql may not be applied
          // yet. Naming an absent column in the main select would 42703 and blank the
          // whole Featured row; a failed side query just returns null and hides nobody.
          //
          // `featured_on_home` is the OPT-IN (schema-phase2-featured-on-home-opt-in.sql,
          // founder decision 2026-09-26): a new artist is not on this row until the
          // founder puts them there. It governs this row only; Explore still reads
          // `featured_hidden` alone. Same tolerance: before that migration runs the
          // query errors and the row falls back to the old rule instead of going blank.
          const [musicRes, hiddenRes, optInRes] = await Promise.all([
            supabase.from('tracks').select('artist_id').eq('is_active', true).in('artist_id', ids),
            supabase.from('artist_profiles_public').select('id').eq('featured_hidden', true).in('id', ids),
            supabase.from('artist_profiles_public').select('id').eq('featured_on_home', true).in('id', ids),
          ]);
          withMusic = new Set((musicRes.data || []).map((t) => t.artist_id as string));
          hidden = new Set((hiddenRes.data || []).map((r) => r.id as string));
          if (!optInRes.error) optedIn = new Set((optInRes.data || []).map((r) => r.id as string));
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
            .filter((a) => (optedIn === null || optedIn.has(a.id)) && withMusic.has(a.id) && hasAvatar(a) && isActive(a) && hasName(a) && !hidden.has(a.id))
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

  // QUICK ACTIONS WAS DELETED on 2026-08-19, and the Artist Dashboard tile with it.
  //
  // Every tile in it was a second door to a bottom-nav slot. A fan got "My Library", which is
  // their Library slot. An artist got "Studio", which is their Studio slot, and "Artist
  // Dashboard", which pointed at /profile/artist, which is their Rise slot. The label was also
  // a leftover: /profile/artist has not been a dashboard since the 2026-08-13 simplification,
  // it is Rise Mode and shows ONE next move.
  //
  // Nothing was hidden and nothing lost a route. The section was a duplicate index of the tab
  // bar sitting directly above the tab bar. Everyone lands on /home at login, artists included
  // (founder, 2026-08-20), so for an artist this page is the command center above: money once a
  // fan has paid, then the one canonical move, then their storefront, then discovery.

  // The grid narrows to the number of complete artists, so the row is always FULL rather
  // than a 3-column layout with a hole in it. That gap is the whole difference between a
  // page that is sparse and one that looks broken. Never pad the set to fill the grid: a
  // tile needs music AND an avatar AND a presentable name, and a placeholder tile is worse
  // than a short row.
  const featuredGrid =
    featuredArtists.length <= 2
      ? 'grid grid-cols-2 gap-3 max-w-md'
      : 'grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className={`max-w-4xl mx-auto ${showArtistUI ? 'space-y-6' : 'space-y-8'} stagger-fade-in`}>
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
          <Link
              href={`/getting-started?role=${profile?.role || 'fan'}`}
              data-tour="home-help"
              className="flex-shrink-0 whitespace-nowrap mt-1 inline-flex items-center gap-1.5 rounded-full bg-crwn-elevated px-3 py-1.5 text-xs font-medium text-crwn-text-secondary hover:text-crwn-gold transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Getting started
            </Link>
        </div>
        {/* The rotating line is written to a FAN ("Today that could be you"). An artist gets their
            own evidence below instead of a slogan, and the space keeps their next move higher. */}
        {!showArtistUI && (
          <p className="text-crwn-text-secondary mt-2">
            {getDailyWelcome()}
          </p>
        )}
      </div>

      {/* MONEY. Only once a fan has paid (a paying member now, or the roadmap's first-paid
          fact). Before that a "$0" banner is a verdict, not direction, so the move leads instead.
          Every figure is a canonical one read back, never computed here:
            earned this month  /api/analytics revenue.thisMonth (refund-netted earnings ledger)
            monthly recurring  /api/artist/roadmap stats.mrrCents (countsAsPaying)
            paying members     /api/artist/roadmap stats.paidMembers
          No "vs last month" percentage: that would compare a part month with a whole one. */}
      {home.money && (() => {
        const m = home.money;
        const plural = (n: number) => `${n} paying member${n === 1 ? '' : 's'}`;
        const showEarned = m.earnedThisMonthCents !== null || m.earnedPending;
        return (
          <section
            data-home="money"
            aria-label="Your fan business"
            className="rounded-2xl p-5"
            style={{
              border: '1px solid var(--crwn-gold-tint-border)',
              background: 'radial-gradient(110% 130% at 12% 0%, rgba(212,175,55,0.16) 0%, rgba(26,26,26,0) 62%), #1a1a1a',
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-crwn-gold">
              {showEarned ? 'Earned this month' : 'Monthly recurring'}
            </p>
            {showEarned && m.earnedThisMonthCents === null ? (
              <div className="mt-2 h-9 w-32 rounded bg-crwn-elevated animate-pulse" aria-hidden="true" />
            ) : (
              <p className="mt-1 text-4xl font-bold text-crwn-text">
                {formatHomeMoney(showEarned ? (m.earnedThisMonthCents as number) : m.recurringMonthlyCents)}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-sm text-crwn-text-secondary">
                {showEarned
                  ? `${formatHomeMoney(m.recurringMonthlyCents)} monthly recurring · ${plural(m.payingMembers)}`
                  : plural(m.payingMembers)}
              </p>
              <Link prefetch href="/studio/analytics" className="shrink-0 text-xs text-crwn-gold hover:underline">
                Details
              </Link>
            </div>
          </section>
        );
      })()}

      {/* THE ONE MOVE. The same card and the same resolved move as Rise Mode, so the two screens
          cannot disagree. This replaced a "Finish setup" card driven by the setup wizard's own
          four steps, a second progression system that could name a different next step than the
          roadmap. The roadmap's Foundation stage now names the setup work. The full-roadmap
          disclosure stays on Rise Mode (roadmap={null}): Home orients, Rise executes. */}
      {isArtistHome && home.showMove && (
        canonicalSettled ? (
          <NextMoveCard next={nextMove} roadmap={null} />
        ) : (
          <div className="neu-raised rounded-2xl p-6" aria-hidden="true">
            <div className="h-3 w-40 rounded bg-crwn-elevated animate-pulse" />
            <div className="mt-4 h-7 w-3/4 rounded bg-crwn-elevated animate-pulse" />
            <div className="mt-3 h-4 w-full rounded bg-crwn-elevated animate-pulse" />
            <div className="mt-5 h-10 w-36 rounded-full bg-crwn-elevated animate-pulse" />
          </div>
        )
      )}

      {/* YOUR PAGE: utility, never the headline once something else is.
          The public page is not in the tab bar, so this card is how an artist reaches it (new
          artists are not on the Featured row). Before the first paid fan the loss line stays,
          because sending the link really is the road to that fan. After it the card is plain
          utility. The button is gold only when no move holds the screen's one gold button. */}
      {artistSlug && (
        <section className="neu-raised p-6">
          {home.storefrontVoice === 'loss' ? (
            <>
              <h2 className="text-lg font-semibold text-crwn-text">
                Nobody can pay you from a link you never send.
              </h2>
              <p className="text-crwn-text-secondary text-sm mt-1">
                This is your storefront. Every subscribe and every sale starts here.
              </p>
            </>
          ) : (
            <h2 className="text-lg font-semibold text-crwn-text">Your storefront</h2>
          )}
          <p className="mt-4 font-mono text-sm text-crwn-gold break-all">
            thecrwn.app/{artistSlug}
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <Link
              href={`/${artistSlug}`}
              className={
                home.storefrontPrimary
                  ? 'neu-button-accent inline-flex h-11 items-center justify-center gap-1.5 px-6 text-sm'
                  : 'inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-crwn-elevated px-6 text-sm font-medium text-crwn-text hover:text-crwn-gold transition-colors'
              }
            >
              Open my page
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`https://thecrwn.app/${artistSlug}`);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 1800);
                } catch {
                  /* Clipboard blocked (insecure context, older mobile browser). The URL is
                     printed above precisely so this failing still leaves it selectable. */
                }
              }}
              className="inline-flex h-11 items-center justify-center rounded-full bg-crwn-elevated px-6 text-sm font-medium text-crwn-text hover:text-crwn-gold transition-colors"
            >
              {copiedLink ? 'Link copied' : 'Copy link'}
            </button>
          </div>
        </section>
      )}

      {/* Supporter Mode — fans only (users without an artist profile). Renders
          nothing while the quest engine is dark-launched. Artists keep the
          standard home; their guided mode is Rise Mode on the dashboard. */}
      {!hasArtistProfile && !showArtistUI && <SupporterMode />}

      {/* Featured Artists */}
      <section data-tour="home-feed">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-crwn-text">Featured Artists</h2>
          <Link 
            href="/explore" 
            className="text-crwn-gold hover:text-crwn-gold-hover text-sm flex items-center gap-1"
          >
            Explore <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className={featuredGrid}>
            {[1,2].map(i => <div key={i}><div className="aspect-square max-w-[200px] mx-auto w-full bg-crwn-elevated rounded-xl animate-pulse" /><div className="h-4 bg-crwn-elevated rounded w-3/4 mx-auto mt-2 animate-pulse" /></div>)}
          </div>
        ) : featuredArtists.length > 0 ? (
          <div className={featuredGrid}>
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

    </div>
  );
}
