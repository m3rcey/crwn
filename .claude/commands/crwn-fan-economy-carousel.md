# CRWN Fan Economy Carousel

Turn a Fan Economy VIDEO SCRIPT into a 4-slide Instagram carousel: a caption that condenses the
script, and four hand-drawn 3:4 slides in the same black-sharpie-on-white style as the video sheet.

## Invocation

`/crwn-fan-economy-carousel <script number, artist name, or "next">`

- `/crwn-fan-economy-carousel 1` builds the carousel for script 1
- `/crwn-fan-economy-carousel rapsody` resolves the artist to their script number
- `/crwn-fan-economy-carousel next` picks the lowest-numbered script with no carousel yet
- `/crwn-fan-economy-carousel 1 5` builds a range

**This skill never invents a case study.** It always condenses a script that already exists in
`videos/scripts/fan-economy/`. If the requested subject has no script, say so and offer
`/crwn-fan-economy` to write one first. The numbers, the artist and the claim tier were already
researched and fact-checked when the script was written; re-deriving them here is how the two
surfaces drift apart and start telling a viewer two different numbers.

## Why this is a separate skill from `/carousel`

`/carousel` invents a slide arc from a raw topic, fact-checks it from scratch, defaults to 1:1 and
picks its own slide count. This one has a fixed shape (always 4 slides, always 3:4) and a fully
determined input (an existing script). Do NOT route Fan Economy posts through `/carousel`: its
generator hardcodes 1:1 in the style instruction and uses the older API shape with no
`aspectRatio` or `imageSize`, so it cannot produce a 3:4 4K slide at all.

## The four slides

| Slide | Job | Source | Reveals the number? |
|---|---|---|---|
| 1 | The HOOK sheet, identical to the video's | **Copied** from the video sheet | **No.** The gap stays open |
| 2 | The REVEAL: the withheld variable and the math | Rendered | **Yes.** This is the payoff |
| 3 | The TAKEAWAY: the quotable line plus the benefit CTA | Rendered | No. No numbers at all |
| 4 | The `128` end card | **Copied** from a shared asset | No content |

Only slides 2 and 3 cost an API call. The other two are file copies.

