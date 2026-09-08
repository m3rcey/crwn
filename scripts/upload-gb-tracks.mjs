// Upload GB's free tracks and set the running order. Idempotent.
//
// Follows the EXACT convention TrackUploadForm already uses, because a second way to create a
// track is a second way for one to be wrong: Supabase Storage `audio` bucket, path
// `{artist_id}/{timestamp}.{ext}`, public URL written to BOTH audio_url_128 and audio_url_320.
// Go Bad was uploaded this way and is the reference.
//
// ACCESS IS DERIVED, NEVER TYPED. is_free / allowed_tier_ids / public_release_date come from
// fieldsForClass('free_forever'), the one owner of those three fields. Setting them by hand is
// how a track ends up with a future date and an empty tier list, which the gate reads as locked
// for everyone including paying members.
//
// GO BAD IS NOT TOUCHED except for its position. It stays members-only (is_free false, gated to
// all four rungs), which was a deliberate ruling: an anonymous visitor who has not joined GB
// must not get permanent access to it. The player skips locked tracks when advancing, so a
// stranger hears Pivotal then Maneuver and stops; a member hears all three.
//
// Usage: node scripts/upload-gb-tracks.mjs [--dry]

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');
const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** The running order the artist asked for. Go Bad keeps its access, and only moves. */
const ORDER = [
  { title: 'Pivotal', file: 'videos/output/GB THE G1FT - Pivotal.wav' },
  { title: 'Maneuver', file: 'videos/output/GB THE G1FT - Maneuver.wav' },
  { title: 'Go Bad', existing: true },
];

/**
 * Seconds, read from the WAV header rather than guessed. Walks the RIFF chunks instead of
 * assuming `data` sits at byte 44: these files carry extra chunks before it, and a fixed offset
 * would produce a confidently wrong duration.
 */
function wavDuration(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file: ' + path);
  }
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(off + 16);
    if (id === 'data') {
      if (!byteRate) throw new Error('data chunk before fmt chunk: ' + path);
      return Math.round(size / byteRate);
    }
    off += 8 + size + (size % 2); // chunks are word-aligned
  }
  throw new Error('no data chunk: ' + path);
}

const { data: gb, error: gbErr } = await db
  .from('artist_profiles')
  .select('id, slug')
  .eq('slug', 'gb')
  .single();
if (gbErr || !gb) {
  console.error('GB not found:', gbErr?.message);
  process.exit(1);
}

const { data: existing } = await db
  .from('tracks')
  .select('id, title, position, is_free, allowed_tier_ids')
  .eq('artist_id', gb.id);
const byTitle = new Map((existing ?? []).map((t) => [t.title.toLowerCase(), t]));

console.log('GB has ' + (existing?.length ?? 0) + ' track(s) before this run.\n');

for (let position = 0; position < ORDER.length; position += 1) {
  const entry = ORDER[position];
  const already = byTitle.get(entry.title.toLowerCase());

  // Go Bad, and any re-run: the row exists, so only the running order is written. Access is
  // deliberately left exactly as it is.
  if (already) {
    if (already.position === position) {
      console.log(`${position}. ${entry.title} — already in place (position ${position})`);
      continue;
    }
    if (DRY) {
      console.log(`${position}. ${entry.title} — WOULD move from position ${already.position} to ${position}`);
      continue;
    }
    const { error } = await db
      .from('tracks')
      .update({ position, updated_at: new Date().toISOString() })
      .eq('id', already.id);
    console.log(`${position}. ${entry.title} — ${error ? 'FAILED: ' + error.message : `moved from position ${already.position} to ${position}`}`);
    continue;
  }

  if (entry.existing) {
    console.log(`${position}. ${entry.title} — expected to exist already but was not found; skipped`);
    continue;
  }

  const duration = wavDuration(entry.file);
  const mmss = Math.floor(duration / 60) + ':' + String(duration % 60).padStart(2, '0');

  if (DRY) {
    console.log(`${position}. ${entry.title} — WOULD upload (${mmss}) and create as free forever`);
    continue;
  }

  const bytes = readFileSync(entry.file);
  const path = `${gb.id}/${Date.now()}.wav`;
  const { error: upErr } = await db.storage
    .from('audio')
    .upload(path, bytes, { contentType: 'audio/wav', upsert: false });
  if (upErr) {
    console.error(`${position}. ${entry.title} — upload FAILED: ${upErr.message}`);
    process.exitCode = 1;
    continue;
  }
  const { data: { publicUrl } } = db.storage.from('audio').getPublicUrl(path);

  // free_forever, as fieldsForClass derives it. Written literally here (this script is plain
  // JS and cannot import the TS module), and asserted against it by gbTrackOrder.test.ts.
  const { error: insErr } = await db.from('tracks').insert({
    artist_id: gb.id,
    title: entry.title,
    audio_url_128: publicUrl,
    audio_url_320: publicUrl,
    duration,
    position,
    is_free: true,
    allowed_tier_ids: [],
    public_release_date: null,
    is_active: true,
  });
  console.log(
    `${position}. ${entry.title} — ${insErr ? 'INSERT FAILED: ' + insErr.message : `uploaded (${mmss}) and published free`}`,
  );
  if (insErr) process.exitCode = 1;
}

const { data: after } = await db
  .from('tracks')
  .select('title, position, is_free, allowed_tier_ids, duration, audio_url_128')
  .eq('artist_id', gb.id)
  .eq('is_active', true)
  .order('position');

console.log('\nRunning order on ' + gb.slug + "'s page:");
for (const t of after ?? []) {
  const access = t.is_free && (t.allowed_tier_ids ?? []).length === 0 ? 'free' : 'members only';
  const mmss = Math.floor(t.duration / 60) + ':' + String(t.duration % 60).padStart(2, '0');
  console.log(`  ${t.position}. ${t.title} (${mmss}, ${access})${t.audio_url_128 ? '' : ' — NO AUDIO'}`);
}
