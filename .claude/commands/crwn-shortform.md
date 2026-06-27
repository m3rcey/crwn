# Short Form Video Script Writer

Write 60-second short-form video scripts in the CRWN paper/sharpie style. Each topic produces a complete package: 5 titles, full script with visuals, teleprompter version, Nano Banana Pro image prompt, pan order, and caption. After the user picks a title, generate a separate thumbnail prompt.

## Invocation

`/crwn-shortform <topic>` or `/crwn-shortform <topic 1> | <topic 2> | <topic 3>`

The user supplies one topic or several topics separated by `|`. Do NOT ask follow-up questions. Generate the full package for each topic in sequence.

## Output Location

Save each script to: `/home/merce/.openclaw/workspace-crwn/videos/scripts/shortform/[N]-[descriptive-kebab-name].md`

Short-form scripts live in their own `shortform/` subfolder, separate from long-form scripts (which live one level up in `videos/scripts/`).

**Filename format:**
- Lowercase kebab-case
- Prefixed with the post number from the 90-day content calendar (1, 2, 3, ..., up to 270)
- The descriptive name should be concise (3-7 words) and capture the topic
- No `_SHORT_SCRIPT` suffix — the `shortform/` folder location already implies that
- Examples: `1-drake-per-stream-vs-label.md`, `15-mase-bad-boy-publishing.md`, `42-master-p-85-15-deal.md`

**Picking the number:** Scan the existing files in `videos/scripts/shortform/` to find the next available number. If working from the project_90day_content_calendar memory, use the calendar's post number (Day 1 post 1 = 1, Day 1 post 2 = 2, etc.). If posting out of order, use the calendar number that matches the topic — do not renumber existing files.

If a near-identical filename already exists at the same number, append `-v2` (e.g. `12-drake-iceman-rollout-v2.md`) rather than overwriting.

## Target Avatar

Independent music artist, 22-35, 3K-50K followers. Releases original music. Grinding but not seeing results. Knows the industry has changed but doesn't have the new playbook. Core frustration: "I'm doing everything but nothing's moving the needle."

## Awareness Level

~85% problem-aware. They know something is broken but don't know the fix. The script BRIDGES them to solution-aware: hook with the pain (stops the scroll), body introduces the solution CATEGORY (direct-to-fan, owning your audience, selling not streaming), payoff leaves them wanting to act.

## CRWN Monetization Model (use for ALL fan-math — NEVER default to a flat "$10/mo")

The #1 recurring defect in past scripts: the same `$10/mo` proxy every time. Banned. CRWN artists make money four ways, and every payoff must reflect a realistic BLEND with numbers that change every script.

**1. Subscription = a 3-tier shape. Plant this mental model in every script.**
- **Free tier** — entry point. Music, community, updates. Zero friction, gets fans in the door.
- **Mid paid tier** — the workhorse. Realistic band $8–$20/mo. Rotate the exact price ($9, $12, $15, $18...).
- **Top paid tier** — the superfan tier. Realistic band $25–$60/mo. Rotate ($25, $30, $40, $50...).
- The *shape* (Free + 2 paid) is fixed and must be named or implied every script. The *prices* vary every script.

**2. Paid experiences / access — fans pay FAR more for these than a sub. Drive this home.**
- 1-on-1 video call $100–$400 · personalized voice note $25–$75 · ticketed live Q&A $15–$40 · live listening session for unreleased music $20–$50.
- These four are EXAMPLES. Invent fresh ones; don't list the same set every script: feedback on a fan's own track ($50–$200), name in the credits/liner notes, shoutout in a song, fan picks the next single, signed handwritten lyric sheet, studio-session vlog access, co-write/beat-making livestream, birthday video, monthly subscriber hang, tour meet-and-greet upgrade, 24h-early first listen, demo vault access.
- The lesson to land in the avatar's head: **one $250 call ≈ 25 fans at $10/mo.** The real money is in access, not the cheap sub.

**3. One-off purchases:** vinyl $35–$60 · CD $12–$25 · signed merch/apparel $30–$80 · direct digital album $5–$15 · limited bundle $50–$150.

**4. A realistic month is a COMBO, never "$X × N fans."** Model blended income with different numbers every script, e.g. "90 fans on the $12 tier, 14 on the $35 tier, 2 calls at $250, 35 vinyls at $45." Change every price and quantity each script; never reuse a combination from the last 5 scripts. See memory `feedback_tier_pricing_recs` and `feedback_shortform_proxy_repetition`.

**5. Scale prices to the artist's stature — the bands above are NOT universal.** Price tracks how scarce and in-demand access to *that specific artist* is:
- **Megastar / legend (Drake, Wayne, Tier 1):** scale + scarcity. Mass sub volume; experiences priced very high but rare — a 1-on-1 is auction-tier ($5K–$25K+), voice note $300–$1,500, not a $200 product. Don't write Drake selling a $150 call; it breaks realism.
- **Recent breakout (4batz, Tier 3-ish):** accessible intimacy. Subs ~$8–$12 / ~$25–$40; 1-on-1 $100–$300; voice note $30–$75. Priced so a true fan can actually say yes.
- **The CRWN avatar (3K–50K, below breakout):** intimacy IS the product. Subs ~$7–$10 / ~$20–$30; 1-on-1 $50–$150; voice note $20–$50. The punchline almost every script can use: a megastar literally CANNOT sell a real 1-on-1 — the avatar can. Smallness is the asset.

