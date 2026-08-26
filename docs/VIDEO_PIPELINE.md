# CRWN Silent Short-Form Video Pipeline

`scripts/video/` turns an existing Fan Economy markdown script into a finished vertical
MP4: storyboard, CRWN-style sharpie master images, deterministic motion and pacing,
instrumental music from the founder's own library, one 1080x1920 H.264 file. No voiceover,
no TTS, no manual editing. Normal founder workflow: run one command, watch the MP4,
approve or correct one scene.

Built 2026-08-26. All commands run **inside WSL** (same rule as builds).

## Commands

Dry run (storyboard + validation + music proposal + cost estimate, no image spend):

    source ./load-env.sh && npm run video:dryrun -- 34

`34` resolves to the numbered script in `videos/scripts/fan-economy/`; a full `.md` path
also works. `--new` forces a fresh storyboard instead of reusing `storyboard.json`.

Full generation (images + QC + music + render):

    source ./load-env.sh && npm run video:generate -- 34

Regenerate ONE scene (1-based scene number), then rerender:

    source ./load-env.sh && npm run video:regen-scene -- 34 4

Rerender without regenerating any image (music change, pacing change):

    source ./load-env.sh && npm run video:rerender -- 34
    source ./load-env.sh && npm run video:rerender -- 34 --music "Makavhan"
    source ./load-env.sh && npm run video:rerender -- 34 --pace 1.10

Music library scan + analysis cache refresh (local, free):

    npm run video:music -- scan

Tests (all providers mocked; spends nothing):

    npm run test:video

## Source material

- Scripts: `videos/scripts/fan-economy/*.md` (`# title`, `**SCRIPT:**`, optional
  `**NANO BANANA PRO PROMPT:**`, `**META:**`). The SCRIPT is semantic source for a SILENT
  video, never shown verbatim. META's `Withheld variable` / `Big Reveal` drive reveal
  protection; the CTA keyword comes from the script's "Comment X" line, cross-checked
  against META's `Lead magnet`, and a conflict is flagged, never silently reconciled.
- Reference imagery (the accepted look): Dropbox
  `nano banana output/Shortform Posts/Fan Economy/` (39 of the 60 scripts have an
  exact-slug-matched still). The pipeline generates NEW 9:16 masters in that identical
  style; it never moves the Dropbox library.
- Style refs + person refs: `/mnt/c/Users/Josh/Desktop/nano banana references/`, the same
  set `generate-fan-economy-images.mjs` uses, including `people/` (142 files +
  `known-people.json`) via the existing `fetch-person-ref.mjs` (imported, not copied).
- End card: `128-end-card.jpg` from that refs folder is appended to every video (1.6s,
  zero generation cost). Scene prompts still forbid drawing CRWN/crowns, exactly like the
  still pipeline; the end card is the one sanctioned crown, as an existing founder asset.

## Architecture (scripts/video/)

- `config.mjs`: every path, model id, price, cap, tier weight, pacing band. Nothing else
  hardcodes any of these.
- `lib/scriptParse.mjs`: markdown/META parser + number-token extraction (the
  anti-fabrication source set).
- `lib/storyboardGen.mjs` + `lib/schema.mjs`: script -> storyboard JSON (Gemini text
  model), validated BEFORE any image spend: story-role coverage (HOOK first,
  REVEAL/CTA present), 28-word-per-scene text density, screenText-verbatim-in-prompt,
  withheld-reveal leak detection (screen text AND image prompts), no fabricated numbers,
  motion/transition enums, element regions. Validation errors feed a repair loop (max 3
  storyboard attempts).
- `lib/imageGen.mjs` + `lib/qc.mjs`: per-scene 9:16 4K masters on
  `gemini-3.1-flash-image` (the GA id of the exact model that generated the accepted
  reference stills), with the SAME style instruction, style refs, person-ref pipeline,
  white-flatten and colour-intrusion check as the still generator. Retry ladder: max 3
  attempts per scene, attempt 3 escalates to `gemini-3-pro-image` (Nano Banana Pro).
  Each attempt gets ONE vision QC call (`gemini-3.5-flash`, downscaled input) that
  verifies required/forbidden text and major defects AND returns bounding boxes for the
  scene's elements; measured boxes outrank the storyboard's declared regions when the
  camera frames a focal target. QC infrastructure failure accepts on deterministic
  checks with a warning rather than burning a paid retry.
