'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Scissors, Check, Link2 } from 'lucide-react';
import { canUseFeature } from '@/lib/platformTier';
import { resolveClipperRateTimeline, capTimeline, type ClipperRateStep } from '@/lib/clipperRate';

interface ClipperProgramProps {
  artistSlug: string;
  artistName: string;
  platformTier: string | null;
  standardRate: number;
  schedule: ClipperRateStep[] | null;
  campaignStartedAt: string | null;
}

export function ClipperProgram({
  artistSlug, artistName, platformTier, standardRate, schedule, campaignStartedAt,
}: ClipperProgramProps) {
  const { user, profile } = useAuth();
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  if (!user || !profile) return null;
  if (!canUseFeature(platformTier, 'allowsClipper')) return null;

  // Show PAID rates (after the platform-fee cap), so the panel never overstates.
  const timeline = capTimeline(
    resolveClipperRateTimeline({ schedule, campaignStartedAt, standardRate }),
    platformTier
  );
  const currentRate = timeline.currentRate;
  if (currentRate <= 0) return null; // artist isn't paying clippers

  const referralCode = profile.username || user.id.replace(/-/g, '').substring(0, 8);
  const clipperUrl = `https://thecrwn.app/${artistSlug}?ref=${referralCode}&src=clipper`;

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(clipperUrl);
    } catch {
      const input = document.createElement('input');
      input.value = clipperUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm bg-crwn-gold text-crwn-bg font-medium hover:bg-crwn-gold-hover transition-colors"
      >
        <Scissors className="w-4 h-4" />
        <span>Clip & Earn {currentRate}%</span>
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-[calc(100vw-2rem)] max-w-80 bg-[#1a1a1a] border border-crwn-elevated rounded-xl shadow-xl z-50 p-4">
          <p className="text-sm text-crwn-text font-medium mb-1">
            Earn {currentRate}% clipping {artistName}
          </p>
          <p className="text-xs text-crwn-text-secondary mb-3">
            Post clips with your link. Earn {currentRate}% of every subscription a viewer starts through it,
            for as long as they stay subscribed.
          </p>

          {/* Step-down schedule, so nobody is caught off guard */}
          {timeline.changes.length > 0 && (
            <div className="mb-3 rounded-lg bg-crwn-elevated p-3">
              <p className="text-xs text-crwn-text font-medium mb-1">Rate schedule</p>
              <ul className="space-y-0.5">
                {timeline.changes.map((c) => (
                  <li key={c.date} className="text-xs text-crwn-text-secondary">
                    Drops to <span className="text-crwn-gold font-semibold">{c.to}%</span> on {fmtDate(c.date)}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-crwn-text-secondary mt-2">
                Get clips up before a drop to lock the higher rate on those subscribers.
              </p>
            </div>
          )}

          <div className="flex gap-2 mb-2">
            <input
              type="text"
              readOnly
              value={clipperUrl}
              className="flex-1 text-xs bg-crwn-elevated rounded-lg px-3 py-2 text-crwn-text-secondary truncate"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-crwn-gold text-crwn-bg hover:bg-crwn-gold-hover transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-crwn-text-secondary">
            Track earnings in your Library → Referrals.
          </p>
        </div>
      )}
    </div>
  );
}
