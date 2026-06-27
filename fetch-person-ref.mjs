import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

export const PEOPLE_DIR = "/mnt/c/Users/Merce/Desktop/nano banana references/people";
export const KNOWN_PEOPLE_PATH = path.join(PEOPLE_DIR, "known-people.json");

function loadDotenvFallback() {
  const dotenvPath = path.join(os.homedir(), ".env");
  if (!fs.existsSync(dotenvPath)) return;
  const content = fs.readFileSync(dotenvPath, "utf-8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/i);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key]) continue;
    const val = rawVal.replace(/^['"]|['"]$/g, "");
    process.env[key] = val;
  }
}

loadDotenvFallback();

const EXTS = ["jpg", "jpeg", "png", "webp", "gif"];

function detectExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "webp";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
  return null;
}

export function findExistingPersonRef(slug) {
  for (const ext of EXTS) {
    const p = path.join(PEOPLE_DIR, `${slug}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function mimeFromExt(ext) {
  const e = ext.toLowerCase();
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  if (e === "gif") return "image/gif";
  return "application/octet-stream";
}

export function loadKnownPeople() {
  if (!fs.existsSync(KNOWN_PEOPLE_PATH)) return {};
  return JSON.parse(fs.readFileSync(KNOWN_PEOPLE_PATH, "utf-8"));
}

export function findMentionedSlugs(text, known = loadKnownPeople()) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const [slug, entry] of Object.entries(known)) {
    for (const alias of entry.aliases || [slug]) {
      const escaped = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
      if (re.test(lower)) {
        found.add(slug);
        break;
      }
    }
  }
  return [...found];
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CRWN-Reference-Fetcher/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error(`too small: ${buf.length} bytes`);
  const ext = detectExt(buf);
  if (!ext) throw new Error("unknown image format");
  return { buf, ext };
}

const BAD_DOMAINS = [
  "pinterest.com", "pinimg.com",
  "etsy.com",
  "artstation.com", "artstation.net",
  "deviantart.com", "wixmp.com",
  "redbubble.com",
  "fineartamerica.com",
  "society6.com",
  "teepublic.com",
  "displate.com",
  "zazzle.com",
  "behance.net",
  "shutterstock.com",
  "alamy.com",
  "dreamstime.com",
  "istockphoto.com",
  "depositphotos.com",
  "tumblr.com",
  "wallpapercave.com",
  "wallpaperaccess.com",
  "wallpapersden.com",
];

const GOOD_DOMAINS = [
  "billboard.com",
  "rollingstone.com",
  "complex.com",
  "hiphopdx.com",
  "xxlmag.com",
  "vibe.com",
  "vulture.com",
  "thefader.com",
  "pitchfork.com",
  "nme.com",
  "variety.com",
  "hollywoodreporter.com",
  "gq.com",
  "vanityfair.com",
  "thecut.com",
  "wikipedia.org", "wikimedia.org",
  "gettyimages.com",
  "reuters.com",
  "apnews.com",
  "npr.org",
  "spin.com",
  "musictimes.com",
  "uproxx.com",
  "stereogum.com",
];

function hostnameOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

function isBadDomain(url) {
  const h = hostnameOf(url);
  if (!h) return false;
  return BAD_DOMAINS.some((d) => h === d || h.endsWith("." + d));
}

function isGoodDomain(url) {
  const h = hostnameOf(url);
  if (!h) return false;
  return GOOD_DOMAINS.some((d) => h === d || h.endsWith("." + d));
}

async function searchBrave(query) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error("BRAVE_API_KEY not set");
  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=30&safesearch=strict&freshness=py`;
  const res = await fetch(url, {
    headers: {
      "X-Subscription-Token": key,
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
    },
  });
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const json = await res.json();
  const results = json?.results || [];
  const mapped = results
    .map((r) => ({
      img: r?.properties?.url || r?.thumbnail?.src,
      page: r?.url || r?.source || "",
    }))
    .filter((r) => r.img && !isBadDomain(r.img) && !isBadDomain(r.page));
  const good = mapped.filter((r) => isGoodDomain(r.page) || isGoodDomain(r.img));
  const rest = mapped.filter((r) => !good.includes(r));
  return [...good, ...rest].map((r) => r.img);
}

async function searchWikipedia(pageName) {
  const slug = encodeURIComponent(pageName);
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
    headers: { "User-Agent": "CRWN-Reference-Fetcher/1.0 (joshn.wms@gmail.com)" },
  });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const json = await res.json();
  const url = json?.originalimage?.source || json?.thumbnail?.source;
  return url ? [url] : [];
}

const VISION_MODEL = "gemini-2.5-flash";
const MAX_VISION_CHECKS = 8;

function displayNameFromSlug(slug) {
  return slug
    .split("-")
    .map((s) => (s.length <= 2 ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(" ");
}

async function evaluatePhoto(ai, buf, mimeType, personName, extraCriteria, deceased = false) {
  const recencyCriterion = deceased
    ? "EDITORIAL: Looks like a real press/editorial/performance photo from any era (this person is deceased — recency is NOT required and old photos are expected and fine)."
    : "RECENT EDITORIAL: Looks like a recent press/editorial photo (taken within the last 2-3 years if possible).";
  const prompt = `Look at this photo. I will use it as the reference for drawing a hand-sketched cartoon portrait of ${personName}. Reply ONLY with one word: YES or NO.

Reply YES only if ALL of these are true:
1. SOLO SUBJECT: Only ONE person is visible in the photo. If two or more people are in the frame at all — even partially, even in the background, even an arm or shoulder of another person — reply NO. No group photos, no duos, no crowd shots.
2. CORRECT PERSON: The single visible person clearly looks like ${personName} the public figure (not a different celebrity, not a fan illustration, not an AI-generated cartoon, not a painting).
3. FRONT-FACING: The face is front-facing or up to a 3/4 angle. NOT a side profile, NOT facing away.
4. HEAD AND SHOULDERS: Head and shoulders are clearly visible. Face is the main subject of the frame.
5. ${recencyCriterion}
6. CLEAN: No heavy filters, no stylization, no album-cover graphic treatment, no text overlays covering the face.
${extraCriteria ? "7. " + extraCriteria : ""}

If ANY of the above are false, reply NO. Be strict on criterion 1 — even if the other person is just an arm or partially cropped, reject the photo.`;

  try {
    const response = await ai.models.generateContent({
      model: VISION_MODEL,
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: buf.toString("base64") } },
          { text: prompt },
        ],
      }],
    });
    let text = "";
    for (const cand of response.candidates || []) {
      for (const p of cand.content?.parts || []) {
        if (p.text) text += p.text;
      }
    }
    text = text.trim().toUpperCase();
    return text.startsWith("YES");
  } catch (err) {
    console.warn(`  vision eval failed: ${err.message}`);
    return null;
  }
}

