'use client';

import { Loader2 } from 'lucide-react';

// What an error boundary shows when the error it caught is a stale-deploy chunk error.
//
// That case is transient and already self-healing: chunkReload reloads the page once and
// the next load is fine. Rendering "Something went wrong" for the beat before that reload
// tells a visitor the site is down when in fact it is only picking up a new build. The
// homepage is where artists land, so the crash copy is an acquisition cost, not a cosmetic
// one. This screen is what "the app is updating" should have looked like all along.
export default function AppUpdating() {
  return (
    <div className="min-h-screen bg-crwn-bg flex items-center justify-center p-4">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin mx-auto mb-4" />
        <p className="text-crwn-text-secondary">Updating to the latest version</p>
      </div>
    </div>
  );
}
