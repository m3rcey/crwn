import fs from "node:fs";
import path from "node:path";

const SCRIPTS_DIR = "/home/merce/.openclaw/workspace-crwn/videos/scripts/shortform";
const CAROUSEL_BASE = "/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts";
const OUT = "/tmp";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const POSTING_DOWS = new Set([4, 5, 6, 0]); // Thu Fri Sat Sun

// time slots by day-of-week: [video, carousel, reaction, repost]
const TIMES = {
  4: ["10:30a", "12:00p", "1:30p", "3:00p"],   // Thu
  5: ["11:00a", "12:30p", "2:00p", "3:30p"],   // Fri
  6: ["10:00a", "11:30a", "1:00p", "2:30p"],   // Sat
  0: ["11:30a", "1:00p", "2:30p", "4:00p"],    // Sun
};

const REACT_TAGS = [
  "Follow @thecrwnapp for more like this",
  "More breakdowns over at @thecrwnapp",
  "@thecrwnapp drops these every week",
  "Tap in with @thecrwnapp",
];

// carousel stream, in posting order: parked leftovers + concept + new worthy
const CAROUSEL_STREAM = [
  14, 32, 82, 85, 87, 88, 92, 94, "streaming-is-broken",
  95, 96, 97, 100, 102, 103, 106, 107, 109, 110, 112, 113, 114, 115,
  117, 118, 121, 122, 125, 127, 128, 129, 132,
];

// ---- helpers ----
const files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith(".md"));
function scriptByNum(num) {
  const f = files.find((x) => x.match(/^(\d+)-/) && parseInt(x.match(/^(\d+)-/)[1], 10) === num);
  if (!f) return null;
  const md = fs.readFileSync(path.join(SCRIPTS_DIR, f), "utf8");
  const slug = f.replace(/\.md$/, "");
  const capM = md.match(/\*\*CAPTION:\*\*\s*\n+([\s\S]*?)\n+---/);
  const caption = capM ? capM[1].trim() : "";
  const title = caption.split(/\n/).map((l) => l.trim()).filter(Boolean)[0] || "";
  return { num, slug, slugNoNum: slug.replace(/^\d+-/, ""), caption, title };
}

function carouselFolder(id) {
  if (typeof id === "string") {
    const dir = path.join(CAROUSEL_BASE, id);
    if (!fs.existsSync(dir)) return null;
    const cap = fs.existsSync(path.join(dir, "caption.md"))
      ? fs.readFileSync(path.join(dir, "caption.md"), "utf8").trim() : "";
    return { label: id, folder: id, folderNoNum: id, caption: cap, hasNum: false };
  }
  const name = fs.readdirSync(CAROUSEL_BASE).find((d) => d.match(/^(\d+)-/) && parseInt(d, 10) === id);
  if (!name) return null;
  const cap = fs.existsSync(path.join(CAROUSEL_BASE, name, "caption.md"))
    ? fs.readFileSync(path.join(CAROUSEL_BASE, name, "caption.md"), "utf8").trim() : "";
  return { label: String(id), folder: name, folderNoNum: name.replace(/^\d+-/, ""), caption: cap, hasNum: true };
}

function repostCap(caption) {
  return caption.replace(/Link in bio to /g, "Follow @thecrwnapp to ");
}
function fence(body) { return "```\n" + body + "\n```"; }

// ---- build posting-day list ----
let d = new Date(2026, 6, 25); // Sat Jul 25 2026 (resume point)
const days = [];
for (let v = 39; v <= 133; v++) {
  while (!POSTING_DOWS.has(d.getDay())) d = new Date(d.getTime() + 86400000);
  days.push({ date: new Date(d), dow: d.getDay(), video: v });
  d = new Date(d.getTime() + 86400000);
}

// attach carousel + reaction
days.forEach((day, i) => {
  day.carousel = i < CAROUSEL_STREAM.length ? carouselFolder(CAROUSEL_STREAM[i]) : null;
  day.reactNum = day.video - 1; // previous video in sequence
});

const fmtDate = (dt) => `${DOW[dt.getDay()]} ${MON[dt.getMonth()]} ${dt.getDate()}`;
const fmtRange = (a, b) => `${MON[a.getMonth()]} ${a.getDate()} to ${a.getMonth() === b.getMonth() ? b.getDate() : MON[b.getMonth()] + " " + b.getDate()}`;