**Slide 1 is COPIED, not written.** The video sheets are already 3:4 at 4K, so the generator copies
`Shortform Posts/Fan Economy/[N]-*.jpg` straight into the carousel folder. That costs nothing, and
it guarantees the carousel opens on the exact drawing the video opens on. Only write a
`**SLIDE 1 PROMPT:**` when the script has no sheet yet, and when you do, follow the sheet rules in
`/crwn-image-gen` (headline names the artist, asks in the reveal's unit, withholds the payoff).

**Slide 2 INVERTS slide 1's withholding rule.** Every sheet prompt ends with "do NOT reveal any
dollar amount, that is the video's payoff". A carousel is not a video: nobody swipes to slide 2 for
a teaser, and an unpaid carousel is a carousel people leave. So slide 2 states the withheld
variable, shows the arithmetic, and lands the Wow Factor from the script's `META:` line. Take the
numbers verbatim from that line; never recompute them here.

**Slide 3 is the TAKEAWAY and carries no numbers.** One quotable statement, large, across two
lines, with a heavy hand-drawn underline, and the Fan Economy belief the case study earned in
smaller type beneath it. It has to survive being screenshotted alone, with no slide 1 and no
caption around it, so it states a principle rather than a result. Slide 2 already owns the math;
repeating a figure here makes the pair read as one slide split in half.

Vary the statement per carousel. "You don't need to market to fans. You need a market FOR fans"
appears in every script and belongs on this slide as the SMALLER second line, but if the big line
is also the same every time then all 30 carousels end identically. Derive the big line from that
script's own Wow Factor (carousel 1: "REACH GETS YOU HEARD. DEPTH GETS YOU PAID.").

**Slide 3 also carries the CTA, and it is the BENEFIT form.** One line, in its own hand-drawn box
across the bottom: `COMMENT 'KEYWORD' FOR [what the artist gets]`. Same rule as the caption's
opening CTA, so never the tool's `name`, and the same ManyChat keyword the caption uses. Shorten
the benefit to fit the page ("FOR WHAT YOUR CATALOG IS WORTH") while keeping the same promise; a
long CTA competes with the quotable line and both lose.

This is the slide most likely to be screenshotted and reposted on its own, which is exactly why the
ask belongs here: it travels with the screenshot. The box is what keeps it readable as a separate
element rather than a third sentence of the takeaway. The CTA is still not allowed to carry a
number, so the no-numbers rule above is unchanged, and slide 4 stays silent: the 128 card has no
CTA on it, ever.

**Slide 4 is a fixed asset you never write a prompt for.** It is the same `128` end card on every
carousel in the series, copied from
`/mnt/c/Users/Josh/Desktop/nano banana references/128-end-card.jpg`. Rendering it per post would
spend an API call redrawing an identical page and give the model a fresh chance to draw it
differently each time. The canonical prompt lives in `generate-fan-economy-carousel.mjs` as
`END_CARD_PROMPT` and is used ONLY to rebuild the asset if the file is ever lost; a rebuilt card is
saved straight back to the asset path. Per `/crwn-fan-economy`, `128 👑` is a **silent signature
and is never verbally explained**, on the card or in the caption.

## The caption

The caption is the script RE-CUT, not a summary of it. That distinction is the whole rule and it
is where the first version failed: a summary states the setup then states the answer, which closes
the curiosity gap on the way past it. The script withholds, and the caption has to withhold the
same way, in the same order, in the same voice.

Target **250 to 300 words** of body, both CTAs and the CRWN plug included, or up to **340** on the roughly one caption in three or four that also carries a social-proof line. The earlier 220 to 270 figure was measured against a caption that was wrongly missing its CRWN plug. The hard ceiling is Instagram's 2,200 characters, which none of these approach. The beat structure costs more
words than a summary does; that is the trade and it is worth it.

Write these beats, in this order:

0. **The CTA, up top, naming the BENEFIT and never the product.**
   `Comment "KEYWORD" for [what the artist gets]`, for example
   `Comment "VAULT" for what your unreleased catalog is worth to your top fans.`
   Not `for the free Vault Revenue Planner`. This CTA sits ABOVE the story, so at that moment the
   reader has no idea what a Vault Revenue Planner is; a product name there asks someone to want a
   thing they have never heard of, and only an outcome can land cold.
   Take the benefit from the tool's `description` and `videoAngle` in
   `src/lib/leadMagnets/registry.ts`, phrased in the artist's own terms ("your catalog", "your top
   fans"), never the tool's `name`.
   It runs twice on purpose. Instagram truncates at the fold and most readers never expand, so a
   CTA that only appears at the bottom is one most of the audience never sees.
1. **Facts, then the question.** Open on the two concrete facts, then ask. Not the question alone:
   the facts are what make the question land. ("Curren$y put out 90+ projects. Westside Gunn put
   out 400 copies of one project. Which one's fans are actually worth more, and by how much?")
1b. **Social proof, OPTIONAL, and only ever after the question.** One line, naming exactly what
   happened: `Before the math: Snoop reposted a video I made about him, and Lyfe Jennings, LL Cool
   J, Jagged Edge and Carl Thomas follow CRWN.`
   **A caption is not a script, and this is the one place the two surfaces differ.** In a script
   proof waits for the sidenote, because the first two seconds decide whether anyone keeps
   watching. A caption is read by someone who has already stopped scrolling, so proof can come far
   earlier. What does NOT change is the order: the gap opens FIRST. The question earns the
   attention, the proof then says why this answer is worth reading, and only then does the reader
   invest in the setup. Proof above the hook would put two non-story elements (the CTA and a
   credential) ahead of the story.
   All the tiering rules from `/crwn-fan-economy` apply unchanged: a repost is a cosign, a follow
   is only a follow, a like is never evidence, and a weaker event is never upgraded into a stronger
   word. Rationed the same way, roughly one caption in three or four.
2. **The setup, one paragraph per side.** Keep the concrete details, drop the atmosphere.
3. **The turn.** "Here's the thing nobody puts side by side."
4. **The TEASE that refuses to reveal.** Name the withheld variable and point at it without giving
   it. ("Go look at what they trade for now.") Streaming gets its credit here as the discovery job.
5. **The framing line.** The short binary the whole post rests on. ("One is wide. One is deep.")
6. **The tension beat.** The founder reacting to the number without stating it. ("When the two
   numbers landed next to each other I had to sit back and look again.") This is the peak of the
   gap. Deleting it is what turns the caption back into a summary.
7. **Hold that thought: the CRWN SIDENOTE.** Three things, in order, while the answer is still
   owed. (a) the holder, (b) the SIGNATURE LINE, "You don't need to market to fans. You need a
   market FOR fans.", and (c) **the CRWN plug itself, at the script's product-truth tier**.
   **(c) is not optional and it is the one that keeps getting dropped.** A sidenote with the belief
   but no product is not a CRWN sidenote, it is a belief sidenote, and it removes the only place in
   the whole caption where the app is named. Carousel 1 shipped without it.
   Read the tier off the script's `META:` line. SHIPPED may state it plainly ("that's what CRWN is
   built around: membership tiers and a vault your top members get into"), CONCEPTUAL may not imply
   the feature exists. Keep it to one sentence: it has to read as a sidenote, never an ad break.
8. **ANYWAY.** On its own line.
9. **The RE-ASK.** Ask the hook question again, near verbatim, immediately before the payoff. This
   beat is a founder correction carried over from `/crwn-fan-economy` and it is not optional. A
   reader who scrolled past the top needs the question back in front of them to feel the answer.
10. **The reveal.** The math, in the same numbers as slide 2 and the script's `Big Reveal:`.
11. **The Wow Factor, and it needs an ENTRY PHRASE.** A turn line first, then the reframe from the
    `META:` line. Without the turn, the wow reads as one more number in the reveal and the single
    most repostable line in the post gets buried in arithmetic. The script does this too ("And the
    400 aint just worth more").
    Rotate the entry so it is not the same every post: "And here's the crazy part." / "But that
    ain't even the wild part." / "Now here's what got me." / "And it gets worse." / "That's not
    even the part that got me." Pick one that fits the finding; "worse" only when the finding is
    genuinely a loss.
12. **The pivot to the reader.** Turn the case study into their question, loss-framed.
13. **The CTA again, to close, and HERE the product is named.** By this point the reader has the
    whole argument, so the tool's real name makes the offer concrete and credible rather than
    meaningless. Same keyword as beat 0, always: it is wired to ManyChat, so **never reword or
    invent one**, read it off the script's `Lead magnet:` line. Benefit first at the top, product
    name at the bottom, one keyword across both.

**No hashtags.** Founder decision, 2026-08-20. Do not add a hashtag line, and do not scatter tags
inline either.

The fair-balance beat is not dropped, it is folded into beat 4: streaming is the discovery job and
never the villain, and the volume artist's output is what built the thing the collectors collect.
A caption that makes either side the villain fails POSITIONING section 24.

Binding copy rules, inherited and non-negotiable: **no em dashes anywhere**, mixed register in the
founder's voice, loss-framed, no cross-artist benchmarks, and artists own the RELATIONSHIP, never
the people. The claim tier on the script's `META:` line governs what the caption may say CRWN does;
a SHIPPED script may say it plainly, a CONCEPTUAL one may not imply the feature exists.

## Where things live

- **Carousel file (you write this):** `videos/carousels/fan-economy/[N]-[same-slug-as-the-script].md`
- **Source script (you read this):** `videos/scripts/fan-economy/[N]-[slug].md`
- **Shared end card:** `/mnt/c/Users/Josh/Desktop/nano banana references/128-end-card.jpg`
- **Rendered output:** `Dropbox/nano banana output/Carousel Posts/Fan Economy/[N]-[slug]/`
  containing `caption.md`, `slide-1.jpg`, `slide-2.jpg`, `slide-3.jpg`, `slide-4.jpg`

The carousel file is a sibling of the script, never appended to it. The script file already carries
one `**NANO BANANA PRO PROMPT:**` block and the sheet generator reads the FIRST such marker, so
extra prompt blocks in that file would feed the wrong prompt to the video sheet.

### Carousel file format

    # [Artist]: [concept] (carousel)

    **CAPTION:**

    [150 to 220 words, structured as above]

    [hashtags]

    ---

    **SLIDE 1 PROMPT:**

    [omit entirely when the video sheet exists; the generator copies it]

    ---

    **SLIDE 2 PROMPT:**

    [the reveal sheet]

    ---

    **SLIDE 3 PROMPT:**

    [the takeaway card]

    ---

    **SLIDE 4:** the shared 128 end card. Not a prompt: the generator copies it.

    ---

    **META:** Source script: [N]-[slug] · Big Reveal: [...] · Lead magnet: [...] + [KEYWORD]

## Rendering

    source ./load-env.sh && node generate-fan-economy-carousel.mjs [start] [end]

Existing slides are skipped, so reruns are safe; delete a slide to reroll just that one. The
generator writes `caption.md` on every run, renders at 3:4 / 4K, white-flattens the background, and
warns on any colour intrusion (a correct slide scores **0** non-greyscale pixels).

## Procedure

1. Resolve the argument to a script number. Read the whole script, including its `META:` line.
2. Confirm the video sheet exists in `Shortform Posts/Fan Economy/`. If it does, write no slide-1
   prompt.
3. Write the carousel file: caption, then the slide 2 and slide 3 prompts. Never write a slide 4
   prompt.
4. Render, then **open every slide and look at it.** The generator prints `OK` for a slide that drew
   the wrong person, the wrong number, a duplicated line or a typeset headline. Duplicated note
   boxes and misspelled long words ("1.5 MLLION") have both shipped from this pipeline already, so
   read every word on the page. See `/crwn-image-gen` for the failure catalogue.
5. Check slide 2's numbers against the script's `Big Reveal:` character by character, and confirm
   slide 3 carries no number at all. A carousel that contradicts its own video is worse than no
   carousel.
6. Report the folder path, the caption word count, and anything you had to reroll.

$ARGUMENTS
