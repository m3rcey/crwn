# Storyboard rules (layered)

Four layers, so one note can change one layer without breaking the rest:

1. **Permanent methodology**: how every script is planned. Changes only by founder decision.
2. **Learned failure modes**: mistakes already made once. Check every plan against them.
3. **Retired rules**: assumptions that were tried and reversed. Never bring one back.
4. **Decision log**: every meaningful founder decision, dated, with its layer.

Project art direction (palette, style, likeness, typography, references) is NOT here. It
lives per project in [projects/](projects/), because it changes from artist to artist.

## Precedence for visual decisions (founder, 2026-09-27)

This is the ONE place the order is defined; other rule files point here.

1. An explicit founder decision for the current project.
2. The current project calibration (its file in projects/).
3. This file's permanent storyboard methodology.
4. Generic visual defaults, including the reel editor's
   ([../fan-economy-reel-editor/RULES.md](../fan-economy-reel-editor/RULES.md)): "CRWN brand
   palette only", "real media first", "no fake artist models", and the palette in
   `scripts/reel/lib/compose.mjs`.

It governs ART DIRECTION only: style, palette, medium (illustration vs real media),
likeness treatment, composition, typography. Where a project calibration approves a
different treatment (Smino: a flat-vector illustrated likeness in a warmed natural palette),
the calibration wins over the defaults.

It never relaxes the methodology in section 1 (sound-off comprehension, visual substitution,
the text spine), which changes only by an explicit founder decision to change the METHOD.
And it never overrides these, which stay absolute in every project: security, factual
accuracy and qualifiers, product truth (real UI is a real screenshot, no invented features,
the CRWN claim gate), likeness drawn from the supplied references of the real person (never
an unrelated stand-in), and rights (uncleared artist photos and album art stay out of
anything published).

## 1. Permanent methodology

- **The governing rule.** Text carries the minimum semantic anchors required for
  comprehension; visuals carry everything else. Separate WHAT MUST BE UNDERSTOOD from WHAT
  MUST BE WRITTEN. The question is never "how few words"; it is "what exact text must stay
  visible for a silent viewer to follow the story, after everything that can be shown has
  moved into the picture?"
- **Understand the argument before splitting anything.** Story argument, then causal chain,
  then semantic beats. Sentence boundaries are never the unit of planning.
- **Can this be shown?** For every detail: if yes, show it and do not write it. If no, it is
  a candidate for the text spine. Usually visual: crowd energy, touring, buying tickets or
  merch, independence, a fan paying, recurring benefits, a calendar filling, a missed
  promise, a fan leaving, scattered apps, time passing, organization, retention, growth and
  decline, differences in scale, relationships between people. Usually text: names, exact
  numbers, money, durations, product names, the CTA keyword, comparison labels, abstract
  contrasts, and any exact claim that imagery would leave ambiguous.
- **Text-selection test** (every phrase, every time):
  1. If this text disappears, can the visual say the same thing clearly? Yes: remove it.
  2. Does it only describe what the image already shows? Yes: remove it.
  3. Does the viewer need this exact phrase to follow the causal relationship? Yes: keep it.
  4. Is it a proper noun, exact number, duration, product name, CTA or abstract contrast that
     cannot be inferred precisely? Yes: text is likely justified.
- **Visual substitution is mandatory.** Anything cut from the text is written into that
  beat's visual information and visual action. A cut with no visual destination is a loss,
  not an edit.
- **Text anchors are not frames.** One anchor usually spans several frames showing different
  visual states. A frame is justified by a meaningful visual change, never by a new sentence.
- **Frame count is an outcome.** Sanity-check it against the runtime (~3:30 lands roughly 40
  to 70 frames); never hardcode a number or an "every N seconds" cadence.
- **Prefer an evolving world** (one metaphor that changes state across a sequence) to a new
  composition per idea.
- **Captions are not editorial text.** Captions reproduce speech and are the reel editor's
  job. The spine is only the concepts that need written reinforcement. A frame can carry
  normal captions and zero editorial words.
