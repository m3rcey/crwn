# 23-smino-the-promise-you-forgot: project calibration

The CURRENT calibration example for the method. Nothing in this file is a rule for another
artist or script.

- Script: `videos/scripts/fan-economy/23-smino-the-promise-you-forgot.md`
- Plan (not written yet): `videos/reel-plans/23-smino-the-promise-you-forgot.storyboard.md`
- Art direction version: v5 (2026-09-27)

## Opening inputs (not a design)

Recorded 2026-09-27 for the opening pass; the opening itself is designed in the plan, not here.

- **Primary curiosity gap:** how much could Smino's first 100 paying fans ultimately be worth,
  now that he is independent?
- **Semantic hook:** anchor 1, "How Much / Smino / 100 Paying Fans / Worth".
- **Withheld payoff:** $3,000, $36,000, and the $33,000 difference. None of them in the first
  five seconds if showing it collapses the gap.
- **What the opening has to make worth resolving:** Smino, his independence, 100 paying fans,
  their money value, and uncertainty about the outcome.

## Approved text spine

Founder-approved 2026-09-27. Ten SEMANTIC anchors, not ten frames; each spans several.
The number is the anchor id.

1. How Much / Smino / 100 Paying Fans / Worth
2. Going Indie / Launch Problem / 1 Month / Delivery Problem / Rest of Your Life
3. They Pay Monthly / You Owe On a Schedule
4. Forget One / They Stop Paying
5. Everybody Builds the Offer / Nobody Builds the Calendar
6. Promise Calendar / Tier Benefit / Dated Obligations
7. 100 Members / $3,000
8. Same 100 / $36,000
9. $33,000 Difference
10. Comment FREE

Where a calibration frame's label differs (it used "3 MO / $3K", "3 YR / $36K"), the spine
governs: those labels were typography tests.

Causal chain: Smino goes independent -> fans begin paying monthly -> monthly payment creates
recurring obligations -> promises can be forgotten -> fans quietly cancel -> retention
changes what the same fans are worth -> the Promise Calendar organizes those obligations ->
calculator CTA.

## Art direction (current calibration, v5)

- **Style:** flat vector editorial poster art; hard edges; flat highlight planes; no
  photorealism, no 3D.
- **Color:** real object colors stay recognizable (white tee, blue jeans, true skin tones)
  but warmed about 40% toward burnt orange / amber: the founder's "3.8 out of 10" colorway.
  No cold or neon colors. Backgrounds are plain dark burnt orange plus at most one large flat
  shape (usually a solid lighter-amber circle behind a dark subject, or a horizon band).
  Black is not dominant. Red only for the failure / churn moment.
- **Do not use:** sunbursts, radial rays, concentric arcs, dot rows, bricks, curtains, stage
  bulbs, decorative windows, props that do not carry meaning. (The model adds rings and rays
  around a disc unless told "a solid circle".)
- **Composition:** one focal point, made by lighting; one or two major subjects; bright
  highlights small (about 10% of the frame); reads at 1/9 of an iPhone screen; every subject
  separated from what is directly behind it by LIGHTNESS, not hue (a dark subject on a
  lighter shape or with a rim light, a light subject on darker); fill the frame; no dead areas
  or text-reserved bands; supporting detail allowed but dim.
- **Typography (set in code):** large; white by default; gold only for the one most
  important word or number; NO outline or stroke; contrast at least 3:1 against what is behind
  each word; multi-word titles stacked and sized to width.
- **Likeness:** Smino with a big rounded afro, thin mustache joined to a chin goatee, in every
  frame. Zero Fatigue is the three real people in the reference photo, drawn as themselves.
  No brand logos on clothing (the calibration Scene 1 still shows a small shoe swoosh).

## Reference assets

`videos/reels/references/smino/` (local only: `videos/reels/` is gitignored).

