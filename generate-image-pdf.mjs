import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

// Bundle the short-form image sheets for a numeric range into a single PDF,
// one 3:4 sheet per page. Matches the existing "Hip-Hop Industry 43-100.pdf".

const IMG_DIR = '/mnt/c/Users/Merce/Dropbox/nano banana output/Shortform Posts/Hip-Hop Industry';
const START = 101;
const END = 140;
const OUT_PDF = `/mnt/c/Users/Merce/Dropbox/nano banana output/Shortform Posts/Hip-Hop Industry ${START}-${END}.pdf`;
const TMP_HTML = '/tmp/hiphop-img-pdf.html';
const CHROME = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';

const files = fs.readdirSync(IMG_DIR)
  .filter((f) => /^\d+-.*\.(jpg|jpeg|png)$/i.test(f))
  .map((f) => ({ f, n: parseInt(f, 10) }))
  .filter((x) => x.n >= START && x.n <= END)
  .sort((a, b) => a.n - b.n);

if (!files.length) { console.error('no images in range'); process.exit(1); }

function winFileUrl(p) {
  return 'file:///' + execSync(`wslpath -w "${p}"`).toString().trim().replace(/\\/g, '/');
}

const css = `
@page { size: 7.5in 10in; margin: 0; }
* { margin: 0; padding: 0; }
html, body { background: #fff; }
.page { page-break-after: always; width: 7.5in; height: 10in; overflow: hidden; }
.page:last-child { page-break-after: auto; }
img { width: 7.5in; height: 10in; object-fit: cover; display: block; }
`;

const body = files
  .map(({ f }) => `<div class="page"><img src="${winFileUrl(path.join(IMG_DIR, f))}"></div>`)
  .join('\n');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>\n${body}\n</body></html>`;
fs.writeFileSync(TMP_HTML, html);

const winHtml = winFileUrl(TMP_HTML);
const winPdf = execSync(`wslpath -w "${OUT_PDF}"`).toString().trim();

execFileSync(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
  `--print-to-pdf=${winPdf}`, winHtml,
], { stdio: ['ignore', 'ignore', 'ignore'] });

fs.unlinkSync(TMP_HTML);
console.log(`Done. ${files.length} sheets (${START}-${END}) -> ${OUT_PDF}`);
console.log('range:', files.map((x) => x.n).join(', '));
