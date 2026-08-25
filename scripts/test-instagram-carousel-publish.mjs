// PHASE 0 PROOF: publish ONE existing CRWN carousel to Instagram, programmatically.
//
// This script is deliberately disposable. It exists to answer one question with evidence
// rather than documentation: can CRWN take a folder the content generator already produced
// and turn it into a real Instagram carousel, with the right slides in the right order and
// the right caption? It is NOT the publishing system. There is no queue, no database, no
// scheduling, no retry loop and no UI here, on purpose.
//
// USAGE
//   Dry run (default, makes NO external publishing call):
//     node scripts/test-instagram-carousel-publish.mjs "<folder>"
//
//   Real publish (requires the explicit flag):
//     node scripts/test-instagram-carousel-publish.mjs "<folder>" --publish
//
//   Example folder:
//     "C:/Users/Josh/Dropbox/nano banana output/Carousel Posts/Fan Economy/41-wu-tang-one-copy"
//     (from WSL: "/mnt/c/Users/Josh/Dropbox/nano banana output/Carousel Posts/Fan Economy/41-wu-tang-one-copy")
//
// FLAGS
//   --publish     actually publish. Without it nothing leaves this machine except a HEAD
//                 request against our own R2 URL during --check-upload.
//   --force       publish even though a receipt says this folder was already published.
//   --check-upload  during a dry run, still do the image transform and the R2 upload so the
//                 Meta-fetchable URL can be verified, but stop before any Graph API call.
//   --keep-temp   leave the transformed JPEGs on disk for inspection.
//
// REQUIRED ENVIRONMENT (read from .env.local, overridable by real env vars)
//   IG_USER_ID            the Instagram professional account's IG User ID
//   IG_ACCESS_TOKEN       access token with instagram_basic + instagram_content_publish
//   CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME  (already present)
// OPTIONAL
//   GRAPH_API_VERSION     defaults to v26.0
//
// WHY R2 PRESIGNED URLS RATHER THAN A PUBLIC BUCKET
//   Meta cURLs the image at container-creation time, so it needs an externally fetchable
//   HTTPS URL. NEXT_PUBLIC_R2_PUBLIC_URL is NOT set in this repo's .env.local, and the audio
//   bucket was deliberately made private after a paid master returned 200 to a bare curl.
//   Rather than open any bucket, this uses a short-lived presigned GET, which is the pattern
//   already used by /api/live/watch, /api/live/vod and /api/producer/submissions/file. It
//   needs no bucket policy change and is fully reversible: the objects expire from relevance
//   the moment the post exists. Phase 1 should revisit whether a dedicated public prefix is
//   worth it, but nothing here requires one.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  IG_LIMITS,
  TARGET_FRAME,
  validateFolder,
  planImageTransform,
  classifyGraphError,
  interpretContainerStatus,
  redact,
} from './lib/instagramCarousel.mjs';

// ---------------------------------------------------------------------------
// Arguments and environment
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const positional = argv.filter((a) => !a.startsWith('--'));
const folderArg = positional[0];

const DO_PUBLISH = flags.has('--publish');
const FORCE = flags.has('--force');
const CHECK_UPLOAD = flags.has('--check-upload') || DO_PUBLISH;
const KEEP_TEMP = flags.has('--keep-temp');

if (!folderArg) {
  console.error('Usage: node scripts/test-instagram-carousel-publish.mjs "<carousel folder>" [--publish]');
  process.exit(2);
}

