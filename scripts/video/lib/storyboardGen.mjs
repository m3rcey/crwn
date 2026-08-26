// Silent visual screenplay generation (§3-§8, §29-§34): narration script ->
// storyboard manifest. The model's output is DATA, validated by schema.mjs before
// any paid image generation; failed validation is fed back for repair up to the
// storyboard attempt cap.

import { CAPS, MODELS, STORY_ROLES, MOTIONS } from "../config.mjs";
import { validateStoryboard } from "./schema.mjs";
import { sourceNumberTokens } from "./scriptParse.mjs";
import { costForTextCall, addEntry } from "./ledger.mjs";

const STORYBOARD_INSTRUCTIONS = `
You convert a spoken-word CRWN short-form script into a SILENT vertical video storyboard.
There is no voiceover and no TTS: everything the viewer learns arrives through hand-drawn
black-sharpie-on-white-paper master images and camera movement over them. The script is
semantic source material, NOT text to display verbatim.

STORY GRAMMAR. Map the story onto these roles: HOOK, CONTEXT, BUILD,
CONTRAST_OR_ESCALATION, TENSION, CRWN_BRIDGE, REVEAL, PAYOFF, IMPLICATION, CTA.
Roles are story functions, not slides: one scene may carry several roles
(REVEAL+PAYOFF, IMPLICATION+CTA, CONTEXT+BUILD). Compress intelligently; never
invent a scene just to fill a template.

SCENE COUNT. Use the smallest number of master images that preserves comprehension,
curiosity, the reveal, the value, and the CTA. Normal range 7-10, default 8. Fewer
only when the story is genuinely simpler.

FIRST SCENE = HOOK + THUMBNAIL. The premise must be readable in about one second:
recognizable artist where applicable, a large hand-lettered question or contrast,
an information gap, no answer revealed, no logos, minimal reading burden.

TEXT DENSITY. One major idea per scene. Prefer a 3-10 word headline, one dominant
number, short boxed labels. Hard cap 28 words per scene, headline lines under 12
words. Never paragraph blocks. Remove verbal filler and connective tissue; never
alter factual meaning; never invent numbers that are not in the source.

WITHHELD INFORMATION. The script deliberately withholds a payoff. List every
withheld string/number in withheldInformation and revealText. Those strings and
numbers must appear ONLY in the scene(s) carrying REVEAL or later. Not in earlier
screen text, not in earlier image prompts, not hinted in a label.

CRWN BRIDGE. The CRWN section is the next insight in the SAME sharpie universe,
never an ad break: no product screenshots, no polished UI, no logos, no crown, no
"CRWN" text ever drawn. Express the idea with the same hand-drawn metaphors
(a door, a ladder of tiers, a vault, a list with names versus an anonymous crowd).

CTA. The final scene shows the comment keyword as its dominant text, e.g.
'COMMENT "VAULT"' plus one short line like "FREE VAULT REVENUE PLANNER" or
"I'LL DM YOU THE LINK". Keep it sparse and readable. Do NOT draw "128", a crown,
or CRWN anywhere: a separate existing end-card is appended automatically after
your last scene.

SHARE/SAVE. Fill shareTrigger and saveTrigger with the concrete reason an artist
would share or save this video. Do not display those phrases on screen.

IMAGE PROMPTS. Each scene's imagePrompt is a composition description in the exact
tradition of the reference prompt (if one is provided): flat scan of white paper,
black sharpie hand-lettering and comic ink art, heavy solid-black fills, every
piece of on-screen text given INSIDE double quotation marks with instructions like
'hand-letter exactly ...' and 'each appearing exactly once'. EVERY string in the
scene's screenText array must appear verbatim, in double quotes, in the imagePrompt.
Describe where each element sits (top fifth, left half, lower right...). The frame
is a vertical 9:16 sheet: compose for a TALL page (big headline high, dominant
figure in the middle band, boxed notes low). Do not include style boilerplate about
fonts, whiteness, or "no logos" rules: that boilerplate is appended automatically.
State that any named real person is drawn as a recognizable portrait, and give
their name in capitals as a hand-lettered label.

ELEMENTS. For each scene list its visual elements with an id (SNAKE_CASE), a short
desc, the exact text if it is a text element, and region {x,y,w,h} in normalized
page coordinates (origin top-left) matching where your imagePrompt places it.
Elements are the camera's focal targets.

SHOTS. Each scene gets 2-4 shots from this motion vocabulary: ${MOTIONS.join(", ")}.
A shot may reference a focalElement by element id. Use PUNCH for a fast emphasis
into a face/number/keyword, REVEAL_CROP when the withheld item enters frame,
HOLD for weight, DRIFT while reading. Set beatSync true on shots that should land
on a music beat (PUNCH, the reveal). Vary motion; never the same motion three
times in a row. Optional transition on a scene's FIRST shot: CUT (default), SWIPE,
or WHIP with transitionDirection when there is semantic direction (artist A ->
artist B, before -> after, rented -> owned).

PACING SHAPE. Hook fast; context fast-to-moderate; build moderate; escalation
faster; a very short TENSION beat before the reveal; the reveal holds longer;
payoff punches; CTA long enough to read and act. You control this through shot
counts, weights, and text volume, not literal durations.

OUTPUT. Reply with ONLY a JSON object:
{
  "title": string,
  "condensedStory": string (2-4 sentences, the silent-video version of the story),
  "ctaKeyword": string,
  "withheldInformation": string[],
  "revealText": string[],
  "shareTrigger": string,
  "saveTrigger": string,
  "scenes": [{
    "index": number (0-based, in order),
    "roles": string[] (from: ${STORY_ROLES.join(", ")}),
    "purpose": string,
    "sourceText": string[] (the script lines this scene compresses),
    "screenText": string[] (EXACT strings hand-lettered on the page),
    "visualGoal": string,
    "imagePrompt": string,
    "elements": [{"id": string, "desc": string, "text": string?, "region": {"x":n,"y":n,"w":n,"h":n}}],
    "shots": [{"motion": string, "focalElement": string?, "weight": number?, "transition": string?, "transitionDirection": string?, "beatSync": boolean?}],
    "people": string[] (slugs of real people drawn in this scene, from the provided list only),
    "shareTrigger": string?,
    "saveTrigger": string?
  }]
}
`;

