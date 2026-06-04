# Instagram Carousel Generator

Generate a complete 1:1 square Instagram carousel in CRWN's black-sharpie-on-white-paper style: plans the slide arc, writes a Nano Banana Pro prompt per slide, and calls the API to render every image. End-to-end in one command.

## Invocation

`/carousel <topic or message> [| slides=N] [| ratio=1:1]`

The user supplies:
1. **Topic / message** (required) -- the idea the carousel sells. Examples: "streaming is broken", "what fans really want", "8% beats 30%".
2. **slides=N** (optional) -- number of slides, 3 to 10. If omitted, decide based on the topic.
3. **ratio=W:H** (optional) -- aspect ratio override. Default `1:1`.

Examples:
- `/carousel streaming is broken`
- `/carousel what fans really want | slides=6`
- `/carousel 8% beats 30% | slides=5 | ratio=4:5`

If the user just types a topic with no `|` flags, treat it as the topic and pick the slide count yourself.

## Setup

- **API Key**: `GEMINI_API_KEY` from `~/.bashrc` (must use `bash -ic`)
- **Style references**: `/mnt/c/Users/Merce/Desktop/nano banana references/` (the 4 sharpie reference images, exclude `crwn-logo.png` from the default set)
- **CRWN logo reference**: `/mnt/c/Users/Merce/Desktop/nano banana references/crwn-logo.png` -- include only when a slide prompt mentions CRWN
- **Output parent folder**: `/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts/`
- **Topic folder**: kebab-case slug of the topic, lowercase, no punctuation, dashes for spaces (e.g. `streaming-is-broken`, `what-fans-really-want`). Create `Carousel Posts/` parent if missing. Create the topic folder if missing. If it already contains output, ask before overwriting.
- **Output files inside the topic folder**:
  - `prompts.md` -- the full prompt set
  - `caption.md` -- the Instagram post caption (hook + body + hashtags)
  - `slide-01.png`, `slide-02.png`, ... `slide-NN.png` -- the rendered images
- **Model**: `gemini-3.1-flash-image-preview`
- **Delay between image requests**: 8 seconds to avoid rate limits

## Fact Check Protocol (MANDATORY — do this BEFORE writing slides AND AGAIN before saving)

If a carousel names a real artist, deal, lawsuit, award, album, sales figure, or date, it can be fact-checked by anyone reading. Getting one wrong (wrong Grammy year, a fabricated lawsuit amount, an outdated follower count, the wrong producer on a song) makes the whole carousel look sloppy. **Do not trust training-data memory — music-industry facts move constantly. Use web search.**

- **BEFORE writing slides:** list every checkable claim (artist names / who's signed where, deal terms and whether a dollar figure was actually *reported*, lawsuit details including the amount or that none was disclosed, award ceremony YEAR + win count, album release date / label / whether it's out yet, who **produced** vs wrote/performed a song, label-imprint structure, follower/listener counts, "[artist] said [thing]") and verify each with a web search.
- **WHILE writing:** hedge estimates ("reportedly", "around"); state hard facts (years, names, counts, dates) precisely; frame contested things as rumors.
- **AFTER writing, BEFORE saving:** re-scan every slide for proper nouns, years, dollar amounts, and specific claims; confirm each against your research; soften or cut anything you can't confirm; do the arithmetic on any math. Never ship a fabricated figure attributed to "reports."

This applies on every run, even for topics that "feel obvious."

## Carousel Arc (plan before writing prompts)

Before generating prompts, draft the slide-by-slide arc in your head:

- **Slide 1 -- HOOK.** Bold statement or number. Fewest words on the whole carousel. Biggest text. Stops the scroll. Minimal clutter, almost no decoration. **If the carousel is about a specific named person (an artist, executive, or historical figure), slide 1 must include a hand-drawn sharpie portrait of that person.** The portrait sits at the top of the slide, the hook line sits below it, the rest of the math/argument is pushed to slide 2 and beyond. Person references are pulled from `/mnt/c/Users/Merce/Desktop/nano banana references/people/known-people.json` and the image generator loads the photo automatically when the slide 1 prompt explicitly names the person and asks for a portrait. Skip the portrait only when the carousel is a generic concept (no specific person) like "content vs offers" or "fans spend $150 a month". **Slide 1 must also end with a "SWIPE for More ->" cue at the bottom. Do NOT put this in the slide-1 prompt (the model places it inconsistently and it overlaps the hook). It is stamped on after rendering as a mandatory post-step (see "Swipe Cue on Slide 1").**
- **Middle slides -- ARGUMENT.** One concept per slide. Use math, comparisons, stick-figure mini-stories, crossed-out wrong answers, check marks for right answers. Build the case. Never cram two ideas onto one slide.
- **Final slide -- TAKEAWAY.** The most shareable, quotable line of the whole set. One bold sentence. Underlined or boxed. Screenshot-able on its own.

