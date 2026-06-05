import fs from "node:fs";
import path from "node:path";
import { findMentionedSlugs } from "./fetch-person-ref.mjs";

const SCRIPTS_DIR = "/home/merce/.openclaw/workspace-crwn/videos/scripts/shortform";
const OUT_BASE = "/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts";
const KNOWN = JSON.parse(
  fs.readFileSync("/mnt/c/Users/Merce/Desktop/nano banana references/people/known-people.json", "utf8")
);

const POSTS = [135, 136, 137, 138];

// Carousels for these groups should NOT have a single-person portrait on slide 1
// (use a group/concept depiction instead).
const GROUP_POSTS = new Set([88, 94, 95, 122, 125, 129]); // Wu-Tang, TLC, En Vogue, OutKast, TLC (125), three-groups montage

function titleCase(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function readScript(num) {
  const fname = fs.readdirSync(SCRIPTS_DIR).find((f) => f.startsWith(num + "-"));
  if (!fname) throw new Error(`script not found for ${num}`);
  const md = fs.readFileSync(path.join(SCRIPTS_DIR, fname), "utf8");
  const slug = fname.replace(/\.md$/, "");
  const title = (md.match(/^##\s+(.+?)\s*$/m) || [])[1] || "";
  const caption = (md.match(/\*\*CAPTION:\*\*\s*\n+([\s\S]*?)\n+---/) || [])[1]?.trim() || "";
  const visuals = (md.match(/\*\*SCRIPT WITH VISUALS:\*\*\s*\n+([\s\S]*?)\n+---/) || [])[1]?.trim() || "";
  const banana = (md.match(/\*\*NANO BANANA PRO PROMPT:\*\*\s*\n+([\s\S]*?)\n+---/) || [])[1]?.trim() || "";
  // detect primary artist by filename match against known slugs
  const detected = findMentionedSlugs(md);
  const primary = detected.filter((s) => slug.includes(s));
  const artistSlug = primary[0] || detected[0] || null;
  return { num, slug, fname, title, caption, visuals, banana, artistSlug };
}

function parseBeats(visuals) {
  // beats appear as **BEATNAME:** text
  const beatNames = ["HOOK", "FORESHADOW", "RISING ACTION", "TWIST", "PAYOFF"];
  const beats = {};
  for (let i = 0; i < beatNames.length; i++) {
    const name = beatNames[i];
    const re = new RegExp(`\\*\\*${name.replace(/ /g, "\\s+")}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*(?:${beatNames.slice(i + 1).join("|").replace(/ /g, "\\s+")}|CTA|END):|$)`, "i");
    const m = visuals.match(re);
    beats[name] = m ? m[1].trim() : "";
  }
  return beats;
}

function splitBeat(beatText) {
  // Separate spoken text from bracketed visual directions
  const spoken = beatText.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  const visuals = [];
  const re = /\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(beatText)) !== null) visuals.push(m[1].trim());
  return { spoken, visuals };
}

const BASE_OPEN = `Flat scan of a white sheet of paper filling the entire frame, cropped to a perfect square. No desk, no surface, no edges visible, just white paper. Black sharpie marker handwriting.`;
const BASE_CLOSE = `The background is pure white (#FFFFFF). The image is shot perfectly straight on, no angle, no shadow, no background elements. Pure white paper fills the entire 1:1 square frame edge to edge.`;
const HAND_NOTE = `Every word, number, and label is drawn by hand in sharpie, not typed, not a printed font, every letter slightly imperfect like a real marker stroke.`;

function portraitClause(artistSlug, position = "top center") {
  if (!artistSlug) return "";
  const name = titleCase(artistSlug);
  return `In the ${position} of the page, draw a recognizable hand-drawn black sharpie head-and-shoulders portrait of ${name}, capturing distinctive features from the attached reference photo, labeled in capital letters with the name "${name.toUpperCase()}", rendered in raw sharpie line work (not photo-real, no shading, no color).`;
}

function joinVisuals(visuals) {
  // Smooth bracket directions into one descriptive paragraph
  return visuals
    .map((v) => v.replace(/^\s*write\s+/i, "Hand-write ")
                 .replace(/^\s*draw\s+/i, "Draw ")
                 .replace(/^\s*box\s+/i, "Box ")
                 .replace(/^\s*underline\s+/i, "Underline "))
    .join(". ");
}

function buildSlide1(script, beats) {
  const isPerson = script.artistSlug && !GROUP_POSTS.has(script.num);
  const { visuals } = splitBeat(beats.HOOK);
  // hook headline: take the script's TITLE (an aggressive paid-ad headline) or the first bracketed instruction's main words
  const headline = script.title.replace(/[".]/g, "").trim();
  const visualLine = visuals.length ? joinVisuals(visuals) : "";
  const portrait = isPerson
    ? portraitClause(script.artistSlug, "upper area")
    : (script.num === 88
        ? `In the upper area of the page, draw a row of nine small simple sharpie stick figures standing shoulder-to-shoulder labeled "WU-TANG" in capitals beneath them.`
        : script.num === 94
        ? `In the upper area of the page, draw three simple sharpie stick figures standing side by side labeled "TLC" in capitals beneath them.`
        : "");
  return [
    BASE_OPEN,
    portrait,
    `Below that, hand-write the bold hook headline "${headline}" in very large capital letters spanning the middle of the page in two or three short lines, each letter clearly hand-drawn in sharpie strokes.`,
    visualLine ? `Supporting marks: ${visualLine}.` : "",
    HAND_NOTE,
    BASE_CLOSE,
  ].filter(Boolean).join(" ");
}

function buildMiddleSlide(beatName, beatText) {
  const { spoken, visuals } = splitBeat(beatText);
  const slideHeader = beatName === "FORESHADOW"
    ? "Open the page with the framing line"
    : beatName === "RISING ACTION"
    ? "Lay out the math across the page"
    : "Reveal the twist on this page";
  // Take the first 1-2 short spoken sentences as the slide's written copy
  const copy = spoken.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").trim();
  const visualLine = visuals.length ? joinVisuals(visuals) : "";
  return [
    BASE_OPEN,
    `${slideHeader}. Hand-write the slide copy "${copy}" in clear sharpie capitals across the upper third of the page in two short stacked lines.`,
    visualLine ? `In the middle and lower areas of the page: ${visualLine}.` : "",
    HAND_NOTE,
    BASE_CLOSE,
  ].filter(Boolean).join(" ");
}

function buildPayoffSlide(beatText) {
  const { spoken, visuals } = splitBeat(beatText);
  const visualLine = visuals.length ? joinVisuals(visuals) : "";
  // Pull the final underlined/boxed tagline from the visuals if present, else last sentence of spoken
  const taglineMatch = beatText.match(/write\s+"([^"]+)"\s+(?:at\s+the\s+bottom|and\s+underline|and\s+box|in\s+a\s+box)/i);
  const tagline = taglineMatch ? taglineMatch[1] : spoken.split(/(?<=[.!?])\s+/).pop().replace(/[."]/g, "").trim();
  return [
    BASE_OPEN,
    `Build the takeaway page. ${visualLine ? `Lay out the supporting marks first: ${visualLine}.` : ""}`,
    `At the bottom-center of the page, hand-write the takeaway line "${tagline}" in large bold sharpie capitals, double-underlined, with a rough hand-drawn box around the whole phrase. This is the screenshot moment.`,
    HAND_NOTE,
    BASE_CLOSE,
  ].filter(Boolean).join(" ");
}

function buildPromptsMd(script) {
  const beats = parseBeats(script.visuals);
  const slides = [
    { label: "SLIDE 1 (HOOK)", prompt: buildSlide1(script, beats) },
    { label: "SLIDE 2 (FORESHADOW)", prompt: buildMiddleSlide("FORESHADOW", beats.FORESHADOW) },
    { label: "SLIDE 3 (RISING ACTION)", prompt: buildMiddleSlide("RISING ACTION", beats["RISING ACTION"]) },
    { label: "SLIDE 4 (TWIST)", prompt: buildMiddleSlide("TWIST", beats.TWIST) },
    { label: "SLIDE 5 (PAYOFF / TAKEAWAY)", prompt: buildPayoffSlide(beats.PAYOFF) },
  ];
  const header = `# Carousel Prompts -- "${script.title}"\n\nAspect ratio: 1:1\nSlide count: 5\nSource script: ${script.fname}\nPrimary artist: ${script.artistSlug || "(none / group / concept)"}\n\n---\n`;
  const body = slides
    .map((s) => `\n## ${s.label}\n\nPROMPT: "${s.prompt}"\n\n---`)
    .join("");
  return header + body + "\n";
}

let writtenFolders = 0;
let writtenFiles = 0;

if (!fs.existsSync(OUT_BASE)) fs.mkdirSync(OUT_BASE, { recursive: true });

for (const num of POSTS) {
  const script = readScript(num);
  const folder = path.join(OUT_BASE, script.slug);
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    writtenFolders++;
  }
  const promptsPath = path.join(folder, "prompts.md");
  const captionPath = path.join(folder, "caption.md");
  fs.writeFileSync(promptsPath, buildPromptsMd(script));
  fs.writeFileSync(captionPath, script.caption + "\n");
  writtenFiles += 2;
  console.log(`[${num}] ${script.slug}  artist=${script.artistSlug || "(none)"}`);
}

console.log(`\nDone. Folders created/touched: ${writtenFolders + (POSTS.length - writtenFolders)}, files written: ${writtenFiles}`);
console.log(`Output base: ${OUT_BASE}`);
