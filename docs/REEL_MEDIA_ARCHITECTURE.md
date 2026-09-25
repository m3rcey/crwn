# Fan Economy reels: the mixed-media architecture (decision record, 2026-09-25)

Status: **proposed, prototype first.** Nothing here is implemented beyond two validation
probes. The full Smino reel is not rebuilt until the 20-second prototype below is approved.

## Why this exists

The 3D rebuild of the Smino reel (commit `077f3bdf`) fixed the structure (full-screen
visuals, voice-over storytelling, persistent concepts, full-frame product) and still looked
far below the five premium references. The founder asked what visual production system can
actually reach that class, and to verify rather than assume that the answer is "real media +
2.5D + 2D, 3D only where justified".

## What the references actually are (per-second classification, ~366 content frames)

All five are Cleo Abram "Huge If True" reels (browser screen captures; the reel crop is
x297 y175 336x500 in the 1280x720 recordings).

| Reel | Presenter | 3D / CG | Real video / physical demo | Real photo / evidence | Hybrid (CG or photo + 2D) | Flat 2D |
|---|---|---|---|---|---|---|
| 14M space | 9% | 81% | 0 | 0 | 10% (data-viz over CG) | 0 |
| 20M Antarctica | 14% | 48% | 0 | 15% (scientists, microscope, radar scan, credited) | 17% (photo cut-outs inside CG ice; arcs on an aerial photo) | 1% |
| 10M LEGO | 40% | 12% (brand product renders) | 46% (hands-on demo) | 0 | 0 | 0 |
| 11M giant squid | 26% | 20% (ROV) | 45% (real deep-sea footage) | 2% | 7% (diagram over real water) | 0 |
| 8M flat Earth | 18% | 67% | 7% | 0 | 8% (person cut-out on CG Earth) | 0 |
| **All five** | **~21%** | **~47%** | **~17%** | **~4%** | **~9%** | **~1%** |

Findings, which correct the brief's expectation in one respect:

1. **The references DO use heavy 3D (~47%), but a different kind.** Photoreal CG built from
   real imagery: satellite-textured Earth, photographic ice, volumetric light, depth of field,
   real photo cut-outs (statues, a mammoth) floating inside the CG. It is used where no camera
   can go: space, the planet's core, 4km of ice.
2. **Where real footage exists, it dominates** (10M and 11M are mostly real footage and
   physical demonstration).
3. **Flat 2D motion design is almost absent (~1%).** Their "graphics" are ANNOTATION ON REAL
   IMAGERY: arcs over an aerial photo, a circle on a radar scan, red dots on a satellite map,
   lime tags and counters pinned to objects, and small "Credit:" lines on evidence.
4. One accent colour, one caption line, and the presenter always full-frame.

For Fan Economy topics the subject has real media (the artist, the album, the CRWN product),
and the mechanisms (fans paying over time) are abstract. So the reference PRINCIPLE translates
to: real media wherever it exists; annotated real imagery and 2.5D for the rest; 3D only if it
can be photoreal and built from real textures, which our procedural stack cannot do.

## Why the current 3D failed (seen in the render, not assumed)

- Primitive geometry and flat materials: capsule fans with gold sphere heads, boxes, planes.
  No photographic texture anywhere; the eye reads it as a game.
- The artist as a toy figure: faceless, mannequin joints, generic. It does not read as Smino.
- One environment for everything: a dark void with a gold dot floor, repeated for dozens of
  scenes. The references never repeat an environment.
- Repetition of the same hero objects (100 gold heads) until they stop meaning anything.
- Drawn "UI" cards as flat textures on planes, which look like placeholders.
- Software WebGL: no bloom, no depth of field, no motion blur, 0.5-1s a frame.

What it did prove and should be kept: full-screen confidence, one concept evolving across
lines, a reveal the viewer SEES (3 stacks against 36), product owning the frame, sound on
visual events, and every guardrail below.

## The architecture

### Media hierarchy, per beat (from the spoken transcript)

1. **Real subject media**: artist photography, album art, real footage, CRWN UI recordings,
   evidence screenshots. Used full-frame, with a camera move and restrained annotation.
2. **2.5D editorial compositing** of real photographs: cut-out subject over a DIFFERENT real
   background (blurred, graded), type and objects placed in depth, virtual camera.
3. **Annotation on real imagery / textured 2D**: counters, circles, arrows, pins, highlight
   boxes, timelines and calendars drawn OVER real photographs or textures, never on a void.
4. **Full-screen UI / screen recording**: CRWN product, calculator.
5. **Physical demonstration B-roll** shot by the founder (the 10M/11M lever): a phone
   showing CRWN, a paper calendar with a date circled, cash counted into stacks, hands.
6. **3D only when photoreal from real textures.** Not with the current procedural stack.

The founder's A-roll stays at ~20-30%, full-frame, where he adds trust and emphasis.

### The 2.5D pipeline (validated 2026-09-25)

source photo (provenance sidecar) → LOOK at it → rembg cut-out (isnet-general-use, the
existing Windows venv) → trim to the alpha box → compose in HyperFrames with CSS 3D:

- layers with `translateZ` inside a `perspective` root, a GSAP "camera" (push, drift,
  slight rotateY) giving true parallax;
