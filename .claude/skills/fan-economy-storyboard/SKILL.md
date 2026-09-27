---
name: fan-economy-storyboard
description: Plan the full sound-off storyboard for a CRWN Fan Economy script BEFORE any image is generated or any reel is edited. Script in, planning document out: story argument, causal chain, the opening five seconds solved and gated FIRST (primary curiosity gap, withheld payoff, frame 1, first second, first five seconds), then semantic beats, minimum semantic text spine, visual substitution, the rest of the frame plan, and sound-off QA. Use when the founder asks to storyboard a script, design a hook or opening, plan the visuals for a reel, work out what text goes on screen, or give feedback on a storyboard plan. Planning only: it never generates images, calls Nano Banana, animates, or renders.
---

# Fan Economy storyboard planner

This skill is HOW TO THINK about a script's visuals. It holds no storyboard for any one
script. Read [RULES.md](RULES.md) (precedence, permanent method, opening rules, failure modes,
retired rules, decision log) and the project file in [projects/](projects/) before planning.
If the script has no project file, copy [projects/_TEMPLATE.md](projects/_TEMPLATE.md) and fill
it with the founder; never borrow another project's art direction.

Where it sits: this skill runs BEFORE image generation and before the reel editor.
`fan-economy-reel-editor` cuts the recording and builds the reel; its `reel storyboard`
command is a post-plan QA sheet, not this plan.

**Priority order (permanent): frame 1, then the first second, then the first five seconds,
then everything else.** If the opening fails, the rest of the video is irrelevant, so it is
solved first and gets most of the thinking (RULES.md, "The opening").

## Inputs

- The script `videos/scripts/fan-economy/NN-*.md`: SCRIPT for meaning, META for the withheld
  variable, the reveal, the lead magnet, the CTA keyword and the CRWN claim tier.
- If a recording exists, what he actually SAID (`words.clean.json` in the reel project).
  Never plan text or a claim on a line he did not say.
- The project file: art direction, reference assets, likeness rules, approved text spine,
  the hook question and withheld payoff.
- Founder feedback on earlier plans for this script.

## The method (in this order, never reversed)

### 1. Story argument

Read the whole script before splitting anything. Name, in one line each: hook/question,
setup, central problem, mechanism, consequence, contrast, reveal, solution, CTA. A script may
merge or skip some; say so.

### 2. Causal chain

Reduce the argument to 5 to 10 links joined by arrows ("A -> B -> C"). If a silent viewer
cannot follow the chain, nothing else matters. Sentence boundaries do not appear here.

### 3. Primary curiosity gap

The ONE question the whole video promises to answer, in a sentence. The opening builds it;
the reveal answers it; nothing in between closes it.

### 4. Withheld payoff

The exact information saved for the reveal (figures, the answer, the twist). List it. None
of it appears in the opening if showing it collapses the curiosity gap.

### 5. The opening, solved first (frame 1, first second, first five seconds)

This step gets roughly 90% of the plan's intensive creative exploration (RULES.md, "The
90% rule"). Work it like this:

1. **Develop several genuinely different opening concepts** that differ at the IDEA level
   (a visual question, a transformation, a comparison, a contradiction, a scale reveal, an
   object metaphor, a cause/effect cold open...), not variations of camera, text placement or
   background.
2. **Compare them in prose** against the selection criteria (RULES.md): instant
   comprehension, subject recognition, curiosity, stakes, progression, sound-off performance,
   simplicity, withholding, continuity, truthfulness. No numeric scores.
3. **Choose one, and reject hard.** "Understandable, attractive, correct, on-style" is
   necessary and not enough. Revise until it creates a strong impulse to continue.
4. **Design frame 1**: would a viewer stop if this appeared silently in the feed for a
   fraction of a second?
5. **Design the first second**: something meaningful happens; the first second never just
   holds frame 1.
6. **Design the first five seconds as a mini-story** that progresses: subject, an unresolved
   question, visible stakes, a change or escalation, more evidence, another unanswered
   implication. Every visual state must name the new reason it gives the viewer to stay.
