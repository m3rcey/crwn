# Video Script Writer

Write YouTube long-form video scripts (~13-15 minutes) in the CRWN whiteboard/sharpie style format.

## Instructions

When the user invokes `/video-script`, they will provide:
1. A **topic number** (1-33 from the topic list below) OR a custom topic
2. Optionally, a **CTA type**: CRWN (default) or SUBSCRIBE
3. Optionally, a **previous video script path** — if provided, the skill reads it to engineer an end-screen bridge into the close (see "End Screen Bridge" section). If omitted, write a standard close with no bridge beat.

Do NOT ask follow-up questions. Take the topic and generate the full script immediately.

## Reference Prompt

Read the full script generation prompt before writing:
`/mnt/c/Users/Merce/Dropbox/nano banana output/UPDATED_4_10_CRWN_YouTube_LongForm_Script_Prompt_v3.md`

That file contains the complete, authoritative rules. Everything below is a summary. If there is a conflict, the reference prompt wins.

## Target Avatar

Independent music artist, 22-35, with 3K-50K followers. Grinding but not seeing results. Problem-aware (~85%) or solution-aware (~15%). Content bridges them from problem-aware to solution-aware.

## Named Proxy (the artist persona)

- Default to a **male rap or R&B artist** — this is the viewer avatar.
- Give him a specific name, age (usually 22-28), genre (rap or R&B), follower/stream count, monthly income, and a day job (FedEx, warehouse, DoorDash, Uber, coffee shop, etc.). These specifics make the math and emotion land.
- The named proxy runs through every section — intro, Point 1, Point 2, the CTA setup, and the Point 3 reveal show his before/after.
- Only use a female or different genre if the user explicitly requests it.
- **No proxy reuse across the channel.** Before locking the proxy, scan the existing scripts in `/home/merce/.openclaw/workspace-crwn/videos/scripts/` for the named proxies in recent videos and pick a different name, age, and day job. Don't put two proxies at FedEx. Don't put two proxies at age 26. Repeated specifics across videos make the channel feel like the same composite character on a loop and break the illusion that these are different real artists. Pick a different city, a different shift, a different gig — overnight Walmart stocker, dishwasher at a 24-hour diner, valet at the airport hotel, security guard, line cook, ride-share at airport runs, Amazon warehouse picker. Different from anything used recently.

## Video Format

- ~13-15 minutes (~3,000-3,300 words spoken)
- White sheets of paper as visuals, black sharpie handwriting
- Creator wears RayBan Meta glasses looking down at paper
- Key words, numbers, stick figures, arrows, circles, boxes, underlines
- Pre-drawn tease sheets cut in during the intro (NOT written live)

## Pacing

- One idea per sheet break. Short sheets (1-3 sentences) for gut punches. Longer sheets (multi-paragraph) for deep dives.
- **INTRO pacing must be MORE dense** than the rest of the video — rapid-fire short beats.
- Vary sheet length dramatically so the viewer can't predict the rhythm.

## Title Rules

Under 40 characters. Must follow ONE of these 10 structures:
1. Would [modal verb] Subject _____ For _______
2. Subject Got _____ By _______
3. If Subject _____ _______, He/She/They _______ _______
4. Subject __________ed A __________
5. Every ______ _______ ___ ______
6. Subject ____ A ________ _________
7. Subject ____ ___th ______ A _________
8. _____ Vs ______
9. ______ ____ Vs ______ _____ For _______
10. _____ing Subject _______ To ______

Use "POV:" prefix for titles framed as "you". Provide 5 title options per video.

## Hook Sentence Formats

Opening line must follow one of:
- "This is _______. And this is ____________." (comma in place of the period also works)
- "This is how you _____________."
- "What happens when you ________________? Let's find out."
- "Who would __________________? _______________ vs _______________?"
- "This is __________. This is ________________. And this is __________________."
- "____________ just _____________________."
- "Has anybody ever ________________? Want to _________________?"
- "Which _____________________ was the most _________________? Let's ____________________."
- "If ______________________, then ___________________."

**Alternate hook formats across scripts.** Do not use the same hook format two videos in a row. Before locking the hook for a new script, scan the most recent scripts in `/home/merce/.openclaw/workspace-crwn/videos/scripts/` (read sheet 1 of each) and pick a format that wasn't used in the last 1-2 videos. The hook is the first thing the viewer hears every video — if every script opens "This is X. And this is Y." the channel develops a sameness and the hook stops landing. Rotate.