function loadEnvLocal() {
  const out = {};
  try {
    const p = new URL('../.env.local', import.meta.url);
    const raw = fs.readFileSync(p, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // .env.local is optional if real env vars are set.
  }
  return out;
}

const fileEnv = loadEnvLocal();
const env = (k) => process.env[k] ?? fileEnv[k] ?? '';

const IG_USER_ID = env('IG_USER_ID');
const IG_ACCESS_TOKEN = env('IG_ACCESS_TOKEN');
const GRAPH_VERSION = env('GRAPH_API_VERSION') || 'v26.0';

// There are TWO Instagram publishing paths and they live on DIFFERENT hosts. Getting this
// wrong produces an auth error that reads exactly like a bad token, so it is worth naming:
//   Instagram API with Facebook Login    -> graph.facebook.com   (IG account linked to a Page;
//                                           the IG User ID comes from `instagram_business_account`)
//   Instagram API with Instagram Login   -> graph.instagram.com  (no Facebook Page needed)
// Set GRAPH_HOST=graph.instagram.com in .env.local if the token came from the Instagram Login
// flow. Everything else about the request shape is the same.
const GRAPH_HOST = (env('GRAPH_HOST') || 'graph.facebook.com').replace(/^https?:\/\//, '');
const GRAPH = `https://${GRAPH_HOST}/${GRAPH_VERSION}`;

const R2_ACCOUNT = env('CLOUDFLARE_ACCOUNT_ID');
const R2_KEY = env('R2_ACCESS_KEY_ID');
const R2_SECRET = env('R2_SECRET_ACCESS_KEY');
const R2_BUCKET = env('R2_BUCKET_NAME');

// Every string that must never reach the terminal.
const SECRETS = [IG_ACCESS_TOKEN, R2_SECRET, R2_KEY].filter(Boolean);
const safe = (v) => redact(v, SECRETS);

// A single guard so a mistake in this file cannot print a credential.
for (const stream of ['log', 'warn', 'error']) {
  const original = console[stream].bind(console);
  console[stream] = (...args) => original(...args.map((a) => (typeof a === 'string' ? safe(a) : a)));
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

const folder = path.resolve(folderArg);
const slug = path.basename(folder);
const RECEIPT = path.join(folder, '.crwn-published.json');

console.log('');
console.log('  CRWN Phase 0: Instagram carousel publish proof');
console.log('  ' + '='.repeat(58));
console.log(`  mode           ${DO_PUBLISH ? 'PUBLISH (real post)' : 'DRY RUN (no post)'}`);
console.log(`  folder         ${folder}`);
console.log(`  slug           ${slug}`);
console.log(`  graph host     ${GRAPH_HOST}`);
console.log(`  graph version  ${GRAPH_VERSION}`);
console.log('');

if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error(`  FAIL: not a directory: ${folder}`);
  process.exit(1);
}

const files = fs.readdirSync(folder);
const captionRaw = files.includes('caption.md')
  ? fs.readFileSync(path.join(folder, 'caption.md'), 'utf8')
  : '';

// Measure every slide before validating, so the transform plan is real rather than assumed.
const slidePreview = [];
for (const f of files.filter((f) => /^slide-\d+\.jpe?g$/i.test(f)).sort()) {
  const full = path.join(folder, f);
  const meta = await sharp(full).metadata();
  slidePreview.push({
    file: f,
    width: meta.width,
    height: meta.height,
    bytes: fs.statSync(full).size,
    format: meta.format,
  });
}

const result = validateFolder({ folder, files, captionRaw, images: slidePreview });

console.log('  SLIDE ORDER (this is the order they will appear in the post)');
if (result.slides.length === 0) {
  console.log('    none found');
} else {
  result.slides.forEach((s, i) => {
    const m = slidePreview.find((p) => p.file === s);
    const t = planImageTransform(m);
    console.log(
      `    ${String(i + 1).padStart(2)}. ${s.padEnd(14)} ${m.width}x${m.height}` +
        `  aspect ${(m.width / m.height).toFixed(4)}` +
        `  ${(m.bytes / 1048576).toFixed(2)}MB` +
        `  ${t.needsTransform ? '-> transform required' : '-> accepted as is'}`
    );
  });
}
console.log('');

console.log('  IMAGE TRANSFORM PLAN');
const anyTransform = result.transforms.some((t) => t.needsTransform);
if (!anyTransform) {
  console.log('    none needed; every slide already satisfies Instagram\'s limits');
} else {
  const first = result.transforms.find((t) => t.needsTransform);
  for (const r of first.reasons) console.log(`    reason: ${r}`);
  const p = first.plan;
  console.log(
    `    ${p.sourceWidth}x${p.sourceHeight} (aspect ${p.sourceAspect})` +
      ` -> contain into ${p.targetWidth}x${p.targetHeight} (aspect ${p.targetAspect})`
  );
  console.log(
    `    scaled artwork ${p.innerWidth}x${p.innerHeight}, padded ${p.padLeftRight}px left and right` +
      ` with ${p.background}`
  );
  console.log('    padding, not cropping: the sheets are white paper with margins, so nothing is clipped');
}
console.log('');

console.log('  CAPTION');
console.log(`    ${result.caption.length} characters (limit ${IG_LIMITS.maxCaptionChars})`);
const firstLine = result.caption.split('\n').find((l) => l.trim()) ?? '';
console.log(`    first line: ${firstLine.slice(0, 100)}${firstLine.length > 100 ? '...' : ''}`);
const lastLine = result.caption.split('\n').filter((l) => l.trim()).pop() ?? '';
console.log(`    last line:  ${lastLine.slice(0, 100)}${lastLine.length > 100 ? '...' : ''}`);
console.log('');

console.log('  CREDENTIALS');
const credProblems = [];
if (!IG_USER_ID) credProblems.push('IG_USER_ID is not set');
if (!IG_ACCESS_TOKEN) credProblems.push('IG_ACCESS_TOKEN is not set');
if (!R2_ACCOUNT || !R2_KEY || !R2_SECRET || !R2_BUCKET) credProblems.push('R2 credentials are incomplete');
console.log(`    IG_USER_ID       ${IG_USER_ID ? IG_USER_ID : 'MISSING'}`);
console.log(`    IG_ACCESS_TOKEN  ${IG_ACCESS_TOKEN ? `present (${IG_ACCESS_TOKEN.length} chars, never printed)` : 'MISSING'}`);
console.log(`    R2               ${R2_BUCKET ? `bucket ${R2_BUCKET}` : 'MISSING'}`);
console.log('');

if (result.warnings.length) {
  console.log('  WARNINGS');
  for (const w of result.warnings) console.log(`    - ${w}`);
  console.log('');
}

if (!result.ok) {
  console.error('  PREFLIGHT FAILED');
  for (const e of result.errors) console.error(`    - ${e}`);
  process.exit(1);
}

// Cross-run duplicate protection. Not a database, just a receipt beside the assets.
if (fs.existsSync(RECEIPT) && !FORCE) {
  try {
    const prior = JSON.parse(fs.readFileSync(RECEIPT, 'utf8'));
    if (prior.ig_user_id === IG_USER_ID && prior.media_id) {
      console.error('  ALREADY PUBLISHED');
      console.error(`    media id    ${prior.media_id}`);
      console.error(`    published   ${prior.published_at}`);
      console.error(`    permalink   ${prior.permalink ?? 'unknown'}`);
      console.error('    Pass --force only if you genuinely intend a second, duplicate post.');
      process.exit(1);
    }
  } catch {
    console.log('  (a receipt file exists but could not be read; continuing)');
  }
}

console.log(`  PREFLIGHT OK: ${result.slides.length} slides, order verified, caption within limits.`);
console.log('');

// If credentials are present, prove them with read-only GETs. This is still a dry run: a GET
// creates nothing and publishes nothing. It is here because an invalid token, the wrong host,
// or the wrong IG User ID otherwise surfaces halfway through a real publish, after containers
// already exist on Meta's side.
if (IG_USER_ID && IG_ACCESS_TOKEN) {
  console.log('  CREDENTIAL CHECK (read-only)');
  try {
    const me = await graph('GET', IG_USER_ID, { fields: 'id,username' });
    console.log(`    account          @${me.username ?? 'unknown'} (id ${me.id})`);
    const limit = await graph('GET', `${IG_USER_ID}/content_publishing_limit`, {
      fields: 'config,quota_usage',
    });
    const usage = limit?.data?.[0]?.quota_usage ?? 0;
    const quota = limit?.data?.[0]?.config?.quota_total ?? 100;
    console.log(`    publishing quota ${usage}/${quota} used in the last 24h`);
    console.log('    token is valid and can reach the publishing endpoints.');
  } catch (e) {
    console.error(`    FAILED: ${safe(e.message)}`);
    if (e.classification?.kind === 'auth') {
      console.error('    That is an auth failure. The usual causes, in order:');
      console.error(`      - GRAPH_HOST is wrong. It is currently ${GRAPH_HOST}.`);
      console.error('        Use graph.instagram.com if the token came from Instagram Login,');
      console.error('        or graph.facebook.com if it came from Facebook Login.');
      console.error('      - the token expired (short-lived tokens last about 1 hour)');
      console.error('      - the token is missing instagram_basic or instagram_content_publish');
      console.error('      - IG_USER_ID is the Facebook Page id or the @handle, not the IG User ID');
    }
    console.error('');
    process.exit(1);
  }
  console.log('');
}

if (!DO_PUBLISH && !CHECK_UPLOAD) {
  console.log('  DRY RUN COMPLETE. Nothing was uploaded and nothing was published.');
  console.log('  Re-run with --publish to make the real post.');
  console.log('');
  process.exit(0);
}

if (credProblems.length) {
  console.error('  CANNOT CONTINUE');
  for (const c of credProblems) console.error(`    - ${c}`);
  console.error('');
  console.error('  The implementation is ready; only founder-side credentials are missing.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Transform + upload
// ---------------------------------------------------------------------------

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
});

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crwn-ig-'));
const uploaded = [];

console.log('  TRANSFORM + UPLOAD');
for (let i = 0; i < result.slides.length; i++) {
  const file = result.slides[i];
  const src = path.join(folder, file);
  const out = path.join(tmpDir, file);

  // "contain" is the whole fix: fit the sheet inside a 4:5 frame and fill the rest white.
  await sharp(src)
    .resize(TARGET_FRAME.width, TARGET_FRAME.height, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .toColorspace('srgb')
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(out);

  const buf = fs.readFileSync(out);
  const meta = await sharp(out).metadata();
  if (buf.length > IG_LIMITS.maxFileBytes) {
    console.error(`  FAIL: ${file} is ${(buf.length / 1048576).toFixed(2)}MB after transform, over 8MB.`);
    process.exit(1);
  }

  const key = `social-preflight/${slug}/${stamp}/${file}`;
  await r2.send(
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: 'image/jpeg' })
  );
  const url = await getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), {
    expiresIn: 3600,
  });

  // Prove Meta will be able to fetch it, before asking Meta to try.
  const head = await fetch(url, { method: 'HEAD' });
  if (!head.ok) {
    console.error(`  FAIL: presigned URL for ${file} is not fetchable (HTTP ${head.status}).`);
    process.exit(1);
  }

  uploaded.push({ file, key, url });
  console.log(
    `    ${String(i + 1).padStart(2)}. ${file.padEnd(14)} ${meta.width}x${meta.height}` +
      `  ${(buf.length / 1048576).toFixed(2)}MB  uploaded, HEAD ${head.status}`
  );
}
console.log('');

