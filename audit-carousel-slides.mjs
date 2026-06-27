import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("ERROR: GEMINI_API_KEY not set."); process.exit(1); }
const ai = new GoogleGenAI({ apiKey: API_KEY });

const CAROUSEL_BASE = "/mnt/c/Users/Merce/Dropbox/nano banana output/Carousel Posts";
const OUT_JSON = "/home/merce/.openclaw/workspace-crwn/carousel-audit-results.json";
const MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];

const QUESTION = `This image is a single hand-drawn black-sharpie-on-white-paper Instagram carousel slide about the music industry. Inspect the text and drawings carefully and answer ONLY with a compact JSON object (no markdown, no prose) with these boolean/string fields:
{
 "crwn": true if the slide shows the word "CRWN" or a crown logo/brand mark that is NOT part of the slide's actual story content,
 "tagline": true if the slide shows a marketing tagline like "every dollar goes straight to the artist", "no middleman", or "no algorithm",
 "doubled": true if any line of text is drawn twice / overlapping, OR a word is accidentally repeated (e.g. "and and", "the the"),
 "leaked": true if the slide literally shows stage-direction words that should not be visible, like "framing line", "supporting marks", "takeaway page", "rising action", "slide copy",
 "typo": true if there is a clear misspelling of a normal English word (e.g. "CHASEB", "BEATTS", "HOR", "OCE"),
 "notes": a SHORT phrase naming the exact problem text if any, else ""
}
Be strict: only set a flag true if you are confident. If the slide looks clean, set all booleans false and notes "".`;

function loadImagePart(file) {
  return { inlineData: { mimeType: "image/png", data: fs.readFileSync(file).toString("base64") } };
}

function parseJson(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function analyze(file) {
  for (const model of MODELS) {
    try {
      const resp = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [loadImagePart(file), { text: QUESTION }] }],
      });
      const text = resp.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("") || resp.text || "";
      const parsed = parseJson(text);
      if (parsed) return { ...parsed, _model: model };
    } catch (e) {
      // try next model
      if (model === MODELS[MODELS.length - 1]) return { _error: e.message };
    }
  }
  return { _error: "no parseable response" };
}

const folders = fs.readdirSync(CAROUSEL_BASE)
  .map(n => path.join(CAROUSEL_BASE, n))
  .filter(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } })
  .sort();

const results = [];
let scanned = 0, flagged = 0, errors = 0;

for (const folder of folders) {
  const name = path.basename(folder);
  const slides = fs.readdirSync(folder).filter(f => /^slide-\d+\.png$/.test(f)).sort();
  for (const s of slides) {
    const file = path.join(folder, s);
    const r = await analyze(file);
    scanned++;
    if (r._error) {
      errors++;
      console.log(`ERR  ${name}/${s}  (${r._error})`);
      results.push({ carousel: name, slide: s, error: r._error });
      continue;
    }
    const flags = ["crwn", "tagline", "doubled", "leaked", "typo"].filter(k => r[k]);
    if (flags.length) {
      flagged++;
      console.log(`FLAG ${name}/${s}  [${flags.join(",")}]  ${r.notes || ""}`);
      results.push({ carousel: name, slide: s, flags, notes: r.notes || "" });
    } else {
      results.push({ carousel: name, slide: s, flags: [] });
    }
    await new Promise(res => setTimeout(res, 1200));
  }
}

fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
console.log(`\n=== AUDIT DONE ===\nScanned: ${scanned}\nFlagged: ${flagged}\nErrors: ${errors}\nResults: ${OUT_JSON}`);
