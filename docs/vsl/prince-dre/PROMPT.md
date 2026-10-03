# Prompt: Prince Dre VSL (B-roll package now, AI-relocated Dre later)

Adapted 2026-10-01 from a music-video prompt Josh found on X. Kept: the kinetic text hook,
internet-brutalism inserts, a lip-sync verification loop, repeated full-watch QA. Dropped:
ElevenLabs, "spend all usage", the code-drawn overlay finish (Josh: premium edits go through
Premiere), and everything specific to the original project.

## Fill in before running

- **fal budget cap:** $____
- **Editor:** who cuts in Premiere: ____
- **AI relocation consent:** has Dre given written OK to an AI-relocated version of himself? yes / not yet. If not yet, Phase B is blocked.
- **Final narration:** paste the final script, or attach Dre's recording when it exists.

## The job

You are producing the visual package for a ~1:50, 16:9 VSL that Prince Dre narrates. It plays on
CRWN's drop page right after a fan claims a free song, and its one job is turning that fan into a
paying member. A human editor cuts it in **Premiere**. You supply everything around the edit; you
do not render the final video.

**Read first:** his live offer in `src/lib/offerExperience/reference/princeDre.ts` (every on-screen
number and claim must match it), `CLAUDE.md` copy rules (no em dashes), the storyboard in
[STORYBOARD.md](STORYBOARD.md), and the memory notes `visual-restraint-one-focal-light`,
`premium-video-edits-go-through-premiere`, `vsl-cue-sheet-for-premiere`, `reels-real-media-first`.

## His visual language (measured from 10 official music videos, 2026-10-01)

- **Format:** 23.976 fps. Wide letterbox (about 2:1) reads "cinematic"; 4:3 with a vignette reads "the past".
- **Pacing:** median shot 0.5 to 1.4 s in his music videos. For a narrated VSL use about 1 to 1.5 s in montage and 3 to 6 s holds on him talking.
- **Light and color:** night, one hard sodium-orange key, blue or teal rim, crushed blacks (35 to 55% of pixels near black in his videos; aim for 20 to 30% so web compression survives), low saturation around 0.25, red/orange against blue.
- **Transitions:** hard cuts, a 2-frame white flash on era changes, whip pans, an occasional RGB-split glitch.
- **Places and props:** O'Block brick courtyards and hallways, a studio with a mic, the O-Block chain, a phone glowing in the dark.
- **Type (from his covers, not the videos; Josh, 2026-10-03):** a white western Tuscan slab serif for headlines (chrome on one title moment), red dry-brush caps for the key word, a small widely tracked white sans for credits and subtitles, green only for "Soulja" moments. Full rules, reference covers and the measured red in the "Type" section of [STORYBOARD.md](STORYBOARD.md).

## Phase A: now, without filming Dre

1. **Storyboard before any generation.** Each script beat gets a frame that marks where big text sits; that region stays clean and the subject goes to the opposite side. Josh approves the boards before any fal credit is spent.
2. **AI B-roll with no people,** through fal, stills first and motion only for approved stills. Environment plates in his visual language: a night brick courtyard under sodium light, a dark hallway, a phone glowing on a table, a notes-app close-up, a locked vault door, smoke. **No AI person who looks like Dre and no recognizable real people.** One test generation per look; scale only the looks Josh approves.
3. **Internet-brutalism inserts, from real sources only:** real YouTube comments asking for his music on Spotify, real notes-app screenshots from Dre, real screen recordings of his CRWN page and the "Unlocks in N days" lock. Never fake a comment, a screenshot or a number.
4. **Kinetic text hook:** the first 10 seconds are big words carrying the open loop. After that, text drops to subtitle size, with three or four big-word moments (the 94 songs, every month, the prices, the payoff). Deliver each text moment as layered transparent PNGs the editor animates (scale, opacity, position), plus a one-line motion note. Text is large, white, no outline, red only on the key word, and every word clears 3:1 contrast against what sits behind it.
5. **Package for the editor:** a word-cued cue sheet (each asset against the first words actually spoken under it, never invented timecodes), an SRT, a starting color LUT, and one folder per beat.

## Phase B: later, after Dre is filmed

6. **Film Dre** to camera (lav mic, a clean background for relocation), then relocate him into the approved environments with AI video-to-video. His words and voice are never altered; only the location changes.
7. **Lip-sync verification on every relocated shot:** measure the audio-to-mouth offset (a sync-confidence model, or mouth opening against voice loudness). Re-generate any shot off by more than 1 frame (about 42 ms) or scoring low confidence. Report offsets per shot; never pass a shot on eyesight alone.

## QA before handing back (repeat after every revision)

- Watch the full assembled cut start to finish at least twice and screenshot every beat.
- Measure the cut (shot pacing, near-black share, saturation) against his range above and report where it lands.
- Check every on-screen claim against his live config: prices, song counts, the order of the monthly projects.
- Search the text for "SOULJA DRE", "mixtape" and em dashes. **SOULJA DRE is with his label: never say it is on CRWN.**
- Josh's thumbnail test: every key frame still reads at 1/9 of a phone screen.

## Don't

No ElevenLabs. No usage-maximizing. No video generation before the storyboard is approved. No AI
likeness of Dre without his written consent. No final render out of `scripts/reel/`. No claims the
live offer does not make. No Pixar or glossy 3D look.
