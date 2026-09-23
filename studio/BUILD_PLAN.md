# CRWN Studio: Build Plan

A local web page that tracks each short-form video from idea to caption and runs the steps that can be automated. Read `Shortform_Video_Process.txt` first. It is the spec: what each step does, where files live, and how to tell a step succeeded. Its ENVIRONMENT section was verified on this machine. This file is the order to build in and the rules to follow while building.

## Ground rules

These hold for every phase.

1. **Build in phases, and stop after each one.** At the end of a phase, give Josh exact steps to test it on real files, then wait. Do not start the next phase until he says go.
2. **Existing tools stay untouched.** New code lives in its own folder, `studio/`, at the repo root. Do not edit the skills in `.claude/`, the node generators, or anything in `C:\Users\Josh\Tools\`. The interface calls them as they are. If a tool needs changing, propose it and wait for approval.
3. **Run from WSL.** Use `/home/merce/workspace-crwn`, not the `//wsl.localhost` UNC path. Use the Windows `python.exe` for the Tools scripts and `load-env.sh` for keys, as the spec's ENVIRONMENT section describes.
4. **Find the SSD by label, and guard every write.** At startup, look up the drive labelled "Extreme SSD" and map it to `/mnt/<letter>`. Allow an override in a config file in case the lookup fails. Before any write, confirm the path is a real mount (`mountpoint -q`) and that the target folder exists. If a check fails, refuse and show why. Never fall back to a default letter. `/mnt/d` is an empty non-mount that swallows files silently; this guard is what stops that. Don't try to repair the drive either; its "Full Repair Needed" status is Josh's to handle.
5. **Never delete Josh's files.** Anything replaced (a rejected image sheet, an old JSX) moves into a `_replaced/` folder beside it. Run tests against copies in a scratch folder, never the originals.
6. **Disk is the source of truth.** Work out each video's status from the files that exist. Keep a small state file only for what disk can't show: sheet approvals, check marks for the manual steps (4, 5, 7, 8), which wav belongs to which script, and saved check results.
7. **Failed checks block.** Every automated step has pass/fail checks from the spec. The page shows which check failed and why, and a video doesn't advance past a failure.
8. **UNKNOWN means ask.** Don't guess at anything the spec marks UNKNOWN. Where the spec and the repo disagree about a command name or path, the repo wins; note the difference.
9. **Keep it small and local.** A Node server bound to `127.0.0.1`, a plain HTML/CSS/JS page, no build step, few dependencies.

## How it's built

- **Server:** a small Node app in `studio/`, running on WSL's node v22.
- **Jobs:** every script run (transcribe, split, image generation, a Claude skill) is a background child process. Its output streams live to the page and also goes to a log in `studio/logs/`. Show elapsed time for every job. Transcription prints nothing until a file finishes and can run 15+ minutes, so silence is never a failure. If a liveness signal is needed, use the process's rising CPU time. Only one transcription runs at a time.
- **Videos are keyed by script number.** Script `60-slug.md` is video 60 at every step. Recordings get linked to it (spec, step 4).
- **Claude steps run headless** through Claude Code's non-interactive mode (`claude -p "<slash command>"`), if Phase 0 confirms that works from WSL.

## Phase 0: Recon (no app code)

Answer these and write the findings to `studio/RECON.md`.

1. **Can Claude Code run headless from WSL?** Earlier recon ran from the Windows side. Check whether `claude` exists inside WSL and whether `claude -p` can invoke a slash-command skill and exit on its own. Test with a harmless prompt first. Ask Josh before running a real skill, since skills write files.
2. **What do the Premiere helpers take and print?** Read `verify_timeline_audio.py` and `list_project_items.jsx`: their arguments, their output, and how to tell pass from fail.
3. **Can a JSX run in Premiere without F5 in VS Code?** For example an ExtendScript command line, or a CEP or UXP panel. Try the smallest possible JSX. List the options and what each needs installed. Install nothing without asking.
4. **Do the spec's command names match the repo?** Check them against `docs/VIDEO_PIPELINE.md` and `.claude/commands/`, including the image generator, the PDF builder (the spec's name is probably stale), and the carousel and caption generator. Record where the PDF and the derived `caption.md` land.
5. **Does the SSD lookup work?** Confirm the label lookup returns E: today and that the write guard refuses `/mnt/d`.

