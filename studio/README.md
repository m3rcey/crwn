# CRWN Studio

A local page that tracks each filmed Fan Economy video through the nine steps in
[Shortform_Video_Process.txt](Shortform_Video_Process.txt) and runs step 6 (silence chop into
Premiere). The build order and rules are in [BUILD_PLAN.md](BUILD_PLAN.md), and the Phase 0
findings are in [RECON.md](RECON.md).

## Run it (from WSL)

    cd /home/merce/workspace-crwn && node studio/server.mjs

Then open http://127.0.0.1:4717. Add `#60` to the address to open video 60 directly.
No install step and no dependencies: it runs on WSL's node v22.

Tests:

    node --test "studio/**/*.test.mjs"          unit tests (seconds)
    node studio/test/split-regression.mjs       re-splits 814 to 822 from COPIES (about 20s)
    bash studio/test/e2e-step6.sh               step 6 end to end on a scratch copy (about 2 min)

## What each status comes from

| Step | Status comes from |
|------|-------------------|
| 1 Ideas | done when the script exists |
| 2 Script | the script has a SCRIPT section and a META line |
| 3 Images | every sheet the script's NANO BANANA PRO PROMPT blocks ask for exists, however many that is. A PDF is optional; one that exists but is older than a sheet blocks |
| 4, 5, 7, 8 | check marks you click, stored in `studio/state.json` |
| 6 Chop | the linked recording: transcript complete, split passed its checks, placed in Premiere |
| 9 Caption | the carousel's CAPTION block is at most 2,200 characters and `caption.md` matches it exactly. A video posted before carousels existed has a "Posted without a carousel file" check mark instead; it stops counting the moment a carousel file exists |

## Step 6

1. **Link.** A wav in `Hip Hop Industry\Fan Economy\` links itself when its name starts with the
   script number ("14 money man.wav") OR when its words name exactly one script
   ("New Recording 823 money man.wav" is 14-money-man-paid-to-leave); that link is saved, so a
   later script sharing the words can't undo it. Only a name that matches no script, or several
   ("dom kennedy" is 13 and 19), is listed at the top as "Which script is this?", with the
   candidates. Old recordings in Unmixed/Mixed are linked from the video's step 6 picker.
2. **Rename** (optional, Fan Economy only, before transcribing): to `NN <slug words>.wav`.
3. **Transcribe** runs `build_region_transcript_fast.py`. It is silent until it finishes; the
   page shows elapsed time. Complete means the JSON parses, has segments and language, and ends
   within max(10s, 5%) of the wav's end.
4. **Split** runs `overlap_phrases.py <wav> <json> --no-dedupe`. It must pass: Built = Loaded,
   word timing present, 0 dropped, timeline at least 50% of the audio. A failed split is blocked
   from Premiere.
5. **Place** hands the JSX to the CRWN Studio Bridge panel in Premiere, which runs it from disk
   and returns its own "Placed N of M / Failed F" message.

Studio writes ONLY inside `Fan Economy\`, only while the SSD is a real mount, and never deletes:
a replaced JSON or JSX moves to `Fan Economy\_replaced\`. Unmixed, Mixed and the Hip Hop
Industry root are read-only history. Old recordings can be linked (and marked "placed by hand"),
but Studio won't write beside them, and it won't place a JSX that points at the old `D:` letter.

## The Premiere panel

Installed by [cep/install.ps1](cep/install.ps1) (sets `PlayerDebugMode=1` under
`HKCU\Software\Adobe\CSXS.11` and copies the panel to `%APPDATA%\Adobe\CEP\extensions`). Re-run
it after editing anything in `cep/`. In Premiere: restart once, then Window > Extensions >
CRWN Studio Bridge. It says "Connected" while Studio is running.

## If the SSD isn't found

Create `studio/config.json` with `{ "ssdLetter": "E" }`. The mount check still applies.
