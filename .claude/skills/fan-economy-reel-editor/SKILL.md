---
name: fan-economy-reel-editor
description: Edit a raw talking-head recording of a CRWN Fan Economy script into a finished 1080x1920 reel (retakes removed, captions, B-roll, motion graphics, withheld reveal, CRWN moment, CTA, 128 end card, music, QA). Use when the founder says "edit this as a Fan Economy reel", drops raw A-roll, or gives feedback on a reel. Content production only; never touches the product app.
---

# Fan Economy reel editor

The machine is `scripts/reel/` (manual: `docs/REEL_EDITOR.md`). This skill is the editor's
judgment on top of it. The code drafts and guards; you review what each sentence MEANS.
Run everything inside WSL: `wsl.exe -e bash -lc 'cd ~/workspace-crwn && npm run reel -- ...'`.

## 1. Start

- The founder gives a video file (or drops it and names it). `npm run reel -- run "<file>"`
  identifies the script from the file name ("14 money man.mov", "New Recording 823 money
  man.mov"); if the name is ambiguous it falls back to what was said. Never ask which
  script it is when the file name or the transcript already says so.
- The script in `videos/scripts/fan-economy/NN-*.md` is the semantic authority: SCRIPT for
  meaning and wording, META for the withheld variable, Big Reveal, lead magnet + keyword,
  and CRWN claim tier. Read both before judging any beat.

## 2. After the cut: phrase integrity first, then read `takes.md`

- **Phrase integrity is a hard gate.** The cut stage audits every boundary against the
  SOURCE audio (`lib/boundaries.mjs`): a cut is clean only inside room tone longer than a
  consonant closure. Any chopped word blocks the render. ASR word times are never cut
  points: recognizers end words early and start them late, and a 30ms stop closure
  ("Dis|cord") is not silence.
- Every line should be CLEAN. A MISSING line means he never said it cleanly: tell him which
  line, do not invent it. A PARTIAL line is usually his paraphrase: fine.
- Read "Kept although the recognizer did not match it" and "Said but not in the script":
  a real line wrongly cut or an aside wrongly kept is fixed in the cut, before any visual.

## 3. The plan is built from what he SAID

Two sources, two jobs. The **canonical script** is the guardrail: facts, qualifiers, the
withheld figure, CRWN claims, the CTA keyword. The **final spoken transcript**
(`words.clean.json`) is the editorial timeline: every visual stands on words he actually
said. Never show something he changed or dropped (on script 23 he never said "Zero
Fatigue"; the validator refuses a beat on an unspoken line, and on-screen words he never
said nearby, unless they are a declared structural label).

Plan like the premium references (`videos/reels/references/`, voice-led visual
explainers), not like a talking head with templates:

- **His face is one asset, not the background.** Presenter time follows the narrative
  (hook turn, direct address, emphasis, the CTA). There is no face-time quota.
- **Visuals own the frame.** Real imagery of the artist, product UI, the calculator, the
  reveal: full-screen. The top-graphic/bottom-face split is not a default (the storyboard
  gate rejects it above 15%).
- **One world that evolves**, not a slide per sentence. The 3D world (`lib/world3d.js`,
  the plan's `world` spec) carries recurring anchors (fans, a timeline rail, promise
  tiles, coin stacks) through several lines, the camera moving through it.
- **Real media first** (the media hierarchy in `docs/REEL_MEDIA_ARCHITECTURE.md`): real
  artist photography, album art, footage and CRWN UI; 2.5D compositing of real photos (the
  cut-out over a DIFFERENT real background, type behind the subject); annotation drawn over
  real imagery; full-screen UI; founder-shot physical B-roll; 3D only when photoreal. Never
  a modelled figure standing in for a real artist. Source with provenance and LOOK at every
  image (a Commons set "including" the artist showed someone else). Rights for artist
  photos and album art are the founder's call (TODO.md).
- **Text labels, it does not explain.** Tags pinned to objects, numbers, names. Several
  text-led scenes in a row is a storyboard failure.
- The hook shows who, what changed, how many and that the value is unknown inside ~1 s.
  The reveal is one persistent sequence where the viewer SEES why the numbers differ;
  withheld figures land on their spoken word (counters included).
- The qualifier stays legible (a factual guardrail outranks speech).
- CTA: the tool full-screen (a constant `rate` lets a short recording cover the line
  without reaching a screen you must not show), then COMMENT <keyword>, then 128.

Author the plan as `videos/reel-plans/<slug>.mjs` (anchors: `P.w(line, word, n)`; check
`n` when a word repeats in a line). `npm run reel -- plan <n>`: zero errors to proceed.
`npm run reel -- build <n> --fast` rebuilds the composition only, for visual iteration.

## 4. Storyboard, then render, then watch

- `npm run reel -- storyboard <n>` writes `qa/storyboard.jpg` (a frame per beat) and runs
  the storyboard gate. LOOK at it against the references before spending a render:
  monotony, a tiny product shot, text walls, a camera looking at nothing. A rejected
  storyboard blocks the render.
- Sound is planned on VISUAL events (`plan.sfx`: travel, pass, tick, coin, thud, impact,
  impact_big, shimmer, swell, tap), with silence before the payoffs (`plan.musicDrops`).
  Voice > music > SFX. Never an effect on every cut.
- `npm run reel -- render <n>` renders, mixes, and runs QA. Rendering is not completion.
- Watch it: extract frames around every sequence and every cut. Compare against the
  references, not against the previous version. Fix the largest gap, render again.

## 5. Report honestly

Separate three things and never merge them: technical QA (measured), your visual
critique (judgment), and founder approval (only he gives it). A passing QA is not a good
video. Say what you looked at and what you could not judge (taste, whether it is funny,
whether a reveal feels earned).

## 6. Feedback becomes rules

When the founder gives notes ("too many full-screen animations", "numbers bigger",
"captions too low", "I liked that reveal"):
1. Log the note in the project: `npm run reel -- feedback <n> "<note>"`.
2. Decide: this video only, or every future reel? If unclear, it is this video only.
3. A standing rule goes in ONE place: a number in `scripts/reel/rules.json` (caption y,
   punch scale, pause lengths, music level...) or a taste rule in `RULES.md`
   beside this file, each with the date and the founder's words. A rule that needs new
   behavior goes in the code WITH a test.
4. Re-render the current video with the change and show him.

Read `RULES.md` before every edit. It overrides the defaults above.
