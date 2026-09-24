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

## 2. After the cut: read `takes.md`, then check the clean A-roll

- Every line should be CLEAN. A MISSING line means he never said it cleanly: tell him which
  line, do not invent it. A PARTIAL line: check whether his delivery paraphrased it (fine,
  delivery drifts from the page) or cut a fact (not fine).
- Read "Kept although the recognizer did not match it" and "Said but not in the script":
  a real line wrongly cut or an aside wrongly kept is fixed in the cut, before any visual.
- Sample `aroll.clean.mp4` at a few cut points (ffmpeg frames). A clipped word or a jolt is
  a cut problem; fix it now (rules.json `pacing`), never cover it with a graphic.
- With only a local transcript (no ELEVENLABS_API_KEY), Whisper can smooth a stumble into
  one clean-looking take. Listen for doubled phrases the report did not flag.

## 3. The plan: review `beats.json` against meaning

`plan` writes a deterministic draft. Your job is the pass a senior short-form editor makes:
for EVERY beat ask "why does this visual exist?" It must serve comprehension, proof,
emotion or retention. Visual noise for movement's sake is a defect.

- Hook (first 1-2 s): the question must be visible AND unanswered. Headline from the hook
  sheet, masked answer, frame changes within 1 s. Never reveal magnitude (no "$???,???").
- Proof beats: a figure the viewer should read stays long enough to read it (the
  validator warns). Qualifiers stay on screen: reported, about, a model not a measurement.
  Never upgrade a modeled or reported number into a measured one.
- Face time: he is the trust. Default at least half the reel on his face; a direct question
  to the viewer stays on the face.
- The CRWN moment: one capability, the one the script's bridge names. Product footage only
  where the claim gate allows. If the script says something CRWN does not do, typography.
- The reveal gets the only full-frame burst. Nothing before it may show the answer: no
  card, sheet, headline, caption or sourced asset (the validator enforces; do not argue
  with it, fix the plan).
- CTA: the tool (registry name), then COMMENT <keyword from the script>, then 128.

Edit `beats.json` directly: change `scene`, `aroll`, `graphic`, `text`, `broll`, `sound`.
On-screen words come from the script (its spelling, its dialect). Add B-roll by putting
the file in `<project>/broll/` WITH its provenance sidecar (source, url, rights, and
`reveals` if it shows a withheld figure). Set `"edited": true` so `plan` validates your
plan instead of redrafting it, then run `npm run reel -- plan <n>`. Zero errors to proceed.

Never source footage by downloading commercial music, full music videos or anything whose
rights you cannot state in the sidecar. Never generate an image that implies a real event
happened. Never put a person's likeness on screen that the script does not name.

## 4. Render, inspect, fix, render again

- `npm run reel -- render <n>` renders, mixes, and runs QA. Rendering is not completion.
- Read `qa/QA.md`. Every FAIL is fixed and re-rendered, not reported as a to-do.
- LOOK at `qa/contact-*.jpg` (Read the images). Check what no machine check can: a card
  over his face, text fighting the background, a B-roll beat that does not match its
  sentence, a transition that jolts, a reveal that lands flat, a static stretch.
- For a closer look at one moment: `npm run reel -- preview <n>` (HyperFrames Studio,
  scrubbable), or extract frames with ffmpeg.
- Iterate until QA passes and your visual pass finds nothing you would send back.

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
   punch scale, face ratio, pause lengths, music level...) or a taste rule in `RULES.md`
   beside this file, each with the date and the founder's words. A rule that needs new
   behavior goes in the code WITH a test.
4. Re-render the current video with the change and show him.

Read `RULES.md` before every edit. It overrides the defaults above.