**Done when:** `RECON.md` answers all five and Josh has read it.

## Phase 1: Tracker (read-only)

The page lists every video by script number, with a status for each of the nine steps (done, in progress, not started, failed), worked out from disk. It has no run buttons yet.

- Steps 2, 3, and 9 come from files: the script exists, the five sheets exist, the PDF exists, and the caption exists and is within 2,200 characters.
- Step 6 comes from the linked wav: the JSON is present and complete, and the JSX is present.
- Steps 4, 5, 7, and 8 are check marks Josh clicks. For each one, show what to do next and where its output should land.
- Clicking a video shows its files and its script text.

**Done when:** it lists every existing script, and Josh spot-checks a few videos and agrees with their statuses.

## Phase 2: Step 6 automation (main target)

1. **Link a recording.** Pick a wav on the SSD and attach it to a script number. If the filename doesn't start with a script number, ask which script it belongs to. Offer to rename it to the `60 <slug>` convention, and rename only after Josh confirms.
2. **Transcribe.** Run `build_region_transcript_fast.py` as a background job, then check the JSON is complete: it parses, it has `segments` and `language`, and its last segment ends near the wav's duration.
3. **Split.** Run `overlap_phrases.py <wav> <json> --no-dedupe`, and never pass `--script`. Then apply the spec's checks: Built equals Loaded, 0 dropped, and the timeline is at least half the audio length.
4. **Place.** Use the best method Phase 0 found. If that's still F5 in VS Code, copy the JSX to a new, uniquely named file for each placement and show that exact path, so an old VS Code buffer can never be run by mistake. Show the verify result once Josh runs it.

**Regression test** (must pass before Josh tests by hand): copy a wav and its JSON from 814–822 into a scratch folder and run the split there. The new JSX must match the original except for the audio path.

**Done when:** the test passes, and Josh takes one new recording from wav to placed timeline through the page.

## Phase 3: Image sheets

- Show the five sheets side by side, each labelled with its beat (hook, middle, CRWN plug, reveal, CTA) and the matching part of the script.
- Give each sheet approve and regenerate buttons. Regenerate moves the old file to `_replaced/` and reruns the generator, which only fills missing files.
- Keep the PDF button disabled until all five sheets are approved.

**Done when:** Josh reviews and prints one video's sheets from the page.

## Phase 4: The Claude steps

- **Ideas:** run a batch, show it, and mark pitches PICKED or PASSED in the format the skill already uses (read the skill to learn it).
- **Script:** run it for a picked idea, show the `npm test` result, and display the SCRIPT section in a large-type teleprompter view.
- **Caption:** an editor for the CAPTION block with a live count against Instagram's 2,200-character limit. Saving reruns the generator so the derived `caption.md` can't go stale.

**Done when:** Josh takes one idea to a finished caption without opening a terminal.

## Phase 5: Batch mode

Several videos at once: transcribe them all in one call so the model loads once, split each, then combine them into one master timeline with 600-second gaps.

For the combine step, write a new master builder in `studio/` that takes an explicit list of JSX files. Don't rely on `build_master_jsx.py`, which only finds files named `Recording <digits>`, and don't modify it.

**Regression test:** build a master from the nine existing 814–822 JSX files. Its clip timings must match `_MASTER_814_822.jsx`.

## Later (ask first)

- **Assembly markers:** use the transcript's word timings to list marker times for step 8, covering the end of the hook (beat drop and riser), the CRWN plug (app overlay), "I built a free…" (calculator clip), and "comment…" (where that clip ends).
- **Pinning node:** add `.nvmrc` or an `engines` entry for v22. This changes the repo, so ask first.