Slide count guidance (when the user doesn't specify):
- 3 slides: hook + 1 argument + takeaway. Use only when the idea is atomic.
- 5 slides: hook + 3 arguments + takeaway. Default for most topics.
- 7-10 slides: hook + 5-8 arguments + takeaway. Use for math breakdowns, side-by-side comparisons, or step-by-step stories.

## Base Prompt Template

Every prompt must follow this exact format. Only what's inside the brackets changes:

> "Flat scan of a white sheet of paper filling the entire frame, cropped to a perfect square. No desk, no surface, no edges visible, just white paper. Black sharpie marker handwriting. [DESCRIBE THE TEXT -- exact words, how large, placement on page, any words circled, boxed, or underlined]. [DESCRIBE ANY DRAWINGS -- stick figures, arrows, simple illustrations, dollar signs, phones, doors, scales, pie charts]. [DESCRIBE EMPHASIS -- what is crossed out, what has check marks, what is boxed or circled big]. The background is pure white (#FFFFFF). The image is shot perfectly straight on, no angle, no shadow, no background elements. Pure white paper fills the entire 1:1 square frame edge to edge."

If the user overrode the aspect ratio (e.g. `ratio=4:5`), swap every occurrence of `1:1 square` and `perfect square` in the template for the new ratio (e.g. `4:5 portrait`). Keep everything else identical.

## Prompt Rules (enforce strictly)

- **Never use em dashes** in any text that appears on the image. Use periods, commas, parentheses, or two short sentences instead.
- **Never include the user's name or any signature** ("Josh", "Mercey", "m3rcey", "- Josh aka Mercey", etc.). No bylines on CTA slides. End on the URL or CTA.
- **All text must be hand-drawn sharpie handwriting.** No printed fonts. No typeset bold (Arial Black, Impact, Helvetica Bold, etc.). No digital lettering. Even the biggest, boldest words on hook slides must look hand-written with a marker. Always reinforce this inside any prompt that has very large bold text: add the phrase "drawn by hand in sharpie, not typed, not a printed font, every letter slightly imperfect like a real marker stroke".
- **5th grade reading level** for everything written on the paper. Short words, short lines.
- **Numbers and math are encouraged** -- they make slides more compelling. Use real prices, percentages, fan counts, dollar amounts.
- **One concept per slide.** Never cram two ideas. If you find yourself writing "AND" between concepts, split into two slides.
- **Hook slide has the fewest words and the biggest text.** No supporting drawings unless they add tension. White space is the point.
- **Final slide is the most shareable line of the carousel.** Boxed or underlined. One sentence. The kind of thing someone would screenshot and post.
- **Drawings stay primitive.** Stick figures (round head, line body, line limbs). Circles for faces. Squares for boxes. Arrows are single lines with a triangle tip. Never describe anything as "detailed", "polished", "stylized", or "designed". Always raw sharpie sketch.
- **No guitars.** If a stick figure would hold a guitar, use a mic instead.
- **No gray tones.** Pure black sharpie on pure white. No shading.
- **Always describe exact placement** -- top center, lower left, center of page, etc. Always describe exact emphasis -- what is circled, what is boxed, what is underlined, what is crossed out, what has a check mark.

## Visual Vocabulary (use freely)

- Stick figures (with simple facial expressions: flat line mouth, O-shape mouth, frown, smile)
- Speech bubbles
- Arrows (straight, curved, double-headed)
- Circled numbers for steps (1, 2, 3 inside a circle)
- Boxed text for emphasis
- Underlined words for emphasis
- Crossed-out wrong answers (single diagonal line or X)
- Check marks for right answers
- Dollar signs, percent signs, equals signs
- Simple math: `$10 x 100 = $1,000`
- Side-by-side columns: a header on each side, items listed below, a vertical dividing line
- Pie charts (rough hand-drawn circle with one wedge), bar charts (rough rectangles of different heights)
- Phones (rounded rectangle with a smaller rectangle inside), doors (rectangle with a small dot for handle), scales (triangle base with a balance beam), stairs (zigzag line ascending)

## caption.md Output Format

Every carousel ships with a `caption.md` in the same topic folder. This file is the raw Instagram caption, copy-pasted straight under the carousel at upload time. **No section headers, no markdown title, no labels.** Just the caption text exactly as it should appear on Instagram.

Save it in this exact structure (everything below the fence is the file contents):

```
[Hook line: the strongest title-style line for this carousel. Title-cased, under 60 characters. Stops the scroll in the feed before the swipe starts. Different wording than slide 1.]

[Optional body: 1 to 3 short lines. One idea per line. Plain language, 5th grade reading level. Adds context the slides don't, or sharpens the takeaway. Skip the body entirely if the hook plus CTA stand on their own.]

Link in bio to [holy grail outcome from this specific carousel] with CRWN. Free to start at thecrwn.app.
```

A blank line separates the hook from the body and the body from the CTA. If there is no body, the file is just the hook, a blank line, and the CTA.

Caption rules:
- **No headers, no labels, no title line in the file.** The file contents must be paste-ready. Anything else creates friction at upload.
- **The CTA is always last and always uses the shortform format verbatim:** `Link in bio to [outcome] with CRWN. Free to start at thecrwn.app.` Do not invent alternative CTA wordings. Do not add lines after it. Do not append hashtags.
- **The `[outcome]` connects to THIS carousel's specific payoff** (e.g. "turn one true fan into real monthly income", "stop selling streams and start selling fans", "own the price you charge"). Never use a generic CRWN line.
- **No hashtags.** Do not append any hashtag block to the caption.
- **No em dashes.** Same rule as the slides.
- **No name/signature.** No "Josh", "Mercey", or "- Mercey" sign-off.
- **Don't repeat slide 1 verbatim.** The caption complements the carousel, doesn't echo it.
- **No "swipe" prompts in the caption text.** The "SWIPE for More ->" cue lives on the slide-1 image only (stamped per the swipe step); it never goes in the Instagram caption.
- **Plain talk.** Same voice as the slides. Short sentences. Direct.

## prompts.md Output Format

Save `prompts.md` to the topic folder in this exact structure:

```markdown
# Carousel Prompts -- "[Topic]"

Aspect ratio: [1:1 or override]
Slide count: [N]

---

## SLIDE 1 (HOOK)

PROMPT: "[the full prompt for slide 1]"

---

## SLIDE 2

PROMPT: "[the full prompt for slide 2]"

(... etc through slide N ...)

---

## SLIDE N (TAKEAWAY)

PROMPT: "[the full prompt for the final slide]"
```

## Image Generation

Write the generation script to `/home/merce/.openclaw/workspace-crwn/generate-carousel.mjs` and run with `bash -ic 'node generate-carousel.mjs'` (timeout 600000 for batches).

The script must:
1. Read the just-written `prompts.md` and parse out each slide prompt in order
2. Resolve the output folder (same folder as `prompts.md`)
3. Load all style reference images from the references folder (exclude `crwn-logo.png` from the default set)
4. For each prompt: if the prompt text mentions "CRWN" or "crwn logo", also load `crwn-logo.png` as an extra reference
5. Include the style instruction (see below)
6. Call the Gemini API once per prompt with 8-second delays between calls
7. Save each output as `slide-NN.png` where NN is zero-padded (01, 02, 03 ...)
8. Track and report success/failure counts; retry failures once before giving up

### Style instruction (use verbatim)

> "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and stick figures, high contrast black on white, no gray tones, no background texture, no paper edges, no shadows. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL: every single word on the page must be hand-drawn sharpie handwriting. Never render any text in a typeset/printed/digital font like Arial Black, Impact, or Helvetica Bold, no matter how large or bold the text is. Even the biggest headline words must look hand-written by a marker, with slightly imperfect strokes, not typed. IMPORTANT: The reference images convey drawing STYLE ONLY (line weight, lettering, hand-drawn icon look), not content. Do NOT copy any text, words, logos, crowns, brand marks, or taglines from the reference images. Never draw the word 'CRWN', a crown symbol or logo, or phrases like 'every dollar goes straight to the artist' or 'no middleman' unless the slide prompt explicitly asks for them. Draw ONLY the exact words and marks specified in the slide prompt, and nothing else. The output must be a perfect square 1:1 aspect ratio (or the override ratio specified in the prompt) with pure white #FFFFFF filling all negative space."

### Script template

```js
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const PROMPTS_FILE = "<ABSOLUTE PATH TO prompts.md>";
const REF_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references";
const CRWN_LOGO = path.join(REF_DIR, "crwn-logo.png");

const STYLE_INSTRUCTION = "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and stick figures, high contrast black on white, no gray tones, no background texture, no paper edges, no shadows. Match the lettering weight, spacing, and hand-drawn aesthetic exactly. CRITICAL: every single word on the page must be hand-drawn sharpie handwriting. Never render any text in a typeset/printed/digital font like Arial Black, Impact, or Helvetica Bold, no matter how large or bold the text is. Even the biggest headline words must look hand-written by a marker, with slightly imperfect strokes, not typed. IMPORTANT: The reference images convey drawing STYLE ONLY (line weight, lettering, hand-drawn icon look), not content. Do NOT copy any text, words, logos, crowns, brand marks, or taglines from the reference images. Never draw the word 'CRWN', a crown symbol or logo, or phrases like 'every dollar goes straight to the artist' or 'no middleman' unless the slide prompt explicitly asks for them. Draw ONLY the exact words and marks specified in the slide prompt, and nothing else. The output must be a perfect square 1:1 aspect ratio (or the override ratio specified in the prompt) with pure white #FFFFFF filling all negative space.";

function parsePrompts(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const sections = text.split(/^## SLIDE /m).slice(1);
  return sections.map((section, idx) => {
    const match = section.match(/PROMPT:\s*"([\s\S]*?)"\s*(?:\n---|\n## |$)/);
    if (!match) throw new Error(`Could not parse PROMPT in slide ${idx + 1}`);
    return { number: idx + 1, prompt: match[1].trim() };
  });
}

function loadRef(file) {
  return {
    inlineData: {
      mimeType: file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      data: fs.readFileSync(file).toString("base64"),
    },
  };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
  const ai = new GoogleGenAI({ apiKey });

  const slides = parsePrompts(PROMPTS_FILE);
  const outDir = path.dirname(PROMPTS_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const styleRefs = fs.readdirSync(REF_DIR)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .filter(f => f !== "crwn-logo.png")
    .map(f => path.join(REF_DIR, f));

  let ok = 0, fail = 0;
  const failures = [];

  for (const slide of slides) {
    const outName = `slide-${String(slide.number).padStart(2, "0")}.png`;
    const outPath = path.join(outDir, outName);
    console.log(`\n[${slide.number}/${slides.length}] Generating ${outName} ...`);

    const refParts = styleRefs.map(loadRef);
    if (/CRWN|crwn logo/.test(slide.prompt)) {
      refParts.push(loadRef(CRWN_LOGO));
    }

    const parts = [...refParts, { text: STYLE_INSTRUCTION }, { text: slide.prompt }];

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["image", "text"] },
      });
      let saved = false;
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, "base64"));
          console.log(`  Saved: ${outPath}`);
          ok++;
          saved = true;
          break;
        }
      }
      if (!saved) { fail++; failures.push(slide.number); console.error(`  No image returned for slide ${slide.number}`); }
    } catch (e) {
      fail++;
      failures.push(slide.number);
      console.error(`  FAILED slide ${slide.number}: ${e.message}`);
    }

    if (slide.number < slides.length) {
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  console.log(`\nDone. Success: ${ok}, Failed: ${fail}`);
  if (failures.length) console.log(`Failed slides: ${failures.join(", ")}`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
```

## Swipe Cue on Slide 1 (MANDATORY post-step)

Every carousel's **slide-01** must carry a hand-drawn sharpie "SWIPE for More ->" cue at the bottom. This is added AFTER the slides render, by compositing a pre-made asset onto the image, never by asking the model to draw it (the model places it inconsistently and it collides with the hook). The slide's artwork is preserved exactly: content is shifted up into the top region and the cue drops into a clean white band below it. This applies to 1:1 carousels; if a non-square ratio is used, skip the cue (the reflow math below assumes a square).

The reusable tooling already exists in `/home/merce/.openclaw/workspace-crwn/`:

- **Asset:** `/mnt/c/Users/Merce/Desktop/nano banana references/swipe-for-more.png` — the sharpie "SWIPE for More ->" text on white. If it is missing, regenerate it once with `bash -ic 'node gen-swipe-asset.mjs'` (one Nano Banana call, trimmed + normalised).
- **Stamper:** `apply-swipe.mjs` — for each carousel folder it backs the original up to `slide-01.orig.png` (once), then composites the cue **from that backup** (idempotent and reversible). It detects the slide's content rows, reflows them into the top `1024 - 104` px, scales only if the content is full-height, and centers the cue in the bottom band.

To stamp a single new carousel (the `/carousel` case), run it scoped to that folder:

```
bash -ic 'ONLY_FOLDER=<topic-slug> node apply-swipe.mjs'
```

To re-stamp every carousel at once (e.g. after changing the cue), run `apply-swipe.mjs` with no `ONLY_FOLDER`. Because it always composites from `slide-01.orig.png`, re-runs never double-stamp. To revert, copy each `slide-01.orig.png` back over `slide-01.png`.

## End-to-End Workflow

1. Parse the user's input: topic (required), slides (optional, 3-10), ratio (optional, default 1:1).
2. Slug the topic into kebab-case for the folder name.
3. Plan the arc (hook + middle slides + takeaway) and decide the slide count if not specified.
4. Generate one prompt per slide following the template and rules above.
5. Create `Carousel Posts/` parent folder if missing, then create the topic folder. If `prompts.md` already exists, ask before overwriting.
6. Write `prompts.md` in the exact output format above.
7. Briefly tell the user what each slide says (one line each) so they can redirect before image generation kicks off.
8. Write `generate-carousel.mjs` with the absolute path to `prompts.md` substituted in.
9. Run `bash -ic 'node generate-carousel.mjs'` with timeout 600000.
10. **Stamp the swipe cue on slide 1** (1:1 only): ensure `swipe-for-more.png` exists in the references folder (run `gen-swipe-asset.mjs` once if not), then `bash -ic 'ONLY_FOLDER=<topic-slug> node apply-swipe.mjs'`. See "Swipe Cue on Slide 1". Verify the result (read `slide-01.png`) before reporting.
11. Report:
    - Topic folder path
    - Slide count succeeded / failed
    - The filenames produced (`slide-01.png` ... `slide-NN.png`)
    - For any failures, offer to retry those specific slides

## User argument

$ARGUMENTS
