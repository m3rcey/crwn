# Nano Banana Prompt Sheet Generator

Read a video script and generate a Nano Banana Pro image prompt for every single sentence, describing what should be on the sheet of paper for that moment. One sentence = one slide. No exceptions.

## Instructions

When the user invokes `/nano-prompts`, they will provide:
1. A **script file path** or **script content** to convert
2. Optionally, an **output filename**

Read the script. Generate at least one prompt per sentence (more in INTRO/CTA/build-ups — see Visual Pacing Rules). Each prompt describes the finished sheet.

## Base Prompt Template

Every prompt must follow this exact format:

"Flat scan of a white sheet of paper filling the entire frame. No desk, no surface, no edges visible, just white paper. Black sharpie marker handwriting. [SPECIFIC CONTENT -- describe every word, number, drawing, circle, box, arrow, stick figure, and underline that appears on the sheet]. The background is pure white (#FFFFFF). The image is shot perfectly straight on, no angle, no shadow, no background elements. Pure white paper fills the entire 16:9 frame edge to edge."

## Visual Pacing Rules

- **HARD RULE (floor): every sentence gets at least one slide.** A sentence never shares a slide with another sentence. One sentence = one slide minimum. Zero exceptions — not for digestion, not for math, not for emotional beats.
- **Ceiling is uncapped.** Many sentences should get MORE than one slide when they contain multiple ideas, comparisons, or build-up moments. Use Add type for the second, third, etc. slide so it builds on the first.
- **High-density sections — multi-slide-per-sentence is common, use discretion:**
  - **INTRO** (everything before Point 1): rapid-fire. Most sentences benefit from 2+ slides — but use judgment. A sentence with a number + comparison, a setup + punchline, or two distinct beats should almost always split into multiple slides. A simple 3-4 word sentence ("Let's talk about it.") is fine as one slide. Lean toward splitting; don't force it when a sentence is genuinely atomic.
  - **CTA** (inside Point 3): treat like the intro. Most CTA sentences benefit from 2+ slides. Hard rules inside the CTA: AI manager capabilities appear one per slide (one speech bubble at a time — "do this next" is one slide, "fan slipping" is the next Add, "top spender" is the next Add). "thecrwn.app" gets its own dedicated slide. The CRWN logo reveal is its own slide. Pricing tiers each get their own slide. For everything else, split when the sentence has multiple distinct ideas or feature callouts — otherwise one slide is fine.
  - **Build-ups** (checklists, speech bubbles, revealing numbers, stair progressions): each item appears on its own Add slide, not all at once.
- **Default-density sections** (Points 1-3 body, Close): one slide per sentence is the norm. Split into multiple only when the sentence genuinely has two distinct ideas or a comparison.

## Visual Content Rules

- Each sheet should have hand-drawn images + text, not just text alone
- Use: stick figures, icons, simple drawings, arrows, circles, boxes, scales, funnels, phones, screens, speech bubbles
- Text on the image should be SHORT -- distill to key words/phrases, not full sentences
- People = stick figures (with appropriate expressions when specified)
- Emphasis = bold, underlined, or larger text
- Lists = checkmarks or bullet points
- Comparisons = two columns side by side
- Progress/change = arrows, timelines, stairs
- **Never use a guitar in any visual.** Whenever a stick figure would hold a guitar, use a mic instead.
- No gray tones -- only black and white
- No background textures
- No realistic drawings -- everything is hand-drawn sharpie style

## Add vs Sheet

- **Sheet**: Describe the complete new image from scratch.
- **Add**: Generate a new prompt that includes everything from the previous sheet PLUS the new element. The prompt must be fully self-contained -- the image API doesn't see previous images.

## Progress Indicator

- Appears ONLY on the FIRST slide of each major point. Not every slide.
- Add to that first slide's prompt only: "In the top left corner, a small label reads POINT X OF 3."
- Point 1 first slide = POINT 1 OF 3. Point 2 first slide = POINT 2 OF 3. Point 3 first slide = POINT 3 OF 3.
- All other slides within that point: NO progress indicator.
- Intro prompts: NO progress indicator.
- Close prompts: NO progress indicator.

## Roadmap Visuals

- Stairs drawn from the side view, ascending left to right
- Each step has a small hand-drawn icon AND the point label, sized proportionally (bottom step smallest, top step largest)
- Include a stick figure climbing the stairs positioned between steps
- The roadmap is STATIC. It looks exactly the same every time it appears. NO boxes around steps. NO circles around steps. NO steps crossed off. NO highlighting of any kind. The same unchanged visual every time.

## CTA Visuals

