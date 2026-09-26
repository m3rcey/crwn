# Fan Economy reel rules (standing)

Read before every edit. These override the skill's defaults. Numbers live in
[scripts/reel/rules.json](../../../scripts/reel/rules.json); this file holds taste and the
reason behind each rule. Add a rule only when the founder's note applies to EVERY future
reel; a note about one video stays in that project's feedback.md. Date every entry and
quote him.

## Editing grammar (measured across all 58 scripts, 2026-09-24)

| Script beat | How to find it | What the viewer should see |
|---|---|---|
| Hook question (49/58; 1-9 open on a statement pair) | first paragraph | the question on screen, the answer masked, frame change inside 1 s |
| "Let's find out." turn (49/58) | hook's last line | punch-in; music drops mid-line, a riser peaks on the drop |
| Setup: the artist + credentials | lines before "Now ..." | name tag on first mention; named labels/companies as chips; figures on paper cards WITH their qualifier |
| Mechanism ("Now here's what that exposes") | lines after the turn word | the middle sheet or a concept visual, face returns quickly |
| Tease ("the number came back...", 42/58) | paragraph before the detour | the masked answer, pulsing |
| CRWN detour opener ("Hold that thought.", "Quick sidenote.", "Real quick.") | line before the thesis | SIDENOTE chip, whip |
| Thesis "market FOR fans" (58/58) | anchor line | full-frame type; "TO fans" strikes through when "FOR fans" lands |
| CRWN capability line (58/58) | line naming CRWN | real product footage, only through the claim gate |
| "ANYWAY." (57/58) | detour close | whip back to his face |
| Restated question | lines after ANYWAY | masked answer returns |
| Reveal | first line after the detour stating the withheld figure (or META's reveal words) | the only full-frame burst, on the spoken word, hit + music return |
| "But here the crazy part" (27/58) | deepening | his face, stress words as kinetic type |
| Qualifier ("reported", "a model, not a measurement") | qualifier regex | quiet tag chip, never dropped |
| Qualification question | question lines | his face |
| "I built a free ..." (56/58) | CTA tool line | tool footage or tool name card, FREE badge |
| "Comment KEYWORD ..." (58/58) | keyword line | COMMENT <KEYWORD>, script's keyword only |
| 128 👑 (58/58, unspoken) | end | the hand-drawn 128 crown card, keyword underneath |

Capitals in the script ("paid to LEAVE", "HIS terms") are the scriptwriter's stress marks:
they are the kinetic words. 20 of 58 are versus scripts: both names get the comparison.

## Standing rules

- 2026-09-24 (from the founder's own assembly process, studio/Shortform_Video_Process.txt):
  the music bed is very low and always the same level; the beat drops from the middle of
  the hook's last sentence until he speaks again, with a riser peaking exactly where it
  drops; the music fades out before the last line. (rules.json `audio`.)
- 2026-09-24 (founder's take habit): "If I said something three times I keep the last one,
  because the last one is when I got it right." (rules.json `takes.lastTakeBonus`.)
- 2026-09-24: CRWN brand palette only (near-black, charcoal, gold, amber, burnt orange,
  white, paper). No em dashes in any on-screen copy.

## The premium standard (founder, 2026-09-25; references in videos/reels/references/)

The five premium references (Cleo Abram's "Huge If True" reels, 8M-20M views) replaced the
older creative preferences where they conflicted. Measured on those five, frame by frame:
presenter 10-35% of screen time and always full-frame; zero top/bottom splits; 65-90%
full-screen visuals (3D CG worlds, real evidence photos and footage with small credit
lines, product footage, 2.5D cut-outs placed inside CG); one persistent hero object per
video with the camera travelling through ONE world that changes state; text is a caption
line plus small tags pinned to objects; shots about 2s except continuous fly-throughs.

- **Retired: "the face on at least half the reel"** (it forced split screens under visuals
  that should own the frame). Presenter time is decided by the narrative, never a quota.
- **Retired: split screen as the default grammar.** Allowed as a rare hybrid (the
  storyboard gate rejects it above 15% of the reel).
- **Visuals follow what he SAID** (spoken transcript), the script only guards facts,
  qualifiers, withheld figures, claims and the CTA. On script 23 the old plan put "ZERO
  FATIGUE" on screen; he never said it.
- **Real media first; no fake artist models** (founder, 2026-09-25, REVERSING the same
  day's "3D figure" rule after seeing the 3D render). A real artist, album, event or product
  is shown as the real thing: photographs, album art, footage, CRWN recordings. The 3D Smino
  figure is retired. Architecture and the prototype that must pass first:
  [docs/REEL_MEDIA_ARCHITECTURE.md](../../../docs/REEL_MEDIA_ARCHITECTURE.md).
- **"3D" is not "premium".** The references' 3D (~47% of their frames) is photoreal CG built
  from real imagery, used where no camera can go. Procedural primitives on a dark void read as
  a game. Abstract mechanisms get annotated real imagery or textured 2D, not low-poly props.
- **Learned on the real-media prototype** (script 23, 2026-09-25, each one seen in a frame):
  the image carries the frame, type sits under it (the references' labels are ~5% of the
  frame; a 170px counter and a 124px label read as a slide and were cut to 128/96px);
  a cut-out gets a soft cast shadow, never a tight contact shadow (it draws a sticker
  outline at 100%); a foreground layer must be LIT (a dark crowd strip in front of the
  subject read as a black void, a backlit crowd reads as fans); a scene that opens before
  its first event is a dead frame (the timeline opened on "Going" and showed a bare planner
  for 1.4s; it opens on "launch" now); keep labels out of Instagram's right-hand button
  column (safe zone right edge); and look at the source photo's own edges (the planner's
  dark page curl became a black wedge once the camera travelled).
- **Product and calculator footage own the frame**, with a virtual camera move inside the
  recording. Never a small phone above his face.
- **Text labels; it does not carry the explanation.** Captions are one short line, 54px
  uppercase, subordinate (rules.json `captions`).
- **Sound follows visual events** and leaves silence before the payoffs.
- **Storyboard before render.** `reel storyboard` and look at it against the references.

## Calibrated on the first real recording (script 23, Smino, 2026-09-24)

These held on real footage of him and apply to every future reel. One-off choices for that
video live in its authored plan, [videos/reel-plans/23-smino-the-promise-you-forgot.mjs](../../../videos/reel-plans/23-smino-the-promise-you-forgot.mjs).

- **He records landscape, 1080p, low camera, plain wall.** A landscape source gets dynamic
  framing (full / push / punch / split / band / hidden), never one static centre crop and
  never a blurred-background fill. A portrait crop of 1080p is already a 1.78x upscale, so
  punch stays at 1.12 and push at 1.07. Ask for 4K when he can.
- **He barely moves** (about 35px across 3.5 minutes), so the crop only re-centres at a cut
  or a treatment change, and only past `holdPx`. A crop that follows him every frame reads
  as camera shake.
- **The low camera leaves a wall of headroom** (about 530px above his head in the portrait
  crop). That headroom is where hook text goes, and why the hook's first move is a PUSH
  (eyes held at the same height), not a punch (which lifts his head into the text).
- **He paraphrases the script on purpose** ("What they're going to do is just stop
  paying"). Speech joined to kept speech with no pause is his delivery: keep it. A retake is
  a pause and a restart, and only that is cut.
- **Captions print what he SAID.** The script's spelling replaces his word only when it is
  the same word or a pure pronunciation twin (ya/your, gon/going). A different word with a
  related meaning (not/aint, they're/they) is never swapped, and a common word the
  recognizer heard clearly (not, they, of) is never "corrected" into a script word.
- **Captions travel with the picture.** When the treatment changes under a caption (full to
  split), the caption slides with the video instead of jumping: the jump put it across his
  face for the 0.38s slide, on every split in the reel. Short labels wrap balanced, so a card
  never ends on a one-word line ("EVERYBODY BUILDS / IT").
- **Whisper drops whole passages on a long file** and hides the hole behind one stretched
  word. Omission repair runs on every local transcript; the first recording lost 65 words,
  including the qualifier and the closing questions, and got every one back.
- **A comma is a breath, not a cut.** Pauses at commas keep 0.22s.
- **Cuts are acoustic, never ASR times** (2026-09-25, "the reel audibly chops phrase
  endings"). Measured: a 30ms stop closure mid-word read as silence ("Dis|cord", "conten|t"),
  recognizer word ends early and starts late, frame rounding moved cuts into words. A word
  now ends only when quiet holds 90ms, starts where its onset really begins, and the cut
  stage refuses any boundary whose quiet stretch is under 80ms (5 clips in V3, 0 now).
- **His room is quiet.** Noise floor about -54 LUFS against speech at -23: no denoise.
- **A music track shorter than the reel is looped with a crossfade**, never a hard loop:
  the hard seam landed on the $33,000 hit.
- **Length.** A full script runs about 3:25 said naturally, over the 3:00 Reels/Shorts cap.
  Cut a shorter version with `project.json` `exclude` (whole lines), never by speeding him
  up.

## Feedback log

Newest first. Format: date, the founder's words, what changed (file + value).

- (none yet)
