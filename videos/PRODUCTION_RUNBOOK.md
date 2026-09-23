# Fan Economy video: the Claude half of the run

This is the filmed-sheet series (print the sheets, film them on the clipboard), not the
automated motion pipeline in [docs/VIDEO_PIPELINE.md](../docs/VIDEO_PIPELINE.md). Both exist and
they are different products.

Four steps are Claude's: **ideas, script, sheets, caption.** Only those are written out. Your
steps are listed so the order reads straight, and nothing here tells you how to do them.

| # | Step | Owner |
|---|------|-------|
| 1 | Pitch a batch of ideas | Claude |
| 2 | Cull to the ones worth building | Josh |
| 3 | Write the script | Claude |
| 4 | Generate the 5 sheets, compile the print PDF | Claude |
| 5 | Record the voice note | Josh |
| 6 | Adobe Podcast: enhance, delete the bad takes, download the wav | Josh |
| 7 | FL Studio vocal chain, export | Josh |
| 8 | Premiere JSX chop, then nudge the pacing | Josh, with Claude in a chat |
| 9 | Film the printed sheets | Josh |
| 10 | Assemble, music, riser, app overlays, CTA clip | Josh |
| 11 | Write the caption | Claude |

---

## Step 1. Ideas

    /crwn-fan-economy-ideas 10
    /crwn-fan-economy-ideas 10 women in R&B
    /crwn-fan-economy-ideas 10 live experiences

The batch is written to [videos/ideas/fan-economy/](ideas/fan-economy/) as `batch-NN.md`
**before** it is shown to you, so a closed session never loses the list. Batches 01 to 04 exist,
so the next one is `batch-05.md`. When you pick, the `PICKED` and `PASSED` lines in that file are
edited in the same turn. That file is the only record of what was pitched and what was rejected.

Claude never writes a script or renders art in the same turn as a pitch list. You cull first.

What already binds the pitches, so you do not have to police them:

- At least half of every batch is a versus, and the SUBJECT is always an ICP artist. A megastar
  or a platform can be the foil, never the subject.
- Hip hop and R&B only. A great public number does not buy ICP fit, which is why Vulfpeck and
  Cory Wong were verified and still dropped.
- Gender is counted on the pitch list of 50, not on the ten picks, or the batch comes out male.
- The central problem has to get WORSE once the artist already sells. If it applies equally to
  somebody with 2,000 followers who has never sold anything, it is not the series.

Ask for a narrowed focus when you want a specific mechanism on camera. That is the one lever
here worth using.

## Step 2 is yours.

## Step 3. Script

    /crwn-fan-economy <the pick, or the batch line number>

Writes `videos/scripts/fan-economy/NN-slug.md`. 58 scripts exist and the highest number is 59, so
the next is 60. The file carries, in this order: `**SCRIPT:**`, then
`**NANO BANANA PRO PROMPT:**` through `5`, then the `**META:**` line.

Two things in that file matter downstream and are easy to lose sight of:

- **`SCRIPT:` is what you read into the voice note.** Its sentence and beat boundaries are also
  the pacing source of truth in step 8, so a line break there is not cosmetic.
- **`META:` carries `Hook promise:`** plus the sourced figures. Write reveal counts as FIGURES,
  not words. The contract test reads META, so "three albums" is invisible to it and `3` is not.

Facts are verified BEFORE the script is written and cited in META, including the foil's number in
a versus. No honest same-unit number for the foil means it is not a versus, and it gets written
as a single-artist case study instead of forced.

The gates run locally and fail loudly:

    npm test                                    # fanEconomySkillContract + carousel contract
    source ./load-env.sh && npm run verify:flags   # before any "CRWN has this" claim

Flags get probed rather than remembered, because the cached table went stale in both directions
once and reached saved scripts: it called a live feature dark and a dark feature live.

## Step 4. The five sheets and the print PDF

    source ./load-env.sh
    node generate-fan-economy-images.mjs 60          # one script
    node generate-fan-economy-images.mjs 60 62 71    # exactly those three
    node generate-fan-economy-images.mjs 60-65       # an inclusive range

Bare numbers are a LIST and a range is written with a hyphen. Pasting a filming list as bare
numbers used to silently render everything in between. Existing files are skipped, so rerunning
a batch only fills the gaps.

Five sheets per video, and the order is the filming order:

| Sheet | File | What it is |
|-------|------|-----------|
| 1 | `NN-slug.jpg` | The hook. Withholds the payoff. No bottom takeaway. |
| 2 | `NN-slug-2.jpg` | The middle. Reveal still withheld. |
| 3 | `NN-slug-3.jpg` | The CRWN plug. The ONLY sheet that letters CRWN, in sharpie capitals, no logo, no number. |
| 4 | `NN-slug-4.jpg` | The reveal. |
| 5 | `NN-slug-5.jpg` | The comment CTA and the lead magnet, loss framed. The only sheet that may say COMMENT. |

