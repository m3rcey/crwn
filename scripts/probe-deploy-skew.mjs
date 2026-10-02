// Deploy skew vs playback: what happens to a song when the site deploys while it plays?
//
// Next.js compares the server's build id with the tab's on every client navigation and does a
// FULL document load when they differ (fetch-server-response.js -> doMpaNavigation). Vercel
// Skew Protection would pin old tabs to the old deployment, but it is Pro/Enterprise only and
// CRWN is on Hobby, so after every deploy the first in-app navigation in an open tab reloads
// the document and the <audio> element dies with it.
//
// This probe reproduces it locally: start a song on build A, swap the server to build B
// (`--wait-file` appears when you have done that), then navigate in the same tab. It reports
// whether the document reloaded, whether audio came back, at what position, and the silence.
//
//   1. serve build A on --port, run this, wait for "READY: rebuild now"
//   2. stop the server, `npm run build`, start it again on the same port, touch <wait-file>
//   3. the probe navigates and prints the result
//
// Usage (Windows node; see probe-playback.mjs):
//   node probe-deploy-skew.mjs --url=http://localhost:3071/m3rcey --nav=/gb --wait-file=<path>

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
let WebSocket;
try { WebSocket = require('ws'); } catch { WebSocket = createRequire('//wsl.localhost/Ubuntu/home/merce/workspace-crwn/package.json')('ws'); }
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const URL_ = arg('url', 'http://localhost:3071/m3rcey');
const NAV = arg('nav', '/gb');
const WAIT = arg('wait-file', '');
const PORT = Number(arg('port', 9333));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const created = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once('open', r));
let id = 0;
const rpc = (method, params = {}) => new Promise((res, rej) => { const i = ++id; const on = (raw) => { const m = JSON.parse(raw); if (m.id !== i) return; ws.off('message', on); m.error ? rej(new Error(m.error.message)) : res(m.result); }; ws.on('message', on); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (e) => (await rpc('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;

// Per document: a marker (reload detection) and the wall-clock instant audio first plays.
const INSTRUMENT = `(() => {
  window.__skew = { marker: Math.random(), playingAt: null, at: null, blocked: false };
  const P = HTMLMediaElement.prototype, play = P.play;
  P.play = function () {
    const el = this; window.__skewEl = el;
    if (!el.__skewTagged) { el.__skewTagged = 1; el.addEventListener('playing', () => { if (!window.__skew.playingAt) { window.__skew.playingAt = Date.now(); window.__skew.at = el.currentTime; } }); }
    const p = play.apply(this, arguments);
    if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') window.__skew.blocked = true; });
    return p;
  };
})();`;

await rpc('Page.enable');
await rpc('Runtime.enable');
await rpc('Network.enable');
await rpc('Network.setCookie', { name: 'crwn_dnt', value: '1', domain: new URL(URL_).hostname, path: '/' });
await rpc('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
await rpc('Page.navigate', { url: URL_ });
const ROW = `[...document.querySelectorAll('div.group.cursor-pointer')].find(r => r.offsetParent && !/Locked|Subscribe|Unlocks/i.test(r.innerText))`;
for (let i = 0; i < 60 && !(await js(`!!${ROW}`)); i++) await sleep(500);
await sleep(1500);
const r = await js(`(() => { const el = ${ROW}; el.scrollIntoView({block:'center'}); const b = el.getBoundingClientRect(); return { x: b.left + b.width/2, y: b.top + b.height/2 }; })()`);
await rpc('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
await rpc('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
for (let i = 0; i < 60 && !(await js('!!(window.__skew && window.__skew.playingAt)')); i++) await sleep(250);
console.log('playing on build A; READY: rebuild now');

if (WAIT) { while (!existsSync(WAIT)) await sleep(1000); } else { await sleep(30000); }
await sleep(2000);

const before = await js(`({ marker: window.__skew.marker, t: window.__skewEl.currentTime, paused: window.__skewEl.paused, at: Date.now() })`);
await js(`window.next.router.push(${JSON.stringify(NAV)})`);
for (let i = 0; i < 80; i++) {
  await sleep(250);
  const s = await js(`window.__skew ? ({ marker: window.__skew.marker, playingAt: window.__skew.playingAt, blocked: window.__skew.blocked }) : null`).catch(() => null);
  if (s && s.marker !== before.marker && (s.playingAt || s.blocked)) break;
  if (s && s.marker === before.marker && i > 20) break;
}
const after = await js(`({ marker: window.__skew.marker, path: location.pathname, playingAt: window.__skew.playingAt, resumedAt: window.__skew.at, blocked: window.__skew.blocked, el: !!window.__skewEl, paused: window.__skewEl ? window.__skewEl.paused : null, t: window.__skewEl ? window.__skewEl.currentTime : null })`);
const reloaded = after.marker !== before.marker;
console.log(JSON.stringify({
  reloaded,
  path: after.path,
  positionBefore: +before.t.toFixed(2),
  resumed: reloaded ? !!after.playingAt : !after.paused,
  resumedAtPosition: after.resumedAt != null ? +after.resumedAt.toFixed(2) : null,
  blockedByAutoplayPolicy: after.blocked,
  silenceMs: reloaded && after.playingAt ? after.playingAt - before.at : 0,
}, null, 2));
await fetch(`http://localhost:${PORT}/json/close/${created.id}`).catch(() => {});
process.exit(0);
