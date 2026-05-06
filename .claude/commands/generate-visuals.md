# Nano Banana Image Generator

Generate images using the Nano Banana 2 (Gemini) API with consistent black sharpie on white paper style.

## Instructions

When the user invokes `/nano-banana`, they will provide either:
1. **A prompt or list of prompts** to generate
2. **A .md file path** containing prompts to batch generate
3. **A description** of what they want (e.g. "thumbnail with the word WORTHLESS")

## Setup

- **API Key**: Stored in `~/.bashrc` as `GEMINI_API_KEY`
- **Style references**: `/mnt/c/Users/Merce/Desktop/nano banana references/` (4 style refs + crwn-logo.png)
- **Output directory**: `/mnt/c/Users/Merce/Dropbox/nano banana output/[VIDEO_TITLE]/` — each video's visuals go in a subfolder named after the video title (e.g. `WILL_AI_REPLACE_MUSICIANS/`). Create the subfolder if it doesn't exist.
- **Model**: `gemini-3.1-flash-image-preview`
- **Output format**: `.jpg` (the API returns JPEG data)
- **Delay between requests**: 8 seconds to avoid rate limits
- **Shell**: Must use `bash -ic` to load the API key from `.bashrc`

## Generation Script

Write prompts to `/home/merce/.openclaw/workspace-crwn/generate-images.mjs` and run with `bash -ic 'node generate-images.mjs'`.

The script must:
1. Load style reference images from the references folder (exclude `crwn-logo.png` from style refs)
2. If any prompt mentions CRWN or the CRWN logo, also load `crwn-logo.png` as a separate reference and instruct the model to reproduce it exactly
3. Include the style instruction: "Use the exact same visual style as these reference images: bold black sharpie marker handwriting on pure white paper, clean hand-drawn icons and diagrams, high contrast black on white, no gray tones, no background texture. Match the lettering weight, spacing, and hand-drawn aesthetic exactly."
4. Save output as `.jpg` files
5. Add 8-second delays between requests
6. Track success/failure counts

## Style Rules

- Bold black sharpie marker on pure white paper
- Hand-drawn icons and stick figures
- High contrast black on white, no gray tones
- 16:9 aspect ratio unless specified otherwise
- Roadmap stair images: NO boxes, circles, outlines, or X marks on any step — plain text only
- When CRWN logo is needed, use the actual logo reference, never a generic crown

## Workflow

1. User provides prompts (inline, as a list, or via .md file)
2. Write the generation script with all prompts
3. Run with `bash -ic 'node generate-images.mjs'` (timeout 600000 for batches)
4. Report results and retry any failures

## User argument

$ARGUMENTS
