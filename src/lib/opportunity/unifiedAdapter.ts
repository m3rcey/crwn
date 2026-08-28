// Presents the unified model as the standard CRWN result structure.
//
// The model (unifiedModel.ts) decides the arithmetic; this file decides what an artist reads. It
// deliberately does NOT go through buildLossResult, for the same reason `worth` does not: the
// unified result needs several projection blocks (headline, breakdown, participation) and two
// prominent plain-language lists (what was not counted twice, what is not in the total), and the
// shared loss engine emits exactly one of each. Everything else about the shape is identical, so
// both renderers, the emailed version and the tokenized result page all work unchanged.
//
// Presentation rules held here:
//  - The headline is a RANGE (conservative to high), not a point estimate dressed up as one.
//  - Recurring and one-time money are never merged into a single tile.
//  - Acquisition systems appear under "growth contribution" as a share of supporters, never as a
//    dollar line, because their dollars are already inside the membership number.
//  - The word used is "could build". Never owed, never guaranteed, never current revenue.
//  - The headline NAMES its own deductions. `netNewMonthlyCents` is gross minus the CRWN fee,
//    minus the commissions the artist funds, minus what they already earn direct. Calling that
//    "direct-to-fan revenue" described none of the three, and the last one is the model being
//    deliberately conservative, so leaving it unsaid gave away the honesty for nothing.

import type { GeneratedResult, ResultSection } from '@/lib/leadMagnets/types';
import {
  calculateUnifiedOpportunity,
  calculateScenarioBand,
  UNIFIED_MODEL_VERSION,
  type UnifiedInputs,
  type UnifiedResult,
} from './unifiedModel';

const usd = (cents: number): string => '$' + Math.round(cents / 100).toLocaleString('en-US');
const count = (n: number): string => Math.max(0, Math.floor(n)).toLocaleString('en-US');
const pct = (n: number): string => `${Math.round(n * 100)}%`;
/**
 * Percentages that can be smaller than one. `pct` rounds 0.003 to "0%", which reads as "this
 * assumption does nothing" about a seat rate that can carry 40% of the gross at arena scale.
 */
const rate = (n: number): string => {
  const p = n * 100;
  return `${p > 0 && p < 1 ? p.toFixed(1) : Math.round(p)}%`;
};

/** Wizard/DM values are flat strings and numbers. Coerce them into the model's typed inputs. */
export function toUnifiedInputs(raw: Record<string, unknown>): Partial<UnifiedInputs> {
  const extra = (raw.extra && typeof raw.extra === 'object' ? raw.extra : {}) as Record<string, unknown>;
  const get = (key: string): unknown => (raw[key] !== undefined && raw[key] !== null ? raw[key] : extra[key]);
  const num = (key: string): number => {
    const v = get(key);
    const n = typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const opt = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = get(key);
    return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  };

  return {
    socialFollowers: num('social_followers'),
    monthlyListeners: num('monthly_listeners'),
    ownedContacts: num('owned_contacts'),
    currentPayingSupporters: num('current_supporters'),
    currentDirectRevenueCents: num('direct_fan_revenue_cents'),
    unreleasedCount: num('unreleased_count'),
    // Share-to-Earn, Clip-to-Earn, live nights and producer sessions are pinned OFF (founder
    // decision, 2026-08-28). The unified calculator no longer asks about them, and a stored answer
    // from before that date is deliberately not read either: this tool models the membership, and
    // the three feature calculators are where those systems are asked about and built.
    fansPromote: 'unlikely',
    videoOutput: 'none',
    promoterOverlap: 'unknown',
    liveWilling: 'no',
    sessionStructure: 'none',
    vaultPlacement: opt('vault_placement', ['none', 'tier', 'standalone'] as const, 'tier'),
    timeCapacity: opt('time_capacity', ['low', 'medium', 'high'] as const, 'medium'),
  };
}

