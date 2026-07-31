'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Flag, Loader2, CheckCircle, X } from 'lucide-react';

// The everywhere bug reporter. A quiet flag in the corner of every page: mostly
// invisible until hovered or tapped, so it never competes with the product, but a
// user who just hit a bug can report it from the exact screen it happened on.
// Reports ride the existing /api/support route (category Bug Report) with the page
// URL and browser captured automatically, so "it broke" arrives with enough context
// to reproduce. Every unreported bug is a user who walked away instead.
//
// Portal to document.body with a mount guard (position:fixed anchors to transformed
// ancestors otherwise), z-[100], solid surface.
export function BugReportButton() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hide where it would be noise: auth screens and the setup wizard's focused flow.
  const hidden = !pathname || pathname === '/login' || pathname === '/signup' || pathname.startsWith('/setup') || pathname.startsWith('/verify');

  if (!mounted || hidden) return null;

  const submit = async () => {
    const reporterEmail = (user?.email || email).trim();
    const body = message.trim();
    if (!body || !reporterEmail) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile?.display_name || 'CRWN user',
          email: reporterEmail,
          category: 'Bug Report',
          message: body,
          context: {
            page: typeof window !== 'undefined' ? window.location.href : pathname,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            userId: user?.id || null,
          },
        }),
      });
      if (!res.ok) throw new Error();
      setStatus('sent');
      setMessage('');
    } catch {
      setStatus('error');
    }
  };

  const close = () => {
    setOpen(false);
    setStatus('idle');
  };

  return createPortal(
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Report a bug"
        title="Report a bug"
        className="fixed bottom-24 md:bottom-6 right-3 z-[90] w-9 h-9 rounded-full bg-crwn-surface-solid border border-crwn-elevated flex items-center justify-center text-crwn-text-secondary opacity-40 hover:opacity-100 hover:text-crwn-gold focus:opacity-100 transition-all"
      >
        <Flag className="w-4 h-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={close}>
          <div
            className="w-full sm:max-w-md bg-crwn-surface-solid border border-crwn-elevated rounded-t-2xl sm:rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {status === 'sent' ? (
              <div className="text-center py-6">
                <CheckCircle className="w-10 h-10 text-crwn-gold mx-auto mb-3" />
                <p className="text-crwn-text font-semibold mb-1">Got it. Thank you.</p>
                <p className="text-sm text-crwn-text-secondary mb-5">
                  Every report makes CRWN better for the artists on it.
                </p>
                <button onClick={close} className="bg-crwn-gold text-black font-semibold px-6 py-2.5 rounded-full">
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-crwn-text flex items-center gap-2">
                    <Flag className="w-4 h-4 text-crwn-gold" /> Report a bug
                  </p>
                  <button onClick={close} aria-label="Close" className="p-1 text-crwn-text-secondary hover:text-crwn-text">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-crwn-text-secondary mb-4">
                  A bug you do not report stays broken. This page and your browser are attached automatically.
                </p>
                <textarea
                  autoFocus
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What happened? What did you expect?"
                  className="w-full bg-crwn-elevated rounded-xl px-3.5 py-3 text-sm text-crwn-text placeholder:text-crwn-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-crwn-gold resize-none mb-3"
                />
                {!user && (
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email (so we can follow up)"
                    className="w-full bg-crwn-elevated rounded-xl px-3.5 py-3 text-sm text-crwn-text placeholder:text-crwn-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-crwn-gold mb-3"
                  />
                )}
                {status === 'error' && (
                  <p className="text-xs text-red-400 mb-3">Could not send. Try again, or email support@thecrwn.app.</p>
                )}
                <button
                  onClick={submit}
                  disabled={status === 'sending' || !message.trim() || !(user?.email || email.trim())}
                  className="w-full flex items-center justify-center gap-2 bg-crwn-gold text-black font-semibold py-3 rounded-full disabled:opacity-40"
                >
                  {status === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send report'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
