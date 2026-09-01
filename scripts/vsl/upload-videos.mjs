// Uploads the finished VSL cuts to a PUBLIC R2 bucket and prints the URLs to paste into
// src/lib/vsl/catalog.ts.
//
//   node scripts/vsl/upload-videos.mjs            # dry run: shows exactly what it would do
//   node scripts/vsl/upload-videos.mjs --go       # actually uploads
//
// It refuses to touch R2_BUCKET_NAME. That bucket holds artist audio served through short-lived
// signed URLs, and the only way to serve a video out of it publicly is to turn on public access for
// the whole bucket, which would expose every private track in the catalogue in one click. So this
// script requires a SEPARATE bucket named in R2_PUBLIC_BUCKET, and stops if it is not set or if it
// matches the private one.
//
// No transcode step, deliberately: the exports are already 1080p H.264 at 1.6 to 2.2 Mbps with the
// moov atom at the front, so a browser streams them progressively as they are. Re-encoding would
// cost quality for nothing. If a future export is NOT faststart, this refuses it rather than
// uploading a file that makes a lead wait for a whole download before the first frame.
import fs from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const GO = process.argv.includes("--go");
const SRC = path.join("videos", "output");

// Josh's export names, mapped to the catalog slugs. The calculator VSL is included because it needs
// the same hosting, even though it is not part of the four-video nurture series.
const FILES = [
  { file: "VSL - 2 - How Much Is 1 Fan Worth.mp4", slug: "vsl-1-fan-worth" },
  { file: "VSL - 3 - What Would Your Fans Pay For.mp4", slug: "vsl-2-what-fans-pay-for" },
  { file: "VSL - 4 - 100 Fans.mp4", slug: "vsl-3-first-100-fans" },
  { file: "VSL - 5 - If Nobody Pays.mp4", slug: "vsl-4-if-nobody-buys" },
  { file: "VSL - 1 - Calculator.mp4", slug: "vsl-calculator" },
];

const PRIVATE_BUCKET = process.env.R2_BUCKET_NAME || "crwn-media";
const BUCKET = process.env.R2_PUBLIC_BUCKET || "";
const PUBLIC_BASE = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "";

function fail(msg) {
  console.error("REFUSED: " + msg);
  process.exit(1);
}

if (GO) {
  if (!BUCKET) fail("R2_PUBLIC_BUCKET is not set. Create a public bucket first; see TODO.md.");
  if (BUCKET === PRIVATE_BUCKET)
    fail(
      `R2_PUBLIC_BUCKET is the private audio bucket (${PRIVATE_BUCKET}). Serving a video from it ` +
        `means making that whole bucket public, which exposes every artist's tracks. Use a separate bucket.`,
    );
  if (!PUBLIC_BASE) fail("R2_PUBLIC_BASE_URL is not set, so the printed URLs would be guesses.");
  if (!ACCOUNT) fail("CLOUDFLARE_ACCOUNT_ID is not set, so there is no endpoint to upload to.");
}

/** The moov atom must sit near the front or the browser downloads the whole file before playing. */
function isFaststart(file) {
  const head = Buffer.alloc(200_000);
  const fd = fs.openSync(file, "r");
  const read = fs.readSync(fd, head, 0, head.length, 0);
  fs.closeSync(fd);
  return head.subarray(0, read).includes(Buffer.from("moov"));
}

const client = ACCOUNT
  ? new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    })
  : null;

const done = [];
for (const { file, slug } of FILES) {
  const src = path.join(SRC, file);
  if (!fs.existsSync(src)) {
    console.log(`SKIP  ${slug}: ${src} not found`);
    continue;
  }
  const mb = (fs.statSync(src).size / 1024 / 1024).toFixed(0);
  if (!isFaststart(src)) fail(`${file} is not faststart. Re-export with the moov atom at the front.`);

  const key = `vsl/${slug}.mp4`;
  const url = `${PUBLIC_BASE || "<R2_PUBLIC_BASE_URL>"}/${key}`;
  if (!GO) {
    console.log(`would upload  ${mb.padStart(4)} MB  ${file}\n           -> ${key}`);
    done.push({ slug, url });
    continue;
  }
  process.stdout.write(`uploading ${mb} MB  ${key} ... `);
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fs.createReadStream(src),
      ContentLength: fs.statSync(src).size,
      ContentType: "video/mp4",
      // A year. These are versioned by filename, so a long cache is safe and keeps repeat views free.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  console.log("done");
  done.push({ slug, url });
}

console.log("\nPaste into src/lib/vsl/catalog.ts:\n");
for (const { slug, url } of done) console.log(`  ${slug}:  url: '${url}',`);
if (!GO) console.log("\n(dry run: nothing was uploaded. Re-run with --go)");