export async function fetchPersonRef(slug, opts = {}) {
  if (!fs.existsSync(PEOPLE_DIR)) fs.mkdirSync(PEOPLE_DIR, { recursive: true });

  const existing = findExistingPersonRef(slug);
  if (existing) return existing;

  const known = loadKnownPeople();
  const entry = known[slug] || {};
  const searchQuery = opts.search || entry.search || slug.replace(/-/g, " ");
  const wikiPage = opts.wiki || entry.wiki;
  const personName = opts.name || entry.name || displayNameFromSlug(slug);
  const extraCriteria = opts.extraCriteria || entry.extraCriteria;
  const deceased = opts.deceased ?? entry.deceased ?? false;

  const geminiKey = process.env.GEMINI_API_KEY;
  const ai = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;
  if (!ai) console.warn(`[${slug}] GEMINI_API_KEY not set — skipping vision evaluation`);

  let urls = [];
  try {
    urls = await searchBrave(searchQuery);
  } catch (err) {
    console.warn(`[${slug}] Brave search failed: ${err.message}`);
  }

  let visionRejected = 0;
  let downloadFailed = 0;
  for (const url of urls.slice(0, MAX_VISION_CHECKS)) {
    let buf, ext;
    try {
      ({ buf, ext } = await downloadImage(url));
    } catch (err) {
      downloadFailed++;
      continue;
    }
    let ok = null;
    if (ai) {
      ok = await evaluatePhoto(ai, buf, mimeFromExt(ext), personName, extraCriteria, deceased);
    }
    if (ok === false) {
      visionRejected++;
      console.log(`  [${slug}] vision rejected: ${url}`);
      continue;
    }
    const outPath = path.join(PEOPLE_DIR, `${slug}.${ext}`);
    fs.writeFileSync(outPath, buf);
    console.log(`[${slug}] fetched via Brave (${ext}, ${buf.length} bytes) — ${ok === true ? "vision approved" : "vision unavailable"}`);
    return outPath;
  }
  if (urls.length) {
    console.log(`[${slug}] Brave exhausted: ${visionRejected} rejected, ${downloadFailed} download-failed, ${urls.length - Math.min(MAX_VISION_CHECKS, urls.length)} untried`);
  }

  if (wikiPage) {
    try {
      const wikiUrls = await searchWikipedia(wikiPage);
      for (const url of wikiUrls) {
        let buf, ext;
        try {
          ({ buf, ext } = await downloadImage(url));
        } catch (err) {
          continue;
        }
        let ok = null;
        if (ai) {
          ok = await evaluatePhoto(ai, buf, mimeFromExt(ext), personName, extraCriteria, deceased);
        }
        if (ok === false) {
          console.log(`  [${slug}] vision rejected wiki: ${url}`);
          continue;
        }
        const outPath = path.join(PEOPLE_DIR, `${slug}.${ext}`);
        fs.writeFileSync(outPath, buf);
        console.log(`[${slug}] fetched via Wikipedia (${ext}, ${buf.length} bytes) — ${ok === true ? "vision approved" : "vision unavailable"}`);
        return outPath;
      }
    } catch (err) {
      console.warn(`[${slug}] Wikipedia failed: ${err.message}`);
    }
  }

  console.error(`[${slug}] could not fetch reference photo`);
  return null;
}

