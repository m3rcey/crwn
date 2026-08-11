# CRWN Positioning Architecture (canonical)

> **Status: POSITIONING SOURCE OF TRUTH. No production copy was changed by the task that created
> this file.** No homepage, calculator, onboarding, Manager, Rise Mode, Virality, email,
> notification, schema, pricing, payment, financial-logic or permission change was made.
>
> Created 2026-08-10 from the founder-ratified
> [`docs/crwn-brain/23-ZERO-TO-ONE-STRATEGY.md`](crwn-brain/23-ZERO-TO-ONE-STRATEGY.md).

## 1. Purpose, and its relationship to the Zero To One strategy

| Document | Answers |
|---|---|
| [`23-ZERO-TO-ONE-STRATEGY.md`](crwn-brain/23-ZERO-TO-ONE-STRATEGY.md) | **Why CRWN wins.** The truth, the wedge, the moat, the evidence, the scorecard |
| **`POSITIONING.md`** (this file) | **How that strategy is expressed to the market.** The words, the hierarchy, the guardrails |

**Every outward-facing surface inherits from this file:** homepage, all 18 calculators, signup,
onboarding, sales conversations, nurture sequences, product copy, case studies, the pitch.

**Rule: no surface invents its own positioning.** If a surface needs a claim this file does not
carry, the fix is to update this file, not to write around it.

This file does not duplicate the strategy's analysis. It carries only what a writer needs.

---

## 2. Contrarian Truth (ratified, do not rewrite)

> **An artist's most valuable business asset is not the size of their audience but the economic
> depth of the identifiable minority within it who pay, keep paying, participate and bring others.**

Everything below is downstream of that sentence.

---

## 3. Category (ratified)

**Fan Economy Operating System.**

CRWN is not a membership platform, an artist CRM, a music monetization platform, a creator
platform, or a link in bio. Those are components. CRWN is the system that operates them toward one
outcome.

---

## 4. Fan Economy (ratified definition)

> **The identifiable network of people around an artist who exchange attention, money,
> participation, advocacy, access and status with that artist over time, together with the offers,
> relationships and obligations that govern the exchange.**

The distinguishing feature is an **ongoing system of identifiable value exchange.** Not size, not
interaction, not contactability.

| Not a fan economy | What is missing |
|---|---|
| A follower count | Not identifiable, no exchange |
| An audience | One-directional attention |
| A mailing list | Contactability without commitment |
| A community | Interaction without commerce or obligation |
| A subscriber list | One flow, and a snapshot rather than a system over time |

---

## 5. Beachhead: the Independent Empire Builder

**Customer-facing label: Independent Empire Builder.**
**Internal id (unchanged, never renamed by this document): `highest_priority_empire_builder`.**

This is a display-label decision only. The taxonomy id, the entry route, the CHECK constraint,
cohort reporting and `taxonomy.test.ts` all keep the existing identifier.

### Who they are (from `docs/ICP.md` Tier 1, verified)

An independent hip hop or R&B artist with 250k to 5M followers and 100k to 3M monthly listeners,
40 to 300 released songs, 3+ years releasing, **who has already sold something directly**: VIP,
merch, tour packages, Patreon, Discord, beat packs, masterclasses, meet and greets. They think like
a business owner. They already run a team or a stack, or both.

### What they already have

An audience. A catalog. Real customers. Merch or shows or both. Fan contacts somewhere. Existing
monetization that works to some degree. Tools they pay for.

**Write to them accordingly.** They are not starting. They are running something already, badly
served by the tools running it.

### What they lack

One system that can see the fan economy whole, name the highest-leverage next move, keep the
promises attached to what they sell, and tell them whether any of it worked.

### What they value

Ownership of the relationship and the data. Leverage. Control. Efficiency. Proof over promises.
Systems that survive them being busy.

### Language to avoid with this segment

Beginner framing insults them and disqualifies CRWN in one line:

- "Start making money from your music"
- "Get your first fans"
- "Build an audience from scratch"
- "Turn your passion into profit"
- "You don't need a label"

These may be valid for a different segment later. They are wrong for the beachhead.

### Operationally, "first" means

