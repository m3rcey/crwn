// The one MANUAL quest in the first-revenue chain (founder decision D5, 2026-09-03).
//
// CRWN verifies every piece of the funnel it can observe (src/lib/funnelReadiness.ts). Two
// observations only the artist can make without CRWN creating fake fans, fake claims or fake
// revenue: opening their own drop link on a phone and claiming it with an address that is not
// their account, and starting checkout and stopping at the Stripe page. The Test flow records
// those two acknowledgements by completing this quest through /api/quests/complete, which
// refuses every non-manual template.
//
// The acknowledgement never substitutes for state: the roadmap's `funnel_tested` fact ANDs it
// with the machine checks, so a funnel that breaks later reopens "Test it" while the quest, like
// every quest, stays completed (founder decision D3).
export const FUNNEL_TEST_QUEST_KEY = 'artist_funnel_tested';

export const FUNNEL_TEST_MANUAL_CHECKS = [
  {
    key: 'claim_on_phone',
    label: 'Open your link on your phone and claim it with an email that is not your account',
    why: 'CRWN skips the free membership and the lead when the owner claims, so use a second address to see what a fan sees.',
  },
  {
    key: 'reach_checkout',
    label: 'Tap the paid offer and stop at the Stripe checkout page',
    why: 'Only a real card can finish it. Reaching the page proves the price, the tier and Stripe all line up.',
  },
] as const;
