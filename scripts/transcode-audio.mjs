// Give every track a STREAM copy, so a tap does not pull a raw master.
//
// READ-ONLY BY DEFAULT. It reports; it converts and rewrites rows only with --apply.
//
// WHY. Tap-to-sound was measured at 2.2s desktop / ~6s phone (2026-09-08). Half of that was
// round trips, now gone. The other half is the file: 29 of 59 active tracks were raw WAV
// masters (1411 kbps, ~32 MB for three minutes) served as BOTH audio_url_128 and audio_url_320,
// each play a CDN miss straight from storage. The upload form has said "Files will be
// transcoded to 128kbps (stream) and 320kbps (premium)" since the beginning and nothing ever
// did it. This is the thing that does it.
//
// WHAT IT WRITES, EXACTLY.
//   * a new object `<same folder>/<same name>-128.mp3` (128 kbps CBR, libmp3lame), uploaded
//     with upsert so a re-run is idempotent
//   * tracks.audio_url_128 -> the new object's locator, in the SAME public-URL shape every
//     other writer uses (signedAudio.ts parses either shape; TrackUploadForm's delete splits
//     on it), guarded by `WHERE audio_url_128 = <the value we read>` so a concurrent replace
//     is never overwritten
//   * NOTHING else. audio_url_320 keeps pointing at the original, which stays in the bucket.
//     Nothing plays that column today; it is the artist's master and this script never
//     deletes a master.
//
// GUARDS.
//   1. Only lossless containers are candidates (wav/aiff/flac). An mp3/m4a is already a
//      stream and is left alone, whatever its bitrate.
//   2. The new object is verified BEFORE the row is touched: signed, fetched, content-type
//      audio/mpeg, non-trivial size. A row is never pointed at a missing or empty file.
//   3. The row update is conditional on the value we read. If the artist replaced the audio
//      while we were encoding, the update matches zero rows and the new object is simply an
//      orphan the daily audit collects.
//   4. `voice/` is never read or written.
//
// RUNS ANYWHERE WITH ffmpeg ON PATH: this Windows box (winget ffmpeg), or the daily GitHub
// Action (.github/workflows/transcode-audio.yml; ubuntu runners ship ffmpeg). Credentials come
// from the environment first, then .env.local if present.
//
// Usage: node scripts/transcode-audio.mjs                 (report candidates)
//        node scripts/transcode-audio.mjs --apply         (convert them all)
//        node scripts/transcode-audio.mjs --apply --limit 1 --id <track uuid>

import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const argAfter = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined; };
const LIMIT = Number(argAfter('--limit') || Infinity);
const ONLY_ID = argAfter('--id');

const LOSSLESS = new Set(['wav', 'wave', 'aif', 'aiff', 'flac']);
const BITRATE = '128k';
const SUFFIX = '-128.mp3';
/** Anything smaller than this is not three seconds of audio at 128 kbps, so it is a broken encode. */
const MIN_BYTES = 48_000;

const envFile = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const pick = (k) =>
  process.env[k] || (envFile.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const URL = pick('NEXT_PUBLIC_SUPABASE_URL');
const KEY = pick('SUPABASE_SERVICE_ROLE_KEY');
if (!URL || !KEY) {
  console.error('STOP: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (env or .env.local).');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
const PUBLIC_PREFIX = '/storage/v1/object/public/audio/';

/** A stored locator is either the legacy public URL or a bare path. Both reduce to a key. */
function keyOf(value) {
  if (typeof value !== 'string' || !value) return null;
  const i = value.indexOf('/audio/');
  let k = i >= 0 ? value.slice(i + '/audio/'.length) : value;
  k = k.split('?')[0].split('#')[0];
  try { k = decodeURIComponent(k); } catch { /* keep raw */ }
  return k;
}
const extOf = (key) => (key.includes('.') ? key.split('.').pop().toLowerCase() : '');

// Guard 3 of the audit script applies here too: a failed read must never look like "nothing to do".
const { data: rows, error } = await db
  .from('tracks')
  .select('id, title, artist_id, audio_url_128, audio_url_320, is_active')
  .not('audio_url_128', 'is', null);
if (error) {
  console.error('STOP: could not read tracks (' + error.code + ' ' + error.message + ').');
  process.exit(1);
}

const candidates = [];
for (const r of rows ?? []) {
  if (ONLY_ID && r.id !== ONLY_ID) continue;
  const key = keyOf(r.audio_url_128);
  if (!key || key.startsWith('voice/')) continue;
  if (!LOSSLESS.has(extOf(key))) continue;
  candidates.push({ ...r, key });
}

console.log('tracks with audio     ' + (rows ?? []).length);
console.log('lossless stream files ' + candidates.length + (ONLY_ID ? '  (filtered to --id)' : ''));
for (const c of candidates) console.log('  ' + c.id + '  ' + c.key + '  ' + (c.title ?? ''));

if (!APPLY) {
  console.log('\nRead-only. Re-run with --apply to convert (add --limit N or --id <uuid> to start small).');
  process.exit(0);
}
if (!candidates.length) { console.log('\nNothing to convert.'); process.exit(0); }

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('STOP: ffmpeg is not on PATH.');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'crwn-transcode-'));
let done = 0, failed = 0, savedBytes = 0;

