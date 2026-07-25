'use client';

// The "we already did this for you" banner.
//
// It appears at the top of a builder when the artist was routed here straight from a calculator
// they completed (the URL carries ?lm_prefill=1). Its whole job is to tell them the fields below
// are already filled from THEIR numbers, so they review instead of start from scratch. It renders
// nothing unless that flag is present, so it is safe to mount in any builder unconditionally.
//
// It reads the query string in an effect (client-only) rather than useSearchParams, so it needs no
// Suspense boundary and drops into any builder as-is.

import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

export function CalculatorPrefillBanner({ toolName }: { toolName?: string }) {
  const [from, setFrom] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('lm_prefill') === '1') {
      setFrom(toolName || q.get('lm_tool_name') || 'your calculator');
    }
  }, [toolName]);

  if (dismissed || !from) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-crwn-gold/40 bg-crwn-gold/10 p-4 mb-5">
      <Sparkles className="w-5 h-5 text-crwn-gold shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-crwn-text font-semibold">We already filled this out using your calculator.</p>
        <p className="text-sm text-crwn-text-secondary mt-0.5">
          These fields come from {from}. Check the numbers, change anything you want, then publish.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-crwn-text-secondary hover:text-crwn-gold shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
