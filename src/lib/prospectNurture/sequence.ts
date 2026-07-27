// The universal core prospect-nurture sequence, version 1.
//
// One sequence serves every calculator. The calculator-specific parts are injected by the
// `moduleQuickWin` / `moduleUseCase` blocks and by the {{feature_name}} / {{hero_value}} tokens, so
// a new calculator is nurtured correctly the moment it is added to the registry, with zero new copy.
//
// Copy rules (enforced, not aspirational):
//   - Lead with the LOSS (what the artist loses by not acting), never the gain.
//   - No em dashes anywhere. Use "the CRWN app", never bare "CRWN", in user-facing lines.
//   - No fake scarcity, no fake countdowns, no fabricated proof, no guaranteed-income claims.
//   - Every dollar figure is the lead's OWN calculator output, labeled an estimate. Never invented.
//   - Teach more than you pitch. Most emails are one idea and one action.
//
// Cadence slows as the lead gets colder: days 1, 3, 5, 8, 11, 14, then 18, 24, 30, 36, 42.
// Phases 4-9 (objections, mechanism, proof, re-engagement, authority, evergreen) are appended here
// later as more emails with larger dayOffsets; the runner needs no change.

import type { NurtureSequence } from './types';

export const PROSPECT_NURTURE_VERSION = 1;