7. **Run the opening gate** (RULES.md, "The five-second gate"), including the stricter muted
   test. Do not move on until it passes. The founder approves the opening before the rest of
   the frame plan is treated as locked.

### 6. Semantic beats

A beat is ONE meaningful idea: one sentence, several, or part of one. Map every line of the
script to a beat, so nothing he says is silently dropped. The opening's beats are already
decided; fit the rest around them.

### 7. Minimum semantic text spine

For every beat, write what a silent viewer must UNDERSTAND. Then run the four text tests
(RULES.md) on every phrase you are tempted to put on screen. What survives is the spine: the
minimum words and numbers that must stay visible after everything that can be shown has moved
into the picture. The spine is NOT the frame list; one anchor usually spans several frames.

### 8. Visual substitution

Nothing removed from the text is discarded: it moves, explicitly, into the picture. For every
beat record **spoken meaning**, **text spine** (or NONE), **visual information**, **visual
action** and **reference requirements**.

### 9. Visual sequences and the rest of the frame plan

Group the remaining beats into sequences: one visual world or metaphor that evolves across
several frames. Give each an approximate duration (recording, or ~150 spoken words a minute).
Expand each into frames. A new frame is justified ONLY by a meaningful change in composition,
focal subject, visual state, a cause/effect step, camera concept, metaphor, time, comparison,
proof, product state, emotional state, or a reveal; never because the next sentence began.

Density is not even across time: RETENTION density first (the opening may hold several
visual states in five seconds), EXPLANATION density after (a six-second explanation may be one
evolving composition). The total is an outcome; sanity-check it against the runtime (a ~3:30
reel lands roughly 40 to 70 frames) without forcing a number.

### 10. Full sound-off QA

Audio muted, captions hidden, only pictures and spine text. Answer: who or what is this about;
what problem is occurring; what causes it; what consequence follows; what comparison or reveal
matters; what solution appears; what should the viewer do. If any is unclear, FIRST change the
visual; add text only if the picture stays ambiguous, and record why.

## Output: the planning document

Write it to `videos/reel-plans/<slug>.storyboard.md` (text, committed, next to the reel plan).
The opening comes first and can be approved on its own before the rest is written.

```
# <slug> storyboard plan
Project file: .claude/skills/fan-economy-storyboard/projects/<file>.md  (art direction version)
Runtime basis: recording | script estimate, ~M:SS

## Story summary            (3 to 5 sentences)
## Causal chain             (arrows)

# OPENING RETENTION PLAN
## Primary curiosity gap    (what the viewer needs answered)
## Withheld payoff          (what is deliberately saved)
## Concepts considered      (each route, and why it lost or won)
## Frame 1                  (what appears instantly)
## Frame 1 comprehension    (what is understood in under a second)
## Frame 1 unanswered question
## First-second progression (the meaningful visual change)
## Second 1-2               (new information or context)
## Second 2-3               (how the question deepens)
## Second 3-4               (what keeps it from flattening)
## Second 4-5               (the new reason to continue into the body)
## Opening states           (each visual state: what it shows, text shown, the reason to stay it adds)
## Opening QA               (the five-second gate, with the muted test result)

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

## Full sound-off QA        (the seven answers, from pictures + spine only)
## Open questions           (anything only the founder can decide)
```

The per-second checkpoints are informational, not one frame per second: the opening may hold
more or fewer visual states.

## After the plan

- The founder approves the OPENING first, then the full plan, before any frame is generated.
  Style-calibration frames (a handful, to lock the look) may come earlier; they are never the
  storyboard.
- Image generation, when approved, follows the project file's execution notes. The model never
  spells editorial text: every word is set programmatically afterwards.

## Feedback

Founder notes on a plan: decide which layer the note belongs to (RULES.md, "How feedback
updates this skill"), write it there with the date and his words, and add a line to the
decision log. If unclear, it is this script only.
