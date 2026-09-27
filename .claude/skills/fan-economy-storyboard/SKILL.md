---
name: fan-economy-storyboard
description: Plan the full sound-off storyboard for a CRWN Fan Economy script BEFORE any image is generated or any reel is edited. Script in, planning document out (story argument, causal chain, semantic beats, minimum semantic text spine, visual substitution, visual sequences, frame plan, sound-off QA). Use when the founder asks to storyboard a script, plan the visuals for a reel, work out what text goes on screen, or give feedback on a storyboard plan. Planning only: it never generates images, calls Nano Banana, animates, or renders.
---

# Fan Economy storyboard planner

This skill is HOW TO THINK about a script's visuals. It holds no storyboard for any one
script. Read [RULES.md](RULES.md) (permanent method, failure modes, retired rules, decision
log) and the project file in [projects/](projects/) before planning. If the script has no
project file, copy [projects/_TEMPLATE.md](projects/_TEMPLATE.md) and fill it with the
founder; never borrow another project's art direction.

Where it sits: this skill runs BEFORE image generation and before the reel editor.
`fan-economy-reel-editor` cuts the recording and builds the reel; its `reel storyboard`
command is a post-plan QA sheet, not this plan.

## Inputs

- The script `videos/scripts/fan-economy/NN-*.md`: SCRIPT for meaning, META for the withheld
  variable, the reveal, the lead magnet, the CTA keyword and the CRWN claim tier.
- If a recording exists, what he actually SAID (`words.clean.json` in the reel project).
  Never plan text or a claim on a line he did not say.
- The project file: art direction, reference assets, likeness rules, approved text spine.
- Founder feedback on earlier plans for this script.

## The method (in this order, never reversed)

### 1. Story argument

Read the whole script before splitting anything. Name, in one line each: hook/question,
setup, central problem, mechanism, consequence, contrast, reveal, solution, CTA. A script may
merge or skip some; say so.

### 2. Causal chain

Reduce the argument to 5 to 10 links joined by arrows ("A -> B -> C"). This is the spine of
the whole plan: if a silent viewer cannot follow the chain, nothing else matters. Sentence
boundaries do not appear here.

### 3. Semantic beats

A beat is ONE meaningful idea. It may be one sentence, several, or part of one. Map every
line of the script to a beat, so nothing he says is silently dropped.

### 4. Minimum semantic text spine

For every beat, write what a silent viewer must UNDERSTAND. Then, for every phrase you are
tempted to put on screen, run the four text tests (RULES.md, "Text-selection test"). What
survives is the spine: the minimum words and numbers that must stay visible after everything
that can be shown has moved into the picture. Typically: the artist's name, exact numbers,
money, durations, the product name, the CTA keyword, and abstract contrasts that imagery
cannot state precisely (LAUNCH vs DELIVERY). The spine is short enough to read aloud in
under a minute.

The spine is NOT the frame list. One anchor usually spans several frames.

### 5. Visual substitution

Nothing removed from the text is discarded: it moves, explicitly, into the picture. For
every beat record:

- **Spoken meaning**: what the script communicates.
- **Text spine**: the anchor on screen during this beat (or NONE).
- **Visual information**: every fact now carried by the image instead of words.
- **Visual action**: what physically happens on screen to carry it.
- **Reference requirements**: the assets this needs (likeness photos, product screenshots,
  real footage, a specific object).

### 6. Visual sequences

Group beats into sequences: one visual world or metaphor that evolves across several frames
(a calendar that fills, a crowd that thins, one road). Prefer an evolving world to a new
composition per beat. Give each sequence an approximate duration from the recording, or from
the script at about 150 spoken words a minute.

### 7. Frame plan

Expand each sequence into frames. A new frame is justified ONLY by a meaningful change in:
composition, focal subject, visual state, a cause/effect step, camera concept, metaphor,
time, comparison, proof/evidence, product state, emotional state, or a reveal. Never because
the next sentence began. The frame count is an outcome, not a quota: sanity-check it against
the runtime (for a ~3:30 reel, roughly 40 to 70 frames), and if it falls far outside, look
for merged ideas or padded frames rather than forcing a number.

Text shown on a frame comes from the spine only. The same anchor may sit across several
frames; a new frame does not earn new copy.

### 8. Sound-off QA

Review the plan with the audio muted and captions hidden: only pictures and spine text. Answer:

1. Who or what is this about?
2. What problem is occurring?
3. What causes it?
4. What consequence follows?
5. What comparison or reveal matters?
6. What solution appears?
7. What should the viewer do?

If any answer is unclear, FIRST change the visual. Add text only if the picture stays
ambiguous after that, and record why.

## Output: the planning document

Write it to `videos/reel-plans/<slug>.storyboard.md` (text, committed, next to the reel plan).

```
# <slug> storyboard plan
Project file: .claude/skills/fan-economy-storyboard/projects/<file>.md  (art direction version)
Runtime basis: recording | script estimate, ~M:SS

## Story summary            (3 to 5 sentences)
## Causal chain             (arrows)
## Semantic text spine      (numbered anchors, exact words, which beats each covers)
## Beat map                 (every script line -> beat; spoken meaning / text / visual information / visual action / references)
## Visual sequences

### Sequence 01: <name>
Semantic meaning:
Text spine:
Visual information:
References needed:
Approximate duration:

FRAME 01
Visual state:
Visual action:
Text shown:
Composition / camera concept:

FRAME 02
...

## Sound-off QA             (the seven answers, from pictures + spine only)
## Open questions           (anything only the founder can decide)
```

## After the plan

- The founder approves the plan before any frame is generated. Style-calibration frames
  (a handful, to lock the look) may come before the full plan; they are never the storyboard.
- Image generation, when approved, follows the project file's execution notes. The model
  never spells editorial text: every word is set programmatically afterwards.

## Feedback

Founder notes on a plan: decide which layer the note belongs to (RULES.md, "How feedback
updates this skill"), write it there with the date and his words, and add a line to the
decision log. If unclear, it is this script only.