export const PROSPECT_NURTURE_SEQUENCE: NurtureSequence = {
  version: PROSPECT_NURTURE_VERSION,
  emails: [
    // ─── Phase 1: delivery + immediate momentum (days 0-3) ───────────────────────────────────────
    // Day 0 is the transactional result email sent by the capture route. This continues it.
    {
      id: 'core.p1.recap',
      phase: 'delivery',
      dayOffset: 1,
      objective: 'Restate the revealed opportunity in plain language and make the assumptions clear.',
      subject: 'What your {{tool_name}} result actually means',
      preview: 'A plain-language read of the number you got, and where it comes from.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Yesterday you ran the {{tool_name}}. Here is what it was telling you, without the jargon.' },
        {
          kind: 'numberOrFallback',
          withNumber:
            'Your result pointed at about {{monthly_value}} that is sitting just out of reach right now. That is an estimate based on the numbers you entered, not a promise. But it is not a random number either. It is what the fans you already have would be worth if there were a way for them to pay you directly.',
          withoutNumber:
            'Your result pointed at a specific gap between what you have and what you are collecting from it right now. It is based on what you told the calculator, not a promise. But it is not guesswork either. It is the money and the fans that are already yours, just not organized yet.',
        },
        { kind: 'p', text: 'The reason it feels out of reach is simple: there is nowhere for that value to land yet. That is the whole problem, and it is a fixable one.' },
        { kind: 'p', text: 'Open your full result and read the assumptions section. If a number looks off, it is usually one input. You can change it and see the figure move.' },
      ],
      primaryCta: { kind: 'result', label: 'Reopen my full result' },
    },
    {
      id: 'core.p1.action',
      phase: 'delivery',
      dayOffset: 3,
      objective: 'Give one immediate action and connect the revealed loss to the CRWN feature that closes it.',
      subject: 'One thing you can do this week',
      preview: 'Not the whole plan. Just the first move.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'The gap your result showed does not close by thinking about it harder. It closes with one small build. Here is the smallest useful version of it.' },
        { kind: 'moduleQuickWin' },
        { kind: 'p', text: 'That is it for this week. One move. The {{feature_name}} inside the CRWN app is where it lives, and setting up the first version takes minutes, not a weekend.' },
        { kind: 'p', text: 'When you are ready, the fastest way to keep your result and start building on it is a free account. Nothing you calculated gets lost.' },
      ],
      primaryCta: { kind: 'signup' },
    },

    // ─── Phase 2: problem awareness + belief building (days 4-14) ─────────────────────────────────
    {
      id: 'core.p2.why',
      phase: 'belief',
      dayOffset: 5,
      objective: 'Explain why the problem persists: rented attention vs owned relationships.',
      subject: 'Why this keeps happening',
      preview: 'It is not a hustle problem. It is a plumbing problem.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'The reason the opportunity in your result has stayed open is not that you are not working hard enough. It is that almost everything you build sits on rented land.' },
        { kind: 'p', text: 'A streaming platform rents you plays. A social app rents you reach. The second their rules change, the audience you thought you had is gone, and you never had their contact anyway. You are paying rent and building nobody a home you own.' },
        { kind: 'p', text: 'An owned relationship is the opposite. A fan who can pay you directly, whose email or subscription is yours, does not disappear when an algorithm shifts. That is the difference the number in your result is really about.' },
        { kind: 'callout', text: 'Rented attention is why the money stays out of reach. Owned relationships are how it comes back.' },
        { kind: 'p', text: 'Your full result is still saved. Give it another read with this in mind.' },
      ],
      primaryCta: { kind: 'result', label: 'Reopen my result' },
    },
    {
      id: 'core.p2.small-or-large',
      phase: 'belief',
      dayOffset: 8,
      objective: 'Show it works at both small and large audience size; raise perceived likelihood of success.',
      subject: 'This works whether you have 200 fans or 200,000',
      preview: 'Small audiences convert. Big audiences leak. The fix is the same.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'A quick worry to put down, because it stops more artists than anything else: "my audience is too small for this."' },
        { kind: 'p', text: 'A small, real audience usually converts better than a big, passive one. Two hundred people who actually care will out-earn twenty thousand who scrolled past you once. The whole point is that a handful of true supporters is enough to matter.' },
        { kind: 'p', text: 'And if your audience is large, the number in your result is mostly leakage: reach you already have that turns into nothing because there is no way for it to pay you. Same fix, bigger gap.' },
        { kind: 'moduleUseCase' },
        { kind: 'p', text: 'Either way, the size of your audience is not the thing standing between you and the number. The missing structure is.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p2.recalc',
      phase: 'belief',
      dayOffset: 11,
      objective: 'Reference the actual result again and invite them to revise inputs; reduce uncertainty.',
      subject: 'Run it again with real numbers',
      preview: 'If the estimate felt high or low, the inputs are yours to change.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'By now you have had time to sit with your result. Maybe the number felt big. Maybe it felt low. Either way, you can check it.' },
        { kind: 'p', text: 'Open the result and change the inputs to whatever you know is true today: your real audience, your real catalog, the price you would actually charge. The figure updates. It was never meant to be taken on faith. It is math you can audit.' },
        {
          kind: 'numberOrFallback',
          withNumber: 'When you tune it to your real numbers, {{monthly_value}} usually gets more believable, not less. The version most artists run first is conservative.',
          withoutNumber: 'When you tune it to your real situation, the gaps it found usually get clearer, not fuzzier.',
        },
        { kind: 'p', text: 'That is the honest version of "trust the process": do not trust it, check it.' },
      ],
      primaryCta: { kind: 'result', label: 'Change my inputs and re-run' },
    },
    {
      id: 'core.p2.misconception',
      phase: 'belief',
      dayOffset: 14,
      objective: 'Correct the belief that you need a label, a huge catalog, a budget, or a big following.',
      subject: 'You do not need a label to start this',
      preview: 'The list of things you actually need is shorter than you think.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Here is the list of things you need to close the gap in your result: a way for fans to pay you, and something worth paying for. That is the list.' },
        { kind: 'p', text: 'Not a label. Not a distribution deal. Not a hundred unreleased songs. Not a marketing budget. Those are the things artists tell themselves they need first, and they are exactly the things that keep the opportunity open for years.' },
        { kind: 'list', items: [
          'A label takes a cut to do what you can now do directly.',
          'A giant catalog is not required. One offer fans want is enough to start.',
          'A budget is not the gate. The gate is that there is no place for fans to pay you yet.',
        ] },
        { kind: 'p', text: 'The {{feature_name}} in the CRWN app is built for exactly the artist who has none of those things yet and is done waiting to earn from the fans they already have.' },
      ],
      primaryCta: { kind: 'signup' },
    },

    // ─── Phase 3: practical education + quick wins (weeks 3-6) ────────────────────────────────────
    {
      id: 'core.p3.first-step',
      phase: 'education',
      dayOffset: 18,
      objective: 'Break the solution into the smallest first build; reduce perceived time and complexity.',
      subject: 'The first thing to build (it is small)',
      preview: 'Not the whole thing. The first brick.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'People stall because they picture the finished thing: the full membership, the whole store, the perfect launch. You do not build that. You build the first brick, and the first brick is small.' },
        { kind: 'moduleQuickWin' },
        { kind: 'p', text: 'That takes an evening, not a quarter. Once it exists, the next step is obvious, because you can see it. The plan stops being abstract the moment one real thing is live.' },
        { kind: 'p', text: 'A free account in the CRWN app is where that first brick gets saved and turned on. Your result comes with you.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p3.template',
      phase: 'education',
      dayOffset: 24,
      objective: 'Give a concrete mini-plan/checklist; reduce sacrifice and effort perception.',
      subject: 'A 3-step version you can copy',
      preview: 'The whole thing on one screen.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Here is the entire plan for the opportunity your result found, on one screen. No fluff.' },
        { kind: 'list', items: [
          'Set it up: build the first version of your {{feature_name}} in the CRWN app. Minutes, not days.',
          'Tell your fans once: one clear message with one link and one reason to act now.',
          'Watch what they do: the fans who respond are your first real supporters. Build the next thing for them.',
        ] },
        { kind: 'moduleUseCase' },
        { kind: 'p', text: 'That is the loop. It is not complicated. It just has to actually exist, and right now it does not, which is what the number in your result was measuring.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p3.rise',
      phase: 'education',
      dayOffset: 30,
      objective: 'Point to the recommended first Rise Mode action; framing account creation as saving the plan.',
      subject: 'The exact first move, in order',
      preview: 'You do not have to figure out the sequence. It is built.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'One reason opportunities like the one in your result stay open is order. Most artists do the right things in the wrong sequence: a store before an audience, followers before anything to convert them into.' },
        { kind: 'p', text: 'Inside the CRWN app, Rise Mode lays the order out for you and starts you on the exact first action for your result. You are not staring at a blank dashboard deciding what matters. The first move is already picked, and it is the one that closes your gap fastest.' },
        { kind: 'p', text: 'Create a free account and your calculated result becomes the first mission waiting for you. Nothing to re-enter.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p3.proof-vs-guess',
      phase: 'education',
      dayOffset: 36,
      objective: 'A practical quick win: prove demand before spending; a real, low-effort action.',
      subject: 'Stop guessing what your fans will pay for',
      preview: 'Let them tell you before you spend a dollar building it.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'The most expensive mistake around any new offer is building it first and hoping. You find out nobody wanted it after you have already paid for it in time or money.' },
        { kind: 'p', text: 'There is a cheaper order. Put the smallest version in front of your fans first, and let the ones who want it raise their hand. Then you build for people you already know are there. That is the difference between a launch that lands and one that echoes.' },
        { kind: 'moduleUseCase' },
        { kind: 'p', text: 'Everything you need to test it that way is in the CRWN app, free to start.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p3.recap-invite',
      phase: 'education',
      dayOffset: 42,
      objective: 'Reintroduce the original result and give a clear, low-pressure invite to act.',
      subject: 'Your result is still saved',
      preview: 'Six weeks in. The number has not moved on its own.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'It has been about six weeks since you ran the {{tool_name}}. Your result is still saved, and here is the uncomfortable part: the number in it has not moved on its own, because nothing has changed yet.' },
        {
          kind: 'numberOrFallback',
          withNumber: 'That {{monthly_value}} is not a one-time figure. It is roughly what stays out of reach every month there is no structure to catch it. Six weeks is six of those months added up.',
          withoutNumber: 'The gaps it found are not one-time. They stay open every month there is nothing set up to close them. Six weeks is six of those months.',
        },
        { kind: 'p', text: 'You do not have to build the whole thing today. You have to build the first brick, and keep your result while you do it. A free account does both.' },
        { kind: 'p', text: 'If the timing is genuinely wrong, that is fair. These emails will slow down on their own from here.' },
      ],
      primaryCta: { kind: 'signup' },
    },
  ],
};

// The next email at or after a given step index. Pure; the runner uses it to schedule.
export function nextEmailAfter(stepIndex: number): { email: NurtureSequence['emails'][number]; index: number } | null {
  const emails = PROSPECT_NURTURE_SEQUENCE.emails;
  const idx = stepIndex; // current_step is 0-based count of emails already sent
  if (idx >= emails.length) return null;
  return { email: emails[idx], index: idx };
}