- **Sound-off QA** answers the seven questions from pictures plus spine text only. Fix the
  picture first; add text second, and say why.
- **Plan on what he said.** When a recording exists, text and claims stand on spoken words;
  the script guards facts, qualifiers, the withheld figure, CRWN claims and the keyword.
- **Style calibration comes before generation, and it is not the storyboard.** A small set
  of calibration frames locks a project's look. It is never a scene structure or a count.
- **The image model draws no editorial text.** Words are set programmatically afterwards,
  where spelling, size and contrast are exact. Real product UI is a real screenshot placed
  in, never redrawn by the model.
- **No em dashes or en dashes in any on-screen text.**

### The opening (founder, 2026-09-27)

- **Priority order: frame 1, then the first second, then the first five seconds, then
  everything else.** The first five seconds are the retention battlefield: if they fail, the
  rest is irrelevant. They must be immediately understandable, visually arresting,
  curiosity-driven, constantly progressing, hard to predict, hard to scroll past, and tied to
  the video's actual payoff. They work with sound on or off, captions on or off.
- **The 90% rule.** About 90% of the storyboard's intensive creative exploration (concepts
  tried, compared, rejected and refined) goes into the first five seconds before the rest is
  treated as locked. It is a rule about THINKING effort. It does not mean 90% of frames, 90%
  of production budget, or a weaker remainder: the body still needs excellent pacing,
  comprehension and payoff. In practice: several idea-level opening concepts, a written
  comparison, a hard rejection pass, and a gate the opening must pass before the standard
  process starts on the remainder.
- **Frame 1** answers "would I stop if this appeared silently in my feed for a fraction of a
  second?" **The first second** answers "does something happen fast enough that I need what
  comes next?" (it never just holds frame 1). **The first five seconds** answer "does every
  beat deepen the curiosity gap or add another reason to stay?"
- **The first five seconds are a mini-story, and they progress.** Usually some combination of:
  subject recognition, an unresolved question, visible stakes, a change or escalation, more
  evidence or context, another unanswered implication. The viewer knows more at second 5 than
  at frame 1 and still does not know the answer. The same hook in several compositions is not
  progression.
- **Curiosity compounds and the primary gap stays open.** Nest the questions: "what is
  this?" -> "wait, how?" -> "why would these two outcomes differ?" -> "I get the premise, now I
  need the explanation". Each small reveal answers a small question while opening or deepening
  the larger one. The primary gap closes only at the reveal.
- **Every opening beat earns the next.** Each visual state names the new reason it gives to
  stay: introduces the subject, establishes stakes, creates or deepens a question, reveals a
  contrast, adds surprising context, shows cause or consequence, withholds a wanted answer, or
  makes the next visual necessary. "It looks cool" is not a reason.
- **Speed is not chaos.** Retention comes from clarity + novelty + progression + unresolved
  meaning, not random cuts, motion everywhere, clutter, flashing, ten subjects, unreadable
  copy, constant zooms or arbitrary pattern interrupts. Every state must decode instantly.
- **Selection criteria** (compare in prose, no numeric scores): instant comprehension,
  subject recognition, curiosity, stakes, progression, sound-off performance, simplicity,
  withholding, continuity into the story, truthfulness (the video delivers what the hook
  promises).
- **Reject on sight:** generic portraits, generic talking-head openings, logos, fades from
  black, title cards that HOLD (a question-only frame that starts transforming within about
  half a second is not one; see "Opening composition"), slow scene establishment, context before tension, explanations
  before questions, decorative animation, redundant states, the exact payoff shown early, and
  any frame that only becomes interesting once narration explains it. Understandable,
  attractive, correct and on-style is necessary, never sufficient.
- **The five-second gate.** Before the remainder is planned, by about five seconds the viewer
  must know WHO or WHAT this is about, WHAT question is being asked and WHY the answer could
  matter or surprise, and must NOT know the final answer. That is the contract: "stay and I
  will resolve this." Plus the stricter muted test below, and founder approval of the opening.
