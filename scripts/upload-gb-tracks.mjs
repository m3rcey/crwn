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
// REPLACING A TRACK'S AUDIO (--replace <title>) uploads to a NEW timestamped path rather than
// overwriting the old object. Two reasons: a signed URL already handed to a listener keeps
// resolving to the path it was signed for, so overwriting in place is the one way to serve a
// stale mix to somebody mid-listen; and the previous object survives as a rollback. Duration is
// re-read from the new file rather than carried over, because a re-export can change length.
//
// Usage: node scripts/upload-gb-tracks.mjs [--dry]
//        node scripts/upload-gb-tracks.mjs --replace Pivotal [--dry]

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');
const replaceIdx = process.argv.indexOf('--replace');
const REPLACE_TITLE = replaceIdx >= 0 ? process.argv[replaceIdx + 1] : null;
const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** The running order the artist asked for. Go Bad keeps its access, and only moves. */
const ORDER = [
  { title: 'Pivotal', file: 'videos/output/GB THE G1FT - Pivotal.wav' },
  { title: 'National', file: 'videos/output/GB THE G1FT - National.wav' },
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
  // Both locator columns are selected because --replace compares the live bytes against the
  // local file before doing anything, and since 2026-09-08 the two columns hold DIFFERENT
  // files: audio_url_128 is a transcoded 128 kbps stream copy, audio_url_320 is the master.
  // The comparison must use the MASTER, or it compares a wav against an mp3, always differs,
  // and the "nothing to do" guard can never fire again.
  .select('id, title, position, is_free, allowed_tier_ids, audio_url_128, audio_url_320')
  .eq('artist_id', gb.id);
const byTitle = new Map((existing ?? []).map((t) => [t.title.toLowerCase(), t]));

console.log('GB has ' + (existing?.length ?? 0) + ' track(s) before this run.\n');

// ── Replace one track's audio, leaving position and access exactly as they are ────────────
if (REPLACE_TITLE) {
  const entry = ORDER.find((e) => e.title.toLowerCase() === REPLACE_TITLE.toLowerCase());
  const row = byTitle.get(REPLACE_TITLE.toLowerCase());
  if (!entry?.file) {
    console.error(`No source file is registered for "${REPLACE_TITLE}".`);
    process.exit(1);
  }
  if (!row) {
    console.error(`GB has no track called "${REPLACE_TITLE}".`);
    process.exit(1);
  }

  const bytes = readFileSync(entry.file);
  const localHash = createHash('sha256').update(bytes).digest('hex');

  // Prove the file actually differs before touching anything. A re-export can produce an
  // identical byte COUNT with different audio, so size is not identity: only the hash is.
  // Compared against the MASTER (audio_url_320): the 128 column is a transcoded mp3, so
  // hashing against it would report "differs" even for an unchanged file.
  const pathOf = (u) => (u ?? '').split('/audio/')[1] || null;
  const oldMaster = pathOf(row.audio_url_320) ?? pathOf(row.audio_url_128);
  const oldStream = pathOf(row.audio_url_128);
  if (oldMaster) {
    const { data: current } = await db.storage.from('audio').download(oldMaster);
    if (current) {
      const remoteHash = createHash('sha256').update(Buffer.from(await current.arrayBuffer())).digest('hex');
      if (remoteHash === localHash) {
        console.log(`${entry.title} — the uploaded file is already byte-identical. Nothing to do.`);
        process.exit(0);
      }
      console.log(`${entry.title} — local file differs from the live master:`);
      console.log(`   live  ${remoteHash.slice(0, 16)}...  (${(current.size / 1048576).toFixed(1)} MB)`);
      console.log(`   local ${localHash.slice(0, 16)}...  (${(bytes.length / 1048576).toFixed(1)} MB)`);
    }
  }

  const duration = wavDuration(entry.file);
  const mmss = Math.floor(duration / 60) + ':' + String(duration % 60).padStart(2, '0');
  if (DRY) {
    console.log(`${entry.title} — WOULD upload the new version (${mmss}) and repoint the track`);
    process.exit(0);
  }

  const path = `${gb.id}/${Date.now()}.wav`;
  const { error: upErr } = await db.storage
    .from('audio')
    .upload(path, bytes, { contentType: 'audio/wav', upsert: false });
  if (upErr) {
    console.error(`${entry.title} — upload FAILED: ${upErr.message}`);
    process.exit(1);
  }
  const { data: { publicUrl } } = db.storage.from('audio').getPublicUrl(path);

  const { error: updErr } = await db
    .from('tracks')
    .update({
      audio_url_128: publicUrl,
      audio_url_320: publicUrl,
      duration,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  if (updErr) {
    console.error(`${entry.title} — the file uploaded but the track row FAILED: ${updErr.message}`);
    process.exit(1);
  }

  console.log(`\n${entry.title} — new master uploaded (${mmss}).`);
  console.log(`   was master ${oldMaster ?? 'nothing'}`);
  console.log(`   was stream ${oldStream ?? 'nothing'}`);
  console.log(`   now both   ${path.split('/').pop()}`);
  console.log('\n   BOTH columns point at the raw master right now, so a tap pulls ' +
    (bytes.length / 1048576).toFixed(1) + ' MB. Give it a stream copy next:');
  console.log('     npm run transcode:audio -- --apply --id ' + row.id);
  console.log('   The previous objects are left in place as a rollback.');
  process.exit(0);
}

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
