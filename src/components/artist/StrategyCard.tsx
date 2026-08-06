'use client';

// The membership strategy card on the command screen (release strategy spec,
// 2026-08-01). Shows WHICH model this artist should run (Release Club or Vault
// Membership), the monthly promise it commits them to, and what each ladder
// rung means inside it. The pick is derived server-side and deterministic; the
// artist can switch (two strategies = a genuine binary, so two buttons per the
// UX rule) and their choice is stored as an override.
//
// Rung NAMES come from RECOMMENDED_LADDER, never from the strategy data: the
// spec's "First Listen" / "Inner Circle" / "Executive" are roles, and the
// ladder stays Bronze/Silver/Gold/Platinum.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Compass } from 'lucide-react';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { RECOMMENDED_LADDER } from '@/lib/tierTemplate';
import type {
  MembershipStrategyDef,
  MembershipStrategyKey,
  StrategyRecommendation,
} from '@/lib/membershipStrategy';
import type { RevenueModelDef, RevenueModelRecommendation } from '@/lib/avatars/revenueModels';

interface StrategyResponse {
  recommendation: StrategyRecommendation;
  override: MembershipStrategyKey | null;
  active: MembershipStrategyKey;
  strategy: MembershipStrategyDef;
  platformPlan: string;
  facts: { unreleasedTracks?: number | null; releasesPerYear?: number | null };
  /** The offer-archetype prescription (revenueModels.ts). Absent on older responses. */
  revenueModel?: { recommendation: RevenueModelRecommendation; def: RevenueModelDef | null } | null;
}

// The two DECLARED questions that actually separate the strategies (spec
// section 20). Ranges, not numbers: the artist knows "a lot" better than "23",
// and each range maps to one deterministic value the brain thresholds on.
const UNRELEASED_OPTIONS = [
  { value: '0', label: 'Nothing unreleased', hint: 'Everything I have is out' },
  { value: '5', label: 'A few songs', hint: 'A handful of demos or leftovers' },
  { value: '15', label: 'A real archive', hint: 'Ten to twenty five unreleased songs' },
  { value: '40', label: 'A deep vault', hint: 'More than twenty five' },
];
const CADENCE_OPTIONS = [
  { value: '12', label: 'Monthly or more', hint: 'I release all the time' },
  { value: '5', label: 'Every few months', hint: 'A handful of drops a year' },
  { value: '2', label: 'Once or twice a year', hint: 'Big drops, long gaps' },
  { value: '0', label: 'Rarely right now', hint: 'Nothing on the calendar' },
];

const rungName = (key: string) => RECOMMENDED_LADDER.find((t) => t.key === key)?.name ?? key;