- **The opening gets a harsher sound-off test** than the rest: narration off, music off,
  captions hidden, only visuals and editorial text. A viewer must still understand enough to
  want the answer. If it only becomes compelling with voice, music or SFX, the visual hook is
  not strong enough yet: audio amplifies retention, it never creates it.
- **Density follows retention first.** Frames are not spread evenly by time: the opening may
  carry several planned visual states in five seconds while a later explanation holds one
  evolving composition.

### Opening composition (founder sketches, 2026-09-27)

Learned from the founder's hand-drawn Smino opening (question alone -> question rises as
the artist enters -> a closed hand opens on people -> push in, the value word drops in),
which beat a planned opening that put the face, the hand, the fans, the money mechanic and
the question all in frame 1.

- **Frame 1 has the lowest possible decoding cost.** Its job is to stop the scroll in a
  fraction of a second, and the fastest thing to decode is ONE element. When the hook is a
  question, that element can be the question itself, huge, filling the frame, provided it
  starts transforming within about half a second. Frame 1 poses the question; it does not
  have to show who, stakes and question all at once.
- **Build additively: one new element per beat.** Start near-empty and add exactly one piece
  of information at each beat (the question, then who it is about, then what is being
  valued, then the stakes). The viewer assembles the premise piece by piece, and every
  addition answers a small question while sharpening the big one. Complexity grows only as
  the viewer's investment grows. Budget: frame 1 holds one element; each later beat adds at
  most one.
- **Reveal in the order the sentence delivers it.** Each visual element enters on (or just
  after) the word that introduces it, never before. Showing the fans while the voice is
  still on "how much" spends the reveal early; letting "fans" arrive with the fans makes
  picture and speech one event.
- **Use a container that opens.** A closed hand, box, door or cover, then the reveal of
  what is inside, is a micro curiosity gap resolved inside the opening. Withhold the subject
  a beat, then open it.
- **Let the camera carry scale and focus.** Push in to make a small subject large (it fixes
  the "tiny figures at thumbnail size" problem without cramming them into a wide frame), and
  move or resize text to make room for what enters. A camera move is justified when it
  changes what the viewer is looking at or how big it is.
- **Do not visualize the answer's mechanism in the hook.** The question word carries the
  stakes ("WORTH?"); the money, the growth, the comparison belong to the reveal. A mechanism
  invented for the hook (coins, piles, meters) adds decoding cost and risks implying an answer.
- **The question can stay a question.** A question mark in the text keeps the gap explicit.
  The text in the opening can be as little as the question split into two moments (for
  example "HOW MUCH?" then "WORTH?"), each landing on its spoken word.
- **End the opening on the thesis image**: the subject of the question, close, with the
  question on it, readable as a thumbnail. It is the frame the whole opening was built to
  reach.

### Opening transitions (founder, 2026-09-27)

- **A transition is storytelling, not decoration.** For every meaningful visual-state change
  in the first five seconds, plan HOW state A becomes state B and WHAT that change says. Every
  opening transition must deepen curiosity, clarify cause and effect, reveal useful
  information, preserve continuity, or add meaningful momentum; one that does none of these is
  decorative and usually goes.
- **Prefer semantic transitions**, where one visual idea physically becomes the next: an
  empty space fills (scale), a line redraws into a different kind of line (one relationship
  turning into another), one group begins to split (a comparison arriving), a state flips on an
  object and its connections react (cause, then consequence). Useful techniques include match
  cuts, object morphs, spatial reveals, camera moves, transformations, visual handoffs, state
  changes and compositional reorganization. The method matters more than any technique.
- **Effects are not meaning.** Zoom, wipe, flash, spin, fade, whip pan, push, blur, a generic
  morph or camera shake are allowed only in service of a semantic transition, never because
  they look energetic.
- **Continuity over reset.** Carry an object, person, shape, motion, line, camera
  relationship or metaphor from one state into the next, so the idea unfolds in one world
  instead of becoming a run of unrelated posters. The shape to aim for is state -> semantic
  transition -> state -> semantic transition -> state, not image, cut, image, cut, image.
