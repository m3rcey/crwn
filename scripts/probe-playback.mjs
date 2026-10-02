// Playback latency + persistence probe. Measured, not eyeballed.
//
// Drives a real Chrome over the DevTools protocol against a CRWN artist page and answers:
//   A. tap -> audible: pointerdown on a track row until the media clock first ADVANCES
//      (`playing` alone is not proof of sound; currentTime moving is).
//   B. track -> track: `ended` of track A until track B's clock first advances.
//   C/D/E. the stages in between: stream-url resolution (/api/tracks/<id>/stream), the audio
//      request (resource timing), media readiness (loadstart / canplay / playing).
//   + persistence: a client-side route change while playing must not pause, restart, reload the
//     document or create a second element.
//   + race: three rapid taps on different rows must end on the LAST one tapped.
//
// Every media element the page creates (new Audio(), <audio>) is instrumented before any page
// script runs, so the probe measures whatever engine the page ships, old or new.
//
// Writes nothing to CRWN: it stamps the crwn_dnt cookie first (founder traffic rule) and plays
// only tracks an anonymous visitor may already play.
//
// Usage (Windows node, because WSL cannot reach Chrome's CDP port; see memory
// local-browser-probe-against-production):
//   chrome.exe --headless=new --remote-debugging-port=9333 --remote-allow-origins=* --user-data-dir=<tmp>
//   MSYS_NO_PATHCONV=1 node //wsl.localhost/Ubuntu/home/merce/workspace-crwn/scripts/probe-playback.mjs \
//       --url=https://thecrwn.app/m3rcey --nav=/gb [--port=9333] [--mobile] [--transitions=2] [--json]

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let WebSocket;
try { WebSocket = require('ws'); } catch {
  WebSocket = createRequire('//wsl.localhost/Ubuntu/home/merce/workspace-crwn/package.json')('ws');
}

