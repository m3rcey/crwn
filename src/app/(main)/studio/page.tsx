'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Sparkles } from 'lucide-react';

interface StudioCard {
  href: string;
  title: string;
  /** Gold-toned product photo in /public, matching the Home Quick Actions tiles. */
  image?: string;
  /** Emoji tile fallback for newer tools that don't have a product photo yet. */
  emoji?: string;
  /**
   * Optional hue shift (degrees) applied to the gold product photo so a tool
   * can wear its category color without regenerating the art. Gold sits at ~46°:
   * 90 ≈ green, 170 ≈ blue, 255 ≈ magenta, 310 ≈ red. Omit to leave it gold.
   */
  hueRotate?: number;
}

// Tile color encodes the tool's category so the grid is scannable by cluster:
//   green (growth/reach) · blue (strategy/planning) · magenta (fans/community)
//   · red (live/content) · gold/unshifted (money/value, the brand anchor).
// hueRotate shifts the gold product photo to that family (gold ≈ 46°).
const STUDIO_CARDS: StudioCard[] = [
  { href: '/campaigns',            title: 'Road To',            image: '/studio_campaigns.jpg', hueRotate: 90 },
  { href: '/playbooks',            title: 'Playbooks',          image: '/studio_playbooks.jpg', hueRotate: 170 },
  { href: '/offers',               title: 'Offer Builder',      image: '/studio_offers.jpg' },
  { href: '/campaign-hub',         title: 'Campaign Hub',       image: '/studio_campaign.jpg', hueRotate: 90 },
  { href: '/missions',             title: 'Fan Missions',       image: '/studio_missions.jpg', hueRotate: 255 },
  { href: '/squads',               title: 'Fan Squads',         image: '/studio_squads.jpg', hueRotate: 255 },
  { href: '/bounties',             title: 'Clip Bounties',      image: '/studio_bounties.jpg', hueRotate: 310 },
  { href: '/city-unlocks',         title: 'City Unlocks',       image: '/studio_cityunlocks.jpg', hueRotate: 90 },
  { href: '/studio/fans',          title: 'Fan CRM',            image: '/studio_crm.jpg', hueRotate: 255 },
  { href: '/profile/artist?tab=team',     title: 'Team Splits', image: '/studio_team.jpg' },
  { href: '/profile/artist?tab=promise',  title: 'Promise Calendar', image: '/studio_promise.jpg', hueRotate: 170 },
  { href: '/missions/suggestions', title: 'Fan Suggestions',    image: '/studio_suggestions.jpg', hueRotate: 255 },
  { href: '/clip-controls',        title: 'Live Clip Controls', image: '/studio_clips.jpg', hueRotate: 310 },
  { href: '/action-plan',          title: 'Action Plan',        image: '/studio_actionplan.jpg', hueRotate: 170 },
  { href: '/proof-of-demand',      title: 'Proof of Demand',    image: '/studio_demand.jpg', hueRotate: 90 },
];

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
 * Studio — the artist workspace hub. Pure navigation: one card per connector
 * feature (offers, campaigns, missions, clips, action plan, demand tests) so
 * artists reach everything from the nav without typing URLs. No data writes.
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
            Publish your artist page and this becomes your workspace: offers,
            campaigns, missions, and more.
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
        {STUDIO_CARDS.map((card) => (
          <button
            key={card.href}
            onClick={() => router.push(card.href)}
            className="rounded-xl overflow-hidden press-scale hover:scale-[1.03] transition-transform"
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
          </button>
        ))}
      </div>
    </div>
  );
}
