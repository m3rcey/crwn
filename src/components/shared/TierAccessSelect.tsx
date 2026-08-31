'use client';

// Who can see this? One dropdown, cumulative by construction.
//
// Replaces a column of tier checkboxes. Checkboxes made the WRONG answer the easy one: an
// artist writing a Silver post ticks Silver, and the Gold and Platinum members who paid
// more silently lose access. Nothing errors, nothing logs, and the highest payer gets the
// least until somebody complains.
//
// Here the choices are rungs, and picking one saves that rung and everyone above it
// (expandFromTier). The artist reads "Silver and above" and that is exactly what is stored.
//
// A hand-picked set made before this existed still renders honestly: the control shows the
// real names rather than snapping to a tidy rung it was never set to.

import { OptionSelect } from '@/components/ui/OptionSelect';
import {
  ladderOrder,
  expandFromTier,
  rungFromAllowList,
  describeTierAccess,
  type LadderTier,
} from '@/lib/tierLadder';

const EVERYONE = '__everyone__';

interface TierAccessSelectProps {
  tiers: LadderTier[];
  /** Current stored value. */
  isFree: boolean;
  allowedTierIds: string[];
  /** Receives the values to SAVE: the gate stays exact-match, so this list is already expanded. */
  onChange: (next: { isFree: boolean; allowedTierIds: string[] }) => void;
  /** Offer the free "everyone" option. Off where a membership is the point of the thing. */
  allowEveryone?: boolean;
  className?: string;
}

export function TierAccessSelect({
  tiers,
  isFree,
  allowedTierIds,
  onChange,
  allowEveryone = true,
  className = '',
}: TierAccessSelectProps) {
  const ordered = ladderOrder(tiers);
  const rung = rungFromAllowList(ordered, allowedTierIds);
  const value = isFree ? EVERYONE : rung;

  const options = [
    ...(allowEveryone
      ? [{ value: EVERYONE, label: 'Everyone', hint: 'No membership needed.' }]
      : []),
    ...ordered.map((t, i) => {
      const isTop = i === ordered.length - 1;
      const above = ordered.slice(i + 1).map((x) => x.name);
      return {
        value: t.id,
        label: isTop ? `${t.name} only` : `${t.name} and above`,
        hint: isTop
          ? 'Your top rung, and nobody else.'
          : `Includes ${above.join(' and ')}, so nobody who pays more misses it.`,
      };
    }),
  ];

  return (
    <div className={className}>
      <OptionSelect
        options={options}
        value={value}
        onChange={(v) => {
          if (v === EVERYONE) return onChange({ isFree: true, allowedTierIds: [] });
          onChange({ isFree: false, allowedTierIds: expandFromTier(ordered, v) });
        }}
        placeholder="Who can see this?"
      />
      {/* A set chosen before this control existed, or edited by hand elsewhere. Shown as
          it really is rather than rounded to the nearest rung. */}
      {!isFree && allowedTierIds.length > 0 && !rung ? (
        <p className="text-[11px] text-crwn-text-secondary/70 mt-1.5">
          Currently set to {describeTierAccess(ordered, allowedTierIds, false)}. Choosing a
          rung above will replace it.
        </p>
      ) : null}
    </div>
  );
}