export function buildStoryboardPrompt(parsed, opts = {}) {
  const parts = [STORYBOARD_INSTRUCTIONS.trim()];
  parts.push(`\n=== SCRIPT TITLE ===\n${parsed.title}`);
  parts.push(`\n=== NARRATION SCRIPT (semantic source; do not display verbatim) ===\n${parsed.scriptText}`);
  const metaLines = Object.entries(parsed.meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  parts.push(`\n=== META ===\n${metaLines}`);
  if (parsed.nanoPrompt) {
    parts.push(
      `\n=== REFERENCE PROMPT (the static 3:4 poster for this story; reuse its layout ideas, labels and conventions, adapted per scene to a 9:16 page; do NOT copy it wholesale into every scene) ===\n${parsed.nanoPrompt}`
    );
  }
  parts.push(
    `\n=== AVAILABLE PERSON REFERENCES ===\n${(opts.personSlugs || []).join(", ") || "(none)"}\nOnly these slugs may appear in scenes' "people" arrays.`
  );
  parts.push(`\n=== TARGET ===\nDefault ${CAPS.defaultMasterImages} scenes (${CAPS.minMasterImages}-${CAPS.maxMasterImages} allowed). CTA keyword: ${parsed.ctaKeyword || "(none found; derive from script)"}.`);
  if (opts.repairErrors?.length) {
    parts.push(
      `\n=== YOUR PREVIOUS ATTEMPT FAILED VALIDATION. FIX EVERY ITEM. ===\n- ${opts.repairErrors.join("\n- ")}`
    );
  }
  return parts.join("\n");
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in model reply");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Generate a validated storyboard.
 * @param {import('./scriptParse.mjs').ParsedScript} parsed
 * @param {{ callModel: (req:{model:string, prompt:string}) => Promise<{text:string, inputTokens:number, outputTokens:number}> }} client
 * @param {{ ledger?: any, personSlugs?: string[], slug: string }} opts
 */
export async function generateStoryboard(parsed, client, opts) {
  const sourceNumbers = sourceNumberTokens(parsed);
  const expectReveal = Boolean(parsed.meta["big reveal"]);
  let repairErrors = [];
  let lastResult = null;

  for (let attempt = 1; attempt <= CAPS.maxStoryboardAttempts; attempt++) {
    const prompt = buildStoryboardPrompt(parsed, { personSlugs: opts.personSlugs, repairErrors });
    const res = await client.callModel({ model: MODELS.storyboard, prompt, json: true });
    if (opts.ledger) {
      addEntry(opts.ledger, {
        stage: "storyboard",
        model: MODELS.storyboard,
        attempt,
        inputTokens: res.inputTokens || 0,
        outputTokens: res.outputTokens || 0,
        usd: costForTextCall(MODELS.storyboard, res.inputTokens || 0, res.outputTokens || 0),
      });
    }
    let sb;
    try {
      sb = extractJson(res.text);
    } catch (err) {
      repairErrors = [`reply was not valid JSON: ${err.message}`];
      continue;
    }
    sb.slug = opts.slug;
    sb.family = parsed.family;
    if (!sb.ctaKeyword && parsed.ctaKeyword) sb.ctaKeyword = parsed.ctaKeyword;
    // Scenes must be ordered and 0-indexed regardless of what the model returned.
    sb.scenes = (sb.scenes || []).sort((a, b) => a.index - b.index);
    sb.scenes.forEach((s, i) => (s.index = i));

    const result = validateStoryboard(sb, { sourceNumbers, expectReveal });
    lastResult = { storyboard: sb, validation: result };
    if (result.ok) return lastResult;
    repairErrors = result.errors.slice(0, 20);
  }
  throw Object.assign(
    new Error(
      `storyboard failed validation after ${CAPS.maxStoryboardAttempts} attempts:\n- ${repairErrors.join("\n- ")}`
    ),
    { lastResult }
  );
}