- **A transition can withhold.** Let something accumulate and stop before it resolves, or
  begin a split and hide where it ends. It never reveals the withheld payoff early.
- **The first second** is frame 1 stopping the scroll, then the first meaningful transition
  making the viewer feel something is actively unfolding: the change itself carries meaning,
  not just a second static image.
- **Transition gate** (every opening transition): (1) does it communicate something? (2) does
  it keep or deepen the curiosity gap? (3) does it clarify cause, scale, contrast, consequence
  or progression? (4) does it carry visual continuity? (5) does it create a reason to stay?
  (6) would the sequence be weaker with a plain cut here? If (6) is no, it is decorative:
  replace it with a plain cut or redesign it.
- **Transitions pass the muted test too**: no narration, music, SFX or captions. Their meaning
  reads from the picture alone; audio may strengthen it later, never explain it.

## 2. Learned failure modes

Each was seen in a real attempt. The plan must not show any of them.

1. **Script as slides.** Every sentence becomes a text card.
2. **One sentence, one frame.** Sentence boundaries decide the visuals.
3. **Over-stripping.** Text cut so hard (1 to 2 words per scene) that a silent viewer keeps
   isolated nouns and numbers but loses the argument. Seen on Smino, 2026-09-27.
4. **Redundant text.** The image shows it and the text says it again.
5. **Text instead of visual thinking.** A hard idea gets another headline instead of a
   visual concept.
6. **New copy on every frame.** Each visual change brings new words it did not need.
7. **Fixed scene count.** The calibration set gets treated as the storyboard's structure.
8. **Hardcoded art direction.** One artist's look leaks into another project.
9. **Generated image text.** The model is asked to spell words that code can set exactly.
   Even when told "no text", it slipped words onto props (a "VIP" pass, a "MEMBERSHIP" card,
   dates on a calendar), so every drawn surface must be named as blank.
10. **Ambiguous nouns.** "Fan silhouettes" drew electric fans; say "people".
11. **A named group drawn as strangers.** A reference photo of a real crew is an IDENTITY
    reference: draw those people, not generic stand-ins (Zero Fatigue, 2026-09-26).
12. **The first workable hook accepted.** One opening concept, taken because it works.
13. **Opening as ordinary beginning.** The first five seconds planned with the same attention
    as any other stretch, or as one subsection of the frame plan.
14. **A hook that recomposes instead of progressing.** The same statement shown several ways;
    the viewer knows nothing more at second 5.
15. **The payoff leaked early.** A withheld figure or answer appears in the opening and the
    primary curiosity gap closes.
16. **Audio-dependent hook.** The opening only works once narration, music or SFX carry it.
17. **Decorative transitions.** A zoom, flash or whip chosen for energy, adding no meaning.
18. **Poster, cut, poster.** Each opening beat a new unrelated composition, so the viewer
    restarts the scene every time instead of following one idea unfold.
19. **Front-loaded frame 1.** Everything packed into the first frame (face, hand, fans,
    circle, question), so it is slow to decode and the rest of the opening has nothing new
    to reveal, only small edits of a finished picture.
20. **Reveal ahead of the word.** A visual element shown before the voice introduces it.
21. **An invented hook mechanism.** A device the question does not need (coins raised,
    dropped and piled, a spinning meter), which costs attention and hints at an answer.
22. **State edits instead of motion.** An opening made of small changes inside one fixed wide
    shot, with no camera move or reveal to pull the eye forward.

## 3. Retired rules

Never resurrect these. Each says what replaced it.

- **"1 to 2 words maximum per scene."** Retired 2026-09-27: over-stripping lost the
  argument. Replaced by the minimum semantic text spine.
- **"One sentence = one frame."** Retired 2026-09-27. Replaced by semantic beats and
  visual-change frame justification.
