'use client';

import { useEffect } from 'react';
import { Loader2, Home } from 'lucide-react';
import Link from 'next/link';

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-crwn-bg flex items-center justify-center p-4">
      <div className="bg-crwn-surface rounded-xl p-8 max-w-md w-full text-center">
        <h2 className="text-2xl font-bold text-crwn-text mb-4">Something went wrong</h2>
        <p className="text-crwn-text-secondary mb-6">
          We encountered an error loading this page.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-6 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors flex items-center justify-center gap-2"
          >
            <Loader2 className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/home"
            className="px-6 py-2 bg-crwn-elevated text-crwn-text rounded-lg font-semibold hover:bg-crwn-elevated/80 transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
