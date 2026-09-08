// Which objects in the `audio` bucket does nothing point at any more?
//
// READ-ONLY BY DEFAULT. It reports; it deletes only with --delete, and even then it refuses
// anything it is not certain about. Storage deletion is irreversible and the bucket holds
// artists' masters, so every guard here is deliberately paranoid.
//
// WHY ORPHANS EXIST AT ALL. Deleting a track removes its object (TrackUploadForm's
// executeDeleteTrack), but REPLACING a track's audio does not: the edit path writes the new
// URL over audio_url_128/320 and leaves the old file behind. Uploads that failed before their
// row was inserted leak the same way. Measured 2026-09-08: 37 objects, 266 MB, 16% of the
// bucket.
//
// WHY A SWEEP RATHER THAN DELETING AT THE MOMENT OF REPLACE. A signed URL already handed to a
// listener keeps resolving to the path it was signed for, for up to SIGNED_URL_TTL_SECONDS (one
// hour). Deleting the old object the instant an artist uploads a new mix 404s anyone mid-song.
// Serving the previous mix for the rest of an hour is a far smaller harm than cutting someone
// off, so the old object is left to age out and collected later. A sweep also catches the leaks
// a per-call-site fix would miss: a failed upload, a client-side delete that silently failed, a
// future write path nobody remembered to patch.
//
// THE FOUR GUARDS
//   1. `voice/` is NEVER touched. DM voice notes live in this same bucket and are referenced by
//      `messages`, not `tracks`. A sweep that only knows about tracks would classify every voice
//      note as an orphan and delete real conversations. The prefix is empty today; that is
//      precisely why the rule has to exist before it is not.
//   2. Nothing younger than MIN_AGE_HOURS. An upload whose row insert has not landed yet has no
//      reference, and is indistinguishable from an orphan except by age.
//   3. The reference read must SUCCEED and be non-empty. supabase-js returns { data: null } on
//      error rather than throwing, so a failed read looks exactly like "no track references
//      anything", which would mark the entire bucket deletable.
//   4. A run that wants to delete more than MAX_DELETE_SHARE of the bucket stops and asks. That
//      is the shape of a bug, not a tidy-up.
//
// Usage: node scripts/audit-orphaned-audio.mjs            (report only)
//        node scripts/audit-orphaned-audio.mjs --delete   (collect what it reports)

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DELETE = process.argv.includes('--delete');
const MIN_AGE_HOURS = 24;
const MAX_DELETE_SHARE = 0.5;
/** Prefixes in this bucket that `tracks` does not own. Never swept. */
const NOT_TRACK_PREFIXES = ['voice/'];

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const mb = (b) => (b / 1048576).toFixed(1) + ' MB';

/** A stored locator is either a legacy public URL or a bare path. Both reduce to a key. */
function keyOf(value) {
  if (typeof value !== 'string' || !value) return null;
  const i = value.indexOf('/audio/');
  return i >= 0 ? value.slice(i + '/audio/'.length) : value;
}

// ── Guard 3: the reference set must be real ───────────────────────────────────
const { data: rows, error: refErr } = await db.from('tracks').select('id, audio_url_128, audio_url_320');
if (refErr) {
  console.error('STOP: could not read tracks (' + refErr.code + ' ' + refErr.message + ').');
  console.error('Every object would look orphaned. Nothing was examined.');
  process.exit(1);
}
const referenced = new Set();
for (const r of rows ?? []) {
  for (const v of [r.audio_url_128, r.audio_url_320]) {
    const k = keyOf(v);
    if (k) referenced.add(k);
  }
}
if (referenced.size === 0) {
  console.error('STOP: no track references any audio at all. That is a broken read, not an empty bucket.');
  process.exit(1);
}

// ── Walk the bucket ───────────────────────────────────────────────────────────
const cutoff = Date.now() - MIN_AGE_HOURS * 3600_000;
const live = [];
const orphans = [];
const tooNew = [];
const skipped = [];
let totalBytes = 0;

const { data: roots } = await db.storage.from('audio').list('', { limit: 1000 });
for (const root of roots ?? []) {
  if (root.metadata) continue; // a file sitting at the bucket root, not a folder
  if (NOT_TRACK_PREFIXES.some((p) => (root.name + '/').startsWith(p))) {
    skipped.push(root.name);
    continue;
  }
  const { data: objs } = await db.storage.from('audio').list(root.name, { limit: 1000 });
  for (const o of objs ?? []) {
    const key = root.name + '/' + o.name;
    const size = o.metadata?.size ?? 0;
    totalBytes += size;
    if (referenced.has(key)) { live.push({ key, size }); continue; }
    const created = Date.parse(o.created_at ?? o.updated_at ?? '');
    if (Number.isFinite(created) && created > cutoff) { tooNew.push({ key, size }); continue; }
    orphans.push({ key, size });
  }
}

const orphanBytes = orphans.reduce((s, o) => s + o.size, 0);
orphans.sort((a, b) => b.size - a.size);

console.log('audio bucket');
console.log('  objects        ' + (live.length + orphans.length + tooNew.length) + '  (' + mb(totalBytes) + ')');
console.log('  referenced     ' + live.length);
console.log('  ORPHANED       ' + orphans.length + '  (' + mb(orphanBytes) + ')');
if (tooNew.length) console.log('  too new to judge ' + tooNew.length + '  (uploaded within ' + MIN_AGE_HOURS + 'h; left alone)');
if (skipped.length) console.log('  prefixes skipped ' + skipped.join(', ') + '  (not owned by tracks)');

if (orphans.length) {
  console.log('\nlargest orphans:');
  for (const o of orphans.slice(0, 10)) console.log('  ' + mb(o.size).padStart(9) + '  ' + o.key);
  if (orphans.length > 10) console.log('  ... and ' + (orphans.length - 10) + ' more');
}

if (!DELETE) {
  console.log('\nRead-only. Re-run with --delete to remove the orphans listed above.');
  process.exit(0);
}

if (!orphans.length) {
  console.log('\nNothing to collect.');
  process.exit(0);
}

// ── Guard 4: a sweep that eats the bucket is a bug ────────────────────────────
const share = orphanBytes / (totalBytes || 1);
if (share > MAX_DELETE_SHARE) {
  console.error(
    '\nSTOP: this would delete ' + Math.round(share * 100) + '% of the bucket. That is the shape of a ' +
    'broken reference read, not a tidy-up. Nothing was deleted.',
  );
  process.exit(1);
}

const { data: removed, error: delErr } = await db.storage.from('audio').remove(orphans.map((o) => o.key));
if (delErr) {
  console.error('\ndelete failed: ' + delErr.message);
  process.exit(1);
}
console.log('\ncollected ' + (removed?.length ?? 0) + ' object(s), ' + mb(orphanBytes) + ' reclaimed.');

// Prove the live files survived, rather than assuming they did.
const stillReferenced = new Set();
const { data: after } = await db.storage.from('audio').list('', { limit: 1000 });
for (const root of after ?? []) {
  if (root.metadata) continue;
  const { data: objs } = await db.storage.from('audio').list(root.name, { limit: 1000 });
  for (const o of objs ?? []) stillReferenced.add(root.name + '/' + o.name);
}
const missing = live.filter((l) => !stillReferenced.has(l.key));
console.log(missing.length
  ? 'ALARM: ' + missing.length + ' referenced object(s) are gone: ' + missing.map((m) => m.key).join(', ')
  : 'All ' + live.length + ' referenced objects are intact.');
process.exitCode = missing.length ? 1 : 0;