## The Intro Structure (4 Steps, Exact Order)

1. **HOOK SENTENCE + REITERATION** — Hook using one of the hook formats. Tease the MOST IMPORTANT point (point 3). Immediately follow with exactly 1 short sentence expanding on point 3: "In this video you're going to see [point 3 in plain terms]." That's it. No extra hype, no "they'll be the only ones left standing." One sentence. The hook does the heavy lifting.
2. **TEASE REMAINING POINTS** — Tease points 2 and 1 only (point 3 is already covered by the hook). **Each tease is exactly 1 sentence.** Use natural conversational connectors: "I'll also show you..." for point 2, "And I'll show you..." for point 1. These should feel like additions to a conversation, not rigid structural beats. **Every tease must clearly connect back to the video's title/topic.** If the title is about AI, the word "AI" should appear in the teases. Generic teases lose the viewer.
3. **ROADMAP + PROGRESSION STATEMENT** — Stairs ascending left to right. Bottom = least important, Top = most important. Each step has icon + label. Stick figure climbing. NO boxes, circles, highlighting, or crossing off. Roadmap is ALWAYS STATIC.
   - Progression statement: "From [point 2] to [point 3], [varied phrase]. But first: [point 1 described conversationally, not just named]." The transition into point 1 should feel natural and spoken, not like a label. End with something like "Let's talk about it."
   - Condense point names for the progression statement (short phrases, not full tease sentences).
4. **BEGIN POINT 1** — Circle point 1 on the roadmap stairs. Start covering it.

**CRITICAL:** Tease phrasing sets the language for the entire script. Roadmap labels, transitions, and references must use recognizably similar language to the original teases.

### Descriptor Consistency (CRITICAL — most-corrected rule)

Each of the three points gets **ONE descriptor phrase** that gets used **verbatim, byte-for-byte identical** every time that point is referenced. Do NOT paraphrase or vary the wording across sections. The repetition is intentional — it creates callback, reinforcement, and memorability.

The descriptor must appear identically in all four locations:

1. **Intro tease** — "In this video you're going to see [Point 3 descriptor]." / "Also, [Point 2 descriptor]." / "And [Point 1 descriptor]."
2. **Roadmap progression line** — "From [Point 2 descriptor] to ultimately [Point 3 descriptor]..."
3. **End-of-Point-1 foreshadow** — "But later in this video I'm going to show you [Point 3 descriptor]."
4. **Transition from Point 1 → Point 2** — "For now, we gotta get into [Point 2 descriptor]."

Worked example (from the TikTok-artists-broke script):

- **Point 2 descriptor:** "the math that turns fifty million views into grocery money"
  - Tease: "Also, the math that turns fifty million views into grocery money."
  - Roadmap: "From the math that turns fifty million views into grocery money to ultimately..."
  - Transition from P1: "For now, we gotta get into the math that turns fifty million views into grocery money."

- **Point 3 descriptor:** "the one move every TikTok artist actually making a living has already made"
  - Tease: "In this video you're going to see the one move every TikTok artist actually making a living has already made."
  - Roadmap: "...to ultimately the one move every TikTok artist actually making a living has already made..."
  - Foreshadow at end of P1: "But later in this video I'm going to show you the one move every TikTok artist actually making a living has already made."

When writing a new script, lock the three descriptors BEFORE writing the body. Keep them in the header. Reuse them byte-for-byte. If you catch yourself rewriting "the math" into "the money math" or "why X doesn't pay rent" — stop. Use the exact phrase.

The descriptors must be **descriptive mini-premises**, not reductive labels. Good: "what AI is doing to your royalties" / "the one thing AI can never fake" / "why fifty million views doesn't pay rent." Bad: "the money math" / "the royalty problem" / "the AI flood."

## Content Ratio

- ~15% hook + tease + roadmap (sheets 1-3)
- ~20% problem framing (sheets 4-5)
- ~45% solution arc with reversals (sheets 6-10)
- ~20% close + transformation (sheets 11-12+)

## 23 Structural Principles (Summary)

