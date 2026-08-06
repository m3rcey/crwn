// The universal core prospect-nurture sequence, version 2 (retuned to docs/ICP.md, 2026-07-28).
//
// One sequence serves every calculator. The calculator-specific parts are injected by the
// `moduleQuickWin` / `moduleUseCase` blocks and by the {{feature_name}} / {{hero_value}} tokens, so
// a new calculator is nurtured correctly the moment it is added to the registry, with zero new copy.
//
// WHO THIS IS FOR (docs/ICP.md). Not the beginner with no audience. The artist who has ALREADY
// proven fans will pay them directly, but whose monetization is scattered across Patreon, Shopify,
// Discord, Linktree, Gumroad, Eventbrite, email/SMS tools and YouTube Memberships. So:
//   - The pitch is CONSOLIDATION, not "streaming pays pennies". They already know that.
//   - Never tell them their audience is too small, that fans might not pay, or that they need a
//     catalog/label/budget. They are past all of it. That framing tells them they are in the
//     wrong room.
//   - The loss is FRAGMENTATION: stacked fees, fan lists that never talk, and offers that cannot
//     compound because every piece lives in a different tool.
//
// Copy rules (enforced, not aspirational):
//   - Lead with the LOSS (what the artist loses by not acting), never the gain.
//   - No em dashes anywhere. Use "the CRWN app", never bare "CRWN", in user-facing lines.
//   - No fake scarcity, no fake countdowns, no fabricated proof, no guaranteed-income claims.
//   - Every dollar figure is the lead's OWN calculator output, labeled an estimate. Never invented.
//   - Teach more than you pitch. Most emails are one idea and one action.
//
// Cadence slows as the lead cools: days 1, 3, 5, 8, 11, 14, 18, 24, 30, 36, 42 (P1-3), then
// 56, 63, 70, 77, 84 (P4 objections), 100, 120 (P5), 150, 180 (P6), 220, 260 (P7), 300, 340, 365
// (P8). 25 nurture emails + the day-0 transactional result email = 26 touches across ~12 months.
// P9 evergreen (monthly, post-365) is a deliberate follow-up. The runner needs no change to extend.
//
// current_step is an INDEX into this array, so the first 11 ids/order/dayOffsets are kept stable
// across the v1->v2 retune; only their copy changed. Everything after is appended.

import type { NurtureSequence } from './types';

export const PROSPECT_NURTURE_VERSION = 2;