**Narrow acquisition and positioning, never product eligibility.** Founder-led outreach, messaging,
creative, proof, case studies, category language and sales learning concentrate here. Signup,
onboarding, features, pricing and support stay open to every qualifying ICP artist.

---

## 6. Core Problem

> **An artist with a real audience and real buyers has no system that can see their fan economy
> whole. Memberships live in one tool, email in another, community in a third, sales in a fourth,
> and the decision about what to do next lives nowhere except in their head. So the relationships
> that carry most of the revenue are the ones nobody is deliberately building.**

Note what this is not. It is not "you need more fans," not "streaming does not pay," and not "own
your audience." Those are supporting problems, and each is too broad to be a wedge.

---

## 7. Promise

> **You will know which fans actually pay you, what to offer them next, and whether it worked. The
> audience you already built becomes a fan economy you operate.**

**Never promise:** guaranteed revenue, a specific dollar figure, virality, passive income, or a
timeline CRWN cannot control. Specific guarantee terms belong to the Launch Partner offer and are
governed by that offer's documentation, not by this file.

---

## 8. Unique Mechanism, in customer language

Internal loop: **Observe, Diagnose, Direct, Deliver, Learn.**

Customer-facing, do not lead with the internal verbs:

| Internal | What we say |
|---|---|
| Observe | CRWN watches the whole fan business in one place |
| Diagnose | It finds the one thing actually holding it back right now |
| Direct | It tells you one move, and shows you the numbers behind it |
| Deliver | It helps you make the move, and tracks what you promised fans |
| Learn | It measures what happened *(see claim maturity, section 23)* |

**Compressed for copy:** *See it. Find the block. One move. Deliver it. Know if it worked.*

---

## 9. Reach vs Fan Economic Depth: the canonical language

This is the distinction most likely to be mishandled. **Reusable, approved formulations:**

> **Reach creates opportunity. Fan economic depth turns opportunity into a business.**

> **Your follower count tells you how many people could pay you. It tells you nothing about how
> many do, how long they stay, or what they are worth. CRWN measures the second.**

> **Growing your audience is worth doing. It is just not the same job as growing your income, and
> most artists only have tools for the first one.**

### Never say

- "Followers do not matter"
- "Audience growth does not matter"
- "Reach is vanity"
- "Virality does not matter"
- Anything implying CRWN is against growth

**Why this matters and is not just politeness:** it would also be false in CRWN's own model. Every
output scales with reach (`addressable = ownedContacts + (primaryReach - ownedContacts) * reachRate`,
`unifiedModel.ts:394`). Saying reach does not matter contradicts our own math and insults an ICP
that built its audience deliberately.

**The accurate disagreement:** reach alone is an incomplete and often misleading measure of artist
business strength.

---

## 10. Old Way / Enemy

**The enemy is fragmented, reach-first artist business operations. It is not any named company.**

The old way:

- One system for memberships, another for email, another for community, another for commerce
- Social platforms for reach, and reach treated as the scoreboard
- A spreadsheet, or nothing, for tracking
- The artist personally deciding what to do next, every week, with no evidence
- No shared record of which action produced which result

**The strategic claim:** these tools each do their job. **What none of them can do, alone or
together, is operate the fan economy**, because no single one can see it whole. That is a claim
about system role, not about product quality.

**Never** attack a named competitor's quality. CRWN coexists with and integrates parts of the stack.

---

## 11. Transformation

| Before | After |
|---|---|
| A large audience and a vague sense that some of them would pay more | An identifiable fan economy: who pays, how much, how long, what they respond to |
| Five to seven tools, none of which agree | One place where the numbers reconcile |
| A weekly guess about what to do next | One prioritized action with the evidence behind it |
| Promises made in a caption and remembered by luck | Dated obligations that get delivered |
| No idea whether last month's push worked | A measured answer *(maturing, section 23)* |
| Revenue that plateaus at the entry tier | A ladder where the high-value rungs actually get built |

---

## 12. One-line positioning (canonical)

> **CRWN is the operating system for your fan economy: it finds the fans who actually pay you,
> names the one move that grows that number next, and tracks whether it worked.**

