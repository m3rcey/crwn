# Fan Economy reel editor

Raw talking-head footage of a Fan Economy script, with its mistakes and retakes, in; a
finished 1080x1920 reel out: clean takes, captions in the script's own words, proof and
B-roll, motion graphics, a withheld reveal that lands on the word, the CRWN moment, the
CTA, the 128 end card, music and sound, and a QA report.

This is content production. It is NOT part of the app: nothing here is imported by
`src/`, it adds no dependency to the root package, no database table, no route. Its render
engine is an isolated package under `scripts/reel/engine/`.

Built 2026-09-24. Everything runs **inside WSL**.

Not to be confused with the two other video paths: `docs/VIDEO_PIPELINE.md` (silent
sharpie-motion videos, no voice) and `studio/` (the filmed-sheet voice-note process that
places audio in Premiere). This editor is the third: a talking head to camera.

## The founder workflow

1. Record the script to camera. Mistakes, pauses, retakes are fine; say a line again
   until it is right (the LAST good take wins).
2. Name the file so it says which script it is: `14 money man.mov` (number first) or words
   from the script's slug. Put it anywhere.
3. Run:

        cd /home/merce/workspace-crwn && npm run reel -- run "/mnt/c/Users/Josh/Videos/14 money man.mov"

4. Watch `videos/reels/<slug>/final/<slug>.mp4` (also copied to
   `Dropbox/CRWN/content/Reels TikToks Shorts/Fan Economy Reels/` when that folder exists).
5. Notes? Tell Claude, or: `npm run reel -- feedback 14 "numbers need to be bigger"`.
   Claude applies them and re-renders.

With Claude in the loop (recommended): "Edit this raw video as a Fan Economy reel:
<file>". The skill `.claude/skills/fan-economy-reel-editor/` runs the same commands, but
also reads the take report, reviews every beat against what the sentence means, looks at
the rendered frames, and fixes what QA and its own eye find before handing it back.

## Setup (once)

    cd /home/merce/workspace-crwn/scripts/reel/engine && npm install
    npx hyperframes telemetry disable

The engine pins `hyperframes@0.8.36` and `gsap@3.15.0`; its node_modules and the
downloaded headless Chrome are not in git. ffmpeg comes from Ubuntu. Local
transcription uses the Windows Python at
`C:\Users\Josh\AppData\Local\Programs\Python\Python312` with `faster-whisper` (already
installed, models cached).

### Secrets

| Variable | Needed? | What it does |
|---|---|---|
| `ELEVENLABS_API_KEY` | optional, recommended | Scribe speech-to-text: verbatim word timestamps that keep false starts and repeats, which is what retake detection needs. Without it, local faster-whisper is used (free, but Whisper sometimes smooths a stumble into one clean-looking take). |

Create the key at elevenlabs.io with ONLY the Speech to Text permission (least
privilege), and export it in the WSL shell (`export ELEVENLABS_API_KEY=...`, or add it to
`~/.bashrc`). It is read from the environment only: never put it in the repo, in
`rules.json`, or in a project file. Scribe costs cents per minute of audio.

HyperFrames anonymous telemetry is disabled on every call the editor makes
(`HYPERFRAMES_NO_TELEMETRY=1`, `DO_NOT_TRACK=1`); nothing is uploaded, rendering is local.

## Commands

| Command | Does |
|---|---|
| `npm run reel -- run "<file>"` | everything; the script is identified from the file name, else from what was said |
| `npm run reel -- run 14 --video "<file>"` | everything, script given |
| `npm run reel -- new 14 --video "<file>"` | create the project, attach the footage |
| `npm run reel -- transcribe 14 [--provider local\|elevenlabs] [--import file.json]` | word-level transcript |
| `npm run reel -- cut 14` | align to the script, choose takes, render the clean A-roll |
| `npm run reel -- plan 14 [--force]` | draft (or validate a hand-edited) beat plan |
| `npm run reel -- build 14 [--fast]` | composition + audio mix + HyperFrames check (`--fast`: composition only, for visual iteration; never clears the render gates) |
| `npm run reel -- storyboard 14` | build, then one labelled frame per beat in `qa/storyboard.jpg`, and the storyboard gate |
| `npm run reel -- render 14 [--draft]` | render, mux, QA, export if QA passes |
| `npm run reel -- qa 14` | re-run QA on the latest render |
| `npm run reel -- preview 14` | HyperFrames Studio: scrub the composition in a browser |
| `npm run reel -- feedback 14 "note"` | log a note for the next pass |
| `npm run reel -- status [14]` | where every project is |
| `npm run reel -- assets` | library + claim-evidence check, CTA tools without footage |
| `node scripts/reel/selftest.mjs 14 [--draft]` | end-to-end test on a SYNTHETIC clip (see Pilot) |
| `npm run test:reel` | the deterministic suite ($0, no media) |

