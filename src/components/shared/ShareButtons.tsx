'use client';

import { useState } from 'react';
import { Share2, Link2, Check } from 'lucide-react';

interface ShareButtonsProps {
  url: string;
  title: string;
  description?: string;
}

export function ShareButtons({ url, title, description }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
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
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
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
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium neu-button text-crwn-text-secondary hover:text-crwn-text transition-colors"
        title="Copy link"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-green-400" />
            <span className="text-green-400">Copied!</span>
          </>
        ) : (
          <>
            <Link2 className="w-4 h-4" />
            <span>Copy Link</span>
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
          <Share2 className="w-4 h-4" />
          <span>Share</span>
        </button>
      )}


    </div>
  );
}
