// Is the fan funnel's primary button above the fold? Measured, not eyeballed.
//
// A call to action is ALWAYS above the fold (founder, 2026-10-03, after it was forgotten more
// than once). Any page change that moves a primary button runs this before it lands, and a page a
// fan buys on gets a job here. Primary buttons use bg-crwn-gold or neu-button-accent (the tier
// cards' gold), which is what this finds. A page that scrolls itself on load (the artist page's
// ?tab= links) is measured with "inPlace": true, where the button sits in the viewport.
//
// For each job (a vote page, a drop page, and the screens a fan reaches AFTER opting in), load the
// page at four viewports and print where the first full-width gold button's bottom edge sits
// against the fold. The sticky bar on an offer page does not count: it only scrolls back to the
// real button.
//
// NO WRITES, by construction: the crwn_dnt cookie is stamped first (the run is refused if it
// fails), and every non-GET /api/ request is intercepted. A job's `intercept` answers the claim
// locally with a fake success so the post-opt-in screens render; anything else is failed.
//
// Chrome is spawned headless from the Windows host, so run it with WINDOWS node (WSL cannot
// reach Chrome's debugging port):
//   node scripts/probe-fan-fold.mjs [--host=https://thecrwn.app] [--jobs=<file.json>]
// --host=http://localhost:<port> measures a local `next dev` (which reads production data).
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const DEFAULT_JOBS = [
 {
  "name": "DROP capture (Dre)",
  "path": "/drop/princedre-round-here"
 },
 {
  "name": "DROP capture (GB)",
  "path": "/drop/YTjOsa-rlvT9"
 },
 {
  "name": "DROP after opt-in: Gold (Dre)",
  "path": "/drop/princedre-round-here",
  "intercept": [
   {
    "url": "/claim",
    "body": {
     "magnet": {
      "trackUrl": "https://thecrwn.app/probe-silence.mp3"
     },
     "emailSent": true,
     "hasSession": false,
     "isOwner": false
    }
   }
  ],
  "steps": [
   {
    "fill": [
     "input[type=email]",
     "probe@example.com"
    ]
   },
   {
    "clickText": "^Unlock Round Here",
    "wait": 2000
   }
  ],
  "match": "Projects"
 },
 {
  "name": "DROP after opt-in: Gold (GB)",
  "path": "/drop/YTjOsa-rlvT9",
  "intercept": [
   {
    "url": "/claim",
    "body": {
     "magnet": {
      "trackUrl": "https://thecrwn.app/probe-silence.mp3"
     },
     "emailSent": true,
     "hasSession": false,
     "isOwner": false
    }
   }
  ],
  "steps": [
   {
    "fill": [
     "input[type=email]",
     "probe@example.com"
    ]
   },
   {
    "clickText": "^Unlock Go Bad",
    "wait": 2000
   }
  ],
  "match": "^(?!Unlock Go Bad)"
 },
 {
  "name": "DROP Silver (Dre)",
  "path": "/drop/princedre-round-here",
  "intercept": [
   {
    "url": "/claim",
    "body": {
     "magnet": {
      "trackUrl": "https://thecrwn.app/probe-silence.mp3"
     },
     "emailSent": true,
     "hasSession": false,
     "isOwner": false
    }
   }
  ],
  "steps": [
   {
    "fill": [
     "input[type=email]",
     "probe@example.com"
    ]
   },
   {
    "clickText": "^Unlock Round Here",
    "wait": 2000
   },
   {
    "clickText": "^Not right now$",
    "wait": 1200
   }
  ]
 },
 {
  "name": "VOTE landing (Dre)",
  "path": "/princedre/join/vote"
 },
 {
  "name": "VOTE after picking a song (Dre, in place)",
  "path": "/princedre/join/vote",
  "steps": [
   {
    "clickSel": "[role=radio]",
    "wait": 1200
   }
  ],
  "inPlace": true,
  "match": "cast my vote"
 },
 {
  "name": "VOTE landing (GB)",
  "path": "/gb/join/final-vote"
 },
 {
  "name": "VOTE after picking (GB, in place)",
  "path": "/gb/join/final-vote",
  "steps": [
   {
    "clickSel": "[role=radio]",
    "wait": 1200
   }
  ],
  "inPlace": true,
  "match": "cast my vote"
 },
 {
  "name": "VOTE after opt-in: Gold (Dre)",
  "path": "/princedre/join/vote",
  "intercept": [
   {
    "url": "/api/song-lab/live-claim",
    "body": {
     "success": true,
     "joined": true,
     "alreadyMember": false,
     "voted": true,
     "destination": "/princedre",
     "rewardPath": null,
     "emailSent": true,
     "results": {
      "total": 27,
      "options": [
       {
        "id": "a",
        "label": "Project One",
        "percent": 48
       },
       {
        "id": "b",
        "label": "Project Two",
        "percent": 30
       },
       {
        "id": "c",
        "label": "Project Three",
        "percent": 22
       }
      ]
     }
    }
   }
  ],
  "steps": [
   {
    "clickSel": "[role=radio]"
   },
   {
    "fill": [
     "#ballot-first-name",
     "Probe"
    ]
   },
   {
    "fill": [
     "#ballot-email",
     "probe@example.com"
    ]
   },
   {
    "clickText": "^cast my vote$",
    "wait": 2000
   }
  ],
  "match": "Projects"
 },
 {
  "name": "VOTE after opt-in: downsell (Dre)",
  "path": "/princedre/join/vote",
  "intercept": [
   {
    "url": "/api/song-lab/live-claim",
    "body": {
     "success": true,
     "joined": true,
     "alreadyMember": false,
     "voted": true,
     "destination": "/princedre",
     "rewardPath": null,
     "emailSent": true,
     "results": {
      "total": 27,
      "options": [
       {
        "id": "a",
        "label": "Project One",
        "percent": 48
       },
       {
        "id": "b",
        "label": "Project Two",
        "percent": 30
       },
       {
        "id": "c",
        "label": "Project Three",
        "percent": 22
       }
      ]
     }
    }
   }
  ],
  "steps": [
   {
    "clickSel": "[role=radio]"
   },
   {
    "fill": [
     "#ballot-first-name",
     "Probe"
    ]
   },
   {
    "fill": [
     "#ballot-email",
     "probe@example.com"
    ]
   },
   {
    "clickText": "^cast my vote$",
    "wait": 2000
   },
   {
    "clickText": "^Not right now$",
    "wait": 1200
   }
  ]
 },
 {
  "name": "CREDITS offer (Dre, Stompin)",
  "path": "/princedre/credits/stompin-thru-the-trenches?name=Probe",
  "match": "Founding Supporter"
 },
 {
  "name": "CREDITS downsell after No thanks (Dre, in place)",
  "path": "/princedre/credits/stompin-thru-the-trenches?name=Probe",
  "steps": [
   {
    "clickText": "^No thanks$",
    "wait": 1500
   }
  ],
  "inPlace": true,
  "match": "^Become a Supporter"
 },
 {
  "name": "ARTIST page Tiers tab (Dre): the top rung's button",
  "inPlace": true,
  "path": "/princedre?tab=tiers",
  "match": "Subscribe|Join"
 },
 {
  "name": "ARTIST page Shop tab (Dre): the credits link",
  "inPlace": true,
  "path": "/princedre?tab=shop",
  "match": "Founding Supporter"
 },
 {
  "name": "ALBUM page (Dre, Stompin): the whole tape",
  "path": "/princedre/album/3e372e2a-25bb-4f9c-b0ed-66715283db76",
  "match": "whole tape"
 }
];
const jobsArg = process.argv.find((a) => a.startsWith('--jobs='));
const jobs = jobsArg ? JSON.parse(fs.readFileSync(jobsArg.slice(7), 'utf8')) : DEFAULT_JOBS;
const HOST = (process.argv.find((a) => a.startsWith('--host=')) || '--host=https://thecrwn.app').slice(7);
const VIEWPORTS = [
  { name: 'phone 390x745', w: 390, h: 745, mobile: true },
  { name: 'phone 375x667', w: 375, h: 667, mobile: true },
  { name: 'laptop 1280x590', w: 1280, h: 590, mobile: false },
  { name: 'desktop 1920x872', w: 1920, h: 872, mobile: false },
];
const PORT = 9333 + Math.floor(Math.random() * 500);
const dir = path.join(os.tmpdir(), 'crwn-fold-' + PORT);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
  '--no-first-run', '--disable-extensions', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://localhost:${PORT}/json`)).json(); break; } catch { await sleep(200); }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.on('open', r));