---

## 13. Ten-second explanation

> **Most artists know their follower count and almost nothing about the few thousand people who
> actually pay them. CRWN operates that group: who they are, what to sell them, what you owe them,
> and what to do next.**

---

## 14. Thirty-second elevator pitch

> **Every artist tool measures reach, because reach is what it can see. But an artist's income does
> not come from their follower count, it comes from the small identifiable group inside it who pay,
> keep paying, and bring other people. Right now that group is split across a membership tool, an
> email tool, a store and a Discord, so nobody can see it whole and nobody can say what to do next.**
>
> **CRWN is a Fan Economy Operating System. It pulls those relationships into one place, finds the
> single thing limiting the business right now, tells the artist one move with the numbers behind
> it, keeps track of what they promised fans, and measures what changed. We start with independent
> hip hop and R&B artists who already sell directly, because they have the fan economy already and
> no system running it.**

---

## 15. Sales-call explanation (founder, conversational)

Not a script. The shape of the argument:

1. **Ask what they already sell directly, and to how many people.** Their answer is the wedge. They
   are not a beginner and the conversation should establish that in the first minute.
2. **Show them the concentration in their own numbers.** Run the calculator live. The point lands
   when it is their follower count.
3. **Name the fragmentation back to them.** List their tools. This is the stack replacement audit.
4. **Make the distinction.** "You have been growing the top of this. The money is in the part
   nobody is operating."
5. **Explain the loop in one breath.** One place, one next move, promises tracked, results measured.
6. **Be specific about what happens first.** First paying member on a real ladder, with the promise
   attached to it scheduled.
7. **Do not oversell the intelligence.** See section 23. Say what CRWN does today.

---

## 16. Investor / strategic explanation

Category, moat and intelligence, not marketing claims:

> **CRWN is building the decision layer for direct-to-fan music businesses. The tools in this
> market are all execution surfaces with no decision layer, because no single tool can see enough
> to have an opinion. CRWN observes the whole chain from a stranger's follower count to a recurring
> charge, on one platform, with money as the label.**
>
> **Today that produces deterministic, evidence-backed guidance and an unusual amount of trustworthy
> financial instrumentation. The durable asset is the structured record of artist state, recommended
> action, action taken and business outcome. Nobody else is positioned to collect it, because
> nobody else holds both the pre-launch audience and the recurring charge.**
>
> **We are honest that this moat is future. Today CRWN is defended by switching costs and integrated
> economics. Network effects are not currently a meaningful defense and we do not claim them.**

---

## 17. Homepage messaging direction

**Structure is preserved. Copy is what Zero To One changes.**

Founder direction that stays: hero starts with an image and an outcome; one primary CTA; the CTA
scrolls into the calculator/wizard; calculator then builder; existing lower marketing sections are
not casually deleted. The homepage **is** the Opportunity Calculator funnel (`HomeFunnel` mounts
`PublicToolClient`), and that reuse must not be forked.

**Required order of what the page communicates:**

1. **The economic problem**, framed as loss and specific to an artist who already has an audience.
2. **The category or the mechanism**, in one line. Not a feature list.
3. **Personalized proof: the calculator.** Their numbers, not ours. This is the primary CTA.
4. **The path in:** what they build first.
5. **Evidence:** what CRWN can legitimately show today (section 22).
6. **How CRWN operates it:** the loop in customer language.
7. **Relevant capabilities**, last, and mapped to jobs rather than listed as features.

**What Zero To One changes about the current page:** the live H1 is *"How much money are you leaving
on the table?"*, which is correctly loss-framed but says nothing about concentration or
identifiability, so it reads as generic monetization. The revision should keep the loss frame and
add the distribution: the money is not evenly spread, and the part that carries it is the part
nobody is operating.

**One live inconsistency to fix during that work, not now:** the `worth` calculator hero opens with
*"Streaming pays pennies,"* while `docs/ICP.md` states the pitch to this ICP is **consolidation, not
"streaming pays pennies."** Section 26 records this.

---

## 18. Calculator messaging spine

All 18 calculators are entry doors into the same argument. **Each may enter through a different
problem. All must arrive at the same insight.**

