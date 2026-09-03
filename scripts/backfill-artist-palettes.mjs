// Sample artist colourways SERVER-SIDE and persist them.
//
// The browser sampler only ever ran when an owner happened to load their own page after
// a banner upload, which left almost every artist without a palette and every fan-facing
// surface on CRWN gold regardless of what the artist looked like. This does the same job
// without a browser: banner first, then avatar (a real photo of the artist, and the image
// a fan actually sees at the top of a drop page).
//
// Idempotent: an artist who already has accent_hex is skipped unless --force is passed.
// Never invents a colour: an image with no usable hue is left null and CRWN gold stays.
//
// Usage:
//   npx tsx scripts/backfill-artist-palettes.mjs            all artists missing a palette
//   npx tsx scripts/backfill-artist-palettes.mjs gb         one artist by slug
//   npx tsx scripts/backfill-artist-palettes.mjs gb --force resample even if one exists

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { samplePaletteFromUrl } from '../src/lib/paletteServer.ts';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const args = process.argv.slice(2);
const force = args.includes('--force');
const slug = args.find((a) => !a.startsWith('--')) ?? null;

let q = db.from('artist_profiles').select('id, slug, user_id, banner_url, accent_hex');
if (slug) q = q.eq('slug', slug);
const { data: artists, error } = await q;
if (error) { console.error(error.message); process.exit(1); }

for (const a of artists || []) {
  if (a.accent_hex && !force) { console.log(`${a.slug}: already has ${a.accent_hex}, skipped`); continue; }

  // The artist's own images, banner first: it is the larger, more deliberate artwork.
  const { data: profile } = await db.from('profiles').select('avatar_url').eq('id', a.user_id).maybeSingle();
  const sources = [a.banner_url, profile?.avatar_url].filter((u) => typeof u === 'string' && u.startsWith('http'));
  if (!sources.length) { console.log(`${a.slug}: no image to sample`); continue; }

  let palette = null;
  let used = null;
  for (const src of sources) {
    palette = await samplePaletteFromUrl(src);
    if (palette) { used = src; break; }
  }
  if (!palette) { console.log(`${a.slug}: no usable colour in any image, gold stays`); continue; }

  const { error: e } = await db.from('artist_profiles').update({
    accent_hex: palette.accent,
    accent2_hex: palette.accent2,
    surface_hex: palette.surface,
  }).eq('id', a.id);
  if (e) { console.error(`${a.slug}: write failed: ${e.message}`); continue; }

  const kind = used === a.banner_url ? 'banner' : 'avatar';
  console.log(`${a.slug}: accent ${palette.accent}, accent2 ${palette.accent2}, surface ${palette.surface}  (from ${kind})`);
}
