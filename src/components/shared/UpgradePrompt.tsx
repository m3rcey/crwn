'use client';

import { useRouter } from 'next/navigation';

interface UpgradePromptProps {
  currentTier: string;
  feature: string;
  current: number;
  limit: number;
  message?: string;
}

export default function UpgradePrompt({ currentTier, feature, current, limit, message }: UpgradePromptProps) {
  const router = useRouter();

  const defaultMessage = currentTier === 'starter'
    ? 'Upgrade to Pro to unlock more'
    : currentTier === 'pro'
      ? 'Upgrade to Label for higher limits'
      : 'You have reached the maximum';

  return (
    <div className="neu-raised rounded-xl p-4 border border-[#D4AF37]/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[#D4AF37] text-lg">⚡</span>
        <span className="text-white font-semibold">{message || defaultMessage}</span>
      </div>
      {limit !== -1 && (
        <div className="mb-3">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>{feature}: {current}/{limit}</span>
          </div>
          <div className="w-full h-2 bg-[#1A1A1A] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#9a7b2a] to-[#D4AF37] rounded-full"
              style={{ width: `${Math.min((current / limit) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
      <button
        onClick={() => router.push('/profile/artist?tab=billing')}
        className="neu-button-accent w-full py-2 rounded-lg text-sm font-semibold"
      >
        Upgrade Plan
      </button>
    </div>
  );
}
