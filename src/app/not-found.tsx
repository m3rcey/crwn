'use client';

import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-crwn-bg flex items-center justify-center p-4">
      <div className="bg-crwn-surface rounded-xl p-8 max-w-md w-full text-center">
        <h2 className="text-4xl font-bold text-crwn-gold mb-4">404</h2>
        <h3 className="text-xl font-semibold text-crwn-text mb-2">Page Not Found</h3>
        <p className="text-crwn-text-secondary mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/home"
            className="px-6 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2 bg-crwn-elevated text-crwn-text rounded-lg font-semibold hover:bg-crwn-elevated/80 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
