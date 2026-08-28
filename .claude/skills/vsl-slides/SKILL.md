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

**Set `headSize` per slide.** Long copy silently shrinking is how a deck loses its rhythm; a
one-line headline wants ~100px and a two-line one ~64 to 84px.

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

## Finishing

**Open and look at every slide before shipping it.** The renderer reports bytes, which proves a
file exists and nothing else. What only looking catches: a brushstroke landing under the wrong
word, a two-line label knocking a row out of alignment, a strike-through riding clear of its
text, a doodle colliding with the headline, a field of silhouettes wrapping to the container
instead of its column count. Every one of those shipped in the first pass of the reference deck
and every one was found by eye.

Then re-render only the slides you changed: `node scripts/vsl/render.mjs <deck-id> 1,3,4`.
