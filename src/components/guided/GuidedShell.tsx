'use client';

// GuidedFrame and GuidedShell: the chrome every Rise Mode guided flow shares.
//
// GuidedFrame is the full-screen column with the one exit (an X back to Rise Mode). GuidedShell
// adds the existing Wizard (sticky footer, group chips, one decision per screen) and the flow's
// telemetry. A flow that already wears its own Wizard (the automation wizard) uses GuidedFrame
// alone. Neither holds a business rule or any draft state.

import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Wizard, type WizardStep } from '@/components/ui/Wizard';
import { guidedSetupTelemetry } from '@/lib/guidedSetup/telemetry';
import type { GuidedFlowKey } from '@/lib/guidedSetup/flows';

export function GuidedFrame({ returnTo, children }: { returnTo: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-20 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(returnTo)}
            aria-label="Back to Rise Mode"
            className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-crwn-text-secondary hover:text-crwn-text press-scale"
          >
            <X className="w-5 h-5" />
          </button>
          <p className="text-xs uppercase tracking-wide text-crwn-text-secondary">Guided setup</p>
        </div>
      </div>
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6">{children}</div>
    </div>
  );
}

/** Fires started once and stepReached on every index change. Shared by every guided flow. */
export function useGuidedTelemetry(flow: GuidedFlowKey, artistId: string, index: number, totalSteps: number) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    guidedSetupTelemetry.started({ flow, artistId, step: index + 1, totalSteps });
  }, [flow, artistId, index, totalSteps]);
  useEffect(() => {
    guidedSetupTelemetry.stepReached({ flow, artistId, step: index + 1, totalSteps });
  }, [flow, artistId, index, totalSteps]);
}

export function GuidedShell({
  flow,
  artistId,
  returnTo,
  steps,
  index,
  title,
  subtitle,
  children,
  onBack,
  onContinue,
  continueLabel,
  continueDisabled,
  continueLoading,
  onSkip,
  skipLabel,
}: {
  flow: GuidedFlowKey;
  artistId: string;
  returnTo: string;
  steps: WizardStep[];
  index: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueLoading?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
}) {
  useGuidedTelemetry(flow, artistId, index, steps.length);
  return (
    <GuidedFrame returnTo={returnTo}>
      <Wizard
        steps={steps}
        currentIndex={index}
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        onContinue={onContinue}
        continueLabel={continueLabel}
        continueDisabled={continueDisabled}
        continueLoading={continueLoading}
        onSkip={onSkip}
        skipLabel={skipLabel}
        stickyFooter
      >
        {children}
      </Wizard>
    </GuidedFrame>
  );
}

export const FIELD =
  'w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-4 text-lg text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold';

/** One line under a decision: why it matters, and what CRWN does with the answer. */
export function Why({ children }: { children: ReactNode }) {
  return <p className="text-sm text-crwn-text-secondary mt-3 leading-relaxed">{children}</p>;
}
