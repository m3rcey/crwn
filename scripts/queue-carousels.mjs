// Queue generated carousels for scheduled publishing.
//
// This is the HANDOFF. The generated slides live in Dropbox on this machine and a Vercel cron
// cannot see that filesystem, so this command transforms them, uploads them to R2, and writes one
// social_posts row per post. After it runs, the laptop can be closed and the schedule still runs.
//
// USAGE
//   Dry run (default, writes nothing anywhere):
//     node scripts/queue-carousels.mjs --range 31-40 --date 2026-08-27 --start 09:00 --end 12:00
//
//   Several platforms at once (default is instagram only):
//     ... --platforms instagram,facebook,threads
//
//   Actually queue it:
//     node scripts/queue-carousels.mjs --range 31-40 --date 2026-08-27 --start 09:00 --end 12:00 --queue
//
//   Explicit slugs instead of a range, published in the order given:
//     node scripts/queue-carousels.mjs --slugs 34-ryan-leslie...,31-mach-hommy... --date ... --start ... --end ...
//
// TIMES ARE YOUR LOCAL WALL CLOCK (America/New_York by default, override with --tz). They are
// converted to absolute UTC instants once, here, against the real offset for that date, which is
// why daylight saving never shifts a scheduled post.
//
// SAFE BY DEFAULT. Without --queue nothing is transformed, uploaded or written. With --queue, a
// carousel that is already queued raises a unique violation and is reported rather than
// double-booked.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

import { discoverSlides, parseCaption, IG_LIMITS, TARGET_FRAME } from './lib/instagramCarousel.mjs';
import { buildSlots, formatInZone, DEFAULT_TIME_ZONE } from './lib/schedule.mjs';

// Which platforms this batch goes to. Mirrors src/lib/social/capabilities.ts for the two
// facts the ingest needs before it can talk to the server: the caption ceiling (so a caption
// written for Instagram is never sent somewhere that will refuse it) and the image ceiling.
// The tick re-checks the full matrix, including audits, before publishing anything.
const PLATFORM_LIMITS = {
  instagram: { maxCaptionChars: 2200, maxImages: 10 },
  facebook:  { maxCaptionChars: 63206, maxImages: 10 },
  threads:   { maxCaptionChars: 500, maxImages: 20 },
  x:         { maxCaptionChars: 280, maxImages: 4 },
  tiktok:    { maxCaptionChars: 2200, maxImages: 35 },
};
const DEFAULT_PLATFORMS = ['instagram'];

const CAROUSEL_OUTPUT_BASE =
  process.env.CRWN_CAROUSEL_OUTPUT ||
  '/mnt/c/Users/Josh/Dropbox/nano banana output/Carousel Posts/Fan Economy';
const REPO_CAROUSELS = new URL('../videos/carousels/fan-economy/', import.meta.url);

// ---------------------------------------------------------------------------
// Arguments and environment
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const has = (name) => argv.includes(`--${name}`);

const DO_QUEUE = has('queue');
const TZ = flag('tz') || DEFAULT_TIME_ZONE;
const DATE = flag('date');
const START = flag('start');
const END = flag('end');
const RANGE = flag('range');
const SLUGS = flag('slugs');
const PLATFORMS = (flag('platforms') || DEFAULT_PLATFORMS.join(','))
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean);
{
  const unknown = PLATFORMS.filter((p) => !PLATFORM_LIMITS[p]);
  if (unknown.length) die(`Unknown platform(s): ${unknown.join(', ')}. Known: ${Object.keys(PLATFORM_LIMITS).join(', ')}`);
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
  let s = typeof v === 'string' ? v : String(v);
  for (const x of SECRETS) if (x && x.length >= 8) s = s.split(x).join('[REDACTED]');
  return s;
};
for (const stream of ['log', 'warn', 'error']) {
  const original = console[stream].bind(console);
  console[stream] = (...args) => original(...args.map((a) => (typeof a === 'string' ? safe(a) : a)));
}

