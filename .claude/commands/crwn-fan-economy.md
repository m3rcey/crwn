# CRWN Fan Economy Scriptwriter

Generate high-retention, high-share short-form CRWN scripts for UNAWARE independent artists who
fit CRWN's ICP, using recognizable ICP-adjacent artists as case studies to teach the Fan Economy
worldview and create demand for CRWN without overstating what CRWN currently does.

This is a different series from `/crwn-shortform` (AAVE paper/sharpie label-industry reels) and
`/crwn-lead-magnet` (the fixed five-magnet calculator formulas). This skill writes FAN ECONOMY
case studies: flexible content families, one storytelling architecture, and a hard curiosity-gap
math gate. Voice is Josh talking to camera: conversational, plain, natural. Not AAVE, not corporate.

## Invocation

`/crwn-fan-economy <request>`

The request is free-form. Handle all of these without follow-up questions:

- "Give me 3 scripts." (pick artists, families, mechanisms automatically)
- "Give me a Share-to-Earn script." (mechanism named; pick artist + family)
- "Write one about fan demand signals." / "Write one about catalog value."
- "Give me a script using Akeem Ali." (artist named; pick family + mechanism)
- "Give me a current-event angle." (current-event mode; research first)
- "Give me 5 ideas and write the best one." (list 5 one-line concepts, then write #1)
- "Give me a hidden-asset video." / "Do a comparison video." / "Give me a Virality Engine concept."
- "Write a proof/evidence video rather than a hypothetical."
- "Give me something we haven't talked about yet." / "Use a different ICP artist."
  (scan `videos/scripts/fan-economy/` and pick an unused artist + family + mechanism)
- "Write a founder/128 video." (Family J; different architecture, see below)

**Defaults when unspecified:** one finished ~60-90 second script · one ICP-fit artist selected
automatically from the pool · artist researched via web search · full awareness ladder · standard
18-beat architecture · product-truth check run · CTA mapped to a live calculator · silent `128 👑`
signature. Concept-only or annotated output only when asked.

## Sources of truth (read before writing; the repo outranks this file)

| Question | Authority |
|---|---|
| Who is the ICP | [docs/ICP.md](../../docs/ICP.md) (Tier 1: 250k-5M followers, 100k-3M monthly listeners, 40+ songs, PROVEN direct seller, fragmented stack) |
| What CRWN may claim | [docs/POSITIONING.md](../../docs/POSITIONING.md) (sections 23 claim maturity and 24 guardrails are BINDING) |
| What CRWN actually has today | [docs/crwn-brain/29-COMPLETE-FEATURE-INVENTORY.md](../../docs/crwn-brain/29-COMPLETE-FEATURE-INVENTORY.md), [docs/crwn-brain/13-CURRENT-STATE.md](../../docs/crwn-brain/13-CURRENT-STATE.md), then the code itself |
| Virality Engine reality | [docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md](../../docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md) (section 28 = what is live) |
| Calculators and keywords | `src/lib/leadMagnets/registry.ts` (slugs + `dmKeywords`) |
| Agent operating rules | [docs/crwn-brain/15-AI-AGENT-INSTRUCTIONS.md](../../docs/crwn-brain/15-AI-AGENT-INSTRUCTIONS.md) |
| Artist pool | [videos/fan-economy/ARTIST_POOL.md](../../videos/fan-economy/ARTIST_POOL.md) (skill-owned; NON-authoritative on numbers) |
| Eval fixtures | [videos/fan-economy/EVAL.md](../../videos/fan-economy/EVAL.md) |

A future-architecture document is never proof a feature is live. When a doc and the code disagree,
the code wins; flag the drift.

## The audience starts UNAWARE

Scripts are for the CRWN ICP: an independent hip hop or R&B artist who already has a real audience
and has already sold something directly, whose stack is fragmented. They do NOT yet believe they
have a monetization problem, know what a Fan Economy is, know CRWN, or agree with the founder's
thesis. Every script walks them:

**Unaware → Problem aware → Solution aware → Product aware → Most aware of the next action.**

"Most aware" does not mean explaining the whole product in 60 seconds. By the end the viewer knows:
the newly revealed problem/opportunity, the type of solution, why CRWN is relevant, why it likely
applies to an artist like them, and the exact next action.

Never open as if the viewer already wants memberships, direct-to-fan software, or "fan ownership."
Beginner framing is equally banned (POSITIONING section 5): this viewer is already running
something. "Start making money from your music" disqualifies CRWN in one line.

## Positioning hierarchy (preserve, never remix)

- **128** = the founder's personal symbol/origin (see Family J). Never a metric.
- **👑** = ownership.
- **Fan Economy** = the category/movement (canonical definition in POSITIONING section 4).
- **CRWN** = the company/infrastructure (category: Fan Economy Operating System).
- **Financial freedom → Creative freedom** = the mission.

Founder beliefs available to scripts (use when the case study EARNS them, never as pasted slogans):

- "You don't need to market to fans. You need a market FOR fans."
- "Artists shouldn't just build audiences. They should build economies around their fans."
- Ownership, said accurately: artists own the RELATIONSHIP, the data, and the permission, never
  the people. "Own the fan relationship. Own the economy." Never the literal "own the fan" /
  "own your fans" as a claim (the calculator NAME is grandfathered; the claim is not).

The content demonstrates the worldview before naming it: the Fan Economy belief should feel like
the logical conclusion of the case study.

Additional binding guardrails from POSITIONING sections 23-24: streaming is the discovery job,
never the villain, and never "they keep most of it" · never dismiss reach or followers · no
"go viral," no guaranteed growth, no passive income, no network-effect or cross-artist benchmark
claims ("artists like you see X" is not allowed today) · no em dashes anywhere · loss-framed first
(name the cost of inaction before the fix) · they/them for any artist whose pronouns you have not
verified; in-script use the artist's publicly known pronouns.

## The critical content principle: case study vs subject

The recognizable artist is the CASE STUDY. The ICP viewer is the SUBJECT.

- **Early bridge (in or near the hook):** signal both audiences. The canonical family is
  "How much money could [Artist] **and artists like him** be missing because [unrecognized
  problem]?" Vary the phrasing; keep the "and artists like [him/her/them]" signal early.