let id = 0; const pending = new Map(); let loaded = false; let currentJob = null;
ws.on('message', (m) => {
  const msg = JSON.parse(m);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method === 'Page.loadEventFired') loaded = true;
  else if (msg.method === 'Fetch.requestPaused') {
    // NO WRITES: every non-GET /api/ request is answered locally (a job's fake body) or failed.
    const { requestId, request } = msg.params;
    const hit = (currentJob?.intercept || []).find((i) => request.url.includes(i.url));
    if (hit) {
      ws.send(JSON.stringify({ id: ++id, method: 'Fetch.fulfillRequest', params: { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(hit.body)).toString('base64') } }));
    } else if (request.method !== 'GET' && request.url.includes('/api/')) {
      ws.send(JSON.stringify({ id: ++id, method: 'Fetch.failRequest', params: { requestId, errorReason: 'BlockedByClient' } }));
    } else {
      ws.send(JSON.stringify({ id: ++id, method: 'Fetch.continueRequest', params: { requestId } }));
    }
  }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Page.enable'); await send('Network.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
const cookieDomain = new URL(HOST).hostname;
const ck = await send('Network.setCookie', { name: 'crwn_dnt', value: '1', domain: cookieDomain, path: '/', secure: HOST.startsWith('https') });
if (!ck.result?.success) { console.error('DNT cookie failed, refusing to run'); process.exit(1); }

