'use client';

import { useEffect } from 'react';
import { isChunkLoadError, reloadOnceForChunkError } from '@/lib/chunkReload';

// global-error REPLACES the root layout when it renders, so it must supply its own <html>
// and <body>, and it cannot count on globals.css (imported by that layout) being applied.
// Everything here is therefore inline-styled: this is the screen that shows when rendering
// has already failed, and it is the one screen that must not depend on anything else.
const BG = '#0D0D0D';
const GOLD = '#D4AF37';
const TEXT = '#EDEDED';
const TEXT_DIM = '#8a8a9a';

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  background: BG,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  fontFamily: 'Inter, system-ui, sans-serif',
  textAlign: 'center',
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // A stale-deploy chunk error is transient and self-healing, so it must not be dressed up
  // as a crash. Compute it during render (not just in the effect) so the very first paint
  // is the quiet updating screen rather than a flash of "Something went wrong".
  const isStaleDeploy = isChunkLoadError(error);

  useEffect(() => {
    if (isStaleDeploy) {
      reloadOnceForChunkError();
      return;
    }
    console.error('Application error:', error);
  }, [error, isStaleDeploy]);

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        {isStaleDeploy ? (
          <div style={wrap}>
            <div>
              <div
                style={{
                  width: 32,
                  height: 32,
                  margin: '0 auto 1rem',
                  border: `3px solid ${GOLD}`,
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'crwnspin 0.8s linear infinite',
                }}
              />
              <p style={{ color: TEXT_DIM, margin: 0 }}>Updating to the latest version</p>
            </div>
            <style>{'@keyframes crwnspin{to{transform:rotate(360deg)}}'}</style>
          </div>
        ) : (
          <div style={wrap}>
            <div style={{ maxWidth: 420, width: '100%' }}>
              <h2 style={{ color: TEXT, fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>
                Something went wrong
              </h2>
              <p style={{ color: TEXT_DIM, marginBottom: '1.5rem' }}>
                We encountered an unexpected error. Please try again.
              </p>
              <button
                onClick={() => reset()}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: GOLD,
                  color: BG,
                  border: 'none',
                  borderRadius: 9999,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
