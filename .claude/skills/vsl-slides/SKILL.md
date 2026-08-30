---
name: vsl-slides
description: Generate a complete CRWN VSL slide deck as 1920x1080 PNGs from a prompt sheet or a script, in the locked cream/black/gold presentation style with the real CRWN crown mark. Use when the founder wants VSL slides, presentation slides, a slide deck, or webinar/teaching visuals built, or wants an existing VSL deck edited or re-rendered. Not for Instagram carousels (use /carousel) or brand poster art (use /crwn-image-gen).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# CRWN VSL Slide Generator

Builds a numbered VSL deck as rendered HTML, not as generated images.

## Why HTML and not Nano Banana

The prompt sheets for these decks are written for an image model, and the sheets themselves
carry the tell: "if a slide misses the exact headline, regenerate that slide instead of accepting
drift." A VSL slide is mostly **exact copy** plus the **real CRWN crown**. An image model
re-letters the copy and redraws the crown on every generation, so every slide is a coin flip and
a one-word edit costs a full regeneration.

Rendering HTML through headless Chrome makes the copy literal, the mark the actual file, and a
re-render free. Use an image model for the poster ART that goes INSIDE a slide, never for the
slide.

## Run it

    node scripts/vsl/render.mjs <deck-id>          # whole deck
    node scripts/vsl/render.mjs <deck-id> 4,9,13   # only those slides

Output lands in `videos/vsl/<deck-id>/<deck-id>-NN.png` at 1920x1080.

Reference deck: [scripts/vsl/decks/vsl-1-fan-worth.mjs](scripts/vsl/decks/vsl-1-fan-worth.mjs).

## The files

