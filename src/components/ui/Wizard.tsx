'use client';

// Shared mobile-first wizard/stepper primitive. Before this, every wizard in the
// app (artist setup, suggest-mission, offer builder) was hand-rolled. The new
// Squad / Bounty / City-Unlock / Playbook builders all use this so they share
// one progress model, one footer, and the "one thing per screen" ethos.
//
// Presentational + controlled: the parent owns step state and renders the current
// screen as children. Wizard draws the progress bar, optional group chips, and the
// Back / Continue (+ optional Skip) footer.

import { ReactNode } from 'react';
import { hapticLight, hapticMedium } from '@/lib/haptics';

export interface WizardStep {
  id: string;
  label?: string;
  group?: string; // chip label for orientation, e.g. "Setup", "Reward"
}

interface WizardProps {
  steps: WizardStep[];
  currentIndex: number;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueLoading?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
  onClose?: () => void;
}

export function Wizard({
  steps,
  currentIndex,
  title,
  subtitle,
  children,
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
  continueLoading = false,
  onSkip,
  skipLabel = 'Skip for now',
  onClose,
}: WizardProps) {
  const total = steps.length;
  const clamped = Math.min(Math.max(currentIndex, 0), Math.max(total - 1, 0));
  const progress = total > 0 ? ((clamped + 1) / total) * 100 : 0;

  // Unique group chips in order, with the group of the current step highlighted
  const groups: string[] = [];
  steps.forEach((s) => {
    if (s.group && !groups.includes(s.group)) groups.push(s.group);
  });
  const activeGroup = steps[clamped]?.group;

  return (
    <div className="flex flex-col min-h-[70vh]">
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-crwn-text-secondary">
            Step {clamped + 1} of {total}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-crwn-text-secondary press-scale"
              aria-label="Close"
            >
              Close
            </button>
          )}
        </div>
        <div className="h-1.5 w-full rounded-full bg-crwn-elevated overflow-hidden">
          <div
            className="h-full rounded-full bg-crwn-gold transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Group chips */}
      {groups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-5">
          {groups.map((g) => (
            <span
              key={g}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                g === activeGroup
                  ? 'bg-crwn-gold text-crwn-bg'
                  : 'bg-crwn-elevated text-crwn-text-secondary'
              }`}
            >
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Header */}
      {(title || subtitle) && (
        <div className="mb-5">
          {title && <h2 className="text-xl font-semibold text-crwn-text">{title}</h2>}
          {subtitle && <p className="text-sm text-crwn-text-secondary mt-1">{subtitle}</p>}
        </div>
      )}

      {/* Current screen */}
      <div className="flex-1">{children}</div>

      {/* Footer */}
      <div className="mt-6 pt-4 flex items-center gap-3">
        {onBack && clamped > 0 && (
          <button
            onClick={() => {
              hapticLight();
              onBack();
            }}
            className="neu-button px-5 py-3 text-sm font-medium text-crwn-text-secondary press-scale"
          >
            Back
          </button>
        )}
        {onSkip && (
          <button
            onClick={() => {
              hapticLight();
              onSkip();
            }}
            className="text-sm font-medium text-crwn-text-secondary press-scale mr-auto"
          >
            {skipLabel}
          </button>
        )}
        <button
          onClick={() => {
            if (continueDisabled || continueLoading) return;
            hapticMedium();
            onContinue();
          }}
          disabled={continueDisabled || continueLoading}
          className={`flex-1 py-3 rounded-full text-sm font-semibold press-scale ${
            continueDisabled || continueLoading
              ? 'bg-crwn-elevated text-crwn-text-secondary opacity-60'
              : 'bg-crwn-gold text-crwn-bg'
          }`}
        >
          {continueLoading ? 'Working…' : continueLabel}
        </button>
      </div>
    </div>
  );
}
