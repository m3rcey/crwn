// The six promoted calculators, as six doors into ONE story.
//
// `src/lib/positioning/story.ts` owns the canonical CRWN argument. This file owns the part that
// must stay different: what each calculator actually reveals, and how that one finding connects to
// the rest of the artist's fan economy. Six identical pages would waste six distinct hooks; six
// unrelated pages is the condition this pass exists to end.
//
// The doorway keys are the PROMOTED tool keys, derived from `PROMOTED_TOOL_KEYS` rather than
// retyped, so promoting or pausing a tool cannot leave a page without a story or a story without a
// page (`positioning.test.ts` asserts both directions).
//
// Copy rules that apply to every string in this file (docs/POSITIONING.md sections 23 and 24):
//   - Reach is never dismissed. The artist built it, and every number in every model scales with it.
//   - Streaming is the discovery job this product depends on, never the villain.
//   - No literal ownership of people. Artists own the RELATIONSHIP, the DATA and the PERMISSION.
//   - Acquisition mechanisms (sharing, clipping) move the supporter count. They are never a second
//     revenue business, because the money they produce is already inside the membership number.
//   - No benchmark, no cross-artist claim, no income guarantee, no passive income, no em dashes.

import { PROMOTED_TOOL_KEYS } from '@/lib/opportunityFunnels/registry';

export interface ToolDoorway {
  /** Section 4 eyebrow: the lens this calculator looked through. */
  lens: string;
  /** Section 4 heading: what the number the artist just saw actually means. */
  revealsTitle: string;
  /** Section 4 body: the specific block, in the artist's economic terms. */
  revealsBody: string;
  /**
   * Section 5 body: how this ONE opportunity resolves into the coordinated system. Every entry
   * must make the same point in its own words, that the finding is one lens on one fan economy
   * rather than a standalone revenue line.
   */
  connectsBody: string;
}