for (const c of candidates.slice(0, LIMIT)) {
  const label = c.key + '  (' + (c.title ?? c.id) + ')';
  try {
    // 1. download the master with the service role
    const { data: blob, error: dlErr } = await db.storage.from('audio').download(c.key);
    if (dlErr || !blob) throw new Error('download failed: ' + (dlErr?.message ?? 'no data'));
    const inBuf = Buffer.from(await blob.arrayBuffer());
    const inPath = join(work, c.id + '.' + extOf(c.key));
    const outPath = join(work, c.id + SUFFIX);
    writeFileSync(inPath, inBuf);

    // 2. encode: 128 kbps CBR mp3, 44.1 kHz, channels preserved, no cover art or chapters
    execFileSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inPath, '-vn', '-map_metadata', '-1',
      '-codec:a', 'libmp3lame', '-b:a', BITRATE, '-ar', '44100',
      outPath,
    ], { stdio: 'inherit' });
    const outSize = statSync(outPath).size;
    if (outSize < MIN_BYTES) throw new Error('encode produced ' + outSize + ' bytes');

    // 3. upload beside the master; upsert makes a re-run harmless
    const newKey = c.key.replace(/\.[^./]+$/, '') + SUFFIX;
    const { error: upErr } = await db.storage
      .from('audio')
      .upload(newKey, readFileSync(outPath), { contentType: 'audio/mpeg', upsert: true });
    if (upErr) throw new Error('upload failed: ' + upErr.message);

    // 4. verify the object the row is about to point at, through the same door the player uses
    const { data: signed, error: signErr } = await db.storage.from('audio').createSignedUrl(newKey, 120);
    if (signErr || !signed?.signedUrl) throw new Error('could not sign new object');
    const head = await fetch(signed.signedUrl, { method: 'HEAD' });
    const ct = head.headers.get('content-type') || '';
    const len = Number(head.headers.get('content-length') || 0);
    if (!head.ok || !ct.startsWith('audio/mpeg') || len < MIN_BYTES) {
      throw new Error('verification failed: status ' + head.status + ' type ' + ct + ' length ' + len);
    }

    // 5. point the STREAM column at it, only if nobody replaced the audio meanwhile
    const locator = URL.replace(/\/$/, '') + PUBLIC_PREFIX + newKey;
    const { data: updated, error: rowErr } = await db
      .from('tracks')
      .update({ audio_url_128: locator })
      .eq('id', c.id)
      .eq('audio_url_128', c.audio_url_128)
      .select('id');
    if (rowErr) throw new Error('row update failed: ' + rowErr.message);
    if (!updated?.length) throw new Error('row changed underneath us; left untouched');

    done++;
    savedBytes += inBuf.length - outSize;
    console.log('ok   ' + label + '  ' + mb(inBuf.length) + ' -> ' + mb(outSize));
    rmSync(inPath, { force: true }); rmSync(outPath, { force: true });
  } catch (e) {
    failed++;
    console.error('FAIL ' + label + ': ' + (e?.message ?? e));
  }
}

rmSync(work, { recursive: true, force: true });
console.log('\nconverted ' + done + ', failed ' + failed + ', stream bytes saved ' + mb(Math.max(0, savedBytes)));
process.exit(failed ? 1 : 0);
