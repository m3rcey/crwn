// Queue ONE finished video as an Instagram Reel.
//
// The carousel queue scans a folder of generated sheets. Filmed videos are exported from Premiere
// to wherever the founder saves them, so this command takes the file and its caption explicitly.
// It checks the video against Instagram's Reels spec, uploads it to R2 and writes one social_posts
// row (kind video_short) with one Instagram target. The cron ticks publish it at its slot.
//
// USAGE
//   Dry run (default, uploads and writes nothing):
//     node scripts/queue-video.mjs --file "/mnt/c/Users/Josh/Videos/31-j-cole.mp4" --caption caption.md --date 2026-09-25 --at 18:00
//
//   Actually queue it:
//     ... --queue
//
//   Options:
//     --slug <name>      what the post is called in the queue (default: the file name)
//     --thumb <seconds>  which moment becomes the cover (default: Instagram picks)
//     --tz <zone>        wall clock zone (default America/New_York)
//     --allow-republish  queue a video that was already queued or posted (normally refused)
//
// ONE VIDEO, ONE POST, EVER. Posting the same video twice is a public duplicate and Instagram
// throttles the reach of reposted video, so a second queue of the same file is refused. The check
// is on the file's CONTENT (a sha256 stored on the row), so renaming the file does not get around it.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

import { parseCaption } from './lib/instagramCarousel.mjs';
import { buildSlots, formatInZone, DEFAULT_TIME_ZONE } from './lib/schedule.mjs';

// Instagram Reels, from Meta's content publishing reference.
const REEL = {
  minSeconds: 3,
  maxSeconds: 900,
  maxBytes: 300 * 1024 * 1024,
  // Meta allows up to 1920 wide, but Reels are delivered at 1080, so anything wider is scaled
  // down when a re-encode happens anyway.
  targetWidth: 1080,
  maxVideoBitrate: 25_000_000,
  maxAudioHz: 48000,
  minFps: 23,
  maxFps: 60,
  videoCodecs: ['h264', 'hevc'],
  audioCodecs: ['aac'],
};

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const has = (name) => argv.includes(`--${name}`);

