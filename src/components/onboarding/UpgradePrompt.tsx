'use client';

import { Lock, Crown, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface UpgradePromptProps {
  title: string;
  description: string;
  feature: string;
}

export function UpgradePrompt({ title, description, feature }: UpgradePromptProps) {
  return (
    <div className="neu-inset p-6 text-center">
      <div className="flex items-center justify-center gap-2 mb-3">
        <Lock className="w-5 h-5 text-crwn-gold" />
        <span className="text-crwn-gold font-medium">{feature}</span>
      </div>
      <h3 className="text-lg font-semibold text-crwn-text mb-2">{title}</h3>
      <p className="text-crwn-text-secondary text-sm mb-4">{description}</p>
      <Link
        href="/profile/artist?tab=upgrade"
        className="neu-button-accent inline-flex items-center gap-2 px-4 py-2 rounded-lg text-crwn-bg font-semibold"
      >
        Upgrade Plan <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
