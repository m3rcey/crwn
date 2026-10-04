# Prince Dre VSL: storyboard (approval gate before any fal spend)

Built 2026-10-01 from the VSL script (the "[YEAR] item on my phone" version) and the measured style
of his 10 official music videos. Wireframes: [storyboard-wireframes.png](storyboard-wireframes.png).
Real comments for the brutalism inserts: [real-comments.json](real-comments.json).

**Nothing below has been generated.** Josh approves (or edits) this board first. Then one test
still per AI look; motion only for approved stills.

## Legend

- **Source:** `A` Dre on camera (Phase B; until then a black slate with the line), `P` AI plate via
  fal (no people), `R` real insert (comment screenshot, notes-app capture, CRWN screen recording,
  real cover art), `G` graphic PNG layer for the editor.
- **Text size:** `HOOK` fills the left half or more, `BIG` one line across a third, `SUB` subtitle.
- Text follows the type system below: white, no outline, and the **bold** word in each line is
  the key word (red dry-brush). The subject sits opposite the text.
- Every frame is 16:9. "Letterbox" means 2:1 bars inside the 16:9 frame (his cinematic code).

## Type: taken from his own covers (Josh, 2026-10-03)

This replaces the "red condensed headline face plus serif credit lines" that was measured from
his music videos. His covers show a different and consistent system. References:
[logo](type-reference/logo-prince-dre.jpg), [How Im Coming](type-reference/how-im-coming.jpg),
[Twitter Beef](type-reference/twitter-beef.jpg).

Three faces, one job each:

1. **Headline (HOOK, BIG, card prices): a western Tuscan slab serif, all caps, white.** Heavy
   slab serifs with pointed spurs halfway up the stems, like the PRINCE in his logo and HOW IM
   COMING. Free near-match: Rye (Google Fonts, open license); the editor may swap in a licensed
   face that is closer. **Chrome bevel on ONE moment only** (frame 10, the catalog count), the
   way How Im Coming uses it for a title. Chrome everywhere stops reading as a title.
2. **Key word: red dry-brush caps**, like the DRE in his logo and TWITTER BEEF: rough edges,
   splatter, never a smooth marker. The key word switches face as well as colour. There are
   eight (YEAR, NOBODY, ALL, REAL, MONTH, EVERYTHING, THIS MONTH, BELOW), so the editor can
   paint them with a real brush and scan them instead of hunting for a font. Numbers (8, 94,
   prices) stay in the headline face.
3. **Credits, stamps and subtitles: a small, clean sans in white caps, widely tracked**, like
   "PRINCE DRE FEAT. THF LIL LAW". Near-match: Montserrat SemiBold, tracking about +250.
   Subtitles use the same face in sentence case with normal tracking.

- **The red has to be brighter than the red on his covers.** The Twitter Beef blood red measures
  `#7F0102` (median of its red pixels), 1.8:1 against `#0D0D0D`. That fails the 3:1 rule in
  PROMPT.md and turns to mud after web compression. Use `#E0262B` (measured 4.15:1) for words. The darker red is fine for
  splatter and texture.
- **Frame 5 uses his real logo lockup** (crown over the I, DRE in brush), never retyped. The
  only copy we have is a crop on a textured background, so it needs a clean file from Dre (PNG
  with transparency, or vector).
- Backgrounds his covers already use, and that fit the plates: near-black, blue-purple smoke
  (How Im Coming) and a dark branch texture (the logo). Keep both behind the left-third type area
  dark enough for the 3:1 rule.
- The wireframes are drawn in this type system (Rye, Knewave as the brush stand-in, Montserrat,
  his real logo in frame 5) by [wireframes.py](wireframes.py). Edit FRAMES there and rerun it to
  redraw the sheet.

## Frames

