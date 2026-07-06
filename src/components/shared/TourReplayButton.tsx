'use client';

import { HelpCircle } from 'lucide-react';

interface TourReplayButtonProps {
  onClick: () => void;
  className?: string;
  /** data-tour anchor — tours point their final "replay anytime" step here. */
  dataTour?: string;
}

/**
 * Small circular "?" button that replays the current page's tour. Visual
 * precedent: the home-help button on /home. Each tour's final step targets
 * this button's data-tour anchor ("Replay this tour anytime here").
 */
export function TourReplayButton({
  onClick,
  className = '',
  dataTour = 'tour-replay',
}: TourReplayButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour={dataTour}
      aria-label="Replay tour"
      title="Replay tour"
      className={`w-8 h-8 rounded-full bg-crwn-elevated flex items-center justify-center text-crwn-text-secondary hover:text-crwn-gold transition-colors ${className}`}
    >
      <HelpCircle className="w-5 h-5" />
    </button>
  );
}
