// Where does a calculator RESULT page put its asks on a phone? Measured, not eyeballed.
//
// Answers one question per tool URL: after the result renders, is the email ask's SUBMIT button
// above the fold, and where does the calculator explainer video start? It prints document-space
// geometry plus a verdict against the fold, so "is this also true for the other calculators" is a
// loop over URLs rather than a stack of screenshots.
//
// Same CDP-over-`ws` approach as probe-capture-exposure.mjs: no dependency, no bundled browser.
// Chrome runs on the Windows host; run this from WSL.
//
// Usage:
//   node scripts/probe-result-fold.mjs <url> [--width=390] [--height=745] [--port=9222]
// <url> should carry the tool's answers as a prefill query so the wizard only needs its submit
// pressed, e.g. /tools/own-your-fans-calculator?social_followers=250000&monetization_status=direct_some
//
// The default 390x745 is an iPhone 12-15 in Safari with its toolbars showing: the conservative fold.
// Requires Chrome listening:
//   chrome.exe --headless=new --remote-debugging-port=<port> --remote-debugging-address=0.0.0.0 \
//              --remote-allow-origins=* --user-data-dir=<tmp>

import WebSocket from 'ws';
import { execSync } from 'node:child_process';

const url = process.argv[2];
if (!url) { console.error('usage: probe-result-fold.mjs <url> [--width=] [--height=] [--port=]'); process.exit(1); }
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? Number(h.split('=')[1]) : d; };
const WIDTH = arg('width', 390);
const HEIGHT = arg('height', 745);
const PORT = arg('port', 9222);
const HOST = process.env.CDP_HOST || execSync("ip route show default | awk '{print $3}'").toString().trim();

let msgId = 0;
function rpc(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const onMsg = (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id !== id) return;
      ws.off('message', onMsg);
      m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result);
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A fresh tab per run, so one tool's sessionStorage never leaks into the next.
const created = await (await fetch(`http://${HOST}:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
const js = async (expr) => (await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

await rpc(ws, 'Page.enable');
await rpc(ws, 'Runtime.enable');
await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 3, mobile: true });
await rpc(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true });
await rpc(ws, 'Page.navigate', { url });
await sleep(5000);

// Press the wizard's own submit until a result is on screen. The prefill query already answered
// every question, so this is the same taps a visitor makes, with no typing.
const RESULT_MARK = `!!document.querySelector('[data-probe="result-hero"]') || /YOU'RE LEAVING|Want the plan behind this number|Get your full breakdown/i.test(document.body.innerText)`;
for (let i = 0; i < 12 && !(await js(RESULT_MARK)); i++) {
  // A dropdown question the prefill could not answer :
  // open the OptionSelect and take its first option, the way a tapping visitor would.
  if (await js(`(() => { const t = [...document.querySelectorAll('button[aria-haspopup]')].find(b => b.offsetParent); if (!t) return false; t.click(); return true; })()`)) {
    await sleep(400);
    await js(`(() => { const o = document.querySelector('[role="option"]'); if (o) o.click(); })()`);
    await sleep(400);
  }
  await js(`(() => {
    const scope = document.getElementById('crwn-calculator') || document;
    const btns = [...scope.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent);
    const b = btns.reverse().find(b => /^(Continue|Next|See|Plan|Build|Generate|Show|Find|Calculate)/i.test((b.textContent||'').trim()));
    if (b) b.click(); else {
      const hero = [...document.querySelectorAll('button, a')].find(b => /^(See|Plan|Build|Generate|Show|Find)/i.test((b.textContent||'').trim()));
      hero && hero.click();
    }
  })()`);
  await sleep(1500);
}
await js(`window.scrollTo(0, 0)`);
await sleep(800);

const geo = await js(`(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), height: Math.round(r.height) }; };
  const byText = (sel, re) => [...document.querySelectorAll(sel)].find(e => re.test((e.textContent||'').trim()) && e.offsetParent);
  const primary = byText('button, a', /^Build my |^Build My |^See my plan/);
  const captureHead = byText('h2, h3', /Want the plan behind this number|Get your full breakdown|Email/);
  const captureBtn = byText('button', /^(Email|Send|Sending)/);
  const video = document.querySelector('video');
  return {
    viewport: { w: innerWidth, h: innerHeight },
    resultShown: ${RESULT_MARK},
    primaryCta: box(primary), primaryLabel: primary ? primary.textContent.trim() : null,
    captureHeading: box(captureHead),
    captureSubmit: box(captureBtn), captureLabel: captureBtn ? captureBtn.textContent.trim() : null,
    explainerVideo: box(video),
    docHeight: document.documentElement.scrollHeight,
  };
})()`);

const fold = geo.viewport.h;
const verdict = (b) => (b ? (b.bottom <= fold ? `ABOVE fold (bottom ${b.bottom} <= ${fold})` : `BELOW fold by ${b.bottom - fold}px`) : 'NOT FOUND');
console.log(JSON.stringify(geo, null, 1));
console.log(`\nfold = ${fold}px (${WIDTH}x${HEIGHT})`);
console.log(`primary CTA:      ${verdict(geo.primaryCta)}`);
console.log(`email submit:     ${verdict(geo.captureSubmit)}`);
console.log(`explainer video:  ${geo.explainerVideo ? `starts at ${geo.explainerVideo.top}px, ${geo.explainerVideo.top - fold}px below the fold, ${geo.explainerVideo.height}px tall` : 'NOT FOUND'}`);

// --shot=<file> saves what the first screen actually shows, so the verdict can be LOOKED at too.
const SHOT = process.argv.find((a) => a.startsWith('--shot='));
if (SHOT) {
  const { data } = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync(SHOT.slice(7), Buffer.from(data, 'base64'));
  console.log('screenshot: ' + SHOT.slice(7));
}

ws.close();
await fetch(`http://${HOST}:${PORT}/json/close/${created.id}`).catch(() => {});
process.exit(0);