Match the numbers to whoever the script is about. A famous-artist proxy uses the megastar bands; the avatar/viewer anchor uses the small-artist bands.

**6. Framing — the avatar is NOT solution-aware.** They don't yet know fans will pay for access/experiences or that this tier model exists. Present it as a revelation with proof ("fans paid [artist] $X for a voice note — that lane is open to anybody"), NEVER as instructions ("price your 1-on-1 at $150", "set up your top tier"). The spoken script sells the IDEA that access pays and that the model exists; it never coaches the viewer on pricing or setup. Any "build your tier / set your price" language is caption-only (already a banned spoken CTA).

## CRWN Capability Map (reverse-engineer the solution from the story)

Tiers are ONE solution. CRWN has many. For each script, identify the specific pain the famous artist hit, then pick the ONE capability that most directly answers THAT pain. Rotate across the groups below — do not default to tier-math every script. Show the solution shaped like the capability, implicitly, without naming CRWN in the spoken body (rule 6 still applies: revelation/proof, not instruction; CRWN naming is caption-only).

**A. Own the direct line** (story pain: label/algorithm controls who hears you, can't reach your own fans, platform could die). Email your subscribers; **text/SMS your fans directly** (a text gets read, no algorithm in between); automated win-back when a fan leaves; you hold the fan list (email, phone, city), not the label.

**B. Get paid more than one way** (pain: streaming pennies, one income stream, advance/recoupment). Free + paid tiers; one-off digital (stems, sample packs, instrumentals); physical (vinyl, CD, merch); paid experiences (1-on-1 call, custom verse, song critique, shoutout); bundles; tips.

**C. Fans grow you and get paid for it** (pain: ad spend/CAC, no marketing budget, label "breaks" you). Share-and-earn referral: a fan earns a commission (around 10%) for every subscriber they bring and can cash it out. Your fans become a paid street team.

**D. Keep more of every dollar** (pain: label takes the bigger half). Platform fee is 3–8% vs a label's majority cut; money pays out direct to the artist.

**E. See and act on the money** (pain: "millions went missing", you never see the books, churn). Transparent real-time analytics (every dollar, MRR, churn, top spenders, geography); an AI manager that flags fans about to leave and your top spenders.

**F. Launch without a label budget** (pain: Drake's ~$1.2M Iceman rollout). Smart links / pre-save release pages with DSP embeds and lead capture; discount codes for launches and win-back.

**Worked matches:** Drake suing UMG / can't reach his own audience -> A (own the line, esp. SMS). Artist spends on ads, label controls discovery -> C (fans paid to refer). Big Sean "millions went missing" -> E (you see every dollar). Drake's $1.2M Iceman rollout -> F + A. Mase $20K publishing / one income stream -> B. Lil Uzi couldn't release -> A/B (drop when you want, sell direct).

**No-fabrication guard:** only use capabilities that exist in the CRWN codebase. CRWN HAS native livestreaming ("Listening Sessions": LiveKit real-time broadcast plus a prerecorded/VOD mode, tier-gated, with live chat and a guest "stage" role). CRWN does NOT have NFT/blockchain or merch fulfillment (it tracks orders, doesn't ship); booking is scheduling, not a separate live product. When unsure whether a feature is real, check `src/components/artist/`, `src/lib/`, or ask — never invent a capability for a punchline.

## Fact Check Protocol (MANDATORY — do this BEFORE drafting AND AGAIN before saving)

Every script that names a real artist, deal, lawsuit, award, album, sales figure, or date can be fact-checked by anyone watching. Getting one wrong (e.g. "Kendrick swept the 2026 Grammys" when it was 2025, or "Drake sued for $50 million" when no amount was disclosed, or "Drake has 80M followers" when it's 139M) makes the whole channel look sloppy. **Do not trust training-data memory for any of this — music-industry facts move constantly (new albums, new deals, new lawsuits, new awards, follower counts that change monthly). Use web search.**

**BEFORE drafting** — list every checkable claim the script will lean on, then verify each one with a web search:
- Artist names, group members, who's signed where, who founded what
- Deal terms (advance amounts, royalty %, distribution cuts, 360 clauses) — and whether a cited dollar figure was actually *reported* or is being invented
- Lawsuit details — who sued whom, when, **the amount (or that no amount was disclosed)**, the outcome (dismissed? settled? on appeal?)
- Awards — **which ceremony YEAR**, how many wins, which categories
- Albums — release date, label/distributor, first-week numbers, and **whether it's actually out yet** (never claim an unreleased album charted)
- Who **produced** a song vs who **wrote/performed** it (these are different people — verify the producer)
- Label/imprint structure (commonly oversimplified — "X is a Y imprint" is often wrong; check the actual distribution arrangement)
- Follower / monthly-listener counts (get a current figure; these are not stable)
- "[Artist] said [thing]" — confirm they actually said it, and roughly what they said

**WHILE drafting** — hedge figures that are estimates or illustrations ("reportedly", "around", "like ~$X"); state hard facts (names, ceremony years, award counts, release dates) precisely. If a fact is contested or you can't pin it down, frame it as a rumor ("rumored to be his last UMG album") rather than asserting it.

**AFTER drafting, BEFORE saving** — re-scan the finished script and pull out every proper noun, every year, every dollar amount, every specific claim. For each one, confirm it matches what you researched. Then:
- If you can't confirm a specific number/date, **soften it** (drop the specific figure, say "no amount was disclosed", say "around" without a hard number) or **cut the claim**. Never ship a fabricated figure attributed to "reports."
- **Single-source superlatives and "sold out / best-selling / most ever / first since" claims need two independent sources.** One blog, net-worth article, or viral tweet is NOT confirmation. If only one source supports it, hedge it ("reportedly sold out", "one of the most certified") or cut it. The figure and any on-image label (e.g. a "SOLD OUT" tag) must match the same confirmed standard.
- **Do the arithmetic on every line of math.** 100 plays × 3¢ = $3.00, not $0.36. If a per-play/per-stream rate and a total don't multiply out, the rate or the total is wrong — fix it so they're internally consistent.
- If a fix changes the visual, update the SCRIPT WITH VISUALS section, the Nano Banana prompt, and the PAN ORDER too.

This protocol applies on every run, even for topics that "feel obvious."

## Title Rules

5 title options per video. Each title:
- Under 40 characters
- Follows ONE of the 10 structures below
- Uses "POV:" prefix when framed as "you"

### 10 Title Structures

1. Would [modal verb] Subject _____ [verb] For _______ [noun]
2. Subject Got _____ [verb] By _______ [noun]
3. If Subject _____ [verb] _______ [noun], He/She/They _______ [verb] _______ [noun]
4. Subject __________ed [verb] A __________ [noun]
5. Every ______ [noun] _______ [verb] ___ [conjunction] ______ [noun]
6. Subject ____ [verb] A ________ [adjective] _________ [noun]
7. Subject ____ [verb] ___th [ordinal number] ______ [noun] A _________ [noun]
8. _____ [noun] Vs ______ [noun]
9. ______ [adjective] ____ [noun] Vs ______ [adjective] _____ [noun] For _______ [noun]
10. _____ing [verb] Subject _______ [verb] To ______ [noun phrase]

Always use "you" instead of he/she throughout the script body (titles can be different).

## Script Structure (5 sections, exact order)

**HOOK (0-3s)** — Scroll-stopping opener. Bold claim or gut-punch number. No intros, no "hey guys." Start mid-action. Opening line MUST use one of the hook formats below (see "Hook Sentence Formats").

**FORESHADOW (3-8s)** — Tease what's coming without revealing it. Give the viewer a reason to stay. **This tease MUST land by the 2nd or 3rd sentence of the spoken script** — right after the hook line, before the story details start. The viewer should know within ~5 seconds that a payoff/surprise is coming, even though they don't yet know what it is. Do NOT bury the first foreshadow deep in the script.

**MID FORESHADOW (optional, ~20-30s)** — Sometimes (NOT every script — roughly half) plant a SECOND tease partway through the rising action, right before the biggest beat. It re-hooks the viewer who's drifting and points at the ending without giving it away ("but the part nobody saw coming was still up next", "and that aint even the crazy part"). Use it when the story has a strong late beat worth re-teasing; skip it when the script is already tight. Never use the same mid-foreshadow phrasing two scripts in a row.

**RISING ACTION (8-35s)** — Escalating stakes. Specific numbers, real comparisons, concrete examples. Every line earns the next second.

**TWIST / SURPRISE ENDING (final beat)** — Subvert expectations. The LAST beat of the script must genuinely BLOW THE VIEWER'S MIND — they should think "man, I was NOT expecting that ending." This is the single highest-priority rule of the whole format. It lands as a stinger RIGHT AFTER the payoff: deliver the takeaway, then hit them with one last unpredictable line that flips or shocks. Do NOT close on a tidy lesson-summary the viewer saw coming; if the ending is predictable, the script failed.

**Strongly prefer a withheld, verified SHOCK FACT** as the kicker — research the topic specifically hunting for the one jaw-dropping true detail (a chart feat, a dollar figure, an ironic outcome, a "his own label cashed the diss" reversal) and hold it back to the very last line. A real surprising fact beats a clever reframe almost every time. Worked examples from this channel: a fake-name leak of an unreleased Carti song hit #1 on Spotify's Viral 50 and he made $0; Jay-Z's music is under 4% of his net worth; Bodak Yellow (her first single) is certified diamond; Not Like Us won Record AND Song of the Year while Drake's own label profited; Future paid a never-public seven figures to own his own name. When NO surprising fact exists, use a hard reframe that recasts the whole story (the inversion still has to feel unforeseen). NEVER invent a twist fact — if you can't verify a jaw-dropper, fall back to a verified reframe. Two ways to land it, and you MUST alternate across scripts (never the same style two in a row):
  - **Reveal-lesson** — the direct-to-fan insight is still the final line, but delivered as an unexpected flip/reveal, not a summary (e.g. a sharp inversion of the hook that recasts the whole story).
  - **Withheld shock fact** — hold one genuinely surprising, verified fact back to the very end and drop it last; let the viewer infer the lesson. (Only use a fact you confirmed in the fact-check pass — never invent a "twist" fact.)
  - Mix freely: some scripts can end on a flipped question, a one-line gut-punch number, or the subject's own outcome. **The CRWN direct-to-fan idea must still be present in every script** (revealed or clearly implied), but it does NOT have to be the literal last sentence.
  - **Do NOT use a fixed stinger lead-in across scripts.** Phrases like "Now here go the part...", "Now here go the kicker/stat/flip", "Here's the part that..." become a template fast. Vary the transition into the final shock every single script, or (often stronger) walk straight into the fact with no lead-in at all. Never reuse the same lead-in shape two scripts in a row.
  - **Vary the foreshadow style AND the twist style every script.** Before locking either, scan the last 2-3 scripts and pick a different shape. Banned as a default here too: the "Here go the lesson / Here go what most artists..." pivot — it telegraphs the ending and kills the surprise.

**PAYOFF (45-60s)** — Connect back to the hook and land the surprise. The payoff and the TWIST / SURPRISE ENDING are the same final stretch: the takeaway should arrive as the unexpected beat described above, not as a flat summary the viewer predicted. It still reframes the topic (the thing they didn't see before this video) and is still education, not a pitch. The CRWN pitch lives in the caption only — never in the spoken script. Banned in PAYOFF:

- "That's the move" / "That's the play" / "That's the answer" / "That's the math" — any sales-cousin closer.
- "Build a free tier" / "Build a paid tier" / "Set up your tiers" — how-to-build-CRWN copy. The video sells the idea, not the product.
- "Keep 92 cents" / "Keep 92%" / "92¢" — the platform-fee callout. That belongs in the caption.
- "Download CRWN" / "Check out CRWN" / "Sign up" — direct CTAs.

A good payoff ends on a punchy reframe like "Streams build the label. Fans build the artist." The viewer walks away with a new lens, not a to-do. But "punchy reframe" does NOT mean predictable: the line should still surprise (see TWIST / SURPRISE ENDING). The best closers feel inevitable in hindsight yet unexpected in the moment.

## Comparison ("X vs Y") topics

When the topic is a head-to-head ("Jay-Z vs Drake", "J. Cole vs Drake", "Kendrick vs Drake"), the script MUST actually compare the two subjects side by side and pull the teachable from the contrast. Do NOT write a one-sided story about one artist that only name-drops the other. Show both sides — what each one did, what each one kept or owns — then land a lesson that only the comparison reveals (e.g. "one sells the most, the other owns the most"). Keep each side factually fair: state what's verifiable about both, and don't assert one "can't" do something just to win the contrast. The visual should read as a side-by-side (a line down the middle, each name on one side).

Words like "teachable" and "the lesson" are direction for YOU, not script copy. Never literally write "the teachable is" or "here's the lesson" in the spoken script — land the point in the avatar's plain words (e.g. "Cole aint need a co-sign, and he kept his own label").

## Hook Sentence Formats

The opening line (the first sentence of HOOK) must follow one of these formats:

- "This is _______. And this is ____________." (comma in place of the period also works)
- "This is how you _____________."
- "What happens when you ________________? Let's find out."
- "Who would __________________? _______________ vs _______________?"
- "This is __________. This is ________________. And this is __________________."
- "____________ just _____________________."
- "Has anybody ever ________________? Want to _________________?"
- "Which _____________________ was the most _________________? Let's ____________________."
- "If ______________________, then ___________________."

**Alternate hook formats across scripts.** Do not use the same hook format two videos in a row. Before locking the hook for a new script, scan the most recent `*_SHORT_SCRIPT.md` files in `/home/merce/.openclaw/workspace-crwn/videos/scripts/shortform/` (read the first line of the HOOK section in each) and pick a format that wasn't used in the last 1-2 short-form videos. The hook is the first thing the viewer hears every video. If every script opens "This is X. And this is Y." the channel develops a sameness and the hook stops landing. Rotate.

## Visual Format

The creator wears RayBan Meta glasses looking down at a white sheet of paper, writing with a black sharpie while talking. Visuals include:

- Bold handwritten text (words, numbers, key phrases)
- Stick figures with smiley faces or simple expressions
- Simple drawings (doors, phones, envelopes, clocks, scales, pie charts, walls, arrows, boxes)
- Circled numbers/words for emphasis
- Boxed text for key takeaways
- Underlined text for main points
- Crossed-out text to show what's wrong
- Check marks and X marks for comparisons
- Dollar signs and math equations

Stage directions go in `[brackets]` and describe exactly what to write, draw, circle, underline, cross out, or box. Be specific about placement: "at the top", "on the left side", "center of the page."

## Nano Banana Pro Prompt Template (exact, never deviate)

Every prompt starts and ends exactly like this:

```
Flat scan of a white sheet of paper filling the entire frame. No desk, no surface, no edges visible, just white paper. Black sharpie marker handwriting. [SPECIFIC CONTENT]. The background is pure white (#FFFFFF). The image is shot perfectly straight on, no angle, no shadow, no background elements. Pure white paper fills the entire 3:4 frame edge to edge.
```

The `[SPECIFIC CONTENT]` section describes every word, number, drawing, circle, box, arrow, stick figure, and underline that appears on the finished sheet. Be exhaustive — the image must match what the camera pans across.

## Style Rules (non-negotiable)

- 5th grade reading level
- Short words, short sentences
- No jargon unless immediately explained
- No sentence longer than 15 words
- No word longer than 3 syllables unless it's a common music term (subscriber, streaming, etc.)
- Never use: leverage, optimize, diversify, ecosystem, monetize
- Never use em dashes anywhere
- Never say "in this video" or "today I want to talk about"
- **Banned rhetorical patterns:**
  - **The "same/different" contrast skeleton — banned in ALL forms, not just triplets.** This covers: "Same X. Same Y." / "Same X, different Y." / "Same X. Two different Z." / "One X, two Y." / "Same [person/song/fan], [other phrasing of the contrast]" / "X vs Y aint the same business." (e.g. "Same album. Two different paydays.", "Same artist. Different keep rate.", "One song. Two timelines.", "Same fan, different model.", "Same diss, no split."). It is the writer's lazy default for the label-vs-direct contrast and it makes every script sound templated. Two-element versions are NOT fine — that exception is revoked. **Make the contrast in plain, specific language that names the actual things, and vary it every script.** Instead of "Same album. Two different paydays." write "Cole sold the exact same record both ways. One way he keeps $435K. The other way he keeps $2.67 million." State the real numbers/nouns; never the bare skeleton. Do not let it appear in the title either.
  - Sales-cousin outros: "That's the move", "That's the play", "That's the answer", "That's the math", "That's how you win".
  - **"The whole ___" filler — banned.** "that's the whole move", "and that's the whole lesson", "the reason is the whole lesson", "the whole switch", "the whole point", "that's the whole thing". Empty hype that adds nothing and signals a templated script. Cut it and just state the actual point.
  - **The "Yea X. But Y." closer template — banned as a default.** Do NOT end scripts with "Yea [old way]. But [new way]." every time. The AAVE reframe is right; the fixed two-clause "Yea ___. But ___." shape on every script is not. See the closing-line guidance under Voice Register and vary the closer's structure every script.
  - **The "Here go what it means for you" avatar-pivot — banned as a default.** Do NOT open the twist or payoff with the same formulaic turn to the viewer every script ("Here go what it mean for you", "Here go the part that should hit you", "Here go what flips it for you", "Here go what most artists sleep on"). The lesson still has to land on the avatar, but a strong story or a sharp contrast usually lands it WITHOUT an announced pivot. You don't have to address "you" in every script. Vary it: sometimes walk straight into the reframe, sometimes let the numbers carry it, sometimes end on the subject's lesson and let the viewer apply it themselves, sometimes keep a direct "you". Never announce the lesson the same way two scripts in a row.
  - **"Yo" / "Yo," — banned entirely.** Never open a script or any sentence with "Yo" or "Yo,", and never use "yo" as filler anywhere in the spoken script. Start on the named subject and the concrete hook. AAVE voice still comes through "ya", "em", "aint", "gon", dropped g's, copula drop — just never "yo".
  - In-spoken-script CTA: "Build a free tier", "Build a paid tier", "Set up your tiers", "Keep 92 cents/percent of every dollar", any "X¢" platform-fee callout. These belong in the caption, never spoken.
- MrBeast pacing: short, punchy, constant momentum
- Talk like a friend who figured it out first, not a teacher or brand
- Real numbers and simple math (streaming pay rates, subscription income)
- Use "you" and "your" often
- Listicles always count DOWN (5, 4, 3, 2, 1), save best for #1
- Tier structures always include a free tier as the entry point
- Approximately 150-170 words spoken total

### Number Formatting

Digits and symbols by default: `$15`, `$30`, `92%`, `5,000 fans`, `$2M`. Don't spell numbers out.

**Never compare sub-penny fractions spoken aloud.** "A third of a penny vs three quarters of a penny" is unparseable in real time — both sound like "less than a penny" and the viewer has to do fraction math to figure out which is bigger. **Scale the comparison up to whole cents (or dollars) by multiplying through.** The per-stream rate of $0.003 vs $0.007 is spoken as "for every 10 streams, Drake earns 3 cents. His label earns 7." Same ratio, integers, instantly comparable.

- For any sub-cent rate (streaming payouts, ad rates, micro-fees), scale up to whole cents per 10 or 100 units in the spoken script. Show the scaled math on the paper too (e.g., "10 STREAMS / DRAKE 3¢ / LABEL 7¢").
- The original tiny number ($0.003 vs $0.007) can still appear on the paper — viewers can see and compare digits side-by-side visually. But the spoken word always uses the scaled-up integer version.
- Same principle for percentages: avoid "0.3% vs 0.7%" spoken — say "3 out of every 1,000" or scale to "3 vs 7 per 1,000".

**Never leave a number blank as a fragment.** If a sentence is "For Drake that's about ___" the number MUST be filled in with the real value before saving (e.g. "For Drake that's about $3,000"). Before writing the file, scan every sentence in the SCRIPT that introduces a number. If any sentence trails off without the number, or ends with a preposition ("about", "around", "roughly", "that's"), it's a fragment. Fill it in or rewrite the sentence.

### Plain Language

- **Banned in titles and spoken script:** "outpaid", "outearned", "outperformed", "outvalued" — direction-ambiguous prefixes that require the viewer to mentally parse which way the comparison goes. Use "got beat", "got paid less", "made less than", "lost to", "kept less than" instead.
- The bar: a 22-year-old artist scrolling at 1.5x speed should know the meaning of every word without thinking. If a word requires a definition to decode, swap it.

### Word Economy (apply in a final pass before saving)

Josh has repeatedly edited drafts for these patterns. Apply them as you write, then scan once more before saving:

- **Simplest verb wins.** "make" beats "earn", "get" beats "keep" when interchangeable. "go platinum" beats "sell platinum records."
- **Cut decorative metaphors that don't add information.** "a debt with a beat on it" → just "a debt." If the base noun lands the point, don't tack on a clever embellishment.
- **Full word, not abbreviation, in spoken script.** "indie" → "independent". "vs" spoken is awkward.
- **Drop adjectives the context already implies.** Once the script establishes the fan-payment model, "200 paying fans" → "200 fans." Once "real income" has been set up, just "income."
- **Negation:** prefer "Nope" over "Nah" for universality. Both are casual; "Nope" reads more accessible.
- **Add a clarifying noun if a term could be misread.** "$2 million deal" → "$2 million record deal" — a non-music viewer might think tour deal or brand deal.
- **AAVE copula drop:** "Here's what they don't tell you" → "This what they don't tell you." Faster, more natural.
- **Stitch staccato lists into flowing sentences when reading aloud.** Three sentences of "No X" feels lecture-y. Merge with conjunctions: "No recoupment no 18% or $2M to come out from."
- **Cut dated idioms.** "a dime" → "any of it". "back in the day" → "before". Date-anchored slang ages the script.
- **Add articles where natural delivery needs them.** "Fans are" → "The fans are" when the line needs rhythmic symmetry with a previous clause.

### Voice Register

The whole spoken SCRIPT is delivered in spoken Black English. Not just dialogue, not just proxy-perspective beats — the entire script. The avatar is independent Black hip-hop and R&B artists, and Josh records these in his own voice. A neutral-narrator script doesn't sound like him or the audience.

**Apply these AAVE markers across HOOK, FORESHADOW, RISING ACTION, TWIST, and most of PAYOFF:**

- Drop 3rd person singular -s: "the label make", "a million streams sound like a lot" — not "makes" / "sounds"
- Use "they" as a possessive: "they own song", not "his own song"
- Drop auxiliary "do" in questions: "what you think your numbers look like?", not "what do you think"
- "dont" without apostrophe, AAVE negation: "he dont gotta share", "the label dont get nothin"
- Use "gotta", "gon", "ain't", "em", "yall" naturally
- Casual comparators: "like a lot" beats "huge", "in the game" beats "alive"
- Conditional framing: "If Drake has ownership he dont gotta share that money" reads better than "Drake never has to share that money"
- Merge over-staccato fragments back into flowing sentences when they feel choppy ("Every play. Every stream. The label eats first." reads better as "With every play and stream the label eats first.")

**Keep neutral:**

- **Math callouts** where precision matters ($3,000, $7,000, 40,000 streams) — the numbers themselves stay clean even inside Black English sentences
- The **caption** (always neutral, brand voice)

**The closing line is NOT a neutral exception.** Earlier guidance said the PAYOFF closer should be in neutral voice. That was wrong — Josh edited "Followers fill your screen. The fans fill your wallet." into "Yea followers fill up ya screen. But the fans fill up ya wallet." The parallel structure stays punchy, but the delivery is in the avatar's voice. Keep the parallel; lose the neutral.

**But do NOT default to the "Yea X. But Y." closer.** Josh is tired of nearly every script ending with the exact "Yea [old way]. But [new way]." template ("Yea radio used to decide. But now the fans do."). The AAVE reframe is right; the fixed two-clause "Yea ___. But ___." shape, used every time, is not. **Vary the closer's structure every single script** — one declarative reframe ("Radio used to hand out the wins. Now direct fans take em."), a short rhetorical question, a flipped order, a single clean sentence, the contrast without "Yea"/"But" at all. Before locking a closer, scan the final lines of the last few shortform scripts and pick a different shape than they used.

**Specific word preferences Josh has flagged:** "play" not "spin" (when talking about a stream), "in the game" not "alive" (when ranking artists), "like" not "about" for approximations.

**Additional spoken patterns (apply during final pass):**

- **Sentence-start "Your" → "Yo".** Mid-sentence "your" → "ya". "Yo 5,000 followers", "ya wallet", "ya numbers".
- **Verbs gain "up" where natural.** "fill your screen" → "fill up ya screen". Only add "up" when the verb naturally takes it.
- **Compound AAVE negation + future:** "never see" → "aint never gon see". Triple-stacking ain't + never + gon for "what people won't get" lines.
- **Sentence-start fillers:** "Yea", "But", "And" for spoken transitions. Use sparingly, not on every line.
- **Expand compressed parallels when they sound like slogans.** "The fan math beats the label math" → "The math of the fans is better than the math of the label." Read it aloud — if it sounds like a slogan a writer wrote, expand it into how someone would explain it at a kitchen table.

## Output Format

For every topic, output in this exact order with these exact headers. **Caption and script come first** so Josh can copy them straight to the post and the recording app without scrolling. Never use the word "teleprompter" — Josh doesn't read from one. The clean spoken section is labeled **SCRIPT**; the version with bracketed stage directions is **SCRIPT WITH VISUALS**.

```
## [TOPIC NAME]

**CAPTION:**

[SUGGESTED TITLE — the strongest of the 5 options below, picked by the writer]

Link in bio to [holy grail outcome from this specific script] with CRWN. Free to start at thecrwn.app.

---

**SCRIPT:**

[Clean spoken words only. No brackets. No visual cues. No section labels. Just what comes out of your mouth, top to bottom, ~150-170 words.]

---

**TITLES (suggested is in CAPTION above; alternates below):**
1. [Title] -- Structure [#]  ← SUGGESTED
2. [Title] -- Structure [#]
3. [Title] -- Structure [#]
4. [Title] -- Structure [#]
5. [Title] -- Structure [#]

**TOPIC:** [one line summary]

---

**SCRIPT WITH VISUALS:**

**HOOK:** [script with bracketed stage directions]

**FORESHADOW:** [script with bracketed stage directions]

**RISING ACTION:** [script with bracketed stage directions]

**TWIST:** [script with bracketed stage directions]

**PAYOFF:** [script with bracketed stage directions]

---

**NANO BANANA PRO PROMPT:**

[Full prompt following the exact template above. Describe every element on the finished sheet.]

---

**PAN ORDER:**

1. [first thing the camera pans to]
2. [second]
3. [third]
... [continue in the order the script reads them aloud]
```

After saving, also print this exact block to the chat so the user can copy it without opening the file. The caption-and-script-first ordering applies to both the saved file and the chat output.

## Caption Rules

- Start with the **suggested title** (the strongest of the 5 options, chosen by the writer). Do NOT use `[TITLE TBD]` — pick the one you think wins and bake it into the caption. The other 4 titles are still listed below as alternates Josh can swap to.
- Then: `Link in bio to [holy grail outcome] with CRWN. Free to start at thecrwn.app.`
- The holy grail outcome connects to THIS script's payoff specifically — not a generic CRWN line
- Examples:
  - "Link in bio to start getting paid what your music is worth with CRWN. Free to start at thecrwn.app."
  - "Link in bio to turn your fans into monthly income with CRWN. Free to start at thecrwn.app."
  - "Link in bio to keep 92% of every dollar your fans spend on you with CRWN. Free to start at thecrwn.app."
  - "Link in bio to own your audience instead of renting one with CRWN. Free to start at thecrwn.app."
  - "Link in bio to get your first paying fan today with CRWN. Free to start at thecrwn.app."

## Thumbnail (after user confirms or swaps the suggested title)

The caption ships with a suggested title baked in. After the user either confirms that suggestion or asks to swap to one of the 4 alternates, generate the thumbnail prompt below and append it to the same script file under a `## THUMBNAIL` heading. Also print it to chat. If the user swaps titles, update the caption in the file to the new title before appending the thumbnail.

```
THUMBNAIL NANO BANANA PRO PROMPT:

Flat scan of a white sheet of paper filling the entire frame. No desk, no surface, no edges visible, just white paper. Black sharpie marker handwriting filling nearly the entire page with minimal white space. [DESCRIBE THE TITLE TEXT — how it's written, where on the page, how large, any words circled or boxed or underlined]. [DESCRIBE THE MAIN ILLUSTRATION — one large simple hand-drawn image that captures the video's core concept, taking up significant space]. [DESCRIBE ANY SUPPORTING ELEMENTS — key numbers, arrows, small secondary drawings]. The background is pure white (#FFFFFF). The image is shot perfectly straight on, no angle, no shadow, no background elements. Pure white paper fills the entire 3:4 frame edge to edge.
```

The thumbnail prompt MUST replicate the selected title text verbatim on the page, plus one large central illustration that captures the video's core concept. Fill the page — minimal white space.

## Multiple Topics

If the user passes several topics separated by `|`, generate a full package for each topic. Save each to its own file. Print each block to chat in sequence with a clear divider between topics.

## Curiosity-Gap Score (MANDATORY GATE — must pass before saving)

Every script must score at least **8/10** on the curiosity-gap rubric in [SHORTFORM_SCORECARD.md](../../videos/SHORTFORM_SCORECARD.md). Two axes, 5 points each:

A real gap is a **question, not a withheld number.** The hook plants ONE specific question in the viewer's head, that exact question stays unanswered through the middle, and the FINAL line is the answer to it. Question and answer are a matched pair.

- **Question planted (0-5):** the hook plants ONE specific question the viewer needs answered **by the END of the first spoken sentence** — best when sentence 1 IS the question — built on the named subject + a concrete noun. A setup sentence followed by the question in sentence 2 or 3 is too slow and loses points. You must be able to state that question in one plain sentence. A withheld number is NOT a gap unless it answers a question the hook posed.
- **Answer held to the end (0-5):** the specific payoff that answers the question lands ONLY in the FINAL line. The answer must NOT be in sentence 2, and the specific payoff must not be stated anywhere mid-script. The middle SHOULD build context, raise the stakes, and re-pose the question (that is what keeps the viewer watching) — it just withholds the payoff. Context mid-script is fine and necessary; spilling the specific payoff is the only fail. Hold the answer as long as possible: the longer the question hangs, the lower the skip rate, which is the whole goal. Fail only if there's no question in sentence 1, the answer lands in sentence 2, the payoff is spilled before the final line, or the ending answers a different question.

**The test before saving:** name, in one sentence, the question your hook plants. Confirm the last line answers THAT question and nothing in the middle does. If you can't name the question, there is no gap — rewrite. (A statement that withholds a stat but sparks no question is the most common failure, e.g. "Carti's look spread free, clippers got nothing" makes the viewer ask nothing.)

Before saving, self-score honestly on both axes. **If the total is under 8, REWRITE. Never save a sub-8 script.** Most common failures: stating the outcome in line 1, spending the payoff number mid-script, or ending on a generic lesson the viewer saw coming.

**If the topic is a how-to / mechanic / process with no shock fact to withhold (e.g. "set your tiers", "the clipper share-ramp", "go live every session"), it is NOT a short-form video — it is warm-audience how-to and belongs in a CAROUSEL.** Flag it for the carousel pipeline rather than forcing a low-scoring video. (See memory `feedback_carousel_vs_reel_audience`.)

**The novelty / share test (skip is the GATE; SHARE is the MULTIPLIER — and they are different engines).** A perfect curiosity gap fixes retention (skip), but it does NOT get the video shared. Share comes from SURPRISE: does the final-line answer make the viewer think *"wait, WHAT?"* or *"I knew that"*? A payoff that CONFIRMS a belief the audience already holds gets ~0.5% share and caps reach at the gate, even with a flawless gap. **Real data:** #8 (ice block) and #11 (100M = spare change) both held the gap fine but landed on "he owns his masters" → 0.4–0.6% share → ~3k views; #2 reversed "a $2M deal is winning → it's a debt he owes $11M on" → 3.4% share → 117k. The held answer must REVERSE a belief or be a number they didn't see coming. **Banned as the payoff (belief-confirming AND saturated): "own your masters," "streaming pays pennies / fans pay more," "the label takes the bigger cut," "streams build the label / fans build the artist."** If the answer confirms what they already believe, re-point it to something that surprises. (See memory `feedback_shortform_performance_model`.)

## Quality Checks (run before finalizing)

- [ ] **Curiosity-gap self-score is >=8/10** (opening withholds the payoff; biggest reveal only in the last line) — per the MANDATORY GATE above. Sub-8 = rewrite, or move to a carousel if it's a how-to/mechanic.
- [ ] No "yo" / "Yo," anywhere in the spoken script
- [ ] All 5 titles are under 40 characters
- [ ] All 5 titles follow one of the 10 structures (number cited next to each)
- [ ] SCRIPT is 150-170 words spoken
- [ ] No sentence exceeds 15 words
- [ ] No em dashes anywhere
- [ ] No banned words (leverage, optimize, diversify, ecosystem, monetize)
- [ ] No "Same X. Same Y. Same Z." triplet (or longer) anywhere in the script
- [ ] PAYOFF does not contain banned closers: "That's the move/play/answer/math", "Build a free/paid tier", "Keep X cents/%", "92¢"
- [ ] PAYOFF ends on an insight line that reframes the topic, not on a how-to or CTA
- [ ] No spoken sentence trails off with a missing number — every "$___", "%___", or "for that's about ___" has the real value filled in
- [ ] No spoken comparison of sub-penny fractions — scaled to whole cents per 10/100 units instead
- [ ] No direction-ambiguous words in titles or spoken script ("outpaid", "outearned", "outperformed", "outvalued")
- [ ] Listicles count down, not up
- [ ] Free tier included in any tier structure mentioned (caption only; not spoken)
- [ ] Nano Banana prompt follows the exact template (start and end strings match)
- [ ] Pan order matches the visual elements in the script (every bracketed visual gets a pan entry)
- [ ] Caption CTA connects to THIS script's specific payoff, not a generic CRWN line
- [ ] Script never says "download CRWN" or "check out CRWN"

## Workflow

1. Parse the topic (or list of topics).
2. For each topic:
   a. Lock 5 title options that pass the structure + character checks.
   b. Pick the strongest of the 5 as the **suggested title**. Bake it into the caption.
   c. Draft the full script with visuals (HOOK -> FORESHADOW -> RISING ACTION -> TWIST -> PAYOFF).
   d. Strip brackets to produce the SCRIPT (clean spoken version). Verify 150-170 words.
   e. Build the Nano Banana Pro prompt describing every element on the finished sheet.
   f. Build the pan order from the visuals in script order.
   g. Run the quality checks AND self-score the curiosity gap (must be >=8/10 per the MANDATORY GATE). Fix any failures and rewrite anything under 8 before writing. A how-to/mechanic with no shock fact to withhold goes to a carousel, not a sub-8 video. Web-verify every hard claim per the Fact Check Protocol before saving.
   h. Assemble the file in the Output Format order: CAPTION (with suggested title) -> SCRIPT -> TITLES (5 alternates, suggested marked) -> TOPIC -> SCRIPT WITH VISUALS -> NANO BANANA PRO PROMPT -> PAN ORDER.
   i. Save to `videos/scripts/shortform/[N]-[descriptive-kebab-name].md` (use the post number from the 90-day calendar; scan the folder for the next number if unsure).
   j. Print the full output block to chat in the same order.
   k. End the chat response with a clickable markdown link to the saved file (relative path), e.g. `[12-drake-iceman-rollout.md](videos/scripts/shortform/12-drake-iceman-rollout.md)`.
3. After the user confirms the suggested title (or asks to swap to one of the 4 alternates), generate the thumbnail prompt, append it to the script file under `## THUMBNAIL`, and print it to chat. If swapped, update the CAPTION in the file to the new title first. Re-include the link to the file in that response too.

## User Argument

$ARGUMENTS