export const TOOL_DOORWAYS: Record<string, ToolDoorway> = {
  // The gap between REACH and DIRECT ECONOMIC DEPTH. Streaming did its job; it simply cannot
  // tell the artist which listeners carry the direct value, or give them anywhere to operate it.
  worth: {
    lens: 'What this reveals',
    revealsTitle: 'Reach and direct fan value are two different numbers.',
    revealsBody:
      'Streaming and social built your reach, and they are good at that job. What they cannot tell you is which of those listeners would pay you directly, how much, or for how long. That is why the figure above stays theoretical: nothing in your stack can name the people it belongs to.',
    connectsBody:
      'They are not a separate audience to go and find. They are the paying end of the one you already have, and until they are identified they stay a number on a page instead of a ladder, a buyer record and a next move.',
  },

  // Unreleased catalog as a REASON for the most committed fans to identify themselves and climb,
  // not as idle inventory with a dollar sign attached.
  'vault-revenue-planner': {
    lens: 'What this reveals',
    revealsTitle: 'Your unreleased work is the reason a fan moves up a rung.',
    revealsBody:
      'The catalog on your phone is not worth the files. It is worth deeper access: the clearest reason a committed fan has to pay and keep paying. Most of your audience will never want it. The ones who do already carry most of your direct revenue, and today you have nothing to hand them.',
    connectsBody:
      'A vault is not a second product with its own members. It is what makes the middle rung worth its price, so the money it creates sits inside your membership number, never beside it.',
  },

  // Advocacy as ATTRIBUTABLE ACQUISITION into the same economy. Never a second revenue stack.
  'share-to-earn-planner': {
    lens: 'What this reveals',
    revealsTitle: 'Some of your fans are already doing acquisition for you.',
    revealsBody:
      'A small group of your fans put other people onto you, and that is worth more than a play. Untracked, it never compounds and you never learn who did it. The number above is what that advocacy is worth once it is identifiable, attributable and paid.',
    connectsBody:
      'Sharing is how supporters ARRIVE, not a separate place they pay. Referred fans join the same ladder at the same prices, so that revenue is counted once inside your membership number, never added on top.',
  },

  // Premium PARTICIPATION and the high-value end of the economy. Not a seat-count revenue hack.
  'executive-producer-session': {
    lens: 'What this reveals',
    revealsTitle: 'The top of your fan economy is invisible until you offer it something.',
    revealsBody:
      'A small number of fans want access, participation and a real part in the work, and they will pay many times what a listener pays. That group never shows up in a follower count. It shows up only when there is something worth their money, and today you are offering them nothing.',
    connectsBody:
      'Where the session sits decides what it earns. As a benefit it makes your top rung worth its price and earns nothing separately. Sold as seats it earns on its own, from fans who are not members, priced for your audience size rather than a room without limits.',
  },

  // The sibling of the Executive Producer doorway, deliberately the other half of one idea: EP
  // sells one seat in the room where the work is made, this sells the show itself. Re-promoted
  // 2026-08-16 because both are actively promoted in content.
  'live-experience-calculator': {
    lens: 'What this reveals',
    revealsTitle: 'A free stream is a show with no box office.',
    revealsBody:
      'A promo stream is free, unticketed and gone the second it ends, so the hour you perform earns nothing and leaves nothing behind. The figure above is that same hour with a door price on it. Your most committed fans pay for real access, and that small group is worth far more than the rest.',
    connectsBody:
      'Where the live sits decides what it earns. Tickets earn on their own from any fan, member or not, and the replay becomes material your paying rungs keep. The Executive Producer Session is the premium version: fewer seats, in the room where the work happens, at many times the price.',
  },

  // Show-night proof carried into the OFF months. The VIP buyer is a proven direct spender, and
  // the membership they join is the same ladder, never a second business beside the tour.
  // Re-promoted 2026-08-20.
  'between-tour-calculator': {
    lens: 'What this reveals',
    revealsTitle: 'Tour revenue is a spike with a cliff, and the cliff is optional.',
    revealsBody:
      'Fans who buy VIP on a show night are proven direct spenders, and most artists offer them nothing until the next run. The figure above is not new fans or more shows. It is the months your income drops toward zero, refilled by a membership sold to buyers who already paid a premium once.',
    connectsBody:
      'A VIP membership is not a second business beside the tour. It is the same ladder, entered by the fans your shows already converted, so show-night proof becomes year-round revenue counted once inside your membership number.',
  },

  // Demand proven BEFORE money is spent. The test chooses the next offer inside the one economy;
  // it is never a separate product line. Re-promoted 2026-08-20.
  'proof-of-demand-test-builder': {
    lens: 'What this reveals',
    revealsTitle: 'Demand is knowable before you spend a dollar on it.',
    revealsBody:
      'Most merch runs, shows and deluxe drops are funded on a guess, and the guess is the expensive part. Your fans will tell you what they want first, if you give them one way to say so: an RSVP, a vote, a place in line. The test above adds the threshold that turns interest into a go decision.',
    connectsBody:
      'A demand test is not a separate product. It is how the next offer gets chosen: the fans who raise their hands are the same members and buyers every other number here models, so the ladder only adds a rung somebody asked for.',
  },

  // Platform reach versus an IDENTIFIABLE, PERMISSIONED relationship. Never literal ownership.
  'own-your-fans-calculator': {
    lens: 'What this reveals',
    revealsTitle: 'Reach is not the same as a relationship you control.',
    revealsBody:
      'Your followers matter. What you do not have is the relationship underneath them: a name, permission to make contact, a record of what they bought, a way to reach them with no algorithm in between. You cannot own a person. With the CRWN app you can own every one of those things, but today almost none of them are yours.',
    connectsBody:
      'With the CRWN app a contact you can reach is where the whole system starts: the difference between an audience you rent and a buyer record you can build an offer on, invite first, and measure what you earned against.',
  },

  // The complete diagnosis. The only tool that models every opportunity at once.
  'opportunity-calculator': {
    lens: 'What this reveals',
    revealsTitle: 'One audience, one paying group, one system to operate it.',
    revealsBody:
      'This is the whole picture, not one slice: the audience you built, the part you can actually reach, the smaller group inside it who ever pay, and how unevenly the money sits among them. The split above is computed from your own answers, which is why the smallest rung usually carries the most revenue.',
    connectsBody:
      'Every opportunity here is modeled against the SAME fans and the same dollars, so nothing is counted twice: sharing moves the supporter count rather than adding a revenue line, the vault is a rung and not a second membership, and events sell only to fans who are not members.',
  },
};

/** The promoted set, derived so it can never drift from the funnel registry. */
export const PROMOTED_MARKETING_SLUGS: readonly string[] = Object.freeze([...PROMOTED_TOOL_KEYS].sort());

/** Does this tool own a Zero to One doorway, and therefore its own lower page? */
export function hasDoorway(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_DOORWAYS, slug);
}

export function getDoorway(slug: string): ToolDoorway | null {
  return TOOL_DOORWAYS[slug] ?? null;
}
