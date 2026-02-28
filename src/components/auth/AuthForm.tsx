'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface AuthFormProps {
  mode: 'login' | 'signup';
  onSuccess?: () => void;
}

export function AuthForm({ mode, onSuccess }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signUp, signInWithMagicLink, signInWithGoogle, signInWithApple } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await signUp(email, password);
        if (error) throw error;
        onSuccess?.();
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
        onSuccess?.();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError('Please enter your email');
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      const { error } = await signInWithMagicLink(email);
      if (error) throw error;
      setMagicLinkSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send magic link');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
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
            className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-3 text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold transition-colors"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-crwn-text-secondary mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-3 text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold transition-colors"
            required={mode === 'signup'}
          />
        </div>

        {error && (
          <div className="bg-crwn-error/10 border border-crwn-error/30 rounded-lg p-3 text-sm text-crwn-error">
            {error}
          </div>
        )}

        {magicLinkSent && (
          <div className="bg-crwn-success/10 border border-crwn-success/30 rounded-lg p-3 text-sm text-crwn-success">
            Magic link sent! Check your email.
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-lg hover:bg-crwn-gold-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Loading...' : mode === 'signup' ? 'Create Account' : 'Sign In'}
        </button>

        {mode === 'login' && (
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={isLoading}
            className="w-full border border-crwn-gold text-crwn-gold font-semibold py-3 rounded-lg hover:bg-crwn-gold/10 transition-colors disabled:opacity-50"
          >
            Send Magic Link
          </button>
        )}
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-crwn-elevated" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-crwn-surface text-crwn-text-secondary">Or continue with</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => signInWithGoogle()}
            className="flex items-center justify-center gap-2 bg-crwn-bg border border-crwn-elevated text-crwn-text py-2.5 rounded-lg hover:bg-crwn-elevated transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>
          <button
            onClick={() => signInWithApple()}
            className="flex items-center justify-center gap-2 bg-crwn-bg border border-crwn-elevated text-crwn-text py-2.5 rounded-lg hover:bg-crwn-elevated transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.16 1.87-2.38 5.98.46 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Apple
          </button>
        </div>
      </div>
    </div>
  );
}