- **Late hard pivot (after Big Reveal + Wow Factor + disclaimer):** a conversational variation of
  "BUT, the bigger question is this..." → "independent artists operating at [Artist]'s level" →
  "I'm talking to YOU." Vary wording per script so it never sounds templated.

The viewer's realization: "this video looked like it was about [Artist], but it's about me."

**Never use a megastar.** If "artists operating at [Artist]'s level, I'm talking to YOU" is absurd
for a 250k-5M-follower independent, the artist is disqualified (no Drake, Beyoncé, Kendrick,
Taylor Swift, etc.). That scale of story belongs to `/crwn-shortform`, not this series.

## Artist selection

The pool lives in [videos/fan-economy/ARTIST_POOL.md](../../videos/fan-economy/ARTIST_POOL.md).
Rules:

1. Prefer recognizable, aspirationally adjacent artists with EVIDENCE of direct fan support
   (direct sales, community strength, independent operation, merch, ticketing, ownership).
2. **Rotation:** scan `videos/scripts/fan-economy/` filenames before picking. Do not reuse the
   artist from the most recent scripts unless the user names one. For "3 more," change artist AND
   family AND ideally mechanism from the last batch.
3. Match artist to concept (a catalog-vault concept needs an artist with a deep catalog; a
   fan-content concept needs an artist whose fans visibly clip/edit/debate).
4. Never invent artist behavior. Everything artist-specific is researched (below).
5. Pool entries flagged `upper-bound` need an explicit hard-pivot sanity check before use; entries
   are candidates, not facts. If the user names an artist not in the pool, research their ICP fit
   first and add them to the pool file in the same session.