- the background is ANOTHER real image (a second photo of the artist on stage, the album
  art, a crowd), blurred and darkened as depth of field. The 20M reference does exactly this
  (cut-outs placed into a new environment, not back onto their own photo);
- type behind the subject (`data-layout-allow-occlusion`), drop shadows, rim gradient,
  film grain (SVG turbulence, `mix-blend-mode: overlay`), vignette;
- a credit line on every sourced image.

Probe result: renders correctly in HyperFrames, 5s for two snapshots, lint and runtime clean,
visibly closer to the references than any 3D frame. Background inpainting with OpenCV (already
installed with rembg) was also tested: acceptable on a dark, even backdrop, visibly smeared on
a bright textured one, so the pipeline avoids needing it (new-background compositing) rather
than adding a heavier model.

### Textured 2D / annotation primitives (to build, HTML + SVG + GSAP)

Each draws over a real image or texture, in CRWN colours, one accent at a time:
Counter (odometer), Circle/underline (hand-drawn stroke reveal), Arrow/callout, Pin, Timeline
(ticks, launch spike, month markers, a missed month), Calendar grid (dates checked or missed),
Member dots (100 fans as a dot field that fills, leaves, stays), Payment flow (dots travelling
along a path), Stack/bar growth (3 against 36, textured), Split compare, Retention curve,
Collage frame (photo cards with shadow and slight rotation), Mask wipe/reveal.

### Sound (unchanged principle)

Cues on visual events (card lands, mask reveal, camera push, counter tick, impact on a
figure), silence before payoffs, voice > music > SFX. The existing procedural library covers it.

## Reuse, gaps, retire

**Reuse as is:** phrase-integrity gate (`lib/boundaries.mjs`); spoken-transcript planning and
the SPOKEN/UNSPOKEN checks; withheld/fact-lock/claim/CTA/provenance validators; the Footage
component (full-frame UI, virtual camera, playback rate); authored plans anchored to spoken
words; storyboard stage and gate; captions; sound events and music drops; HyperFrames +
GSAP; rembg venv + trim; Commons sourcing with sidecars; the counter logic.

**Genuine gaps:**
1. **Artist media rights and coverage (founder decision).** Commons has only a handful of
   usable Smino photos (mostly 2016). Official press photos need the artist's or label's
   permission; editorial licences (Getty etc.) generally exclude promotional use, and a CRWN
   reel is promotional. Album art is the label's copyright: using it is a fair-use/commentary
   judgment or needs permission.
2. **A 2.5D scene component** (`Layers`: layers with depth, blur, shadow, fit; camera keys)
   and the textured 2D primitives above. HTML/CSS/SVG/GSAP only; no new dependency.
3. **Physical B-roll** for mechanism beats: a shot list per script for the founder to film
   (no technology).
4. **Neutral real imagery** for abstract beats (a crowd, a calendar, cash): CC0/public-domain
   sources, or the founder's own photos.

**Retire:** the `figure` primitive (no fake artist models), the `stage` primitive, capsule
`fans` as a hero visual, the dot-floor void as a default environment, drawn cards on 3D
planes, and the storyboard rule that accepts a 3D figure as the artist.

**Keep for later (not the prototype):** the WebGL world engine and its deterministic seek
pattern, the camera/drift lints, the world-text guardrails. They are sound; the ART was the
problem. A 3D beat returns only if it can be made photoreal.

## The prototype (about 20 seconds, before any full rebuild)

Spoken lines 0, 1, 3, 7 of script 23 (a project `exclude` cut, ~20.2s):

| Time | Line (spoken) | Treatment | Tests |
|---|---|---|---|
| 0:00-5.7 | "How much could Smino's first 100 paying fans end up being worth as an independent artist?" | 2.5D: Governors Ball cut-out over a second, blurred stage photo, SMINO behind him, member-dot field filling beneath, $ ? ? ? | artist-photo hook, 2.5D, annotation |
| 5.9-7.4 | "You're about to find out." | A-roll punch, riser drop | the transition back to A-roll |
| 7.5-13 | "Now he put out Maybe in Nirvana in December 2024, his first independently released album." | Collage: album art in depth, NYE cut-out in front, a performance photo entering, date annotation | real album/photo collage |
| 13-20 | "Going independent is a launch problem for about a month, and a DELIVERY problem for the rest of your life." | Textured 2D timeline over a real calendar/texture: launch spike, then the line running on, DELIVERY on the word | the premium 2D mechanism |

Why this section: it is the only 20 seconds that contains all five scene types the decision
depends on (artist hook, 2.5D, collage, mechanism, A-roll transition). The reveal is not in
it on purpose: it depends on the mechanism language this test proves.

Blocked on the founder: which artist images and whether album art may be used (gap 1).

## Acceptance criteria (the founder's eye decides)

- Placed beside the 14M/20M references, the hook reads as the same class, not as a template.
- It is unmistakably Smino within one second, from real imagery.
- Depth is real: foreground, subject and background move at visibly different rates, and
  nothing ghosts, halos or shows a cut-out edge.
- The album collage feels art-directed (hierarchy, depth, light), not a stack of pictures.
- The 2D mechanism has texture and motion inside the scene, reads with sound off, and never
  sits on a blank void.
- The cut back to A-roll feels deliberate.
- Captions subordinate; sound lands on visual events; no clipped word (the gate passes).
- Technical QA passes; render time per second of reel is recorded.
