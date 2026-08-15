# Prospect nurture creative manifest

The canonical inventory of artwork for the prospect-nurture sequence (`src/lib/prospectNurture/`).
Founder decision 2026-08-15: nurture is an **image-led CRWN editorial campaign**, so every email
renders a banner above its copy and every banner has a persuasion job.

**The visual system itself is owned by `CLAUDE.md` → "Brand Imagery"** (flat vector poster art, the
exact five-colour palette, who is shown and at what age, the 65/35 gender split across a set, WebP
over JPEG). It is deliberately not restated here.

Three files, three jobs, no duplication:

| File | Owns |
|---|---|
| `generate-nurture-art.mjs` | The **executable prompts**. Source of truth for how each asset is made. |
| `src/lib/prospectNurture/art.ts` | The **runtime binding**: id, path, alt text, job, composition, gender. |
| This document | The **human-readable inventory** and the reasoning behind the set. |

A full prompt is the asset's **Scene** below, followed verbatim by the shared `STYLE` block in the
generator. Both are in that one file, so there is nothing to keep in sync by hand.

## Regenerating

```
bash -c 'source ./load-env.sh; node generate-nurture-art.mjs'
```

Idempotent: an existing `.webp` is skipped. Add `--force --only=nurture-one-record` to redo one.
Model `gemini-3.1-flash-image-preview`, 16:9, encoded to WebP by `sharp` at quality 82.

**Always open and look at every regenerated image before shipping it.** Age, gender and palette are
checked by looking, never by trusting the prompt. Two of the first twelve came back reading
mid-thirties in suits and were regenerated with explicit youth and wardrobe cues; that is the normal
failure mode, not an exception.

## Why twelve concepts for fifteen emails

Neither extreme is right. Fifteen near-duplicate portraits reads as stock filler, and one hero on
everything stops carrying meaning by email three. Twelve reusable **concepts** means an asset is
reused only where the persuasion job genuinely repeats: the day-1 discovery image returns on day 18
because both emails argue "this number is real and yours to audit", and the returning-path image
covers both re-engagement touches. `sequence.test.ts` caps reuse at two emails per asset.

## The set

All 16:9, all WebP, all in `public/`, none containing text, letters, numbers, logos or watermarks.
Status `generated` = produced by the generator above and visually reviewed on 2026-08-15.

| # | Asset ID | Used by (day) | Persuasion job | Composition | Shows | Size | Status |
|---|---|---|---|---|---|---|---|
| 1 | `nurture-discovery` | day 0 (result email), 1, 18 | The calculator found something real, and the scatter has a shape. | hero | male, 18-32 | 95 KB | generated |
| 2 | `nurture-fragmentation` | 2 | The problem is not selling. It is that nothing is connected. | hero | female, 18-32 | 55 KB | generated |
| 3 | `nurture-first-move` | 4, 210 | There is one sensible first move, and it is already chosen. | hero | male, 18-32 | 50 KB | generated |
| 4 | `nurture-parallel-bridge` | 6 | Nothing gets torn down. The new thing runs alongside the old. | objection | male, 18-32 | 45 KB | generated |
| 5 | `nurture-one-record` | 8 | The mechanism: one fan record with every sale attached. | hero | male, 18-32 | 100 KB | generated |
| 6 | `nurture-proven-buyers` | 11 | You already have buyers. They are just invisible right now. | contrast | female, 18-32 | 82 KB | generated |
| 7 | `nurture-one-piece` | 14 | The ask is one piece, not a rebuild. | objection | female, 18-32 | 45 KB | generated |
| 8 | `nurture-compounding` | 24 | Offers feed each other when the buyer is remembered. | journey | male, 18-32 | 69 KB | generated |
| 9 | `nurture-transformation` | 32 | Same fans, same effort, different plumbing. | transformation | male, 18-32 | 63 KB | generated |
| 10 | `nurture-stack-collapse` | 45 | This replaces tools rather than adding one more. | transformation | male, 18-32 | 81 KB | generated |
| 11 | `nurture-ownership` | 60 | Owning the relationship is different from renting the attention. | contrast | female, 18-32 | 73 KB | generated |
| 12 | `nurture-return` | 120, 365 | The door stayed open, and the numbers have moved since. | journey | male, 18-32 | 54 KB | generated |

**Representation across the set: 8 male / 4 female = 67% / 33%.** On the 65/35 target.
`sequence.test.ts` asserts the ratio stays between 55% and 75% male, so drift fails `npm test`.

