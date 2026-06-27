import fs from "node:fs";
import path from "node:path";

const SHORTFORM = "/home/merce/.openclaw/workspace-crwn/videos/scripts/shortform";
const OUT = "/home/merce/.openclaw/workspace-crwn/videos/ideas/2026-06-04-instagram-reaction-captions.md";

const files = fs.readdirSync(SHORTFORM).filter((f) => f.endsWith(".md"));
function videoFile(n) { return files.find((f) => new RegExp(`^${n}-`).test(f)); }
function videoSlug(n) { const f = videoFile(n); return f ? f.replace(/\.md$/, "") : `${n}`; }
function videoCaption(n) {
  const txt = fs.readFileSync(path.join(SHORTFORM, videoFile(n)), "utf-8");
  const m = txt.indexOf("**CAPTION:**");
  let rest = txt.slice(m + "**CAPTION:**".length);
  const dash = rest.indexOf("\n---");
  if (dash !== -1) rest = rest.slice(0, dash);
  return rest.trim();
}
function videoTitle(n) { return videoCaption(n).split("\n").map((s) => s.trim()).filter(Boolean)[0] || ""; }

// Standard English only - no slang (written caption rule).
const CTAS = [
  "Follow @thecrwnapp for more like this.",
  "More breakdowns over at @thecrwnapp.",
  "@thecrwnapp drops these every week.",
  "Tap in with @thecrwnapp.",
];

const TIMES = { thu: "1:30p", fri: "2:00p", sat: "1:00p", sun: "2:30p" };

// [date reaction posts, weekday, video number it reacts to]
const SLOTS = [
  ["Fri Jun 5", "fri", 1], ["Sat Jun 6", "sat", 2], ["Sun Jun 7", "sun", 3],
  ["Thu Jun 11", "thu", 4], ["Fri Jun 12", "fri", 5], ["Sat Jun 13", "sat", 6], ["Sun Jun 14", "sun", 7],
  ["Thu Jun 18", "thu", 9], ["Fri Jun 19", "fri", 10], ["Sat Jun 20", "sat", 11], ["Sun Jun 21", "sun", 12],
  ["Thu Jun 25", "thu", 13], ["Fri Jun 26", "fri", 15], ["Sat Jun 27", "sat", 16], ["Sun Jun 28", "sun", 18],
  ["Thu Jul 2", "thu", 19], ["Fri Jul 3", "fri", 21], ["Sat Jul 4", "sat", 22], ["Sun Jul 5", "sun", 23],
  ["Thu Jul 9", "thu", 24], ["Fri Jul 10", "fri", 25], ["Sat Jul 11", "sat", 26], ["Sun Jul 12", "sun", 27],
  ["Thu Jul 16", "thu", 28], ["Fri Jul 17", "fri", 29], ["Sat Jul 18", "sat", 31], ["Sun Jul 19", "sun", 33],
  ["Thu Jul 23", "thu", 34], ["Fri Jul 24", "fri", 35],
];

// Week boundaries by date (Week 1 reactions start Fri Jun 5, since Thu Jun 4 has none).
const WEEK_OF = {
  "Fri Jun 5": "WEEK 1 - Jun 5 to 7", "Thu Jun 11": "WEEK 2 - Jun 11 to 14",
  "Thu Jun 18": "WEEK 3 - Jun 18 to 21", "Thu Jun 25": "WEEK 4 - Jun 25 to 28",
  "Thu Jul 2": "WEEK 5 - Jul 2 to 5", "Thu Jul 9": "WEEK 6 - Jul 9 to 12",
  "Thu Jul 16": "WEEK 7 - Jul 16 to 19", "Thu Jul 23": "WEEK 8 - Jul 23 to 24",
};

let out = `# Instagram Reaction Captions - personal page, paste-ready for Later\n\n`;
out += `Your split-screen reaction videos, in air order (Central-time schedule). Each reaction posts the day AFTER the CRWN video it reacts to. Standard English, no slang. Captions are editable drafts - tighten any in your own voice.\n\n`;
out += `Thu Jun 4 has no reaction (nothing had aired yet), so reactions start Fri Jun 5.\n\n---\n`;

SLOTS.forEach(([date, wd, vn], i) => {
  if (WEEK_OF[date]) out += `\n\n# ${WEEK_OF[date]}\n`;
  const title = videoTitle(vn).replace(/\./g, "");
  const cta = CTAS[i % CTAS.length].replace(/\./g, "");
  const caption = `${title}\n${cta}`;
  out += `\n**${date} · ${TIMES[wd]} · Reaction to video ${vn} - ${videoSlug(vn)}**\n\n`;
  out += `\`\`\`\n${caption}\n\`\`\`\n`;
});

fs.writeFileSync(OUT, out);
console.log(`Wrote ${OUT} (${SLOTS.length} reactions)`);
