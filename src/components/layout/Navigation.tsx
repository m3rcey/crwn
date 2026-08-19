'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useShowArtistUI } from '@/hooks/useServerRole';
import { usePlayer } from '@/hooks/usePlayer';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { AccountHub } from '@/components/layout/AccountHub';
import { hapticLight } from '@/lib/haptics';
import { consumeHubReopen } from '@/lib/navigation';
import {
  Home,
  Compass,
  Flag,
  MessageCircle,
  TrendingUp,
  Library,
  LayoutDashboard,
  Menu,
  LogOut
} from 'lucide-react';

// PRE-PMF SURFACE REDUCTION, 2026-08-13. Founder decision. Five slots became THREE for an
// artist and TWO for a fan.
//
// Removed: Explore (nine artists is not a catalogue, and a discovery tab implies a marketplace
// CRWN is not) and Messages (0 DM conversations ever, and DMs are Pro-gated to zero artists).
// Both routes still exist; only the tab is gone.
//
// The fan's /command "Missions" slot went with the rest of the fan mission economy. Its money
// destination is /library, which carries ReferralDashboard: referral links, commissions, fan
// Stripe Connect and cashout. That is the whole Share-to-Earn loop and it is actively marketed,
// so the fan keeps a one-tap route to it.
//
// tourIds are persistence keys. The surviving slots keep theirs unchanged, so nobody who
// dismissed the tour sees it replay. The retired slots' anchors ('nav-explore', 'nav-messages',
// 'nav-earn') simply stop being rendered; their ids are not reused for anything else.
//
// Management screens are NOT here. They live in the hamburger AccountHub.
const artistStudioSlot = { href: '/studio', label: 'Studio', icon: LayoutDashboard, tourId: 'nav-studio' };
const artistRiseSlot = { href: '/profile/artist', label: 'Rise', icon: TrendingUp, tourId: 'nav-rise' };
const fanLibrarySlot = { href: '/library', label: 'Library', icon: Library, tourId: 'nav-library' };

const buildNavItems = (isArtist: boolean) =>
  isArtist
    ? [
        { href: '/home', label: 'Home', icon: Home, tourId: 'nav-home' },
        artistStudioSlot,
        artistRiseSlot,
      ]
    : [
        { href: '/home', label: 'Home', icon: Home, tourId: 'nav-home' },
        fanLibrarySlot,
      ];

export function Navigation() {
  const pathname = usePathname();
  const { user, profile, signOut, isArtist } = useAuth();
  // Artists + admins → Studio. The server-resolved role wins where it exists, so
  // the tab bar is already correct in the first HTML. Without it this rendered the
  // FAN set on every load (profile is null until the browser has fetched it) and
  // visibly swapped in the third slot half a second later.
  const navItems = buildNavItems(useShowArtistUI(isArtist()));
  const { resetPlayer } = usePlayer();
  const router = useRouter();
  const [hubOpen, setHubOpen] = useState(false);

  // On every navigation the hub's open state is re-derived from the reopen flag:
  // open iff an X-returns-to-hub was requested, closed otherwise. That single rule
  // does two jobs. It reopens the menu after a hub screen's X (the flag is set by
  // requestHubReopen, consumed once here so it can never fire twice or on an
  // unrelated navigation). And it CLOSES the menu when the artist taps a tab-bar
  // link while it is open: those links only change the pathname, so without this
  // the z-45 overlay stayed mounted on top of the new page.
  useEffect(() => {
    setHubOpen(consumeHubReopen());
  }, [pathname]);

  const isActive = (href: string, match?: string) => {
    const base = match || href;
    if (base === '/home') return pathname === '/home';
    return pathname.startsWith(base);
  };

  const handleSignOut = async () => {
    resetPlayer();
    await signOut();
    window.location.href = '/login';
  };

  // Don't show nav on auth pages
  if (!user || pathname.startsWith('/login') || pathname.startsWith('/signup')) {
    return null;
  }

  return (
    <>
      {/* Hamburger → AccountHub. Top-left, mobile only. Everything "manage my
          account" moved off the tab bar into this hub, which freed the 5th slot.
          Hidden while the hub is open: it floats above the overlay and would sit
          on top of the hub's own X. */}
      {!hubOpen && (
        <button
          onClick={() => setHubOpen(true)}
          aria-label="Open menu"
          data-tour="account-hub"
          className="md:hidden fixed left-3 z-[70] w-10 h-10 rounded-full bg-[#1a1a1a]/90 backdrop-blur flex items-center justify-center text-crwn-text shadow-lg"
          style={{ top: 'calc(0.5rem + env(safe-area-inset-top))' }}
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <AccountHub open={hubOpen} onClose={() => setHubOpen(false)} />

      {/* Mobile Bottom Navigation. Equal-width grid cells so the row can never
          overflow: five destinations plus the bell. The CRWN wordmark used to
          live here and ate ~60px on a 360px viewport for no navigational gain
          (the Home cell already routes to /home). */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a] z-50 md:hidden"
        style={{
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.5)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${navItems.length + 1}, minmax(0, 1fr))` }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, (item as { match?: string }).match);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.tourId}
                onClick={() => hapticLight()}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] px-0.5 rounded-lg ${
                  active
                    ? 'neu-tab-active font-semibold'
                    : 'neu-tab-inactive hover:text-crwn-text'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="w-full text-center text-[10px] leading-none truncate">{item.label}</span>
              </Link>
            );
          })}
          <div className="flex items-center justify-center min-h-[56px]">
            <NotificationBell />
          </div>
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 neu-raised flex-col z-50">
        <div className="p-6 flex items-center justify-between">
          <Link href="/home" className="text-2xl font-bold text-crwn-gold">
            CRWN
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button
              onClick={() => setHubOpen(true)}
              aria-label="Open menu"
              data-tour="account-hub"
              className="text-crwn-text-secondary hover:text-crwn-text"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const href = item.href;
              const active = isActive(item.href, (item as { match?: string }).match);
              return (
                <Link
                  key={item.href}
                  href={href}
                  data-tour={item.tourId}
                  onClick={() => hapticLight()}
                  className={`relative flex items-center gap-3 px-4 py-3 rounded-lg crwn-interactive ${
                    active
                      ? 'bg-crwn-surface-solid text-crwn-gold font-semibold'
                      : 'text-crwn-text-secondary hover:bg-crwn-elevated/50 hover:text-crwn-text'
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-crwn-gold"
                    />
                  )}
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User Section */}
        <div className="p-4 neu-inset mx-4 mb-4 rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full neu-inset flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <Image 
                  src={profile.avatar_url} 
                  alt="" 
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-crwn-text-secondary font-semibold">
                  {(profile?.display_name || user.email?.charAt(0) || 'U').toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-crwn-text truncate">
                {profile?.display_name || 'User'}
              </p>
              <p className="text-xs text-crwn-text-secondary truncate">
                {user.email}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSignOut}
            className="w-full neu-button flex items-center justify-center py-3 text-crwn-text-secondary hover:text-crwn-error text-sm"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </button>
        </div>

        {/* Footer Links */}
        <div className="px-4 pb-4 flex items-center justify-center gap-3 text-xs text-crwn-text-secondary">
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-crwn-gold transition-colors">
            Terms
          </a>
          <span>·</span>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-crwn-gold transition-colors">
            Privacy
          </a>
          <span>·</span>
          <a href="/dmca" target="_blank" rel="noopener noreferrer" className="hover:text-crwn-gold transition-colors">
            DMCA
          </a>
        </div>
      </aside>
    </>
  );
}
