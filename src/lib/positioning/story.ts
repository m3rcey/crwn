// The canonical CRWN story, in one place.
//
// The homepage told this story from 2026-08-13. The six promoted calculators did not: each one
// still argued its own era, under a generic showcase that advertised surfaces the pre-PMF product
// reduction had already hidden. Six acquisition doors were describing six different companies.
//
// This module is the fix, and the reason it is a module rather than copied copy: the SHARED layer
// owns the canonical truth (the path to first revenue, the operating loop, the First Revenue
// Launch offer and its guarantee), and each surface owns only its own doorway
// (`src/lib/leadMagnets/positioning.ts`). `HomeMarketing` and `ToolMarketing` both read from here,
// so a change to the story reaches every acquisition surface at once and no page can silently
// drift back to an older era.
//
// Claim discipline: every line here is on the allowed-today list in docs/POSITIONING.md section 23.
// No network-effect claim, no cross-artist intelligence, no income guarantee, no benchmark. The
// guarantee wording is the offer's own (docs/crwn-brain/20-FIRST-REVENUE-LAUNCH-OFFER.md) and
// covers a rebuild and relaunch, never an income result.

/** The five steps from a built audience to a business the artist operates. */
export const PATH_STEPS: { name: string; body: string }[] = [
  {
    name: 'Consolidate',
    body: 'Bring your fan relationships, buyer lists, catalog and offers into one operating system, so the people who already paid you stop living in six disconnected lists.',
  },
  {
    name: 'Build',
    body: 'Stand up the recurring offer your fans are most likely to buy: a free front door and a paid ladder your most committed fans can climb.',
  },
  {
    name: 'Convert',
    body: 'Start with your previous buyers, existing members and VIPs, before any public promotion. The warmest fans come first, on purpose.',
  },
  {
    name: 'Prove',
    body: 'Your first paid CRWN member. That is the bar. Not a published page, not a connected account: a real person paying you on a system you run.',
  },
  {
    name: 'Expand',
    body: 'Once the first offer is proven, widen it: the next tier, the next campaign, the next segment of your audience.',
  },
];

/** The operating loop in customer language (POSITIONING.md section 8, compressed form). */
export const LOOP = ['See it.', 'Find the block.', 'One move.', 'Deliver it.', 'Know if it worked.'];

/** What the assisted layer actually is. Premium, optional, and never a gate on the free path. */
export const FRL_BODY =
  'For qualified artists, CRWN works alongside you to consolidate your existing direct-to-fan operation, build the recurring offer best suited to your fans, bring your warmest buyers in first, and launch. What you get is not software access or setup help. It is a consolidated, launched direct-to-fan operation with real paying members.';

/** The guarantee, verbatim from the offer. A rebuild and relaunch, never an income result. */
export const GUARANTEE_TITLE = 'The First Paid Member Guarantee';
export const GUARANTEE_BODY =
  'Qualified artists who complete the documented required actions acquire at least one paid member within 30 days, or CRWN rebuilds and relaunches the offer at no additional service charge. It covers the rebuild and relaunch, not a specific income result. Both sides see the same live checklist, so the guarantee runs on evidence, not self-reporting.';

/** Why the assisted path is capacity-limited, and the standing promise that self-serve stays open. */
export const FRL_CAPACITY_NOTE =
  'Launches are capacity-limited because the work is real: each one includes a hands-on audit, migration and launch campaign with the founder. The self-serve product stays open to everyone either way.';

/**
 * What every promoted calculator resolves into, whichever door the artist came through. This is
 * the sentence that stops six calculators reading as six businesses: one fan, one record, one
 * system, one move.
 */
export const ONE_SYSTEM = [
  'One fan relationship',
  'One economic record',
  'One coordinated offer',
  'One next move',
];
