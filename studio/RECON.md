# CRWN Studio: Phase 0 Recon

Recon run 2026-09-23 from WSL (`/home/merce/workspace-crwn`). Nothing was installed, no
registry key was written, no real skill was run, and no file outside `studio/` changed.
Each answer is marked VERIFIED (observed on this machine) or INFERRED (read from code or
docs, not run).

## Summary

| # | Question | Answer | Blocks Phase 1? |
|---|----------|--------|-----------------|
| 1 | Headless Claude from WSL | `claude` v2.1.206 is installed in WSL, but its login has expired. **Josh has to log in once.** | No (Phase 4 only) |
| 2 | Premiere helpers | `verify_timeline_audio.py` has no pass/fail. It checks the JSX file, not what Premiere placed. | No |
| 3 | JSX without F5 | Nothing on the machine runs a JSX today apart from VS Code F5. A small CEP panel is the best option, and it needs one registry key. **Your call.** | No (Phase 2 step 4 only) |
| 4 | Spec vs repo names | The spec's PDF name is **correct**. Its "known example" of drift is itself wrong. Four other differences are listed below. | No |
| 5 | SSD lookup + guard | Works. The lookup returns `E`, `/mnt/e` is a mount, and `/mnt/d` is correctly refused. | No |

Phase 1 (read-only tracker) can start as soon as you say go. None of the open items touch it.

---

## 1. Can Claude Code run headless from WSL?

**VERIFIED:**
- `claude` exists in WSL at `/home/merce/.local/bin/claude`, version `2.1.206 (Claude Code)`.
- `~/.claude/.credentials.json` exists, but both test calls failed straight away:
  `Failed to authenticate: OAuth session expired and could not be refreshed` (exit 1, about 2s).
- There's no `claude` on the Windows PATH, so the Windows side isn't a fallback. The VS Code
  extension bundles its own copy, which isn't meant to be called from a script.

**What I tested.** I wanted to avoid running a real skill. So I made a throwaway command at
`/tmp/studio-recon/.claude/commands/recon-ping.md` that only replies `PONG <args>` and uses
no tools, then ran both from that folder:

    claude -p "Reply with exactly the word OK and nothing else."
    claude -p "/recon-ping hello"

Both stopped at the auth error, so the question isn't answered yet. The CLI is there. The
login isn't.

**What Josh does (one time):** in a WSL terminal, run `claude`, type `/login`, and finish
the browser sign-in. Then tell me, and I'll rerun the two commands above. The second one
proves whether a slash command expands under `-p` and exits on its own.

**Still to check after login (INFERRED, not tested):**
- Real skills write files and run `npm test`. A headless run needs those tools allowed
  without a prompt, most likely with `--allowedTools` or `--permission-mode` set for that
  one call. I'll test that on the ping command first, then ask you before pointing it at a
  real skill.
- If the login expires again, every Claude step will fail the same way. The Studio page
  should show that error as it is ("log in again in WSL"), not as a skill failure.

## 2. What do the Premiere helpers take and print?

### `verify_timeline_audio.py`

**Arguments (VERIFIED, from the source):** `verify_timeline_audio.py <audio.wav> <audio_overlap_phrases.jsx>`

**What it does:** it reads the phrase rows `[srcStart, srcEnd, tlStart, tlEnd, track]` out
of the JSX, decodes the wav with ffmpeg, and adds each phrase's audio together at its
timeline position. It writes the result as `<stem>_timeline_render.wav`, a 16 kHz mono
file, next to the source wav.

**What it prints:**

    Read N phrases from JSX
    Decoded source: X.Xs @ 16000Hz mono
    Wrote: <path>_timeline_render.wav
    Timeline length: X.Xs
    Now transcribe it:
      whisperx "<render>" --model large-v3 ...

**How to tell pass from fail: it doesn't tell you.** Exit 0 only means a file got written.
Three findings matter for the build:

1. **It checks the JSX, not Premiere.** It rebuilds audio from the numbers in the file, so
   it passes even if Premiere placed nothing. It can't catch a stale VS Code buffer either.
2. Its only real check is the manual step it prints at the end: transcribe the render with
   `whisperx large-v3` and read it. whisperx is installed in the Windows Python. large-v3
   on this CPU would be slow.