- `lib/music.mjs` + `lib/audioAnalysis.mjs`: the founder's three preference tiers
  (`videos/music/primary|secondary|tertiary`, 60/25/15 weighted rotation), repetition
  rules (never consecutive; not twice in the last 3 videos when alternatives exist;
  underused-first inside a tier), usage state in `videos/output/.music-usage.json`.
  Analysis is LOCAL and cached (`videos/music/.analysis-cache.json`, keyed on
  size+mtime): duration, BPM + beat timestamps (music-tempo over ffmpeg-decoded PCM),
  downbeat candidates, energy profile. Segment selection prefers the highest sustained
  energy region entered on a downbeat; videos do not have to start at second 0.
- `lib/timeline.mjs` + `lib/easing.mjs`: master image != video shot. Each scene's shots
  (PUSH/PULL/PAN/PUNCH/DRIFT/HOLD/REVEAL_CROP) become eased camera keyframes; scene
  durations derive from reading load inside role bands (hook fast, tension very short,
  reveal held, CTA long enough to act), never uniform. Scene boundaries and beatSync
  shots snap to beats within 0.45s; the reveal snaps to a downbeat. Speed-ramp feel
  comes from the easing vocabulary (punch-then-settle, micro-hold-then-go).
- `lib/render.mjs`: deterministic local renderer. Masters preload once into a 9:16
  working buffer (white-padded, so the 3:4 end card is seamless); each frame is a sharp
  crop+lanczos resize piped raw into one ffmpeg (`ffmpeg-static`) process with the
  trimmed music (loudnorm -14 LUFS, fade in/out). CUT default; SWIPE/WHIP are
  frame-composited directional slides. Output: 1080x1920, 30fps, H.264 CRF 18,
  +faststart. Marginal API cost $0.00.
- `lib/ledger.mjs`: per-job cost ledger. Records model, tokens, per-attempt accepted/
  rejected + reason, USD from the price table in config (verified against
  ai.google.dev/gemini-api/docs/pricing 2026-08-26); an unknown model records tokens
  with usd:null and a flag, never an invented price. Reports cost per ACCEPTED image
  and the observed attempt multiplier. `CAPS.maxJobSpendUsd` (default $3.50) stops the
  job loudly before the call that would cross it.
- `lib/job.mjs`: state machine (PARSED ... COMPLETE/FAILED) persisted as
  `videos/output/<slug>/job.json`. Slugs are validated (`safeSlug`) so model output can
  never choose a filesystem destination. Resume: accepted scenes are skipped; a deleted
  image file makes its scene pending again; rerender never regenerates.
- `lib/geminiClient.mjs`: the ONE provider adapter (aspect/size fallback chain lives
  here). Everything else takes an injected client, which is how tests mock it.

## Output layout

    videos/output/<script-slug>/
      source.md  storyboard.json  validation.json  timeline.json
      job.json   cost.json        music.json       meta.json
      images/scene-01.jpg ...     rejected/scene-04-attempt-1.jpg ...
      render/final.mp4

`meta.json` carries the §36 performance-correlation fields (scene/shot counts, reveal +
CTA timestamps, music track/tier/BPM, models, attempts, cost). `videos/output/` and
`videos/music/` are gitignored (large binaries; Dropbox writes `name:com.dropbox.attrs`
junk files that Windows git cannot check out).

## Caps and knobs (config.mjs)

max 10 master images (default 8), 3 attempts/scene, 24 attempts/job, 3 storyboard
attempts, 75s max duration, $3.50 job spend ceiling, 1.4 expected attempts/accepted
image (planning value; ledgers report the observed one). Music weights and repetition
window under `MUSIC`; pacing bands under `ROLE_DURATION`; zoom caps and fps under
`RENDER`.

## Deliberate boundaries

- **No generative video APIs** (Kling/Veo/Runway): $0 by design. The client interface
  would host one later; a scene would have to be explicitly marked, and text/number/CTA
  scenes never qualify.
- **STYLE_INSTRUCTION is intentionally duplicated** from
  `generate-fan-economy-images.mjs` (that file is a top-level script, not a module). If
  the still generator's style contract changes, update `lib/imageGen.mjs` to match.
- The storyboard/QC calls use Gemini, like all founder content tooling. The app's
  two-provider rule (DeepSeek + Anthropic) governs app call sites, not these scripts.
- Wizard-of-oz numbers never enter a video: every on-screen number must exist in the
  source script/META or validation fails before spend.