To rerender after a change: `npm run reel -- render 14`. Each render is versioned
(`renders/<slug>-vN.mp4`); `final/` holds the latest one that passed QA.

## The stages

1. **Transcribe.** Audio is extracted and transcribed to WORD-level timestamps.
2. **Align and choose takes** (`lib/align.mjs`). Every spoken phrase is aligned to its place
   in the canonical script (fuzzy, dialect-aware: "ya" is "your", "gon" is "gonna";
   numbers match by value, "a million" is "$1,000,000"). A retake is the script position
   jumping backwards; one monotonic path through time and script order is kept, a later
   complete take wins a near-tie, a restart mid-line keeps the good first half, stutters
   and long fillers go, asides go. Speech the recognizer mangled is kept when it fills a
   hole in a line (a misheard name or figure is still the founder saying the script).
3. **Cut** (`lib/cut.mjs`). The clean A-roll is rendered BEFORE any decoration. Pauses are
   set by what each gap is (sentence, paragraph, the hook's turn, the breath before the
   reveal, a removed stutter), every cut snaps to the quietest nearby moment, and the
   audio is spliced sample-accurately with short fades. Outputs: `aroll.clean.mp4`,
   `edl.json`, `takes.md`.
4. **Plan** (`lib/beats.mjs`). A semantic beat plan (`beats.json`): per beat the time range,
   the phrase, its purpose, the scene, the A-roll treatment, the B-roll/asset and its
   source, on-screen text, evidence, transition and sound. Drafted deterministically from
   the script's structure, then reviewed by Claude against meaning. Validated every time.
5. **Build** (`lib/compose.mjs`, `lib/audio.mjs`). One HyperFrames HTML composition + the mix.
6. **Render + QA** (`lib/qa.mjs`). Rendered locally in headless Chrome, muxed, checked.

## Landscape recordings (added 2026-09-24, first real reel)

A landscape source is never center-cropped once. The project gets `"framing": {"mode":
"dynamic"}` automatically; the working proxy stays landscape and `lib/track.mjs` locates the
speaker (the dark mass in front of a plain wall; columns that stay dark in the top of every
frame are a static occluder such as a monitor edge and are never shown). Every beat is then
one of five transforms of the same video, positioned from where he actually is:

| `aroll` | What it is | Use it for |
|---|---|---|
| `full` | portrait crop, frame height fills the canvas | direct address |
| `punch` | tighter, centred on the eyes (limited by resolution: `rules.landscape.punchScale`) | emphasis, masking a jump cut |
| `split` | the speaker in the lower part, a graphic panel above (240 to 860) | proof, concepts, the reveal math |
| `band` | a SQUARE 1:1 crop across the middle, headline above | variety; the sharpest crop (no upscale) |
| `hidden` | full-screen graphic | the thesis, the payoff |

The crop only moves at a real cut or a change of treatment, and only if he moved more than
`holdPx`. Shoot in 4K if possible: a portrait crop of a 1080p frame is only ~608px wide, so it
is already upscaled 1.78x before any punch-in.

## Transcription repair (added 2026-09-24)