function headlineFor(low: number, high: number, expected: number): { headline: string; hero: string; eyebrow: string } {
  if (expected <= 0) {
    return {
      headline: 'Tell us about your audience and we will model what you could build',
      hero: '',
      eyebrow: '',
    };
  }
  return {
    headline: `You could build an estimated ${usd(low)} to ${usd(
      high,
    )} a month on top of what you already earn direct, after CRWN's fee and any commissions you pay`,
    hero: `${usd(low)} to ${usd(high)}`,
    eyebrow: 'You could build an estimated',
  };
}

function derivationFor(r: UnifiedResult): ResultSection {
  const rows: { label: string; value: string; note?: string }[] = [
    {
      label: 'Your audience',
      value: count(r.audience.primaryReach),
      note:
        r.audience.crossPlatformOverlapUnknown
          ? 'The larger of your followers and listeners, not the two added together'
          : undefined,
    },
    {
      label: 'Fans you can actually reach',
      value: count(r.audience.addressable),
      note: r.audience.ownedContacts > 0
        ? `${count(r.audience.ownedContacts)} contacts you own, plus ${pct(r.assumptions.reachRate)} of everyone else`
        : `${pct(r.assumptions.reachRate)} of your audience`,
    },
  ];
  if (r.segments.referredReach > 0) {
    rows.push({
      label: 'New people your sharers reach',
      value: count(r.segments.referredReach),
      note: 'From outside your audience, which is why these are extra people',
    });
  }
  rows.push({
    label: 'Fans who become paying supporters',
    value: count(r.segments.payingSupporters),
    note: 'One number. Everything recurring is built on these people',
  });
  rows.push({ label: 'Across your membership ladder', value: `${usd(r.recurringGrossCents)}/mo` });
  if (r.oneTimeGrossCents > 0) {
    rows.push({
      label: 'Plus events and seats, sold to non-members',
      value: `${usd(r.oneTimeGrossCents)}/mo`,
      note: 'Members already have access, so they are not counted here',
    });
  }
  rows.push({ label: 'After the platform fee and commissions', value: `${usd(r.netMonthlyCents)}/mo` });
  return { key: 'derivation', title: 'How we get to the number', kind: 'derivation', metrics: rows };
}

/**
 * The artist's OWN concentration, stated in their own numbers.
 *
 * Pure arithmetic over `core.tiers`, which the model already produced: no new rate, no new
 * assumption, and nothing summed across opportunities. Returns null rather than a vague sentence
 * when the split cannot carry the claim (fewer than two paid rungs, no supporters, or no revenue),
 * because a concentration statement with nothing behind it is exactly the fake precision the
 * house rules forbid.
 */
export function unifiedFanDepth(
  tiers: { name: string; supporters: number; monthlyCents: number }[],
): string | null {
  const paid = (tiers ?? []).filter((t) => t.supporters > 0 && t.monthlyCents > 0);
  if (paid.length < 2) return null;

  const totalSupporters = paid.reduce((n, t) => n + t.supporters, 0);
  const totalMonthly = paid.reduce((n, t) => n + t.monthlyCents, 0);
  if (totalSupporters <= 0 || totalMonthly <= 0) return null;

  const top = paid.reduce((a, b) => (b.monthlyCents > a.monthlyCents ? b : a));
  const peopleShare = Math.round((top.supporters / totalSupporters) * 100);
  const moneyShare = Math.round((top.monthlyCents / totalMonthly) * 100);

  // Only worth saying when the top rung genuinely earns out of proportion to its headcount.
  if (moneyShare <= peopleShare) return null;

  return `Look at the split above. ${top.name} is about ${peopleShare}% of your paying fans and roughly ${moneyShare}% of your recurring revenue. The people who pay you most are the smallest group and the last to arrive, which is why an artist who launches one flat tier stalls well short of this number. Your follower count cannot tell these fans apart. That is the part CRWN is built to operate.`;
}

