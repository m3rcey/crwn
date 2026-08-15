// Drives a REAL browser to answer questions unit tests cannot: is the capture card actually in the
// viewport, does the primary CTA jump past it, and does the exposure beacon fire when it should.
//
// Uses the Chrome DevTools Protocol directly over `ws` (already present transitively), so it adds
// no dependency and installs no browser. Chrome runs on the Windows host; this script runs in WSL
// and dials the host IP, because WSL->Windows localhost is not forwarded (Windows->WSL is).
//
// Usage:
//   node scripts/probe-capture-exposure.mjs <url> [--width=1280] [--height=900]
// Requires Chrome already listening:
//   chrome.exe --headless=new --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 \
//              --remote-allow-origins=* --user-data-dir=<tmp>

import WebSocket from 'ws';
import { execSync } from 'node:child_process';

const url = process.argv[2];
if (!url) { console.error('usage: probe-capture-exposure.mjs <url> [--width=] [--height=]'); process.exit(1); }
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? Number(h.split('=')[1]) : d; };
const WIDTH = arg('width', 1280);
const HEIGHT = arg('height', 900);

// The Windows host, as seen from WSL.
const HOST = process.env.CDP_HOST || execSync("ip route show default | awk '{print $3}'").toString().trim();
const PORT = 9222;

async function http(path) {
  const r = await fetch(`http://${HOST}:${PORT}${path}`);
  return r.json();
}

let msgId = 0;
function rpc(ws, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const onMsg = (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id !== id) return;
      ws.off('message', onMsg);
      m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result);
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const targets = await http('/json/list');
const page = targets.find((t) => t.type === 'page');
if (!page) { console.error('no page target; is Chrome running with --remote-debugging-port?'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

await rpc(ws, 'Page.enable');
await rpc(ws, 'Runtime.enable');
await rpc(ws, 'Network.enable');
await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
  width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 700,
});

// Record every analytics beacon, so "did the event fire" is OBSERVED rather than inferred.
// The tracker uses navigator.sendBeacon with a Blob body, which CDP's requestWillBeSent reports
// with empty postData, so patch the transports in-page before any app code runs instead.
await rpc(ws, 'Page.addScriptToEvaluateOnNewDocument', {
  source: `
    // Each probe run starts from a clean exposure session, or the once-per-experience dedup from a
    // previous run silently suppresses the very event being measured (this really happened).
    try { Object.keys(sessionStorage).filter(k => k.startsWith('crwn_capture_seen:')).forEach(k => sessionStorage.removeItem(k)); } catch {}
    window.__crwnBeacons = [];
    const record = (body) => { try { window.__crwnBeacons.push(JSON.parse(body)); } catch { window.__crwnBeacons.push({ event: '?unparsed' }); } };
    const sb = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    if (sb) navigator.sendBeacon = (url, data) => {
      if (String(url).includes('/api/lead-magnets/analytics')) {
        if (data instanceof Blob) { data.text().then(record); } else { record(String(data)); }
      }
      return sb(url, data);
    };
    const of = window.fetch.bind(window);
    window.fetch = (input, init) => {
      try { if (String(input).includes('/api/lead-magnets/analytics') && init && init.body) record(String(init.body)); } catch {}
      return of(input, init);
    };
  `,
});
const readBeacons = async () =>
  (await evalJsRaw(`JSON.stringify((window.__crwnBeacons||[]).map(b => ({ event: b.event, reasonCode: b && b.meta ? b.meta.reasonCode : undefined })))`)) || '[]';
const countViews = async () =>
  JSON.parse(await readBeacons()).filter((b) => b.event === 'lead_magnet_lead_capture_viewed').length;

const evalJsRaw = async (expr) => {
  const r = await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.value;
};
const evalJs = evalJsRaw;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await rpc(ws, 'Page.navigate', { url });
await sleep(6000); // let the result resume + hydrate

const GEO = `(() => {
  const q = (s) => document.querySelector(s);
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), height: Math.round(r.height) }; };
  // Capture card: the form's own wrapper. Identified by its heading text so it survives class edits.
  const heads = [...document.querySelectorAll('h2, div')].filter(e => /Want the plan behind this number|Get your full breakdown/.test(e.textContent||''));
  const captureEl = heads.length ? heads[heads.length-1].closest('div[class*="rounded"]') : null;
  const builder = document.querySelector('#crwn-plan-builder') || [...document.querySelectorAll('div')].find(e => /Build your/.test(e.textContent||'') && e.querySelector('input'));
  const ctas = [...document.querySelectorAll('button')].filter(b => /^Build my /.test((b.textContent||'').trim()));
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    docHeight: document.body.scrollHeight,
    capture: box(captureEl),
    builder: box(builder),
    cta: ctas.length ? box(ctas[0]) : null,
    ctaLabel: ctas.length ? ctas[0].textContent.trim() : null,
  };
})()`;

const before = await evalJs(GEO);
console.log('\n=== GEOMETRY (document coords) ===');
console.log(JSON.stringify(before, null, 1));

console.log('\n=== BEACONS AFTER LOAD ===');
console.log(await readBeacons());
console.log(`capture_viewed fired on load: ${await countViews()}`);

// Click the primary gold CTA and see where the viewport lands relative to the capture card.
const clicked = await evalJs(`(() => {
  const b = [...document.querySelectorAll('button')].find(b => /^Build my /.test((b.textContent||'').trim()));
  if (!b) return false; b.click(); return true;
})()`);
await sleep(1800); // smooth scroll settle

const after = await evalJs(`(() => {
  const y = window.scrollY, h = window.innerHeight;
  return { scrollY: Math.round(y), viewTop: Math.round(y), viewBottom: Math.round(y + h) };
})()`);

console.log(`\n=== AFTER CLICKING "${before.ctaLabel}" (clicked=${clicked}) ===`);
console.log(JSON.stringify(after, null, 1));
if (before.capture && after) {
  const cTop = before.capture.top, cBot = before.capture.top + before.capture.height;
  const visible = Math.max(0, Math.min(cBot, after.viewBottom) - Math.max(cTop, after.viewTop));
  const pct = Math.round((visible / before.capture.height) * 100);
  console.log(`capture card visible after CTA click: ${visible}px of ${before.capture.height}px (${pct}%)`);
}
console.log(`capture_viewed total after CTA click: ${await countViews()}`);

// Now scroll the capture card into view deliberately and dwell.
await evalJs(`window.scrollTo({ top: ${before.capture ? Math.max(0, before.capture.top - 100) : 0}, behavior: 'instant' })`);
await sleep(2500);
const afterDwell = await countViews();
console.log(`\ncapture_viewed after deliberate scroll + dwell: ${afterDwell}`);

// Scroll away and back: must not duplicate.
await evalJs(`window.scrollTo({ top: 0, behavior: 'instant' })`);
await sleep(700);
await evalJs(`window.scrollTo({ top: ${before.capture ? Math.max(0, before.capture.top - 100) : 0}, behavior: 'instant' })`);
await sleep(2500);
const afterReturn = await countViews();
console.log(`capture_viewed after scroll away and back: ${afterReturn} (must equal ${afterDwell})`);

// Case: the card mounted but was never scrolled to. Load tall-viewport-independent proof by
// scrolling straight past it to the very bottom and dwelling there.
console.log('\n=== ALL BEACONS ===');
console.log(await readBeacons());

console.log(`\nsessionStorage exposure flag set: ${await evalJs(`JSON.stringify(Object.keys(sessionStorage).filter(k=>k.startsWith('crwn_capture_seen:')))`)}`);
ws.close();
process.exit(0);

ws.close();
