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
      'Streaming and social built the reach, and they are good at that job. What they cannot do is tell you which of those listeners would pay you directly, how much, or for how long. The figure above is not a verdict on streaming. It is the size of the direct relationship sitting inside an audience you already built, and the reason it stays theoretical is that nothing in your stack can identify the people it belongs to.',
    connectsBody:
      'That group is not a separate audience to go and find. It is the paying end of the audience you already have, and once it is identified it becomes one membership ladder, one buyer record and one next move rather than a number on a page.',
  },

  // Unreleased catalog as a REASON for the most committed fans to identify themselves and climb,
  // not as idle inventory with a dollar sign attached.
  'vault-revenue-planner': {
    lens: 'What this reveals',
    revealsTitle: 'Your unreleased work is the reason a fan moves up a rung.',
    revealsBody:
      'The value of the catalog on your phone is not the files. It is that deeper access is the clearest reason a committed fan has to identify themselves, pay, and keep paying. Most of your audience will never want it. The ones who do are the ones already carrying most of your direct revenue, and right now you have nothing to hand them.',
    connectsBody:
      'A vault is not a second product with its own subscribers. In the recommended ladder it is what makes the middle rung worth its price, which is why the money it creates belongs inside your membership number rather than beside it.',
  },

  // Advocacy as ATTRIBUTABLE ACQUISITION into the same economy. Never a second revenue stack.
  'share-to-earn-planner': {
    lens: 'What this reveals',
    revealsTitle: 'Some of your fans are already doing acquisition for you.',
    revealsBody:
      'A small group of your fans put other people onto you, and that contribution is worth more than a play. Untracked and unrewarded, it never compounds and you can never tell which fans did it. The number above is what that advocacy would be worth if it were identifiable, attributable and paid.',
    connectsBody:
      'Sharing is how supporters ARRIVE, not a separate place they pay. Every referred fan joins the same ladder at the same prices, so the revenue is already counted once inside your membership number and is never added on top of it.',
  },

  // Premium PARTICIPATION and the high-value end of the economy. Not a seat-count revenue hack.
  'executive-producer-session': {
    lens: 'What this reveals',
    revealsTitle: 'The top of your fan economy is invisible until you offer it something.',
    revealsBody:
      'A small number of fans want access, participation and a real part in the work, and they will pay many times what a listener pays for it. That group does not show up in a follower count. It shows up only when there is something worth their money, which is why premium participation is less a ticket than a way for your highest-value fans to reveal themselves.',
    connectsBody:
      'Where the session sits decides what it earns. As a benefit it is what makes your top rung worth its price and it earns nothing separately. Sold as seats it earns on its own, from fans who are not members, and the model prices it for your audience size rather than assuming a room without limits.',
  },

  // The sibling of the Executive Producer doorway, deliberately the other half of one idea: EP
  // sells one seat in the room where the work is made, this sells the show itself. Re-promoted
  // 2026-08-16 because both are actively promoted in content.
  'live-experience-calculator': {
    lens: 'What this reveals',
    revealsTitle: 'A free stream is a show with no box office.',
    revealsBody:
      'Going live only to promote makes every stream free, unticketed and gone the second it ends, so the hour you spend performing earns nothing and leaves nothing behind. The figure above is what that same hour is worth when it is an event with a door price: your most committed fans will pay for real access, and they are a small part of your audience worth far more than the rest of it.',
    connectsBody:
      'Where the live sits decides what it earns. Tickets earn on their own from any fan, member or not, and the replay becomes membership material your paying rungs keep. The Executive Producer Session is the premium version of the same idea: fewer seats, in the room where the work happens, at many times the price.',
  },

  // Show-night proof carried into the OFF months. The VIP buyer is a proven direct spender, and
  // the membership they join is the same ladder, never a second business beside the tour.
  // Re-promoted 2026-08-20.
  'between-tour-calculator': {
    lens: 'What this reveals',
    revealsTitle: 'Tour revenue is a spike with a cliff, and the cliff is optional.',
    revealsBody:
      'The fans who buy VIP on a show night are proven direct spenders, and most artists offer them nothing until the next run. The figure above is not new fans and not more shows. It is the months your income currently drops toward zero, refilled by a recurring membership offered to buyers who already paid a premium for access once.',
    connectsBody:
      'A VIP membership is not a second business beside the tour. It is the same ladder your whole fan economy runs on, entered by the fans your shows already converted, so show-night proof becomes year-round recurring revenue counted once inside your membership number.',
  },

  // Demand proven BEFORE money is spent. The test chooses the next offer inside the one economy;
  // it is never a separate product line. Re-promoted 2026-08-20.
  'proof-of-demand-test-builder': {
    lens: 'What this reveals',
    revealsTitle: 'Demand is knowable before you spend a dollar on it.',
    revealsBody:
      'Most merch runs, shows and deluxe drops are funded on a guess, and the guess is the expensive part. Your committed fans will tell you what they want before you commit money to it, if you give them one specific way to say so: an RSVP, a vote, a place in line. The test above is that mechanism, with a threshold that turns interest into a go decision.',
    connectsBody:
      'A demand test is not a separate product. It is how the next offer inside your fan economy gets chosen: the fans who raise their hands are the same members and buyers every other number here models, so the ladder only ever adds a rung somebody already asked for.',
  },

  // Platform reach versus an IDENTIFIABLE, PERMISSIONED relationship. Never literal ownership.
  'own-your-fans-calculator': {
    lens: 'What this reveals',
    revealsTitle: 'Reach is not the same as a relationship you control.',
    revealsBody:
      'Your followers are real and they matter. What you do not have is the relationship underneath them: a name, permission to make contact, a record of what they bought, and a way to reach them that no algorithm sits in front of. You cannot own a person. You can own the relationship, the data and the contact permission, and today almost none of that is yours.',
    connectsBody:
      'A contact you can reach is where the whole system starts. It is the difference between an audience you rent and a buyer record you can build an offer on, invite first, and measure against what you actually earned.',
  },

  // The complete diagnosis. The only tool that models every opportunity at once.
  'opportunity-calculator': {
    lens: 'What this reveals',
    revealsTitle: 'One audience, one paying group, one system to operate it.',
    revealsBody:
      'This is the whole picture rather than one slice of it: the audience you built, the part of it you can actually reach, the smaller group inside that who ever pay, and how unevenly the money sits among them. The split above is your own, computed from your own answers, which is why the smallest rung usually carries the most revenue.',
    connectsBody:
      'Every opportunity here is modeled against the SAME fans and the same dollars, so nothing is counted twice: sharing and clipping move the supporter count rather than adding a revenue line, the vault is a rung rather than a second membership, and events sell only to fans who are not already members.',
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
