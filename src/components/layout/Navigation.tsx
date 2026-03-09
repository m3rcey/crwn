'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { 
  Home, 
  Compass, 
  Library, 
  User,
  LogOut
} from 'lucide-react';

const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/library', label: 'Library', icon: Library },
  { href: '/profile', label: 'Profile', icon: User },
];

export function Navigation() {
  const pathname = usePathname();
  const { user, profile, signOut } = useAuth();

  const isActive = (href: string) => {
    if (href === '/home') return pathname === '/home';
    return pathname.startsWith(href);
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  // Don't show nav on auth pages
  if (!user || pathname.startsWith('/login') || pathname.startsWith('/signup')) {
    return null;
  }

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a] z-50 md:hidden" style={{ borderRadius: '16px 16px 0 0', boxShadow: '0 -4px 12px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center justify-between px-2 py-1">
          <Link href="/home" className="text-xl font-bold text-crwn-gold px-2">
            CRWN
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                  active 
                    ? 'neu-tab-active font-semibold' 
                    : 'neu-tab-inactive hover:text-crwn-text'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 neu-raised flex-col z-50">
        <div className="p-6 flex items-center justify-between">
          <Link href="/home" className="text-2xl font-bold text-crwn-gold">
            CRWN
          </Link>
          <NotificationBell />
        </div>

        <nav className="flex-1 px-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    active 
                      ? 'neu-button-accent text-crwn-bg font-semibold' 
                      : 'neu-button text-crwn-text-secondary'
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
      </aside>
    </>
  );
}
