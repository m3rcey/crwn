'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Link2, Check, Gift } from 'lucide-react';

interface ShareEarnButtonProps {
  artistSlug: string;
  artistId: string;
  commissionRate: number;
}

export function ShareEarnButton({ artistSlug, artistId, commissionRate }: ShareEarnButtonProps) {
  const { user, profile } = useAuth();
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  if (!user || !profile) return null;

  const referralCode = profile.username || user.id.replace(/-/g, '').substring(0, 8);
  const referralUrl = `https://crwn-mauve.vercel.app/artist/${artistSlug}?ref=${referralCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = referralUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Check this out on CRWN',
          text: 'Listen to this artist on CRWN 👑',
          url: referralUrl,
        });
      } catch {
        // User canceled
      }
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors"
      >
        <Gift className="w-4 h-4" />
        <span>Share & Earn</span>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 right-0 w-80 bg-crwn-surface border border-crwn-elevated rounded-xl shadow-xl z-50 p-4">
          <p className="text-sm text-crwn-text font-medium mb-1">Your Referral Link</p>
          <p className="text-xs text-crwn-text-secondary mb-3">
            Earn {commissionRate}% recurring commission on every subscription through your link.
          </p>

          <div className="flex gap-2 mb-3">
            <input
              type="text"
              readOnly
              value={referralUrl}
              className="flex-1 text-xs bg-crwn-elevated rounded-lg px-3 py-2 text-crwn-text-secondary truncate"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-crwn-gold text-crwn-bg hover:bg-crwn-gold-hover transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            </button>
          </div>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              onClick={handleNativeShare}
              className="w-full py-2 rounded-lg text-xs font-semibold bg-crwn-surface border border-crwn-elevated text-crwn-text hover:border-crwn-gold/50 transition-colors"
            >
              Share via...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