export const PROSPECT_NURTURE_SEQUENCE: NurtureSequence = {
  version: PROSPECT_NURTURE_VERSION,
  emails: [
    // ─── Phase 1: delivery + immediate momentum (days 0-3) ───────────────────────────────────────
    // Day 0 is the transactional result email sent by the capture route. This continues it.
    {
      id: 'core.p1.recap',
      phase: 'delivery',
      dayOffset: 1,
      objective: 'Restate the revealed opportunity in plain language and frame it as scattered value, not missing sales skill.',
      subject: 'What your {{tool_name}} result actually means',
      preview: 'A plain-language read of the number you got, and where it comes from.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Yesterday you ran the {{tool_name}}. Here is what it was telling you, without the jargon.' },
        {
          kind: 'numberOrFallback',
          withNumber:
            'Your result pointed at about {{monthly_value}} that your current setup is not capturing. That is an estimate from the numbers you entered, not a promise. It is not money you need new fans for, and it is not money you need to learn how to sell. It is value the fans you already have would move, if the offer, the checkout and the fan list were not spread across different tools.',
          withoutNumber:
            'Your result pointed at a specific gap between what you already have and what you are actually capturing from it. It is based on what you told the calculator, not a promise. It is not that you cannot sell. It is that the pieces are scattered, so the value slips between them.',
        },
        { kind: 'p', text: 'The reason it stays open is not effort and not talent. It is that the fan, the sale, the data and the next offer all live in different places right now, and value leaks in the gaps between them.' },
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
        { kind: 'p', text: 'The gap your result showed does not close by thinking about it harder. It closes with one small move, in one place. Here is the smallest useful version of it.' },
        { kind: 'moduleQuickWin' },
        { kind: 'p', text: 'That is it for this week. One move. The {{feature_name}} inside the CRWN app is where it lives, and setting up the first version takes minutes, not a migration weekend.' },
        { kind: 'p', text: 'When you are ready, the fastest way to keep your result and start building on it is a free account. Nothing you calculated gets lost.' },
      ],
      primaryCta: { kind: 'signup' },
    },

    // ─── Phase 2: problem awareness + belief building (days 4-14) ─────────────────────────────────
    {
      id: 'core.p2.why',
      phase: 'belief',
      dayOffset: 5,
      objective: 'Explain why the problem persists: scattered monetization on rented land leaks value.',
      subject: 'Why this keeps happening',
      preview: 'It is not a hustle problem. It is a plumbing problem.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'The opportunity in your result has stayed open for one reason, and it is not that you have not monetized. You clearly have. It is that your monetization is scattered, and scattered leaks.' },
        { kind: 'p', text: 'A page here, a store there, a chat community somewhere else, an email list in a fourth tool. Each one takes a cut, and none of them talk to each other. A fan who buys in one place is a stranger in the next. The offer you could run tomorrow does not exist, because the pieces it needs live in four different logins.' },
        { kind: 'p', text: 'On top of that, most of it sits on rented land. When a platform changes its rules, the audience you thought you had is gone, and you never owned their contact. Owned relationships in one place are the opposite: the fan, the sale and the data stay yours.' },
        { kind: 'callout', text: 'Scattered on rented land is why the value leaks. One place you own is how it stops.' },
        { kind: 'p', text: 'Your full result is still saved. Give it another read with this in mind.' },
      ],
      primaryCta: { kind: 'result', label: 'Reopen my result' },
    },
    {
      id: 'core.p2.small-or-large',
      phase: 'belief',
      dayOffset: 8,
      // Leads with the LEAK, not with reassurance about being small. The subject line is read by
      // artists at every size, and "this works even if you are tiny" tells the artist CRWN is
      // actually built for (docs/ICP.md) that they are in the wrong room. The small-audience
      // reassurance stays, one paragraph lower, because it is still true.
      objective: 'Reframe audience size as leakage, not a prerequisite; raise perceived likelihood of success.',
      subject: 'The bigger your audience, the more of it leaks',
      preview: 'Big audiences leak. Small ones convert. The fix is the same one.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'The number in your result is mostly leakage: reach you already have that turns into nothing, because there is no way for it to pay you. The bigger the audience, the bigger the gap.' },
        { kind: 'p', text: 'And if your audience is on the smaller side, it works there too. A small, real audience usually converts better than a big, passive one. Two hundred people who actually care will out-earn twenty thousand who scrolled past you once.' },
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
      objective: 'Reframe the core belief for a proven seller: this is a fragmentation problem, not a monetization problem.',
      subject: 'You do not have a monetization problem',
      preview: 'You already sell to fans. That is not the gap.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'You have already done the hard part. You have fans who spend money on you directly, whether that is merch, a membership, a community, a drop, a ticket. Most artists never get there. You are not most artists.' },
        { kind: 'p', text: 'So the gap in your result is not "can you sell." It is that your selling is split across tools that do not add up to more than their parts:' },
        { kind: 'list', items: [
          'Every platform takes its own cut, so you pay a stack of fees for one business.',
          'Each tool holds a different slice of your fans, and none of them share what they know.',
          'The next offer cannot build on the last one, because the buyer from one tool is invisible in the next.',
        ] },
        { kind: 'p', text: 'The {{feature_name}} in the CRWN app is one piece of the fix: it puts an offer where the fan, the sale and the data already live together, so the next thing you sell starts from everything you already know.' },
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
        { kind: 'p', text: 'You do not move your whole business at once, and nobody is asking you to. You put ONE thing in one place and see how it feels. The first brick, not the finished wall.' },
        { kind: 'moduleQuickWin' },
        { kind: 'p', text: 'That takes an evening, not a quarter, and it runs alongside everything you already have. Once one thing lives in the CRWN app, the next step is obvious, because you can see how the pieces connect.' },
        { kind: 'p', text: 'A free account is where that first brick gets saved and turned on. Your result comes with you.' },
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
          'Watch what they do: the fans who respond are now in one place, tagged, and ready for the next offer.',
        ] },
        { kind: 'moduleUseCase' },
        { kind: 'p', text: 'That is the loop, and the last step is the one your scattered stack cannot do: the fan who buys is remembered, so the next thing you sell starts warm.' },
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
        { kind: 'p', text: 'You know how to sell. What is harder, with a stack this spread out, is knowing which move to make first so the rest compound instead of pile up.' },
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
          withNumber: 'That {{monthly_value}} is not a one-time figure. It is roughly what leaks every month the pieces stay scattered. Six weeks is six of those months added up.',
          withoutNumber: 'The gaps it found are not one-time. They stay open every month the pieces stay scattered. Six weeks is six of those months.',
        },
        { kind: 'p', text: 'You do not have to move everything today. You have to put the first brick in one place, and keep your result while you do it. A free account does both.' },
        { kind: 'p', text: 'If the timing is genuinely wrong, that is fair. These emails will slow down on their own from here.' },
      ],
      primaryCta: { kind: 'signup' },
    },

    // ─── Phase 4: objection handling (weeks 8-12) ────────────────────────────────────────────────
    // The objections of a PROVEN seller with a working (fragmented) stack, not a beginner.
    {
      id: 'core.p4.already-use-tools',
      phase: 'objections',
      dayOffset: 56,
      objective: 'Answer "I already use Patreon / Shopify / Discord" without telling them to rip it all out.',
      subject: '"But I already have a Patreon"',
      preview: 'Good. That is exactly who this is for.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'If you already run a Patreon, a store, a community, an email list, that is not a reason this does not apply to you. It is the reason it does.' },
        { kind: 'p', text: 'Every one of those tools takes a cut and holds a different slice of your fans. Your membership does not know your merch buyers. Your email list does not know who is in your community. You are paying for the same audience four times and getting one quarter of the picture in each.' },
        { kind: 'p', text: 'The move is not to rip it all out this week. It is to put ONE new offer, the one in your result, in a place where the fan and the sale and the data finally sit together. Then you decide, with numbers, what is worth consolidating next.' },
        { kind: 'p', text: 'Start with the one thing. See it work in one place first.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p4.switching-cost',
      phase: 'objections',
      dayOffset: 63,
      objective: 'Answer "I will lose fans / money if I move" with the parallel-run + owned-list truth.',
      subject: '"Won\'t I lose fans if I move?"',
      preview: 'You do not move anyone. You add one place they can come to.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'The fear behind waiting is usually this: if I switch, I lose the subscribers I already have. It is a fair fear, and the answer is that you do not switch anyone.' },
        { kind: 'p', text: 'You run the new offer in parallel. Nobody gets cancelled, nothing gets torn down. The fans you have stay exactly where they are while one new thing goes live in the CRWN app. If it works, you move more over on your own timeline. If it does not, you have lost an evening.' },
        { kind: 'p', text: 'And because the CRWN app gives you an owned fan list, the leverage flips: you control the relationship, so moving on your terms later is a decision, not a gamble.' },
        { kind: 'p', text: 'One more thing: if you already have paying members somewhere else, you do not have to carry them over alone. Artists with an existing paid fanbase can get hands-on help with the move.' },
        { kind: 'p', text: 'Low risk by design. One offer, running alongside everything you already have.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p4.no-time',
      phase: 'objections',
      dayOffset: 70,
      objective: 'Answer "I do not have time to migrate everything" by shrinking the ask.',
      subject: '"I do not have time for this"',
      preview: 'Then do not do the big version. Do the ten-minute one.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'You are busy, and rebuilding your whole setup sounds like a project you will never get to. So do not do that one.' },
        { kind: 'p', text: 'The first version of the offer in your result is one screen and a price. It does not require importing anything, wiring up tools, or a free weekend. You turn on one thing, share one link, and you are done for the week.' },
        { kind: 'moduleQuickWin' },
        { kind: 'p', text: 'And if time really is the wall: artists already selling directly can get the move done with hands-on help instead of doing it alone. You bring the exports, the heavy lifting gets shared.' },
        { kind: 'p', text: 'The full consolidation is a decision for later, made with real numbers. The first brick is tonight.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p4.stack-works',
      phase: 'objections',
      dayOffset: 77,
      objective: 'Answer "my current stack works fine" by pricing the invisible cost.',
      subject: '"My setup works fine"',
      preview: 'Fine has a price. Here is where it hides.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Fine is the most expensive word in your business, because it hides the bill. Your stack works, so you never add up what it costs.' },
        { kind: 'list', items: [
          'The fees: every tool takes its own percentage of the same fans.',
          'The blindness: you cannot see one fan across everything they buy, so your best supporters look like strangers.',
          'The offers you never run: the ones that need the membership, the merch and the email list to talk to each other, which they never will.',
        ] },
        { kind: 'p', text: 'The number in your result is a chunk of that invisible bill made visible. "Fine" is what it looks like right up until you see the total.' },
        { kind: 'p', text: 'You do not have to fix all of it. Close the one gap your result found first.' },
      ],
      primaryCta: { kind: 'result', label: 'See my number again' },
    },
    {
      id: 'core.p4.another-tool',
      phase: 'objections',
      dayOffset: 84,
      objective: 'Answer "I do not want another tool" by positioning CRWN as a replacer, not an addition.',
      subject: '"Not another tool to manage"',
      preview: 'Fair. This one is meant to remove tools, not add one.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'You already have too many logins. The last thing you need is one more dashboard to check. So here is the honest pitch: the CRWN app earns its place only if it eventually replaces some of what you are already paying for.' },
        { kind: 'p', text: 'Membership, paid vaults, live experiences, referrals, missions, a store, an owned fan list, the checkout, the data. The point is not to sit next to your other tools. It is to make a few of them unnecessary, one at a time, on your call.' },
        { kind: 'p', text: 'You test that claim with one offer. If the one thing does not pull its weight, you have added nothing. If it does, you have found the first tool you can cancel.' },
        { kind: 'p', text: 'Start with the one in your result and judge it on results.' },
      ],
      primaryCta: { kind: 'signup' },
    },

    // ─── Phase 5: mechanism + use cases (months 3-4) ─────────────────────────────────────────────
    {
      id: 'core.p5.one-place',
      phase: 'mechanism',
      dayOffset: 100,
      objective: 'Explain the actual mechanism: one fan record with every sale and the next offer attached.',
      subject: 'What "one place" actually means',
      preview: 'Not a landing page. A fan record that remembers.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: '"Put it all in one place" is easy to say and easy to ignore, so here is the mechanism underneath it.' },
        { kind: 'p', text: 'In the CRWN app, a fan is one record. Every sale they make attaches to it: the membership, the vault unlock, the live ticket, the merch. So when you go to sell the next thing, you are not blasting a cold list. You are offering it to people you can already see bought the last one, at the price they were willing to pay.' },
        { kind: 'p', text: 'That is the thing a scattered stack physically cannot do. Your Patreon does not know your Shopify. Your email tool does not know either. One record, every action attached, is what turns a list into a business.' },
        { kind: 'moduleUseCase' },
        { kind: 'p', text: 'The offer in your result is the first record worth starting.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p5.compounding',
      phase: 'mechanism',
      dayOffset: 120,
      objective: 'Show features compounding: a member becomes a vault buyer becomes a live attendee.',
      subject: 'Why offers compound in one place and not four',
      preview: 'A member becomes a buyer becomes an attendee. Automatically.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'The reason consolidation is worth the move is not tidiness. It is that offers start feeding each other.' },
        { kind: 'p', text: 'A free member joins. Because they are one record, the paid vault is a natural next ask, and they can see it. A vault buyer is exactly who you invite to the ticketed live. The live attendee is who you hand a referral link to. Each step is warm, because the last step is remembered.' },
        { kind: 'p', text: 'Run those four across four tools and the chain breaks at every handoff. Nobody carries. You start cold every time, which is why most of the value in your result never shows up.' },
        { kind: 'p', text: 'You do not build the whole chain at once. You start the first link, the one your result pointed at, and the rest have somewhere to connect.' },
      ],
      primaryCta: { kind: 'signup' },
    },

    // ─── Phase 6: proof + identity (months 5-6) ──────────────────────────────────────────────────
    {
      id: 'core.p6.walkthrough',
      phase: 'proof',
      dayOffset: 150,
      objective: 'A clearly-labeled hypothetical walkthrough (no fabricated customers) contrasting action vs scattered.',
      subject: 'A worked example (clearly hypothetical)',
      preview: 'Made up on purpose, so the math is honest.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'This is a made-up example, not a real artist, because a made-up one lets me keep the numbers honest instead of cherry-picked.' },
        { kind: 'p', text: 'Say an artist has a Patreon, a merch store, a Discord, and an email list, and sells fine across all four. Their version of your result showed value leaking in the gaps. They did not migrate anything. They turned on one offer in the CRWN app and pointed one email at it.' },
        { kind: 'p', text: 'What changed was not that they suddenly sold more in month one. It was that, for the first time, the buyers of that offer were one visible list, tagged, with the sale attached. The next drop went to people they could see, not a guess. That is the compounding starting.' },
        { kind: 'p', text: 'Your result is the first offer. The visible list is what you get the day you turn it on.' },
      ],
      primaryCta: { kind: 'result', label: 'Reopen my result' },
    },
    {
      id: 'core.p6.identity',
      phase: 'proof',
      dayOffset: 180,
      objective: 'Identity: you are an artist who owns the fan, the sale, and the data, not a tenant on five platforms.',
      subject: 'Own the relationship, not just the audience',
      preview: 'There is a difference, and it is the whole game.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'You already have an audience. The question that decides the next few years is whether you own the relationship or just rent the attention.' },
        { kind: 'p', text: 'Rented looks like followers you cannot contact, subscribers a platform could offboard, and buyers scattered across tools you do not control. Owned looks like a fan list that is yours, sales that stay attached to real people, and data no algorithm can take back.' },
        { kind: 'p', text: 'The artists who last are not the ones with the most streams. They are the ones who own the line to their fans. Half a year of leaving the value in your result scattered is half a year of staying a tenant.' },
        { kind: 'p', text: 'Owning it starts with putting one offer somewhere you control.' },
      ],
      primaryCta: { kind: 'signup' },
    },

    // ─── Phase 7: re-engagement + alternative entry points (months 7-9) ──────────────────────────
    {
      id: 'core.p7.reintro',
      phase: 'reengagement',
      dayOffset: 220,
      objective: 'Reintroduce the original result and invite a re-run against today\'s numbers.',
      subject: 'Your numbers have probably changed',
      preview: 'It has been a while. The result is still yours to re-run.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'It has been a few months since you ran the {{tool_name}}. Your audience, your catalog and your offers have almost certainly moved since then. The result is still saved, and you can re-run it against what is true now.' },
        {
          kind: 'numberOrFallback',
          withNumber: 'Last time it pointed at about {{monthly_value}}. If you have grown since, the current number is larger, not smaller, and it is still leaking.',
          withoutNumber: 'The gaps it found last time do not close on their own, and if you have grown since, they are wider now.',
        },
        { kind: 'p', text: 'Update the inputs and see where you actually stand today. No account needed to re-run it.' },
      ],
      primaryCta: { kind: 'result', label: 'Re-run with today\'s numbers' },
    },
    {
      id: 'core.p7.blocker',
      phase: 'reengagement',
      dayOffset: 260,
      objective: 'Lower friction to a single reply: what is the one thing stopping you.',
      subject: 'What is the one thing stopping you?',
      preview: 'One reply. I read them.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'I will keep this short. If closing the gap in your result were obvious and easy, it would be done by now. So something is in the way, and I would rather know what it is than keep guessing.' },
        { kind: 'p', text: 'Just reply to this email with the one thing. Too many tools already. No time. Not sure it is worth the move. Burned by a platform before. Whatever it actually is.' },
        { kind: 'p', text: 'I read the replies, and the honest answer usually points at the smallest next step for you specifically. One line is enough.' },
      ],
      primaryCta: { kind: 'result', label: 'Or reopen my result' },
    },

    // ─── Phase 8: long-term authority + conversion (months 10-12) ────────────────────────────────
    {
      id: 'core.p8.year-contrast',
      phase: 'authority',
      dayOffset: 300,
      objective: 'One-year contrast: scattered vs consolidated, without fake urgency.',
      subject: 'A year of scattered vs a year of one place',
      preview: 'Same fans, same effort, different plumbing.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Picture two versions of the next year, same fans and same effort in both.' },
        { kind: 'p', text: 'In the first, everything stays where it is. You keep paying a stack of fees, your best fans stay invisible across tools, and the offers that need your pieces to talk never ship. The value in your result keeps leaking, quietly, all twelve months.' },
        { kind: 'p', text: 'In the second, one offer went live in a place you own on some ordinary evening. The buyers became a visible list. The next drop started warm. By month twelve you are not managing five tools that ignore each other, you are running one that compounds.' },
        { kind: 'p', text: 'The difference between them is not talent or luck. It is a decision you can make in an evening.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p8.cost-of-delay',
      phase: 'authority',
      dayOffset: 340,
      objective: 'Name the cost of continued delay honestly (recurring, not a deadline).',
      subject: 'The quiet cost of leaving it',
      preview: 'No countdown. Just the arithmetic.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'There is no deadline here and I am not going to invent one. But there is arithmetic, and it is worth saying out loud.' },
        {
          kind: 'numberOrFallback',
          withNumber: 'Your result pointed at roughly {{monthly_value}}. That is not a one-time number. It is a monthly leak, so every month it stays open, it adds. Ten months is ten of them.',
          withoutNumber: 'The gaps your result found are not one-time. They stay open every month nothing changes, so the cost is the number of months, and it only grows.',
        },
        { kind: 'p', text: 'The reason this is easy to leave is that a slow leak never feels urgent on any single day. That is exactly why it runs for years. The fix is not urgent. It is just overdue.' },
        { kind: 'p', text: 'Close the first gap. The one your result found is the highest-leverage place to start.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'core.p8.final-invite',
      phase: 'authority',
      dayOffset: 365,
      objective: 'A clear final invite plus an honest option to reduce frequency.',
      subject: 'One year in',
      preview: 'A clear invite, and a way to hear from me less.',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'It has been about a year since you ran the {{tool_name}}. You have gotten a lot of emails from me, always pointed at the same idea: the value you already earn is leaking because it is scattered, and one place you own is how it stops.' },
        { kind: 'p', text: 'If now is the time, your result is still saved and a free account keeps it. The first offer is the same small first brick it always was.' },
        { kind: 'p', text: 'And if it is not, that is genuinely fine. You can reply "less" and I will slow these way down, or use the unsubscribe link below and I will stop. No hard feelings, and the door stays open whenever you want it.' },
        { kind: 'p', text: 'Either way, thank you for reading this far.' },
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