/** Build the full result an artist reads. `scenario` fixes the point estimate inside the range. */
export function buildUnifiedResult(raw: Record<string, unknown>): GeneratedResult {
  const inputs = toUnifiedInputs(raw);
  const band = calculateScenarioBand(inputs);
  const r = band.expected;
  const low = band.conservative.netNewMonthlyCents;
  const high = band.high.netNewMonthlyCents;
  const { headline, hero, eyebrow } = headlineFor(low, high, r.netNewMonthlyCents);

  const sections: ResultSection[] = [];

  // 1. The headline tiles. The renderer hoists the FIRST projection into the hero card, so these
  //    four are the ones that sit next to the big number.
  sections.push({
    key: 'headline',
    title: 'What it adds up to',
    kind: 'projection',
    metrics: [
      { label: 'Recurring, every month', value: `${usd(r.recurringGrossCents)}`, note: 'membership, gross' },
      { label: 'Events and seats', value: `${usd(r.oneTimeGrossCents)}`, note: 'per month, non-members only' },
      { label: 'Your net, monthly', value: `${usd(r.netMonthlyCents)}`, note: 'after fee and commissions' },
      { label: 'Paying supporters', value: count(r.segments.payingSupporters), note: 'unique people' },
    ],
  });

  // 2. The math, in one glance.
  sections.push(derivationFor(r));

  // 3. The range, run off one set of inputs so the columns stay consistent.
  sections.push({
    key: 'scenarios',
    title: 'Conservative to high',
    kind: 'scenarios',
    metrics: [
      { label: 'Conservative', value: `${usd(low)}/mo`, note: `${count(band.conservative.segments.payingSupporters)} supporters` },
      { label: 'Expected', value: `${usd(r.netNewMonthlyCents)}/mo`, note: `${count(r.segments.payingSupporters)} supporters` },
      { label: 'High', value: `${usd(high)}/mo`, note: `${count(band.high.segments.payingSupporters)} supporters` },
    ],
  });

  // 4. Core recurring revenue: the one ladder.
  sections.push({
    key: 'core',
    title: 'Core recurring revenue',
    kind: 'projection',
    metrics: [
      ...r.core.tiers.map((t) => ({
        label: `${t.name}, $${Math.round(t.priceCents / 100)}/mo`,
        value: `${usd(t.monthlyCents)}`,
        note: `${count(t.supporters)} supporters`,
      })),
      { label: 'Member extras', value: `${usd(r.core.memberAlacarteGrossCents)}`, note: 'one-off member spend, already counted here' },
    ],
  });

  // 5. Incremental, and only what is genuinely incremental.
  if (r.incremental.length) {
    sections.push({
      key: 'incremental',
      title: 'Experiences and purchases, on top',
      kind: 'projection',
      metrics: r.incremental.map((i) => ({
        label: i.label,
        value: i.grossCents > 0 ? `${usd(i.grossCents)}` : 'In the membership',
        // The unit price is the artist's own sanity check on a buyer count. Without it the seat
        // line is a dollar figure with no way to see what it is a price of.
        note: i.grossCents > 0 ? `${count(i.buyers)} buyers at ${usd(i.unitPriceCents)} each, none of them members` : i.basis,
      })),
    });
  }

  // 6. Growth contribution: supporters, never dollars. This is the section that would be a
  //    double-count if it carried a revenue figure.
  const attributed = r.attribution;
  if (attributed.shareAttributedSupporters > 0 || attributed.clipAttributedSupporters > 0) {
    sections.push({
      key: 'growth',
      title: 'Where those supporters come from',
      kind: 'projection',
      metrics: [
        { label: 'Found you on their own', value: count(attributed.organicSupporters), note: 'organic' },
        { label: 'Came from a fan clip', value: count(attributed.clipAttributedSupporters), note: 'Clip-to-Earn' },
        { label: 'Came from a fan share', value: count(attributed.shareAttributedSupporters), note: 'Share-to-Earn' },
        {
          label: 'Commission you pay them',
          value: `${usd(attributed.totalCommissionCents)}`,
          note: 'monthly, on the attributed part only',
        },
      ],
    });
  }

  // 7. Fan participation. Roles overlap, people do not.
  if (r.segments.uniquePromoters > 0) {
    sections.push({
      key: 'participation',
      title: 'Your fans, and what they would do',
      kind: 'projection',
      metrics: [
        { label: 'Would share your link', value: count(r.segments.sharers) },
        { label: 'Would cut clips', value: count(r.segments.clippers) },
        { label: 'Would do both', value: count(r.segments.dualPromoters), note: 'counted once as people' },
        { label: 'Unique fans helping', value: count(r.segments.uniquePromoters), note: 'the real headcount' },
      ],
    });
  }

  // 8. The overlap explanation. Prominent on purpose: it is the reason this number is smaller
  //    than the sum of the individual calculators, and the artist deserves to know why.
  // Zero To One beat 3, personalized. The `core` section already prints the per-rung supporter
  // and dollar split; this is the one line that says what it MEANS. Derived purely from those
  // existing canonical outputs: no new formula, no new assumption, no double counting.
  const depth = unifiedFanDepth(r.core.tiers);
  if (depth) {
    sections.push({ key: 'fanDepth', title: 'Your audience is not one group', kind: 'summary', text: depth });
  }

  sections.push({
    key: 'overlap',
    title: 'What we did not count twice',
    kind: 'list',
    items: r.overlapNotes,
  });

  // 9. The recommended system.
  sections.push({
    key: 'system',
    title: 'The system we would build for you',
    kind: 'nextSteps',
    items: r.recommendations
      .filter((rec) => rec.placement !== 'not_yet')
      .map((rec) => `${rec.label}: ${placementLabel(rec.placement)}. ${rec.reason}`),
  });

  // 10. Launch order.
  sections.push({
    key: 'sequence',
    title: 'What to launch first',
    kind: 'flow',
    items: r.launchSequence.map((p) => `${p.phase}. ${p.title}`),
  });

  // 11. Opportunity deliberately outside the dollar total.
  sections.push({
    key: 'notInTotal',
    title: 'Worth doing, but not in the number',
    kind: 'list',
    items: r.notInTheTotal.map((x) => `${x.label}: ${x.why}`),
  });

  // 12. Assumptions (collapsed by the renderer).
  //
  // Every rate that MOVES THIS ARTIST'S MONEY belongs here, and nothing that does not. The member
  // extras, the live event and the session seats were carrying real money with no rate stated
  // anywhere on the page: on a ticketed session at arena scale the seat line alone is about 40% of
  // gross, and its rate, its price, its cadence and the fact that no capacity limit is modeled were
  // all invisible. A transparent assumption an artist can argue with is the whole product claim.
  // The reverse also holds, so a layer the artist is not eligible for is not asserted at them.
  const a = r.assumptions;
  const ticketItem = r.incremental.find((i) => i.key === 'live_tickets');
  const seatItem = r.incremental.find((i) => i.key === 'producer_sessions');
  const hasGold = r.core.tiers.some((t) => t.key === 'vault');
  const assumptions: string[] = [
    `${pct(a.reachRate)} of your following is realistically reachable, and contacts you own are counted as fully reachable.`,
    // The ceiling is real but it never binds at these rates. Saying it "caps" the number implied a
    // guard doing work it does not do, which is its own small dishonesty.
    `${pct(a.superfanRate)} of that reachable audience ever pays. A ${pct(
      a.maxConversion,
    )} ceiling sits above that so no stack of growth systems can run away, and on these rates it is a guard rather than a limit you would reach.`,
    hasGold
      ? 'Tier prices of $10, $25 and $100, split across a typical supporter curve. Your vault is the $25 Gold tier, not a separate membership.'
      : 'Tier prices of $10, $25 and $100, split across a typical supporter curve. The $25 Gold rung is not in your total, because a vault needs at least five unreleased pieces before it is worth promising.',
    `Members spend about ${usd(
      a.memberAlacarteCents,
    )} a month each beyond their tier, on one-off things like a stem pack or a signed item.`,
  ];
  if (r.segments.sharers > 0) {
    assumptions.push(
      `${pct(a.shareRate)} of fans share for a reward, reaching about ${a.reachPerSharer} new people each a month, of whom ${pct(
        a.referredConversion,
      )} subscribe.`,
    );
  }
  if (r.segments.clippers > 0) {
    assumptions.push(
      `Clips raise how many of the fans you already reach convert, by about ${pct(
        a.clipConversionLift,
      )}. They do not create separate revenue.`,
    );
  }
  if (ticketItem) {
    assumptions.push(
      `One live event a month, at which ${rate(a.ticketRate)} of the fans you can reach who are not members buy a ${usd(
        a.ticketPriceCents,
      )} ticket, and ${pct(a.tipRate)} of those tip about ${usd(a.tipCents)}.`,
    );
  }
  if (seatItem && seatItem.grossCents > 0) {
    assumptions.push(
      `${rate(a.seatRate)} of the fans you can reach who are not members buy a session seat each month, at ${usd(
        seatItem.unitPriceCents,
      )} a seat for your audience size. How many sessions that is, and how many seats you could actually host, is yours to set: we do not model a capacity limit.`,
    );
  }
  // The disjoint-population rule only needs stating to an artist who actually has a second
  // population. The fee applies to everybody, so it stands on its own line.
  if (r.oneTimeGrossCents > 0) {
    assumptions.push('Tickets and seats are sold only to reachable fans who are not members, so no member is counted again as a buyer.');
  }
  assumptions.push(
    `Platform fee of ${a.platformFeePercent}% on the CRWN Pro plan, and you fund any referral or clipper commission on top of it.`,
    'Recurring and one-off revenue are reported separately and only added at the gross line.',
    'The headline subtracts what you already earn direct, so it is what you would ADD. It is a planning estimate for what you could build, not money you are owed, not current revenue, and not a guarantee.',
  );
  sections.push({ key: 'assumptions', title: 'Assumptions', kind: 'assumptions', items: assumptions });

  // The hero says "/mo", and depending on the answers between a quarter and a half of it can be
  // one-off ticket, tip and seat money. A reader hears "/mo" as recurring unless the split sits
  // next to the number, and the tile that carries it is further down the page.
  // An artist with no event money is told so plainly rather than being read a percentage split of
  // a thing they do not have. "About 100% of that is recurring, and the rest is events" is the kind
  // of sentence that quietly tells a careful reader the page is generated and unread.
  const recurringShare = r.totalGrossCents > 0 ? Math.round((r.recurringGrossCents / r.totalGrossCents) * 100) : 100;
  const hasOneTime = r.oneTimeGrossCents > 0;
  const summary =
    r.netNewMonthlyCents > 0
      ? `Built from one audience of about ${count(r.audience.primaryReach)}, ${count(
          r.segments.payingSupporters,
        )} paying supporters across one membership ladder${hasOneTime ? ', plus what non-members would pay for events' : ''}. ${
          hasOneTime
            ? `About ${recurringShare}% of that is recurring membership and the rest is one-off event and seat purchases.`
            : 'All of it is recurring membership, so nothing in your total depends on a one-off event.'
        } Nothing is counted twice.`
      : 'Add your audience numbers and we will model one coordinated system rather than a pile of separate ideas.';

  return {
    generatorVersion: UNIFIED_MODEL_VERSION,
    headline,
    summary,
    sections,
    heroValue: hero || undefined,
    heroSuffix: hero ? '/mo' : '',
    heroEyebrow: eyebrow,
    estimatedMonthlyCents: r.netNewMonthlyCents > 0 ? r.netNewMonthlyCents : undefined,
    estimatedAnnualCents: r.netNewMonthlyCents > 0 ? r.netNewAnnualCents : undefined,
    emailInsights: buildEmailInsights(r, low, high),
    conversionPayload: buildConversionPayload(r),
    shareSummary: `Turns out one coordinated setup could be worth about ${usd(r.netNewMonthlyCents)} a month to me, without counting the same fan twice.`,
  };
}

