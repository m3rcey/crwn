'use client';

// The campaign wrapper above an evergreen funnel.
//
// It adds a deadline and a reason to take part now. It does NOT replace the lead magnet,
// does not touch the offers below it, and carries no purchase affordance of any kind: the
// primary CTA on this page remains "Unlock <magnet>", because the magnet is still the
// value exchange and the campaign is context around it.
//
// This component only ever receives a presentation that src/lib/campaigns/giveaway.ts has
// already proven complete, so there is no partial-sweepstakes branch to render here. If a
// giveaway block exists, every legal element exists with it.

import { Clock, Sparkles } from 'lucide-react';
import type { CampaignPresentation } from '@/lib/campaigns/giveaway';

function daysLeft(endsAt: string, now = Date.now()): number | null {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now) / 86400000));
}

export function CampaignBanner({ campaign }: { campaign: CampaignPresentation }) {
  const left = daysLeft(campaign.endsAt);

  return (
    <section
      aria-label={campaign.title}
      className="neu-raised rounded-2xl p-6 bg-crwn-card text-center mb-6"
    >
      <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-crwn-gold mb-2">
        <Sparkles className="w-3.5 h-3.5" /> {campaign.title}
      </p>
      <h1 className="text-2xl font-bold text-crwn-text leading-tight">{campaign.promise}</h1>
      <p className="text-sm text-crwn-text-secondary mt-2">{campaign.whatToDo}</p>

      {left !== null && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-crwn-text">
          <Clock className="w-4 h-4 text-crwn-gold" />
          {left === 0 ? 'Ends today' : left === 1 ? '1 day left' : `${left} days left`}
        </p>
      )}

      {campaign.giveaway && (
        <div className="mt-5 pt-5 border-t border-white/10 text-center">
          <p className="text-sm font-semibold text-crwn-text">
            {campaign.giveaway.prize}
            {campaign.giveaway.prizeValue ? (
              <span className="text-crwn-text-secondary font-normal"> ({campaign.giveaway.prizeValue})</span>
            ) : null}
          </p>
          {/* The no-purchase path, the eligibility line and the rules link are shown
              together and never separately: they are one disclosure, and the gate that
              let this render already proved all three exist. */}
          <p className="mt-2 text-xs text-crwn-text-secondary leading-relaxed">
            No purchase necessary. {campaign.giveaway.freeEntry} {campaign.giveaway.eligibility}{' '}
            <a
              href={campaign.giveaway.officialRulesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-crwn-gold underline"
            >
              Official Rules
            </a>
            .
          </p>
        </div>
      )}
    </section>
  );
}