Whisper on a long file can silently DROP whole passages and hide each drop by stretching a
neighbouring word (the first real recording lost 65 words, including the script's "not a
forecast" qualifier, behind a word stamped 19 seconds long). After a local transcription,
every word longer than 1.5s marks a probable omission; that window is re-transcribed on its
own and spliced in (`suspectWindows` / `spliceWindow` in `lib/transcribe.mjs`). The take
report then shows the recovered lines as delivered.

## Authored plans (added 2026-09-24)

`plan` drafts a plan; the editorial pass is written as `videos/reel-plans/<slug>.mjs`
(tracked in git), where every beat is anchored to a SPOKEN WORD (`P.w(line, "word")`), not to
seconds. `plan`, `build` and `render` re-resolve it against the current cut automatically, so
a re-cut never strands a graphic. Reference: `videos/reel-plans/23-smino-the-promise-you-forgot.mjs`.
Helper API: `scripts/reel/lib/author.mjs`.

## A shorter cut

Instagram Reels and YouTube Shorts cap length (3:00 when this was written: check). To make a
shorter version, list the script lines to drop in the project's `project.json`
(`"exclude": [5, 23, 24, 25]`), then `cut` and `render`: the take report says what was
excluded, and an authored plan skips beats whose lines are not in the cut (`P.has(line)`).

## Guarantees (enforced by code, tested)

- **The withheld reveal.** Every figure first spoken after the CRWN detour is withheld
  until the word that says it: no card, headline, sheet, caption phrase or sourced asset may
  show it earlier. A plan that does is repaired to the spoken word or refused. Caption
  phrases always break before a withheld figure. The masked answer never shows a digit
  count (that leaks magnitude). The reveal sheet (second from last, FE-SKILL-008) is gated
  the same way.
- **The fact lock.** Every number on screen must be a number the script states
  (reusing `scripts/video/lib/factLock.mjs`), well-formed, with its qualifier kept.
- **CRWN claims.** A CRWN product visual needs the script's META claim tier to be
  `shipped`, the line to name the capability, and the capability to be listed in
  `scripts/reel/capabilities.json` with evidence paths that exist in this repo (a test
  fails if a feature is deleted). Things CRWN does not do (distribution, masters,
  ticketing, physical goods, booking) are typography only.
- **The CTA.** The keyword on screen is the script's keyword; the tool name is the product
  registry's name for the script's lead magnet.
- **Provenance.** Every asset (footage, sheets, sourced B-roll, end card) carries a source
  and a rights basis, recorded per video in `assets.json`. Sourced B-roll without a
  sidecar is refused.
- **Safe zones.** All text stays inside the platform-safe box (rules.json `safeZone`).
- **Phrase integrity** (2026-09-25). Every cut boundary is measured on the SOURCE audio
  (`lib/boundaries.mjs`): a cut is clean only inside room tone at least 80ms long, which a
  consonant closure never is. Out-points wait for the voice to decay (quiet held 90ms),
  in-points find the real onset, frame rounding never moves a cut into a word, splices use
  raised-cosine edges. A chopped word blocks the render (`--allowClips` overrides).
- **Visuals follow the spoken edit** (2026-09-25). A beat may only stand on a script line
  that is in the spoken edit, and on-screen words (beat text, world tags, card faces) must
  be words he says within 12s of them, unless declared a structural label (a withheld
  placeholder, a claim-gated product label, a factual qualifier, a photo credit).
- **The world passes the same gates.** 3D tags, counters and card faces go through the
  withheld reveal (a counter may only land on a withheld figure at its spoken word), the
  fact lock (a counter's in-between values are arithmetic between script numbers; a photo
  credit's licence version is exempt only when flagged `attribution`) and UNSPOKEN. A
  camera move that crosses the world without a cut is refused.
- **The storyboard gate.** Before a render: split screen above 15% of the reel, three
  text-led scenes in a row, a hook without the artist when his photographs exist, or
  product footage over the talking head rejects the storyboard (`--allowStoryboard`
  overrides). Coverage by medium is reported, never targeted.

## Project folder

    videos/reels/<NN-slug>/            (not in git: media)
      project.json        source path, framing, stage status, render history
      broll/              sourced clips/images + provenance sidecars (you add these)
      transcript.json     normalized words (+ transcript.raw.json)
      alignment.json      per-line takes, dropped takes, asides
      takes.md            the take report to read
      edl.json            source in/out -> clean timeline
      aroll.clean.mp4     the clean talking-head cut (structural edit, no graphics)
      words.clean.json    caption words on the clean timeline
      beats.json          the beat plan (edit it; set "edited": true)
      captions.json       caption phrases
      assets.json         every asset used, with provenance
      composition/        the HyperFrames project (index.html + assets)
      audio/              voice.wav, music.wav, sfx.wav, mix.wav, mix.json
      renders/            video.mp4 (silent) and <slug>-vN.mp4 (final candidates)
      qa/                 QA.md, qa.json, check.json, contact-*.jpg, frames/
      final/<slug>.mp4    latest render that passed QA
      feedback.md         notes for the next pass

**HDR.** iPhones record HLG HDR. Every video (the A-roll and all footage) is tone-mapped
to SDR BT.709 on the way in and the render runs with `--sdr`; without it the picture
washes out and the compositor drops to its slow HDR path. Every encode also puts a
keyframe every second, because HyperFrames seeks frame by frame and sparse keyframes
render as frozen video.

**Framing.** `project.json` `framing` is where the 9:16 crop sits on the source
(`x`,`y` 0-1, `zoom`). Default centres slightly high for a face. Change it and rerun `cut`.

## Editing rules and feedback

- Numbers: [scripts/reel/rules.json](../scripts/reel/rules.json) (pacing, face-time ratio,
  punch scale, caption position, loudness, music level, SFX density). Read on every run.
- Taste + the feedback log: [.claude/skills/fan-economy-reel-editor/RULES.md](../.claude/skills/fan-economy-reel-editor/RULES.md).
- One video only: `videos/reels/<slug>/feedback.md` and that video's `beats.json`.

## Assets

- **CRWN product footage and calculator recordings**: [scripts/reel/assets.json](../scripts/reel/assets.json).
  Today: Memberships and Vault, the Opportunity, Own Your Fans and Vault calculators
  (founder screen recordings in `Dropbox/CRWN/`). `npm run reel -- assets` lists the CTA
  tools the scripts use that have no recording yet; those get a name card until one is
  added (record it, add an entry with its `leadMagnet` slug). Each recording entry carries
  `startAt` (the second where the useful part begins: the tier list, the calculator's
  result) and `crop` (a fraction box around the phone, because in a phone-in-hand
  recording the screen is a quarter of the frame and unreadable whole). Pick both by
  looking at a contact sheet of the recording, and say why in the entry's `note`.
- **The script's sheets** (from `generate-fan-economy-images.mjs`), roles by position from
  the end.
- **The 128 end card**: the founder's hand-drawn crown (`endcard-128`).
- **Sourced B-roll** (artist clips, interviews, headlines, posts): drop into
  `<project>/broll/` with a same-named `.json`:
  `{"source":"Billboard","url":"https://...","rights":"fair use: 3s excerpt for commentary","shows":"what it proves","line":7,"reveals":[]}`.
  `line` attaches it to a script line; `reveals` lists any withheld figure it shows.
- **Music**: only the founder's own library in `videos/music/{primary,secondary,tertiary}`
  (weighted rotation shared with the other pipelines). Never download commercial music.
  To use a specific track: set `"music": {"override": "<name>"}` in `project.json`.
- **Sound effects**: synthesized by ffmpeg in `lib/audio.mjs`. Owned, deterministic.

## Architecture decisions

- **HyperFrames for the motion + compositing layer.** Apache-2.0 (HeyGen). HTML/CSS/GSAP
  compositions rendered frame-by-frame in headless Chrome with ffmpeg, with a seekable
  Studio, video elements, fonts, 3D transforms, and its own lint/layout/contrast check.
  It was rejected on 2026-09-12 for the SILENT pipeline, where librsvg already did every
  transform a still image needed; a talking-head reel is different: it composites a
  video track under typography, cards and product footage, which is what a browser does
  well and librsvg does not. It stays isolated in `scripts/reel/engine/` so the app never
  depends on it. Remotion was not added: it would bring React rendering and a license
  question for a job HyperFrames (already proven on this machine) does.
- **ffmpeg for the structural cut and the audio.** Frame-accurate selection from a framed
  proxy, a sample-accurate splice, loudness measurement, procedural SFX.
- **Deterministic CRWN logic, model in the loop only for judgment.** Structure, alignment,
  withheld gating, fact lock, claims, CTA, QA are code with tests. Claude's role (the
  skill) is the semantic review a model is good at, never a rule a model could break.
- **Reused, not rebuilt:** `scripts/video/lib/scriptParse.mjs` + `factLock.mjs` (parser,
  CTA cross-check, number tokens, malformed-number check), `scripts/video/lib/music.mjs`
  (library, rotation), `studio/lib/status.mjs` (recording-name -> script matching).

- **Three.js inside HyperFrames for the 3D world** (2026-09-25). HyperFrames dispatches
  `hf-seek` with the composition time for every captured frame and waits on any promise
  the listener registers, so a Three.js scene rendered as a pure function of time is
  deterministic in any frame order and any worker (proven: a probe of 100 lit, shadowed
  fans and a depth rail, ~0.45s a frame in software WebGL). One pinned MIT dependency in
  the isolated engine (`three`), no new framework. `lib/world3d.js` holds the primitives
  (fans, rail, promise tiles, coin stacks, drawn cards, photo cut-outs, a bracket, pinned
  HTML tags, a keyframed camera); a reel's plan supplies only the spec.
- **The artist is a 3D figure built from reference photographs, never the photographs**
  (founder, 2026-09-25). Reference photos come from Wikimedia Commons (CC licences, author
  and URL in each `broll/*.json` sidecar); their look (braids, headband, jersey, chain,
  mic for Smino) becomes a `figure` style in `lib/world3d.js`, a stylised character in the
  fans' design language, posed by keys (mic, point, nod, bob, turn). The `photo` primitive
  and the rembg cut-out tooling (`C:\Users\Josh\.cache\reel-rembg`) remain for non-person
  evidence; they are not used for the artist.

## Pilot status (2026-09-24)

Superseded: the first real recording (script 23, Smino) was edited on 2026-09-24 and
rebuilt to the premium-reference standard on 2026-09-25. The paragraph below records the
synthetic pilot.


No talking-head recording exists yet (the September files in Dropbox are the filmed
sheets, and the product recordings are phone-in-hand screen captures). The system was
proven end to end on a SYNTHETIC clip (`node scripts/reel/selftest.mjs 14`): a labelled
test card with the source timecode burned in, and Windows text-to-speech reading script
14 with an abandoned take, a mid-line restart, a stutter, a filler, an aside and dead air.
The pilot project for the first real recording is script 14 (Money Man): all five sheets
exist and the CTA calculator has a recording. Record it, then `npm run reel -- run
"<file>"`.