3. It writes two files onto the SSD next to the wav: the render, plus a temporary
   `_src_tmp_16k.wav` that it deletes afterwards. It also adds up every sample in a pure
   Python loop, so a 24-minute file will take a while.

**Proposed use in Studio:** treat it as an optional deep check, not a gate. The automatic
gates for step 6 are the split checks (Built == Loaded, Dropped 0, timeline/audio ratio of
at least 0.5). What proves placement is the JSX's own final message (see below). That
message is only readable if the JSX runs through a bridge (Q3).

### What a generated `_overlap_phrases.jsx` reports

**VERIFIED from `overlap_phrases.py`:** every placement ends in an `alert()`:

    overlap_phrases.jsx complete.
    Placed: <placed> of <total> on A3/A4
    Failed: <failed>
    Timeline range: <start>s - <end>s
    [First failures: ...]

**Pass = `Placed == total` and `Failed: 0`.** This is the real placement check. At the
moment it only appears in a Premiere dialog. The master JSX prints the same kind of
message (`Reels / Placed / Failed`).

### `list_project_items.jsx`

**No arguments.** It walks the open project and writes every item's name and media path to
**`D:/project_items.txt`**, then shows the first 1,200 characters in an alert.

**Problem: `D:` is hardcoded.** That's the SSD's old letter. On Windows today, D: is
either another drive or nothing, so the write goes somewhere unexpected or fails silently.
Under ground rule 2 I haven't changed it. If Studio needs it, the fix is to have the
bridge return the list instead of writing a file. That's a proposal for you to approve.

### `overlap_phrases.py` output lines Studio will parse (VERIFIED line numbers)

| Line | Printed text | Check |
|------|--------------|-------|
| 919 | `Audio duration: X.XXs` | denominator for the ratio |
| 930 | `Loaded N segment(s) from transcript` | must equal Built |
| 937 | `Built N phrases from word-level timing` | must equal Loaded |
| 943 | `Built N phrases (sentence-mapped; --no_align)` + WARNING | **fail**: no word timing |
| 952 | `Dropped N short fragment(s)` | must be 0 |
| 1038 | `Timeline duration: X.XXs  \|  Saved: X.XXs` | ratio of at least 0.5 |
| 1043 | `Wrote: <path>` | output path |
| 110, 908-918 | `ERROR: ...` to stderr, exit 1 | **fail** |

Arguments confirmed: positional `audio transcript`, then `--no-dedupe`, `--script`,
`--output`, `--tracks` (default 3 4), `--tl-offset`, `--dry-run`, `--batch`, and tuning
flags. The JSX is written to `<wav stem>_overlap_phrases.jsx` unless `--output` is given.
**`--output` matters for Phase 2:** it lets Studio write a separately named JSX per run
without touching the tool.

### `build_region_transcript_fast.py`, a quirk that affects Phase 2

**It skips any wav that already has a `.json` unless `--force` is passed** (VERIFIED,
lines 144-146, printed as `SKIP (json exists): <name>`). If a truncated JSON from a
crashed run is left behind, a rerun skips that wav and the bad JSON stays. So Studio has to
check the JSON first. If it's incomplete, Studio moves it to `_replaced/` before rerunning.
That's rule 5, and it avoids any need for `--force` to overwrite.

## 3. Can a JSX run in Premiere without F5 in VS Code?

**What the machine has (VERIFIED, read-only):**

| Item | State |
|------|-------|
| Premiere Pro | **2024, v24.0.3** (`C:\Program Files\Adobe\Adobe Premiere Pro 2024`) |
| ExtendScript Toolkit (ESTK) | not installed |
| VS Code ExtendScript Debugger | `adobe.extendscript-debug-2.1.0` (the F5 route today) |
| CEP runtime | CEP 11 (`HKCU\Software\Adobe\CSXS.11` exists) |
| `PlayerDebugMode` | **not set**, so unsigned CEP panels won't load |
| User CEP extensions | none |
| UXP plugins | none |

Premiere wasn't running, and nothing but F5 can run a JSX without installing something. So
I haven't run a smallest-possible JSX. Per the plan, **nothing was installed.**

**Options, best first:**

