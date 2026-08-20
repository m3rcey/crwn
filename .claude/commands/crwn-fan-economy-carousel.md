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
| 3 | The TAKEAWAY: the quotable line | Rendered | No. No numbers at all |
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

**Slide 4 is a fixed asset you never write a prompt for.** It is the same `128` end card on every
carousel in the series, copied from
`/mnt/c/Users/Josh/Desktop/nano banana references/128-end-card.jpg`. Rendering it per post would
spend an API call redrawing an identical page and give the model a fresh chance to draw it
differently each time. The canonical prompt lives in `generate-fan-economy-carousel.mjs` as
`END_CARD_PROMPT` and is used ONLY to rebuild the asset if the file is ever lost; a rebuilt card is
saved straight back to the asset path. Per `/crwn-fan-economy`, `128 👑` is a **silent signature
and is never verbally explained**, on the card or in the caption.

## The caption

The caption is the script, condensed to what survives without a voice. Target **150 to 220 words**
of body, not counting the hashtag line. Structure, in order:

1. **Hook line.** The script's opening question, near verbatim. It is the first thing truncated by
   the "more" fold, so it carries the whole post.
2. **The setup.** One short line per side of the comparison. Keep the concrete details (the numbered
   pressing, the 90 projects) and drop the atmosphere.
3. **The reveal.** The math, in the same numbers as slide 2 and the script's `Big Reveal:`.
4. **The Wow Factor.** The reframe from the `META:` line, the line that makes it worth reposting.
5. **The belief.** The Fan Economy point the case study earns, matching slide 3.
6. **The CTA.** The script's own lead magnet and DM keyword, unchanged. The keyword is wired to
   ManyChat, so **never reword or invent one**: read it off the script's `Lead magnet:` line.

Then the hashtags, on their own line.

Binding copy rules, inherited and non-negotiable: **no em dashes anywhere**, mixed register in the
founder's voice, loss-framed, streaming is the discovery job and never the villain, no cross-artist
benchmarks, and artists own the RELATIONSHIP, never the people. The claim tier on the script's
`META:` line governs what the caption may say CRWN does; a SHIPPED script may say it plainly, a
CONCEPTUAL one may not imply the feature exists.

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