export function StrategyCard() {
  const [data, setData] = useState<StrategyResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/artist/strategy')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (active && j?.strategy) setData(j);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!data) return null;

  const { strategy, recommendation, active: activeKey, platformPlan } = data;
  const otherKey: MembershipStrategyKey = activeKey === 'release_club' ? 'vault_membership' : 'release_club';
  const promise = platformPlan === 'starter' ? strategy.monthlyPromise.launch : strategy.monthlyPromise.pro;
  const isRecommended = activeKey === recommendation.strategy;

  const saveFacts = async (patch: { unreleasedTracks?: number; releasesPerYear?: number }) => {
    if (switching) return;
    setSwitching(true);
    try {
      const res = await fetch('/api/artist/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      // Pre-migration the save 503s; the card just keeps showing the derived
      // recommendation, which is the documented fail-soft.
      if (res.ok) {
        const fresh = await fetch('/api/artist/strategy');
        if (fresh.ok) {
          const j = await fresh.json();
          if (j?.strategy) setData(j);
        }
      }
    } finally {
      setSwitching(false);
    }
  };

  const switchTo = async (key: MembershipStrategyKey) => {
    if (switching) return;
    setSwitching(true);
    try {
      // Switching TO the recommendation clears the override rather than pinning
      // it, so a future better recommendation is not silently ignored.
      const body = { strategy: key === recommendation.strategy ? null : key };
      const res = await fetch('/api/artist/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const fresh = await fetch('/api/artist/strategy');
        if (fresh.ok) {
          const j = await fresh.json();
          if (j?.strategy) setData(j);
        }
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="neu-raised rounded-2xl p-5 mb-6" data-tour="strategy">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-crwn-gold" />
            Your membership strategy
          </p>
          <h2 className="text-lg font-bold text-crwn-text mt-1">{strategy.name}</h2>
          <p className="text-sm text-crwn-text-secondary">{strategy.tagline}</p>
        </div>
        {isRecommended && (
          <span className="text-[10px] uppercase tracking-wide text-crwn-gold border border-crwn-gold/40 rounded-full px-2 py-1 shrink-0">
            Recommended
          </span>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-crwn-bg border border-crwn-elevated p-3">
        <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-1">Your monthly promise</p>
        <p className="text-sm text-crwn-text">{promise}</p>
        <p className="text-xs text-crwn-text-secondary mt-1.5">
          A promise you skip is a fan you lose. The Promise Calendar keeps every one dated.
        </p>
      </div>

      {/* The revenue-model prescription: WHICH monetization system to run first.
          Orthogonal to the strategy above (how the tiers are run) and to the
          sub-avatar (who the artist is). Derived server-side, never stored. */}
      {data.revenueModel?.def && (
        <div className="mt-3 rounded-xl bg-crwn-bg border border-crwn-elevated p-3">
          <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-1">
            Your revenue model{data.revenueModel.recommendation.isDefault ? ' (the proven default)' : ''}
          </p>
          <p className="text-sm font-semibold text-crwn-text">{data.revenueModel.def.label}</p>
          <p className="text-xs text-crwn-text-secondary mt-1">{data.revenueModel.def.bestFor}</p>
          <p className="text-xs text-crwn-text mt-1.5">{data.revenueModel.def.initialOffer}</p>
          {!data.revenueModel.recommendation.isDefault && data.revenueModel.recommendation.evidence[0] && (
            <p className="text-[11px] text-crwn-text-secondary mt-1.5 italic">
              Why: {data.revenueModel.recommendation.evidence[0]}.
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {data.revenueModel.def.firstMoves.map((m) => (
              <Link
                key={m.route}
                prefetch
                href={m.route}
                className="text-xs font-medium px-3 py-1.5 rounded-full border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/50 transition-colors"
              >
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {!isRecommended && (
        <p className="text-xs text-crwn-text-secondary mt-2">
          Recommended for you: {recommendation.reasons[0]}.
        </p>
      )}

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-crwn-gold hover:text-crwn-gold/80 transition-colors"
      >
        {expanded ? 'Hide the model' : 'See what each tier means'}
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {strategy.tierRoles.map((role) => (
            <div key={role.rung} className="rounded-xl border border-crwn-elevated p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-crwn-text">
                  {rungName(role.rung)}
                  <span className="text-crwn-text-secondary font-normal"> as {role.role}</span>
                </p>
                {role.earlyAccessDays > 0 && (
                  <span className="text-[10px] text-crwn-gold shrink-0">{role.earlyAccessDays} days early</span>
                )}
              </div>
              <p className="text-xs text-crwn-text-secondary mt-1 italic">{role.promise}</p>
              <ul className="mt-1.5 space-y-0.5">
                {role.highlights.map((h) => (
                  <li key={h} className="text-xs text-crwn-text-secondary">
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              prefetch
              href="/account/tiers"
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors"
            >
              Set up the ladder
            </Link>
            <Link
              prefetch
              href="/studio/music"
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/50 transition-colors"
            >
              Classify your music
            </Link>
            <Link
              prefetch
              href="/studio/promise"
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/50 transition-colors"
            >
              Promise Calendar
            </Link>
          </div>

          {/* The two declared questions that decide the recommendation. Answering
              can flip it, which is the point: the brain thresholds on these. */}
          <div className="pt-1 border-t border-crwn-elevated/60">
            <p className="text-[11px] text-crwn-text-secondary mt-2 mb-1.5">
              Tune the recommendation (only you know these):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] text-crwn-text-secondary mb-1">Unreleased music</p>
                <OptionSelect
                  options={UNRELEASED_OPTIONS}
                  value={data.facts.unreleasedTracks != null ? String(data.facts.unreleasedTracks) : null}
                  onChange={(v) => saveFacts({ unreleasedTracks: parseInt(v) })}
                  placeholder="How much is unreleased?"
                />
              </div>
              <div>
                <p className="text-[11px] text-crwn-text-secondary mb-1">Public release pace</p>
                <OptionSelect
                  options={CADENCE_OPTIONS}
                  value={data.facts.releasesPerYear != null ? String(data.facts.releasesPerYear) : null}
                  onChange={(v) => saveFacts({ releasesPerYear: parseInt(v) })}
                  placeholder="How often do you release?"
                />
              </div>
            </div>
          </div>

          {/* Two strategies: a genuine binary, so two buttons (the dropdown rule's exception). */}
          <div className="pt-1 border-t border-crwn-elevated/60">
            <p className="text-[11px] text-crwn-text-secondary mt-2 mb-1.5">Running a different model?</p>
            <button
              type="button"
              onClick={() => switchTo(otherKey)}
              disabled={switching}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/50 disabled:opacity-50 transition-colors"
            >
              {switching
                ? 'Switching...'
                : otherKey === 'vault_membership'
                  ? 'Switch to The Vault Membership'
                  : 'Switch to The Release Club'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
