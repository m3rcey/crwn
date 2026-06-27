import fs from "node:fs";
import path from "node:path";

const CAROUSELS = "/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts";
const OUT = "/home/merce/.openclaw/workspace-crwn/videos/ideas/2026-06-04-instagram-carousel-captions.md";

const dirs = fs.readdirSync(CAROUSELS).filter((d) => {
  try { return fs.statSync(path.join(CAROUSELS, d)).isDirectory(); } catch { return false; }
});
function carDir(n) { return dirs.find((d) => new RegExp(`^${n}-`).test(d)); }
function caption(n) {
  const d = carDir(n);
  return fs.readFileSync(path.join(CAROUSELS, d, "caption.md"), "utf-8").trim();
}

const CRWN = { thu: "12:00p", fri: "12:30p", sat: "11:30a", sun: "1:00p" };
const PERS = { thu: "3:00p", fri: "3:30p", sat: "2:30p", sun: "4:00p" };

const SLOTS = [
  ["Thu Jun 4", "thu", 9], ["Fri Jun 5", "fri", 11], ["Sat Jun 6", "sat", 12], ["Sun Jun 7", "sun", 13],
  ["Thu Jun 11", "thu", 15], ["Fri Jun 12", "fri", 18], ["Sat Jun 13", "sat", 20], ["Sun Jun 14", "sun", 21],
  ["Thu Jun 18", "thu", 24], ["Fri Jun 19", "fri", 27], ["Sat Jun 20", "sat", 29], ["Sun Jun 21", "sun", 33],
  ["Thu Jun 25", "thu", 34], ["Fri Jun 26", "fri", 36], ["Sat Jun 27", "sat", 39], ["Sun Jun 28", "sun", 42],
  ["Thu Jul 2", "thu", 43], ["Fri Jul 3", "fri", 46], ["Sat Jul 4", "sat", 49], ["Sun Jul 5", "sun", 50],
  ["Thu Jul 9", "thu", 52], ["Fri Jul 10", "fri", 54], ["Sat Jul 11", "sat", 58], ["Sun Jul 12", "sun", 61],
  ["Thu Jul 16", "thu", 64], ["Fri Jul 17", "fri", 67], ["Sat Jul 18", "sat", 70], ["Sun Jul 19", "sun", 73],
  ["Thu Jul 23", "thu", 76], ["Fri Jul 24", "fri", 79],
];

const WEEK_HEADERS = [
  "WEEK 1 - Jun 4 to 7", "WEEK 2 - Jun 11 to 14", "WEEK 3 - Jun 18 to 21", "WEEK 4 - Jun 25 to 28",
  "WEEK 5 - Jul 2 to 5", "WEEK 6 - Jul 9 to 12", "WEEK 7 - Jul 16 to 19", "WEEK 8 - Jul 23 to 24",
];

let out = `# Instagram Carousel Captions - paste-ready for Later\n\n`;
out += `CRWN carousel captions only, in air order (Central-time schedule). Each caption is in a fenced block - select and copy it into Later. Pulled verbatim from each carousel folder's caption.md.\n\n`;
out += `The same caption covers both posts that day: the CRWN carousel and the personal repost (posted later). The CRWN time and the repost time are noted on each.\n\n`;
out += `Note: carousels 14 (bully-152k-vs-gamma-200k) and 32 (fall-off-290k-cole-keep) were pulled, so later carousels shifted up and carousels 76 and 79 were pulled in to keep one per day. Carousel 20 (kendrick-pglang-explained) airs Sat Jun 13 even though its video was pulled.\n\n---\n`;

SLOTS.forEach(([date, wd, c], i) => {
  if (i % 4 === 0) out += `\n\n# ${WEEK_HEADERS[Math.floor(i / 4)]}\n`;
  out += `\n**${date} · Carousel ${c} - ${carDir(c)}**\n`;
  out += `(CRWN ${CRWN[wd]} · personal repost ${PERS[wd]} - same caption)\n\n`;
  out += `\`\`\`\n${caption(c)}\n\`\`\`\n`;
});

fs.writeFileSync(OUT, out);
console.log(`Wrote ${OUT} (${SLOTS.length} carousels)`);
