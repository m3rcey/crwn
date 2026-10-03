// Is the project-credits offer working? Rules written down BEFORE any traffic (founder, 2026-10-03).
//
// The point of committing to these first is that nobody gets to decide what counts as good after
// seeing the numbers. Read by scripts/credits-scorecard.mjs. Pure, so the rules are tested.
//
// What each input means:
//   primaryViewers    distinct visitors who saw the $250 Founding offer
//   primaryCheckouts  distinct visitors who pressed buy on it (recorded server-side)
//   declines          distinct visitors who pressed "No thanks" on it
//   downsellViewers   distinct visitors shown the $150 Supporter offer after that
//   downsellCheckouts distinct visitors who pressed buy on the $150
//   foundingSold / supporterSold   standing credits (completed purchases, refunds excluded)
//
// Small numbers are evidence, not proof. Below MIN_VIEWERS the only honest answer is "not enough
// people have seen it", and missing data is never read as zero.

export const MIN_VIEWERS = 50;
/** Sales across both levels per Founding viewer at which the offer counts as working. */
export const WORKING_RATE = 0.02;
/** The $150 is "carrying" the offer when it outsells the $250 by this much, at least this often. */
export const DOWNSELL_CARRY_RATIO = 2;
export const DOWNSELL_CARRY_MIN = 3;

export interface CreditsFunnel {
  primaryViewers: number;
  primaryCheckouts: number;
  declines: number;
  downsellViewers: number;
  downsellCheckouts: number;
  foundingSold: number;
  foundingCap: number | null;
  supporterSold: number;
  supporterCap: number | null;
}

export type CreditsVerdictKey =
  | 'sold_out'
  | 'not_enough_traffic'
  | 'offer_not_landing'
  | 'checkout_friction'
  | 'downsell_carrying'
  | 'working'
  | 'weak';

export interface CreditsVerdict {
  key: CreditsVerdictKey;
  headline: string;
  next: string;
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : 'n/a');

export function creditsVerdict(f: CreditsFunnel): CreditsVerdict {
  const sold = f.foundingSold + f.supporterSold;

  if (f.foundingCap && f.foundingSold >= f.foundingCap) {
    return {
      key: 'sold_out',
      headline: `Founding sold out (${f.foundingSold} of ${f.foundingCap}).`,
      next: 'Demand beat supply. Raise the Founding price or cut the seats on the next project.',
    };
  }

  if (f.primaryViewers < MIN_VIEWERS) {
    return {
      key: 'not_enough_traffic',
      headline: `${f.primaryViewers} of the ${MIN_VIEWERS} viewers needed for a verdict${sold ? `, ${sold} sold so far` : ''}.`,
      next: 'This is a traffic question, not an offer question yet. Send people to the credits page.',
    };
  }

  if (sold === 0 && f.primaryCheckouts === 0 && f.downsellCheckouts === 0) {
    return {
      key: 'offer_not_landing',
      headline: `${f.primaryViewers} people saw it and nobody pressed buy.`,
      next: 'The offer is not landing. Change what it says or what it gives before sending more people.',
    };
  }

  if (sold === 0) {
    return {
      key: 'checkout_friction',
      headline: `${f.primaryCheckouts + f.downsellCheckouts} people pressed buy and nobody finished paying.`,
      next: 'People want it and stop at payment. Check sign-in and the Stripe page before touching the offer.',
    };
  }

  if (f.supporterSold >= DOWNSELL_CARRY_MIN && f.supporterSold >= DOWNSELL_CARRY_RATIO * Math.max(1, f.foundingSold)) {
    return {
      key: 'downsell_carrying',
      headline: `$150 is outselling $250 (${f.supporterSold} to ${f.foundingSold}).`,
      next: 'Fans want the credit but not the Founding extras at that price. Make the listening session worth the gap, or lower the gap.',
    };
  }

  const rate = sold / f.primaryViewers;
  if (rate >= WORKING_RATE) {
    return {
      key: 'working',
      headline: `${sold} sold to ${f.primaryViewers} viewers (${pct(sold, f.primaryViewers)}).`,
      next: 'Working. Keep sending traffic, and offer it again on the next project.',
    };
  }

  return {
    key: 'weak',
    headline: `${sold} sold to ${f.primaryViewers} viewers (${pct(sold, f.primaryViewers)}), under the ${pct(WORKING_RATE, 1)} bar.`,
    next: 'Selling, but not well enough to scale. Test a stronger reason to buy before sending more people.',
  };
}

/** The funnel as lines, in the order a fan moves through it. */
export function funnelLines(f: CreditsFunnel): string[] {
  return [
    `Saw the $250 Founding offer      ${f.primaryViewers}`,
    `Pressed buy on it                ${f.primaryCheckouts}  (${pct(f.primaryCheckouts, f.primaryViewers)})`,
    `Founding credits sold            ${f.foundingSold}${f.foundingCap ? ` of ${f.foundingCap}` : ''}`,
    `Said no thanks                   ${f.declines}  (${pct(f.declines, f.primaryViewers)})`,
    `Saw the $150 Supporter offer     ${f.downsellViewers}`,
    `Pressed buy on it                ${f.downsellCheckouts}  (${pct(f.downsellCheckouts, f.downsellViewers)})`,
    `Supporter credits sold           ${f.supporterSold}${f.supporterCap ? ` of ${f.supporterCap}` : ''}  (${pct(f.supporterSold, f.declines)} of decliners)`,
  ];
}