6. Pick the audience metric that matches the mechanism, never the biggest number (see below).

## Content families

Support all of these; infer the family when the user does not name one; rotate across batches.

- **A. Missed Money**: what is the artist leaving on the table? (live experience, membership,
  vault/catalog, premium access, post-concert value, direct buyers)
- **B. Hidden Asset**: what valuable asset do they already have but underuse? (existing buyers,
  catalog, fan-created content, high-value fans, repeat purchasers, live attendees, owned contacts)
- **C. Existing Fan Behavior**: what are fans ALREADY doing that creates value with no market?
  (clips, snippet debates, promotion, travel, artwork, edits, recommendations, repeat buying).
  Core thought: the behavior already exists. The market doesn't.
- **D. What If / New Mechanism**: what becomes possible when a fanbase is treated as an economy?
  (fans unlock songs, fan missions, demand-backed tour routing, fan-funded projects, fan A&R,
  participation markets). Usually CONCEPTUAL: never imply CRWN supports these unless verified.
- **E. Business Redesign**: "If I ran [Artist]'s Fan Economy..." / "I'd change one thing about
  [Artist]'s business." Redesign their existing business through the worldview.
- **F. Contrarian / Myth Busting**: followers ≠ business, streams ≠ fan value, engagement ≠
  buying intent, a release is a beginning, the first purchase is a beginning, the best growth
  engine may already be the fanbase. Evidence-driven, never provocative for its own sake, and
  never "followers don't matter" (banned by positioning).
- **G. Comparison / Versus**: "Which fanbase is economically stronger?" Compare on Fan Economy
  criteria (buyers, repeat behavior, participation, owned contacts), never vanity metrics. Compare
  both sides fairly; both artists must pass the ICP-scale rule.
- **H. Cultural / Current Event**: a verified current release, rollout, tour, viral moment, or
  music-business event reveals a Fan Economy insight. REQUIRES current research; never invent news;
  verify the event's date and source.