// ---- emit ----
let sched = "", vids = "", reacts = "", cars = "", reps = "";
let weekNum = 8, firstHeader = true, reactIdx = 0;

days.forEach((day, i) => {
  const dt = day.date, dow = day.dow;
  const [vt, ct, rt, rpt] = TIMES[dow];
  const s = scriptByNum(day.video);
  const react = scriptByNum(day.reactNum);
  const dstr = fmtDate(dt);

  // week header on first day or every Thursday
  if (firstHeader || dow === 4) {
    if (dow === 4) weekNum++;
    const sun = new Date(dt.getTime() + (dow === 6 ? 1 : dow === 0 ? 0 : (7 - dow)) * 86400000);
    const range = firstHeader ? `${MON[dt.getMonth()]} ${dt.getDate()} to ${dt.getDate() + 1}` : fmtRange(dt, sun);
    const label = firstHeader ? `# WEEK 8 (cont) - ${range}` : `# WEEK ${weekNum} - ${range}`;
    sched += `\n\n${label.replace(/^# /, "")}\n`;
    vids += `\n\n${label}\n`;
    reacts += `\n\n${label}\n`;
    cars += `\n\n${label}\n`;
    reps += `\n\n${label}\n`;
    firstHeader = false;
  }

  // SCHEDULE
  const line = (time, actor, action, detail) => `  [ ] ${time.padStart(6)}  ${actor.padEnd(10)}${action.padEnd(11)}${detail}`;
  sched += `\n${dstr}\n`;
  sched += line(vt, "CRWN", "Video", `${day.video} - ${s.slugNoNum}`) + "\n";
  if (day.carousel) {
    const cd = day.carousel.hasNum ? `${day.carousel.label} - ${day.carousel.folderNoNum}` : day.carousel.folder;
    sched += line(ct, "CRWN", "Carousel", cd) + "\n";
    sched += line(rt, "PERSONAL", "Reaction", `react to ${day.reactNum} - ${react.slugNoNum}`) + "\n";
    sched += line(rpt, "PERSONAL", "Carousel", `${cd} (repost)`) + "\n";
  } else {
    sched += line(rt, "PERSONAL", "Reaction", `react to ${day.reactNum} - ${react.slugNoNum}`) + "\n";
    sched += `       (no carousel - stream exhausted; make more worthy carousels to fill this slot)\n`;
  }

  // VIDEO captions
  vids += `\n**${dstr} · Video ${day.video} - ${s.slugNoNum}**\n\n${fence(s.caption)}\n`;

  // REACTION captions
  const tag = REACT_TAGS[reactIdx % REACT_TAGS.length]; reactIdx++;
  reacts += `\n**${dstr} · ${rt} · Reaction to video ${day.reactNum} - ${react.slug}**\n\n${fence(react.title + "\n" + tag)}\n`;

  // CAROUSEL + REPOST captions (only when a carousel airs)
  if (day.carousel) {
    const cap = day.carousel.caption;
    const cName = day.carousel.hasNum ? `${day.carousel.label} - ${day.carousel.folder}` : day.carousel.folder;
    cars += `\n**${dstr} · Carousel ${cName}**\n(CRWN ${ct} · personal repost ${rpt} - same caption)\n\n${fence(cap)}\n`;
    const cRepost = day.carousel.hasNum ? `${day.carousel.label} repost - ${day.carousel.folder}` : `${day.carousel.folder} repost`;
    reps += `\n**${dstr} · ${rpt} · Carousel ${cRepost} (personal)**\n\n${fence(repostCap(cap))}\n`;
  }
});

fs.writeFileSync(`${OUT}/cont-schedule.md`, sched);
fs.writeFileSync(`${OUT}/cont-videos.md`, vids);
fs.writeFileSync(`${OUT}/cont-reactions.md`, reacts);
fs.writeFileSync(`${OUT}/cont-carousels.md`, cars);
fs.writeFileSync(`${OUT}/cont-reposts.md`, reps);

const lastCar = days.findLastIndex((d) => d.carousel);
console.log(`days: ${days.length} (video 39..100)`);
console.log(`first: ${fmtDate(days[0].date)} -> last: ${fmtDate(days[days.length - 1].date)} (video 100)`);
console.log(`carousel stream covers days 1..${lastCar + 1} (through video ${days[lastCar].video}); days ${lastCar + 2}..${days.length} have no carousel`);
console.log(`wrote 5 files to ${OUT}/cont-*.md`);
