# CRWN Image Generator

Generate Nano Banana Pro images from CRWN short-form video scripts. Extract visual elements from the bracketed stage directions, build the Nano Banana Pro prompt using the exact template, generate the image, and save it to the short-form folder in the Nano Banana output folder in Dropbox.

## Invocation

`/crwn-image-gen <script content, file path, or arc reference>`

Accepts:
- A single script pasted inline
- Multiple scripts in sequence (separate with `---` or paste back to back)
- A file path to one script or a directory of scripts
- An arc/calendar reference (e.g. "Arc 2 posts 1-9") when the scripts are in context or on disk

Do NOT ask follow-up questions. Process every script in order.

## Setup

- **API Keys**: `~/.bashrc` provides `GEMINI_API_KEY` and `BRAVE_API_KEY`
- **Style references**: `/mnt/c/Users/Merce/Desktop/nano banana references/` (4 PNG style refs, exclude `crwn-logo.png` and the `people/` subfolder)
- **People references**: `/mnt/c/Users/Merce/Desktop/nano banana references/people/` — photo refs of named artists, plus `known-people.json` listing each artist's search query, Wikipedia page, and aliases
- **Person-ref fetcher**: `/home/merce/.openclaw/workspace-crwn/fetch-person-ref.mjs` — exports `findMentionedSlugs`, `ensurePersonRefs`, `buildPersonRefParts`, `PERSON_REF_INSTRUCTION`. Uses Brave Image Search first, Wikipedia fallback. Skips re-download if photo already exists for that slug.
- **Output base**: `/mnt/c/Users/Merce/Dropbox/nano banana output/Shortform Posts/` (use this exact folder name with the space and capital letters — do NOT create `short form/` or any other variant)
- **No per-script subfolders for short-form** — all images land flat in `Shortform Posts/`
- **Image filename**: `[N]-[kebab-title].jpg` where N is the post number from the 90-day calendar (or 1, 2, 3... if numbering a fresh arc)
- **Model**: `gemini-3.1-flash-image-preview`
- **Aspect ratio**: `3:4` vertical (short-form portrait)
- **Output format**: `.jpg` (API returns JPEG data)
- **Delay between requests**: 8 seconds
- **Shell**: `bash -ic` to load API key from `.bashrc`

## Folder structure

```
/mnt/c/Users/Merce/Dropbox/nano banana output/Shortform Posts/
  1-video-title-1.jpg
  2-video-title-2.jpg
  3-video-title-3.jpg
  ...
```

All short-form images land flat in `Shortform Posts/`. No per-script subfolders. Filename = `[N]-[kebab-title].jpg`.

## Story-First Composition (THE #1 RULE — read before building any prompt)

Measured from real view counts on posts 1-60, the single biggest driver of performance is whether the **central illustration acts out the idea** — not whether the text/math is correct. Ranking by views:

- **#2 Drake $2M deal — 102k (best):** one giant legible number ($2,000,000) + Drake drawn as a CHARACTER hauling the money bag in handcuffs/chains, tagged "TRAP." The drawing *is* the thesis: the money is a shackle. Understood in under a second, before any reading.
- **#21 Masters — 52k:** recognizable faces (Jay-Z/Dame/Biggs) but they just float there; the story is told in side TEXT and a timeline. Recognition without a dramatized scene. Half of #2.
- **#1 / #3 — ~5k:** no scene, no real character; the "story" is stacked equations / sub-penny fractions. A spreadsheet.
- **#5 Not Like Us — 1.2k (worst):** most cluttered (pie chart + six dollar figures + three columns) and NO recognizable face at all.

**Lever order, most → least powerful:**
1. **A single central illustration that DRAMATIZES the concept** — a character in an action/situation that encodes the emotional payoff (chains = trapped, hauling a bag = burden, a vacuum sucking up streams = exploitation, a tiny crowd handing over cash = the small number that frees you). SHOW the idea; never make a calculation the focal point.
2. **The recognizable artist PERFORMING that action** — star power fused with the scene. A head-and-shoulders portrait alone is level-2 only; put the artist INTO the scene doing the thing.
3. **One oversized, instantly legible hook** — a single huge number or a curiosity question. NEVER lead with sub-penny fractions ($0.003 vs $0.007) or a wall of equations.
4. **Low clutter / clear hierarchy** — one dominant focal illustration + at most ~2 supporting numbers readable at thumbnail size. Everything else is small secondary support.

