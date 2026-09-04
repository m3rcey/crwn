// Browser walk of the Rise Mode Guided Setup journey. Playwright over the installed Chromium.
//   node walk.mjs <scene> <email> <password>   scenes: rise, offer, magnet, experience, followup, stripe, funnel, test, launch, all
// Screenshots land in ./shots/<scene>-<n>-<label>[-mobile].png. Every scene starts by logging
// in and stamping the do-not-track cookie so nothing this browser does is ever counted.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = 'http://localhost:3000';
const EXE = path.join(os.homedir(), '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
const [scene, email, password, mobileArg] = process.argv.slice(2);
const MOBILE = mobileArg === 'mobile';
fs.mkdirSync('shots', { recursive: true });
let n = 0;
const log = (...a) => console.log(...a);

async function main() {
  const browser = await chromium.launch({
    executablePath: EXE,
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: path.join(os.homedir(), 'libs/root/usr/lib/x86_64-linux-gnu') },
  });
  const context = await browser.newContext({
    viewport: MOBILE ? { width: 390, height: 844 } : { width: 1280, height: 860 },
    deviceScaleFactor: 1,
    isMobile: MOBILE,
    hasTouch: MOBILE,
  });
  await context.addCookies([{ name: 'crwn_dnt', value: '1', domain: 'localhost', path: '/' }]);
  const page = await context.newPage();
  page.on('pageerror', (e) => log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/429|Failed to fetch|node_modules_/.test(m.text())) log('CONSOLE', m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 400 && !/_next|favicon/.test(r.url())) log('HTTP', r.status(), r.url().replace(BASE, '')); });

  const shot = async (label) => {
    n += 1;
    const f = `shots/${scene}-${String(n).padStart(2, '0')}-${label}${MOBILE ? '-mobile' : ''}.png`;
    await page.screenshot({ path: f, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    log(`shot ${f} url=${page.url()} hOverflow=${overflow}`);
  };
  const clickText = async (text, opts = {}) => {
    const loc = page.getByRole('button', { name: text, exact: opts.exact ?? false }).first();
    await loc.waitFor({ state: 'visible', timeout: opts.timeout ?? 15000 });
    await loc.click();
  };
  const pick = async (placeholder, optionText) => {
    // OptionSelect: a trigger button showing the placeholder or current value, then option buttons.
    await page.getByRole('button', { name: placeholder }).first().click();
    await page.getByRole('button', { name: optionText }).first().click();
  };
  const title = async () => (await page.locator('h2').first().textContent().catch(() => '')) || '';
  const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(400); };

  // ---- login ----
  await page.goto(`${BASE}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await clickText('Sign In', { exact: true });
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
  await settle();
  log('logged in ->', page.url());

  const rise = async () => {
    await page.goto(`${BASE}/profile/artist`);
    await settle();
    await page.waitForSelector('#rise-next-move-heading', { timeout: 30000 });
    await shot('rise');
    const heading = await page.locator('#rise-next-move-heading').textContent();
    const cta = page.locator('a', { hasText: 'Do it now' }).first();
    const href = await cta.getAttribute('href').catch(() => null);
    log('RISE next move:', heading?.trim(), '->', href);
    return { heading: heading?.trim(), href };
  };

  const run = {
    async rise() { await rise(); },

    async offer() {
      const r = await rise();
      await page.locator('a', { hasText: 'Do it now' }).first().click();
      await page.waitForURL(/\/build\/offer/, { timeout: 20000 });
      await settle();
      await shot('offer-open');
      log('title:', await title());
      // Screen: kind of experience
      await pick('Choose the kind of experience', 'Access');
      await shot('offer-pillar-picked');
      await clickText('Continue', { exact: true });
      await settle();
      await shot('offer-benefits');
      log('title:', await title());
      // Tick two benefits: one CRWN-delivered, one manual.
      await page.getByText('Hear music only members get', { exact: true }).first().click();
      await page.getByText('A 1-on-1 call', { exact: false }).first().click().catch(() => log('manual benefit label not found'));
      await shot('offer-benefits-picked');
      await clickText('Continue', { exact: true });
      await settle();
      log('title:', await title());
      await shot('offer-after-benefits');
      const t = await title();
      if (/keep this up/i.test(t)) { await clickText('I can keep this up'); await settle(); await shot('offer-promise'); }
      log('title:', await title());
      const ta = page.locator('textarea').first();
      const current = await ta.inputValue();
      log('promise prefill:', JSON.stringify(current));
      if (!current.trim()) await ta.fill('Hear the songs before anyone else and help pick the next single');
      await clickText('Continue', { exact: true });
      await settle();
      log('title:', await title());
      await shot('offer-downsell');
      await pick('Choose one', 'Not now');
      await clickText('Continue', { exact: true });
      await settle();
      await shot('offer-review');
      log('title:', await title());
      await clickText('Save my offer');
      await page.waitForURL(/\/profile\/artist/, { timeout: 30000 });
      await settle();
      await shot('offer-back-on-rise');
      log('after save ->', page.url());
      const r2 = await rise();
      log('resume check: reopen /build/offer');
      await page.goto(`${BASE}/build/offer?returnTo=%2Fprofile%2Fartist`);
      await settle();
      await shot('offer-reopen');
      log('reopened at:', await title());
      void r; void r2;
    },

    async magnet() {
      const r = await rise();
      if (!/build\/magnet/.test(r.href || '')) log('NOTE: next move is not the magnet; walking /build/magnet directly');
      await page.goto(`${BASE}/build/magnet?returnTo=%2Fprofile%2Fartist`);
      await settle();
      await shot('magnet-open');
      log('title:', await title());
      await pick('What do fans get?', 'One of my tracks');
      await clickText('Continue', { exact: true });
      await settle();
      await shot('magnet-detail');
      log('title:', await title());
      await pick('Pick a track', 'QA Demo (unreleased)');
      await clickText('Continue', { exact: true });
      await settle();
      log('title:', await title());
      await page.locator('input[placeholder*="Midnight Tape"]').fill('Unreleased: the late drive demo');
      await shot('magnet-title');
      await clickText('Continue', { exact: true });
      await settle();
      log('title:', await title());
      await page.locator('textarea').first().fill('A demo nobody outside the room has heard.');
      await clickText('Continue', { exact: true });
      await settle();
      await shot('magnet-review');
      log('title:', await title());
      await clickText('Save my gift');
      await page.waitForURL(/\/profile\/artist/, { timeout: 30000 });
      await settle();
      const r2 = await rise();
      log('after magnet, next move:', r2.heading);
      await page.goto(`${BASE}/build/magnet?returnTo=%2Fprofile%2Fartist`);
      await settle();
      await shot('magnet-reopen');
      log('reopened at:', await title());
      const previewLink = page.locator('a', { hasText: 'Open the real page as a preview' });
      const href = await previewLink.getAttribute('href').catch(() => null);
      log('preview link:', href);
      if (href) {
        const p2 = await context.newPage();
        await p2.goto(`${BASE}${href}`);
        await p2.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        await p2.screenshot({ path: `shots/${scene}-preview-drop${MOBILE ? '-mobile' : ''}.png`, fullPage: true });
        log('drop preview status text present:', await p2.getByText('Preview. Only you can see this').count());
        await p2.close();
      }
    },

    async experience() {
      const r = await rise();
      log('next move before experience:', r.heading, r.href);
      await page.goto(`${BASE}/build/experience?returnTo=%2Fprofile%2Fartist`);
      await settle();
      await shot('exp-open');
      log('opened at:', await title());
      // Title-driven: whichever screen the flow resumes at, walk to publish.
      let benefitIdx = 0;
      for (let guard = 0; guard < 16; guard++) {
        const t = await title();
        if (/What does a fan get by joining/.test(t)) {
          log('promise prefill:', JSON.stringify(await page.locator('input').first().inputValue()), 'description:', JSON.stringify(await page.locator('textarea').first().inputValue()));
          await clickText('Continue', { exact: true });
        } else if (/What does the button say/.test(t)) {
          const ctaInput = page.getByPlaceholder('What the fan gets by pressing it');
          await ctaInput.fill('Join Gold');
          await shot('exp-cta-refused');
          log('Continue disabled for "Join Gold":', await page.getByRole('button', { name: 'Continue', exact: true }).isDisabled());
          log('refusal shown:', await page.getByText('Join, Subscribe, Upgrade and the tier name are refused').count());
          await page.locator('button:has-text("Write my own"), button:has-text("Pick a button")').first().click();
          await page.getByRole('button', { name: 'Unlock everything inside' }).first().click();
          log('cta now:', await ctaInput.inputValue());
          await shot('exp-cta');
          await clickText('Continue', { exact: true });
        } else if (/Here is what fans get/.test(t)) {
          await shot('exp-benefits');
          await clickText('Continue', { exact: true });
        } else if (/How should fans see what/.test(t)) {
          await shot(`exp-benefit-${benefitIdx}`);
          const options = (await page.getByRole('button').allTextContents()).filter((o) => /real thing|artwork|example|words/i.test(o));
          log('  ', t.slice(0, 60), '| choices:', options.join(' | '));
          const trigger = page.getByRole('button', { name: /How should fans see it\?|Show the real thing|Use my artwork|Show a labelled example|Leave it as words/ }).first();
          await trigger.click();
          const real = page.getByRole('button', { name: /Show the real thing/ });
          if (benefitIdx === 0 && (await real.count())) await real.first().click();
          else await page.getByRole('button', { name: /Show a labelled example/ }).first().click();
          benefitIdx += 1;
          await shot(`exp-benefit-${benefitIdx}-picked`);
          await clickText('Continue', { exact: true });
        } else if (/Add a video/.test(t)) {
          await shot('exp-vsl');
          await clickText('No video');
        } else if (/obvious questions/.test(t)) {
          await shot('exp-faq');
          await clickText('Continue', { exact: true });
        } else if (/page fans will see/.test(t)) {
          await shot('exp-preview');
          await clickText('Continue', { exact: true });
        } else if (/Publish it/.test(t)) {
          await shot('exp-publish');
          await clickText('Publish my sales page');
          break;
        } else {
          log('unknown experience screen:', t);
          await shot('exp-unknown');
          break;
        }
        await settle();
      }
      await page.waitForURL(/\/profile\/artist/, { timeout: 30000 });
      await settle();
      const r2 = await rise();
      log('after publish, next move:', r2.heading);
      await page.goto(`${BASE}/build/experience?returnTo=%2Fprofile%2Fartist`);
      await settle();
      log('reopened at:', await title());
      await shot('exp-reopen');
    },

    async followup() {
      const r = await rise();
      log('next move before followup:', r.heading, r.href);
      await page.goto(`${BASE}/build/followup?returnTo=%2Fprofile%2Fartist`);
      await settle();
      await shot('fu-open');
      log('title:', await title());
      await clickText('Continue', { exact: true });
      await settle();
      for (let i = 0; i < 5; i++) {
        log('title:', await title());
        if (i === 0) await shot('fu-message-1');
        const subject = await page.locator('input').first().inputValue();
        const body = await page.locator('textarea').first().inputValue();
        log(`  message ${i + 1} subject: ${JSON.stringify(subject)} body chars: ${body.length}`);
        await clickText('Continue', { exact: true });
        await settle();
      }
      await shot('fu-review');
      log('title:', await title());
      await clickText('Turn it on');
      await page.waitForURL(/\/profile\/artist/, { timeout: 30000 });
      await settle();
      const r2 = await rise();
      log('after followup, next move:', r2.heading);
      await page.goto(`${BASE}/build/followup?returnTo=%2Fprofile%2Fartist`);
      await settle();
      log('reopened at:', await title());
      await shot('fu-reopen');
    },

    async stripe() {
      const r = await rise();
      log('next move:', r.heading, r.href);
      await page.locator('a', { hasText: 'Do it now' }).first().click();
      await settle();
      await shot('stripe-landing');
      log('landed:', page.url(), 'connect control present:', await page.getByText('Connect with Stripe').count());
    },

    async funnel() {
      const r = await rise();
      log('next move:', r.heading, r.href);
      await page.goto(`${BASE}/build/funnel?returnTo=%2Fprofile%2Fartist`);
      await settle();
      await shot('funnel-open');
      log('title:', await title());
      for (let i = 0; i < 5; i++) {
        const t = await title();
        if (/Confirm the path/.test(t)) break;
        if (/standout item/i.test(t)) {
          await page.locator('input').first().fill('The full session vault');
          await page.locator('textarea').first().fill('Every take, every alternate mix.');
        }
        if (/follows up/i.test(t)) { await shot('funnel-nurture'); }
        await clickText('Continue', { exact: true });
        await settle();
      }
      await shot('funnel-review');
      log('title:', await title());
      const text = await page.locator('main, body').first().innerText();
      log('review mentions ids?', /[0-9a-f]{8}-[0-9a-f]{4}-/.test(text));
      await clickText('Turn it on');
      await page.waitForTimeout(2500);
      await shot('funnel-after-turn-on');
      log('url after turn on:', page.url());
      const r2 = await rise();
      log('after funnel, next move:', r2.heading);
    },

    async test() {
      const r = await rise();
      log('next move:', r.heading, r.href);
      await page.goto(`${BASE}/build/test?returnTo=%2Fprofile%2Fartist`);
      await settle();
      await shot('test-machine');
      log('title:', await title());
      const fails = await page.locator('button:has-text("Fix it")').count();
      log('failing machine checks with a fix link:', fails);
      await page.locator('button:has-text("Continue")').first().click();
      await settle();
      await shot('test-manual');
      const boxes = page.locator('input[type=checkbox]');
      log('checkboxes:', await boxes.count(), 'button disabled before ticking:', await page.getByRole('button', { name: /I checked both/ }).isDisabled().catch(() => 'n/a'));
      for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
      await shot('test-ticked');
      await clickText('I checked both');
      await page.waitForURL(/\/profile\/artist/, { timeout: 30000 }).catch(() => log('did not return to Rise'));
      await settle();
      const r2 = await rise();
      log('after test, next move:', r2.heading);
    },

    async launch() {
      const r = await rise();
      log('next move:', r.heading, r.href);
      await page.goto(`${BASE}/build/launch?returnTo=%2Fprofile%2Fartist`);
      await settle();
      await shot('launch-link');
      log('title:', await title());
      const urlText = await page.locator('p.break-all').first().textContent().catch(() => null);
      log('funnel url shown:', urlText);
      await clickText('Copy the link');
      await page.waitForTimeout(800);
      await clickText('Continue', { exact: true });
      await settle();
      await pick('Choose one', 'My bio link');
      await clickText('Continue', { exact: true });
      await settle();
      await shot('launch-bio');
      await clickText('Copy the link');
      await page.waitForTimeout(800);
      await clickText('Done, back to Rise Mode');
      await page.waitForURL(/\/profile\/artist/, { timeout: 30000 });
      await settle();
      const r2 = await rise();
      log('after launch, next move:', r2.heading);
    },
  };

  run.mobile = async () => {
    // Layout pass: every guided surface at the current viewport, resumed wherever the rows put it.
    const urls = ['/profile/artist', '/build/offer', '/build/magnet', '/build/experience', '/build/followup', '/build/funnel', '/build/test', '/build/launch'];
    for (const u of urls) {
      await page.goto(`${BASE}${u}${u.startsWith('/build') ? '?returnTo=%2Fprofile%2Fartist' : ''}`);
      await settle();
      await page.waitForTimeout(800);
      const name = u.replace(/\//g, '_').replace(/^_/, '');
      await shot(name);
      const footer = await page.locator('button:has-text("Continue"), button:has-text("Save"), button:has-text("Turn it on"), button:has-text("Publish"), button:has-text("I checked both"), button:has-text("Done"), a:has-text("Do it now")').first().boundingBox().catch(() => null);
      const vp = page.viewportSize();
      log(`${u} title="${(await title()).slice(0, 50)}" primaryButtonInViewport=${footer ? footer.y + footer.height <= vp.height && footer.y >= 0 : 'n/a'}`);
    }
  };

  run.security = async () => {
    // Foreign pointers via URL, query and body, using THIS session. Everything must be ignored
    // or refused server-side, with nothing private in any response.
    const [gbArtistId, gbTierId, gbAutomationId] = (process.env.GB_IDS || '').split(',');
    const api = async (method, url, body) => {
      const res = await page.request.fetch(`${BASE}${url}`, { method, data: body, headers: body ? { 'Content-Type': 'application/json' } : {} });
      const text = await res.text();
      return { status: res.status(), text: text.slice(0, 160) };
    };
    log('GET foreign funnel list:', JSON.stringify(await api('GET', `/api/fan-automations?artistId=${gbArtistId}`)));
    log('PATCH foreign automation (own artistId):', JSON.stringify(await api('PATCH', `/api/fan-automations/${gbAutomationId}`, { artistId: process.env.QA_ARTIST_ID, action: 'activate' })));
    log('PATCH foreign automation (foreign artistId):', JSON.stringify(await api('PATCH', `/api/fan-automations/${gbAutomationId}`, { artistId: gbArtistId, action: 'pause' })));
    log('PUT experience on foreign tier:', JSON.stringify(await api('PUT', '/api/tier-offer-experiences', { tierId: gbTierId, config: { promise: 'x', description: 'y', cta: 'Hear it first' } })));
    log('PUT experience with a Join button on own tier:', JSON.stringify(await api('PUT', '/api/tier-offer-experiences', { tierId: process.env.QA_TIER_ID, config: { promise: 'x', description: 'y', cta: 'Join Gold' } })));
    const mine = await api('GET', '/api/tier-offer-experiences');
    log('GET own experiences leaks foreign tier?', mine.text.includes(gbTierId), 'status', mine.status);
    log('POST benefits on foreign tier:', JSON.stringify(await api('POST', '/api/tier-benefits', { tier_id: gbTierId, benefits: [] })));
    log('POST sequence with foreign goal tier:', JSON.stringify(await api('POST', '/api/sequences', { artistId: process.env.QA_ARTIST_ID, name: 'x', triggerType: 'free_join', steps: [{ delay_days: 0, subject: 's', body: 'b' }], goalTierId: gbTierId })));
    log('POST milestone with an unknown key:', JSON.stringify(await api('POST', '/api/artist/milestone', { milestone: 'first_subscriber_totally' })));
    // Pointer in the URL: a foreign tier on the sales-page flow must fall back to the artist's own tier.
    await page.goto(`${BASE}/build/experience?tier=${gbTierId}&returnTo=%2Fprofile%2Fartist`);
    await settle();
    const body = await page.locator('body').innerText();
    log('experience with foreign ?tier= shows own tier (Gold, $25):', /gold/i.test(body) && /\$25/.test(body), 'mentions Platinum or $50?', /platinum|\$50/i.test(body));
    await page.goto(`${BASE}/build/magnet?funnel=${gbAutomationId}&returnTo=%2Fprofile%2Fartist`);
    await settle();
    const body2 = await page.locator('body').innerText();
    log('magnet with foreign ?funnel= shows own gift:', /late drive demo/.test(body2), 'mentions GB gift?', /Go Bad/i.test(body2));
    await page.goto(`${BASE}/build/offer?returnTo=https%3A%2F%2Fevil.example%2F`);
    await settle();
    await page.locator('button[aria-label="Back to Rise Mode"]').click();
    await page.waitForTimeout(1500);
    log('off-site returnTo refused, landed on:', page.url());
    // Draft drop page: someone else's draft must 404 for this session. (GB's funnel is live, so
    // probe a nonsense token and the QA artist's own live token instead of a foreign draft.)
    const r404 = await page.request.get(`${BASE}/drop/not-a-real-token`);
    log('unknown drop token status:', r404.status());
  };

  run.a11y = async () => {
    const urls = ['/build/offer', '/build/experience', '/build/test', '/build/launch'];
    for (const u of urls) {
      await page.goto(`${BASE}${u}?returnTo=%2Fprofile%2Fartist`);
      await settle();
      await page.waitForTimeout(600);
      const report = await page.evaluate(() => {
        const unlabeled = [...document.querySelectorAll('input:not([type=hidden]), textarea')].filter((el) => {
          const id = el.getAttribute('id');
          const byFor = id && document.querySelector(`label[for="${id}"]`);
          const wrapped = el.closest('label');
          return !(byFor || wrapped || el.getAttribute('aria-label') || el.getAttribute('placeholder'));
        }).length;
        const unnamedButtons = [...document.querySelectorAll('button')].filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length;
        const h2 = document.querySelector('h2')?.textContent?.trim() || '';
        return { unlabeled, unnamedButtons, h2 };
      });
      // Keyboard: Tab until the primary button has focus, then read what has focus.
      let focused = '';
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        focused = await page.evaluate(() => {
          const a = document.activeElement;
          return a ? `${a.tagName.toLowerCase()}:${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 30)}` : '';
        });
        if (/button:(Continue|Save|Publish|Turn it on|I checked both|Done|Continue anyway|Back to Rise Mode)/.test(focused)) break;
      }
      log(`${u} h2="${report.h2.slice(0, 40)}" unlabeledFields=${report.unlabeled} unnamedButtons=${report.unnamedButtons} tabReached=${focused}`);
    }
  };

  run.dataChange = async () => {
    // The underlying row changed outside the flow: Rise must reopen the move, the flow must resume on it.
    const r = await rise();
    log('after external change, next move:', r.heading, r.href);
    await page.goto(`${BASE}/build/followup?returnTo=%2Fprofile%2Fartist`);
    await settle();
    await shot('followup-after-change');
    log('follow-up flow reopened at:', await title(), 'continue label:', await page.locator('button:has-text("Turn it on"), button:has-text("Save and keep it on")').first().textContent().catch(() => 'n/a'));
  };

  if (scene === 'all') { for (const s of Object.keys(run)) await run[s](); }
  else if (run[scene]) await run[scene]();
  else log('unknown scene', scene);

  await browser.close();
}

main().catch((e) => { log('WALK FAILED', e.message); process.exit(1); });