| # | Starts under (spoken) | Source | Composition | On-screen text | Into next |
|---|---|---|---|---|---|
| 1 | "I got something on my phone" | A (85mm) / P1 placeholder | Hand and phone glow, right third; black left two thirds | HOOK: "SOMETHING ON MY PHONE" | hard cut |
| 2 | "from [YEAR] that nobody's ever seen" | P1 + G redaction bar | Macro of a phone screen, a blurred thumbnail under a black redaction bar, right third (text never crosses 52% of the width) | HOOK: "**[YEAR]**" over "NOBODY'S EVER SEEN" | hard cut |
| 3 | "Not my people. Not my fans. Nobody." | A | Face, right; left clean | BIG: "**NOBODY.**" | hold |
| 4 | "Stay with me" | A | Push-in on face | SUB only | 2-frame white flash |
| 5 | "I'm Prince Dre. O'Block." | P2 | Low angle up at a night brick courtyard, sodium light, buildings fill the right | his logo lockup (real file); credit line: "PARKWAY GARDENS · CHICAGO" | flash |
| 6 | "dropping since 2013" | R cover art | Fresh Prince Of O'Block cover, 4:3 with vignette | credit stamp: "2013 · FRESH PRINCE OF O'BLOCK" | flash |
| 7 | (same beat, about 1 s each) | R covers | Blood Brothaz, then Return Of The Prince covers | stamps "2015 · BLOOD BROTHAZ", "2021 · THE RETURN OF THE PRINCE" | hard cut |
| 8 | "Where can I hear all of it?" | R comments | Real comment screenshots slammed in, stacked and tilted (brutalism), names blurred | BIG: "WHERE CAN I HEAR **ALL** OF IT?" | hard cut |
| 9 | "Tapes scattered on old mixtape sites" | P3 | Dark desk, many browser windows of a phone glow, out of focus | SUB | whip pan |
| 10 | "So I put it in one place. CRWN." | R screen rec | His real CRWN page scrolling the albums, full frame | BIG, chrome: "8 PROJECTS · 94 SONGS" (numbers tick up) | hard cut |
| 11 | "That song you just got?" | R screen rec | The drop page player on the free song | SUB | flash |
| 12 | "that ain't even the real reason" | P4 | Gimbal walk down a dark hallway toward a door, letterbox | BIG: "THE **REAL** REASON" | hard cut |
| 13 | "Songs that never came out. Videos nobody saw." | R archive | Dre's real unreleased clips and photos, letterbox, each with a year stamp, RGB-split on entry | credit stamps per item | 1 to 1.5 s cuts |
| 14 | "The notes in my phone where the verses started" | R notes-app | A real notes-app screenshot, filling the frame, slow push | none (the screenshot is the text) | hard cut |
| 15 | "Every month" | A | Face, right; left clean, slow push | HOOK: "EVERY **MONTH**" | hold |
| 16 | "Ten dollars a month gets you in" | G price card + P5 | Dark plate; $10 card with the Blood Brothaz cover, left | card: "$10 · BLOOD BROTHAZ + EVERY DROP" | card stacks |
| 17 | "Twenty-five" | G | $25 card slides beside; chips "MONTH 1 · 2 · 3" under three covers | card: "$25 · A NEW PROJECT EACH MONTH" | stacks |
| 18 | "Fifty" | G | $50 card; O Block Ass Nigga cover in front | card: "$50 · **EVERYTHING** TODAY" | hard cut |
| 19 | "That thing from [YEAR]" | P1 + G | Back to the redacted phone macro (callback to frame 2) | BIG: "FIRST DROP · MEMBERS · **THIS MONTH**" | hold |
| 20 | "Pick your level below" | G end card | Black; arrow pointing down at the tier cards under the player | HOOK: "PICK YOUR LEVEL **BELOW**" | 3 s hold, out |

Optional, only once the SOULJA DRE cuts are on CRWN: a frame between 14 and 15 under "the songs that
didn't make the album", camo and smoke plate, stencil text "THE SONGS THAT DIDN'T MAKE IT". The
album itself is the label's: never say it is on CRWN.

## AI plates (fal), with prompts. Not run.

Shared style block, appended to every prompt so the plates read as one film:

> Night, Chicago, one hard sodium-vapor orange key light, teal shadows, deep blacks, low saturation,
> 35mm film grain, shallow depth of field, cinematic 16:9, documentary realism, no people, no text,
> no logos. Leave the LEFT third dark and uncluttered for on-screen type.

| Plate | Used in | Prompt (before the style block) | Motion if approved |
|---|---|---|---|
| P1 phone | 1, 2, 19 | Close-up of a hand-held smartphone in total darkness, the screen glow lighting fingertips, the screen showing a single blurred photo thumbnail. | Slow push-in, slight handheld drift |
| P2 courtyard | 5 | Low angle looking up at four-story brick public-housing buildings around a courtyard at night, sodium streetlight, bare winter trees, wet pavement. | Slow tilt up |
| P3 scattered | 9 | A dark table with a phone and a laptop showing many overlapping browser windows of old mixtape download sites, out of focus, screen glow only. | Rack focus |
| P4 hallway | 12 | A narrow apartment-building hallway at night, flickering fluorescent tube, a single door at the end, letterbox framing. | Gimbal walk forward |
| P5 dark plate | 16 to 18 | An empty dark concrete wall with a soft orange glow from below, texture only. | Static (cards move) |

Cost plan: 5 test stills first (one per plate). Motion only for the plates Josh approves.

## Open before generation

1. Josh approves or edits this board (frame order, the text lines, the five plates).
2. The fal budget cap (PROMPT.md).
3. From Dre: the one "[YEAR]" item, his archive dump, a notes-app screenshot he is fine showing,
   and a clean file of his logo (transparent PNG or vector) for frame 5.
4. Commenter names are blurred in frame 8; the comments are real and linked in real-comments.json.