export async function ensurePersonRefs(slugs) {
  const refs = [];
  for (const slug of slugs) {
    const p = await fetchPersonRef(slug);
    if (p) refs.push({ slug, path: p });
  }
  return refs;
}

function displayNameFromSlugLocal(slug) {
  return slug
    .split("-")
    .map((s) => (s.length <= 2 ? s.toUpperCase() : s.charAt(0).toUpperCase() + s.slice(1)))
    .join(" ");
}

export function buildPersonRefParts(refs) {
  const known = loadKnownPeople();
  const out = [];
  for (const { slug, path: p } of refs) {
    const name = known[slug]?.name || displayNameFromSlugLocal(slug);
    out.push({ text: `Reference photo of ${name} (use this exact likeness when drawing anyone labeled "${name.toUpperCase()}" in the image):` });
    const ext = path.extname(p).slice(1);
    out.push({ inlineData: { mimeType: mimeFromExt(ext), data: fs.readFileSync(p).toString("base64") } });
  }
  return out;
}

export const PERSON_REF_INSTRUCTION = "CRITICAL: When the visual prompt names a real person (Drake, Kendrick, Jay-Z, Dame Dash, etc.), you MUST use the attached photo reference(s) to draw a recognizable likeness of that specific person. The likeness instruction OVERRIDES any 'stick figure' direction in the prompt — if the prompt says 'stick figure of DRAKE' but a Drake photo is attached, render a small hand-drawn sharpie head-and-shoulders cartoon of Drake with his distinctive features (full beard, hair, face shape), not a generic faceless stick figure. Capture face shape, hair, beard, glasses, body type, signature features so anyone scrolling can tell who the person is. Render the figure as confident hand-drawn black sharpie line work in the same raw paper aesthetic as the rest of the page. Do NOT render photo-realistically. Do NOT add color, shading, or grayscale from the photo. Translate the likeness into sharpie lines. When multiple person photos are attached, match each photo to its labeled name in the prompt so the right likeness goes to the right label.";