**The canonical spine, in five beats:**

```
1. You have a large, visible audience.                  (their number, respected)
2. Only a small identifiable part of it will ever pay.  (the honest fraction)
3. That small part is not evenly valuable. A few
   carry a disproportionate share of the revenue.       (the concentration)
4. Nothing you use today is built to find, deepen or
   keep that group.                                     (the loss, named)
5. CRWN operates that fan economy, starting with the
   one move that matters most right now.                (the category, earned)
```

**Beat 3 is the one every existing calculator currently skips.** It is also the beat that makes
CRWN's argument unclaimable by a competitor, because stating it honestly requires admitting the
addressable pool is small.

**Rules for every calculator:**
- Never sum opportunities across tools. `UNIFIED_OPPORTUNITY.md` exists because that total is a
  fiction, and the unified model is the only honest headline.
- Show the fraction, not just the dollar. A number without its denominator is the industry's error.
- Every claim must point at a real CRWN capability.
- The result is the beginning of a build, not the end of a quiz.

**This spine is the input to the upcoming Hormozi-style conversion pass.** That work optimizes how
hard each beat lands. It must not delete a beat, and specifically must not delete beat 3.

### The beat-3 rule: specific where supported, generic where honesty requires it

Implemented 2026-08-10 as `depth` on `buildLossResult` and `unifiedFanDepth` on the Opportunity
Calculator. The rule this established, and it generalizes beyond calculators:

> **A tool states a specific concentration only when its own model produces one. Otherwise it
> states the general truth without numbers, and that is the better answer, not the lazy one.**

Three tools deliberately keep the generic line because their models describe the artist's missing
structure rather than a distribution among fans: **movement page** and **quest path** (both model
the absence of a participation route, not differences in fan value) and **team split** (models
collaborator economics; the fans are not the segmented party). Writing bespoke concentration copy
for these would be inventing specificity, which is the failure mode this rule exists to prevent.

One tool, **royalty readiness**, carries a bespoke line that says the beat does **not** apply to
it: it recovers money already earned elsewhere, and its own result copy states that fans lose
nothing. Forcing fan-depth framing there would have been a non-sequitur. Naming the mismatch is
more honest than silence.

**Already aligned:** the Opportunity Calculator hero currently reads *"Your fans are worth more than
they pay you. One number, and what to build first."* That is close to the spine already and should
be treated as the reference tone.

---

## 19. Offer positioning

**No pricing, guarantee, or plan rule is created or changed here.** Those live in
`20-FIRST-REVENUE-LAUNCH-OFFER.md`, `07-BUSINESS-RULES.md` and `platformTier.ts`.

How to **frame** what already exists:

| Component | Frame it as | Never frame it as |
|---|---|---|
| **The platform** | The operating system for the fan economy | A membership platform, a storefront, a set of tools |
| **Launch Partner / implementation** | Getting the fan economy stood up and operating, with you | A setup service, onboarding help, a done-for-you package |
| **The membership ladder** | The structure that lets your most committed fans go further, which is where most of the revenue is | Tiers, subscription levels, pricing options |
| **The guarantee** | Per its own canonical terms, unchanged | Anything looser or more generous than the documented terms |
| **First paid member (activation)** | Proof the economy is live and the loop is running | A vanity milestone |
| **The plan (Launch / Pro / Scale)** | What it costs to operate at your size, sourced from `TIER_PRICING` | Never restated from memory in copy |

**The offer is the entry point into operating the fan economy, not a pile of software.** If a
description of CRWN could be reordered into a feature list without losing meaning, it is wrong.

---

## 20. Feature-to-outcome messaging map

**Rule: no feature is ever the headline. Every feature maps up to an economic job.**

