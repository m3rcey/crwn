'use client';

/**
 * Earn With This Artist — compact surfacing card on the public artist page.
 *
 * Pure SURFACING: consolidates the artist's current promotion (share commission,
 * clip commission + step-down timer) into one entry point so any fan can start
 * promoting. Reuses the existing rails end-to-end — referral links via
 * buildReferralUrl/generateReferralCode, the clip flow via the existing
 * <ClipperProgram> component, and rate math via resolveClipperRateTimeline.
 * No new tables, routes, or money logic.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Link2, Check, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArtistPreview } from '@/hooks/useArtistPreview';
import { buildReferralUrl, generateReferralCode } from '@/lib/referrals';
import { canUseFeature } from '@/lib/platformTier';
import {
  resolveClipperRateTimeline,
  capTimeline,
  type ClipperRateStep,
} from '@/lib/clipperRate';
import { ClipperProgram } from '@/components/shared/ClipperProgram';

const MS_PER_DAY = 86_400_000;

interface EarnWithArtistProps {
  artistSlug: string;
  artistName: string;
  /** auth.users id of the page owner — the card hides on the owner's own page. */
  artistUserId: string;
  platformTier: string | null;
  /** Raw artist_profiles.referral_commission_rate (share-to-earn %). */
  referralRate: number | null;
  /** artist_profiles.clipper_commission_rate (standard post-ramp rate). */
  clipperStandardRate: number;
  clipperSchedule: ClipperRateStep[] | null;
  clipperCampaignStartedAt: string | null;
  /**
   * Movement-tab owner preview: instead of hiding on the owner's own page,
   * show the fan-facing card (read-only, no earn actions) — or, when no
   * promotion is running, a prompt to set one up. Fan behavior is unchanged.
   */
  ownerPreview?: boolean;
  /** Skip the outer page padding when rendered inside an already-padded tab body. */
  embedded?: boolean;
}

export function EarnWithArtist({
  artistSlug,
  artistName,
  artistUserId,
  platformTier,
  referralRate,
  clipperStandardRate,
  clipperSchedule,
  clipperCampaignStartedAt,
  ownerPreview = false,
  embedded = false,
}: EarnWithArtistProps) {
  const { user, profile } = useAuth();
  const { previewing } = useArtistPreview();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const wrapperClass = embedded ? '' : 'px-4 sm:px-6 lg:px-8 mt-6';

  // Never pitch the artist on promoting themselves — unless the Movement tab
  // explicitly asked for an owner preview of what fans see. While the owner is
  // previewing the page as a fan, they ARE the audience for this card, so the
  // real fan-facing version renders instead of being hidden.
  const isOwner = !!user && user.id === artistUserId && !previewing;
  if (isOwner && !ownerPreview) return null;
  const showOwnerPreview = isOwner && ownerPreview;

  // Share-to-earn is active only when the artist has an explicit referral rate.
  const shareRate = Math.max(0, Math.round(referralRate ?? 0));
  const shareActive = shareRate > 0;

  // Clip-to-earn: show PAID rates (post platform-fee cap) so we never overstate.
  const timeline = capTimeline(
    resolveClipperRateTimeline({
      schedule: clipperSchedule,
      campaignStartedAt: clipperCampaignStartedAt,
      standardRate: clipperStandardRate,
      now: new Date(),
    }),
    platformTier
  );
  const clipActive =
    canUseFeature(platformTier, 'allowsClipper') && timeline.currentRate > 0;

  // No promotion running — render nothing for fans; for the owner preview,
  // prompt them to turn a promotion on instead.
  if (!shareActive && !clipActive) {
    if (showOwnerPreview) {
      return (
        <div className={wrapperClass}>
          <div className="rounded-xl border border-crwn-elevated bg-[#1a1a1a] p-4">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="w-4 h-4 text-crwn-gold" />
              <h3 className="text-sm font-semibold text-crwn-text">Let fans earn promoting you</h3>
            </div>
            <p className="text-xs text-crwn-text-secondary">
              Turn on Share-to-Earn or Clip-to-Earn so fans can earn promoting you.
              It shows right here on your page.
            </p>
            <button
              onClick={() => router.push('/offers/new')}
              className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm bg-crwn-gold text-crwn-bg font-medium hover:bg-crwn-gold-hover transition-colors"
            >
              <span>Set up earning</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  // Upcoming step-down ("drops to Z% in N days"), only when it's a real drop.
  const nextChange = clipActive ? timeline.nextChange : null;
  const daysUntilDrop = nextChange
    ? Math.max(1, Math.ceil((new Date(nextChange.date).getTime() - Date.now()) / MS_PER_DAY))
    : null;

  const handleStartEarning = async () => {
    if (!user) {
      router.push(`/login?next=/${artistSlug}`);
      return;
    }
    const code = generateReferralCode(profile?.username ?? null, user.id);
    const url = buildReferralUrl(artistSlug, code);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={wrapperClass}>
      <div
        className="rounded-xl border border-crwn-elevated bg-[#1a1a1a] p-4"
        data-tour="earn-with-artist"
      >
        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-4 h-4 text-crwn-gold" />
          <h3 className="text-sm font-semibold text-crwn-text">
            Earn with {artistName}
          </h3>
        </div>

        <p className="text-xs text-crwn-text-secondary">
          {shareActive && (
            <>
              Share: <span className="text-green-400 font-semibold">{shareRate}%</span>
            </>
          )}
          {shareActive && clipActive && ' · '}
          {clipActive && (
            <>
              Clip: <span className="text-green-400 font-semibold">{timeline.currentRate}%</span>
            </>
          )}{' '}
          recurring commission on every subscription through your link.
        </p>

        {nextChange && daysUntilDrop !== null && (
          <p className="text-xs text-orange-400 font-medium mt-1">
            Clip rate drops to {nextChange.to}% in {daysUntilDrop} day{daysUntilDrop === 1 ? '' : 's'}
          </p>
        )}

        {/* Owner preview: read-only — no earn actions for the artist themselves. */}
        {showOwnerPreview && (
          <p className="text-xs text-crwn-text-secondary/70 italic mt-2">
            This is what fans see on your page.
          </p>
        )}

        {!showOwnerPreview && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            onClick={handleStartEarning}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm bg-crwn-gold text-crwn-bg font-medium hover:bg-crwn-gold-hover transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            <span>{copied ? 'Link copied!' : 'Start earning'}</span>
          </button>

          {/* Reuse the existing clip flow — same component, same link, same rules. */}
          {clipActive && (
            <ClipperProgram
              artistSlug={artistSlug}
              artistName={artistName}
              platformTier={platformTier}
              standardRate={clipperStandardRate}
              schedule={clipperSchedule}
              campaignStartedAt={clipperCampaignStartedAt}
            />
          )}

          <button
            onClick={() => router.push('/earn')}
            className="flex items-center gap-1 text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors ml-auto"
          >
            Open Earn Center
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
