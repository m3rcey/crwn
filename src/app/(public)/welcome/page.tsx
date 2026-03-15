'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

export default function WelcomePage() {
  const { user } = useAuth();
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (!user || emailSent) return;

    fetch('/api/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'welcome',
        to: user.email,
        displayName: user.user_metadata?.full_name || user.user_metadata?.display_name || user.email?.split('@')[0] || 'there',
      }),
    }).catch(console.error);

    setEmailSent(true);
  }, [user, emailSent]);

  return (
    <div className="min-h-screen bg-crwn-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="neu-raised p-8 rounded-xl">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-crwn-gold/20 flex items-center justify-center">
            <span className="text-4xl">👑</span>
          </div>
          <h1 className="text-3xl font-bold text-crwn-gold mb-3">Welcome to CRWN</h1>
          <p className="text-crwn-text-secondary mb-2">
            Your email has been verified and your account is ready.
          </p>
          <p className="text-sm text-crwn-text-secondary mb-8">
            Discover independent artists, subscribe to exclusive content, and join communities.
          </p>
          {user ? (
            <Link
              href="/explore"
              className="inline-block w-full bg-crwn-gold text-crwn-bg font-semibold py-3 px-6 rounded-lg hover:bg-crwn-gold/90 transition-colors"
            >
              Start Exploring
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-block w-full bg-crwn-gold text-crwn-bg font-semibold py-3 px-6 rounded-lg hover:bg-crwn-gold/90 transition-colors"
            >
              Sign In to Get Started
            </Link>
          )}
          <p className="mt-4 text-xs text-crwn-text-secondary">
            Need help? Contact <a href="mailto:support@thecrwn.app" className="text-crwn-gold hover:underline">support@thecrwn.app</a>
          </p>
        </div>
      </div>
    </div>
  );
}