| Feature | Never say | Say |
|---|---|---|
| **Constraint Engine** | The name. Do not market it by technical name | CRWN finds the single biggest thing limiting your fan business right now, and shows you the evidence |
| **Promise Calendar** | Calendar reminders, task list | Protect the relationship by making sure what you promised actually arrives. A kept promise is a renewed membership |
| **Membership ladder / tiers** | Subscription tiers, pricing levels | Give your most committed fans a way to go further, which is where most of your recurring revenue comes from |
| **Share-to-Earn** | Affiliate links for fans | Turn fan advocacy into measurable acquisition, and pay for it only out of revenue it produced |
| **Clip-to-Earn / Clip Bounties** | Clip contests | Put your best content in front of new people, through the fans already making it |
| **Virality Engine** | Run TikTok challenges | Mobilize your fan economy to create measurable distribution and growth *(architecture only today, section 23)* |
| **Fan CRM / contacts** | Contact list, database | The fan relationships you own, in one place, with what each one is worth |
| **Rise Mode** | Gamification, XP, quests | The sequence of moves that builds the business, in order |
| **Revenue Ramp** | Roadmap, checklist | What twelve months actually looks like, so you do not quit in month three when the numbers say you should not |
| **Release strategy / waterfall** | Scheduling, drip release | Turn each release into a reason for fans to move closer, not just another upload |
| **Analytics** | Dashboards, reports | The numbers that decide your next move, not the ones that make you feel busy |
| **Team Splits** | Revenue sharing | Pay collaborators out of what they helped create, automatically |
| **Live** | Livestreaming | A reason for your most committed fans to show up, and a thing worth paying for |
| **Money Model** | Internal only | Never marketed. Admin instrumentation |

---

## 21. Category explanation (canonical, artist-readable)

> **A Fan Economy Operating System is the system that helps an artist see which fans actually
> create value, decide what to offer them and what to do next, keep the promises made to them, grow
> those relationships, and measure what genuinely made the business stronger.**

**Longer version, when there is room:**

> Your fan economy is the group of people who actually pay you, participate, and bring other people.
> It is smaller than your audience and worth far more. Most artists cannot see it, because it is
> spread across four or five tools that do not talk to each other.
>
> An operating system does three things: it holds the state, it keeps the schedule, and it decides
> what runs next. CRWN holds the fan relationships and the money, keeps the calendar of what you
> owe fans, and decides which move matters most right now. The other tools become things it
> coordinates instead of things you juggle.

**Do not** explain this with a computer analogy. "Like Windows for your fanbase" is worse than
saying nothing.

---

## 22. Competitive category map (internal)

**System role, not feature superiority. Do not claim a competitor lacks features.**

| Category | Their job | CRWN's job |
|---|---|---|
| Streaming platforms | Distribute music, generate reach and royalties | Convert the reach they create into identifiable, paying relationships |
| Membership platforms | Host recurring memberships and gated content | Decide what the membership should be, who to move up it, and whether it is working |
| Community platforms | Host conversation and belonging | Turn belonging into an economy with offers, obligations and measurable value |
| Email / messaging tools | Deliver messages to a list | Decide what to send, to whom, and measure what it produced |
| Ecommerce | Sell products and process orders | Decide what to sell, to which fans, at what point in the relationship |
| Link-in-bio | Route attention to destinations | Own what happens after the click, and whether it produced anything |
| Spreadsheets / manual | Record what the artist remembers | Replace the artist's memory as the system of record for the fan business |

**The pattern:** every row is a component with a real job. **CRWN's job is the decision and the
state.** That is the category claim, and it does not require anyone else to be bad.

---

## 23. Claim maturity: what CRWN may say, and when

**This section exists to stop marketing outrunning the product.** It is binding.

### Allowed today (verified in production)

- "CRWN finds the one thing blocking your fan business right now, and shows you the evidence."
- "Guidance built from your numbers, not a template."
- "Deterministic. Not a guess, and not a black box: every recommendation shows its work."
- "If we do not have enough data to be sure, we tell you that instead of guessing."
- "One place where memberships, sales, fans, promises and payouts reconcile."
- "See what you are owed, what you owe fans, and what to do next."
- Any specific number from the artist's own account or their own calculator inputs.

### NOT allowed today (the systems do not exist)

- "CRWN learns from every artist"
- "Artists like you get the best results from X"
- "CRWN gets smarter the more you use it"
- "Our AI decides what you should do"
- "Powered by data from thousands of artists"
- Any network-effect claim, in any wording
- "Go viral," "guaranteed growth," "passive income," "replace your team," "AI runs your career"