**How to apply when building EVERY prompt:**
- First decide the ONE picture that *is* the thesis, make it the largest element on the page, and write it into the prompt explicitly as the central illustration (biggest, center).
- **Artist posts:** draw the named artist DOING the action (e.g. "Snoop carrying a building labeled DEATH ROW on his back," "DMX straining against a chain bolted to a DEF JAM vault"), not a floating head beside equations. The auto-attached face ref binds to the figure in the scene.
- **If a post is ABOUT a specific artist (named in the title/filename), FEATURE their recognizable face in the hero — do NOT `skip-people`.** Reserve `skip-people` only for truly faceless concept/explainer posts with no central subject (pure metaphors). For a GROUP (e.g. TLC, En Vogue), name every member in the prompt and add them to `known-people.json` (with a `draw` note listing the members) so all faces render, not just one. When unsure, feature the face — a recognizable subject beats an anonymous figure.
- **Concept posts (no named artist):** build a visual metaphor scene that acts out the idea (e.g. a small circle of ~5 fans each handing a bill to one happy artist, dwarfing a giant empty stadium labeled "1,000,000 STREAMS = $0"). The metaphor carries it.
- Pick the single most emotional/surprising number as the giant hook; demote the rest of the math to a small support cluster.
- Hard clutter cap: if the page has more than ~6 distinct text blocks competing at similar size, cut or shrink until one illustration + one hook clearly dominate.
- Keep every existing rule (pure white #FFFFFF, 100% sharpie/no typeset, portrait likeness from the ref, 3:4).

**This reorders priorities: a dramatized scene beats a correct spreadsheet every time.** When a script's bracketed visuals read like a diagram, RECOMPOSE them into a scene — you are NOT obligated to copy a weak diagrammatic layout into the prompt.

**HYBRID is the standard (dramatized hero + RETAINED data).** Do NOT strip a data-rich script down to a single visual gag. The dominant dramatized hero scene carries the concept in one second, but KEEP the script's key diagram/data elements as supporting structure around or beneath it: the real numbers, the comparison, the timeline, the split/pie, the checklist. The hero makes them feel it; the retained data gives the page substance and rewatch value. Worked example: "#64 Tech N9ne standing on his STRANGE MUSIC building hoisting the album stack, WITH the 3-GOLD/2M/Forbes checklist and the two ownership pies kept beside it" — not the figure alone. Balance: ONE clear dominant hero + ONE giant hand-lettered hook, then the supporting data arranged cleanly, smaller, never competing with the hero. For pure concept/explainer posts, the hero is a metaphor scene and the data still rides alongside it (e.g. "#63 a circled paying group dwarfed by the faded 9,900 crowd, WITH the blended rent math beneath").

## Extracting visuals from a script

Read the **FULL SCRIPT WITH VISUALS** section of each script. Every instruction in `[brackets]` is a visual element. Compile every bracketed direction across HOOK, FORESHADOW, RISING ACTION, TWIST, PAYOFF, CTA into one cohesive scene description for the prompt.

For each element, capture:
- **What** to draw or write (the literal content)
- **Where** on the page (top, bottom, left, right, center, beside, below, above)
- **Size** (big, large, small, huge, tiny)
- **Emphasis** (circled, boxed, underlined, crossed out with X, check marked, in all caps, bold)

### Hard rule: every character is hand-drawn sharpie

NEVER allow any typeset, printed, computer, Arial, Helvetica, serif, or sans-serif font anywhere in the image. The bottom tagline, footer text, captions, lists, headers, numbers, labels, every single character must be hand-written with a sharpie marker. If even one word looks computer-generated, the image is a fail and must be regenerated. Reinforce this in the prompt's `[SPECIFIC CONTENT]` body too, especially around any bottom tagline.

**The #1 failure spot is the big HEADLINE at the top.** Because it's the largest text, the model most often renders it as a clean printed/bold/display font. Two guards, always:
- **Never write the word "bold" near text in a prompt.** Phrases like "giant bold capital letters", "bold caps", "in bold" all cue typeset. Instead always write: **"large hand-lettered black sharpie capitals (thick uneven hand-drawn marker strokes, NOT a printed, bold, or display font)"**.
- Explicitly state the headline is hand-drawn marker lettering with imperfect baselines and varying stroke widths, exactly like a person wrote it fast with a sharpie. The `STYLE_INSTRUCTION` in `generate-images.mjs` also carries a CRITICAL HEADLINE RULE saying the same — keep it there.

### Marker fill texture (solid black must look hand-drawn)

Any solid-black or filled-in area (filled shapes, redaction bars, blacked-out regions, shaded pie slices, thick fills) must look like it was **colored in by hand with a real sharpie**, never a flat digital fill. The prompt and the `STYLE_INSTRUCTION` must call for: visible directional marker strokes, uneven coverage, faint lighter streaks where the marker lifted, tiny flecks of white paper showing through, and slightly ragged edges, like a marker that was running a little dry. A perfectly uniform, smooth, vector-flat black is a fail. This texture lives INSIDE the fill only; it is NOT gray shading, the page background still stays pure flat white (#FFFFFF), and thin line work stays clean and bold.

### Visual style elements to use

- Bold handwritten text (numbers, words, key phrases) written large
- Stick figures with smiley faces or simple expressions
- Hand-drawn icons: doors, phones, envelopes, clocks, scales, pie charts, walls, arrows, boxes, timelines
- Circled numbers/words for emphasis
- Boxed text for key takeaways
- Underlined main points
- Crossed out text with big X marks
- Check marks for the correct/good option
- X marks for the wrong/bad option
- VS written big between comparisons
- Arrows showing direction, connection, or flow
- Dollar signs and math equations
- Lists with dollar amounts
- Simple hand-drawn two-column tables
- All-caps bold tagline at the bottom, underlined
- Everything fits on one page with clear hierarchy

## Nano Banana Pro Prompt Template

Every prompt MUST follow this exact structure. Never deviate.

```
Flat scan of a white sheet of paper filling the entire frame. No desk, no surface, no edges visible, just white paper. Black sharpie marker handwriting. [ALL VISUAL ELEMENTS FROM THE SCRIPT]. The background is pure white (#FFFFFF). The image is shot perfectly straight on, no angle, no shadow, no background elements. Pure white paper fills the entire 3:4 frame edge to edge.
```

## File and folder naming

All names are lowercase, hyphens instead of spaces, no special characters, no apostrophes, no colons, no commas. Numbers preserved as digits.

Examples:
- `POV: You Made $180 Off 3 Years` → `pov-you-made-180-off-3-years`
- `Streams Vs Fans For Artists` → `streams-vs-fans-for-artists`
- `1 Fan Vs 40,000 Streams` → `1-fan-vs-40000-streams`
- `POV: You'll Never Lose These Fans` → `pov-youll-never-lose-these-fans`

The post title to convert is the title field from the script (the first of the 5 title options, or the one explicitly marked as chosen). If the script has a numbered prefix in the source filename (e.g. `3-drake-80m-followers-1-percent.md`), use that exact kebab name.

## Auto-fetching person references

When a script names a specific real person (Drake, Kendrick Lamar, Lil Wayne, Beyoncé, etc.), the generated image should depict that person recognizably — not a generic stick figure. The pipeline:

1. **Detect**: import `findMentionedSlugs` from `fetch-person-ref.mjs` and run it against the script's text body. It returns kebab slugs (e.g. `["drake", "kendrick"]`) by matching the `aliases` arrays in `known-people.json`.
2. **Fetch if missing**: call `await ensurePersonRefs(slugs)`. For each slug, the helper checks `references/people/[slug].(jpg|png|webp|gif)`. If missing, it queries the Brave Image Search API with the artist's `search` query, downloads the first usable image (min 5KB, valid image format), and saves it as `references/people/[slug].<ext>`. If Brave returns nothing usable, it falls back to the Wikipedia REST summary endpoint using the artist's `wiki` page name.
3. **Attach**: build a `parts` array entry from each fetched photo via `buildPersonRefParts(refs)` and concatenate it onto the Gemini request alongside the style refs.
4. **Instruct**: include `PERSON_REF_INSTRUCTION` (exported by the helper) as a `text` part. It tells the model to capture the likeness but render the person as raw hand-drawn sharpie line work, not photoreal.

If a person isn't in `known-people.json` yet but shows up in a script, add them to the JSON before running — give them a kebab slug, a Brave search query, a Wikipedia page name (with underscores for spaces, e.g. `Tupac_Shakur`), and an aliases array covering nicknames.

If the fetch fails entirely for a person, log a warning and continue — the image will generate without that person ref attached, falling back to a generic stick figure.

## Generation Script

Write prompts to `/home/merce/.openclaw/workspace-crwn/generate-images.mjs` and run with `bash -ic 'node generate-images.mjs'` (timeout 600000).

The script must:
1. Load the 4 style reference PNGs from the references folder (exclude `crwn-logo.png` and the `people/` subfolder)
2. Include this style instruction in every request: `"Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and diagrams, high contrast black on white, no gray tones, no background texture. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL: ALL text in the image must be hand-drawn sharpie marker handwriting. NEVER use any printed, typeset, computer, Arial, Helvetica, serif, or sans-serif font anywhere in the image. Every single letter, number, word, label, and tagline must look hand-written with a sharpie. No typography, no mixed fonts, no computer-generated text. Top of page, middle of page, bottom of page, taglines, captions, footers, labels, lists, numbers, every character is hand-drawn sharpie. The reference images convey drawing STYLE ONLY (line weight, lettering, hand-drawn icon look), not content. Do NOT copy any text, words, logos, crowns, brand marks, or taglines from the reference images. Never draw the word 'CRWN', a crown symbol or logo, or marketing taglines like 'every dollar goes straight to the artist' or 'no middleman' unless the prompt explicitly asks for them. Draw ONLY what the prompt specifies."`
3. Build the full Nano Banana Pro prompt for each script using the template above
4. Pass `imageConfig: { aspectRatio: "3:4" }` and `responseModalities: ["IMAGE"]` in the config
5. Save the image as `.jpg` flat inside `Shortform Posts/` (no per-video subfolder)
6. Skip files that already exist (idempotent reruns)
8. Add 8-second delays between requests
9. Track success/failure counts and report at the end

## Workflow

1. Parse the user's input — identify all scripts to process
2. For each script:
   - Pull the post title and derive the kebab filename `[N]-[kebab-title].jpg`
   - Extract every bracketed visual element from FULL SCRIPT WITH VISUALS
   - Compose the prompt content (the bracketed middle of the template)
3. Write the generation script with all prompts
4. Run via `bash -ic 'node generate-images.mjs'`
5. Confirm each save and report any failures

## Output confirmation per script

After each successful generation:

```
[OK] [Post title]
  File: /mnt/c/Users/Merce/Dropbox/nano banana output/Shortform Posts/[N]-[kebab-title].jpg
```

End-of-run summary: total success / total failure / list of any failed titles with their prompts so they can be manually pasted.

## Error handling

If image generation fails for a script:
- Retry once (built into the script as a separate run, or by deleting any partial file and rerunning)
- If still failing, output the full Nano Banana Pro prompt so the user can paste it manually
- Continue to the next script (never abort the whole batch on one failure)

## Quality checks before each prompt

Verify before generating:
- [ ] **A single central illustration DRAMATIZES the concept and is the largest element** (artist performing the action, or a metaphor scene) — not a spreadsheet of equations or a floating portrait (see Story-First Composition)
- [ ] One oversized legible hook (number or question); no sub-penny fractions or equation wall as the focal point
- [ ] Clutter cap respected: one focal scene + ~2 supporting numbers dominate; rest is small
- [ ] Every bracketed visual element from the script is reflected in the prompt
- [ ] Prompt starts with `Flat scan of a white sheet of paper...` and ends with `...3:4 frame edge to edge.`
- [ ] Background specified as pure white (#FFFFFF)
- [ ] No desk, surface, angle, shadow, or background elements mentioned
- [ ] Aspect ratio 3:4 vertical
- [ ] Filename is `[N]-[kebab-title].jpg`, saved flat in `Shortform Posts/` (no subfolder)

## User argument

$ARGUMENTS
