'use client';

// A back control for the connector-tool pages (offers, campaigns, missions,
// bounties, etc.) that are NOT HubPage screens but ARE reachable from the
// hamburger AccountHub. When the page was opened from the hamburger (?from=hub)
// it wears the SAME X in the top-left that every HubPage screen does and returns
// to the menu, so the whole hub feels like one place. Reached any other way (a
// Studio tile, a Rise Mode CTA, an email link) it is the page's normal back
// arrow: smartBack to the real previous page, falling back to `fallback`.
//
// This mirrors HubPage.close() exactly, on purpose: same reopen flag, same
// deep-link fallback to Home. The only reason it exists separately is that these
// pages hand-roll their own headers and cannot cheaply be moved onto HubPage.
//
// It reads ?from=hub from window.location in an effect, NOT useSearchParams, so
// it never forces a Suspense boundary onto these routes. Server and first client
// render both show the arrow (fromHub=false), so there is no hydration mismatch;
// the effect swaps in the X after mount on hub-opened pages, which is
// imperceptible because these pages gate on auth/data with a spinner first.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, X } from 'lucide-react';
import { smartBack, requestHubReopen } from '@/lib/navigation';

/** Where the X lands when a hub screen was deep-linked and has no history. */
const HUB_HOME = '/home';

interface HubBackControlProps {
  /** Where back goes when NOT opened from the hub and there is no history. */
  fallback?: string;
  /** Text-variant label when NOT opened from the hub. Ignored by the icon variant. */
  label?: string;
  /**
   * How the NON-hub back control looks, to match the page it replaces:
   * 'text' = an arrow + label row (mb-6), 'icon' = a compact arrow button that
   * sits inside a flex header row. The hub X looks the same in both spots.
   */
  variant?: 'text' | 'icon';
}

export function HubBackControl({
  fallback = '/studio',
  label = 'Back to Studio',
  variant = 'text',
}: HubBackControlProps) {
  const router = useRouter();
  const [fromHub, setFromHub] = useState(false);

  useEffect(() => {
    setFromHub(new URLSearchParams(window.location.search).get('from') === 'hub');
  }, []);

  const goBack = () => {
    if (fromHub) {
      // Straight back into the menu, exactly like HubPage: return to whatever page
      // the menu was opened over and ask Navigation to reopen it on arrival. A deep
      // link has no history to go back to, so land on Home and open the menu there.
      requestHubReopen();
      if (typeof window !== 'undefined' && window.history.length > 1) router.back();
      else router.push(HUB_HOME);
      return;
    }
    smartBack(router, fallback);
  };

  // Opened from the hamburger: the same X every HubPage screen wears, kept in the
  // same layout slot as the arrow it replaces so no page's header shifts.
  if (fromHub) {
    return (
      <button
        onClick={goBack}
        aria-label="Back to menu"
        className={
          variant === 'icon'
            ? 'p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text'
            : '-ml-1 mb-6 p-1 inline-flex text-crwn-text-secondary hover:text-crwn-text'
        }
      >
        <X className="w-6 h-6" />
      </button>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={goBack}
        aria-label="Back"
        className="p-2 -ml-2 text-crwn-text-secondary hover:text-crwn-text"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
    );
  }

  return (
    <button
      onClick={goBack}
      className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors mb-6"
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </button>
  );
}
