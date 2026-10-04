# Prince Dre VSL: storyboard (approval gate before any fal spend)

Rebuilt 2026-10-03 for the approved script, [SCRIPT.md](SCRIPT.md) (the Stompin Thru The Trenches
hook, 10 projects, his material from every era). Visual language measured from his 10 official
music videos; type taken from his own covers. Wireframes:
[storyboard-wireframes.png](storyboard-wireframes.png), drawn by [wireframes.py](wireframes.py).
Real comments for the brutalism inserts: [real-comments.json](real-comments.json).

**Nothing below has been generated.** Josh approves (or edits) this board first. Then one test
still per AI look; motion only for approved stills.

## Legend

- **Source:** `A` Dre on camera (Phase B; until then a black slate with the line), `P` AI plate via
  fal (no people), `R` real insert (comment screenshot, his own behind-the-scenes photos and
  videos, CRWN screen recording, real cover art), `G` graphic PNG layer for the editor.
- **Text size:** `HOOK` fills the left half or more, `BIG` one line across a third, `SUB` subtitle.
- Text follows the type system below: white, no outline, and the **bold** word in each line is
  the key word (red dry-brush). The subject sits opposite the text.
- **Nothing passes behind a letter** (Josh, 2026-10-03, after the first frame 10 put chrome over a
  scrolling screen recording). Text sits on clean black or a dark plate inside the left 52% of the
  width, and every subject, screen recording and card stays out of that area.
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
   eleven (NOBODY, NEVER, NOWHERE, ALL, AIN'T, ERA, PICK, NUMBER, EVERYTHING, ONLY, BELOW), so
   the editor can paint them with a real brush and scan them instead of hunting for a font.
   Numbers (10, 114, 16, prices) stay in the headline face.
3. **Credits, stamps and subtitles: a small, clean sans in white caps, widely tracked**, like
   "PRINCE DRE FEAT. THF LIL LAW". Near-match: Montserrat SemiBold, tracking about +250.
   Subtitles use the same face in sentence case with normal tracking.

- **The red has to be brighter than the red on his covers.** The Twitter Beef blood red measures
  `#7F0102` (median of its red pixels), 1.8:1 against `#0D0D0D`. That fails the 3:1 rule in
  PROMPT.md and turns to mud after web compression. Use `#E0262B` (measured 4.15:1) for words.
  The darker red is fine for splatter and texture.
- **Frame 5 uses his real logo lockup** (crown over the I, DRE in brush), never retyped. The
  only copy we have is a crop on a textured background, so it needs a clean file from Dre (PNG
  with transparency, or vector).
- Backgrounds his covers already use, and that fit the plates: near-black, blue-purple smoke
  (How Im Coming) and a dark branch texture (the logo). Keep both behind the left-third type area
  dark enough for the 3:1 rule.

## Frames

| # | Starts under (spoken) | Source | Composition | On-screen text | Into next |
|---|---|---|---|---|---|
| 1 | "I got a whole tape nobody ever heard" | A (85mm) / P1 placeholder | Dre close, right third; black left two thirds. Placeholder: the unlabeled CD, right third | HOOK: "A WHOLE TAPE" over "**NOBODY** EVER HEARD" | hard cut |
| 2 | "Sixteen songs. Never dropped." | R cover + G | The real Stompin cover, right third, blurred under a black redaction bar | HOOK: "16 SONGS" over "**NEVER** DROPPED" | hard cut |
| 3 | "Not on YouTube. Not on no mixtape site." | G | Black. Each line slams in and gets a red strike-through (brutalism); no platform logos | BIG: "NOT ON YOUTUBE", "NOT ON NO MIXTAPE SITE" | hard cut |
| 4 | "Nowhere. Stay with me." | A | Face, right; left clean, slow push | BIG: "**NOWHERE.**", then SUB | 2-frame white flash |
| 5 | "I'm Prince Dre. O'Block." | P2 | Low angle up at a night brick courtyard, sodium light, buildings fill the right | his logo lockup (real file); credit line: "PARKWAY GARDENS · CHICAGO" | flash |
| 6 | "I been dropping since 2013" | R cover art | Fresh Prince Of O'Block cover, 4:3 with vignette | credit stamp: "2013 · FRESH PRINCE OF O'BLOCK" | flash |
| 7 | (same beat, about 1 s each) | R covers | Blood Brothaz, then Return Of The Prince covers | stamps "2015 · BLOOD BROTHAZ", "2021 · THE RETURN OF THE PRINCE" | hard cut |
| 8 | "Where can I hear all of it?" | R comments | Real comment screenshots slammed in, stacked and tilted (brutalism), right half, names blurred | BIG: "WHERE CAN I HEAR **ALL** OF IT?" | hard cut |
| 9 | "Tapes all over old mixtape sites" | P3 | Dark desk, many browser windows of a phone glow, out of focus | SUB | whip pan |
| 10 | "So I put it all in one place. CRWN." | R screen rec | His real CRWN page scrolling the albums, in the RIGHT half only; left half clean black | BIG, chrome: "10 PROJECTS" over "114 SONGS" (numbers tick up) | hard cut |
| 11 | "Nine of em you heard of. One you ain't." | R covers + G | Ten covers in two rows of five, right half: nine lit, Stompin dark under the redaction bar | BIG: "9 YOU HEARD OF" over "1 YOU **AIN'T**" | flash |
| 12 | "If you just got a free song from me" | R screen rec | The drop page player on the free song, right half | SUB | hard cut |
| 13 | "I been sitting on stuff from every era" | P4 | Gimbal walk down a dark hallway toward a door, letterbox | BIG: "FROM EVERY **ERA**" | hard cut |
| 14 | "Behind the scenes. Pictures nobody ever seen. Videos that never came out." | R archive | His real behind-the-scenes photos and video stills, letterbox, right two thirds, RGB-split on entry | credit stamp per item: "PHOTO · NEVER POSTED", "VIDEO · NEVER RELEASED", with the year | 1 to 1.5 s cuts |
| 15 | "Thats going in here." | R screen rec | A real members-only post on his CRWN page, right half (record it once Dre has posted one) | SUB | hard cut |
| 16 | "You pick which ones I put out next" | R screen rec | The vote card from his offer page (three unreleased songs, a Vote button), right half | BIG: "YOU **PICK**" over "WHAT DROPS NEXT" | hard cut |
| 17 | "Ten dollars a month" | G cards + P5 | Dark plate; the $10 card with the Blood Brothaz cover, left. The cards carry their own text, so no headline sits beside them | card: "$10 · BLOOD BROTHAZ · LIFE I LIVE · STREETS DONT LOVE YOU · BEHIND THE SCENES · A VOTE" | card holds |
| 18 | "Plus you get a number next to your name" | G | A comment row, right half: a name with a "SILVER #1" pill (labelled example) | BIG: "YOUR **NUMBER**" over "NEVER CHANGES" | card stacks |
| 19 | "Twenty five" | G | The $25 card slides beside the $10; chips "MONTH 1 · 2 · 3" under three covers | card: "$25 · SHOTTA · IM RELOADED · THE VAULT · A PROJECT EVERY MONTH YOU STAY" | stacks |
| 20 | "Fifty. Everything. All ten. Today." | G | The $50 card in front | card: "$50 · **EVERYTHING** · ALL 10 TODAY" | hard cut |
| 21 | "That tape I told you about. Stompin Thru The Trenches." | R cover + G | Callback to frame 2: the redaction bar tears off the real Stompin cover, right third | BIG: "STOMPIN THRU THE TRENCHES"; "$50 · **ONLY** HERE" | hold |
| 22 | "Pick your level below. Cancel whenever you want." | G end card | Black; arrow pointing down at the tier cards under the player | HOOK: "PICK YOUR LEVEL **BELOW**"; SUB "Cancel whenever you want" | 3 s hold, out |

Optional, only once the SOULJA DRE cuts are on CRWN (the script's separate take): a frame after 16
under "the songs that didn't make the album", camo and smoke plate, stencil text "THE SONGS THAT
DIDN'T MAKE IT". The album itself is the label's: never say it is on CRWN.

## AI plates (fal), with prompts. Not run.

Shared style block, appended to every prompt so the plates read as one film:

> Night, Chicago, one hard sodium-vapor orange key light, teal shadows, deep blacks, low saturation,
> 35mm film grain, shallow depth of field, cinematic 16:9, documentary realism, no people, no text,
> no logos. Leave the LEFT third dark and uncluttered for on-screen type.

| Plate | Used in | Prompt (before the style block) | Motion if approved |
|---|---|---|---|
| P1 unlabeled CD | 1 (placeholder until Dre is filmed) | A mixtape CD with a blank, unlabeled disc in a cracked clear jewel case, lying on a dark wooden table. | Slow push-in |
| P2 courtyard | 5 | Low angle looking up at four-story brick public-housing buildings around a courtyard at night, sodium streetlight, bare winter trees, wet pavement. | Slow tilt up |
| P3 scattered | 9 | A dark table with a phone and a laptop showing many overlapping browser windows of old mixtape download sites, out of focus, screen glow only. | Rack focus |
| P4 hallway | 13 | A narrow apartment-building hallway at night, flickering fluorescent tube, a single door at the end, letterbox framing. | Gimbal walk forward |
| P5 dark plate | 17 to 20 | An empty dark concrete wall with a soft orange glow from below, texture only. | Static (cards move) |

The Stompin hook (frames 2, 11 and 21) uses the REAL cover under a redaction bar, not a plate:
the reveal is only honest if what is revealed is the tape itself.

Cost plan: 5 test stills first (one per plate). Motion only for the plates Josh approves.

## Open before generation

1. Josh approves or edits this board (frame order, the text lines, the five plates).
2. The fal budget cap (PROMPT.md).
3. From Dre: behind-the-scenes photos and unreleased video clips with their years (frame 14),
   one members-only post on his page to record (frame 15), and a clean file of his logo
   (transparent PNG or vector) for frame 5.
4. Commenter names are blurred in frame 8; the comments are real and linked in real-comments.json.
