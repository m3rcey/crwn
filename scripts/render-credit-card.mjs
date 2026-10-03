// Render a credit card to PNG files so it can be LOOKED AT before anyone posts one.
// Uses the real artwork module (src/lib/projectCredits/cardImage.tsx) and, when given, a real
// album's cover. Writes nothing to the database.
//
// Run:  npx tsx scripts/render-credit-card.mjs <artist slug> "<album title>" [out dir]
//       e.g. npx tsx scripts/render-credit-card.mjs princedre "Stompin Thru The Trenches" /tmp/cards

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { cardFooterLink, creditCardImage, creditQr } from '../src/lib/projectCredits/cardImage.tsx';

const [slug, albumTitle, out = '/tmp/credit-cards'] = process.argv.slice(2);
if (!slug || !albumTitle) {
  console.error('usage: npx tsx scripts/render-credit-card.mjs <artist slug> "<album title>" [out dir]');
  process.exit(1);
}

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: artist } = await db.from('artist_profiles').select('id, user_id').eq('slug', slug).single();
const { data: profile } = await db.from('profiles').select('display_name').eq('id', artist.user_id).single();
const { data: album } = await db.from('albums').select('album_art_url').eq('artist_id', artist.id).eq('title', albumTitle).single();

let art = null;
if (album?.album_art_url) {
  const res = await fetch(album.album_art_url);
  const type = (res.headers.get('content-type') || '').split(';')[0];
  console.log(`cover: ${type}, ${res.status}`);
  if (res.ok && /^image\/(png|jpe?g)$/.test(type)) art = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
}

mkdirSync(out, { recursive: true });
const sample = { artistName: profile.display_name, albumTitle, level: 'founding', number: 7, name: 'Keisha M.', art };
for (const story of [true, false]) {
  const qr = story ? await creditQr(`https://thecrwn.app/${slug}/credits/sample/founding/7`) : null;
  const res = creditCardImage({ ...sample, story, link: cardFooterLink(slug, albumTitle, story), code: 'CR-1A2B-3C4D', qr });
  const file = `${out}/${story ? 'story' : 'preview'}.png`;
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`wrote ${file}`);
}
