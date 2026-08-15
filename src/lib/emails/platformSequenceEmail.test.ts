// Two jobs, deliberately together.
//
// 1. ALWAYS: unit-test the renderer. It is the only thing standing between stored plain text and an
//    artist's inbox, and the version it replaced interpolated a user-controlled name straight into
//    HTML.
// 2. WITH `PREVIEW_PLATFORM_EMAILS=1` and service-role creds: fetch the LIVE copy and write
//    `platform-emails-preview.html` so a human can look at all 27.
//
// The preview is opt-in so `npm test` never touches the network or writes files.
//   npm run preview:platform-emails

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { renderPlatformSequenceEmail, resolvePlatformTokens } from './platformSequenceEmail';

const TOKENS = {
  first_name: 'Ari',
  full_name: 'Ari Snow',
  artist_slug: 'arisnow',
  platform_tier: 'starter',
  dashboard_url: 'https://thecrwn.app/profile/artist',
  connect_stripe_url: 'https://thecrwn.app/account/payouts',
  upgrade_url: 'https://thecrwn.app/account/billing',
};

describe('platform sequence renderer', () => {
  it('escapes a user-controlled token instead of interpolating it raw', () => {
    // first_name comes from profiles.display_name, which the artist sets. The inline template this
    // replaced put the resolved body straight into the markup.
    const r = renderPlatformSequenceEmail('Hi {{first_name}}', 'Hey {{first_name}},', {
      ...TOKENS,
      first_name: '<img src=x onerror=alert(1)>',
    });
    expect(r.html).not.toContain('<img src=x');
    expect(r.html).toContain('&lt;img');
    // The subject is not HTML, so it stays literal there.
    expect(r.subject).toContain('<img src=x');
  });

  it('renders consecutive bullet lines as one list, not as spaced paragraphs', () => {
    const body = 'Intro line\n\n- One\n- Two\n- Three\n\nOutro line';
    const r = renderPlatformSequenceEmail('s', body, TOKENS);
    expect(r.html).toContain('<ul');
    expect((r.html.match(/<li/g) ?? []).length).toBe(3);
    // The old behaviour: every line its own <p>, so bullets read as unrelated sentences.
    expect(r.html).not.toMatch(/<p[^>]*>- One/);
  });

  it('links a bare URL on its own line', () => {
    const r = renderPlatformSequenceEmail('s', 'Go here:\n\nhttps://thecrwn.app/account/tiers', TOKENS);
    expect(r.html).toContain('<a href="https://thecrwn.app/account/tiers"');
  });

  it('leaves an unknown token visible rather than blanking the sentence', () => {
    expect(resolvePlatformTokens('Hey {{nope}},', TOKENS)).toBe('Hey {{nope}},');
  });

  it('returns a plain-text part so the send can be multipart', () => {
    const r = renderPlatformSequenceEmail('s', 'Line one\n\nLine two', TOKENS);
    expect(r.text).toContain('Line one');
    expect(r.text).toContain('Line two');
    expect(r.text).not.toContain('<p');
  });

  it('resolves every token the cron supplies', () => {
    const body = Object.keys(TOKENS)
      .map((k) => `{{${k}}}`)
      .join('\n');
    const r = renderPlatformSequenceEmail('s', body, TOKENS);
    expect(r.text).not.toMatch(/\{\{\w+\}\}/);
  });
});

describe('these emails may never ship without an opt-out or a suppression gate', () => {
  const cron = fs.readFileSync(
    path.resolve(__dirname, '../../app/api/cron/platform-sequences/route.ts'),
    'utf-8',
  );

  it('renders an unsubscribe link in both the HTML and the text part', () => {
    const r = renderPlatformSequenceEmail('s', 'Body line', TOKENS, 'https://thecrwn.app/api/platform-sequences/unsubscribe/abc?t=sig');
    expect(r.html).toContain('Unsubscribe from onboarding emails');
    expect(r.html).toContain('unsubscribe/abc?t=sig');
    expect(r.text).toContain('Unsubscribe from onboarding emails: https://');
  });

  it('checks GLOBAL suppression before every send, not only at enrollment', () => {
    // This gate did not exist. An artist who unsubscribed anywhere else, or who hard-bounced, kept
    // receiving these. An unsubscribe can also land mid-sequence, so enrollment-time is too early.
    expect(cron).toContain('isEmailSuppressed');
    expect(cron).toMatch(/isEmailSuppressed\([\s\S]{0,60}artistEmail\)/);
  });

  it('passes a SIGNED unsubscribe url to the renderer on every send', () => {
    expect(cron).toContain('appendUnsubscribeToken');
    expect(cron).toContain("kind: 'platform-sequence'");
    // The signature must cover the recipient, or one artist's token unsubscribes another.
    expect(cron).toContain('emailRecipient(artistEmail)');
    expect(cron).toMatch(/renderPlatformSequenceEmail\([\s\S]{0,120}unsubscribeUrl\)/);
  });

  it('sets the RFC 8058 one-click headers', () => {
    expect(cron).toContain("'List-Unsubscribe'");
    expect(cron).toContain("'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'");
  });

  it('sends multipart, not HTML only', () => {
    expect(cron).toMatch(/html,\s*[\s\S]{0,200}text,/);
  });
});

