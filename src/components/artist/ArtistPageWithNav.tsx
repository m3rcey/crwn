'use client';
import { Navigation, useNavigationVisible } from '@/components/layout/Navigation';

/**
 * The nav inset is conditional for the same reason it is in `src/app/[slug]/layout.tsx`:
 * Navigation renders nothing for a logged-out visitor, so an unconditional `md:pl-64`
 * reserved 256px for a sidebar that was not there and shifted the page right.
 */
export default function ArtistPageWithNav({
  children,
}: {
  children: React.ReactNode;
}) {
  const navVisible = useNavigationVisible();

  return (
    <div className="min-h-screen">
      <Navigation />
      <div className={navVisible ? 'md:pl-64 pb-20 md:pb-0' : ''}>
        <main>
          {children}
        </main>
      </div>
    </div>
  );
}
