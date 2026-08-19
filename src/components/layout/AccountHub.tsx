'use client';

// AccountHub — the hamburger-reached hub. Everything "manage my account / my
// business" lives here so the bottom tab bar is free for DOING the work.
// Modeled on the Lyft driver menu: an identity header on top, then collapsed
// accordion groups (one open at a time), badges for what needs attention.
//
// Every link out of here goes to a REAL ROUTE that wears the HubPage shell, with
// ?from=hub so its X in the top-left returns straight to this menu. They used to
// point at /profile/artist?tab=<id>, a dashboard that only honored seven of its
// sixteen tab ids, so "Payouts and tax" and "Referrals" both landed the artist on
// Rise Mode instead of the screen they asked for.
//
// Links are <Link prefetch>, not buttons calling router.push. That is the whole
// reason these screens now open instantly: Next downloads each route's chunk
// while the menu is on screen, so by the time a thumb lands the code is already
// in the browser. A button cannot be prefetched.
//
// The overlay deliberately sits UNDER the navigation (z-45 vs the nav's z-50) so
// the bottom tab bar on mobile and the sidebar on desktop stay visible and
// tappable. Nobody gets trapped in the menu.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useShowArtistUI } from '@/hooks/useServerRole';
import { usePlayer } from '@/hooks/usePlayer';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  X,
  ChevronDown,
  TrendingUp,
  Users,
  MessageCircle,
  Gift,
  UserCircle,
  Wallet,
  LayoutDashboard,
  LifeBuoy,
  GraduationCap,
  PlayCircle,
  Compass,
  Library,
  Coins,
  Bell,
  LogOut,
  ExternalLink,
  Crown,
  BarChart3,
  CreditCard,
  Music,
  Disc3,
  ShoppingBag,
  Radio,
  Film,
  Sparkles,
  CalendarCheck,
  Flag,
  Zap,
  Split,
  Megaphone,
  Milestone,
  Flame,
  MapPin,
  Target,
  Scissors,
  Shield,
  ShieldCheck,
  Lightbulb,
  MessageSquareQuote,
  Tag,
  Clapperboard,
  ClipboardList,
  BookOpen,
  Trophy,
} from 'lucide-react';

interface HubLink {
  label: string;
  href?: string;
  onClick?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  badge?: boolean;
  /** Destination wears the HubPage shell, so its X should return to this menu. */
  hub?: boolean;
}

interface HubSection {
  title: string;
  links: HubLink[];
}

