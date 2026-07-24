'use client';

// HubPage — the shell every screen that used to be an artist dashboard tab now
// wears. Modeled on the Lyft driver menu: you open something from the hamburger,
// it fills the screen, and an X in the TOP LEFT puts you back in the hamburger.
//
// Two things make that work:
//   1. Links out of AccountHub carry ?from=hub, so this shell knows the X should
//      return to the menu rather than to whatever page happened to be underneath.
//   2. Opening the menu pushes ?hub=1 onto the current route, so "back to the
//      menu" is just history.back(). Deep links (no history) fall back to
//      /home?hub=1, which opens the menu on Home.
// Reached any other way (a Studio tile, a Rise Mode CTA, an email link), the X
// behaves like every other back control in the app: smartBack to the real
// previous page, falling back to `fallback`.
//
// The bottom tab bar and the desktop sidebar stay visible the whole time. These
// are ordinary (main) routes, not overlays, so an artist is never trapped in a
// sub-screen with no way across to Explore or Messages.

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X, Loader2, Sparkles } from 'lucide-react';
import { smartBack, requestHubReopen } from '@/lib/navigation';
import { useArtistContext, type ArtistContext } from '@/hooks/useArtistContext';

/** Where the X lands when a hub screen was deep-linked and has no history. */
export const HUB_HOME = '/home';

function HubSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
    </div>
  );
}

interface HubPageProps {
  /** Screen title, shown next to nothing. The X owns the top-left corner. */
  title: string;
  /** One line under the title. Optional. */
  subtitle?: string;
  /** Where the X goes when there is no in-app history and no ?from=hub. */
  fallback?: string;
  /** Gate on the artist_profiles row and pass it down. */
  requireArtist?: boolean;
  /** Copy for the not-an-artist screen when requireArtist is set. */
  artistOnlyMessage?: string;
  /** Wider shell for data-heavy screens (analytics, CRM, calendars). */
  width?: 'default' | 'wide';
  children: React.ReactNode | ((ctx: ArtistContext) => React.ReactNode);
}

function HubPageInner({
  title,
  subtitle,
  fallback = '/studio',
  requireArtist = false,
  artistOnlyMessage = 'Publish your artist page and this becomes part of your workspace.',
  width = 'default',
  children,
}: HubPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromHub = searchParams.get('from') === 'hub';
  const { status, context } = useArtistContext();

  const close = () => {
    if (fromHub) {
      // Straight back into the menu: go back to whatever page the menu was opened
      // over, and ask Navigation to reopen it on arrival. A deep link has no
      // history to go back to, so land on Home and open the menu there.
      requestHubReopen();
      if (typeof window !== 'undefined' && window.history.length > 1) router.back();
      else router.push(HUB_HOME);
      return;
    }
    smartBack(router, fallback);
  };

  const shell = (body: React.ReactNode) => (
    <div className={`${width === 'wide' ? 'max-w-5xl' : 'max-w-3xl'} mx-auto page-fade-in`}>
      <div className="flex items-start gap-3 mb-6">
        <button
          onClick={close}
          aria-label={fromHub ? 'Back to menu' : 'Close'}
          className="-ml-1 mt-0.5 p-1 text-crwn-text-secondary hover:text-crwn-text shrink-0"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-crwn-text leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-crwn-text-secondary mt-1">{subtitle}</p>}
        </div>
      </div>
      {body}
    </div>
  );

  if (status === 'loading') return shell(<HubSpinner />);
  if (status === 'signed-out') return null;

  if (requireArtist && status !== 'artist') {
    return shell(
      <div className="neu-raised rounded-xl p-8 text-center">
        <Sparkles className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
        <p className="text-crwn-text font-medium">{title} is for artists</p>
        <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">{artistOnlyMessage}</p>
        <button
          onClick={() => router.push('/home')}
          className="mt-5 px-5 py-2 rounded-full font-semibold text-sm bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const body = typeof children === 'function' ? (context ? children(context) : <HubSpinner />) : children;
  return shell(body);
}

/** useSearchParams needs a Suspense boundary to keep the route statically renderable. */
export function HubPage(props: HubPageProps) {
  return (
    <Suspense fallback={<HubSpinner />}>
      <HubPageInner {...props} />
    </Suspense>
  );
}