- Visual density must be HIGH during the CTA. At least one new visual per sentence, sometimes more. Treat it like the intro.
- "thecrwn.app" must appear on its own dedicated slide. Not crammed onto another visual.
- The CRWN logo is a geometric angular crown with three sharp pointed spires, diamond-shaped facets, and a flat base band. It is NOT a simple rounded cartoon crown. Always describe it as: "the CRWN logo, a geometric angular crown with three sharp pointed spires, diamond-shaped facets, and a flat base band, drawn in black sharpie."
- Every CTA visual should feature the CRWN logo prominently.
- When a prompt mentions CRWN or the logo, add this note above the prompt: "**NOTE:** Include CRWN logo reference image."

## Silent Autoplay Rule

The video autoplays without sound on the YouTube homepage. Visuals alone must communicate enough to stop scrolling.

- **First 5 seconds:** The visual must immediately create curiosity or tension.
- **First 20 seconds:** The visuals should communicate the core premise on mute.
- **First minute:** At least one surprising number, one compelling comparison, and one reason to stay. All without sound.
- Show enough to hook. Hide enough to make them click.

## End Screen Center-Funnel (Last 20 Seconds)

YouTube's end-screen card is placed **center-frame** during the last ~20 seconds of the video. The final visuals must leave the center of the frame empty and funnel the viewer's eye toward it.

Applies to: the final CLOSE sheet + the END SCREEN BRIDGE sheet (if the script has a bridge beat).

### Composition Rules

- **Center of the 16:9 frame must be empty/neutral.** No sharpie marks, text, or drawings inside the center ~40% area. Reserve this space for the YouTube end-screen card.
- **All sharpie content lives on the margins** — top, bottom, left, right edges only. Not across the center.
- **Funnel the eye toward center.** Every final sheet must include at least one funnel device:
  - Arrows pointing inward from corners or edges
  - Stick figures on the margins looking/gesturing toward the center
  - Converging sharpie lines from the corners
  - A hand-drawn frame, box, or bullseye outlining the empty center
  - Speech bubble tails pointing to center
- **Progression:** The CLOSE sheet begins the funnel (margins start clearing, first funnel device appears). The BRIDGE BEAT sheet is the most extreme version — all content compressed to the edges, bullseye composition, nothing in the center but white space.

### Prompt Template Addition

For CLOSE and END SCREEN BRIDGE sheets, append this to the standard base prompt (inside the "black sharpie marker handwriting" sentence chain, before "The background is pure white"):

> "The center of the frame is intentionally left empty — a clear rectangular area of pure white paper spans the middle of the 16:9 frame, approximately 40% of the total area. All handwritten content is positioned along the top, bottom, left, and right edges of the paper. [DESCRIBE THE FUNNEL DEVICE — e.g.: four sharpie arrows, one from each corner, all pointing inward toward the empty center / a stick figure on the bottom edge looking up and pointing toward the empty center / a hand-drawn rectangular frame outlined in the middle of the paper with nothing inside it / converging sharpie lines from all four corners meeting at the center]."

### What NOT to Do

- Don't place any text, numbers, or drawings in the center area on the final sheets
- Don't fill the whole sheet edge to edge with sharpie content on the CLOSE or BRIDGE BEAT
- Don't place the closing question or callback text in the middle of the frame — push it to the top or bottom edge
- Don't skip the funnel device — every end-screen sheet needs one

## Output Format

Number each prompt sequentially. Label with the single sentence it corresponds to.

```
[NUMBER]. SENTENCE: "[the one sentence from the script]"
TYPE: [Sheet or Add]
NANO BANANA PRO PROMPT: "[the full prompt]"
```

With section headers:

```markdown
# Nano Banana Pro Prompts -- "[Video Title]"

---

## INTRO (no progress indicator)

[entries]

---

## POINT 1: [TITLE]

[entries -- first entry only gets progress indicator]

---

## POINT 2: [TITLE]

[entries -- first entry only gets progress indicator]

---

## POINT 3: [TITLE]

[entries -- first entry only gets progress indicator]

---

## CLOSE (no progress indicator, center-funnel active)

[entries — center of frame empty, at least one funnel device directing eye to center]

---

## END SCREEN BRIDGE (no progress indicator, center-funnel MAXIMUM)

[entries — only include if the script has a bridge beat. Most extreme center-funnel composition: all content compressed to the margins, clear bullseye pointing to empty center.]
```

## Output Location

Save the prompt sheet to: `/home/merce/.openclaw/workspace-crwn/videos/nano-prompts/[NAME]_NANO_BANANA_PROMPTS.md`

## User argument

$ARGUMENTS