function die(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

// Accept a Windows path pasted from Explorer ("C:\Users\...") as well as a WSL one.
function toLocalPath(p) {
  if (!p) return p;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}` : p;
}

const FILE = toLocalPath(flag('file'));
const CAPTION = toLocalPath(flag('caption'));
const DATE = flag('date');
const AT = flag('at');
const TZ = flag('tz') || DEFAULT_TIME_ZONE;
const THUMB = flag('thumb');
const DO_QUEUE = has('queue');

if (!FILE || !CAPTION || !DATE || !AT) {
  die('Usage: node scripts/queue-video.mjs --file <video.mp4> --caption <caption.md> --date YYYY-MM-DD --at HH:MM [--queue]');
}

function loadEnvLocal() {
  const out = {};
  try {
    const raw = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* optional when real env vars are set */
  }
  return out;
}
const fileEnv = loadEnvLocal();
const env = (k) => process.env[k] ?? fileEnv[k] ?? '';
const SECRETS = [env('R2_SECRET_ACCESS_KEY'), env('SUPABASE_SERVICE_ROLE_KEY')].filter(Boolean);
const safe = (v) => {
  let s = String(v);
  for (const x of SECRETS) if (x.length >= 8) s = s.split(x).join('[REDACTED]');
  return s;
};

const problems = [];
const warnings = [];

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

if (!fs.existsSync(FILE)) die(`Video not found: ${FILE}`);
if (!fs.existsSync(CAPTION)) die(`Caption file not found: ${CAPTION}`);

const ext = path.extname(FILE).toLowerCase();
if (ext !== '.mp4' && ext !== '.mov') problems.push(`the video must be .mp4 or .mov, got ${ext || 'no extension'}`);
const bytes = fs.statSync(FILE).size;

let probe;
try {
  probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', FILE], {
      encoding: 'utf8',
    })
  );
} catch (e) {
  die(`ffprobe could not read the video: ${e.message}`);
}
const v = probe.streams.find((s) => s.codec_type === 'video');
const a = probe.streams.find((s) => s.codec_type === 'audio');
const seconds = Number(probe.format?.duration ?? v?.duration ?? 0);
let fps = 0;
if (v) {
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || '0/1').split('/').map(Number);
  fps = d ? n / d : 0;
}

// Two kinds of spec miss. A PROBLEM cannot be fixed here (too short, wrong frame rate) and refuses.
// A REENCODE reason can: Premiere's high-quality exports run ~28 Mbps against Meta's 25 Mbps cap,
// and the automated pipeline writes 96 kHz audio against a 48 kHz cap. Either would be accepted
// at queue time and then fail inside Meta at the slot, so a compliant copy is made here instead.
const reencode = [];
if (!v) problems.push('the file has no video stream');
else {
  if (!REEL.videoCodecs.includes(v.codec_name)) reencode.push(`video codec ${v.codec_name} (Reels take H.264/HEVC)`);
  if (v.width > REEL.targetWidth) reencode.push(`${v.width}px wide (scaled to ${REEL.targetWidth})`);
  if (v.pix_fmt && v.pix_fmt !== 'yuv420p') reencode.push(`pixel format ${v.pix_fmt} (Reels take 4:2:0)`);
  const vbr = Number(v.bit_rate || probe.format?.bit_rate || 0);
  if (vbr > REEL.maxVideoBitrate) reencode.push(`video bitrate ${(vbr / 1e6).toFixed(1)} Mbps (Reels cap ${REEL.maxVideoBitrate / 1e6})`);
  if (fps && (fps < REEL.minFps - 0.5 || fps > REEL.maxFps + 0.5)) problems.push(`frame rate is ${fps.toFixed(2)}; Reels take 23 to 60 fps`);
  const ratio = v.width / v.height;
  if (Math.abs(ratio - 9 / 16) > 0.02) warnings.push(`aspect is ${v.width}x${v.height}, not 9:16; Instagram will letterbox or crop it in the Reels tab`);
}
if (bytes > REEL.maxBytes) reencode.push(`${(bytes / 1048576).toFixed(0)}MB file (Reels cap ${REEL.maxBytes / 1048576}MB)`);
if (!a) warnings.push('the video has no audio track');
else {
  if (!REEL.audioCodecs.includes(a.codec_name)) reencode.push(`audio codec ${a.codec_name} (Reels take AAC)`);
  if (Number(a.sample_rate) > REEL.maxAudioHz) reencode.push(`audio ${Number(a.sample_rate) / 1000} kHz (Reels cap 48)`);
  if (Number(a.channels) > 2) reencode.push(`${a.channels} audio channels (Reels take mono or stereo)`);
}
if (seconds < REEL.minSeconds || seconds > REEL.maxSeconds) {
  problems.push(`the video is ${seconds.toFixed(1)}s; Reels take ${REEL.minSeconds}s to ${REEL.maxSeconds / 60} minutes`);
}

let thumbOffsetMs;
if (THUMB !== null) {
  const t = Number(THUMB);
  if (!Number.isFinite(t) || t < 0 || t > seconds) problems.push(`--thumb must be between 0 and ${seconds.toFixed(1)} seconds`);
  else thumbOffsetMs = Math.round(t * 1000);
}

// ---------------------------------------------------------------------------
// Caption and slot
// ---------------------------------------------------------------------------

const cap = parseCaption(fs.readFileSync(CAPTION, 'utf8'));
if (!cap.ok) problems.push(...cap.errors);
warnings.push(...cap.warnings);

const slotResult = buildSlots({ date: DATE, start: AT, count: 1, timeZone: TZ });
if (!slotResult.ok) die(`Cannot build the slot:\n    ${slotResult.errors.join('\n    ')}`);
const slot = slotResult.slots[0];
if (slot.getTime() <= Date.now()) problems.push(`${formatInZone(slot, TZ)} is already in the past`);

// "reel-" keeps a video from colliding with the carousel of the same number in the
// one-pending-per-slug index, which would refuse it with a misleading "already queued".
const slug = (flag('slug') || `reel-${path.basename(FILE, ext)}`)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);
if (!slug) problems.push('could not derive a slug from the file name; pass --slug');

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(FILE)).digest('hex');

// ---------------------------------------------------------------------------
// Already queued or posted?
// ---------------------------------------------------------------------------

let supabase = null;
if (env('NEXT_PUBLIC_SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY')) {
  supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: prior, error } = await supabase
    .from('social_posts')
    .select('slug, status, scheduled_for, permalink')
    .contains('payload', { source_sha256: sha256 });
  if (error) die(`Could not check the queue for this video: ${safe(error.message)}`);
  const live = (prior ?? []).filter((r) => r.status !== 'failed' && r.status !== 'expired');
  if (live.length && !has('allow-republish')) {
    for (const r of live) {
      problems.push(
        `this exact video is already ${r.status} as "${r.slug}" for ${formatInZone(new Date(r.scheduled_for), TZ)}` +
          `${r.permalink ? ` (${r.permalink})` : ''}. Posting it twice limits its reach.`
      );
    }
  }
} else if (DO_QUEUE) {
  die('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to queue');
} else {
  warnings.push('no database credentials, so the already-posted check was skipped in this dry run');
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
console.log('  CRWN video queue (Instagram Reel)');
console.log('  ' + '='.repeat(70));
console.log(`  mode        ${DO_QUEUE ? 'QUEUE (uploads to R2 and writes the database)' : 'DRY RUN (writes nothing)'}`);
console.log(`  file        ${FILE}`);
console.log(`  slug        ${slug}`);
console.log(`  video       ${v ? `${v.width}x${v.height} ${v.codec_name} ${fps.toFixed(2)}fps` : 'none'}, ${seconds.toFixed(1)}s, ${(bytes / 1048576).toFixed(1)}MB, audio ${a ? a.codec_name : 'none'}`);
console.log(`  caption     ${cap.caption.length} chars`);
console.log(`  cover       ${thumbOffsetMs === undefined ? 'Instagram default' : `${thumbOffsetMs / 1000}s`}`);
console.log(`  re-encode   ${reencode.length ? `yes: ${reencode.join('; ')}` : 'no, already within the Reels spec'}`);
console.log(`  slot        ${formatInZone(slot, TZ)}`);
console.log('');
for (const w of warnings) console.log(`  warning: ${w}`);
if (warnings.length) console.log('');

if (problems.length) {
  console.error('  CANNOT QUEUE');
  for (const p of problems) console.error(`    - ${p}`);
  console.error('');
  process.exit(1);
}

if (!DO_QUEUE) {
  console.log('  DRY RUN COMPLETE. Nothing was uploaded or written. Re-run with --queue to schedule it.');
  console.log('');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Upload and insert
// ---------------------------------------------------------------------------

for (const k of ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']) {
  if (!env(k)) die(`${k} is missing from .env.local`);
}
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
});

// The upload is the original when it is already in spec, otherwise a compliant copy. The duplicate
// check above hashed the ORIGINAL, so the same source can never be queued twice either way.
let uploadPath = FILE;
let uploadExt = ext;
let tmpDir = null;
if (reencode.length) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crwn-reel-'));
  uploadPath = path.join(tmpDir, 'video.mp4');
  uploadExt = '.mp4';
  console.log('  re-encoding for the Reels spec...');
  execFileSync(
    'ffmpeg',
    [
      '-v', 'error', '-y', '-i', FILE,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
      '-maxrate', '20M', '-bufsize', '40M',
      '-vf', `scale='min(${REEL.targetWidth},iw)':-2`,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart',
      uploadPath,
    ],
    { stdio: 'inherit' }
  );
  // Verify the copy rather than trust the flags.
  const out = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', uploadPath], { encoding: 'utf8' })
  );
  const ov = out.streams.find((s) => s.codec_type === 'video');
  const oa = out.streams.find((s) => s.codec_type === 'audio');
  const obr = Number(ov?.bit_rate || out.format?.bit_rate || 0);
  const odur = Number(out.format?.duration ?? 0);
  const bad = [];
  if (!ov || ov.codec_name !== 'h264' || ov.pix_fmt !== 'yuv420p') bad.push('video stream');
  if (obr > REEL.maxVideoBitrate) bad.push(`bitrate ${(obr / 1e6).toFixed(1)} Mbps`);
  if (a && (!oa || Number(oa.sample_rate) > REEL.maxAudioHz)) bad.push('audio stream');
  if (Math.abs(odur - seconds) > 0.5) bad.push(`duration ${odur.toFixed(1)}s vs ${seconds.toFixed(1)}s`);
  if (fs.statSync(uploadPath).size > REEL.maxBytes) bad.push('file size');
  if (bad.length) die(`the re-encoded copy is still out of spec (${bad.join(', ')}); nothing was uploaded`);
  console.log(`  re-encoded  ${ov.width}x${ov.height}, ${(obr / 1e6).toFixed(1)} Mbps, ${(fs.statSync(uploadPath).size / 1048576).toFixed(1)}MB`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const key = `social/${slug}/${stamp}/video${uploadExt}`;
await r2.send(
  new PutObjectCommand({
    Bucket: env('R2_BUCKET_NAME'),
    Key: key,
    Body: fs.readFileSync(uploadPath),
    ContentType: uploadExt === '.mov' ? 'video/quicktime' : 'video/mp4',
  })
);
if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`  uploaded    ${key}`);

const payload = { source_sha256: sha256, source_file: path.basename(FILE), duration_seconds: Math.round(seconds * 10) / 10 };
if (thumbOffsetMs !== undefined) payload.thumb_offset_ms = thumbOffsetMs;

const { data: post, error } = await supabase
  .from('social_posts')
  .insert({
    slug,
    platform: 'instagram',
    kind: 'video_short',
    caption: cap.caption,
    media_keys: [key],
    payload,
    scheduled_for: slot.toISOString(),
    status: 'queued',
  })
  .select('id')
  .single();
if (error) {
  if (error.code === '23505') die(`"${slug}" is already queued (nothing was double-booked)`);
  die(`insert failed: ${safe(error.message)}`);
}

const { error: tErr } = await supabase
  .from('social_post_targets')
  .insert({ post_id: post.id, platform: 'instagram', caption: cap.caption, payload: {}, status: 'queued' });
if (tErr) {
  // Leave no orphan: a post with no target would sit in the queue forever.
  await supabase.from('social_posts').delete().eq('id', post.id);
  die(`target insert failed: ${safe(tErr.message)}`);
}

console.log(`  queued      post ${post.id} for ${formatInZone(slot, TZ)}`);
console.log('');
console.log('  The cron ticks will publish it. Nothing else needs to run on this machine.');
console.log('');
