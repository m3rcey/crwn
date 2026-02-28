'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-crwn-bg flex items-center justify-center p-4">
      <div className="bg-crwn-surface rounded-xl p-8 max-w-md w-full text-center">
        <h2 className="text-2xl font-bold text-crwn-text mb-4">Something went wrong</h2>
        <p className="text-crwn-text-secondary mb-6">
          We encountered an unexpected error. Please try again.
        </p>
        <button
          onClick={() => reset()}
          className="px-6 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
