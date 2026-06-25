# CRWN Content Idea Generator

Generate video topic ideas for CRWN, anchored to specific celebrities and industry events. Each topic is assigned short-form `[S]` (60-sec Reel/TikTok) or long-form `[Y]` (16-min YouTube), grouped by subject, sequenced by relevance and timing, and gated by per-artist frequency caps.

This skill produces TOPICS, not scripts. Once a topic is picked, hand it to `/crwn-shortform` or `/video-script` to write the actual script.

## Invocation

`/crwn-content-ideas <prompt>`

The user's prompt drives the mode. Examples this skill must handle:

- "Generate 50 new short-form topics for CRWN"
- "Give me 20 topics about Drake"
- "What videos should I make about the Kanye Bully rollout?"
- "Generate a 30-day content calendar starting June 1"
- "Drake just announced he's leaving UMG. Give me reactive content."
- "Give me 10 producer payment horror stories"
- "What long-form videos should I make about label deals?"
- "Generate 100 topics I haven't covered yet" (cross-reference existing scripts)
- "Give me 5 topics about [artist name]"
- "What's trending in hip-hop right now that I can make content about?"

Do NOT ask follow-up questions. Read the prompt, pick the right mode (bulk, calendar, single-artist, reactive, category, or trending), and produce the output immediately.

## Counts and Format (read this every time)

If the user asks for a specific number of ideas, produce EXACTLY that number. No fewer, no more.

For every single idea, decide format using the Format Assignment Criteria below. Tag it `[Y]` or `[S]`. Never output an untagged idea.

Format mix rules:
- If the user specifies the format ("50 short-form topics", "20 YouTube ideas about Drake"), produce 100% of that format.
- If the user does NOT specify, mix both formats. Default ratio is roughly 5 short-form to 1 long-form (matches the 90-day calendar pace of ~3 shorts/day and ~1 long/4 days). Adjust if the prompt implies otherwise (e.g. "deep dive ideas" leans long, "quick gut punches" leans short).
- If a single topic genuinely works in both formats, pick the better fit. Do not double-count.

Examples:
- "Give me 50 ideas" -> produce 50 total, roughly 42 `[S]` + 8 `[Y]`, each tagged.
- "Give me 50 short-form ideas" -> produce 50 `[S]`, zero `[Y]`.
- "Give me 20 ideas about Drake" -> produce 20 total, mixed, each tagged.
- "Give me 10 long-form ideas about label deals" -> produce 10 `[Y]`, zero `[S]`.

## Release Date Placement (DEFAULT MODE)

Every generated idea gets an assigned release date. Date-sequenced output is the DEFAULT. Artist-grouped output is opt-in only and requires the user to explicitly ask for it (e.g. "group these by artist").

### How to assign dates

Three placement situations:

1. **Reactive (timely event).** If the idea is tied to a current news event (album drop, lawsuit filing, deal announcement, going-indie story), assign a release date within the next 1-7 days. This displaces a planned topic on that day. Note which planned topic gets bumped, and where it should bump to (next open slot after Day 90, unless the user says otherwise).

2. **Standard append.** For non-reactive ideas, append after the calendar's current end date (Day 90 = Aug 9 2026). Start at Day 91 (Aug 10 2026) and continue forward, 3 short-form per day plus ~1 long-form per 4 days, following the same sequencing rules as the calendar.

3. **Explicit swap.** If the user says "swap into Day X" or "replace #N", do that direct substitution. Show what's being replaced and where the displaced topic should move.

### Sequencing rules (applied to placement)

- Never assign the same artist to two consecutive days.
- Lead each new week with whoever is most timely.
- Every 3rd day must include at least one direct-to-fan model/education topic.
- Spread Tier 3-5 artists across the calendar; don't cluster them.
- Front-load timely topics, back-load evergreen.
- Frequency caps (Tier 1 max 25, Tier 2 max 10, Tier 3-5 max 5) apply to the 90-day rolling window starting from Day 1 of the new placement range. If a Tier 1 artist is at cap on the existing calendar, the cap clock resets for Days 91-180.

### How dates appear in output

Each idea is prefixed with its assigned release date and slot:

```
2026-08-10 (Day 91) #271  [S]  [Topic title]. [Synopsis]
2026-08-10 (Day 91) #272  [S]  [Topic title]. [Synopsis]
2026-08-10 (Day 91) #273  [S]  [Topic title]. [Synopsis]
2026-08-13 (Day 94) [Y]   [Topic title]. [Synopsis]
```

Short-form items get a calendar-style sequential number (#271 onward). Long-form items get the next available long-form number after #46.

For reactive insertions, mark the displacement explicitly:

```
2026-05-15 (Day 4, slot 2) REACTIVE  [S]  [New topic]. [Synopsis]
  Displaces: original #11 "Drake's streaming numbers vs. what those numbers actually pay him"
  Bump displaced item to: 2026-08-10 (Day 91) #271
```

## Output Location

Save every batch to: `/home/merce/.openclaw/workspace-crwn/videos/ideas/[YYYY-MM-DD]-schedule-patch-[descriptor].md`

- `YYYY-MM-DD` is today's date (the date in the system context, not training cutoff).
- `descriptor` is short kebab-case capturing the batch (e.g. `30-shortform-aug-extension`, `drake-leaving-umg-reactive`, `r-and-b-deep-cuts`).
- The file is a SCHEDULE PATCH the user merges into the master calendar at `/mnt/c/Users/Merce/Dropbox/CRWN/CRWN_90Day_Sequenced_Calendar.md` when they approve. The skill never edits the calendar file directly.

After saving, end the response with a clickable markdown link to the saved file AND a one-line note reminding the user this is a patch ready for merge.

## Cross-Reference Before Generating (MANDATORY)

Before producing a single topic, read these sources to avoid duplicates and respect frequency caps. Skipping any of these is how duplicates get added.

1. **READ the 90-day calendar file in full**: `/mnt/c/Users/Merce/Dropbox/CRWN/CRWN_90Day_Sequenced_Calendar.md`. This is the master plan. It enumerates all 46 long-form topics (TIER 1 through TIER 5 sections) and all 270 short-form lines (Day 1 through Day 90). Every topic on it is OFF-LIMITS for "new" idea generation unless the user explicitly asks for variants or replacements. Match on the *idea*, not the exact wording. "Drake's first deal was 18% royalties" and "How much Drake actually signed for on his first contract" are the same idea.
2. Read filenames in `/home/merce/.openclaw/workspace-crwn/videos/scripts/shortform/` and `/home/merce/.openclaw/workspace-crwn/videos/scripts/longform/`. Filenames carry the topic (e.g. `15-mase-bad-boy-publishing.md`). Anything here is also off-limits.
3. Scan prior batches in `/home/merce/.openclaw/workspace-crwn/videos/ideas/` if the folder exists. Don't repeat topics already proposed in the last 30 days.
4. The active calendar window is May 12 - Aug 9 2026. New batches supplement, not replace, that calendar unless the user explicitly says otherwise (e.g. "rewrite the calendar", "swap out Day 12").

If a topic the user clearly wants overlaps with the calendar, flag it in the output (e.g. "[already on calendar Day 4 #10 — proposing variant]") rather than silently duplicating.

### Dedup at the CONCEPT/BEAT level, not just the artist level (MANDATORY)

Artist-only dedup misses the most common collision. A duplicate is ANY of these three, and you must check all three:

- **(a) Same artist + same story** already scripted. (Artist-anchor check — the obvious one.)
- **(b) Same concept-explainer** already scripted, regardless of anchor. Concept-explainers have NO artist to dedup on, so they slip through unless you check them explicitly. The finite explainer set is largely already written: `360 deal`, `recoupment` (incl. after death), `distribution deal`, `licensing deal`, `self-release with a distributor`, `what owning masters means`, `equity`, `indie distribution math`, `indie at scale`, `followers vs subscribers`, `the algorithm decides who sees your post`, `1% of 10k pays rent`, `1 fan vs N streams`, `bigger half of your biggest hit`, `RICO / lyrics as evidence`, `the owned ladder (follower→email→text→subscribe)`, `don't own your stage name`, `family can't reach the fans`. If a new idea re-explains one of these, it is a DUPLICATE even with a different artist or no artist. Only propose an explainer that is genuinely NOT in the filename list (e.g. mechanical-vs-performance royalties, joint-venture deal, breakage).
- **(c) Same story-beat, different name.** Reduce each idea to its lesson-primitive (e.g. "turned-down-a-major-kept-masters", "sold-millions-saw-pennies", "catalog-pulled-off-streaming", "fanbase-stayed-through-a-long-gap"). A NEW artist telling a primitive that already has 2+ scripts is fine ONCE more (the series rotates anchors on purpose), but a primitive that is now appearing a 3rd+ time, OR an idea whose ONLY content is the primitive with no fresh fact/number, is a duplicate. Spread primitives; don't stack the same lesson.

**Procedure:** build a quick lesson-primitive index from the shortform/longform filenames first, then tag every idea you generate with its primitive and its anchor. Reject on a primitive+anchor collision (a), a primitive-is-an-explainer collision (b), or a primitive overload (c). Also dedup the batch against ITSELF — two ideas in the same batch with the same primitive (e.g. two "recoupment is why artists go broke" or two generic "fame isn't ownership" recaps) is the same failure. Generic recap entries with no anchor and no new fact ("the pattern nobody films", "fame is not ownership") are capped at ONE per batch, used only as a closer.

**Filenames are lossy — read the text for the close calls.** A filename carries the anchor but not always the proof inside the script. Real example: a Nipsey topic ("sold 1,000 'Crenshaw' copies at $100 = $100K, Jay-Z bought 100") was already written INSIDE `106-nipsey-marathon-fans-paid-to-recruit.md` — the filename gave no hint. So for any new idea whose beat is near an existing script (same artist, or the same specific anecdote/number), open and read that script's actual text before shipping. The filename index narrows the field; the text read is what confirms no duplicate.

## Target Avatar

Independent hip-hop or R&B artist, 22-35, US-based, 3K-50K followers. Releases original music. Grinding but not seeing results. Knows the industry is broken but doesn't have the new playbook. Core frustration: "I'm doing everything but nothing's moving the needle."

## Content Purpose

Every topic must teach the avatar something about why the current music industry model is broken AND why direct-to-fan (own your audience, sell subscriptions and products directly, keep 90%+ of revenue) is the answer. The content bridges them from problem-aware to solution-aware. If a topic doesn't carry that bridge, cut it.

**The avatar is the independent ARTIST, never a producer or songwriter.** Producer/songwriter anchors (Tier 5) are EXAMPLE material, not a separate audience. The lesson of any producer/songwriter topic must land on the artist (e.g. "the label squeezes everyone in the chain, so owning your audience is the only leverage"). Never write second-person copy aimed at producers ("why your beat tag is your business", "how producers get paid"). If a topic's payoff advises producers instead of the artist, cut it. (memory: `feedback_avatar_not_producers`)

## CRWN Solution Map (reverse-engineer the angle from the story)

Every topic must point to a direct-to-fan solution, but NOT always the same one. CRWN solves many problems; the synopsis should imply which capability the story sets up, and a batch must rotate across them — not 50 variations of "tier math". Match the story's specific pain to the capability that answers it:

- **Own the direct line** (label/algorithm gatekeeps fans): email + text/SMS your fans, you own the list.
- **More income streams** (streaming pennies, recoupment): free + paid tiers, digital/physical products, paid experiences.
- **Fans grow you and get paid** (CAC, no budget): share-and-earn referral, fans earn commission for bringing subscribers.
- **Keep more of every dollar**: 3–8% platform fee vs a label's majority cut.
- **See and act on the money** ("millions went missing", churn): transparent analytics, AI manager flags churn and top spenders.
- **Launch without a label budget** (huge rollout costs): smart links / pre-save pages, discount codes.
- **Be present, not just posted** (no real-time relationship, algorithm decides reach): native livestreaming ("Listening Sessions") — tier-gated live broadcasts plus prerecorded VODs, with live chat and a guest "stage" role. Pairs with clippers/share-to-earn (cut the live into promo) and the release waterfall (paid tier first).

When generating a batch, vary which solution the topics set up. Tag it internally; don't print it. Only reference real CRWN capabilities — no NFT or merch fulfillment (livestreaming IS real; see the bullet above). The full grounded map lives in `crwn-shortform.md` / `video-script.md`; verify against `src/components/artist/` if unsure.

## Fact Check Protocol (MANDATORY)

Per `feedback_factcheck_before_and_after` in memory: web-research every hard claim before drafting AND re-verify before saving. Never assume, never fabricate figures.

For every artist anchor:
- Check current label status (signed, free agent, indie, joint venture).
- Check most recent album/release/lawsuit/deal.
- Check follower counts, streaming numbers, and deal terms only if you find a current source.
- If a claim isn't verifiable, drop it or hedge it (e.g. "reportedly" with a source).

The synopsis is one line, but it sets the script up. A wrong number in the synopsis becomes a wrong number in the script.

## Who To Build Topics Around

Anchor every topic to a specific person the avatar already cares about. Tier governs how often that person can appear.

**Stay in-genre: hip-hop, R&B, or directly adjacent (rap-adjacent pop, soul, funk, gospel).** The avatar is a hip-hop/R&B artist; an off-genre anchor breaks the connection even when its fan-culture or business story illustrates the point perfectly. Do NOT anchor to rock, jam-band, metal, electronica, country, or mainstream-pop acts (no Grateful Dead, Phish, Radiohead, Kate Bush, Moby, Taylor Swift, KISS, the Beatles, etc.). When a great illustration is off-genre, find the hip-hop/R&B equivalent that makes the same point: blog-era comment communities instead of Deadhead tape-trading, Bandcamp pay-what-you-want instead of In Rainbows, Insecure's music supervision instead of a Stranger Things sync, a 90s R&B fan club instead of the KISS Army. Pop is allowed only when the artist is genuinely hip-hop/R&B-adjacent (e.g. Doja Cat, Rihanna). (User correction, 2026-06-13.)

### Tier 1 (highest interest, use most frequently)
Drake, Kanye West, Kendrick Lamar, J. Cole, Jay-Z, Lil Wayne, Nicki Minaj, Travis Scott, Future, Megan Thee Stallion, Lil Baby, 21 Savage, Diddy

### Tier 2 (high interest, use regularly)
Lil Uzi Vert, ASAP Rocky, Cardi B, Tyler the Creator, Playboi Carti, Gunna, Young Thug, Metro Boomin, Nipsey Hussle, Master P, Chance the Rapper

### Tier 3 (known names, use for specific stories)
Big Sean, Mase, The LOX, Desiigner, Trinidad James, Fetty Wap, Lil Pump, Bobby Shmurda, Wiz Khalifa, French Montana, Tech N9ne, Russ, Macklemore, Soulja Boy, Don Toliver, Sheck Wes

### Tier 4 (R&B and legacy, use for deep cuts and variety)
TLC, Toni Braxton, Boyz II Men, SWV, Destiny's Child, Aaliyah, JoJo, Teyana Taylor, Tinashe, Sevyn Streeter, RAYE, Lorde, Taylor Swift

### Tier 5 (producers and songwriters, use for specific angles)
Metro Boomin, Hit-Boy, Timbaland, Pharrell/Neptunes, Bangladesh, Mustard, Southside/808 Mafia, Pi'erre Bourne, London on da Track, Zaytoven, Swizz Beatz, Ester Dean, The-Dream

Tier 5 anchors are examples for the ARTIST avatar, not an audience. The takeaway must teach the artist (see Content Purpose). Never address producers in second person.

## Topic Categories

Every idea must fall into one of these. Tag the category internally; only print it in the output if the user asked for category-grouped output.

1. **Contract traps**. Artists stuck in bad deals, shelved albums, blocked releases.
2. **Ownership wins**. Artists who kept masters, publishing, or built empires through ownership.
3. **Label math exposed**. Gap between what artists were told and what they actually got paid.
4. **Post-label success**. Artists who made more money after leaving a label.
5. **Posthumous profits**. Labels profiting off dead or retired artists.
6. **Development deal trap**. Artists signed young, shelved, career stalled.
7. **360 deal breakdowns**. How 360 deals work using real artist examples.
8. **Turned down deals and won**. Artists who said no to labels and profited more independently.
9. **Bidding wars gone wrong**. Big advances, flopped albums, labels kept the catalog.
10. **Name/brand ownership**. Labels owning an artist's stage name or brand.
11. **Producer/songwriter payment**. How much the people behind the music actually keep.
12. **Recoupment trap**. How advances become debt that never gets paid off.
13. **Catalog value**. What old music is worth and who controls it.
14. **Biggest song paradox**. Artists whose biggest hit made the label millions but the artist almost nothing.
15. **Feature economics**. Who gets paid when you feature on someone else's song.
16. **Label acquisitions**. What happens to your music when your label gets bought.
17. **Current industry shifts**. Artists going indie, market share changes, platform bias.
18. **Direct-to-fan math**. Streaming math vs. subscription/tier math using celebrity examples.
19. **Industry mechanics education**. Royalties, publishing, splits explained through celebrity examples.
20. **"What if" scenarios**. What if [famous artist] went independent with tiers? The math.

## Format Assignment Criteria

### Assign LONG-FORM `[Y]` (16-min YouTube) when
- The artist is a household name the avatar looks up to or follows.
- The story has multiple layers, twists, and a clear narrative arc (beginning, middle, end).
- There's enough math and deal structure detail to sustain 16 minutes.
- The viewer walks away with a framework they can apply to their own career.
- The topic is highly searchable on YouTube (people actively google this person's story).
- The story involves a before/during/after journey.
- Multiple celebrities can be compared within the same video.
- An industry concept needs deep explanation with multiple examples.

### Assign SHORT-FORM `[S]` (60-sec Reel/TikTok) when
- The lesson is one single insight, stat, or number.
- The story is simple. Signed bad deal, left, done.
- The shock factor is in one stat or one moment, not a journey.
- It works better as a gut punch than a deep dive.
- The artist is Tier 3-5 (known but not enough to carry 16 minutes alone).
- It's a single comparison (X vs. Y with one number each).
- It's an industry term explained through one celebrity example.
- It's a "what if" scenario with quick math.

## Frequency Caps Per Artist Per 90-Day Cycle

Combined short-form + long-form across the cycle.
- Tier 1: max 25 appearances
- Tier 2: max 10 appearances
- Tier 3: max 5 appearances
- Tier 4: max 5 appearances
- Tier 5: max 5 appearances

When generating in bulk, count appearances per artist as you go. If you hit the cap mid-batch, swap to a different artist in the same tier or a different tier.

## Sequencing Rules (when output is calendar-ordered)

- Never post the same artist 2 days in a row.
- Lead with whoever is most in the news right now.
- Mix celebrity stories with educational/model content so it's not all drama.
- Every 3rd day include at least one direct-to-fan model education post.
- Spread 90s R&B, producer stories, and deep cuts across the full calendar.
- Group related topics within the same week but not the same day.
- Front-load timely topics, back-load evergreen.
- Space out the same artist by at least 2-3 days between appearances.

## Output Format: Date-Sequenced Schedule Patch (DEFAULT)

This is the default format for every batch. Each idea has an assigned release date computed per the Release Date Placement section above.

```
# Schedule Patch: [Batch descriptor]

Generated [today's date]. Merge into master calendar when approved.

## Append range (Day 91 onward)

### Week 14 (Aug 10-16 2026)

Day 91 (Aug 10)
  271. [S] [Topic]. [Synopsis]
  272. [S] [Topic]. [Synopsis]
  273. [S] [Topic]. [Synopsis]

Day 92 (Aug 11)
  274. [S] [Topic]. [Synopsis]
  275. [S] [Topic]. [Synopsis]
  276. [S] [Topic]. [Synopsis]

Long-form Tier [X] (drop in [month] 2026)
  47. [Y] [Topic]. [Synopsis]
  48. [Y] [Topic]. [Synopsis]

## Reactive insertions (within active calendar)

Day 4 (May 15) slot 2 REACTIVE
  [S] [New topic]. [Synopsis]
  Displaces: original #11 "[old topic title]"
  Bump displaced item to: Day 91 (Aug 10) slot 4
```

## Output Format: Artist-Grouped (OPT-IN ONLY)

Use this format ONLY when the user explicitly says "group by artist" or asks for an artist-focused batch. Do not default to it.

```
# CRWN Content Ideas (artist-grouped): [Date Range or Category]

## [ARTIST/SUBJECT NAME] ([X] topics)

### YouTube
1. [Y] [Topic title]. [One-line synopsis]

### Short-form
2. [S] [Topic title]. [One-line synopsis]
3. [S] [Topic title]. [One-line synopsis]
```

Even when artist-grouped, every idea must still carry a proposed release date in parentheses after the synopsis: `(propose: 2026-08-12, Day 93)`.

## Reactive Content Handling

When given a current event (album drop, lawsuit, label deal, artist going indie, award show):

1. Immediately generate 3-5 short-form topics tied to the event.
2. Decide if the event warrants a long-form YouTube video. If yes, generate one long-form topic with synopsis.
3. Tag every reactive topic with a timeliness rating: `DROP TODAY`, `DROP THIS WEEK`, or `DROP THIS MONTH`.
4. Suggest which previously scheduled topics from the 90-day calendar to swap out to make room.

Reactive output uses the standard date-sequenced patch format above, with the `## Reactive insertions` section populated. Each entry shows the exact release date, the slot it occupies, the displaced original, and where the displaced item should bump to.

## Style Rules for Topic Titles and Synopses

These are titles and one-liners, not scripts, but the same voice rules from memory still apply where relevant:

- No em dashes anywhere. Use periods, commas, parens, or two short sentences (memory: `feedback_no_em_dashes`).
- No "outpaid" or direction-ambiguous money words. Say who paid whom, who got more, in plain terms (memory: `feedback_plain_math_words`).
- Never compare sub-penny fractions. Scale to whole cents or whole dollars.
- Never reuse "200 fans x $10/mo = $24K/yr" as a proxy. Use the featured artist's own direct math when possible. If you must use an indie proxy, rotate the size and tier price every time (memory: `feedback_shortform_proxy_repetition`).
- Topic titles should be specific enough that a viewer immediately knows what the video is about. Not "Drake's deal" but "Drake's $400M Universal renewal".
- Synopses are one line. They state the angle, the number, and the takeaway (or the question the video answers).

## Quality Checks (before saving)

Run through this list before writing the file:

- [ ] No topic addresses producers/songwriters as the audience. Every producer-anchored topic's lesson lands on the artist.
- [ ] The batch varies the CRWN solution across topics (not all tier-math). Each topic's pain maps to a real capability per the CRWN Solution Map; no invented features.
- [ ] Every idea has an assigned release date (Day N + calendar date), per Release Date Placement.
- [ ] Reactive insertions show the displaced original and the bump-to slot.
- [ ] Count matches the user's request exactly (if a number was given).
- [ ] Every topic carries a `[Y]` or `[S]` tag. No untagged ideas.
- [ ] Every topic is anchored to a specific person or group, not a generic concept — INCLUDING capability/feature spotlights and concept explainers. The world revolves around people; an abstract feature pitch ("a community is a moat", "early access is a perk") hits weaker than the same point fronted by a real artist/group ("Wu-Tang's fans are still here 30 years later", "Gunna fans chase snippets"). Open story-shaped lines on a person; only pure platform-summary closers may stay conceptual.
- [ ] Every anchor is hip-hop, R&B, or directly adjacent (rap-adjacent pop/soul/funk/gospel). No rock, jam-band, electronica, country, or mainstream-pop anchors; off-genre illustrations were swapped for in-genre equivalents.
- [ ] Every topic has a clear lesson that points toward direct-to-fan as the solution.
- [ ] Format assignment (short vs. long) follows the criteria above.
- [ ] No artist appears more than their tier's frequency cap.
- [ ] Sequencing rules are followed (no same artist back-to-back, education mixed in every 3rd day).
- [ ] Topics are diverse across categories (not all contract traps, not all ownership wins).
- [ ] Timely topics are front-loaded, evergreen topics fill the back half.
- [ ] Every synopsis is specific enough to hand off to `/crwn-shortform` or `/video-script` without further clarification.
- [ ] Cross-checked against existing scripts and prior idea batches. No duplicates.
- [ ] Concept/beat dedup ran (not just artist): no idea re-explains an already-scripted explainer (b), no primitive appears a 3rd+ time or stands alone with no fresh fact (c), and the batch is deduped against itself. Generic no-anchor recaps capped at one.
- [ ] Every claim that names a deal, number, or date was web-verified.

After saving, end the response with a markdown link to the saved file.