- **I. Evidence / Proof**: a real artist already demonstrating part of the thesis ("[Artist] just
  proved something most independent artists are getting backwards"). Use to balance hypotheticals.
- **J. Founder / 128 / Philosophy**: see the 128 section. Personal-brand family with its own rules.

## Fan Economy mechanism library

Revenue: memberships, premium tiers, Vault/catalog access, Executive Producer Sessions, live
experiences, ticketing, premium access, direct music/product sales, physical products.
Distribution: Share-to-Earn, Virality Engine fan drives, fan missions, fan-created content,
referral loops, release challenges. Demand discovery: songs, tour cities, merch, pricing,
experiences, release priorities. Fan identification: buyers, repeat buyers, superfans, high-value
fans, segments. Retention/LTV: post-concert relationship, post-purchase journey, recurring
membership, year-round fan economy. Creation: fan A&R, artwork/song/feature selection, fan
participation. Funding/pre-demand: reservations, preorders, demand-backed projects. Ownership:
owned relationships, identifiable fans, first-party data, reduced platform dependence.

**Before any mechanism is attached to CRWN specifically, classify it (next section).** Discussing
a mechanism as a Fan Economy idea is always allowed; attaching it to CRWN is not.

## Product-truth safeguard (anti-overpromise; MANDATORY)

Three claim tiers. Classify the script's mechanism BEFORE writing the CRWN sidenote:

- **SHIPPED:** repo evidence confirms it is live. May say "you can do this on the CRWN app,"
  claiming only the specific supported behavior, with no unnecessary caveat.
- **PARTIAL:** CRWN supports part of it. Describe precisely what exists: "CRWN already gives
  artists [actual capability], which is part of building a system like this." Never imply the
  full hypothetical exists.
- **CONCEPTUAL:** not implemented. Discuss the idea freely, then: "This is the kind of Fan Economy
  I believe artists should be building, and it's the bigger idea behind what we're building with
  CRWN." Or name it plainly as not-today. One concise natural sentence; never a legal disclaimer.

**Verification procedure (the docs below are the start, the code is the finish):** check the
feature inventory (doc 29) and current-state (doc 13); for anything flag-gated remember the code
default LIES about production (memory: probe or check `admin_settings`, all flags were ON except
`artist_gate` as of 2026-08-12); when in doubt read `src/lib/` / `src/app/` for the actual surface.

**Non-authoritative starting map (verified against the repo 2026-08-15; RE-VERIFY before any
"CRWN has this" claim, because this table WILL go stale):**

- SHIPPED: fan memberships/tiers (Bronze/Silver/Gold/Platinum ladder), direct track/product
  sales, the Vault as a Gold-tier feature, live sessions with tickets + tip goals + included
  replay, Share-to-Earn referrals with a per-artist commission rate, Fan Drives (Virality Engine
  V1, non-cash incentives only), fan CRM + CSV/Patreon import, email campaigns, Promise Calendar,
  Rise Mode, early-access release windows + release waterfall, analytics.
- PARTIAL: Executive Producer Sessions (built, dark: fan submission agreement pending), fan
  missions / clip bounties / proof-of-demand (routes live as calculator CTA destinations; tiles
  hidden pre-PMF), demand discovery (proof-of-demand tests exist; no general demand market).
- CONCEPTUAL: demand-backed tour routing, fan A&R markets, fan-funded creative projects,
  participation markets, cash rewards for fan drives (DB-forbidden by design), any external-view
  measurement, ranked fan leaderboards with public scores (deliberately removed), autonomous AI
  manager actions.

## Research requirements

Never invent audience sizes or artist facts. If the script depends on follower counts, monthly
listeners, attendance, sales, merch behavior, ownership status, direct-to-fan behavior, a current
event, touring, or any factual artist-specific claim: **web-search a current, credible figure
before writing.** Prefer primary or highly credible sources. If exact data is unavailable, SAY the
closest public proxy is being used; never silently substitute a metric. Hedge estimates ("about",
"roughly"); state hard facts precisely. Follower counts move monthly; do not trust memory or the
pool file for numbers.

## Audience-metric selection

Anchor the math on the metric that matches the mechanism, never the biggest available number:

- Social growth / Share-to-Earn / fan content / virality → IG/TikTok/YouTube followers.
- Music consumption / catalog / release → monthly listeners / streaming audience.
- Live experience → actual attendance, venue capacity, ticket buyers where public.
- Existing buyer / LTV → known buyers or verified purchasers if available.
- Direct activation → email/SMS/owned audience if publicly known.

When combining platforms, a fan who follows twice is ONE fan: use the overlap equation from
`/crwn-lead-magnet` (biggest platform in full + 40% of the rest; never add streaming listeners).

## Numerical integrity

Every numerical script follows: **real audience anchor → conservative reachable fraction →
conservative participation/conversion → economic assumption → reveal.**

- Never open with an arbitrary "500 fans / 1,000 fans" unless that number IS the premise; derive
  subsets from the real audience.
- All arithmetic must be internally correct; re-multiply every line before saving.
- Conservative assumptions, labeled lightly: "Let's keep this low." "What if only..." Do not
  overdo disclaimers.
- Hypothetical math is a planning example, never a forecast.

## THE CURIOSITY-GAP MATH RULE (hard gate)

If the hook promises a numerical answer (especially money): **the viewer must NOT have every
variable needed to compute it before the Big Reveal.** "940 fans put down $10 each, number in a
second" fails: the viewer already knows $9,400.

Withhold at least ONE critical reveal variable until the Big Reveal:
price, OR conversion rate, OR customer value/tier prices, OR the participant total (percentages
without the final multiplication), OR frequency (single-event value first, annualized later).

Intermediate math may build credibility; reveal math stays unresolved. **The test:** could an
average viewer reasonably calculate the promised answer before you say it? If yes, the script
failed. Rewrite before saving.

## Canonical script architecture (18 beats, standard case-study scripts)

Conversational and fluid; the structure is invisible. Never print beat labels in the finished
script unless the user asks for an annotated version.

1. **HOOK**: recognizable ICP-fit artist + "and artists like [him/her/them]" + a concrete
   unresolved question, usually money/opportunity. Canonical: "How much money could [Artist] and
   artists like him be missing because [unrecognized problem]?" Approved alternatives: "What would
   happen if..." / "Which is actually worth more..." / "I think [Artist] has something more
   valuable than..." / "If I ran [Artist]'s Fan Economy..." / "[Artist] just proved something..."
   A non-financial hook still must open a concrete unanswered question.
2. **ANALYSIS TRANSITION**: "Let's run the numbers." / "Let's break it down." / "Here's why."
3. **ARTIST-SPECIFIC EXISTING BEHAVIOR**: researched, real evidence the artist/fans already do
   something relevant. Viewer thinks: the demand already exists.
4. **THE HIDDEN PROBLEM**: why the current system fails to capture the value (attention ends in
   streams, buyers become anonymous again, releases end instead of compounding, fan creativity has
   no market, audience metrics flatten very different fans...). This lands Problem Aware.
5. **THE BETTER MECHANISM**: explain it simply. NO CRWN yet. Sell the idea before the product.
   This lands Solution Aware.
6. **REAL AUDIENCE ANCHOR**: the researched metric matched to the mechanism, "about/roughly."
7. **CONSERVATIVE ASSUMPTIONS**: one idea per line, no formula dumps, no accidental spoilers.
8. **PRE-REVEAL BUILD**: close enough to feel the answer will be meaningful; the withheld
   variable stays withheld.
9. **TEASE THE BIG REVEAL** (mandatory for numerical scripts): "I ran the final number and it
   gets pretty crazy. I'll give it to you in a second." Do NOT reveal yet.
10. **CRWN SIDENOTE**: while curiosity is at max: "But sidenote..." → the worldview line the case
    study earned (e.g. "this is what I mean when I say you don't need to market to fans, you need
    a market FOR fans") → CRWN at the correct product-truth tier → "ANYWAY..." back to the open
    question. It must feel like a sidenote, never an ad break.
11. **BIG REVEAL**: close the hook's loop. For financial hooks give monthly and, when relevant,
    annual or total. The withheld variable can surface here: "At just $10 each, that's 940 fans
    representing roughly $9,400 in demonstrated demand."
12. **WOW FACTOR / SECOND REVEAL**: AFTER the Big Reveal, never before. "But here's the crazy
    part..." It must reframe or deepen, never restate: the buyers just identified themselves as
    future recurring customers; 9,600 fan clips = 4,800 hours of production the team never paid
    for; 64% of the demand points at ONE idea; the number needed only 0.1% of the following.
    Prefer the Wow that reveals the deeper Fan Economy principle.
13. **SHORT DISCLAIMER**: "The real number could be higher or lower. This is a planning example,
    not a promise." Keep it short.
14. **HARD ICP PIVOT**: "BUT, the bigger question is this..." → "independent artists operating at
    [Artist]'s level" → "I'm talking to YOU." Fresh wording every script.
15. **TURN THE QUESTION ON THE VIEWER**: the personalized version of the hook: "How much are YOU
    missing?" / "How many buyers are hiding inside YOUR audience?" / "What could YOUR catalog
    already be worth?"
16. **PERSONALIZED LEAD MAGNET**: the calculator that answers THIS video's question (mapping
    below). Video asks the question → calculator gives the viewer THEIR answer. Never invent a
    calculator; if none fits exactly, use the closest live one or the general Opportunity
    Calculator.
17. **SINGLE COMMENT CTA**: one action only: "Comment 'WORTH' and I'll DM you the link." No
    follow-me, no link-in-bio stacking, no booking, unless the founder asks.
18. **128 SIGNATURE**: end the stored script with the line `128 👑` marked visual-only. Not
    spoken, not explained, never tied to a metric.

**Ordering laws (non-negotiable):** CRWN never before the better mechanism. Big Reveal never
before the CRWN sidenote. Wow Factor never before the Big Reveal. Pivot only after the viewer got
the value.

## Big Reveal vs Wow Factor

Big Reveal answers the hook ("there's the answer I waited for"). The Wow Factor comes after and
makes it more surprising, scalable, counterintuitive, or shareable ("WAIT, that's the crazy
part"). Design both consciously; they may use different reveal types.

**Reveal types** (Big Reveal matches the hook; Wow may differ): Money ($X/mo, $Y/yr) · Scale (X
new fans/participants) · Market-Signal (64% of demand behind one idea) · Time/Production (4,800
hours of fan-made content) · Concentration (only 0.1% of the audience) · LTV (a first purchase
becomes a $X relationship) · Compounding (the recruited recruit the next wave) · Asset (the old
catalog becomes recurring inventory).

## Awareness-ladder validation (run before output)

UNAWARE: would someone with zero CRWN/problem awareness care about sentence 1? PROBLEM: does the
script reveal something wasted/hidden/underused/mismeasured? SOLUTION: is the better mechanism
understood before CRWN appears? PRODUCT: does the sidenote make CRWN's relevance natural? MOST
AWARE: does the viewer know the exact next action and why it is personally relevant? Any stage
skipped → revise before returning.

## Retention and shareability

Retention: recognizable name immediately · sentence 1 opens an unresolved gap · no throat-clearing
· no CRWN at the top · every section advances the answer · number hidden through the sidenote ·
tease immediately before the sidenote · reveal after CRWN · Wow after reveal · pivot after value ·
ONE CTA. Avoid phrases that accidentally close the gap.

Shareability: at least one share-worthy insight per script, arising from the analysis, never
forced. The menu: tiny % creates a large business · a fanbase distributes itself · buyers become
identifiable · fan activity is market intelligence · a catalog is inventory · a concert is
acquisition · a release is a beginning · fans co-create · economies compound · attention ≠
economic value · the artist may need fewer new fans than they think.

## Language / delivery

Natural when spoken aloud · short sentences · ~5th-grade readability · no corporate language or
unexplained jargon · line breaks for performance rhythm · easy to perform to camera · sparing
repetition · never 17 visible template sections. Numbers as digits with friendly rounding. Never
compare sub-penny fractions aloud (scale to whole cents per 10/100). No em dashes, ever. Banned
words: leverage, optimize, diversify, ecosystem, monetize.

## Content diversity

Before writing, scan `videos/scripts/fan-economy/` (filenames carry family + artist). Vary across
recent scripts: artist, family, mechanism, hook type, audience metric, Big Reveal type, Wow
Factor, lead magnet, proof style. "Followers → 10% reached → 1% buy → monthly revenue" is a
pattern, not the universal formula; use it only when it is genuinely the best analysis.

## Current-event mode

Triggered by "current / recent / trending / this week / just happened / latest." Research first;
verify the event, its date, and a credible source; never invent news; then build the Fan Economy
insight on the verified event. No time-specific words ("this week", "just") in evergreen scripts
with no known air date.

## 128 / Founder mode (Family J)

Facts (never embellish): 128 comes from December 8, the founder's father's birthday. His father
was an entrepreneur; the founder still owns the first dollar his father earned from that business.
His father passed away in 2022. The dollar is proof that something you OWN can create economic
value. CRWN was founded in March 2026. Mission: financial freedom → creative freedom. Core
meaning: **ownership creates freedom.**

- NEVER manufacture 128 mechanics: no 128 fans, $128 offers, 128-day challenges, 128 customers,
  fake 128 metrics.
- Normal scripts: `128 👑` is a silent end-card signature only; never verbally explained.
- Founder-story scripts may tell the origin. They skip the artist-case-study beats (no case-study
  artist, no math gate) but keep: unresolved hook, honest product-truth, single CTA, the pivot to
  the viewer's ownership, and the signature.

## Lead magnet mapping (verified against `src/lib/leadMagnets/registry.ts`, 2026-08-15)

Default to the six PROMOTED tools; paused tools still resolve but only use one when it is
genuinely the closest continuation. Never rename a slug or keyword.

| Video question | Tool (slug) | Comment keyword |
|---|---|---|
| Whole business / "how much am I missing overall" | `opportunity-calculator` | FREE |
| Streaming vs direct support / worth | `worth` (route `/worth`) | WORTH |
| Catalog / unreleased work / hidden asset vault | `vault-revenue-planner` | VAULT |
| Fans promoting for free / distribution | `share-to-earn-planner` | SHARE |
| Fans want into the creative process | `executive-producer-session` | PRODUCER |
| Rented audience / owned relationships | `own-your-fans-calculator` | OWN |
| Live/experience concepts (paused tool, closest fit) | `live-experience-calculator` | LIVE |

If a concept maps to nothing (e.g. a conceptual Family D mechanism), route to the Opportunity
Calculator (FREE) as the general continuation. Do not route every video to the same calculator by
convenience.

## Output

Save to `videos/scripts/fan-economy/[family-letter]-[artist-slug]-[short-concept].md`
(e.g. `a-larry-june-post-show-buyers.md`, `j-founder-first-dollar.md`; founder scripts use
`founder` as the artist slug). Append `-v2` rather than overwriting.

File and chat output, in this order:

```
# [Title / concept]

**SCRIPT:**

[finished script, clean spoken words, line-broken for delivery]

128 👑  (visual end-card, not spoken)

---

**META:** Artist: [name] · Family: [letter/name] · Mechanism: [name] ·
Metric: [anchor + source/date] · Withheld variable: [which] · Big Reveal: [type] ·
Wow Factor: [type] · Lead magnet: [slug + keyword] · CRWN claim tier: [shipped|partial|conceptual]
```

The META line is the only annotation by default. Multiple scripts: clearly separated, each with
its own META. End the chat response with clickable markdown links to the saved files.

## Final validation checklist (run per script before saving)

- [ ] Artist is from/added to the pool, ICP-scale sane (hard pivot not absurd), matched to concept
- [ ] "and artists like [him/her/them]" (or equivalent) appears early
- [ ] Hook opens a concrete unresolved question; no throat-clearing; no CRWN at the top
- [ ] Artist behavior and audience numbers are researched, current, and hedged appropriately
- [ ] Audience metric matches the mechanism; participating counts derived, never arbitrary
- [ ] All math re-multiplied and internally consistent
- [ ] Curiosity-gap gate passes: at least one reveal variable withheld until the Big Reveal
- [ ] Better mechanism explained before CRWN; tease immediately before the sidenote
- [ ] Big Reveal after the CRWN sidenote; Wow Factor after the Big Reveal and not a restatement
- [ ] CRWN claim classified (shipped/partial/conceptual) and worded to that tier
- [ ] Short disclaimer present; hard ICP pivot late; question turned on the viewer
- [ ] CTA maps to a real live calculator; exactly one CTA
- [ ] `128 👑` silent signature; no invented 128 mechanics
- [ ] Awareness ladder validated unaware → most aware
- [ ] No em dashes, no banned words, no beginner framing, streaming not the villain, no
      guaranteed/passive income, no network-effect claims, loss named before the fix
- [ ] Differs from recent scripts in artist, family, and mechanism (unless user pinned them)

## User Argument

$ARGUMENTS
