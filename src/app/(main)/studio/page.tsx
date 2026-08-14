'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Sparkles } from 'lucide-react';

interface StudioCard {
  href: string;
  title: string;
  /**
   * REQUIRED for every real tile: a gold-toned charcoal+gold product photo in /public. A new tile
   * must ship with on-brand art (a charcoal object + gold accents on a gold gradient, like
   * studio_offers.jpg) AND a category `hueRotate` for color psychology — never an emoji. Generate
   * matching art with generate-studio-icons.mjs (passes existing tiles as style refs). Josh's rule.
   */
  image?: string;
  /** Deprecated last-resort fallback only. Do NOT ship a tile with an emoji instead of `image`. */
  emoji?: string;
  /**
   * Optional hue shift (degrees) applied to the gold product photo so a tool
   * can wear its category color without regenerating the art. Gold sits at ~46°:
   * 90 ≈ green, 170 ≈ blue, 255 ≈ magenta, 310 ≈ red. Omit to leave it gold.
   */
  hueRotate?: number;
}

// EVERY tile is a gold product photo + a category hueRotate (gold ≈ 46°). NO emoji placeholders:
// a tile without on-brand art reads as unfinished next to the rendered ones. Color encodes the
// tool's category so the grid is scannable by cluster (hueRotate shifts the gold base to that hue):
//   red 310 (make / go live / content) · gold (money / selling) · green 90 (growth / reach)
//   · magenta 255 (fans / community) · blue 170 (run the business / strategy).
// Order follows how an artist naturally works: make it → sell it → perform it → grow → engage fans
// → run the business. Position = workflow; color = category.
const STUDIO_CARDS: StudioCard[] = [
  // 1. MAKE — your catalog
  { href: '/studio/music',  title: 'Music',  image: '/studio_music.jpg',  hueRotate: 310 },
  { href: '/studio/albums', title: 'Albums', image: '/studio_albums.jpg', hueRotate: 310 },

  // 2. SELL — turn it into money
  { href: '/studio/shop', title: 'Shop',          image: '/studio_shop.jpg' },
  { href: '/offers',      title: 'Offer Builder', image: '/studio_offers.jpg' },

  // 3. GO LIVE — perform for the room
  { href: '/studio/live',   title: 'Live',               image: '/studio_live.jpg',  hueRotate: 310 },

  // PRE-PMF SURFACE REDUCTION, 2026-08-13. Founder decision.
  //
  // This grid carried FIFTEEN tiles for a product with nine artists and no qualified-market
  // validation. It now carries the five an artist needs to build something that can take money:
  // make it (Music, Albums), sell it (Shop, Offer Builder), perform it (Live).
  //
  // ELEVEN TILES WERE REMOVED AND NOTHING WAS DELETED. Live Clip Controls, Campaign Hub, Sync,
  // Fan Drives, Fan Missions, Clip Bounties, Fan Squads, Needs You, Manager, Playbooks and
  // Royalty Readiness all keep their routes, tables, rows, APIs and crons. This removes DEFAULT
  // PROMINENCE, which is the only cost that was being paid: every visible tile is a thing the
  // founder maintains, explains, keeps truthful in marketing, and that an artist must decide
  // about before doing the one thing that earns them a first paying member.
  //
  // THEY ARE STILL REACHABLE, AND THAT IS LOAD-BEARING. Several are the landing destination of a
  // public calculator's CTA, so hiding the tile must not orphan the funnel:
  //   /missions/new        <- fan-mission-generator
  //   /proof-of-demand/new <- proof-of-demand-test-builder
  //   /bounties/new        <- clip-to-earn-campaign-planner
  //   /royalty-readiness   <- royalty-readiness-check
  // Old shared links and ManyChat keywords keep working for the same reason.
  //
  // Re-add a tile when a qualified pilot artist needs it to reach a first paying member, not
  // because it looks empty here.
];

// The Royalty Readiness tile lived here behind its admin_settings flag. The FLAG IS STILL ON and
// the feature is untouched: /royalty-readiness works, and the royalty-readiness-check calculator's
// CTA still lands on it, which is the funnel path that matters. Only the Studio tile is gone, so
// the grid is not asking an artist to consider a diagnostic before they have anything to diagnose.

// Studio is a hub artists bounce in and out of all day. Without a cache the
// page blocks on a Supabase round trip behind a full-page spinner on EVERY
// mount, which is what makes backing out of a sub-page feel slow.
//
// Only the positive is cached. "Is an artist" is one-way: once an
// artist_profiles row exists it never disappears. Caching a negative would
// strand a fan who publishes their page mid-session on the "Studio is for
// artists" screen until a reload.
const knownArtists = new Set<string>();

/**
 * Studio — the artist workspace hub. Pure navigation: one card per core work
 * destination (music, albums, shop, offers, live). No data writes.
 */
export default function StudioPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Derived from the artist_profiles ROW, not profile.role — the useAuth
  // context role lags right after signup (see CLAUDE.md). null = still checking.
  const [isArtist, setIsArtist] = useState<boolean | null>(
    () => (user && knownArtists.has(user.id) ? true : null)
  );


  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (knownArtists.has(user.id)) {
      setIsArtist(true);
      return;
    }
    let active = true;
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) knownArtists.add(user.id);
        if (active) setIsArtist(!!data);
      });
    return () => {
      active = false;
    };
  }, [user, authLoading, router]);

  if (authLoading || isArtist === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (!isArtist) {
    return (
      <div className="max-w-2xl mx-auto page-fade-in">
        <div className="neu-raised rounded-xl p-8 text-center">
          <Sparkles className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">Studio is for artists</p>
          <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">
            Publish your artist page and this becomes your workspace: your music,
            your shop, your offers, and your live room.
          </p>
          <button
            onClick={() => router.push('/home')}
            className="mt-5 px-5 py-2 rounded-full font-semibold text-sm bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto page-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-crwn-text mb-1">Studio</h1>
        <p className="text-sm text-crwn-text-secondary">Your artist workspace.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 stagger-fade-in">
        {/* <Link prefetch>, not a button calling router.push: Next fetches each
            tile's route chunk while the grid is on screen, so tapping a tool
            paints immediately instead of spinning while its code downloads.
            That download-on-tap was what made the old dashboard tabs feel slow. */}
        {STUDIO_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            prefetch
            className="block rounded-xl overflow-hidden press-scale hover:scale-[1.03] transition-transform"
          >
            <div className="aspect-square relative max-w-[200px] mx-auto w-full rounded-xl overflow-hidden bg-crwn-elevated flex items-center justify-center">
              {card.image ? (
                <Image
                  src={card.image}
                  alt={card.title}
                  fill
                  sizes="(max-width: 768px) 50vw, 200px"
                  className="object-cover opacity-0 transition-opacity duration-500"
                  style={card.hueRotate ? { filter: `hue-rotate(${card.hueRotate}deg)` } : undefined}
                  onLoad={(e) => (e.target as HTMLImageElement).classList.remove('opacity-0')}
                />
              ) : (
                <span className="text-5xl">{card.emoji}</span>
              )}
            </div>
            <p className="font-medium text-crwn-text text-sm mt-2 text-center">{card.title}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
