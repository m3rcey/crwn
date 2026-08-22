'use client';

import { Navigation, useNavigationVisible } from '@/components/layout/Navigation';

/**
 * Every public artist surface renders here: the artist page, album/track/post pages, the
 * Song Lab and the QR ballot landings.
 *
 * The nav inset is CONDITIONAL, and that is the whole point. Navigation renders nothing
 * for a logged-out visitor, but this wrapper used to reserve 256px for it regardless, so
 * an Instagram visitor or a QR-scanning attendee (both always logged out) saw every page
 * pushed right with an empty gutter on the left. Same for the mobile tab bar's bottom
 * padding. Both now appear exactly when the nav does.
 */
export default function ArtistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navVisible = useNavigationVisible();

  return (
    <div className="min-h-screen">
      <Navigation />
      <div className={navVisible ? 'md:pl-64 pb-20 md:pb-0' : ''}>
        {children}
      </div>
    </div>
  );
}