// The primary CTA: the first full-width gold button or link in document order that is not in a
// fixed bar (the sticky bar only scrolls back to the real action). Its label is printed so a
// wrong pick is visible in the output.
const findFor = (match) => `(() => {
  const els = [...document.querySelectorAll('button, a')].filter((el) => {
    const c = el.className?.toString?.() || '';
    if (!/\\bbg-crwn-gold\\b|\\bneu-button-accent\\b/.test(c)) return false;
    if (${JSON.stringify(match || '')} && !new RegExp(${JSON.stringify(match || '')}, 'i').test(el.innerText)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 150 || r.height < 30) return false;
    for (let p = el; p; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return false;
    return true;
  });
  const el = els[0];
  if (!el) return { found: false, sticky: !!document.querySelector('.fixed.bottom-0 button') };
  const r = el.getBoundingClientRect();
  return { found: true, label: el.innerText.trim().slice(0, 40), top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + (window.__inPlace ? 0 : scrollY)), vh: innerHeight };
})()`;

for (const job of jobs) {
  currentJob = job;
  console.log(`\n== ${job.name}  ${job.path}${job.click ? `  (then click "${job.click}")` : ''}`);
  for (const vp of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 3 : 1, mobile: vp.mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile });
    await evaluate('try { sessionStorage.clear(); localStorage.clear(); } catch (e) {}');
    loaded = false;
    await send('Page.navigate', { url: HOST + job.path });
    for (let i = 0; i < 300 && !loaded; i++) await sleep(100);
    await sleep(job.settle ?? 2500);
    if (job.click) {
      const ok = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${JSON.stringify(job.click)}); if (!b) return false; b.click(); return true; })()`);
      if (!ok) { console.log(`  ${vp.name.padEnd(18)} could not find "${job.click}"`); continue; }
      await sleep(1500);
    }
    let stepFail = null;
    for (const st of job.steps || []) {
      if (st.fill) {
        const ok = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(st.fill[0])}); if (!el) return false;
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(st.fill[1])});
          el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
        if (!ok) { stepFail = 'fill ' + st.fill[0]; break; }
      } else if (st.clickSel || st.clickText) {
        const ok = await evaluate(`(() => { const b = ${st.clickSel ? `document.querySelector(${JSON.stringify(st.clickSel)})` : `[...document.querySelectorAll('button')].find((x) => new RegExp(${JSON.stringify(st.clickText)}, 'i').test(x.innerText.trim()))`}; if (!b) return false; b.click(); return true; })()`);
        if (!ok) { stepFail = 'click ' + (st.clickSel || st.clickText); break; }
      }
      await sleep(st.wait ?? 800);
    }
    if (stepFail) { console.log(`  ${vp.name.padEnd(18)} step failed: ${stepFail}`); continue; }
    if (!job.inPlace) await evaluate('window.scrollTo(0,0)');
    await sleep(300);
    await evaluate(`window.__inPlace = ${!!job.inPlace}`);
    const r = await evaluate(findFor(job.match));
    if (!r?.found) { console.log(`  ${vp.name.padEnd(18)} NO CTA FOUND${r?.sticky ? ' (sticky bar present)' : ''}`); continue; }
    const over = r.bottom - r.vh;
    console.log(`  ${vp.name.padEnd(18)} ${over <= 0 ? 'PASS' : 'FAIL'}  bottom ${String(r.bottom).padStart(5)} / fold ${r.vh}  (${over <= 0 ? `${-over}px spare` : `${over}px below`})  "${r.label}"`);
  }
}
ws.close(); chrome.kill(); process.exit(0);