| File | What it owns |
|---|---|
| [scripts/vsl/lib/theme.mjs](scripts/vsl/lib/theme.mjs) | Palette, type, crown data URIs, `rich()`, `brush()`, `arrow()`, base CSS |
| [scripts/vsl/lib/layouts.mjs](scripts/vsl/lib/layouts.mjs) | `shell()` plus every body primitive, and their CSS |
| [scripts/vsl/lib/icons.mjs](scripts/vsl/lib/icons.mjs) | The line-icon set and the `person()` silhouette |
| [scripts/vsl/decks/*.mjs](scripts/vsl/decks/) | One deck: its slides and their copy. Data only |
| [scripts/vsl/render.mjs](scripts/vsl/render.mjs) | Chrome invocation and file output |
| [scripts/vsl/prep-assets.mjs](scripts/vsl/prep-assets.mjs) | Regenerates the crown marks from `public/crwn-logo-transparent.png` |

A new deck is a new file in `decks/`. Reach for a new primitive in `layouts.mjs` only when no
existing one carries the idea; a deck file should be copy and composition, nothing else.

Primitives already built, so check here before inventing one: `optionRow`, `panelCompare`,
`iconTiles` (labels, optionally an example line), `miniCards`, `chipRow`, `audienceField`,
`spectrum`, `demandSpectrum`, `additivePath`, `mathRows`, `ladder`, `miniLadder`, `funnel`,
`progression`, `struckNumbers`, `struckStack`, `nestedMap`, `venn` (two circles read as a
condition, three as corroboration), `converge`, `trapDiagram`, `sourceToAssets`, `speechBubble`,
`filterCards`, `crowdCompare`, `flowChain` (wraps rather than crushing a long chain),
`centerpiece`, `loopCycle`, `concentricRings`, `metricGrid`, `priorityStack`, `stepList`,
`recordingSlot`, `ctaButton`, `figurePanel`.

**A prompt sheet's rules about MEANING get asserted, not remembered.** VSL #3 withholds one answer
until slide 17, and a leak into an earlier slide still renders as a handsome slide, so the deck
file ends in a loop that throws at render time if a reveal phrase appears too early (see
`vsl-3-first-100-fans.mjs`). The same shape suits any "do not state X before Y" or "never claim Z"
rule. Two things make it worth having: mutation-test it (introduce the leak, watch the render fail,
revert) or it is decoration; and keep the term list to the ACTUAL reveal, because a guard that
flags faithful copy pressures you to edit the slide instead of the check.

**A guard scans what a VIEWER reads, never the markup.** The calculator deck's first guard failed
the render on a slide that was correct, because `funnel()` sizes its bars with `style="--w:83%"`
and the percentage rule matched CSS. Strip tags before testing (`visible()` in
`vsl-calculator.mjs`). A guard that trips on markup is worse than no guard: it pressures you to
change a good slide. This is the same failure as VSL #3's over-broad term list, in a new costume.

**A per-viewer value is NAMED, never shown, and never left as a placeholder.** A realistic figure
baked into a rendered slide becomes a claim the moment anyone treats the deck as final. The first
fix for that was wrong in an instructive way: slides 1 and 55 of the calculator deck shipped
`$[CALCULATOR RESULT]` in a dashed gold frame, on the theory that an editor substitutes it per
viewer. **Nothing substitutes it.** One rendered video plays to every artist, so the token reached
the viewer as literal brackets on frame one, and the deck's own guard REQUIRED it, which meant the
assertion was enforcing the bug. Those slides now say "WHAT YOU JUST SAW / AN ESTIMATE, NOT A
PROMISE": true for every viewer, needs no substitution. The guard is inverted to match and forbids
an amount or a stray `[` on them. `recordingSlot()` is the one legitimate slot, because a screen
recording IS composited in the edit; a per-viewer NUMBER is not.

Note the guard shape differs per deck: VSL #4 forbids money everywhere but one slide; the calculator
deck ALLOWS illustrative pricing and real CRWN pricing, and instead requires the right qualifier on
the same slide as any amount ("Illustrative examples.", the estimate note, or, for a slide stating
prices CRWN actually charges, its own named entry in `PRICING_NOTES`).

**A deck that makes a COMMERCIAL promise gets verified against the repo, not transcribed.** VSL #4
states the First Paid Member Guarantee, so its terms were checked before a word was set: the six
conditions on its slide 14 are the `role: 'required'` entries in
[src/lib/launchPartner.ts](src/lib/launchPartner.ts), and the 30-day window is measured from
`guarantee_eligible_on` per
[21-MONEY-MODEL-MEASUREMENT.md](docs/crwn-brain/21-MONEY-MODEL-MEASUREMENT.md). A slide that
overstates a guarantee creates an obligation CRWN has to honour, and marketing has shipped ahead of
this product before. `vsl-4-if-nobody-buys.mjs` then asserts three things at render time: the
reveal is withheld, the qualifier ships on the same slide as the promise, and **no money figure
appears anywhere except the slide whose job is to cross those figures out.**

## The locked visual system

Do not restyle per deck. One deck reads as one deck because the shell never moves.

- **Background** cream `#FBF8F4`. **Headline** near-black `#141414`, Inter 800, tracking `-.035em`.
- **Two golds, and they are not interchangeable.** `gold #D4AF37` is the brand gold: the crown,
  display numerals, accents on dark panels. `goldInk #B8761A` is the deeper ochre for
  handwriting, brushstrokes, arrows and underlines **on cream**. Brand gold on cream at
  annotation size is about 1.9:1 contrast and disappears; the ochre is what the reference deck
  uses for exactly this reason.
- **Handwriting is for annotations only**: Caveat for the gold teaching line, Patrick Hand for
  small labels and arrow notes. **The main headline is never handwritten.**
- **The crown is `public/crwn-logo-transparent.png`**, tinted by `prep-assets.mjs`. Never a
  generic crown, never a redrawn one, never an emoji.
- Secondary body `#606363`; disclaimers `#9C9A96` italic; icon badges green `#406741`.
- Fonts are embedded as base64 woff2, so a render needs no network and cannot race a webfont.

## Writing a slide

`shell()` takes `num`, `deck`, `head`, `headSize`, optional `sub`/`subHand`, `brushUnder`
(+`brushOffset` to sit the stroke under a specific word), `body`, `foot`, and `faint` doodles.

In any copy string, `[[text]]` renders gold and `~~text~~` renders struck through.

**`headSize` is a CAP, not a size.** Every page runs a fit pass before first paint
(`FIT` in theme.mjs): the headline grows to the largest size that still leaves the body the height
it needs, then the body is zoomed to fill whatever height the headline left. Set `headSize` to the
largest you would ever want that headline; the fitter goes no further and usually lands under it.

The fit is what stops a slide reading as mostly empty cream. Three things it taught, all of which
cost a render to learn:

- **`zoom`, never `transform: scale()`.** A transform squeezes a full-width diagram; zoom
  RE-LAYS-OUT, so a ladder rung keeps its width and gains a taller row and bigger type. Chrome
  resolves a percentage width under zoom against the parent DIVIDED by the zoom, so plain
  `width:100%` already lands at the right visual width. Dividing it again shrinks the body to 1/k.
- **Fit both axes.** Height alone let a `nowrap` line (the reveal slides) grow straight past the
  frame and get clipped at both edges, because it cannot reflow to relieve the pressure.
- **The headline may only claim space the body does not need.** Sizing it against a fixed budget
  let a three-line headline starve a tall diagram, which then overran the footer. `FIT_LIMITS` in
  theme.mjs holds the four knobs.

## Rules that are not style preferences

- **Never an em dash**, in any slide copy. Rewrite with a colon, a comma, or two sentences. Prompt
  sheets often contain them; convert on the way in.
- **Never invent a number.** No benchmark, conversion rate, revenue claim, or statistic the
  prompt sheet did not specify. Where a slide shows example figures, it carries its own
  "Illustrative example." or "Examples only. Not predictions." note.
- **Never fabricate CRWN UI.** A slide calling for a product demo gets `recordingSlot()`, a dark
  empty panel labelled for the editor. A fake dashboard in a VSL is a claim the product has to
  honour.
- **Tier names are Bronze / Silver / Gold / Platinum** at ~$0 / $10 / $25 / $100, framed as
  suggested starting points. See CLAUDE.md; `tierTemplate.ts` is the source of truth.
- **People are drawn in the CRWN flat-vector poster style or not at all.** Near-black silhouette
  with sculpted flat highlight planes, sunburst rays, concentric arcs, dot rows; palette
  `#0D0D0D #1A1A1A #D4AF37 #E8A33D #C2571A`; anyone shown is a Black hip hop or R&B artist
  reading 18 to 32, stated explicitly in the prompt. That art is built for a near-black page, so
  on a cream slide it goes inside `figurePanel()`, a dark rounded panel it bleeds to the edges of.
  No mat, no white frame. **Reuse `public/section-*.webp` and `public/hero-*.webp` first**: those
  eighteen were generated and individually reviewed already. Generate new art only via
  `/crwn-image-gen`. The abstract `person()` silhouettes in the count diagrams are not this: they
  are tally marks, and they stay gray.

## Handing the deck to an editor

    node scripts/vsl/cue-sheet.mjs      # writes videos/vsl/CUE-SHEET.md

Rendered slides are useless in Premiere without knowing which words each one sits under, so this
builds one table per deck: slide number, filename, and the **first words actually spoken** there.

Three sources, and the hierarchy is the whole design. The **script** (`.rtf` in Documents) is what
was recorded, so it is the ANSWER: every printed row is a real line from it. The **prompt sheet** is
only a QUERY: its `Audio starts:` line paraphrases the script, so it locates a position and is never
printed. **Never print a cue the recording does not contain** - a fabricated line sends the editor
hunting for words that were never said, which is worse than an honest gap.

- **There are no per-slide timecodes and there never were.** The `.txt` transcripts are a single
  `00:00:00` block. The scripts carry section ranges, which is coarse; Josh asked for the words, not
  the times, and the words are the better instrument anyway.
- **Match on token overlap, not a prefix.** The sheets paraphrase, so "the first N words match
  exactly" finds the wrong line or none. Weight content words double: `what happens if you` is four
  function words and it put VSL #4 slide 1 five minutes late.
- **Search a WINDOW of consecutive lines, but report the line the cue STARTS on.** These scripts run
  one sentence per paragraph, so a cue like "They buy. They subscribe. They show up." spans three
  rows. Two traps: recall rises with window size by construction, so charge each extra line
  (a wide loose window otherwise beats an exact single line); and a window that merely CONTAINS the
  cue may not begin on it.
- **Drop everything above the first time range.** That block is the brief, not the recording, and
  its "Curiosity gap:" paragraph summarises the entire video, so it outscores real narration. It
  captured six VSL #4 slides and dragged the match cursor backwards past the rest.
- **A deck whose sheet describes beats instead of quoting gets a hand-read `overrides` map**, whose
  values are QUERIES drawn from the script, so the printed words still come from the script. An
  explicit `null` means "deliberately unmapped" and must stay reachable: VSL #4 slide 9 argues the
  first 30 days is not a giant income number, and the recording never says it. Without the null the
  headline fallback handed that slide a duplicate of slide 5's line, which reads as an answer.
- **Flag slides that play out of deck order.** VSL #4's sheet puts the guarantee CONDITIONS after
  the reveal; the recording says them before it. Placing slides 14 and 16 by number would run them
  against narration about something else. The check is free: a matched row earlier than the previous
  slide's.

## Finishing

**Open and look at every slide before shipping it.** The renderer reports bytes, which proves a
file exists and nothing else. What only looking catches: a brushstroke landing under the wrong
word, a two-line label knocking a row out of alignment, a strike-through riding clear of its
text, a doodle colliding with the headline, a field of silhouettes wrapping to the container
instead of its column count. Every one of those shipped in the first pass of the reference deck
and every one was found by eye.

Then re-render only the slides you changed: `node scripts/vsl/render.mjs <deck-id> 1,3,4`.