describe('live copy preview', () => {
  it('writes the browsable preview when asked', async () => {
    if (process.env.PREVIEW_PLATFORM_EMAILS !== '1') return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sequences } = await db.from('platform_sequences').select('id,name,trigger_type,is_active');
    const { data: steps } = await db
      .from('platform_sequence_steps')
      .select('sequence_id,step_number,delay_days,subject,body');
    const by = Object.fromEntries((sequences ?? []).map((s) => [s.id, s]));
    const ordered = (steps ?? []).sort(
      (a, b) =>
        (by[a.sequence_id]?.trigger_type ?? '').localeCompare(by[b.sequence_id]?.trigger_type ?? '') ||
        a.step_number - b.step_number,
    );

    const esc = (s: string) =>
      String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

    const cards = ordered.map((s, i) => {
      const seq = by[s.sequence_id] ?? {};
      const r = renderPlatformSequenceEmail(s.subject, s.body, TOKENS);
      return `<a id="e${i}"></a><section class="e">
  <div class="meta"><span class="trig">${esc(seq.trigger_type ?? '?')}</span>
  <span class="num">step ${s.step_number}</span><span class="num">sends d+${s.delay_days}</span>
  ${seq.is_active ? '' : '<span class="off">SEQUENCE OFF</span>'}</div>
  <h2>${esc(r.subject)}</h2>
  <div class="panes">
    <div><div class="lbl">As it renders</div><iframe srcdoc="${esc(r.html)}" loading="lazy"></iframe></div>
    <div><div class="lbl">Plain text part</div><pre>${esc(r.text)}</pre></div>
  </div></section>`;
    });

    const page = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>CRWN platform emails</title><style>
body{margin:0;background:#0b0b0c;color:#e8e8ea;font:15px/1.6 Inter,system-ui,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:26px;margin:0 0 6px}.sub{color:#8a8a9a;margin:0 0 26px}
.toc{background:#141416;border:1px solid #26262a;border-radius:12px;padding:14px 18px;margin-bottom:34px}
.toc a{color:#D4AF37;text-decoration:none;display:block;padding:3px 0;font-size:14px}
.e{background:#141416;border:1px solid #26262a;border-radius:14px;padding:22px;margin-bottom:26px}
.meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.trig{background:#D4AF37;color:#111;font-weight:700;border-radius:999px;padding:2px 12px;font-size:12px}
.num{color:#8a8a9a;font-size:12px}
.off{background:#5a1b1b;color:#ffb4b4;border-radius:999px;padding:2px 10px;font-size:11px}
h2{margin:4px 0 12px;font-size:19px}
.panes{display:grid;grid-template-columns:620px 1fr;gap:18px}
@media(max-width:1060px){.panes{grid-template-columns:1fr}}
.lbl{color:#6a6a78;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
iframe{width:100%;height:640px;border:1px solid #26262a;border-radius:10px;background:#0D0D0D}
pre{white-space:pre-wrap;background:#0f0f10;border:1px solid #26262a;border-radius:10px;padding:14px;color:#b8b8c2;font-size:12.5px;max-height:640px;overflow:auto}
</style></head><body><div class="wrap">
<h1>CRWN platform sequence emails</h1>
<p class="sub">${ordered.length} steps across ${(sequences ?? []).length} sequences, rendered from the LIVE database through the same renderer the cron sends with. This page sends nothing.</p>
<div class="toc">${ordered
      .map(
        (s, i) =>
          `<a href="#e${i}">${esc(by[s.sequence_id]?.trigger_type ?? '?')} step ${s.step_number} &nbsp; ${esc(s.subject)}</a>`,
      )
      .join('')}</div>
${cards.join('')}</div></body></html>`;

    const out = path.resolve('platform-emails-preview.html');
    fs.writeFileSync(out, page);
    // eslint-disable-next-line no-console
    console.log(`\n  Wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${ordered.length} emails)\n`);
    expect(ordered.length).toBeGreaterThan(0);
  }, 60_000);
});
