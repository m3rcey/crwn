'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { usePlayer } from '@/hooks/usePlayer';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { AccountHub } from '@/components/layout/AccountHub';
import { hapticLight } from '@/lib/haptics';
import {
  Home,
  Compass,
  Coins,
  MessageCircle,
  Rocket,
  TrendingUp,
  Library,
  Menu,
  LogOut
} from 'lucide-react';

// The 3rd slot is role-aware: artists get their Studio workspace, fans get the
// Earn hub (/command). The 5th slot used to be Profile — that moved into the
// hamburger AccountHub, freeing the slot for the highest-leverage destination:
// Rise Mode for artists, Library for fans. `match` overrides active detection when
// the href carries a query string (pathname.startsWith can't see ?tab=).
const artistSlot = { href: '/studio', label: 'Studio', icon: Rocket, tourId: 'nav-studio' };
const fanSlot = { href: '/command', label: 'Earn', icon: Coins, tourId: 'nav-earn' };
const artistRiseSlot = { href: '/profile/artist?tab=rise', match: '/profile/artist', label: 'Rise', icon: TrendingUp, tourId: 'nav-rise' };
const fanLibrarySlot = { href: '/library', label: 'Library', icon: Library, tourId: 'nav-library' };

const buildNavItems = (isArtist: boolean) => [
  { href: '/home', label: 'Home', icon: Home, tourId: 'nav-home' },
  { href: '/explore', label: 'Explore', icon: Compass, tourId: 'nav-explore' },
  isArtist ? artistSlot : fanSlot,
  { href: '/messages', label: 'Messages', icon: MessageCircle, tourId: 'nav-messages' },
  isArtist ? artistRiseSlot : fanLibrarySlot,
];

export function Navigation() {
  const pathname = usePathname();
  const { user, profile, signOut, isArtist } = useAuth();
  // No profile yet (or a fan) → fan set. Artists + admins → Studio.
  const navItems = buildNavItems(isArtist());
  const { resetPlayer } = usePlayer();
  const router = useRouter();
  const [hubOpen, setHubOpen] = useState(false);

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
          account" moved off the tab bar into this hub, which freed the 5th slot. */}
      <button
        onClick={() => setHubOpen(true)}
        aria-label="Open menu"
        className="md:hidden fixed left-3 z-[70] w-10 h-10 rounded-full bg-[#1a1a1a]/90 backdrop-blur flex items-center justify-center text-crwn-text shadow-lg"
        style={{ top: 'calc(0.5rem + env(safe-area-inset-top))' }}
      >
        <Menu className="w-5 h-5" />
      </button>

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
        <div className="grid grid-cols-6">
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors press-scale tap-highlight ${
                    active 
                      ? 'bg-crwn-gold text-crwn-bg font-semibold' 
                      : 'text-crwn-text-secondary hover:bg-crwn-elevated/50'
                  }`}
                >
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
