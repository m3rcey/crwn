'use client';

import { Lock, Crown, Sparkles } from 'lucide-react';

interface GatedBadgeProps {
  accessLevel: 'free' | 'subscriber' | 'purchase';
  showLabel?: boolean;
}

export function GatedBadge({ accessLevel, showLabel = true }: GatedBadgeProps) {
  if (accessLevel === 'free') return null;

  const configs = {
    subscriber: {
      icon: Crown,
      label: 'Subscriber Only',
      className: 'bg-crwn-gold/10 border-crwn-gold/30 text-crwn-gold',
    },
    purchase: {
      icon: Sparkles,
      label: 'Premium',
      className: 'bg-crwn-gold/10 border-crwn-gold/30 text-crwn-gold',
    },
  };

  const config = configs[accessLevel];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.className}`}
    >
      <Icon size={12} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

interface SubscribeCTAProps {
  artistName: string;
  artistSlug: string;
  tierName?: string;
  tierPrice?: number;
}

export function SubscribeCTA({
  artistName,
  artistSlug,
  tierPrice,
}: SubscribeCTAProps) {
  return (
    <div className="bg-gradient-to-r from-crwn-gold/10 via-crwn-gold/5 to-transparent border border-crwn-gold/30 rounded-xl p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-crwn-gold/20 rounded-full flex items-center justify-center flex-shrink-0">
          <Lock size={24} className="text-crwn-gold" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-crwn-text mb-1">
            Unlock exclusive content from {artistName}
          </h3>
          <p className="text-crwn-text-secondary text-sm mb-4">
            Subscribe to get access to subscriber-only tracks, behind-the-scenes content, and more.
          </p>
          <div className="flex items-center gap-3">
            <a
              href={`/artist/${artistSlug}?subscribe=true`}
              className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg px-5 py-2.5 rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors"
            >
              <Crown size={18} />
              Subscribe{ tierPrice ? ` $${tierPrice / 100}/mo` : ''}
            </a>
            <span className="text-xs text-crwn-text-secondary">
              Cancel anytime
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface LockedContentOverlayProps {
  title: string;
  artistSlug: string;
  type?: 'track' | 'post' | 'video';
}

export function LockedContentOverlay({
  title,
  artistSlug,
  type = 'track',
}: LockedContentOverlayProps) {
  const typeLabels = {
    track: 'This track',
    post: 'This post',
    video: 'This video',
  };

  return (
    <div className="absolute inset-0 bg-crwn-bg/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 z-10">
      <div className="w-16 h-16 bg-crwn-gold/10 rounded-full flex items-center justify-center mb-4">
        <Lock size={28} className="text-crwn-gold" />
      </div>
      <h3 className="text-lg font-semibold text-crwn-text text-center mb-2">
        {typeLabels[type]} is locked
      </h3>
      <p className="text-crwn-text-secondary text-sm text-center mb-6 max-w-xs">
        Subscribe to {title} to unlock this and other exclusive content.
      </p>
      <a
        href={`/artist/${artistSlug}?subscribe=true`}
        className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg px-6 py-3 rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors"
      >
        <Crown size={18} />
        Subscribe to unlock
      </a>
    </div>
  );
}
