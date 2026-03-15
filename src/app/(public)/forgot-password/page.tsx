'use client';

import { useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createBrowserSupabaseClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 neu-raised rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-crwn-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-crwn-text mb-2">Check Your Email</h1>
          <p className="text-crwn-text-secondary mb-6">
            We sent a password reset link to <span className="text-crwn-gold">{email}</span>
          </p>
          <p className="text-sm text-crwn-text-dim mb-6">
            Click the link in the email to set a new password. If you don't see it, check your spam folder.
          </p>
          <Link
            href="/login"
            className="text-crwn-gold hover:underline text-sm"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-crwn-gold mb-2">CRWN</h1>
          <h2 className="text-xl font-semibold text-crwn-text mb-2">Reset Your Password</h2>
          <p className="text-crwn-text-secondary text-sm">
            Enter your email and we'll send you a link to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-crwn-text-secondary mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="neu-inset w-full px-4 py-3 text-crwn-text placeholder-crwn-text-secondary focus:outline-none"
              required
            />
          </div>

          {error && (
            <div className="neu-inset p-3 text-sm text-crwn-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="neu-button-accent w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed hover-glow"
          >
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="text-center mt-6">
          <Link
            href="/login"
            className="text-sm text-crwn-gold hover:underline"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