export function AccountHub({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, profile, signOut, isArtist } = useAuth();
  const { resetPlayer } = usePlayer();
  const router = useRouter();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [platformTier, setPlatformTier] = useState<string | null>(null);
  const [stripeConnected, setStripeConnected] = useState(true);
  const [hasArtistRow, setHasArtistRow] = useState<boolean | null>(null);

  // Artist-ness is the OR of two signals, never the row alone. The useAuth context
  // role lags a token refresh (see CLAUDE.md), so it cannot be the only signal; but
  // the row read below can fail for reasons that have nothing to do with being an
  // artist, so a failed read must never DOWNGRADE a known artist to the fan menu.
  // Only ever upgrade.
  // The server-resolved role is folded into the first signal (it is the same
  // answer, a paint earlier), so the menu never opens on the fan index while the
  // profile row is still in flight.
  const artist = useShowArtistUI(isArtist()) || hasArtistRow === true;

  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    (async () => {
      const supabase = createBrowserSupabaseClient();
      // Do NOT add stripe_connect_id (or platform_stripe_*) to this select.
      // schema-phase2-stripe-id-column-privs.sql revoked SELECT on those columns
      // from `authenticated`, so naming one 42501s the WHOLE query and returns
      // null for every other column too. That is what silently hid "View as fan"
      // here for months: the slug was never actually fetched.
      const { data } = await supabase
        .from('artist_profiles')
        .select('slug, platform_tier')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      setHasArtistRow(!!data);
      if (!data) return;
      setSlug(data.slug ?? null);
      setPlatformTier(data.platform_tier ?? 'starter');
    })();
    return () => {
      active = false;
    };
    // `artist` is derived FROM this effect's result, so it must not be a dep:
    // including it would re-run the fetch once more for no new information.
  }, [open, user]);

  // Stripe connection drives the "Payouts and tax" badge. It has to come from the
  // server route because the column it is derived from is unreadable from the
  // browser by design. Non-blocking and defaults to "connected", so a failed
  // check never nags an artist who is already set up.
  useEffect(() => {
    if (!open || !artist || !user) return;
    let active = true;
    fetch('/api/stripe/connect/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setStripeConnected(!!d.connected);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, artist, user]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    if (href.startsWith('http')) window.location.href = href;
    else router.push(href);
  };

  const replayTour = () => {
    onClose();
    router.push('/home?tour=1');
  };

  const handleSignOut = async () => {
    resetPlayer();
    await signOut();
    window.location.href = '/login';
  };

  const firstName = (profile?.display_name || user?.email || 'You').split(' ')[0];
  const planLabel =
    platformTier === 'pro' ? 'Pro plan'
      : platformTier === 'scale' || platformTier === 'label' ? 'Scale plan'
      : 'Launch plan (free)';

  // EVERY screen the old 16-tab dashboard had is listed here. That is the point of
  // this menu: an artist who knew the tab strip must be able to find all sixteen
  // without learning a second place to look. Live, Sync, Albums, Shop, Manager,
  // Team and Promise Calendar were briefly Studio-grid-only and read as deleted.
  // Studio still shows the same destinations as a visual grid; neither surface is
  // exclusive, so there is no wrong place to look.
  // PRE-PMF SURFACE REDUCTION, 2026-08-13. Founder decision.
  //
  // This index carried every destination CRWN has ever built, because it was written to be the
  // COMPLETE index for an artist who had learned the old sixteen-tab strip. That artist does not
  // exist yet: there are nine accounts and no qualified-market validation. What the index now
  // holds is the path to a first paying member and the screens needed to run that, and nothing
  // else.
  //
  // EVERY REMOVED DESTINATION STILL WORKS. Quest board, Manager, Needs You, Playbooks, Royalty
  // Readiness, Fan Drives, Campaign Hub, Road To, Proof of Demand, City Unlocks, Fan Missions,
  // Clip Bounties, Fan Squads, Fan Suggestions, Live Clip Controls, Sync, Team Splits and DMs keep
  // their routes, tables, rows and APIs. Several are the landing destination of a public
  // calculator's CTA (/missions/new, /proof-of-demand/new, /bounties/new, /royalty-readiness), so
  // hiding the menu entry must never become a 404. Re-add an entry when a qualified pilot artist
  // needs it to reach a first paying member.
  const artistSections: HubSection[] = [
    {
      title: 'Grow',
      links: [
        { label: 'Rise Mode', href: '/profile/artist', icon: TrendingUp },
        { label: 'Studio (all tools)', href: '/studio', icon: LayoutDashboard },
        { label: 'Analytics', href: '/studio/analytics', icon: BarChart3, hub: true },
        { label: 'Fan CRM', href: '/studio/fans', icon: Users, hub: true },
        { label: 'Promise Calendar', href: '/studio/promise', icon: CalendarCheck, hub: true },
        // A proof library is a reference screen you review, not a destination you make things in,
        // so it is hub-only. NAV-001 asserts Studio -> Hub parity only, so this needs no exception.
        { label: 'Fan Proof', href: '/studio/testimonials', icon: MessageSquareQuote, hub: true },
      ],
    },
    {
      title: 'Music and shop',
      links: [
        { label: 'Music', href: '/studio/music', icon: Music, hub: true },
        { label: 'Albums', href: '/studio/albums', icon: Disc3, hub: true },
        { label: 'Shop', href: '/studio/shop', icon: ShoppingBag, hub: true },
        { label: 'Offer Builder', href: '/offers', icon: Tag, hub: true },
        { label: 'Live', href: '/studio/live', icon: Radio, hub: true },
      ],
    },
    {
      title: 'Your business',
      links: [
        { label: 'Your artist page', href: '/account/profile', icon: Crown, hub: true },
        { label: 'Fan tiers and pricing', href: '/account/tiers', icon: Coins, hub: true },
        { label: 'Payouts and tax', href: '/account/payouts', icon: Wallet, badge: !stripeConnected, hub: true },
        { label: 'Plan and billing', href: '/account/billing', icon: CreditCard, hub: true },
        // STAYS. This is the artist-side control for the Share-to-Earn commission rate, and
        // Share-to-Earn is an actively promoted calculator. Hiding it would make a live marketing
        // promise unconfigurable.
        { label: 'Referrals and clippers', href: '/account/referrals', icon: Gift, hub: true },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Your info', href: '/profile', icon: UserCircle },
        { label: 'Notification preferences', href: '/profile/notifications', icon: Bell },
      ],
    },
    {
      title: 'Support and resources',
      links: [
        { label: 'Help Center', href: '/support', icon: LifeBuoy },
        { label: 'Getting started guide', href: '/getting-started?role=artist', icon: GraduationCap },
        { label: 'Replay the app tour', onClick: replayTour, icon: PlayCircle },
      ],
    },
  ];

  // The fan product is the artist page they were sent to, their library, and their money.
  // Explore, the fan calendar, and the whole missions/squads/bounties/impact economy are hidden:
  // combined production usage across all of them is a handful of rows and zero fan referrals.
  //
  // /library is DELIBERATELY the money destination now (NAV-002). It carries ReferralDashboard,
  // which is the full Share-to-Earn loop: referral links, commissions, fan Stripe Connect and the
  // $25 cashout. /earn duplicated that and added clip earnings, so it is the one that goes.
  const fanSections: HubSection[] = [
    {
      title: 'Your music and money',
      links: [
        { label: 'My library', href: '/library', icon: Library },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Your info', href: '/profile', icon: UserCircle },
        { label: 'Notification preferences', href: '/profile/notifications', icon: Bell },
      ],
    },
    {
      title: 'Support and resources',
      links: [
        { label: 'Help Center', href: '/support', icon: LifeBuoy },
        { label: 'Getting started guide', href: '/getting-started?role=fan', icon: GraduationCap },
        { label: 'Replay the app tour', onClick: replayTour, icon: PlayCircle },
      ],
    },
  ];

  const sections = artist ? artistSections : fanSections;

  // First group starts EXPANDED. Four collapsed headers and nothing else is what
  // made a menu that holds sixteen screens read as a menu that holds none (same
  // as the Lyft driver menu, where the first group is already open).
  const activeSection = openSection ?? sections[0]?.title ?? null;

  return (
    <div
      className="fixed inset-0 z-[45] bg-[#0D0D0D] overflow-y-auto md:pl-64"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-lg mx-auto px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-28">
        {/* Close */}
        <div className="flex justify-start mb-4">
          <button onClick={onClose} aria-label="Close menu" className="text-gray-400 hover:text-white p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Identity header. The whole block is the tap target for artists: name,
            photo, and the explicit "View as fan" label all open the public page. */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => artist && slug && go(`/${slug}`)}
            disabled={!artist || !slug}
            aria-label={artist && slug ? 'View your page as a fan' : undefined}
            className="w-16 h-16 rounded-full overflow-hidden bg-[#2A2A2A] flex items-center justify-center flex-shrink-0 ring-2 ring-[#D4AF37] disabled:cursor-default"
          >
            {profile?.avatar_url ? (
              <Image src={profile.avatar_url} alt="" width={64} height={64} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl font-bold text-white">{firstName.charAt(0).toUpperCase()}</span>
            )}
          </button>
          <div className="min-w-0">
            {artist && slug ? (
              <>
                <button onClick={() => go(`/${slug}`)} className="block text-left">
                  <h1 className="text-2xl font-bold text-white truncate hover:text-[#D4AF37] transition-colors">
                    {profile?.display_name || firstName}
                  </h1>
                </button>
                <button
                  onClick={() => go(`/${slug}?preview=visitor`)}
                  className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[#D4AF37] hover:underline"
                >
                  View as fan
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-white truncate">{profile?.display_name || firstName}</h1>
                <p className="text-sm text-gray-500 truncate">{user?.email}</p>
              </>
            )}
          </div>
        </div>

        {/* Plan pill (artists): a persistent, honest upgrade hook */}
        {artist && (
          <button
            onClick={() => go('/account/billing')}
            className="w-full flex items-center justify-between rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] px-4 py-3 mb-6"
          >
            <span className="text-sm text-gray-300">
              {planLabel}
              {platformTier === 'starter' && <span className="text-gray-500"> (12% fee)</span>}
            </span>
            {platformTier === 'starter' && (
              <span className="text-sm font-semibold text-[#D4AF37]">Upgrade to Pro</span>
            )}
          </button>
        )}

        {/* Accordion sections */}
        <div className="space-y-2">
          {sections.map((section) => {
            const isOpen = activeSection === section.title;
            return (
              <div key={section.title} className="border-b border-[#1F1F1F]">
                <button
                  onClick={() => setOpenSection(isOpen ? '' : section.title)}
                  className="w-full flex items-center justify-between py-4"
                >
                  <span className="text-lg font-bold text-white">{section.title}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="pb-2">
                    {section.links.map((link) => {
                      const Icon = link.icon;
                      const row = (
                        <>
                          <Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                          <span className="text-base text-gray-200 flex-1">{link.label}</span>
                          {link.badge && <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />}
                        </>
                      );
                      const rowClass = 'w-full flex items-center gap-3 py-3 text-left';
                      if (!link.href) {
                        return (
                          <button key={link.label} onClick={link.onClick} className={rowClass}>
                            {row}
                          </button>
                        );
                      }
                      // prefetch is what makes these open with no spinner: the
                      // route's chunk is fetched while the menu is still open.
                      const href = link.hub
                        ? `${link.href}${link.href.includes('?') ? '&' : '?'}from=hub`
                        : link.href;
                      return (
                        <Link key={link.label} href={href} prefetch onClick={onClose} className={rowClass}>
                          {row}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="mt-6 w-full flex items-center gap-3 py-4 text-left border-t border-[#1F1F1F]"
        >
          <LogOut className="w-5 h-5 text-gray-400" />
          <span className="text-base text-gray-200">Log out</span>
        </button>
      </div>
    </div>
  );
}