function die(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

if (!DATE || !START) {
  die(
    'Usage: node scripts/queue-carousels.mjs --range 31-40 --date 2026-08-27 --start 09:00 --end 12:00 [--queue]'
  );
}

// ---------------------------------------------------------------------------
// Which carousels, in which order
// ---------------------------------------------------------------------------

const allSlugs = fs
  .readdirSync(CAROUSEL_OUTPUT_BASE, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

const numberOf = (slug) => {
  const m = /^(\d+)-/.exec(slug);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

let slugs = [];
if (SLUGS) {
  slugs = SLUGS.split(',').map((s) => s.trim()).filter(Boolean);
  const missing = slugs.filter((s) => !allSlugs.includes(s));
  if (missing.length) die(`These carousels do not exist:\n    ${missing.join('\n    ')}`);
} else if (RANGE) {
  const m = /^(\d+)-(\d+)$/.exec(RANGE.trim());
  if (!m) die(`--range must look like 31-40, got "${RANGE}"`);
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  slugs = allSlugs
    .filter((s) => numberOf(s) >= lo && numberOf(s) <= hi)
    .sort((a, b) => numberOf(a) - numberOf(b));
  if (!slugs.length) die(`No carousels found numbered ${lo} to ${hi}.`);
} else {
  die('Give either --range 31-40 or --slugs a,b,c');
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

const slotResult = buildSlots({
  date: DATE,
  start: START,
  end: END ?? undefined,
  count: slugs.length,
  timeZone: TZ,
});
if (!slotResult.ok) die(`Cannot build the schedule:\n    ${slotResult.errors.join('\n    ')}`);

const now = Date.now();
const pastSlots = slotResult.slots.filter((s) => s.getTime() <= now);

console.log('');
console.log('  CRWN carousel queue');
console.log('  ' + '='.repeat(70));
console.log(`  mode        ${DO_QUEUE ? 'QUEUE (writes to R2 and the database)' : 'DRY RUN (writes nothing)'}`);
console.log(`  posts       ${slugs.length}`);
console.log(`  platforms   ${PLATFORMS.join(', ')}`);
console.log(`  window      ${START}${END ? ` to ${END}` : ''} on ${DATE} (${TZ})`);
console.log(`  spacing     ${slotResult.spacingMinutes === null ? 'n/a' : slotResult.spacingMinutes + ' minutes'}`);
console.log('');

// ---------------------------------------------------------------------------
// Validate every carousel BEFORE uploading anything
// ---------------------------------------------------------------------------

function repoCaptionFor(slug) {
  const p = new URL(`${slug}.md`, REPO_CAROUSELS);
  if (!fs.existsSync(p)) return null;
  const md = fs.readFileSync(p, 'utf8');
  const i = md.indexOf('**CAPTION:**');
  if (i < 0) return null;
  const rest = md.slice(i + '**CAPTION:**'.length);
  const end = rest.indexOf('---');
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

const plan = [];
const problems = [];

for (let i = 0; i < slugs.length; i++) {
  const slug = slugs[i];
  const dir = path.join(CAROUSEL_OUTPUT_BASE, slug);
  const files = fs.readdirSync(dir);

  const slides = discoverSlides(files);
  if (!slides.ok) problems.push(`${slug}: ${slides.errors.join('; ')}`);

  const capPath = path.join(dir, 'caption.md');
  if (!fs.existsSync(capPath)) {
    problems.push(`${slug}: caption.md is missing`);
    continue;
  }
  const cap = parseCaption(fs.readFileSync(capPath, 'utf8'));
  if (!cap.ok) problems.push(`${slug}: ${cap.errors.join('; ')}`);

  // caption.md is a DERIVED copy; the repo markdown is the truth. Trimming a caption in the repo
  // without re-running the generator leaves a stale copy here that publishes the OLD words. That
  // is not hypothetical: nine captions were trimmed under the limit and all nine derived copies
  // stayed over it.
  const repoCap = repoCaptionFor(slug);
  if (repoCap && repoCap !== cap.caption) {
    problems.push(
      `${slug}: caption.md is STALE (source ${repoCap.length} chars, copy ${cap.caption.length}). ` +
        `Re-run: node generate-fan-economy-carousel.mjs`
    );
  }

  if (slides.slides.length < IG_LIMITS.minCarouselItems || slides.slides.length > IG_LIMITS.maxCarouselItems) {
    problems.push(`${slug}: a carousel needs 2 to 10 slides, found ${slides.slides.length}`);
  }

  // A carousel published by the manual Phase 0 script leaves a receipt beside its slides. The
  // database's one-pending-per-slug index cannot see that, because the manual publish never
  // created a row. Without this check, a range that happens to include an already-posted carousel
  // queues a duplicate of a live post, and nobody finds out until it appears on the account.
  const receipt = path.join(dir, '.crwn-published.json');
  if (fs.existsSync(receipt) && !has('allow-republish')) {
    let when = 'previously';
    let link = '';
    try {
      const r = JSON.parse(fs.readFileSync(receipt, 'utf8'));
      when = r.published_at ?? when;
      link = r.permalink ? ` (${r.permalink})` : '';
    } catch {
      /* an unreadable receipt is still a receipt */
    }
    problems.push(
      `${slug}: ALREADY PUBLISHED ${when}${link}. Queueing it again posts a duplicate. ` +
        `Exclude it, or pass --allow-republish if you genuinely want a second post.`
    );
  }

  // ONE CAPTION PER PLATFORM. Threads caps a post at 500 characters and X at 280, so the
  // Instagram caption cannot simply be reposted there. Convention: an optional
  // caption.<platform>.md beside caption.md wins for that platform; otherwise caption.md is used
  // IF it fits, and the platform is refused here (before any upload) if it does not.
  const captions = {};
  for (const platform of PLATFORMS) {
    const override = path.join(dir, `caption.${platform}.md`);
    const text = fs.existsSync(override) ? parseCaption(fs.readFileSync(override, 'utf8')).caption : cap.caption;
    const limit = PLATFORM_LIMITS[platform];
    if (text.length > limit.maxCaptionChars) {
      problems.push(
        `${slug}: caption is ${text.length} chars but ${platform} allows ${limit.maxCaptionChars}. ` +
          `Write a shorter one as caption.${platform}.md in the folder.`
      );
    }
    if (slides.slides.length > limit.maxImages) {
      problems.push(`${slug}: ${slides.slides.length} slides but ${platform} allows at most ${limit.maxImages}.`);
    }
    captions[platform] = text;
  }

  plan.push({ slug, dir, slides: slides.slides, caption: cap.caption, captions, slot: slotResult.slots[i] });
}

console.log('  SCHEDULE');
for (const p of plan) {
  console.log(
    `    ${formatInZone(p.slot, TZ).padEnd(30)} ${p.slug.padEnd(50)} ${p.slides.length} slides, ${p.caption.length} chars`
  );
}
console.log('');

if (pastSlots.length) {
  problems.push(
    `${pastSlots.length} of these slots are already in the past. Pick a later date or start time.`
  );
}

if (problems.length) {
  console.error('  CANNOT QUEUE');
  for (const p of problems) console.error(`    - ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`  All ${plan.length} carousels validated.`);
console.log('');

if (!DO_QUEUE) {
  console.log('  DRY RUN COMPLETE. Nothing was transformed, uploaded or written.');
  console.log('  Re-run with --queue to schedule these.');
  console.log('');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Transform, upload, insert
// ---------------------------------------------------------------------------

for (const k of ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
  'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env(k)) die(`${k} is missing from .env.local`);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
});
const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crwn-queue-'));
let queued = 0;
const failures = [];

for (const p of plan) {
  console.log(`  ${p.slug}`);
  try {
    const keys = [];
    for (const file of p.slides) {
      const out = path.join(tmpDir, `${p.slug}-${file}`);
      // "contain" into a 4:5 frame with white padding. The sheets are 3:4, which Instagram
      // REJECTS outright, and they are white paper with margins, so padding is invisible and
      // nothing is clipped. Cropping instead would cut the hand-lettering.
      await sharp(path.join(p.dir, file))
        .resize(TARGET_FRAME.width, TARGET_FRAME.height, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .toColorspace('srgb')
        .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
        .toFile(out);

      const buf = fs.readFileSync(out);
      if (buf.length > IG_LIMITS.maxFileBytes) {
        throw new Error(`${file} is ${(buf.length / 1048576).toFixed(2)}MB after transform, over 8MB`);
      }
      const key = `social/${p.slug}/${stamp}/${file}`;
      await r2.send(
        new PutObjectCommand({ Bucket: env('R2_BUCKET_NAME'), Key: key, Body: buf, ContentType: 'image/jpeg' })
      );
      keys.push(key);
    }

    // The post is the content; each platform gets its own target row with its own caption.
    // The post's legacy `platform` and `caption` columns carry the first platform so a reader of
    // social_posts alone still sees something true.
    const { data: post, error } = await supabase
      .from('social_posts')
      .insert({
        slug: p.slug,
        platform: PLATFORMS[0],
        kind: 'carousel',
        caption: p.captions[PLATFORMS[0]],
        media_keys: keys,
        payload: {},
        scheduled_for: p.slot.toISOString(),
        status: 'queued',
      })
      .select('id')
      .single();

    if (error) {
      // 23505 is the one-pending-per-slug index doing its job.
      if (error.code === '23505') {
        failures.push(`${p.slug}: already queued (nothing was double-booked)`);
        console.log('    already queued, skipped');
        continue;
      }
      throw new Error(error.message);
    }

    const targets = PLATFORMS.map((platform) => ({
      post_id: post.id,
      platform,
      caption: p.captions[platform],
      payload: {},
      status: 'queued',
    }));
    const { error: tErr } = await supabase.from('social_post_targets').insert(targets);
    if (tErr) {
      // Leave no orphan: a post with no targets would sit in the queue forever.
      await supabase.from('social_posts').delete().eq('id', post.id);
      throw new Error(`targets: ${tErr.message}`);
    }

    queued++;
    console.log(`    ${keys.length} slides uploaded, ${targets.length} target(s) queued for ${formatInZone(p.slot, TZ)}`);
  } catch (err) {
    failures.push(`${p.slug}: ${safe(err.message)}`);
    console.error(`    FAILED: ${safe(err.message)}`);
  }
}

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('');
console.log('  ' + '='.repeat(70));
console.log(`  queued  ${queued} of ${plan.length}`);
if (failures.length) {
  console.log(`  issues  ${failures.length}`);
  for (const f of failures) console.log(`    - ${f}`);
}
console.log('');
console.log('  The cron ticks will publish these. Nothing else needs to run on this machine.');
console.log('');
process.exitCode = failures.length ? 1 : 0;
