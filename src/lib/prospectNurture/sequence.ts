// The prospect-nurture sequence. Version 3 (rebuilt 2026-08-15).
//
// One sequence serves every calculator. The calculator-specific parts are injected by the
// `moduleQuickWin` / `moduleUseCase` blocks and by the {{feature_name}} / {{hero_value}} tokens, so
// a new calculator is nurtured correctly the moment it is added to the registry, with zero new copy.
//
// ─── WHO THIS IS FOR (docs/ICP.md) ──────────────────────────────────────────────────────────────
// Not the beginner with no audience. The artist who has ALREADY proven fans will pay them directly,
// but whose monetization is scattered across Patreon, Shopify, Discord, Linktree, Gumroad,
// Eventbrite, email tools and YouTube Memberships. So:
//   - The pitch is CONSOLIDATION, not "streaming pays pennies". They already know that.
//   - Never tell them their audience is too small, that fans might not pay, or that they need a
//     catalog/label/budget. They are past all of it. That framing tells them they are in the wrong
//     room.
//   - Write as though they already run a business, because they do.
//
// ─── THE COPY RULE (revised 2026-08-15, replacing "lead with the LOSS, never the gain") ─────────
// The old rule optimized ONE term of the value equation and spent twelve months on it. An artist
// who is told for a year what they are losing, with no growing sense of what they get, how fast, or
// how little it costs them to try, does not convert. They unsubscribe.
//
// The rule is now:
//
//   START from a problem the artist already recognizes, then make the OUTCOME, the CREDIBILITY of
//   the path, the SPEED of the first result, and the SMALLNESS of the first step progressively more
//   concrete. Never spend an email on loss alone.
//
// Loss framing is still how an email EARNS attention in its first two lines, because the recognized
// problem is the thing they already believe. It is no longer how an email closes. In practice every
// email should be checkable against four questions: what does this make possible (outcome), why
// would it work for THEM specifically (likelihood), how soon do they see anything (speed), and what
// exactly are they being asked to do (effort). An email that only answers the first is not finished.
//
// This does NOT change the artist-facing marketing rule in CLAUDE.md for heroes and tool cards; it
// governs this sequence, where the reader has already self-identified the problem by running a
// calculator.
//
// ─── STANDING CONSTRAINTS ───────────────────────────────────────────────────────────────────────
//   - No em dashes anywhere. Use "the CRWN app", never bare "CRWN", in user-facing lines.
//   - No fake scarcity, no fake countdowns, no fabricated proof, no guaranteed-income claims.
//     Real scarcity exists (founder-assisted capacity is genuinely limited, see brain doc 20) but it
//     is only true for a QUALIFIED lead, so it is never asserted in shared copy.
//   - Every dollar figure is the lead's OWN calculator output, labeled an estimate. Never invented.
//   - Teach more than you pitch. Every email carries something usable even if they never sign up.
//   - Every email is IMAGE-LED: `art` is required by the type, so one cannot ship without a banner.
//
// ─── CADENCE (v2 -> v3) ─────────────────────────────────────────────────────────────────────────
// v2: 25 emails across 365 days, eight calendar phases, objections held until day 56 and proof until
// day 150. v3: 15 emails across 365 days, front-loaded so that 9 of them land inside the first 18
// days, which is the window in which someone decides whether to try a piece of software. Objections
// and proof are distributed to where the thought actually occurs, not to a phase named after them.
// The long tail is kept but thinned to four touches, because a lead who is silent at day 60 is not
// persuaded by density.
//
// This cadence is a HYPOTHESIS, not a measured result. CRWN has never sent a prospect-nurture email
// (verified against production 2026-08-15: zero enrollments, zero sends), so no cadence here is
// evidence-backed. `docs/PROSPECT_NURTURE.md` names the metric that will judge it.
//
// ─── VERSION SAFETY ─────────────────────────────────────────────────────────────────────────────
// `current_step` is an INDEX into a version's `emails` array, so the runner MUST resolve the array
// by the enrollment's stored `sequence_version`, never by "whatever is current". v2 did not do this:
// it stored a version number and then always indexed the live array, so shipping any reorder would
// have jumped in-flight leads to unrelated emails. `sequenceForVersion` is that fix. There are no
// v2 enrollments in production, so the v2 copy is not carried forward; an enrollment on a retired
// version is completed rather than sent a mismatched email.

