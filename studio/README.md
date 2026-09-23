# CRWN Studio

A local page that tracks each filmed Fan Economy video through the nine steps in
[Shortform_Video_Process.txt](Shortform_Video_Process.txt). The build order and rules are in
[BUILD_PLAN.md](BUILD_PLAN.md), and the Phase 0 findings are in [RECON.md](RECON.md).

## Run it (from WSL)

    cd /home/merce/workspace-crwn && node studio/server.mjs

Then open http://127.0.0.1:4717. Add `#60` to the address to open video 60 directly.
Stop it with Ctrl+C. No install step and no dependencies: it runs on WSL's node v22.

Tests:

    node --test "studio/**/*.test.mjs"

## What it reads

| Step | Status comes from |
|------|-------------------|
| 1 Ideas | done when the script exists |
| 2 Script | `videos/scripts/fan-economy/NN-slug.md` has a SCRIPT section and a META line |
| 3 Images | every sheet the script's NANO BANANA PRO PROMPT blocks ask for (5, or 4 for the old shape), plus a `CRWN-Fan-Economy-Sheets-<lo>-<hi>.pdf` covering NN that is newer than every sheet |
| 4, 5, 7, 8 | check marks you click, stored in `studio/state.json` |
| 6 Chop | the recording in `<SSD>\...\Hip Hop Industry\Fan Economy\` whose name starts with NN: its `.json` parses, has segments and language, and ends within max(10s, 5%) of the wav's end; its `_overlap_phrases.jsx` exists |
| 9 Caption | the carousel's CAPTION block is at most 2,200 characters and the derived `caption.md` matches it exactly |

The SSD is found by its label, "Extreme SSD", and is used only if it's a real mount. If the lookup
fails, create `studio/config.json` with `{ "ssdLetter": "E" }`; the mount check still applies.
Older recordings (Unmixed, Mixed, the Hip Hop Industry root) are read-only history. A video
shows them as a "possible recording" hint and never links one automatically.
