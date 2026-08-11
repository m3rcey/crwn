'use client';

// The participant's whole experience. Join, get the link, see what you actually did.
//
// Three things this component deliberately does NOT have:
//  - a leaderboard. Nobody sees another participant's numbers, so this page publishes nothing.
//  - a "views" or "shares" field. CRWN cannot see either, and a box a fan types a number into
//    would turn a guess into a statistic.
//  - any configuration. A fan never sets a reward, a goal or a window.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Loader2, Users } from 'lucide-react';

interface ActiveCampaign {
  id: string;
  title: string;
  archetypeLabel: string;
  endsAt: string;
  closed: boolean;
  participantCount: number;
  toolkit: { what_to_do: string; why_it_matters: string; share_message: string };
  incentive: string;
}

interface You {
  isArtist: boolean;
  joined: boolean;
  role: string | null;
  referralUrl: string;
  verifiedPaidConversions: number | null;
}

function daysLeft(endsAt: string): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
}

export function CampaignJoin({ slug, artistName }: { slug: string; artistName: string }) {
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<ActiveCampaign | null>(null);
  const [you, setYou] = useState<You | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/fan-campaigns/active?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      setCampaign(data.campaign ?? null);
      setYou(data.you ?? null);
    } catch {
      setCampaign(null);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const join = async () => {
    if (!campaign) return;
    setJoining(true);
    setError('');
    try {
      const res = await fetch('/api/fan-campaigns/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Could not join.');
      else await load();
    } catch {
      setError('Could not join.');
    }
    setJoining(false);
  };

  const copyLink = async () => {
    if (!you?.referralUrl) return;
    try {
      await navigator.clipboard.writeText(you.referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard refused; the link is on screen either way */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-crwn-text font-medium">No drive is running right now.</p>
        <p className="text-sm text-crwn-text-secondary mt-2">
          {artistName} is not asking for help at the moment.
        </p>
        <Link href={`/${slug}`} className="inline-block mt-6 text-sm text-crwn-gold">
          Go to their page
        </Link>
      </div>
    );
  }

  const left = daysLeft(campaign.endsAt);

  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-crwn-gold">{campaign.archetypeLabel}</p>
        <h1 className="text-2xl font-bold text-crwn-text mt-1">{campaign.title}</h1>
        <p className="text-sm text-crwn-text-secondary mt-1">
          {artistName} asked for this.{' '}
          {campaign.closed ? 'It has closed.' : left === 0 ? 'It closes today.' : `${left} day${left === 1 ? '' : 's'} left.`}
        </p>
      </div>

      <div className="neu-raised rounded-xl p-4 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-crwn-text-secondary">Your one job</p>
          <p className="text-crwn-text mt-1">{campaign.toolkit.what_to_do}</p>
        </div>
        {campaign.toolkit.why_it_matters && (
          <div>
            <p className="text-xs uppercase tracking-wide text-crwn-text-secondary">Why</p>
            <p className="text-sm text-crwn-text-secondary mt-1 whitespace-pre-line">
              {campaign.toolkit.why_it_matters}
            </p>
          </div>
        )}
      </div>

      {campaign.participantCount > 0 && (
        <p className="text-sm text-crwn-text-secondary flex items-center gap-2">
          <Users className="w-4 h-4 text-crwn-gold" />
          {campaign.participantCount} {campaign.participantCount === 1 ? 'person is' : 'people are'} in.
        </p>
      )}

      {!you && (
        <div className="neu-raised rounded-xl p-4 text-center">
          <p className="text-sm text-crwn-text">Sign in to get your link and join.</p>
          <Link
            href={`/login?next=${encodeURIComponent(`/${slug}/campaign`)}`}
            className="inline-block mt-3 px-5 py-2 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold"
          >
            Sign in
          </Link>
        </div>
      )}

      {you && you.isArtist && (
        <div className="neu-raised rounded-xl p-4">
          <p className="text-sm text-crwn-text-secondary">
            This is your own drive, so you cannot join it. Send this page to the fans you want in.
          </p>
        </div>
      )}

      {you && !you.isArtist && !you.joined && !campaign.closed && (
        <div className="neu-raised rounded-xl p-4 space-y-3">
          <p className="text-sm text-crwn-text-secondary">{campaign.incentive}</p>
          <button
            onClick={join}
            disabled={joining}
            className="w-full py-3 rounded-full bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-60"
          >
            {joining ? 'Joining...' : "I'm in"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}

      {you && you.joined && (
        <div className="neu-raised rounded-xl p-4 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-crwn-text-secondary">Your link</p>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 text-xs text-crwn-text bg-crwn-elevated rounded-lg px-3 py-2 truncate">
                {you.referralUrl}
              </code>
              <button
                onClick={copyLink}
                className="p-2 rounded-lg bg-crwn-elevated text-crwn-gold"
                aria-label="Copy your link"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {campaign.toolkit.share_message && (
            <div>
              <p className="text-xs uppercase tracking-wide text-crwn-text-secondary">
                What to say
              </p>
              <p className="text-sm text-crwn-text mt-1 bg-crwn-elevated rounded-lg p-3 whitespace-pre-line">
                {campaign.toolkit.share_message}
                {you.referralUrl}
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-crwn-elevated">
            <p className="text-xs uppercase tracking-wide text-crwn-text-secondary">
              What you have brought in
            </p>
            <p className="text-2xl font-bold text-crwn-gold mt-1">
              {you.verifiedPaidConversions ?? 0}
            </p>
            <p className="text-xs text-crwn-text-secondary mt-1">
              Paying members who joined through your link during this drive. CRWN counts this at the
              payment, so it is the real number.
            </p>
            <p className="text-xs text-crwn-text-secondary mt-2">
              Free members are not counted here. CRWN cannot tell who sent them.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
