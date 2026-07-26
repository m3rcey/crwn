// Generate the 7 missing Studio tile icons in the EXACT existing style (charcoal object + gold
// accents on a warm-gold gradient), by passing existing studio_*.jpg tiles as style references.
// Saves 1:1 JPGs into public/. Idempotent: skips files that already exist.

import { readFileSync, existsSync, writeFileSync } from 'fs';

const ENV = readFileSync('/home/merce/workspace-crwn/.env.local', 'utf8');
const KEY = (ENV.match(/^GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
if (!KEY) { console.error('No GEMINI_API_KEY'); process.exit(1); }

const MODEL = 'gemini-3.1-flash-image-preview';
const PUB = '/home/merce/workspace-crwn/public';

// Existing gold tiles used ONLY as style references (charcoal object + gold, gold gradient bg).
const REFS = ['studio_offers.jpg', 'studio_team.jpg', 'studio_promise.jpg']
  .map((f) => `${PUB}/${f}`)
  .filter(existsSync)
  .map((p) => ({ inline_data: { mime_type: 'image/jpeg', data: readFileSync(p).toString('base64') } }));

const STYLE =
  'Match the EXACT visual style of the reference images: a single dark charcoal (matte near-black #1a1a1a) ' +
  '3D object with warm gold (#D4AF37) metallic accents, centered with generous margin, a soft shadow beneath, ' +
  'on a smooth warm-gold gradient studio background (deep gold to light gold), soft cinematic studio lighting ' +
  'from the upper left, premium minimalist 3D product render. Absolutely NO text, NO letters, NO numbers, NO ' +
  'logos, NO crowns, NO people. Perfectly square 1:1, object centered. Keep the base image GOLD (the app tints it later).';

const ICONS = [
  ['studio_music.jpg', 'a charcoal 3D musical eighth note with a subtle gold edge highlight'],
  ['studio_albums.jpg', 'a charcoal 3D vinyl record disc, seen at a slight angle, with a gold center label and a gold rim highlight'],
  ['studio_shop.jpg', 'a charcoal 3D shopping bag with gold handles'],
  ['studio_live.jpg', 'a charcoal 3D broadcast microphone with gold accents and faint concentric gold radio-wave arcs behind it'],
  ['studio_analytics.jpg', 'a charcoal 3D upward bar chart with a rising gold trend arrow above the bars'],
  ['studio_manager.jpg', 'a charcoal 3D human brain with faint gold circuit-board traces across it'],
  ['studio_sync.jpg', 'a charcoal 3D film clapperboard, closed and angled, with the iconic gold-and-charcoal striped clapper bar across the top; the slate face is a COMPLETELY BLANK smooth matte charcoal panel with absolutely NO text, NO letters, NO numbers, NO ruled lines, NO writing of any kind anywhere on it'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gen(file, obj) {
  const out = `${PUB}/${file}`;
  if (existsSync(out)) { console.log(`SKIP ${file} (exists)`); return true; }
  const body = {
    contents: [{ parts: [...REFS, { text: `${STYLE}\n\nThe object is: ${obj}.` }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const json = await res.json();
  if (!res.ok) { console.error(`FAIL ${file}: ${res.status} ${JSON.stringify(json).slice(0, 300)}`); return false; }
  const part = (json.candidates?.[0]?.content?.parts || []).find((p) => p.inline_data || p.inlineData);
  const data = part?.inline_data?.data || part?.inlineData?.data;
  if (!data) { console.error(`FAIL ${file}: no image in response ${JSON.stringify(json).slice(0, 300)}`); return false; }
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`OK   ${file} (${Math.round(Buffer.from(data, 'base64').length / 1024)}KB)`);
  return true;
}

let ok = 0;
for (const [file, obj] of ICONS) {
  try { if (await gen(file, obj)) ok++; } catch (e) { console.error(`ERR ${file}: ${e.message}`); }
  await sleep(8000);
}
console.log(`\nDone: ${ok}/${ICONS.length}`);