1. **Hook + Tease + Roadmap** — Follow the 5-step intro structure exactly.
2. **Escalation** — Every sheet bigger than the last in at least one dimension.
3. **Zigzag Arc with Reversals** — At least one "rug pull" where the obvious solution breaks.
4. **Open Loops** — Never close a loop without opening a new one first. Always 2+ unresolved threads.
5. **Scenarios, Not Statements** — Never introduce numbers directly. Set up a scenario first.
6. **Re-Anchor Key Concepts** — Briefly re-anchor earlier concepts before building on them.
7. **Emotional Contrast** — Alternate register every 2-3 sheets (data vs. personal/funny).
8. **Living Numbers** — Key revenue numbers move: go up, get threatened, drop, recover, grow.
9. **Running Total** — Viewer unconsciously tracks a scoreboard. Two numbers in opposite directions ideal.
10. **Dilemma Engine** — At least one decision that splits the audience.
11. **Cost of the Prize** — After showing the math, show the cost of making it work. Churn, effort, consistency.
12. **Emotional Anchor at Midpoint** — Stop math. Ask "why does this matter?" Show what the money means for one person.
13. **Named Proxy** — At least one named example artist followed across multiple sheets. Deepening relationship arc.
14. **Real Setback** — One real setback where the model is tested and the artist considers quitting.
15. **CTA Placement** — One block inside point 3. After bridge sentence, before reveal. See CTA section below.
16. **Urgency Clock** — Frame inaction as a ticking clock with specific dollar amounts lost. **Weave this INTO Point 2 or Point 3 — do not give it its own section/sheet.** The arc goes directly Point 3 → Close → End Screen Bridge with no standalone URGENCY beat between them.
17. **Visceral Before/After** — Walk the viewer through the old model AFTER they've seen the new one work.
18. **Close = Callback + Echo + Question in one beat.** No separate callback/echo sheet. The close itself calls back to the hook language, echoes it with transformed meaning, and ends on a question. One tight sheet. Not three separate concepts spread across multiple sheets. **If a previous video is chained (see principle 24), the closing question mirrors the previous video's TITLE — not its peak line. The chain hands off at the title level.**
21. **Vary Sheet Length** — Some sheets 30-second gut punches, others 3-minute deep dives.
22. **Point Transitions** — NO separate transition sheets between any points. All transitions live inside the points themselves:
   - **After Point 1 (into Point 2):** Foreshadow + bridge lives at the END of Point 1 as one flowing paragraph. Foreshadow point 3 with mystery and specificity ("the one thing [proxy] has that no AI will ever have. It's not talent. It's not even the music."), tease the payoff, then bridge conversationally into point 2: "For now we gotta get into [point 2]..." Trail off naturally.
   - **After Point 2 (into CTA/Point 3):** Point 2 ends with clean open questions ("What is it? And can [proxy] do it too?") that flow directly into a one-line CTA segue, then straight into the CTA. The segue beat is fixed — acknowledge the question, tell them you'll get to it, pivot into the CTA — but the **exact wording must be different every script**. Don't reuse "I'll reveal that in a second. But first, let me put you onto something." in two videos in a row. Variations: "Hold that question for a second. There's something you gotta see first." / "Stay with the question. Quick thing first." / "Don't go nowhere — I want to put something on your radar before I answer that." / "Pause on that. Got something to show you." Pick a fresh phrasing every script. No roadmap hype sheet. No restating the question. The open questions ARE the setup for point 3. **After the CTA ends, pick up where Point 2 left off — "Back to [question]..." and reveal. Do NOT restate or recap Points 1 and 2 after the CTA. The viewer's memory is fine; the recap kills the momentum.**
23. **3 Major Points** — Point 3 must ANSWER the question the viewer is most curious about. It's the reveal.
24. **End Screen Chain** — If a previous video script is provided, the close and the bridge beat that follows are engineered together:
   - Read the previous video's **title** — this is the question the close hands off to.
   - Read the previous video's **Point 3 peak** (the single reveal sentence) — this is the eventual reward inside that video, not the verbatim answer to the close's question.
   - Read the **problem the previous video's Points 1-2 establish** (the pain Point 3 solves).
   - The current video's CLOSE plants that exact problem as the stakes (through the lens of the current topic) and ends on a question that mirrors the previous video's title. If the title is already a question (most are), use that same question or a near-match.
   - A BRIDGE BEAT follows the close as a separate sheet: 1-2 sentences nodding to the previous video. No sell. No "watch till the end." The previous video's own Point 3 structure forces watch-through.
   - Rule check: If the closing question could be fully satisfied in the first 30 seconds of the previous video, the pairing is too loose — the satisfying answer should require watching most of the video, even though the question itself just mirrors the title.

