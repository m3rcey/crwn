'use client';

import { Info } from 'lucide-react';
import { ESTIMATE_DISCLAIMER, LEGAL_DISCLAIMER } from '@/lib/leadMagnets/disclaimers';

// Contextual, concise planning-estimate caveat. Shown near projections/scores.
export function EstimateDisclaimer({ legal = false, className = '' }: { legal?: boolean; className?: string }) {
  return (
    <div className={`flex gap-2.5 rounded-xl bg-crwn-elevated/60 border border-crwn-elevated p-3.5 ${className}`}>
      <Info className="w-4 h-4 text-crwn-text-secondary shrink-0 mt-0.5" />
      <div className="text-xs text-crwn-text-secondary leading-relaxed">
        <p>{ESTIMATE_DISCLAIMER}</p>
        {legal && <p className="mt-2">{LEGAL_DISCLAIMER}</p>}
      </div>
    </div>
  );
}