### Allowed once artist-specific learning ships (intelligence layer 2)

Requires recommendation-to-outcome linkage plus per-field observation thresholds:
- "CRWN replaces our estimates with your actual rates as they become real."
- "Your projections are now based on your own conversion, not our assumptions."

### Allowed once cross-artist evidence clears its thresholds (layers 3 and 4)

Requires a matched cohort at a **stated sample floor of at least 8**, never the current `n >= 2`:
- "Artists in your position most often see X."
- Any comparative or benchmark claim.

**Nothing in the middle two tiers may be used early on the argument that it will be true soon.**

---

## 24. Copy guardrails

### Prefer

fan economy · fan economic value · identifiable fans · direct fan relationships · operate ·
deepen · activate · recurring value · measurable · direct revenue · highest-leverage next action ·
what it costs you to skip it

### Avoid, always

| Avoid | Why |
|---|---|
| "Own your fans" | **You cannot own people.** Artists own the *relationship*, the *data* and the *contact permission*. Say that instead. See the conflict in section 26 |
| "Go viral" / "guaranteed growth" | Cannot be promised. `22-VIRALITY-ENGINE-ARCHITECTURE.md` forbids virality as a product promise |
| "Passive income" | Directly contradicts a product built on kept promises |
| "Replace your team" | False and hostile to the collaborators CRWN pays through Team Splits |
| "AI runs your career" | Contradicts the deterministic architecture |
| "Followers do not matter" | False in our own model (section 9) |
| Em dashes, anywhere | Project-wide rule. Use a comma, a colon, or two sentences |
| Beginner framing to the beachhead | Section 5 |

### Accurate replacements for "own your fans"

- "Own the relationship, not the platform it sits on"
- "Your fan list is yours, and it leaves with you"
- "Fans you can reach without asking permission"

### Frame

Artist-facing marketing leads with the **loss**, not the gain (project copy rule). Name the money
not earned, the fans not converted, or the reach going to someone else first, then the fix.

---

## 25. Terminology

| Use | Not | Note |
|---|---|---|
| Fan economy | Fanbase, audience, community | The category depends on this word |
| Fan economic value | LTV, fan value | LTV implies prediction CRWN does not do |
| Identifiable fans | Known fans, real fans | |
| Members / paying members | Subscribers | "Subscriber" collides with streaming and email |
| Independent Empire Builder | The persona name | Customer-facing only; internal id unchanged |
| Fan Economy Operating System | Platform, tool, suite, software | |
| Promises | Perks, benefits, rewards | "Benefits" is fine inside tier config; "promise" is the strategic word |
| Launch / Pro / Scale | Starter, tiers, plans | Internal key `starter` displays as "Launch" |
| Bronze / Silver / Gold / Platinum | The old ladder names | Per `CLAUDE.md` |
| The one next move | Recommendations, insights, tips | Singular, on purpose |

---

## 26. Conflicts with current live copy (found, not fixed)

Four, all verified. **None fixed in this task.**

1. **"Own Your Fans" is a live product name.** `own-your-fans-calculator`, `featureName: 'Own Your
   Fans'`, hero eyebrow, image, analytics metadata and a continuation CTA label
   (`registry.ts:625-642, 1051`). It is also the assigned experience of the **running**
   `oyf-signup-timing-v1` experiment. **Recommendation:** the guardrail in section 24 governs
   *claims*, not this established tool name. Renaming it would break a running experiment,
   analytics continuity, the draft-claiming path and `continuationCta.test.ts`, for a marginal
   gain. Keep the tool name; ensure its body copy says the accurate thing (you own the relationship
   and the data). **Founder call if a rename is wanted; it would need its own task.**

2. **`01-PRODUCT-VISION.md:13` positions CRWN as "Skool meets EVEN meets YouTube."** That is
   comparison-based positioning, which is the opposite of creating a category, and it is repeated
   in `00-START-HERE.md`. Both should be updated to the ratified category. Not in this task.