## Video Structure (The Arc)

**SHEETS 1-3: THE INTRO (0-2 min)** — Follow the 5-step intro structure.

**POINT 1 - THE FOUNDATION (2-6 min)** — Least important but compelling. Introduce named proxy. Scenarios not statements. Deep: scenario, step-by-step math, relatable comparison, question before answer. End with a foreshadow of point 3 (mysterious, specific) that flows into a conversational bridge to point 2. Trail off naturally. No separate transition sheet.

**POINT 2 - THE TURN (6-11 min)** — Middle point. Obvious solution introduced then broken (rug pull). Emotional anchor at midpoint. Living numbers. Dilemma. Cost. Walk through someone trying the obvious fix and watching it fail. End with clean open questions ("What is it? And can [proxy] do it too?") that flow directly into a one-line CTA segue (fresh phrasing every script — see Principle 22 for variations). No separate transition sheet. No restating the question.

**POINT 3 - THE PEAK (11-13 min)** — CTA block first (right after "I'll reveal that in a second. But first."). Immediately after the CTA, go straight back to the question and reveal. **No recap of Points 1 and 2 between the CTA and the reveal.** The viewer just heard those points — restating them slows the payoff. Use the WILL_AI pattern: "Back to the question. [Question]? [One-line reveal]." Not the MUSIC_LEAST pattern of summarizing before revealing. Then proof/math. Any urgency / before-after / "cost of waiting" beats live INSIDE Point 3 — not as a standalone section. Each point ~4-5 minutes deep.

**THE CLOSE (12-15 min)** — TIGHT. One sheet. 3-5 sentences max. Calls back to the hook, echoes its language with transformed meaning, ends on a question. All in one beat. No separate callback sheet before it. **No URGENCY section before it** — Point 3 flows straight into Close.

**END SCREEN BRIDGE BEAT (last 20-25s)** — If a previous video is chained, a separate 1-2 sentence sheet follows the close: one line naming the previous video as the answer to the close's question. See "End Screen Bridge" section. Omit entirely if no previous video is provided.

## Depth Per Point

Each point ~4-5 minutes, NOT 1-2 minutes. Every point must:
- Set up a scenario BEFORE revealing the number
- Show math step by step
- Include a real or composite example
- Ask a question or dilemma before giving the answer
- Let emotional beats breathe
- Compare to something relatable

## Intra-Point Foreshadowing

Within each point, foreshadow its payoff with 1-2 micro-foreshadows:
- "And that number? It gets worse. But first let me show you why."
- "There's a reason this happens and it's not the one you think."
- "Stay with me here because in about 60 seconds this is going to flip."

## CTA Section (Inside Point 3)

**Placement:** Right after bridge sentence into point 3, BEFORE the reveal.

**Flow:**
1. Roadmap transition + bridge sentence into point 3 (state the question)
2. One-line CTA segue (fresh phrasing every script — never reuse "I'll reveal that in a second. But first, let me put you onto something." in two videos in a row) -> FULL CTA (one block):
   - What CRWN is
   - Free tier: artist page, music hosting, community, free tier for fans, paid tiers when ready
   - AI manager: tells you what to do next, catches fans before they leave, identifies top spenders
   - Say CRWN. Say thecrwn.app.
3. "Back to [question]..." -> REVEAL/CLIMAX
4. Proof/math after the reveal
5. Tight close (3-5 sentences)

**CTA: SUBSCRIBE variant** — Same placement. Instead of CRWN features: "subscribe because the next video goes even deeper into [tease next topic]."

### CTA Wording Rule (CRITICAL)

The CTA block uses the **same structural beats** every video (bridge into CTA → "imagine/picture" opener → "that's CRWN" → artist page → music + community → free fans → paid tiers + pricing → AI manager intro → 3 capability lines → "never sleeps / never takes a percentage" → thecrwn.app → link in description) — but the **exact wording must be fresh every script**.

Do NOT copy the CTA verbatim from the previous script. Viewers who watch multiple videos will hear the identical ad-read and tune out. Rewrite every beat with different phrasing while keeping the same beat order and the same factual points.