const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const flag = (n) => process.argv.includes(`--${n}`);
const URL_ = arg('url', 'https://thecrwn.app/m3rcey');
// Comma-separated in-app routes visited in order while the song plays.
const NAVS = arg('nav', '/gb').split(',').filter(Boolean);
// Optional one-time magic link (scripts/artist-login-link.mjs) to probe as a signed-in user.
const LOGIN = arg('login', '');
const PORT = Number(arg('port', 9333));
const HOST = process.env.CDP_HOST || 'localhost';
const MOBILE = flag('mobile');
const TRANSITIONS = Number(arg('transitions', 2));
// Seconds each track plays before the probe jumps to its last 1.5s. A real song plays for
// minutes before it ends; an engine that prepares the next track needs some of that time, and
// one that does not simply wastes it, so the comparison stays fair.
const SETTLE_S = Number(arg('settle', 12));
// Network shaping (Chrome DevTools presets). fast4g ~ a good phone link, slow4g ~ a weak one.
const THROTTLES = {
  fast4g: { offline: false, latency: 165, downloadThroughput: (9000 * 1024) / 8, uploadThroughput: (1500 * 1024) / 8 },
  slow4g: { offline: false, latency: 562.5, downloadThroughput: (1440 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 },
};
const THROTTLE = arg('throttle', '');
const AS_JSON = flag('json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

// Injected before any page script. Tags every media element, records its lifecycle events on
// one clock (performance.now), and runs a 4ms watcher that records the instant each element's
// clock first advances after a (re)start. Survives as long as the DOCUMENT does, which is
// itself the persistence signal: a hard reload resets window.__pb.
const INSTRUMENT = `(() => {
  if (window.__pb) return;
  const pb = window.__pb = { events: [], els: [], marker: Math.random() };
  try { performance.setResourceTimingBufferSize(5000); } catch {}
  const now = () => performance.now();
  const short = (s) => { try { const u = new URL(s, location.href); return u.pathname.split('/').pop().slice(-28); } catch { return String(s).slice(-28); } };
  const log = (type, el, extra) => pb.events.push(Object.assign({ t: now(), type, el: el ? el.__pbId : null,
    src: el ? short(el.currentSrc || el.getAttribute('src') || '') : '', ct: el ? +el.currentTime.toFixed(3) : null }, extra || {}));
  const EVENTS = ['loadstart','loadedmetadata','loadeddata','canplay','canplaythrough','playing','waiting','stalled','pause','ended','emptied','error','seeking','seeked'];
  function tag(el) {
    if (el.__pbId) return;
    el.__pbId = pb.els.length + 1;
    pb.els.push(el);
    el.__pbBase = null;
    log('element-created', el);
    for (const e of EVENTS) el.addEventListener(e, () => {
      if (e === 'playing' || e === 'loadstart' || e === 'seeked') el.__pbBase = { ct: el.currentTime, armed: true };
      log(e, el, e === 'error' ? { code: el.error && el.error.code } : undefined);
    });
  }
  const P = HTMLMediaElement.prototype;
  const play = P.play;
  P.play = function () { tag(this); log('play()', this); return play.apply(this, arguments); };
  const load = P.load;
  P.load = function () { tag(this); log('load()', this); return load.apply(this, arguments); };
  const d = Object.getOwnPropertyDescriptor(P, 'src');
  Object.defineProperty(P, 'src', { configurable: true, enumerable: d.enumerable, get() { return d.get.call(this); },
    set(v) { tag(this); log('src=', this, { to: short(v) }); return d.set.call(this, v); } });
  const A = window.Audio;
  window.Audio = function (s) { const el = s === undefined ? new A() : new A(s); tag(el); return el; };
  window.Audio.prototype = A.prototype;
  const ce = Document.prototype.createElement;
  Document.prototype.createElement = function (n) { const el = ce.apply(this, arguments); if (/^(audio|video)$/i.test(n)) tag(el); return el; };
  addEventListener('pointerdown', (ev) => log('pointerdown', null, { x: ev.clientX | 0, y: ev.clientY | 0 }), true);
  setInterval(() => {
    for (const el of pb.els) {
      const b = el.__pbBase;
      if (!b || !b.armed || el.paused) continue;
      if (el.currentTime > b.ct + 0.02) { b.armed = false; log('clock-advanced', el); }
    }
  }, 4);
  const mark = (s) => log('mark', null, { note: s });
  pb.mark = mark;
})();`;

const created = await (await fetch(`http://${HOST}:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
const js = async (expr) => {
  const r = await rpc(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

await rpc(ws, 'Page.enable');
await rpc(ws, 'Runtime.enable');
await rpc(ws, 'Network.enable');

// Chrome leaves media requests out of Resource Timing, so audio and stream-url requests are
// read from the protocol instead. Each entry's numbers are deltas inside that one request, so
// no clock alignment with the page is needed.
const net = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  const p = m.params;
  if (m.method === 'Network.requestWillBeSent' && /\/storage\/v1\/object\/sign\/audio\/|\/api\/tracks\/[^/]+\/stream/.test(p.request.url)) {
    net.set(p.requestId, { url: p.request.url.split('?')[0].split('/').slice(-2).join('/'), range: p.request.headers.Range || p.request.headers.range || null, sentAt: p.timestamp });
  } else if (m.method === 'Network.responseReceived' && net.has(p.requestId)) {
    const e = net.get(p.requestId); const h = p.response.headers;
    Object.assign(e, { status: p.response.status, ttfb_ms: +((p.response.timing ? p.response.timing.receiveHeadersEnd : (p.timestamp - e.sentAt) * 1000)).toFixed(1),
      cache: h['cf-cache-status'] || h['CF-Cache-Status'] || h['x-cache'] || null, cacheControl: h['cache-control'] || h['Cache-Control'] || null, length: h['content-length'] || h['Content-Length'] || null });
  } else if (m.method === 'Network.loadingFinished' && net.has(p.requestId)) {
    const e = net.get(p.requestId); e.total_ms = +((p.timestamp - e.sentAt) * 1000).toFixed(1); e.bytes = p.encodedDataLength;
  }
});
const netSnapshot = () => { const v = [...net.values()]; net.clear(); return v; };
const host = new URL(URL_).hostname;
const ok = await rpc(ws, 'Network.setCookie', { name: 'crwn_dnt', value: '1', domain: host, path: '/' });
if (!ok.success) { console.error('refusing to run: could not stamp crwn_dnt'); process.exit(2); }
if (MOBILE) {
  await rpc(ws, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 745, deviceScaleFactor: 3, mobile: true });
  await rpc(ws, 'Emulation.setTouchEmulationEnabled', { enabled: true });
}
if (THROTTLE) {
  if (!THROTTLES[THROTTLE]) { console.error(`unknown --throttle=${THROTTLE}`); process.exit(1); }
  await rpc(ws, 'Network.emulateNetworkConditions', THROTTLES[THROTTLE]);
}
await rpc(ws, 'Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
if (LOGIN) {
  await rpc(ws, 'Page.navigate', { url: LOGIN });
  await sleep(9000); // the link lands on the site, which stores the session
}
await rpc(ws, 'Page.navigate', { url: URL_ });

const waitFor = async (expr, ms = 20000, step = 50) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await js(expr).catch(() => false)) return true; await sleep(step); }
  return false;
};
const ROWS = `[...document.querySelectorAll('div.group.cursor-pointer')].filter(r => r.offsetParent && !/Locked|Subscribe|Unlocks/i.test(r.innerText))`;
if (!(await waitFor(`${ROWS}.length >= 3`, 90000))) { console.error('no playable rows found'); process.exit(3); }
await sleep(1500); // let hydration settle so the tap is a real tap, not a pre-hydration no-op

async function tapRow(i) {
  const rect = await js(`(() => { const r = ${ROWS}[${i}]; r.scrollIntoView({block:'center'}); const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, title: (r.querySelector('h3,p,span')||r).innerText.split('\\n')[0] }; })()`);
  await sleep(150);
  const type = MOBILE ? 'touch' : 'mouse';
  if (type === 'touch') {
    await rpc(ws, 'Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x, y: rect.y }] });
    await rpc(ws, 'Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await rpc(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  }
  return rect.title;
}

const events = () => js('window.__pb ? window.__pb.events : null');
const firstAfter = (evs, t0, pred) => evs.find((e) => e.t >= t0 && pred(e));
const ms = (a, b) => (a && b ? +(b.t - a.t).toFixed(1) : null);

const report = { url: URL_, mobile: MOBILE, tap: null, persistence: null, transitions: [], race: null };

// ---- A. tap -> audible --------------------------------------------------------------------
netSnapshot();
const title1 = await tapRow(0);
await waitFor(`window.__pb.events.some(e => e.type === 'clock-advanced')`, 60000, 20);
{
  const evs = await events();
  const down = evs.find((e) => e.type === 'pointerdown');
  if (!down) { console.error('the tap never reached the page'); process.exit(4); }
  const t = (type) => firstAfter(evs, down.t, (e) => e.type === type);
  report.tap = {
    track: title1,
    pointerdown_to_srcSet_ms: ms(down, t('src=')),
    pointerdown_to_play_call_ms: ms(down, t('play()')),
    pointerdown_to_loadstart_ms: ms(down, t('loadstart')),
    pointerdown_to_canplay_ms: ms(down, t('canplay')),
    pointerdown_to_playing_ms: ms(down, t('playing')),
    pointerdown_to_audible_ms: ms(down, t('clock-advanced')),
    elements: (await js('window.__pb.els.length')),
    network: netSnapshot(),
  };
}

// ---- persistence across client-side route changes -------------------------------------------
report.persistence = [];
for (const NAV of NAVS) {
  const marker = await js('window.__pb ? window.__pb.marker : null');
  const before = await js(`(() => { const el = window.__pb.els.find(e => !e.paused); return el ? { id: el.__pbId, ct: el.currentTime, src: el.currentSrc } : null; })()`);
  const tNav = await js('performance.now()');
  // A real in-app navigation: Next's router, the same call a <Link> makes.
  const navigated = await js(`(async () => { const r = window.next && window.next.router; if (!r) return 'no-router'; r.push(${JSON.stringify(NAV)}); return 'pushed'; })()`);
  await sleep(5000);
  const after = await js(`(() => { if (!window.__pb) return { reloaded: true }; const el = window.__pb.els.find(e => e.__pbId === ${before?.id ?? -1}); return { marker: window.__pb.marker, path: location.pathname, id: el && el.__pbId, ct: el && el.currentTime, paused: el && el.paused, src: el && el.currentSrc, playingEls: window.__pb.els.filter(e => !e.paused).length, els: window.__pb.els.length }; })()`);
  const evs = await events();
  const interruptions = (evs || []).filter((e) => e.t >= tNav && ((e.el === (before && before.id) && ['pause', 'emptied', 'loadstart', 'waiting'].includes(e.type)) || e.type === 'element-created')).map((e) => e.type);
  report.persistence.push({
    navigated, to: after.path,
    documentSurvived: !after.reloaded && after.marker === marker,
    sameElement: after.id === before?.id,
    sameSource: after.src === before?.src,
    stillPlaying: after.paused === false,
    advancedSeconds: after.ct != null && before ? +(after.ct - before.ct).toFixed(2) : null,
    simultaneousPlayingElements: after.playingEls,
    totalElements: after.els,
    interruptions,
  });
  if (after.reloaded || after.marker !== marker) await js(INSTRUMENT); // keep measuring after a reload
}

// ---- B. track -> track ---------------------------------------------------------------------
for (let i = 0; i < TRANSITIONS; i++) {
  await sleep(SETTLE_S * 1000);
  const pre = await js(`(() => { const el = window.__pb.els.find(e => !e.paused); if (!el || !isFinite(el.duration)) return null; el.currentTime = Math.max(0, el.duration - 1.5); return { id: el.__pbId, src: el.currentSrc.split('?')[0].split('/').pop() }; })()`);
  if (!pre) { report.transitions.push({ error: 'nothing playing to transition from' }); break; }
  const tSeek = await js('performance.now()');
  const preloaded = netSnapshot(); // requests made while the previous track played (preparation)
  const done = await waitFor(`(() => { const ev = window.__pb.events; const end = ev.findIndex(e => e.t >= ${tSeek} && e.type === 'ended'); if (end < 0) return false; return ev.slice(end).some(e => e.type === 'clock-advanced'); })()`, 60000, 20);
  const evs = await events();
  const ended = firstAfter(evs, tSeek, (e) => e.type === 'ended');
  const t = (type) => (ended ? firstAfter(evs, ended.t, (e) => e.type === type) : null);
  report.transitions.push({
    completed: done,
    ended_to_srcSet_ms: ms(ended, t('src=')),
    ended_to_play_call_ms: ms(ended, t('play()')),
    ended_to_loadstart_ms: ms(ended, t('loadstart')),
    ended_to_canplay_ms: ms(ended, t('canplay')),
    ended_to_playing_ms: ms(ended, t('playing')),
    ended_to_audible_ms: ms(ended, t('clock-advanced')),
    prepared_before_seek: preloaded,
    requests_in_window: netSnapshot(),
  });
  await sleep(1200);
}

// ---- tap the NEXT song in the list after the current one has played a while -----------------
// The acceptance case "tap an already-prepared song". An engine that prepares the next track
// has it ready; one that does not pays a cold start. Same taps for both.
{
  await sleep(SETTLE_S * 1000);
  const idx = await js(`(() => { const rows = ${ROWS}; return rows.findIndex(r => r.querySelector('.text-crwn-gold')); })()`);
  if (idx >= 0) {
    const tBefore = await js('performance.now()');
    netSnapshot();
    const title = await tapRow(idx + 1);
    await waitFor(`window.__pb.events.some(e => e.t > ${tBefore} && e.type === 'clock-advanced')`, 60000, 20);
    const evs = await events();
    const down = firstAfter(evs, tBefore, (e) => e.type === 'pointerdown');
    report.preparedTap = { track: title, pointerdown_to_audible_ms: ms(down, down && firstAfter(evs, down.t, (e) => e.type === 'clock-advanced')), network: netSnapshot() };
  } else {
    report.preparedTap = { error: 'could not find the playing row' };
  }
}

// ---- rapid taps: newest selection must win ---------------------------------------------------
{
  await js(`window.next.router.push(${JSON.stringify(new URL(URL_).pathname)})`);
  await waitFor(`${ROWS}.length >= 4`, 60000);
  await sleep(800);
  const titles = [];
  for (const i of [1, 2, 3]) { titles.push(await tapRow(i)); await sleep(60); }
  await sleep(6000);
  const playing = await js(`(() => { const el = window.__pb.els.filter(e => !e.paused); return el.map(e => decodeURIComponent(e.currentSrc.split('?')[0].split('/').pop())); })()`);
  const nowTitle = await js(`(() => { const h = [...document.querySelectorAll('h3,p')].find(x => /text-crwn-gold/.test(x.className) && x.closest('div.group')); return h ? h.innerText : null; })()`);
  report.race = { tapped: titles, expected: titles[titles.length - 1], highlighted: nowTitle, playingSources: playing };
}

if (AS_JSON) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`\n== ${URL_} ${MOBILE ? '(mobile 390x745, touch)' : '(desktop, mouse)'}${THROTTLE ? ` [${THROTTLE}]` : ''} settle=${SETTLE_S}s`);
  console.log('A. tap -> audible', report.tap);
  console.log('persistence', report.persistence);
  report.transitions.forEach((t, i) => console.log(`B. transition ${i + 1}`, t));
  console.log('race', report.race);
}
const persistOk = report.persistence.every((p) => p.documentSurvived && p.sameElement && p.stillPlaying && p.interruptions.length === 0);
console.log(`SUMMARY tap->audible=${report.tap?.pointerdown_to_audible_ms}ms | next-row tap->audible=${report.preparedTap?.pointerdown_to_audible_ms}ms | transitions ended->audible=${report.transitions.map((t) => t.ended_to_audible_ms).join(',')}ms | navigation ${persistOk ? 'UNINTERRUPTED' : 'INTERRUPTED'} | race ${report.race?.highlighted === report.race?.expected && report.race?.playingSources?.length === 1 ? 'newest-wins' : 'WRONG'}`);
await fetch(`http://${HOST}:${PORT}/json/close/${created.id}`).catch(() => {});
ws.close();
process.exit(0);