3. **The `worth` calculator hero leads with "Streaming pays pennies."** `docs/ICP.md` states the
   pitch to this ICP is **consolidation, explicitly not** "streaming pays pennies," and the nurture
   sequence was already retuned away from it. The calculator hero was not. Fix during the
   calculator pass.

4. **`01-PRODUCT-VISION.md` value proposition says "Own your revenue, your subscribers, and your
   data."** Same accuracy problem as (1), plus "subscribers." Suggest "Own your revenue, your fan
   relationships, and your data."

---

## 27. Proof architecture

What CRWN should accumulate to own the category, ranked by strategic value. **No fabricated social
proof, ever.**

| Rank | Proof | Measurable today? |
|---|---|---|
| 1 | Artist direct revenue generated on CRWN | **Yes.** `earnings`, refund-netted |
| 2 | First paid member, and time to reach it | **Yes.** `first_paid_conversion`, all six rails |
| 3 | Increase in fan economic depth (share of revenue from higher rungs) | **Partly.** Rung mix is computable; individual fans deepening is not (no tier transition history) |
| 4 | Retention of paying members vs benchmark | **Yes.** `computeChurn` plus platform benchmark |
| 5 | Fulfillment health (promises kept) | **Yes.** `fulfillment_events`, completion and lateness |
| 6 | Measured improvement after a CRWN recommendation | **No.** The missing primitive. Highest-value gap |
| 7 | Campaign-attributable revenue | **Partly.** Referral rails yes; campaign-level no |
| 8 | Fan participation | **Yes**, but weakest as proof: activity is not outcome |
| 9 | Tool-stack replacement savings | **Yes**, where audited. `stackReplacement.ts` keeps tool-cost and fee lines separate on purpose |

**Proof 6 is the one that would make the category claim unarguable**, and it does not exist yet.

---

## 28. Expansion messaging

Positioning widens only as the wedge is won. **The truth, category and mechanism never change; the
customer description does.**

| Stage | Messaging changes |
|---|---|
| 1. Independent Empire Builder | As written above |
| 2. `established_independent_operator` | Same truth, framed around the catalog and audience already in hand |
| 3. `brand_led_hip_hop_artist` | Framed around the content engine, with fans promoting |
| 4. `rnb_empire_builder` | Depth-first framing. This segment should respond most directly to the contrarian truth |
| 5. ICP Tier 2 | **Only when onboarding stops assuming an artist with nothing.** Beginner language becomes permissible here, and only here |
| 6. Adjacent genres | Requires cohort evidence, not intuition |

---

## 29. Future update rules

1. **The contrarian truth, category and Fan Economy definition are ratified.** Changing any of them
   requires explicit founder approval and an update to
   [`23-ZERO-TO-ONE-STRATEGY.md`](crwn-brain/23-ZERO-TO-ONE-STRATEGY.md) first.
2. **Claim maturity (section 23) is binding.** A claim moves tiers only when the underlying system
   ships, and the move is recorded here with the evidence.
3. **No surface writes its own positioning.** Update this file, then the surface.
4. **Every claim points at a real capability.** CRWN has shipped a calculator selling a feature that
   did not exist; that is the failure this rule prevents.
5. **When the product changes materially, check this file**, alongside `02-FEATURE-MAP`,
   `07-BUSINESS-RULES` and `13-CURRENT-STATE`.
6. **Copy is derived, never invented.** A homepage headline that cannot be traced to a line in this
   file is out of policy.

---

*Strategic source: [`docs/crwn-brain/23-ZERO-TO-ONE-STRATEGY.md`](crwn-brain/23-ZERO-TO-ONE-STRATEGY.md).
Supporting: [`ICP.md`](ICP.md), [`SUB_AVATARS.md`](SUB_AVATARS.md),
[`UNIFIED_OPPORTUNITY.md`](UNIFIED_OPPORTUNITY.md),
[`crwn-brain/20-FIRST-REVENUE-LAUNCH-OFFER.md`](crwn-brain/20-FIRST-REVENUE-LAUNCH-OFFER.md),
[`crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md`](crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md),
[`crwn-brain/07-BUSINESS-RULES.md`](crwn-brain/07-BUSINESS-RULES.md).*
