import Link from 'next/link';
import { Home, ArrowLeft, UserX } from 'lucide-react';

export default function ArtistNotFound() {
  return (
    <div className="min-h-screen bg-crwn-bg flex items-center justify-center p-4">
      <div className="bg-crwn-surface rounded-xl p-8 max-w-md w-full text-center">
        <UserX className="w-16 h-16 text-crwn-gold mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-crwn-text mb-2">Artist Not Found</h2>
        <p className="text-crwn-text-secondary mb-6">
          This artist doesn&apos;t exist or has been removed.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/explore"
            className="px-6 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            Explore Artists
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
