// Compile the Fan Economy sharpie sheets into one printable PDF.
//
// The sheets get PRINTED and filmed with a zoomed camera, so the one thing this
// must not do is resample or re-encode them. A JPEG embeds into a PDF as a
// DCTDecode image XObject with its bytes copied verbatim, so there is no encoder
// in the path at all and no library to trust. That is why this is hand-rolled
// rather than pulling in pdfkit.
//
// Usage:  node build-fan-economy-pdf.mjs [start] [end]
//         node build-fan-economy-pdf.mjs          -> every sheet
//         node build-fan-economy-pdf.mjs 1 9      -> sheets 1 to 9

import fs from "fs";
import path from "path";

const DIR = "/mnt/c/Users/Josh/Dropbox/nano banana output/Shortform Posts/Fan Economy";

// US Letter in PostScript points. The sheets are 3:4-ish and Letter is slightly
// wider, so fitting to full HEIGHT is what keeps the printed art as large as the
// paper allows. At 3584px across ~592pt that lands at ~436 DPI, which is the
// resolution the sheets were generated at.
const PAGE_W = 612;
const PAGE_H = 792;

const args = process.argv.slice(2).map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
const START = args.length ? args[0] : 1;
const END = args.length > 1 ? args[1] : args.length ? args[0] : Infinity;

const sheets = fs
  .readdirSync(DIR)
  .filter((f) => /^\d+-.*\.jpg$/i.test(f))
  .map((f) => ({ num: parseInt(f.match(/^(\d+)-/)[1], 10), file: f }))
  .filter((s) => s.num >= START && s.num <= END)
  .sort((a, b) => a.num - b.num); // publish-queue order, not readdir order

if (!sheets.length) {
  console.error(`No sheets found in range ${START}-${END}`);
  process.exit(1);
}

// Read the JPEG's SOF marker for dimensions and channel count. Guessing DeviceRGB
// on a greyscale JPEG produces a PDF that renders as garbage, so read it.
function jpegInfo(buf) {
  let i = 2; // skip SOI
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0-SOF15, excluding the non-frame markers DHT(c4), JPGA(c8), DAC(cc)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        bits: buf[i + 4],
        height: buf.readUInt16BE(i + 5),
        width: buf.readUInt16BE(i + 7),
        channels: buf[i + 9],
      };
    }
    const segLen = buf.readUInt16BE(i + 2);
    i += 2 + segLen;
  }
  throw new Error("no SOF marker: not a JPEG?");
}

const parts = [];
let length = 0;
const push = (b) => {
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, "binary");
  parts.push(buf);
  length += buf.length;
};

const offsets = [];
const obj = (num, body) => {
  offsets[num] = length;
  push(`${num} 0 obj\n`);
  push(body);
  push("\nendobj\n");
};

push("%PDF-1.4\n");
// A binary comment tells tools this file is binary and must not be line-ending mangled.
push(Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

// 1 = Catalog, 2 = Pages, then Page/Contents/Image per sheet.
const pageIds = sheets.map((_, i) => 3 + i * 3);
const totalObjs = 2 + sheets.length * 3;

obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
obj(
  2,
  `<< /Type /Pages /Count ${sheets.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`
);

const embedded = [];
sheets.forEach((sheet, i) => {
  const pageId = 3 + i * 3;
  const contentId = pageId + 1;
  const imageId = pageId + 2;

  const raw = fs.readFileSync(path.join(DIR, sheet.file));
  const info = jpegInfo(raw);
  const colorSpace = info.channels === 1 ? "/DeviceGray" : info.channels === 4 ? "/DeviceCMYK" : "/DeviceRGB";

  // Fit to full page height, centre horizontally.
  const scale = PAGE_H / info.height;
  const drawH = PAGE_H;
  const drawW = info.width * scale;
  const offX = (PAGE_W - drawW) / 2;

  if (drawW > PAGE_W + 0.01) {
    throw new Error(`${sheet.file} is wider than the page after fitting (${drawW.toFixed(1)}pt)`);
  }

  obj(
    pageId,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
  );

  const stream = `q\n${drawW.toFixed(4)} 0 0 ${drawH.toFixed(4)} ${offX.toFixed(4)} 0 cm\n/Im0 Do\nQ\n`;
  obj(contentId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);

  offsets[imageId] = length;
  push(`${imageId} 0 obj\n`);
  push(
    `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} ` +
      `/ColorSpace ${colorSpace} /BitsPerComponent ${info.bits} /Filter /DCTDecode ` +
      `/Length ${raw.length} >>\nstream\n`
  );
  push(raw); // verbatim: no decode, no re-encode
  push("\nendstream\nendobj\n");

  const dpi = info.width / (drawW / 72);
  embedded.push({ ...sheet, bytes: raw.length, dpi: Math.round(dpi), colorSpace });
  console.log(
    `  p${i + 1}  ${sheet.file}  ${info.width}x${info.height}  ${colorSpace.slice(1)}  ~${Math.round(dpi)} DPI`
  );
});

const xrefStart = length;
push(`xref\n0 ${totalObjs + 1}\n`);
push("0000000000 65535 f \n");
for (let n = 1; n <= totalObjs; n++) {
  push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
}
push(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

const lo = sheets[0].num;
const hi = sheets[sheets.length - 1].num;
const outName = `CRWN-Fan-Economy-Sheets-${lo}-${hi}.pdf`;
const outPath = path.join(DIR, outName);
fs.writeFileSync(outPath, Buffer.concat(parts));

console.log(`\n${sheets.length} pages -> ${outPath}`);
console.log(`${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB`);
console.log(`lowest page resolution: ${Math.min(...embedded.map((e) => e.dpi))} DPI`);