**A. A small CEP "bridge" panel (recommended).**
A panel of a few dozen lines in the Studio folder. It loads hidden when Premiere starts and
polls the local Studio server (`127.0.0.1`) for a job. It runs the JSX **from disk** with
`$.evalFile(path)` and sends back the result.
- **It fixes the stale-buffer problem**, because it always reads the file on disk.
- **It gets the placement result without editing the tool:** the bridge swaps `alert` for
  a function that records the message before it runs the file. Studio then parses
  `Placed / Failed` automatically.
- **Needs:** one registry value, `HKCU\Software\Adobe\CSXS.11\PlayerDebugMode = "1"`
  (lets an unsigned local panel load), a copy of the panel folder in
  `%APPDATA%\Adobe\CEP\extensions\`, and one Premiere restart.
- **Risk:** CEP is Adobe's older extension system. It still works in Premiere 2024, and
  Adobe is moving to UXP. Setting `PlayerDebugMode` affects only unsigned panels and is the
  standard setting for local panels.

**B. Pymiere (existing third-party bridge).** A signed CEP extension ("Pymiere Link") that
runs a localhost HTTP server which evaluates ExtendScript. It does the same job as A, but
it adds a third-party dependency and an always-on HTTP eval endpoint. **INFERRED** that it
works on 24.x; its published support list stops earlier. Not recommended over A (ground
rule 9).

**C. ExtendScript Toolkit command line (`-run`).** Not installed, discontinued by Adobe,
32-bit, and unreliable at targeting recent Premiere versions. Not recommended.

**D. UXP.** **Not available on 24.0.3.** Premiere's UXP scripting arrived in the 25.x line,
and UXP can't run the existing ExtendScript JSX without porting it (the tools are
off-limits). Only relevant if you upgrade Premiere, and even then A is less work.

**E. Keep F5, made safe.** This is the Phase 2 fallback the plan already describes: a
separately named JSX file per placement, with its exact path shown, so an old buffer can
never be what runs. It needs no installs. The placement result still has to be read by eye
from the dialog.

**Your decision:** approve option A, meaning writing the registry value, copying a panel
folder into your CEP extensions and restarting Premiere once, or stay on E for now. Phase 2
works either way. A is what makes placement fully automatic.

## 4. Do the spec's command names match the repo?

The spec says to check `docs/VIDEO_PIPELINE.md` and `.claude/commands/`. **VIDEO_PIPELINE.md
doesn't describe the filmed flow at all.** It documents the silent master-image pipeline
and the handwritten motion V1/V2 pipelines (`npm run video:*`, output under
`videos/output/<slug>/`). None of them is part of the nine-step filmed process. The real
command names come from the root `.mjs` files and `.claude/commands/`, VERIFIED:

| Spec says | Repo reality | Match? |
|-----------|--------------|--------|
| `/crwn-fan-economy-ideas` | `.claude/commands/crwn-fan-economy-ideas.md` | yes |
| `/crwn-fan-economy` | `.claude/commands/crwn-fan-economy.md` | yes |
| `/crwn-fan-economy-carousel` | `.claude/commands/crwn-fan-economy-carousel.md` | yes |
| `node generate-fan-economy-images.mjs 60 / 60 62 71 / 60-65` | same. Bare numbers are a LIST and ranges use a dash (`MAX_SHEETS = 5`) | yes |
| `node build-fan-economy-pdf.mjs 60 60` | **exists and is correct.** Its usage is `[start] [end]`, and one number means that one script | **yes** |
| ENVIRONMENT: "the PDF step is probably `generate-image-pdf.mjs` / `generate-bofu-pdf.mjs`" | Those also exist, but they're other pipelines. **The spec's warning is the stale part.** | spec wrong |

### Where the outputs land (VERIFIED from the source)

- **Sheets:** `/mnt/c/Users/Josh/Dropbox/nano banana output/Shortform Posts/Fan Economy/<NN-slug>.jpg`, then `-2` to `-5`.
- **PDF** (answers the spec's UNKNOWN): the **same Dropbox folder**, named
  `CRWN-Fan-Economy-Sheets-<lo>-<hi>.pdf`, so `CRWN-Fan-Economy-Sheets-60-60.pdf` for one
  video. It prints `N pages -> <path>`.
- **Carousel source:** `videos/carousels/fan-economy/<NN-slug>.md`. The spec says
  `<slug>.md`, but the file includes the number, matching the script name.
- **Derived `caption.md`** (answers the spec's UNKNOWN):
  `/mnt/c/Users/Josh/Dropbox/nano banana output/Carousel Posts/Fan Economy/<NN-slug>/caption.md`,
  beside `slide-1.jpg` to `slide-5.jpg`.

### Other differences worth knowing

1. **Step 9 regen can cost money.** `generate-fan-economy-carousel.mjs` rewrites
   `caption.md` on every run, which is what the Phase 4 "save reruns the generator" needs.
   But the same run also **renders any missing slide through Gemini**. If a slide was
   deleted, a caption save would pay for an image. Studio should check all five slides
   exist before a caption-only rerun, and warn if any is missing. It prints the count
   (`caption.md (N words, M chars)`) and a `CAPTION TOO LONG` warning, which is where the
   2,200 check comes from.
2. **Script numbering.** The spec says "59 is the highest, next is 60." **Script 60 already
   exists** (`60-kool-keith-forty-seven-albums.md`), so the next is 61. There are 58
   scripts, numbered 1 to 60, with **17 and 20 missing**. The tracker should show the gaps,
   not invent rows. There are 31 carousel files.
3. **PICKED/PASSED isn't in one format.** The skill's template is
   `- **PICKED:** (none yet)` / `- **PASSED:** (none yet)`. Batch 04 follows it
   (`- **PICKED:** 1, 2, ... 10`, `- **PASSED:** 11 through 50`). Batches 02 and 03 use
   free prose and different headings (`## BUILT (scripts 41-50)`, "PASSED: everything
   below"). **Phase 4 should only write the batch-04 / template form, and should show older
   batches read-only.** Batches 01 to 04 exist, so the next is 05, as the spec says.
