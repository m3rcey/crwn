import fs from "node:fs";
import path from "node:path";

const CAROUSELS = "/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts";
const OUT = "/home/merce/.openclaw/workspace-crwn/videos/ideas/2026-06-04-instagram-carousel-reposts.md";

const dirs = fs.readdirSync(CAROUSELS).filter((d) => {
  try { return fs.statSync(path.join(CAROUSELS, d)).isDirectory(); } catch { return false; }
});
function carDir(n) { return dirs.find((d) => new RegExp(`^${n}-`).test(d)); }
function repostCaption(n) {
  const raw = fs.readFileSync(path.join(CAROUSELS, carDir(n), "caption.md"), "utf-8").trim();
  // Personal-page CTA: tag the account instead of "Link in bio".
  return raw.replace(/Link in bio to/g, "Follow @thecrwnapp to");
}

// Personal repost times (Central) - later in the day than the CRWN carousel.
const TIMES = { thu: "3:00p", fri: "3:30p", sat: "2:30p", sun: "4:00p" };

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

let out = `# Instagram Carousel REPOSTS - personal page, paste-ready for Later\n\n`;
out += `The same carousels you post to CRWN, reposted later the same day on your PERSONAL page. Air order, Central time. Same slides and hook/body as the CRWN version - only the CTA changed: it tags @thecrwnapp instead of "link in bio" (the bio link only points to CRWN on the CRWN account).\n\n`;
out += `These are the personal-page repost times. The CRWN carousel goes out earlier the same day (see the main schedule).\n\n---\n`;

SLOTS.forEach(([date, wd, c], i) => {
  if (i % 4 === 0) out += `\n\n# ${WEEK_HEADERS[Math.floor(i / 4)]}\n`;
  out += `\n**${date} · ${TIMES[wd]} · Carousel ${c} repost - ${carDir(c)} (personal)**\n\n`;
  out += `\`\`\`\n${repostCaption(c)}\n\`\`\`\n`;
});

fs.writeFileSync(OUT, out);
console.log(`Wrote ${OUT} (${SLOTS.length} reposts)`);