import type { NurtureSequence } from './types';

export const PROSPECT_NURTURE_VERSION = 3;

const V3: NurtureSequence = {
  version: 3,
  emails: [
    // ─── Phase A: DIAGNOSE (days 1-6) ─────────────────────────────────────────────────────────────
    // The job of week one is to convert a number into a diagnosis the artist recognizes, then hand
    // them one move. Day 0 is the transactional result email, sent by the capture route.
    {
      id: 'v3.a.what-it-means',
      phase: 'diagnose',
      dayOffset: 1,
      objective: 'Turn the calculator figure into a plain-language diagnosis, and say what it is NOT.',
      subject: 'What your {{tool_name}} number is actually measuring',
      preview: 'A plain read of the figure, and the one thing it is not.',
      art: 'discovery',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Yesterday you ran the {{tool_name}}. Before that number turns into another tab you never reopen, here is what it was actually measuring.' },
        {
          kind: 'numberOrFallback',
          withNumber:
            'It pointed at roughly {{monthly_value}} that your current setup is not capturing. That is an estimate built from your own answers, not a promise. And it is specifically NOT a sales problem: it does not assume you need new fans, a bigger audience, or better pitching.',
          withoutNumber:
            'It pointed at a specific gap between what you already have and what you are currently capturing from it. That is built from your own answers, not a promise. And it is specifically NOT a sales problem: it does not assume you need new fans, a bigger audience, or better pitching.',
        },
        { kind: 'p', text: 'It measures one thing: value that exists in your fanbase today and has nowhere to land. The fan is in one tool, the sale happens in a second, the list lives in a third, and the next offer needs all three to talk. So the value sits between them.' },
        { kind: 'p', text: 'Worth doing today: open your result and read the assumptions. If an input looks wrong, change it. The figure moves. A number you cannot audit is a number you should not act on.' },
        { kind: 'p', text: 'If you would rather hear the long version, this is it.' },
        { kind: 'video', vsl: 'vsl-1-fan-worth' },
      ],
      primaryCta: { kind: 'result', label: 'Check what the number left out' },
    },
    {
      id: 'v3.a.not-a-selling-problem',
      phase: 'diagnose',
      dayOffset: 2,
      objective: 'Name the diagnosis: this is a connection problem, not a monetization problem. Removes the insult risk early.',
      subject: 'You do not have a monetization problem',
      preview: 'You already sell to fans. That is not the gap.',
      art: 'fragmentation',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Quick thing, because a lot of software talks to artists like they have never sold anything.' },
        { kind: 'p', text: 'You have already done the hard part. You have fans who pay you directly, whether that is merch, a membership, a community, a drop, a ticket. Most artists never get there. So nothing in your result is telling you to learn how to sell.' },
        { kind: 'p', text: 'What it is telling you is that your selling is split across tools that do not add up to more than their parts:' },
        { kind: 'list', items: [
          'Every platform takes its own cut, so you pay a stack of fees to run one business.',
          'Each tool holds a different slice of your fans, and none of them share what they know.',
          'The next offer cannot build on the last one, because the buyer from one tool is a stranger in the next.',
        ] },
        { kind: 'p', text: 'That third one is the expensive one. It is why your best campaign starts cold every time, and it is the part no amount of extra effort fixes.' },
        { kind: 'p', text: 'Tomorrow-ish I will send the smallest useful move against it. Nothing to do right now.' },
      ],
      primaryCta: { kind: 'result', label: 'Reopen my result' },
    },
    {
      id: 'v3.a.first-move',
      phase: 'diagnose',
      dayOffset: 4,
      objective: 'Hand over the one calculator-specific action, and make the first step feel like an evening.',
      subject: 'The smallest version of the fix',
      preview: 'One move, one place. Not a migration weekend.',
      art: 'firstMove',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'The gap your result found does not close by thinking about it harder, and it does not need your whole business moved. It needs one thing to exist in one place. Here is the smallest useful version for what you ran.' },
        { kind: 'moduleQuickWin' },
        { kind: 'p', text: 'That is genuinely it. Setting up the first version of your {{feature_name}} in the CRWN app takes minutes, it runs alongside everything you already have, and it does not touch a single existing subscriber.' },
        { kind: 'p', text: 'What you get on the other side of it is not just the offer. It is the first group of fans you can see in one place, with what they bought attached to them, which is the thing your current stack cannot give you at any price.' },
        { kind: 'p', text: 'A free account keeps your result and turns that first move on. Nothing you calculated gets re-entered.' },
        { kind: 'p', text: 'If the part you are stuck on is what to actually put inside it, start here.' },
        { kind: 'video', vsl: 'vsl-2-what-fans-pay-for' },
      ],
      primaryCta: { kind: 'auto', qualifiedLabel: 'See the assisted launch option' },
    },
    {
      id: 'v3.a.parallel-not-migration',
      phase: 'diagnose',
      dayOffset: 6,
      objective:
        'Answer the two objections that arrive within minutes: "I already have a Patreon" and "will I lose the fans I have". Both are switching risk.',
      subject: '"But I already have a Patreon"',
      preview: 'Good. That is who this is for. And nobody gets moved.',
      art: 'parallelBridge',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'If you already run a Patreon, a store, a community, an email list, that is not a reason your result does not apply. It is the reason it does. The number came from the fact that those things exist and cannot see each other.' },
        { kind: 'p', text: 'The fear underneath the pause is usually the real objection though: if I start something new, do I put what already works at risk? No, and it is worth being precise about why.' },
        { kind: 'p', text: 'You do not move anyone. Nothing gets cancelled, nothing gets torn down, no existing member is asked to re-subscribe anywhere. One new offer goes live in the CRWN app and runs in parallel with everything you have. If it works, you decide later what is worth consolidating, with real numbers instead of a guess. If it does not, you lost an evening.' },
        { kind: 'callout', text: 'Parallel, not migration. That is the whole risk profile of trying this.' },
        { kind: 'p', text: 'One more thing worth knowing: if you already have paying members somewhere else, moving them over is not something you have to work out alone. There is hands-on help for artists with an existing paid fanbase.' },
      ],
      primaryCta: { kind: 'signup' },
    },

    // ─── Phase B: BELIEVE (days 8-18) ─────────────────────────────────────────────────────────────
    // Mechanism and proof, moved forward from v2's days 100 and 150. Perceived likelihood is what a
    // sophisticated buyer is actually weighing in week two, and it cannot be answered in month five.
    {
      id: 'v3.b.one-record',
      phase: 'believe',
      dayOffset: 8,
      objective: 'Mechanism proof: explain the actual thing that makes consolidation different from tidiness.',
      subject: 'What "one place" actually means',
      preview: 'Not a landing page. A fan record that remembers.',
      art: 'oneRecord',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: '"Put it all in one place" is easy to say and easy to ignore, so here is the mechanism underneath it, because the mechanism is the only part that matters.' },
        { kind: 'p', text: 'In the CRWN app a fan is ONE record. Every sale they make attaches to it: the membership, the vault unlock, the live ticket, the merch order. So when you go to sell the next thing, you are not emailing a list. You are making an offer to people you can see already bought the last one, at a price you already know they were willing to pay.' },
        { kind: 'p', text: 'Run that same sequence across four tools and the chain breaks at every handoff. Your Patreon does not know your store. Your email tool does not know either. Every campaign restarts from zero knowledge, which is exactly why the value in your result never shows up.' },
        { kind: 'moduleUseCase' },
        { kind: 'p', text: 'You do not need the whole system on day one. You need one record worth starting.' },
      ],
      primaryCta: { kind: 'auto', qualifiedLabel: 'See the assisted launch option' },
    },
    {
      id: 'v3.b.proven-buyers',
      phase: 'believe',
      dayOffset: 11,
      objective:
        'Behavioral proof + a genuinely useful deliverable: the order to invite people in. Raises perceived likelihood using the artist\'s OWN history.',
      subject: 'The order to invite people in',
      preview: 'Most launches fail on sequence, not on the offer.',
      art: 'provenBuyers',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Here is something worth having whether or not you ever use the CRWN app.' },
        { kind: 'p', text: 'When an artist launches a new paid offer, the instinct is to announce it publicly first. That is backwards, and it is the single most common reason a good offer looks like a failed one. A public post goes to the coldest, least proven part of your audience, gets a weak response, and you conclude the offer was wrong.' },
        { kind: 'p', text: 'The order that works runs from most proven to least:' },
        { kind: 'list', items: [
          'People who have already paid you directly. Merch buyers, ticket buyers, VIP buyers, past members.',
          'People currently paying you somewhere else.',
          'Engaged fans you can name. Repliers, regulars, the ones in your DMs.',
          'Your wider owned audience. The email list, the community.',
          'Social followers, last.',
        ] },
        { kind: 'p', text: 'You already have group one. That is what makes you different from most people who will read this: your first ten invitations can go to people with a payment history, not to strangers. Ten of those beats one public post, every time.' },
        { kind: 'p', text: 'Write that list down today, even on paper. It is the launch list, and it is the asset your platforms cannot take back.' },
        { kind: 'p', text: 'The full version of this, start to finish, is here.' },
        { kind: 'video', vsl: 'vsl-3-first-100-fans' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'v3.b.ten-minutes',
      phase: 'believe',
      dayOffset: 14,
      objective: 'Answer the time and effort objection by shrinking the ask to something concrete, and naming the assisted option honestly.',
      subject: '"I do not have time for this"',
      preview: 'Then do not do the big version. Do the small one.',
      art: 'onePiece',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'You are busy, and "rebuild how my business runs" is a project that never reaches the top of the list. So do not do that one. It is not the ask.' },
        { kind: 'p', text: 'The first version of the offer in your result is one screen and a price. There is nothing to import, no tools to wire together, and no weekend to clear. You turn on one thing, share one link with the people from the list I mentioned on Monday, and you are done for the week.' },
        { kind: 'moduleQuickWin' },
        { kind: 'p', text: 'You will know inside a few days whether your most proven fans respond. That is a real answer, from real buyers, for the cost of an evening. Compare that to how long you have had the question open.' },
        { kind: 'p', text: 'And if time genuinely is the wall: artists already selling directly do not have to do the move alone. You bring the exports, the heavy lifting gets shared.' },
      ],
      primaryCta: { kind: 'auto', qualifiedLabel: 'See the assisted launch option' },
    },
    {
      // The failure objection had no email. v3 answers the Patreon objection (day 6), the time
      // objection (day 14) and the cost of "fine" (day 45), but never "what if I do all of it and
      // nobody buys", which is the last thing standing between a convinced lead and starting. The
      // First Paid Member Guarantee also appeared nowhere before signup: day 6 only gestures at
      // "hands-on help". This sits at 16 because the thought arrives right after the launch plan
      // (day 11) and the effort answer (day 14), and it hands a qualified lead to the call.
      id: 'v3.b.if-nobody-buys',
      phase: 'believe',
      dayOffset: 16,
      objective: 'Answer the failure objection outright, and name the guarantee that only exists on the assisted path.',
      subject: 'And if nobody buys?',
      preview: 'The honest answer, including what happens when the first version fails.',
      art: 'parallelBridge',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'There is one question left that nothing I have sent you actually answers. You build the offer, you invite the right people, you send it, and thirty days later nobody has paid. What then?' },
        { kind: 'p', text: 'The part worth having first is that zero sales is a signal, not a verdict. It tells you something is wrong. It does not tell you which thing. Maybe the price. Maybe the benefits read as vague. Maybe the right people never saw it. Maybe the checkout quietly did not work. A first launch is partly a test, and a test that returns a readable answer is not a wasted evening.' },
        { kind: 'callout', text: 'Zero paid members tells you there is a problem. It does not tell you what the problem is.' },
        { kind: 'p', text: 'It is also the reason the order I sent on Monday matters so much. A small group you already know something about gives you an answer you can act on. A public post gives you silence you cannot read, and silence is what makes artists conclude the offer was wrong when the audience was.' },
        { kind: 'p', text: 'What happens after a first version fails depends on which path you are on. Self-serve, you keep the offer, the list and everything the attempt taught you, and you change one thing and go again. Artists who qualify for the assisted launch get something more specific than that, and the video is where it is spelled out, conditions included.' },
        { kind: 'video', vsl: 'vsl-4-if-nobody-buys' },
      ],
      primaryCta: { kind: 'auto', qualifiedLabel: 'See the assisted launch option' },
    },
    {
      id: 'v3.b.recalc',
      phase: 'believe',
      dayOffset: 18,
      objective: 'Reduce uncertainty by making the number auditable. Also a re-engagement hook that does not require an account.',
      subject: 'Run it again with your real numbers',
      preview: 'If the estimate felt high or low, the inputs are yours.',
      art: 'discovery',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'You have had a couple of weeks to sit with your result. Maybe the figure felt high. Maybe it felt conservative. Either way it is checkable, which is the only reason it is worth anything.' },
        { kind: 'p', text: 'Open it and change the inputs to what you know is true today: your real audience, your real catalog, the price you would actually charge, the number of people who have genuinely paid you before. The figure updates as you go.' },
        {
          kind: 'numberOrFallback',
          withNumber: 'Most artists who tune it to their real numbers end up with a figure they believe MORE than {{monthly_value}}, not less. The default run is deliberately conservative.',
          withoutNumber: 'Most artists who tune it to their real situation end up with a clearer picture, not a fuzzier one. The default run is deliberately conservative.',
        },
        { kind: 'p', text: 'No account needed to re-run it. This is the honest version of "trust the process": do not trust it, check it.' },
      ],
      primaryCta: { kind: 'result', label: 'Change my inputs and re-run' },
    },

    // ─── Phase C: DECIDE (days 24-45) ─────────────────────────────────────────────────────────────
    {
      id: 'v3.c.compounding',
      phase: 'decide',
      dayOffset: 24,
      objective: 'Dream outcome, made specific: what the second year looks like when offers can see each other.',
      subject: 'Why offers compound in one place and not four',
      preview: 'A member becomes a buyer becomes an attendee. Without you rebuilding the list each time.',
      art: 'compounding',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'The reason consolidation is worth doing is not tidiness. It is that offers start feeding each other instead of each one starting from nothing.' },
        { kind: 'p', text: 'A free member joins. Because they are one record, the paid tier is a natural next ask and they can see it. Whoever buys that is exactly who you invite to the ticketed live session. Whoever attends is who you hand a referral link to. Every step is warm, because the previous step is remembered.' },
        { kind: 'p', text: 'Run those four across four tools and every handoff drops the thread. Nobody carries. You re-earn the same fan four times, and the fourth offer performs like the first.' },
        { kind: 'p', text: 'This is the part that changes what your business is worth, not just what it earns this month: a fanbase where you can see who buys what is an asset. A follower count is not.' },
        { kind: 'p', text: 'You do not build the chain at once. You start the first link, the one your result pointed at, and the rest have somewhere to connect.' },
      ],
      primaryCta: { kind: 'auto', qualifiedLabel: 'See the assisted launch option' },
    },
    {
      id: 'v3.c.worked-example',
      phase: 'decide',
      dayOffset: 32,
      objective: 'A clearly-labeled hypothetical walkthrough. Honest about being hypothetical, because CRWN does not yet have public case studies.',
      subject: 'A worked example (made up on purpose)',
      preview: 'Hypothetical, so the numbers stay honest.',
      art: 'transformation',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'This is an invented example, not a real artist. I am telling you that up front because the alternative is a cherry-picked screenshot, and you have seen enough of those to discount them automatically.' },
        { kind: 'p', text: 'Say an artist runs a Patreon, a merch store, a Discord and an email list, and does fine across all four. Their version of your result showed value leaking in the gaps between them. They did not migrate anything. They turned on one offer in the CRWN app and sent it to about forty people who had already bought something from them before.' },
        { kind: 'p', text: 'What changed in month one was not the revenue. It was that for the first time the people who said yes were one visible list, with the purchase attached to each name. The next drop went to a group they could see instead of an audience they were guessing at.' },
        { kind: 'p', text: 'That is the whole shift, and it is deliberately unglamorous. The compounding starts the moment the buyer stops being anonymous, and it does not require the offer to be a hit first.' },
        { kind: 'p', text: 'Your result is the first offer. The visible list is what you get on day one of running it.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'v3.c.fine-has-a-price',
      phase: 'decide',
      dayOffset: 45,
      objective: 'Answer "my setup works fine" and "I do not want another tool" together, by pricing the invisible cost and positioning the app as a replacer.',
      subject: 'What "fine" is costing',
      preview: 'Not another dashboard. Fewer of them.',
      art: 'stackCollapse',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Two objections worth answering in one go, because they are the two most reasonable ones left.' },
        { kind: 'p', text: 'The first is that your setup works. It does. But "works" hides the bill, so it is worth adding up once: the fees every tool takes from the same fans, the fact that you cannot see one fan across everything they buy, and the offers you never run because they would need three tools to talk to each other. Your result is a slice of that made visible.' },
        { kind: 'p', text: 'The second is that you do not want another login, which is fair. So here is the honest version: the CRWN app only earns its place if it eventually replaces things you are already paying for. Membership, paid vaults, live experiences, a store, referrals, the checkout, the fan list, the data, all in the same place.' },
        { kind: 'p', text: 'You test that with one offer. If it does not pull its weight, you have added nothing and you stop. If it does, you have found the first tool you can cancel, and the second decision gets easier than the first.' },
      ],
      primaryCta: { kind: 'result', label: 'See what fine is costing me' },
    },

    // ─── Phase D: EVERGREEN (days 60-365) ────────────────────────────────────────────────────────
    // Thinned deliberately. A lead who is silent at day 60 is not persuaded by more frequency, and
    // the unsubscribe cost of pretending otherwise is permanent.
    {
      id: 'v3.d.ownership',
      phase: 'evergreen',
      dayOffset: 60,
      objective: 'Identity: owning the relationship versus renting the attention. The long-horizon reason to consolidate.',
      subject: 'Own the relationship, not just the audience',
      preview: 'There is a difference, and it decides the next few years.',
      art: 'ownership',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'You already have an audience. The question that actually decides the next few years is whether you own the relationship or only rent the attention.' },
        { kind: 'p', text: 'Rented looks like followers you cannot contact, subscribers a platform could offboard tomorrow, and buyers scattered across tools whose rules you do not set. Owned looks like a fan list that is yours, sales attached to real people, and data that no algorithm change can take back.' },
        { kind: 'p', text: 'You do not need to believe a platform will turn on you to act on this. You only need to notice that every offer you can run is currently limited by what your tools happen to remember about your fans, and that this is a decision you are allowed to change.' },
        { kind: 'p', text: 'It starts with putting one offer somewhere you control. Same first move as always.' },
      ],
      primaryCta: { kind: 'signup' },
    },
    {
      id: 'v3.d.numbers-moved',
      phase: 'evergreen',
      dayOffset: 120,
      objective: 'Re-engagement with a genuine reason to return: their inputs are months stale.',
      subject: 'Your numbers have probably changed',
      preview: 'Four months of releases and follows later, the inputs are stale.',
      art: 'returning',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'It has been about four months since you ran the {{tool_name}}. Your audience, your catalog and what you have sold have almost certainly moved since then, which means the result you got is now built on old inputs.' },
        { kind: 'p', text: 'It is still saved, and re-running it takes a minute. No account needed.' },
        {
          kind: 'numberOrFallback',
          withNumber: 'Last time it pointed at about {{monthly_value}}. If you have grown at all since, today\'s figure is larger, and it is still sitting between the same tools.',
          withoutNumber: 'The gaps it found last time do not close on their own, and if you have grown since, they are wider now.',
        },
        { kind: 'p', text: 'Worth thirty seconds just to see where you actually stand.' },
      ],
      primaryCta: { kind: 'result', label: 'Re-run with today\'s numbers' },
    },
    {
      id: 'v3.d.one-blocker',
      phase: 'evergreen',
      dayOffset: 210,
      objective: 'Reduce friction to a single reply. Genuinely useful to CRWN pre-PMF, and honest about why.',
      subject: 'What is the one thing stopping you?',
      preview: 'One reply. A real person reads them.',
      art: 'firstMove',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'Short one. If closing the gap in your result were obvious and easy, it would be done by now. So something is in the way, and I would rather know what it is than keep sending you emails that guess.' },
        { kind: 'p', text: 'Reply with the one thing. Too many tools already. No time. Not convinced it is worth the move. Burned by a platform before. Priced wrong. Whatever it actually is.' },
        { kind: 'p', text: 'A real person reads these, and the answer usually points at a smaller next step than the one you are imagining. One line is plenty.' },
      ],
      primaryCta: { kind: 'result', label: 'Or reopen my result' },
    },
    {
      id: 'v3.d.final-invite',
      phase: 'evergreen',
      dayOffset: 365,
      objective: 'A clear final invite plus an honest way to hear from us less. Ends the sequence with the reader in control.',
      subject: 'One year on',
      preview: 'A clear invite, and a way to hear from me less.',
      art: 'returning',
      body: [
        { kind: 'p', text: 'Hey {{first_name}},' },
        { kind: 'p', text: 'It has been about a year since you ran the {{tool_name}}. You have had a handful of emails from me in that time, all pointed at one idea: you already have fans who pay you, and the value that goes missing is going missing between the tools, not inside your audience.' },
        { kind: 'p', text: 'If now is the time, your result is still saved and a free account keeps it. The first move is the same small one it always was, and it still runs alongside everything you have.' },
        { kind: 'p', text: 'If it is not, that is genuinely fine. Reply with "less" and I will slow these right down, or use the unsubscribe link below and I will stop entirely. No hard feelings either way, and nothing closes behind you.' },
        { kind: 'p', text: 'Thanks for reading this far.' },
      ],
      primaryCta: { kind: 'signup' },
    },
  ],
};