4. **Footage folders.** `Mixed/` holds more than VSL files: it also has copies of
   `New Recording 814` to `822` (same byte sizes as in `Unmixed/`) and `_MASTER_901_904.jsx`.
   The working JSON and JSX for 814 to 822 sit in `Unmixed/`, and older masters
   (`_MASTER_681_702` ... `_MASTER_785_808`) sit in the `Hip Hop Industry` root. That's
   still the spec's open question 2 (which folder to use from now on), and it's yours to
   answer.
5. **Python packages (VERIFIED):** the Windows Python 3.12 has `faster_whisper`,
   `whisperx`, `pdfplumber` and `soundfile`, plus `whisper.exe` and `whisperx.exe`.

### Regression fixtures for Phases 2 and 5 (VERIFIED present)

In `/mnt/e/Videos/2026/CRWN/Reels TikTok Shorts/Hip Hop Industry/Unmixed/`: the
`.wav`, `.json` and `_overlap_phrases.jsx` for each of 814 to 822, plus
`_MASTER_814_822.jsx`. The wavs are 61 to 87 MB each. Tests will copy them to scratch,
as rule 5 requires.

## 5. Does the SSD lookup work?

**VERIFIED:**

    powershell.exe -NoProfile -Command "(Get-Volume -FileSystemLabel 'Extreme SSD').DriveLetter"
      -> E            (the output ends in \r\n: strip it)
    mountpoint -q /mnt/e   -> MOUNT   (E:\ on /mnt/e type 9p, drvfs)
    mountpoint -q /mnt/d   -> NOT a mount (empty dir owned by root, would swallow writes)
    ls "/mnt/e/Videos/2026/CRWN/Reels TikTok Shorts/Hip Hop Industry/" -> readable

So the guard in rule 4 works as written: look up the drive by label, lowercase the letter,
require `mountpoint -q`, and require the target folder to exist. It refuses `/mnt/d`.
Implementation notes for Phase 1:
- Strip the `\r`. PowerShell's output from WSL ends in CRLF, and an unstripped letter
  gives the path `/mnt/e\r`, which doesn't exist.
- The lookup takes about 1 to 2 seconds (PowerShell startup), so do it once at server start
  and again on demand, not on every request.
- The SSD's "Full Repair Needed" status wasn't touched.

---

## Decisions for Josh

1. **Log in to Claude in WSL** (`claude`, then `/login`). That unblocks the Q1 test. Only
   Phase 4 needs it.
2. **Premiere route:** option A (a CEP bridge: one registry value, one panel folder, one
   restart) or option E (F5 with a fresh, uniquely named JSX per run). Only Phase 2 step 4
   needs it.
3. **Footage folder from now on** (the spec's open question 2). Needed before Phase 2's
   "link a recording" can suggest a location.