| File | Depicts | Category | Used for |
|---|---|---|---|
| `Photo Sep 26 2026, 4 31 22 PM (1).jpg` | five faces, sunburst | STYLE (rendering only) | all |
| `Photo Sep 26 2026, 4 31 22 PM.jpg` | singer on a stool, camera | STYLE | live, performance |
| `Photo Sep 26 2026, 4 31 23 PM (1) (1).jpg` | figure climbing stairs into light | STYLE | independence, roads |
| `Photo Sep 26 2026, 4 31 23 PM (1).jpg` | two at a mixing desk | STYLE | studio, work |
| `Photo Sep 26 2026, 4 31 23 PM.jpg` | man with a glowing phone | STYLE | phone, product |
| `smino 1.jpg`, `smino 2.jpg`, `smino 3.jpg` | Smino portraits | SMINO IDENTITY | any Smino frame |
| `smino performing.jpg`, `smino performing 2.jpg` | Smino on stage | SMINO IDENTITY / LIVE | performance |
| `maybe in nirvana.png` | the album cover | ALBUM (uncleared) | chains, ring, mood only |
| `zero fatigue.jpg` | Smino with two collective members | ZERO FATIGUE (identity) | the collective |
| `live crowd.jpg` | raised hands | LIVE / CROWD | crowds |
| `merch table.jpg` | band tees and a tote | MERCH | buying merch |
| `Photo Sep 26 2026, 4 49 15 PM (2).jpg` | a paper ticket | TICKET | tickets |
| `Photo Sep 26 2026, 4 42 33/40/46 PM.png` | the real Promise Calendar | CRWN PROMISE CALENDAR | product truth |
| `calculator.png`, `calculator result.png` | the real calculator | CRWN CALCULATOR | CTA |

The style frames are all sunbursts: use them for rendering (flat planes, hard edges), never
for backgrounds. The press photos and album art are NOT cleared for publication
(docs/REEL_MEDIA_ARCHITECTURE.md, gap 1).

## Calibration frames

Nine frames in `videos/reels/smino/storyboard/` (local only) plus `smino-storyboard-3x3.png`.
They locked style, color, likeness, figure-ground, density, lighting and typography. They are
NOT the storyboard, not a nine-scene structure and not a frame count. Scenes: independent,
real fans, Zero Fatigue, launch vs delivery, promise owed, quiet churn, scattered, same 100,
comment FREE.

## Execution notes

Planning never depends on these. When frames are approved for generation:

- Nano Banana Pro (`gemini-3-pro-image`, `MODELS.imageQuality` in scripts/video/config.mjs),
  9:16 at 2K, delivered 1080x1920. Runner: `videos/reels/smino/storyboard/generate.mjs`
  (`gen`, `label`, `select`, `audit`, `audit-text`, `distance`, `sheet`); art direction in
  `STYLE_TINTED`. The runner is LOCAL ONLY (gitignored folder): if it is missing, rebuild from
  this file rather than assuming it exists.
- A new frame of an approved composition passes the earlier attempt as a layout reference.
- Product UI: the model draws a flat chroma-key screen; the real screenshot is keyed in.
- Checks before showing the founder: `distance` (greyscale, tiny, blurred: every silhouette
  survives) and `audit-text` (each word at least 3:1).
- **Continuity across a sequence: `editOf`** (added 2026-09-27 for the opening keyframes). The
  first state is generated fresh; each later state is an EDIT of the previous approved raw,
  sent with only the base image and "change ONLY this" (no style or identity references, which
  invite a redraw). Learned on the opening: the edit holds the base almost perfectly (identity,
  hand, fans, camera), but it will NOT make a scale change (asked to enlarge the fans 30%, it
  returned the image unchanged, 0% of pixels moved), so size and composition must be right in
  the fresh first state. Chained edits soften the image (face sharpness fell about 25% by the
  third edit, then held). Contact sheets take a list: `sheet 11,12,13,14,15,16 <out> 6`. The
  opening lives in `videos/reels/smino/storyboard/opening/` with its own `manifest.md`.

**Runner promotion (reviewed 2026-09-27, deliberately left local).** Policy: reproducible
tooling is tracked once stable; generated images and temporary outputs stay local. The runner
has no secrets (the key comes from `GEMINI_API_KEY` via `load-env.sh`) and no absolute paths,
but it is not yet reusable:

1. Six stacked style strings (`STYLE` -> `RESTRAINED` -> `MEDIUM` -> `WARM` -> `NATURAL` ->
   `TINTED`) built by chained `.replace()` on each other; only `TINTED` is live, and a replace
   that stops matching fails silently. Collapse to ONE art-direction string owned by the
   project.
2. `IDENTITY_TEXT` hardcodes Smino's face; move it to project config.
3. `REFS` (`references/smino`), the output folder and `smino-storyboard-3x3.png` are fixed;
   read them from project config.