/** Every version this runner can send. `current_step` indexes into the matching array. */
export const PROSPECT_NURTURE_SEQUENCES: Readonly<Record<number, NurtureSequence>> = Object.freeze({
  3: V3,
});

/** The sequence new enrollments are created on. */
export const PROSPECT_NURTURE_SEQUENCE = V3;

/**
 * Resolve the array an enrollment must be read against. Returns null for a RETIRED version, which
 * the runner treats as "complete this enrollment", never as "send them the current email at the
 * same index". Indexing a different version's array is how a mid-sequence lead receives an
 * unrelated email, so this is deliberately strict rather than forgiving.
 */
export function sequenceForVersion(version: number | null | undefined): NurtureSequence | null {
  if (typeof version !== 'number' || !Number.isFinite(version)) return null;
  return PROSPECT_NURTURE_SEQUENCES[version] ?? null;
}

// The next email at or after a given step index, within one version. Pure; the runner schedules off
// it. `current_step` is a 0-based count of emails already sent.
export function nextEmailAfter(stepIndex: number, version: number = PROSPECT_NURTURE_VERSION): { email: NurtureSequence['emails'][number]; index: number } | null {
  const seq = sequenceForVersion(version);
  if (!seq) return null;
  if (stepIndex >= seq.emails.length || stepIndex < 0) return null;
  return { email: seq.emails[stepIndex], index: stepIndex };
}