if (!DO_PUBLISH) {
  console.log('  UPLOAD CHECK COMPLETE. Media is Meta-fetchable. No Graph API call was made.');
  if (!KEEP_TEMP) fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Graph API
// ---------------------------------------------------------------------------

async function graph(method, endpoint, params) {
  const url = `${GRAPH}/${endpoint}`;
  const body = new URLSearchParams({ ...params, access_token: IG_ACCESS_TOKEN });
  const res =
    method === 'GET'
      ? await fetch(`${url}?${body.toString()}`)
      : await fetch(url, { method: 'POST', body });

  let json;
  try {
    json = await res.json();
  } catch {
    json = { error: { message: `non-JSON response, HTTP ${res.status}` } };
  }
  if (!res.ok || json.error) {
    const c = classifyGraphError(res.status, json);
    const err = new Error(
      `Graph ${method} ${endpoint} failed [${c.kind}${c.retryable ? ', retryable' : ', permanent'}]: ` +
        `${c.message}${c.code ? ` (code ${c.code}${c.sub ? `/${c.sub}` : ''})` : ''}`
    );
    err.classification = c;
    throw err;
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForContainer(id, label) {
  for (let attempt = 1; attempt <= 30; attempt++) {
    const s = await graph('GET', id, { fields: 'status_code,status' });
    const state = interpretContainerStatus(s.status_code);
    if (state.done) {
      if (!state.ok) throw new Error(`${label} container ${id}: ${state.message} (${s.status ?? ''})`);
      return s;
    }
    await sleep(2000);
  }
  throw new Error(`${label} container ${id} never reached FINISHED after 60s.`);
}

try {
  // Courtesy check: do not start if this post would exceed the 24h publishing budget.
  const limit = await graph('GET', `${IG_USER_ID}/content_publishing_limit`, {
    fields: 'config,quota_usage',
  });
  const usage = limit?.data?.[0]?.quota_usage ?? 0;
  const quota = limit?.data?.[0]?.config?.quota_total ?? 100;
  console.log(`  PUBLISHING BUDGET  ${usage}/${quota} posts used in the last 24h`);
  if (usage >= quota) {
    console.error('  FAIL: publishing quota is exhausted. Try again later.');
    process.exit(1);
  }
  console.log('');

  console.log('  CREATING CHILD CONTAINERS');
  const children = [];
  for (let i = 0; i < uploaded.length; i++) {
    const u = uploaded[i];
    const r = await graph('POST', `${IG_USER_ID}/media`, {
      image_url: u.url,
      is_carousel_item: 'true',
    });
    children.push(r.id);
    console.log(`    ${String(i + 1).padStart(2)}. ${u.file.padEnd(14)} container ${r.id}`);
  }
  console.log('');

  console.log('  WAITING FOR CHILD CONTAINERS');
  for (let i = 0; i < children.length; i++) {
    await waitForContainer(children[i], `child ${i + 1}`);
    console.log(`    ${String(i + 1).padStart(2)}. ${children[i]} FINISHED`);
  }
  console.log('');

  console.log('  CREATING CAROUSEL CONTAINER');
  const carousel = await graph('POST', `${IG_USER_ID}/media`, {
    media_type: 'CAROUSEL',
    children: children.join(','),
    caption: result.caption,
  });
  console.log(`    carousel container ${carousel.id}`);
  await waitForContainer(carousel.id, 'carousel');
  console.log('    FINISHED');
  console.log('');

  console.log('  PUBLISHING');
  const published = await graph('POST', `${IG_USER_ID}/media_publish`, {
    creation_id: carousel.id,
  });
  const mediaId = published.id;
  console.log(`    published media id ${mediaId}`);

  let detail = {};
  try {
    detail = await graph('GET', mediaId, { fields: 'id,permalink,media_type,timestamp' });
  } catch (e) {
    console.log(`    (could not read back the media object: ${e.message})`);
  }
  console.log('');

  const receipt = {
    slug,
    ig_user_id: IG_USER_ID,
    media_id: mediaId,
    carousel_container_id: carousel.id,
    child_container_ids: children,
    permalink: detail.permalink ?? null,
    media_type: detail.media_type ?? null,
    slide_order: result.slides,
    graph_version: GRAPH_VERSION,
    published_at: detail.timestamp ?? new Date().toISOString(),
  };
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + '\n');

  console.log('  PUBLISHED');
  console.log('  ' + '='.repeat(58));
  console.log(`    media id     ${mediaId}`);
  console.log(`    permalink    ${detail.permalink ?? 'not returned'}`);
  console.log(`    media type   ${detail.media_type ?? 'not returned'}`);
  console.log(`    slides       ${result.slides.length} (${result.slides.join(', ')})`);
  console.log(`    receipt      ${RECEIPT}`);
  console.log('');
  console.log('  Open the permalink and confirm the slide order and caption by eye.');
  console.log('');
} catch (err) {
  console.error('');
  console.error('  PUBLISH FAILED');
  console.error(`    ${safe(err.message)}`);
  if (err.classification) {
    console.error(`    kind: ${err.classification.kind}, retryable: ${err.classification.retryable}`);
  }
  console.error('');
  console.error('  Containers may exist on Meta\'s side but nothing was published.');
  console.error('  Containers expire on their own after 24 hours.');
  process.exitCode = 1;
} finally {
  if (!KEEP_TEMP) fs.rmSync(tmpDir, { recursive: true, force: true });
  else console.log(`  transformed files kept at ${tmpDir}`);
}
