# YouTube Thumbnail Generator

Generate a YouTube thumbnail in the CRWN hand-drawn sharpie style using the Nano Banana (Gemini) API.

## Invocation

`/thumbnail <video title> | <thumbnail text>`

The user supplies:
1. **Video title** — the YouTube video this thumbnail is for (used for the output filename and to inform the facial expression)
2. **Thumbnail text** — the exact text that should appear on the thumbnail

Examples:
- `/thumbnail Will AI Replace Musicians | WORTHLESS`
- `/thumbnail What's The Value Of Your Music | 0 FANS?`
- `/thumbnail 1 Founder 12 Agents 0 Humans | 1 FOUNDER. 12 AGENTS. 0 HUMANS.`

If the user doesn't use the `|` separator, parse their message to figure out the title and text, and confirm the text with the user before generating.

## Setup

- **API Key**: `GEMINI_API_KEY` from `~/.bashrc` (must use `bash -ic`)
- **Reference folder**: `/mnt/c/Users/Merce/Desktop/nano banana references/thumbnails/` — contains the reference thumbnails to match in style
- **Output folder**: `/mnt/c/Users/Merce/Dropbox/nano banana output/thumbnails/`
- **Output filename**: `thumbnail-<slugified-video-title>.jpg` (lowercase, dashes, no punctuation). If that file already exists, append `-2`, `-3`, etc.
- **Model**: `gemini-3.1-flash-image-preview`

## Style Rules (match references exactly)

The reference thumbnails share a strict visual language — do not drift from it:

- **Pure white background** (#FFFFFF), no texture, no paper edges, flat scan look
- **Bold black sharpie marker** strokes — high contrast, no gray tones
- **Round stick-figure head on the right side** of the frame with:
  - Two circular eyes (pupils as solid black dots)
  - A simple mouth drawn with sharpie — shape changes based on expression
  - A small **gold/yellow crown** (#F5C518-ish) sitting on top of the head, partially cropped at the top edge
- **Big bold handwritten text on the left side**, filling as much horizontal real estate as possible up to — but never overlapping — the face
- **16:9 aspect ratio**, the face occupies roughly the right 30–40% of the frame, text fills the left 60–70%
- If the thumbnail text has multiple lines, stack them with consistent left-alignment, matching the handwritten weight of the references

## Facial Expression — Pick One That Fits

Choose the face's expression based on the emotional tone of the video title + thumbnail text. Common options:

| Tone | Expression |
|------|-----------|
| Neutral / deadpan / matter-of-fact | Straight flat line mouth, normal open eyes (reference default) |
| Shock / surprise / disbelief | Wide open O-shaped mouth, wide eyes |
| Worry / concern / doom | Downturned mouth, eyes slightly narrowed or worried |
| Smug / confident / knowing | Slight smirk, one raised eyebrow, calm eyes |
| Angry / frustrated | Furrowed brows (angled black lines), tight frown |
| Excited / happy | Open smile, cheerful round eyes |
| Confused / questioning | One raised eyebrow, crooked mouth, small question mark above head optional |
| Sad / defeated | Frown, closed or downcast eyes, single tear optional |

State the chosen expression in your response before generating so the user can redirect.

## Generation Script

Write the script to `/home/merce/.openclaw/workspace-crwn/generate-thumbnail.mjs`, then run with `bash -ic 'node generate-thumbnail.mjs'` (timeout 120000).

The script must:
1. Load **both** reference thumbnails from the thumbnails folder as image parts (they are the style anchors)
2. Include a style instruction (see template below)
3. Include the generation prompt with the video title, exact thumbnail text, and chosen facial expression
4. Save the output as `.jpg` to the thumbnails output folder
5. Print success/failure

### Script template

```js
import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const REF_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references/thumbnails";
const OUTPUT_DIR = "/mnt/c/Users/Merce/Dropbox/nano banana output/thumbnails";
const OUTPUT_FILE = "thumbnail-<SLUG>.jpg";

const THUMBNAIL_TEXT = `<EXACT TEXT>`;
const EXPRESSION = `<chosen expression description>`;
const VIDEO_TITLE = `<title>`;

const STYLE_INSTRUCTION = "Match the exact visual style of these reference thumbnails: pure white background, bold black sharpie marker strokes, a round stick-figure head on the right with a small gold crown on top (partially cropped at the top edge), big bold handwritten text on the left filling as much space as possible without touching the face. 16:9 aspect ratio. No gray tones, no paper texture, no shadows, no background elements. High contrast black on white with only the crown in gold/yellow.";

const PROMPT = `Generate a YouTube thumbnail in the exact style of the reference images. 16:9 aspect ratio, pure white background.

On the RIGHT side: a round stick-figure head drawn in bold black sharpie with two circular eyes (solid black dot pupils) and a small gold/yellow crown on top that is partially cropped at the top edge of the frame. The face's expression must be: ${EXPRESSION}.

On the LEFT side: the text "${THUMBNAIL_TEXT}" written in big bold hand-drawn sharpie letters, filling as much of the left 60-70% of the frame as possible while leaving clear space between the text and the face. If the text is multiple lines, stack them left-aligned with consistent weight. The text must be easily readable at thumbnail scale — make it as large as possible.

Do NOT include any other elements — no paper edges, no desk, no shadows, no extra icons unless the expression naturally calls for one (e.g. small question mark above the head for confusion). Pure white fills all negative space. Match the reference thumbnails' line weight and handwriting style exactly.`;

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
  const ai = new GoogleGenAI({ apiKey });
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const refs = fs.readdirSync(REF_DIR).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
  const refParts = refs.map(f => ({
    inlineData: {
      mimeType: f.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      data: fs.readFileSync(path.join(REF_DIR, f)).toString("base64")
    }
  }));

  const outPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  console.log(`Generating: ${OUTPUT_FILE}`);
  console.log(`Expression: ${EXPRESSION}`);
  console.log(`Text: ${THUMBNAIL_TEXT}`);

  const parts = [...refParts, { text: STYLE_INSTRUCTION }, { text: PROMPT }];
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["image", "text"] }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, "base64"));
      console.log(`Saved: ${outPath}`);
      return;
    }
  }
  console.error("No image returned");
  process.exit(1);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
```

## Workflow

1. Parse the user's input into `<video title>` and `<thumbnail text>`. If ambiguous, ask.
2. Pick an expression from the table above based on tone. State the chosen expression in your response.
3. Write the generation script with the exact values substituted in (slug the title for the filename).
4. Run `bash -ic 'node generate-thumbnail.mjs'` (timeout 120000).
5. Report the output path and ask if the user wants a regenerate with a different expression.

## User argument

$ARGUMENTS