**Size range 45 KB to 100 KB.** The test caps any single asset at 200 KB, because the banner is
fetched on open and a slow banner is a banner nobody sees.

## Scenes

Each is the subject-specific half of the prompt. Append the generator's `STYLE` block for the full
prompt. Every one names the artist's gender explicitly, because the model defaults to men when the
prompt just says "artist" (a previous CRWN set came out ~93% male for exactly that reason).

1. **discovery** (male). Silhouette chest-up, left of centre, looking up-right. Scattered amber and
   burnt-orange marks across the left bend and converge into one warm gold focal point upper right,
   resolving into a clean concentric arc. Loose left, ordered right.
2. **fragmentation** (female). Silhouette chest-up, dead centre, facing forward, surrounded by five
   clearly separate colour-block clusters in their own rounded rectangles. **No lines connect any
   cluster to any other or to the figure.** Wide empty near-black voids between them.
3. **first-move** (male). Silhouette from behind at the left, facing right. Seven diverging paths as
   flat geometric bands; six dim charcoal, one brilliant gold and wider, leading to an arc burst.
4. **parallel-bridge** (male). Silhouette centre. An older charcoal/burnt-orange structure at left,
   **still standing and intact**, a newer gold/amber structure at right, joined by one solid gold
   bridge. Nothing broken, falling or crossed out.
5. **one-record** (male, hoodie, short fade, clean-shaven, mid twenties). Silhouette centre. A bright
   gold hexagon at his chest connects by unbroken gold lines to six flat icons arranged around him,
   which are also joined to each other, forming one closed connected system.
6. **proven-buyers** (female). Silhouette chest-up at right, looking left. The left two thirds is a
   dense field of hundreds of dim charcoal circles. Inside it, a tight cluster of about twelve is
   gold, larger, and ringed by a hard concentric arc.
7. **one-piece** (female). Silhouette waist-up at right, one arm extended, calmly placing a single
   small gold block into the one empty notch of an otherwise complete structure. Effortless.
8. **compounding** (male). Silhouette at far left facing right. Four linked stages across the frame,
   each visibly larger and brighter than the last, ending in a gold star burst.
9. **transformation** (male). Silhouette dead centre splits the frame. Left: scattered dim fragments
   at random angles, no connecting lines. Right: the same quantity resolved into an aligned gold grid
   joined by connectors. No text, no arrow, no divider; the contrast alone carries it.
10. **stack-collapse** (male). Silhouette at right watching left. A tall cluttered leaning stack of
    mismatched blocks mid-transition: upper blocks dispersing, lower blocks merging into one clean
    solid gold rounded rectangle at centre.
11. **ownership** (female). Silhouette centre-right. Far left, an enormous field of tiny uniform
    charcoal dots with **no lines reaching her**. Close at right, about nine larger gold circles each
    joined to her by a short thick unbroken gold line.
12. **return** (male, hoodie and joggers, short twists, early twenties). Silhouette from behind,
    small at lower left. One broad gold path recedes to a bright arc burst upper right, still lit.
    Dot rows widely spaced near, denser toward the light. Patient, unhurried.

## Accessibility and deliverability

- **Alt text is meaningful, never "banner"**, and lives in `art.ts` beside the asset. Tested.
- **The image never holds the only copy of the argument.** Every claim is in HTML text below it, and
  the plain-text part carries the full body plus the CTA URL and the unsubscribe link. Tested.
- **`width="520" height="293"`** are set (16:9 at the card width) so a blocked image reserves its
  space instead of collapsing the layout.
- **Hosted, never inlined.** A base64 payload would push the message past Gmail's clipping
  threshold, and a clipped message hides the unsubscribe link. `sequence.test.ts` fails on
  `data:image`.
- **One banner per email.** No decorative secondary assets.
- Images are served from `thecrwn.app/public`, the same origin as the rest of the app, so their
  lifetime is the deployment's. No new host, no new tracking: the existing signed Resend webhook
  remains the only open/click attribution.

## Adding an email

`NurtureEmail.art` is a **required** field typed to the `NURTURE_ART` keys, so a new email cannot
compile without choosing a banner, and `sequence.test.ts` fails if the file behind it is missing,
is not WebP, is over 200 KB, or has no alt text. That is the mechanism that stops a future email
shipping without imagery.