Examples of acceptable variation for the same beat:
- "Imagine having your own place." → "Picture a home that doesn't run on somebody else's algorithm." → "What if the people watching your videos actually belonged to you?"
- "That's what CRWN is." → "That's CRWN." → "CRWN does that."
- "It catches fans before they leave." → "It pings you when a fan is slipping away so you can win them back." → "It flags the fans going cold before they ghost."

The factual content stays locked (free tier, paid tiers at $14.99/$29.99, AI manager with three capabilities, thecrwn.app, link in description). The phrasing flexes. If the previous script said "imagine having your own place" — this script can't open with that. Same for every line.

## End Screen Bridge (Last 25-30 Seconds)

Only applies when a **previous video script path** is provided as input. YouTube's end-screen card is placed center-frame during the last ~20 seconds — the close + bridge beat must both prime the viewer to click it.

### Step 1: Extract from the previous video

Before drafting the close, read the provided previous video script and extract:
1. **The previous video's title** — this is the question the chained video promises to answer for the viewer who clicks the end screen.
2. **Point 3 peak line** — the single sentence that is the reveal/climax (e.g., "Your process. Not your song. Your process."). This is the *internal* payoff the next video delivers, not necessarily the verbatim answer to the close's question.
3. **The problem Point 3 solves** — the pain established in Points 1-2 of the previous video (e.g., "AI floods platforms with finished content; finished songs are indistinguishable from real artists'")

### Step 2: Engineer the CLOSE (one sheet, 3-5 sentences)

The close must do all three:
- **Callback** the current video's hook language (transformed meaning)
- **Plant the previous video's problem** as the urgent stakes, filtered through the current video's topic
- **End on a question that mirrors the previous video's title.** The chain hands off at the title level, not the peak level. If the next video's title is already a question ("Why Are TikTok Artists Broke?", "Will AI Replace Musicians?"), the close ends on that exact same question (or a near-match). The viewer just heard you ask the title — clicking the end screen feels like the obvious next move. The Point 3 peak inside that next video is the eventual reward, but it is NOT what the close's question literally answers to. Don't engineer a question whose verbatim answer is the peak line — that's too tight and usually phrasing-twisted. Match the title.

### Step 3: Write the BRIDGE BEAT (one sheet, 1-2 sentences)

- One line nodding to the previous video. No sell. No "watch till the end." No explanation of what it answers.
- Examples: "Last video I dropped answers that." / "Covered that in my last video."
- The viewer's curiosity + the previous video's own Point 3 structure handles watch-through. Do not oversell.

### Worked Example

Current video topic: "Why are TikTok artists broke?"
Previous video (chained): **"Will AI Kill Musicians?"** ← title is the question the close hands off to
Previous Point 3 peak: *"Your process. Not your song. Your process."* (internal reward, not the literal answer to the close)
Previous Points 1-2 problem: *AI floods platforms with finished songs; finished output is worthless because it's indistinguishable from AI.*

CLOSE:
> "TikTok artists aren't broke because the music's bad. They're broke because all anyone sees is the finished post. And finished posts are what AI makes in eleven seconds. So is AI about to kill musicians for good?"

BRIDGE BEAT:
> "Last video I dropped answers that."

Why it works: "broke" callbacks the current hook (reframed from *no money* → *no moat*). "Finished posts / AI makes in eleven seconds" plants the previous video's problem. The closing question "Is AI about to kill musicians for good?" mirrors the previous title "Will AI Kill Musicians?" — the viewer just heard the question and the end-screen card is the obvious place to get the answer.

### Second Example (current-video chains to a question-titled video)

Current video: "Can 500 Fans Make You $100K?"
Previous video (chained): **"Why Are TikTok Artists Broke?"**

CLOSE:
> "A thousand true fans was the answer Kevin Kelly gave in 2008. Five hundred is the answer now. Which means most TikTok artists with thousands of fans should already be rich. So why are they broke?"

The closing question "So why are they broke?" is a verbatim mirror of the previous video's title.

### Pairing Workflow

Pick the end-screen video FIRST. Then write the current video's close so its final question mirrors the end-screen video's title. If the title is a statement (rare for this channel), pose the question that title implicitly answers. If the close's question could be fully satisfied in the first 30 seconds of the previous video, the pairing is too loose — pick a different end-screen video where the title's question genuinely takes the full video to answer.