function placementLabel(p: UnifiedResult['recommendations'][number]['placement']): string {
  switch (p) {
    case 'build_now':
      return 'build this now';
    case 'add_next':
      return 'add next';
    case 'growth_engine':
      return 'use as a growth engine';
    case 'inside_membership':
      return 'include inside the membership';
    case 'sell_separately':
      return 'sell separately';
    default:
      return 'not yet';
  }
}

function buildEmailInsights(r: UnifiedResult, low: number, high: number): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  if (r.netNewMonthlyCents > 0) {
    out.push({
      title: 'The cost of waiting',
      body: `Every month you sit on this is about ${usd(r.netNewMonthlyCents)} you did not build. Six months is ${usd(
        r.netNewMonthlyCents * 6,
      )}, and a full year is ${usd(r.netNewAnnualCents)}. The range runs ${usd(low)} to ${usd(high)} depending on how hard your fans convert.`,
    });
  }
  const first = r.launchSequence[0];
  if (first) {
    out.push({
      title: 'Do this first, and only this',
      body: `${first.title}. ${first.detail} Everything else in your plan feeds this one thing, so building it in any other order costs you months.`,
    });
  }
  if (r.segments.dualPromoters >= 1) {
    out.push({
      title: 'Your promoters are fewer people than they look',
      body: `About ${count(r.segments.dualPromoters)} of your fans would both share and clip. Treat them as one group of ${count(
        r.segments.uniquePromoters,
      )} people with two jobs, not two separate campaigns, or you will pay twice to reach the same person.`,
    });
  }
  return out;
}

