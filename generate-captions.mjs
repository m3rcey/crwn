import fs from "node:fs";
import path from "node:path";

const SHORTFORM = "/home/merce/.openclaw/workspace-crwn/videos/scripts/shortform";
const CAROUSELS = "/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts";
const OUT = "/home/merce/.openclaw/workspace-crwn/videos/ideas/2026-06-04-instagram-captions.md";

const shortFiles = fs.readdirSync(SHORTFORM).filter((f) => f.endsWith(".md"));
const carDirs = fs.readdirSync(CAROUSELS).filter((d) => fs.statSync(path.join(CAROUSELS, d)).isDirectory());

function videoFile(n) { return shortFiles.find((f) => new RegExp(`^${n}-`).test(f)); }
function videoSlug(n) { const f = videoFile(n); return f ? f.replace(/\.md$/, "") : `${n}`; }
function carDir(n) { return carDirs.find((d) => new RegExp(`^${n}-`).test(d)); }

function videoCaption(n) {
  const f = videoFile(n);
  const txt = fs.readFileSync(path.join(SHORTFORM, f), "utf-8");
  const m = txt.indexOf("**CAPTION:**");
  if (m === -1) return "(no caption found)";
  let rest = txt.slice(m + "**CAPTION:**".length);
  const dash = rest.indexOf("\n---");
  if (dash !== -1) rest = rest.slice(0, dash);
  return rest.trim();
}
function videoTitle(n) { return videoCaption(n).split("\n").map((s) => s.trim()).filter(Boolean)[0] || ""; }
function carouselCaption(n) {
  const d = carDir(n);
  return fs.readFileSync(path.join(CAROUSELS, d, "caption.md"), "utf-8").trim();
}

const OPENERS = [
  "Caught this on the CRWN page and had to react.",
  "My honest take on this one.",
  "Had to sit down and respond to this.",
  "Reacting to the latest one.",
  "This one got me talking.",
  "Pulled this up and broke it down.",
];
const CTAS = [
  "Full video on the CRWN page, link in bio.",
  "Watch the original on CRWN, link in bio.",
  "The whole breakdown is on CRWN, link in bio.",
  "Original is on the CRWN page, tap the link in bio.",
];
function reactionCaption(n, idx) {
  return `${OPENERS[idx % OPENERS.length]} ${videoTitle(n)}. ${CTAS[idx % CTAS.length]}`;
}

const TEASER = `Something big drops tomorrow.

Been building this behind the scenes for a minute and I'm finally ready to put you on. Turn on notifications so you don't miss it.`;

const ANNOUNCEMENT = `It's official.

I'm putting my music and everything that comes with it on CRWN, my own page where you support me directly instead of through a label or an algorithm. No middleman taking the biggest cut.

Link in bio. This is the start.`;

const TIMES = {
  thu: { video: "10:30a", carousel: "12:00p", reaction: "1:30p", pcaro: "3:00p", launch: "10:00a" },
  fri: { video: "11:00a", carousel: "12:30p", reaction: "2:00p", pcaro: "3:30p", launch: "10:00a" },
  sat: { video: "10:00a", carousel: "11:30a", reaction: "1:00p", pcaro: "2:30p" },
  sun: { video: "11:30a", carousel: "1:00p", reaction: "2:30p", pcaro: "4:00p" },
};