If no previous video is provided, write a standard close (callback + echo + question) and omit the bridge beat entirely.

## Readability

- 5th grade reading level
- No sentence longer than 15 words
- No word longer than 3 syllables (except common music terms like "subscriber")
- Never use: leverage, optimize, diversify, ecosystem, monetize
- Never use em dashes
- Use "you" and "your" constantly

## Style

- MrBeast pacing: short punchy sentences, constant momentum, no dead air
- Shared discovery tone: "here's where it gets interesting," "I didn't expect this part"
- Talk like a friend who figured it out first. Not a teacher. Not a brand.
- **Write how people actually talk, not how writers write.** Use simple repetitive sentence structures ("He makes rap music. He makes his own beats. He writes his own bars.") instead of compressed clever phrasing ("Makes hip-hop. Produces his own beats. Writes every word."). The spoken version sounds like a person. The written version sounds like a bio.
- **Voice register matches the proxy.** The default proxy is a Black male rap or R&B artist, and the script gets read aloud in that voice. Drop into spoken Black English where it lands naturally — "ya" instead of "your", "em" instead of "them", "was" where it sounds true ("if you was a fan of a artist"), "chasin" instead of "chasing", "ain't", contracted negations, "no more" for emphasis ("you don't live in 2008 no more"). Apply heaviest in Point 1 setup, the proxy's day-to-day, and emotional beats. Keep the CTA, the math callouts, and the close in neutral voice so the brand line and the numbers stay clean. Don't caricature — write it the way the artist would actually say the line, not a stylized version of it. If the user explicitly requests a different proxy (female, non-Black, different genre), match the register to that proxy instead.
- **Cut unnecessary elaboration.** If one sentence does the job, don't use three. "Fifty thousand songs that took no effort" is better than "No late nights. No writer's block. No choosing between rent and studio time."
- Real numbers and simple math (streaming pay rates, subscription income)
- **Number formatting shifts by section.** Front half (intro through Point 1 and the emotional anchor): spell numbers out for prose flow — "a hundred grand", "thirty bucks", "five hundred fans", "month nine". Back half (Point 2 math reveal onward, Point 3 proof, anywhere the script gets numeric-dense): switch to digits and symbols — "$15", "$30", "$50", "$84k", "92%", "month 9", "211 middle tier". Digits scan faster on the teleprompter and let the numbers pop visually when the script is doing math. Keep it consistent within a sheet — don't mix "ninety-two percent" and "92%" in the same sheet. Time/age references (twenty-six, two thousand eight, four in the morning) stay spelled out throughout because they read as prose, not data.
- **Streaming rate spoken phrasing:** Spotify pays $0.003/stream. When spoken in voiceover, phrase it as **"about a third of a penny per stream"** — never "point zero zero three dollars" (clunky) or "point zero zero three cents" (mathematically wrong by 100x). Alternate acceptable phrasing: "about three cents per thousand streams."
- Never say "today I want to talk about"
- Listicles count DOWN (5, 4, 3, 2, 1), best saved for #1
- Tier structures always include a free tier as entry point

## Output Format: Teleprompter Script Only

The output is the **spoken script only**. No visual directions, no Nano Banana prompts, no [Sheet:] or [Add:] brackets. Just the words to be read while recording.

Use all 23 structural principles, the intro structure, escalation, open loops, named proxy, reversals, CTA placement, etc. to WRITE the script. But the output is clean spoken words organized by sheet, easy to read aloud.

Format each sheet as:

```
SHEET [#] OF [X]: [SECTION NAME]

[Spoken words for this sheet. Clean text. No brackets. No visual cues.]
```

Separate sheets with `---`. The sheet breaks tell the creator when to change visuals, but no visual directions are included.

## Topic List (ordered most controversial to least)