4. `calendarScreen()` / `calculatorScreen()` crop coordinates fit these exact screenshots;
   move them to project config.
5. `scenes.mjs` mixes prompts with per-attempt label coordinates and `compose` pointers;
   split reusable config from attempt state (`selections.json`).
6. The model import is `../../../../scripts/video/config.mjs` (breaks on a move).

Target when promoted: generic runner in `scripts/storyboard/` (beside `scripts/reel/` and
`scripts/video/`), with an `npm run storyboard` entry; per-project config tracked at
`videos/storyboard-projects/<slug>/project.mjs` (art direction, identity text, references
map, screen crops, scene prompts); outputs stay in the ignored `videos/reels/<slug>/storyboard/`.
The keepable generic parts: the generate call (references plus composition reference), the
fitted/stacked label renderer, the chroma-key screen insert with fringe clean-up, paint-outs,
and the `audit`, `audit-text`, `distance` and `sheet` checks, with tests for label fitting,
the key insert and the contrast audit. Trigger: before the full Smino generation pass (the
point where reproducibility starts to matter), or when a second script needs it, whichever
comes first.

## Project decision log

Newest first.

- 2026-09-27. Opening regenerated from the sketches (plan revision 4; keyframes in
  `opening-v2/`). Learned: an edit told to "keep the plain band across the top" DREW a band (paint
  it out, or never describe empty areas as objects in an edit); a close-up can be tightened by a
  crop of the 2752px raw with no upscale (`crop` on the scene). Founder, same day: "make sure the
  subject is slightly overlapping the font" and "the font is large and leaving little real estate
  like how i did on the drawings": text sits BEHIND the subject (`occlude`), sized to the width.
- 2026-09-27. The founder sketched a better opening: (1) "HOW MUCH?" alone, full frame;
  (2) "how much slides up as Smino comes in"; (3) "Smino holds hand up; opens it; ppl in it";
  (4) "zoom in on hand w/ ppl; WORTH drops in" ("WORTH?"). No coins. The principles went into
  ../RULES.md ("Opening composition"). The locked plan (rev 3) and its keyframes are
  superseded in direction; the plan is not yet rewritten to the sketch (founder's call).
- 2026-09-27. Opening keyframes generated for founder review (six states, `opening/`); awaiting
  visual approval. HOW MUCH sits across the top of the afro (the plan's dark-orange top band does
  not exist in the chosen frame; white on the amber circle fails contrast).
- 2026-09-27. Opening APPROVED and LOCKED: concept G "his fans in his own hands", revision 3
  (videos/reel-plans/23-smino-the-promise-you-forgot.storyboard.md). No strings in the hook;
  independence is not required by 0:05 and becomes explicit in the "Going Indie" anchor;
  5.66-6.16s is his eyes lifting to the viewer. Script-level decision, not method.
- 2026-09-27. Opening priority adopted as method (../RULES.md, "The opening"). Recorded here:
  the primary curiosity gap and the withheld payoff only. No opening designed yet.
- 2026-09-27. Precedence decided: this file's approved art direction (illustrated likeness,
  warmed natural palette) overrides the reel editor's generic "CRWN palette only / real media
  first / no fake artist models" defaults (../RULES.md, "Precedence for visual decisions").
  The conflict is closed. Rights and likeness-from-references rules still apply in full.
- 2026-09-27. Runner stays local until the cleanup under "Execution notes" is done.
- 2026-09-27. "Remove the stroke around the fonts." Typography: no outline.
- 2026-09-27. "Colorway ... 3.8/10"; "use the dark orange background"; "make the backgrounds
  simpler". Color and background rules above.
- 2026-09-26. "A decent amount of contrast between the subject and background ... identify
  subjects from a far distance." Figure-ground rule.
- 2026-09-26. "Lose all restriction to a specific color scheme" (later revised to 3.8/10).
- 2026-09-26. "Black shouldn't be the dominant color"; "not too much real estate (blank
  space)"; "text should be white unless it's important"; ZERO over FATIGUE fitted to width;
  CTA is COMMENT over FREE, no crown, no speech bubble.
- 2026-09-26. "The zero fatigue photo are the people in the zero fatigue collective."
- 2026-09-26. "If you draw attention to everything by making everything bright, you draw
  attention to nothing"; 1/9-iPhone thumbnail test; one or two subjects; large text.