const SLOTS = [
  { date: "Thu Jun 4", wd: "thu", v: 1, c: 9, react: null, teaser: true },
  { date: "Fri Jun 5", wd: "fri", v: 2, c: 11, react: 1, announce: true },
  { date: "Sat Jun 6", wd: "sat", v: 3, c: 12, react: 2 },
  { date: "Sun Jun 7", wd: "sun", v: 4, c: 13, react: 3 },
  { date: "Thu Jun 11", wd: "thu", v: 5, c: 15, react: 4 },
  { date: "Fri Jun 12", wd: "fri", v: 6, c: 18, react: 5 },
  { date: "Sat Jun 13", wd: "sat", v: 7, c: 20, react: 6 },
  { date: "Sun Jun 14", wd: "sun", v: 9, c: 21, react: 7 },
  { date: "Thu Jun 18", wd: "thu", v: 10, c: 24, react: 9 },
  { date: "Fri Jun 19", wd: "fri", v: 11, c: 27, react: 10 },
  { date: "Sat Jun 20", wd: "sat", v: 12, c: 29, react: 11 },
  { date: "Sun Jun 21", wd: "sun", v: 13, c: 33, react: 12 },
  { date: "Thu Jun 25", wd: "thu", v: 15, c: 34, react: 13 },
  { date: "Fri Jun 26", wd: "fri", v: 16, c: 36, react: 15 },
  { date: "Sat Jun 27", wd: "sat", v: 18, c: 39, react: 16 },
  { date: "Sun Jun 28", wd: "sun", v: 19, c: 42, react: 18 },
  { date: "Thu Jul 2", wd: "thu", v: 21, c: 43, react: 19 },
  { date: "Fri Jul 3", wd: "fri", v: 22, c: 46, react: 21 },
  { date: "Sat Jul 4", wd: "sat", v: 23, c: 49, react: 22 },
  { date: "Sun Jul 5", wd: "sun", v: 24, c: 50, react: 23 },
  { date: "Thu Jul 9", wd: "thu", v: 25, c: 52, react: 24 },
  { date: "Fri Jul 10", wd: "fri", v: 26, c: 54, react: 25 },
  { date: "Sat Jul 11", wd: "sat", v: 27, c: 58, react: 26 },
  { date: "Sun Jul 12", wd: "sun", v: 28, c: 61, react: 27 },
  { date: "Thu Jul 16", wd: "thu", v: 29, c: 64, react: 28 },
  { date: "Fri Jul 17", wd: "fri", v: 31, c: 67, react: 29 },
  { date: "Sat Jul 18", wd: "sat", v: 33, c: 70, react: 31 },
  { date: "Sun Jul 19", wd: "sun", v: 34, c: 73, react: 33 },
  { date: "Thu Jul 23", wd: "thu", v: 35, c: 76, react: 34 },
  { date: "Fri Jul 24", wd: "fri", v: 38, c: 79, react: 35 },
];

const WEEK_HEADERS = [
  "WEEK 1 - Jun 4 to 7 (LAUNCH)", "WEEK 2 - Jun 11 to 14", "WEEK 3 - Jun 18 to 21",
  "WEEK 4 - Jun 25 to 28", "WEEK 5 - Jul 2 to 5", "WEEK 6 - Jul 9 to 12",
  "WEEK 7 - Jul 16 to 19", "WEEK 8 - Jul 23 to 24",
];

let out = `# Instagram Captions - paste-ready for Later\n\n`;
out += `Order matches the posting schedule (Central times). Each caption is in a fenced block - select and copy it into Later.\n\n`;
out += `Note: the video and carousel captions are pulled straight from your script files and carousel caption.md files. The TEASER, ANNOUNCEMENT, and REACTION captions are editable drafts in a neutral personal voice - tweak to taste (especially the announcement, which should name what you're actually launching).\n\n`;
out += `The personal-account carousel repost reuses the same carousel caption. If you'd rather not post identical text on both accounts, lightly reword the repost.\n\n---\n`;

let reactIdx = 0;
SLOTS.forEach((s, i) => {
  if (i % 4 === 0) out += `\n\n# ${WEEK_HEADERS[Math.floor(i / 4)]}\n`;
  const t = TIMES[s.wd];
  out += `\n## ${s.date}\n`;

  if (s.teaser) {
    out += `\n**${t.launch} · Personal · Teaser**\n\n\`\`\`\n${TEASER}\n\`\`\`\n`;
  }
  if (s.announce) {
    out += `\n**${t.launch} · Personal · Announcement**\n\n\`\`\`\n${ANNOUNCEMENT}\n\`\`\`\n`;
  }

  out += `\n**${t.video} · CRWN · Video ${s.v} - ${videoSlug(s.v)}**\n\n\`\`\`\n${videoCaption(s.v)}\n\`\`\`\n`;

  const carDirName = carDir(s.c);
  out += `\n**${t.carousel} · CRWN · Carousel ${s.c} - ${carDirName}**\n\n\`\`\`\n${carouselCaption(s.c)}\n\`\`\`\n`;

  if (s.react != null) {
    out += `\n**${t.reaction} · Personal · Reaction (to video ${s.react} - ${videoSlug(s.react)})**\n\n\`\`\`\n${reactionCaption(s.react, reactIdx)}\n\`\`\`\n`;
    reactIdx++;
  }

  out += `\n**${t.pcaro} · Personal · Carousel ${s.c} (repost)**\n\n\`\`\`\n${carouselCaption(s.c)}\n\`\`\`\n`;
});

fs.writeFileSync(OUT, out);
console.log(`Wrote ${OUT}`);
console.log(`Slots: ${SLOTS.length}, reaction captions: ${reactIdx}`);
