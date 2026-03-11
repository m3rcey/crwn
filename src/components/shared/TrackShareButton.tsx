'use client';

import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/components/shared/Toast';
import { Share2, Link2, Check, X } from 'lucide-react';

interface TrackShareButtonProps {
  trackId: string;
  trackTitle: string;
  artistSlug: string;
  artistName?: string;
  size?: 'sm' | 'md';
}

export function TrackShareButton({ trackId, trackTitle, artistSlug, artistName, size = 'sm' }: TrackShareButtonProps) {
  const { showToast } = useToast();
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const shareUrl = `https://thecrwn.app/artist/${artistSlug}/track/${trackId}`;
  const shareTitle = artistName ? `${trackTitle} by ${artistName}` : trackTitle;
  const shareText = artistName 
    ? `Listen to ${trackTitle} by ${artistName} on CRWN 👑`
    : `Check out ${trackTitle} on CRWN 👑`;

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast('Link copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for mobile browsers
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      showToast('Link copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
    setShowMenu(false);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // User canceled or share failed — ignore
      }
    }
  };

  const handleTwitter = () => {
    const text = encodeURIComponent(shareText);
    const url = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    setShowMenu(false);
  };

  const handleFacebook = () => {
    const url = encodeURIComponent(shareUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
    setShowMenu(false);
  };

  const iconSize = size === 'sm' ? 14 : 20;
  const buttonPadding = size === 'sm' ? 'p-1.5' : 'p-2';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`${buttonPadding} rounded-full text-crwn-text-secondary hover:text-crwn-text hover:bg-crwn-elevated transition-colors`}
        title="Share"
      >
        <Share2 size={iconSize} />
      </button>

      {/* Share Menu */}
      {showMenu && (
        <div className="absolute right-0 top-full mt-1 w-44 neu-raised rounded-lg overflow-hidden z-50">
          <div className="p-2 border-b border-crwn-elevated flex items-center justify-between">
            <p className="text-xs font-medium text-crwn-text-secondary uppercase">Share</p>
            <button 
              onClick={() => setShowMenu(false)}
              className="p-1 text-crwn-text-secondary hover:text-crwn-text"
            >
              <X size={14} />
            </button>
          </div>
          
          <div className="p-2 space-y-1">
            {/* Copy Link */}
            <button
              onClick={handleCopyLink}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-crwn-text hover:bg-crwn-gold/10 hover:text-crwn-gold rounded-lg transition-colors"
            >
              {copied ? (
                <>
                  <Check size={16} className="text-green-400" />
                  <span className="text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <Link2 size={16} />
                  <span>Copy Link</span>
                </>
              )}
            </button>

            {/* Native Share (mobile) */}
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                onClick={handleNativeShare}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-crwn-text hover:bg-crwn-gold/10 hover:text-crwn-gold rounded-lg transition-colors"
              >
                <Share2 size={16} />
                <span>Share</span>
              </button>
            )}

            {/* Twitter/X */}
            <button
              onClick={handleTwitter}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-crwn-text hover:bg-crwn-gold/10 hover:text-crwn-gold rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>X / Twitter</span>
            </button>

            {/* Facebook */}
            <button
              onClick={handleFacebook}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-crwn-text hover:bg-crwn-gold/10 hover:text-crwn-gold rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span>Facebook</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