Videos 1 to 9 predate the plug sheet and run four (2 = middle, 3 = reveal, 4 = CTA). Both shapes
are legal because the gate is written by position from the end, not by sheet number.

Output lands in `Dropbox/nano banana output/Shortform Posts/Fan Economy`. Sheets render at 4K
(about 436 DPI on letter) with 4:4:4 chroma, because a zoomed lens on printed paper is a
magnifier on the pixel grid and on JPEG edge fringing. Never copy that resolution to the app
asset generators, which ship WebP sized to their slot.

**Open every sheet before it goes to the printer.** The generator's colour and white-background
checks catch a reference photo leaking colour; they cannot catch taste or arithmetic. Seen and
fixed by rerolls: an invented word lettered on an object, hair drawn unfilled so dark locs read
blond, nine map pins for a reveal of ten cities. Count every countable object on a reveal sheet,
and read sheet 1 as a stranger to confirm it does not answer its own question.

Then compile:

    node build-fan-economy-pdf.mjs 60 60     # one video
    node build-fan-economy-pdf.mjs 60 65     # a filming batch

The JPEG bytes are copied into the PDF verbatim, no resample and no re-encode, and pages come out
in (video, sheet) order, which is the order you film them. Print that.

**Which lines film on which sheet.** The sheets were cut on the script's own beat boundaries, so
the sheet changes, and therefore the camera shakes, are already written into the script file. The
anchors are fixed text, not a judgement call:

| Sheet | Starts at | Ends at |
|-------|-----------|---------|
| 1 | The first line | `Let's find out.` |
| 2 | The line after it | The line before the sidenote paragraph |
| 3 | The sidenote paragraph, the one carrying the market FOR fans line | `ANYWAY.` |
| 4 | The line after `ANYWAY.` | The line before `I built a free ...` |
| 5 | `I built a free ...` | `Comment X and I'll DM you the link.` |

Say the sheet number in the room before each take and the assembly order in step 10 is decided
before you shoot, not after.

## Steps 5 to 10 are yours.

Step 8 is the one place Claude still sits inside your half of the run: the JSX that chops the
clips is rebuilt in a chat each time, and its output still needs a nudge on every clip. Worth
knowing why that nudging never goes away on its own. The JSX has ONE silence threshold, and one
threshold cannot express two different pauses. The gap inside a sentence and the gap between two
beats are both silence and they are not the same pause, so trimming both to one number reads as
too quick in some places and too slow in others. The information the cut needs is not in the
amplitude, it is in the script's sentence and beat structure. Ask for it as a script rather than
a chat whenever you want that fixed; it needs the current .jsx, one finished wav, and the
sequence frame rate.

## Step 11. The caption

    /crwn-fan-economy-carousel 60

One command writes the caption and the four carousel slides for script 60, because the caption is
a condensation of the script and both surfaces have to tell a viewer the same number. It never
invents a case study: the artist, the figures and the claim tier are read off the script's META,
already researched. If there is no script yet, there is no caption yet.

The caption itself is the `**CAPTION:**` block of
[videos/carousels/fan-economy/](carousels/fan-economy/)`<slug>.md`. 31 exist. That is the source,
and it is what to edit.

**The caption exists twice, and editing the source does not change the post.** The copy any
publisher reads is the derived `caption.md` inside the generated folder under
`Dropbox/nano banana output/Carousel Posts/Fan Economy/<slug>/`, and
`generate-fan-economy-carousel.mjs` is the only thing that copies one to the other. On 2026-08-26
all 31 sources were correctly under the limit while nine derived copies were still over, because
nobody re-ran the generator after the edit. **After any caption edit, re-run it.** It is free and
safe when the slides already exist: it rewrites every `caption.md`, skips existing images, and
makes no API call.

Instagram REFUSES a caption over 2,200 characters, so an over-length one cannot be posted by any
tool. The generator prints each caption's character count and re-lists every offender at the end.
Cut in this order, never by shaving adjectives:

1. The social proof line. It is rationed to one caption in three or four anyway.
2. The "Now to be fair" concession, FOLDED, never dropped. A caption that makes either side the
   villain fails the positioning rule.
3. Setup atmosphere, keeping the concrete details.

Never cut: the opening CTA, the CRWN sidenote, `ANYWAY.`, the offer line, the closing ask, or the
NAMED withheld variable in the tease. Word counts run 328 to 418 against a 310 target, so these
already sit at the floor of the beat structure.

---

## What to say, per step

    /crwn-fan-economy-ideas 10 <optional focus>
    build 3 and 7
    /crwn-fan-economy <the pick>
    render the sheets for 60 and build the print PDF
    /crwn-fan-economy-carousel 60
