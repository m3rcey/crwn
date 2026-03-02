'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle } from 'lucide-react';

export default function VerifyEmailPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createBrowserSupabaseClient();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  
  const emailParam = params.get('email') || '';
  const email = emailParam;

  useEffect(() => {
    async function verifyEmail() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session) {
          setStatus('success');
          setTimeout(() => {
            router.push('/home');
          }, 3000);
        } else if (error) {
          setStatus('error');
        } else {
          setStatus('success');
        }
      } catch {
        setStatus('error');
      }
    }

    verifyEmail();
  }, [supabase, router]);

  return (
    <div className="min-h-screen bg-crwn-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {status === 'loading' ? (
          <>
            <Loader2 className="w-16 h-16 text-crwn-gold animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-crwn-text mb-2">Verifying...</h1>
            <p className="text-crwn-text-secondary">Please wait while we verify your email.</p>
          </>
        ) : status === 'success' ? (
          <>
            <div className="w-16 h-16 bg-crwn-gold/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-crwn-gold" />
            </div>
            <h1 className="text-2xl font-bold text-crwn-text mb-2">Email Verified!</h1>
            <p className="text-crwn-text-secondary mb-4">
              Welcome to CRWN{email ? `, ${email}` : ''}!
            </p>
            <p className="text-sm text-crwn-text-secondary mb-6">
              Redirecting to home...
            </p>
            <button
              onClick={() => router.push('/home')}
              className="px-6 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors"
            >
              Go to Home
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-crwn-text mb-2">Verification Failed</h1>
            <p className="text-crwn-text-secondary mb-6">
              The verification link may have expired or is invalid.
            </p>
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-2 bg-crwn-gold text-crwn-bg rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
