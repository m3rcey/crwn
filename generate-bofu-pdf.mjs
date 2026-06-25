import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

const SRC_DIR = '/home/merce/.openclaw/workspace-crwn/videos/scripts/bofu';
const OUT_PDF = '/mnt/c/Users/Merce/Dropbox/nano banana output/BOFU Activation Scripts.pdf';
const TMP_HTML = '/tmp/bofu-scripts.html';
const CHROME = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe';

const files = fs.readdirSync(SRC_DIR)
  .filter((f) => /^bofu-\d+-.*\.md$/.test(f))
  .sort((a, b) => parseInt(a.match(/^bofu-(\d+)/)[1], 10) - parseInt(b.match(/^bofu-(\d+)/)[1], 10));

const css = `
@page { size: letter; margin: 0.6in 0.55in 0.6in 0.55in; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; line-height: 1.55; font-size: 18pt; margin: 0; }
.script-page { page-break-before: always; }
.script-page:first-of-type { page-break-before: auto; }
.index { font-size: 11pt; color: #888; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 4px 0; }
h1 { font-size: 22pt; line-height: 1.2; margin: 0 0 22px 0; text-transform: uppercase; letter-spacing: 0.5px; }
.label { font-size: 10pt; color: #777; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 6px 0; font-weight: 600; }
.caption { font-size: 14pt; line-height: 1.5; background: #f4f4f0; border-left: 4px solid #D4AF37; padding: 12px 14px; margin: 0 0 26px 0; border-radius: 4px; }
.caption p { margin: 0 0 8px 0; }
.caption p:last-child { margin-bottom: 0; }
.script p { margin: 0 0 18px 0; font-size: 19pt; line-height: 1.55; }
.script p:last-child { margin-bottom: 0; }
.cover { text-align: center; padding-top: 2.5in; }
.cover h1 { font-size: 34pt; letter-spacing: 1px; }
.cover .sub { font-size: 14pt; color: #777; margin-top: 12px; letter-spacing: 2px; text-transform: uppercase; }
`;

function extract(md) {
  const titleMatch = md.match(/^##\s+(.+?)\s*$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'UNTITLED';
  const capMatch = md.match(/\*\*CAPTION:\*\*\s*\n+([\s\S]*?)\n+---/);
  const caption = capMatch ? capMatch[1].trim() : '';
  const scrMatch = md.match(/\*\*SCRIPT:\*\*\s*\n+([\s\S]*?)\n+---/);
  const script = scrMatch ? scrMatch[1].trim() : '';
  return { title, caption, script };
}
function htmlEscape(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function paragraphs(text) {
  return text.split(/\n\s*\n/).map((p) => p.replace(/\n+/g, ' ').trim()).filter(Boolean).map((p) => `<p>${htmlEscape(p)}</p>`).join('\n');
}
function winPath(p) { return execSync(`wslpath -w "${p}"`).toString().trim(); }

const sections = [];
sections.push(`<div class="cover">
<h1>BOFU Activation Scripts</h1>
<div class="sub">CRWN &middot; ${files.length} scripts &middot; "you're on CRWN, here's the move"</div>
</div>`);

for (const fname of files) {
  const md = fs.readFileSync(path.join(SRC_DIR, fname), 'utf8');
  const { title, caption, script } = extract(md);
  const num = fname.match(/^bofu-(\d+)/)[1];
  sections.push(`<div class="script-page">
<div class="index">BOFU ${num}</div>
<h1>${htmlEscape(title)}</h1>
${caption ? `<div class="label">Caption</div><div class="caption">${paragraphs(caption)}</div>` : ''}
<div class="label">Script</div>
<div class="script">${paragraphs(script)}</div>
</div>`);
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>BOFU Scripts</title><style>${css}</style></head><body>${sections.join('\n')}</body></html>`;
fs.writeFileSync(TMP_HTML, html);

const winHtml = winPath(TMP_HTML).replace(/\\/g, '/');
const winPdf = winPath(OUT_PDF);
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer', `--print-to-pdf=${winPdf}`, `file:///${winHtml}`], { stdio: ['ignore', 'ignore', 'ignore'] });
fs.unlinkSync(TMP_HTML);
console.log(`Done. ${files.length} BOFU scripts in ${OUT_PDF}`);