1. If you do not own your audience, you are not independent
2. Most independent artists are platform employees without a salary
3. If a platform owns your access to fans, you do not have a business
4. If nobody pays you directly, your audience is not real in the only way that matters
5. Viral artists with no monetization are just free labor for platforms
6. Streams are one of the biggest traps ever sold to artists
7. Artists were taught to chase streams because streams benefit platforms, not artists
8. The industry trained artists to chase visibility instead of ownership
9. Most of what artists call growth is just platform dependence
10. Artists without community are disposable no matter how good the music is
11. Community is more valuable than talent in today's market
12. Better music loses to better positioning every day
13. Most underrated artists are just badly positioned
14. If the market cannot place you, it will erase you
15. Artists who give everything away train fans to value them at zero
16. Music is becoming the least valuable part of the offer
17. The real premium product is access, not audio
18. Fans stay for identity more than music
19. Versatility is often just a lack of identity
20. If people cannot explain who you are, you are forgettable
21. The more manufactured you look, the cheaper you will feel
22. Authenticity is becoming the rarest asset in music
23. AI will make realness feel luxurious
24. The most polished artists will become the least believable
25. Fans will stop rewarding perfection because perfection looks fake
26. Trust will outrank talent
27. If you cannot show your process, people will assume you did not really make it
28. In the AI era, finished songs without proof will look fake
29. Hiding your process will become creative self-sabotage
30. "I made this" is becoming a worthless claim without evidence
31. Creative proof of work is coming whether artists like it or not
32. If you cannot document authorship, your art loses value
33. If your fans do not talk to each other, you do not have a movement

## Full Output Format

```
TITLES (pick one):
1. [Title] -- Structure [#]
2. [Title] -- Structure [#]
3. [Title] -- Structure [#]
4. [Title] -- Structure [#]
5. [Title] -- Structure [#]

TOPIC: [one line summary]
NAMED PROXY: [Name and one-line bio]
CTA: [CRWN or SUBSCRIBE]
END SCREEN VIDEO: [title of previous video chained, or "none"]
END SCREEN PAYOFF LINE: [the previous video's Point 3 peak line verbatim, or "n/a"]
TOTAL SHEETS: [number]
ESTIMATED RUNTIME: [minutes]

ROADMAP (top = most important, bottom = least important):
3. [most important label] (the peak)
2. [middle label]
1. [least important label] (where we start)

---

SHEET 1 OF [X]: [SECTION NAME]

[Spoken words only. No visual directions.]

---

SHEET 2 OF [X]: [SECTION NAME]

[Spoken words only. No visual directions.]

---

[continue for all sheets, ending with:]

---

SHEET [X-1] OF [X]: CLOSE

[3-5 sentence close. Callback + echo + question. If chained: question's one-line answer = previous video's Point 3 peak line.]

---

SHEET [X] OF [X]: END SCREEN BRIDGE

[1-2 sentence bridge beat. Only include if a previous video is chained. Example: "Last video I dropped answers that." Omit this sheet entirely if no previous video was provided.]
```

## Workflow

1. Take the topic (number or custom).
2. **If a previous video script path is provided:** read it first. Extract the Point 3 peak line (the reveal sentence) and the problem Points 1-2 establish. These shape the close and bridge beat.
3. Keep the main claim intact.
4. Expand into 3 distinct subtopics that strengthen the claim (different angles, not repeats).
5. Use the main claim + 3 subtopics to build the full script.
6. **Engineer the close:** callback the current hook + plant the previous video's problem as stakes + end on a question whose one-line answer IS the previous video's Point 3 peak line verbatim.
7. **Add the bridge beat** as a separate final sheet: 1-2 sentences nodding to the previous video. No sell.
8. If no previous video was provided, write a standard close and omit the bridge beat sheet entirely.
9. Do not water the idea down.
10. Do not combine with other topics unless told to.
11. Output the full script in the exact format above.

## Output Location

Save the script to: `/home/merce/.openclaw/workspace-crwn/videos/scripts/[TOPIC_SHORT_NAME]_SCRIPT.md`

## Reference Scripts (ground truth for pattern)

Read at least one of these before writing a new script — they embody every rule in this skill:
- `/home/merce/.openclaw/workspace-crwn/videos/scripts/WILL_AI_REPLACE_MUSICIANS_SCRIPT.md` (long-form, ~16-17 min, ~2,600 words)
- `/home/merce/.openclaw/workspace-crwn/videos/scripts/WHY_ARE_TIKTOK_ARTISTS_BROKE_SCRIPT.md` (long-form, ~16-17 min, ~2,600 words)
- `/home/merce/.openclaw/workspace-crwn/videos/scripts/MUSIC_LEAST_VALUABLE_PART_SCRIPT.md` (short-form)

## User Argument

$ARGUMENTS
