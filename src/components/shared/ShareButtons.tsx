'use client';

import { useState } from 'react';
import { Share2, Link2, Check } from 'lucide-react';
import { hapticLight, hapticSuccess } from '@/lib/haptics';

interface ShareButtonsProps {
  url: string;
  title: string;
  description?: string;
  size?: 'xs' | 'sm' | 'md';
}

export function ShareButtons({ url, title, description, size = 'md' }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    hapticLight();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      hapticSuccess();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for mobile browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      hapticSuccess();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    hapticLight();
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description || title,
          url,
        });
      } catch {
        // User canceled or share failed — ignore
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Copy Link */}
      <button
        onClick={handleCopyLink}
        className={`flex items-center gap-1 rounded-lg font-medium neu-button text-crwn-text-secondary hover:text-crwn-text transition-colors ${size === 'xs' ? 'px-2 py-1.5' : size === 'sm' ? 'px-2 py-1 text-xs' : 'px-4 py-2 text-sm'}`}
        title="Copy link"
      >
        {copied ? (
          <>
            <Check className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} text-green-400`} />
            {size !== 'xs' && <span className="text-green-400">Copied!</span>}
          </>
        ) : (
          <>
            <Link2 className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
            {size !== 'xs' && <span>Copy Link</span>}
          </>
        )}
      </button>

      {/* Native Share (mobile) */}
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button
          onClick={handleNativeShare}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium neu-button text-crwn-text-secondary hover:text-crwn-text transition-colors"
          title="Share"
        >
          <Share2 className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
          {size !== 'xs' && <span>Share</span>}
        </button>
      )}


    </div>
  );
}