- **"The 9 calibration frames are the storyboard."** Retired 2026-09-27. They lock the look;
  a ~3:30 reel needs roughly 40 to 70 planned frames.
- **"One project's style is the universal style."** Retired 2026-09-27. Art direction lives
  per project in projects/.
- **"Frame 1 must show who, what is at stake and the question at once."** Retired 2026-09-27
  (founder sketches). It front-loaded frame 1. Replaced by "Opening composition": frame 1
  poses the question with minimal decoding cost, and who and stakes arrive in the next beats.
- **"Reject every title card."** Narrowed 2026-09-27: reject title cards that hold; a
  question-only frame that transforms within about half a second is the fastest scroll-stop.

## How feedback updates this skill

Decide the layer first:

| The note is about... | It goes in... |
|---|---|
| how every script is planned (text vs visual, beats, frames, QA) | section 1, only on an explicit founder decision |
| a mistake worth never repeating | section 2 |
| reversing an earlier rule | move the old rule to section 3 with what replaced it |
| look, palette, likeness, typography, references for one project | that project file in projects/ |
| one script only | that script's `.storyboard.md` "Open questions" / notes, nowhere else |

If the layer is unclear, it is the narrowest one (this script only). Then add a line below.

## 4. Decision log

Newest first. Date, founder's words or decision, layer, what changed.

- 2026-09-27. The founder's four sketches of the Smino opening ("these compositions are
  better for achieving my goal ... understand the principles and methods to replicate in the
  future"). Method. Added "Opening composition" (lowest decoding cost for frame 1, additive
  one-element beats, reveal in sentence order, a container that opens, camera for scale and
  focus, no answer mechanism in the hook, the question stays a question, end on the thesis
  image), failure modes 19 to 22, two retired rules, and narrowed the title-card rejection.

- 2026-09-27. "Transitions, especially in the first five seconds, are part of the
  storytelling rather than decoration. Every meaningful opening transition should define how
  one visual state becomes the next, what meaning that transformation adds, and why it gives
  the viewer another reason to stay." Method. Added "Opening transitions" (with the transition
  gate) to section 1, failure modes 17 and 18, and the FROM / TO / TRANSITION MECHANIC /
  MEANING ADDED / RETENTION PURPOSE / CONTINUITY fields to the opening plan in SKILL.md.

- 2026-09-27. "The priority hierarchy is first frame, first second, first five seconds, then
  the rest of the video. Approximately 90% of intensive storyboard planning/refinement should
  be concentrated on making the first five seconds extraordinarily difficult to skip. The
  opening must work with or without sound and must truthfully preserve the video's primary
  curiosity gap." Method. Added "The opening" to section 1, failure modes 12 to 16, and
  reordered SKILL.md so the curiosity gap, withheld payoff and the opening (with its own gate,
  stricter muted test and founder approval) are solved before beats, spine and the remainder.

- 2026-09-27. "Reusable scripts/configuration required to reproduce those outputs should be
  repository-tracked once stable"; generated images and temporary outputs may stay local.
  Method (tooling policy). The Smino runner was reviewed and deliberately left local for now
  (too Smino-specific); the promotion plan and target location are in projects/23-smino.md,
  "Execution notes".
- 2026-09-27. "Project-specific, founder-approved art direction takes precedence over generic
  visual defaults." Method (precedence). Added the precedence section above; the reel
  editor's palette and real-media rules are now defaults (its RULES.md points here). The
  Smino conflict in TODO.md is closed.

- 2026-09-27. "Turn the storyboard methodology into a reusable, evolvable skill." Method.
  This skill created: causal chain first, minimum semantic text spine, visual substitution,
  anchors are not frames, sound-off QA. The four rules in section 3 retired.
- 2026-09-27. "Separate what must be understood from what must be written." Method. Replaced
  1 to 2 words per scene (over-stripped) and full sentences on screen (slides).
- 2026-09-26 to 2026-09-27. Smino style calibration (color, composition, figure-ground,
  typography). Project: recorded in projects/23-smino.md, not here.
