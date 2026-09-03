// freeJoinStarter.ts: the deterministic starter follow-up for fans who join free and do not buy.
//
// PURE, no model. Five messages built from facts the artist already gave CRWN (the gift, the
// paid tier's name and price, its first supported benefit), using only the tokens the sequence
// cron already resolves ({{first_name}}, {{artist_name}}). The artist reviews and personalizes
// every message before it is switched on; CRWN never emails their fans without that approval.
//
// The shape, ratified in the Rise Mode Guided Setup plan: reinforce the gift, say what the paid
// experience is, show one tangible thing, answer the common objection, return to the offer.
// Days 0, 2, 5, 9, 14. No cadence promises, no fabricated proof, no em dashes.

export interface FreeJoinFacts {
  magnetTitle: string;
  tierName: string;
  /** Integer cents. */
  priceCents: number;
  /** The first supported benefit's fan-facing label, if any. */
  firstBenefit: string | null;
  /** The second one, if any. */
  secondBenefit: string | null;
  /** The artist's public page, e.g. https://thecrwn.app/gb. */
  pageUrl: string;
}

export interface StarterStep {
  delay_days: number;
  subject: string;
  body: string;
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

export const FREE_JOIN_STARTER_NAME = 'Free members who have not bought yet';

export function buildFreeJoinStarter(f: FreeJoinFacts): StarterStep[] {
  const gift = f.magnetTitle.trim() || 'the drop';
  const tier = f.tierName.trim() || 'the membership';
  const price = money(Math.max(0, Math.round(f.priceCents)));
  const one = f.firstBenefit?.trim() || 'music only members get';
  const two = f.secondBenefit?.trim() || null;
  const inside = two ? `${one.toLowerCase()} and ${two.toLowerCase()}` : one.toLowerCase();

  return [
    {
      delay_days: 0,
      subject: `${gift} is yours`,
      body: `Hey {{first_name}},\n\nThank you for grabbing ${gift}. It is yours to keep, and you are on my list now, which means you hear about things before anyone else.\n\nIf you have thirty seconds, reply and tell me what you think of it. I read every one.\n\n{{artist_name}}`,
    },
    {
      delay_days: 2,
      subject: `What ${tier} actually is`,
      body: `Hey {{first_name}},\n\n${gift} was the door. Behind it is ${tier}: ${inside}.\n\nIt is ${price} a month, you can cancel any time, and everything opens the moment you join.\n\nHave a look: ${f.pageUrl}\n\n{{artist_name}}`,
    },
    {
      delay_days: 5,
      subject: `One thing inside ${tier}`,
      body: `Hey {{first_name}},\n\nInstead of listing everything, here is one thing: ${one}.\n\nThat is what members get that nobody else does. If that is the kind of closer you want to be, the door is open: ${f.pageUrl}\n\n{{artist_name}}`,
    },
    {
      delay_days: 9,
      subject: `The question I get most`,
      body: `Hey {{first_name}},\n\n"What if I join and it is not for me?" Then you cancel, from your own account, and you keep access until the end of the month you paid for. No emails to send, no one to convince.\n\nThat is the whole risk. ${tier} is ${price} a month: ${f.pageUrl}\n\n{{artist_name}}`,
    },
    {
      delay_days: 14,
      subject: `Still here when you are ready`,
      body: `Hey {{first_name}},\n\nLast one from me on this for now. You have ${gift}; ${tier} is where the rest lives, for ${price} a month, cancel any time.\n\nIf now is not the time, that is fine. You stay on my list either way, and you will hear about the next drop first.\n\n${f.pageUrl}\n\n{{artist_name}}`,
    },
  ];
}