/** The structured payload the builder and the post-signup restoration read. Never display strings. */
function buildConversionPayload(r: UnifiedResult): Record<string, unknown> {
  return {
    system: 'unified-opportunity',
    calculationVersion: r.calculationVersion,
    assumptionsVersion: r.assumptionsVersion,
    netMonthlyCents: r.netMonthlyCents,
    netNewMonthlyCents: r.netNewMonthlyCents,
    recurringGrossCents: r.recurringGrossCents,
    oneTimeGrossCents: r.oneTimeGrossCents,
    payingSupporters: Math.floor(r.segments.payingSupporters),
    uniquePromoters: Math.floor(r.segments.uniquePromoters),
    vaultPlacement: r.inputs.vaultPlacement ?? 'tier',
    sessionStructure: r.inputs.sessionStructure,
    // Prices the model actually used, so the builder prefills a real number or nothing at all.
    sessionSeatPriceCents: r.incremental.find((i) => i.key === 'producer_sessions')?.unitPriceCents ?? 0,
    liveTicketPriceCents: r.incremental.find((i) => i.key === 'live_tickets')?.unitPriceCents ?? 0,
    // The artist's own answers, so the builder can re-run the model when their edits change the
    // structure. These are counts and choices the artist typed, never contact details or money the
    // artist did not enter themselves.
    modelInputs: r.inputs,
    // The ladder the builder pre-fills, in the SAME shape `worth` publishes it, so the existing
    // ladder decoder and the offer builder keep working with no special case.
    ladder: r.core.tiers.map((t) => ({
      name: t.name,
      priceCents: t.priceCents,
      projectedSubs: Math.floor(t.supporters),
    })),
    recommendations: r.recommendations.map((rec) => ({
      key: rec.key,
      label: rec.label,
      placement: rec.placement,
      role: rec.role,
    })),
    launchSequence: r.launchSequence.map((p) => ({ phase: p.phase, title: p.title, keys: p.keys })),
  };
}

/** Single-scenario access, for callers that need the raw model rather than the presented result. */
export function runUnified(raw: Record<string, unknown>): UnifiedResult {
  return calculateUnifiedOpportunity(toUnifiedInputs(raw), 'expected');
}
