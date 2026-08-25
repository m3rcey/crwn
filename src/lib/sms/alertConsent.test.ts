import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { readStripped } from '@/lib/architecture/sourceScan';
import { join } from 'path';
import {
  ALERT_CONSENT_BRAND,
  ALERT_CONSENT_FOOTNOTE,
  ALERT_CONSENT_SOURCE,
  ALERT_CONSENT_TEXT,
  ALERT_CONSENT_VERSION,
  buildAlertConsentRecord,
  decideAlertConsent,
  maskPhone,
} from './alertConsent';

// The public consent page at /sms-alert-consent and the route behind it.
//
// Twilio refused "we hold a signed paper form" as an opt-in description and asked to SEE the
// consent experience, so this page IS the campaign's opt-in evidence. Its failure mode is the
// same silent, external one the legal pages have: a disclosure quietly edited out does not break
// the product, it breaks a carrier review nobody is watching.

const root = process.cwd();
const page = readFileSync(join(root, 'src/app/(public)/sms-alert-consent/page.tsx'), 'utf-8');
const form = readFileSync(join(root, 'src/components/sms/AlertConsentForm.tsx'), 'utf-8');
const route = readFileSync(join(root, 'src/app/api/sms-alert-consent/route.ts'), 'utf-8');
const migration = readFileSync(
  join(root, 'supabase/schema-phase2-internal-sms-alert-consent.sql'),
  'utf-8',
);

describe('CONSENT-001 the page is publicly reachable and reviewer-legible', () => {
  it('lives under (public) and is not behind the middleware protected-path allowlist', () => {
    expect(existsSync(join(root, 'src/app/(public)/sms-alert-consent/page.tsx'))).toBe(true);
    const middleware = readFileSync(join(root, 'src/middleware.ts'), 'utf-8');
    const protectedPaths = middleware.match(/const protectedPaths = \[([\s\S]*?)\]/)?.[1] ?? '';
    expect(protectedPaths).not.toContain('sms-alert-consent');
  });

  it('needs no session: the page and its form never gate on auth', () => {
    for (const [name, src] of [['page', page], ['form', form]] as const) {
      for (const gate of ['useAuth', 'getUser(', 'redirect(', 'requireAdmin']) {
        expect(src, `${name} gates on ${gate}`).not.toContain(gate);
      }
    }
  });

  it('identifies the sending brand and the CRWN platform', () => {
    expect(ALERT_CONSENT_BRAND).toBe('JNW Creative Enterprises, Inc.');
    expect(page).toContain('ALERT_CONSENT_BRAND');
    expect(page).toContain('operating the CRWN platform (thecrwn.app)');
  });

  it('links the privacy policy and the terms', () => {
    expect(page).toContain('href="/privacy"');
    expect(page).toContain('href="/terms"');
    expect(form).toContain('href="/privacy"');
    expect(form).toContain('href="/terms"');
  });
});

describe('CONSENT-002 the disclosure carries every element Twilio vets', () => {
  it('the checkbox label names sender, program, frequency, rates, STOP and HELP', () => {
    expect(ALERT_CONSENT_TEXT).toContain('JNW Creative Enterprises, Inc.');
    expect(ALERT_CONSENT_TEXT).toContain('low-volume internal CRWN operational lead alerts by SMS');
    expect(ALERT_CONSENT_TEXT).toContain('at the mobile number I provide');
    expect(ALERT_CONSENT_TEXT).toContain('Message frequency varies.');
    expect(ALERT_CONSENT_TEXT).toContain('Message and data rates may apply.');
    expect(ALERT_CONSENT_TEXT).toContain('Reply STOP to opt out or HELP for help.');
  });

  it('states that consent is not a condition of purchase', () => {
    expect(ALERT_CONSENT_FOOTNOTE.toLowerCase()).toContain('not a condition of purchase');
  });

  it('the page repeats the disclosures outside the checkbox, for a reviewer skimming', () => {
    for (const phrase of [
      'Message frequency varies',
      'Message and data rates may apply',
      'Reply STOP',
      'Reply HELP',
      'are not recipients of this program',
    ]) {
      expect(page, `page missing "${phrase}"`).toContain(phrase);
    }
  });

  it('renders the same constant the server stores, never a retyped copy', () => {
    // If the form hardcoded its own sentence, what a person saw and what the record says could
    // drift, and the stored consent would stop being evidence of anything.
    expect(form).toContain('{ALERT_CONSENT_TEXT}');
    expect(form).toContain("from '@/lib/sms/alertConsent'");
  });
});

describe('CONSENT-003 the checkbox is unchecked by default and gates submission', () => {
  it('consent state initialises to false and is never programmatically checked', () => {
    // A pre-selected box is not consent, and Twilio names it as a rejection cause.
    expect(form).toContain('useState(false)');
    expect(form).not.toMatch(/checked=\{true\}|defaultChecked|useState\(true\)/);
  });

  it('submit is disabled until the number looks valid and the box is ticked', () => {
    expect(form).toContain('phoneLooksValid && consent');
    expect(form).toContain('disabled={!canSubmit}');
  });
});

describe('CONSENT-004 the server is the gate, not the browser', () => {
  it('refuses when the consent box was not checked', () => {
    expect(decideAlertConsent({ phone: '3145551234', consent: false })).toEqual({
      ok: false,
      reason: 'consent_required',
    });
    expect(decideAlertConsent({ phone: '3145551234' }).reason).toBe('consent_required');
    // A truthy non-boolean is not a tick.
    expect(decideAlertConsent({ phone: '3145551234', consent: 'yes' }).reason).toBe('consent_required');
    expect(decideAlertConsent({ phone: '3145551234', consent: 1 }).reason).toBe('consent_required');
  });

  it('checks consent BEFORE the phone number', () => {
    // An unchecked box is a refusal. Reporting it back as a bad number would be a lie about
    // which of the two things the person got wrong.
    expect(decideAlertConsent({ phone: 'nonsense', consent: false }).reason).toBe('consent_required');
  });

  it('refuses an invalid phone number', () => {
    for (const bad of ['', '555', 'abcdefghij', '123456789', null, undefined, 42]) {
      expect(decideAlertConsent({ phone: bad, consent: true }).ok, String(bad)).toBe(false);
    }
    expect(decideAlertConsent({ phone: '555', consent: true }).reason).toBe('invalid_phone');
  });

  it('accepts a valid submission and normalizes to E.164 server-side', () => {
    expect(decideAlertConsent({ phone: '(314) 555-1234', consent: true })).toEqual({
      ok: true,
      phone: '+13145551234',
    });
    expect(decideAlertConsent({ phone: '+447700900123', consent: true }).phone).toBe('+447700900123');
  });

  it('reuses the existing normalizer rather than inventing a second phone standard', () => {
    const lib = readFileSync(join(root, 'src/lib/sms/alertConsent.ts'), 'utf-8');
    expect(lib).toContain("import { normalizeCallbackPhone } from '@/lib/acquisition/callRequest'");
  });

  it('the route enforces the same gate and never trusts client consent text', () => {
    expect(route).toContain('decideAlertConsent(body)');
    // The stored disclosure comes from the module, and the route reads only the boolean.
    expect(route).toContain('buildAlertConsentRecord');
    expect(route).not.toMatch(/body\.consentText|body\.consent_text|body\.version/);
  });
});

describe('CONSENT-005 the stored record is server-owned and minimal', () => {
  it('stores the server disclosure, the version, the source, time and IP', () => {
    const rec = buildAlertConsentRecord('+13145551234', '203.0.113.7', 'Mozilla/5.0');
    expect(rec.phone_e164).toBe('+13145551234');
    expect(rec.consent_text).toBe(ALERT_CONSENT_TEXT);
    expect(rec.consent_version).toBe(ALERT_CONSENT_VERSION);
    expect(rec.source).toBe(ALERT_CONSENT_SOURCE);
    expect(rec.source).toContain('/sms-alert-consent');
    expect(rec.ip_address).toBe('203.0.113.7');
    // created_at is the database default, so the row cannot be backdated by the caller.
    expect(migration).toContain('created_at timestamptz NOT NULL DEFAULT now()');
  });

  it('collects nothing beyond the compliance minimum', () => {
    const rec = buildAlertConsentRecord('+13145551234', null, null);
    expect(Object.keys(rec).sort()).toEqual(
      ['consent_text', 'consent_version', 'ip_address', 'phone_e164', 'source', 'user_agent'].sort(),
    );
    // No name, email, account, role or staff metadata anywhere in the write path.
    for (const field of ['name', 'email', 'user_id', 'artist_id', 'role', 'department']) {
      expect(Object.keys(rec), `record carries ${field}`).not.toContain(field);
    }
  });

  it('bounds the free-text evidence fields', () => {
    const rec = buildAlertConsentRecord('+13145551234', 'x'.repeat(500), 'y'.repeat(900));
    expect(rec.ip_address!.length).toBe(64);
    expect(rec.user_agent!.length).toBe(256);
  });

  it('masks phone numbers for logging', () => {
    expect(maskPhone('+13145551234')).toBe('••••1234');
    expect(maskPhone('+13145551234')).not.toContain('314555');
  });

  it('the version is stamped so a stored row names the words that person saw', () => {
    expect(ALERT_CONSENT_VERSION).toMatch(/^internal-sms-alert-consent-\d{4}-\d{2}-\d{2}\.v\d+$/);
  });
});

describe('CONSENT-006 the form sends no SMS and exposes no SMS capability', () => {
  it('the route holds no Twilio client, credential, or send call', () => {
    for (const mark of [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_PHONE_NUMBER',
      'api.twilio.com',
      'Messages.json',
      'messages.create',
      'sendSms',
    ]) {
      expect(route, `route references ${mark}`).not.toContain(mark);
    }
  });

  it('no message body or destination is constructed anywhere in the flow', () => {
    // Comment-stripped, deliberately: the route's comments EXPLAIN that it holds no Twilio
    // client, and a rule that forbids naming a thing also forbids documenting its absence.
    // What must not exist is the capability in the CODE.
    for (const f of [
      'src/app/api/sms-alert-consent/route.ts',
      'src/components/sms/AlertConsentForm.tsx',
      'src/app/(public)/sms-alert-consent/page.tsx',
    ]) {
      expect(readStripped(f), `${f} builds an SMS`).not.toMatch(/twilio/i);
    }
  });

  it('the page tells the person plainly that submitting sends nothing', () => {
    expect(form).toContain('It does not send a text message.');
  });

  it('is scoped to this one consent, not a generic SMS consent API', () => {
    // The purpose, disclosure and version are server constants, so this endpoint cannot be
    // repurposed to record arbitrary consent text for an arbitrary program.
    expect(route).toContain("from('internal_sms_alert_consents')");
    expect(route).not.toMatch(/body\.(program|campaign|purpose|table|source)/);
  });
});

describe('CONSENT-007 abuse and exposure controls', () => {
  it('rate limits by IP and by phone number', () => {
    expect(route).toContain("checkRateLimit(`ip:${ip}`, 'sms-alert-consent'");
    expect(route).toContain("checkRateLimit(`phone:${phone}`, 'sms-alert-consent-phone'");
  });

  it('bounds the request body', () => {
    expect(route).toContain('MAX_BODY_BYTES');
  });

  it('never reads consent records back, and GET serves nothing', () => {
    expect(route).not.toMatch(/\.select\(/);
    expect(route).toContain("{ error: 'Method not allowed' }, { status: 405 }");
  });

  it('never logs a full phone number', () => {
    // The only console lines carry maskPhone() or no number at all.
    const consoleLines = route.split('\n').filter((l) => l.includes('console.'));
    expect(consoleLines.length).toBeGreaterThan(0);
    const block = route.match(/console\.error\([\s\S]*?\);/g)?.join('\n') ?? '';
    expect(block).not.toMatch(/\$\{phone\}|record\.phone_e164/);
  });

  it('keeps no founder phone number or Twilio secret in client code', () => {
    for (const [name, src] of [['form', form], ['page', page]] as const) {
      expect(src, `${name} leaks a secret`).not.toMatch(/NEXT_PUBLIC_TWILIO|AUTH_TOKEN|\+1\d{10}/);
    }
  });
});

describe('CONSENT-008 the consent log is closed to the public at the database', () => {
  it('enables RLS, declares no policy, and revokes anon and authenticated by name', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON internal_sms_alert_consents FROM anon;');
    expect(migration).toContain('REVOKE ALL ON internal_sms_alert_consents FROM authenticated;');
    // REVOKE FROM PUBLIC alone does not remove Supabase's per-role grants.
    expect(migration).toContain('REVOKE ALL ON internal_sms_alert_consents FROM PUBLIC;');
    expect(migration).not.toMatch(/CREATE POLICY/);
  });

  it('ends with a self-verify block that fails loudly on a partial apply', () => {
    expect(migration).toContain('DO $$');
    expect(migration).toContain('RAISE EXCEPTION');
    expect(migration).toContain('MIGRATION INCOMPLETE');
    // It must ASSERT exactly what it APPLIED: table, RLS, and the absence of grants.
    expect(migration).toContain('relrowsecurity = true');
    expect(migration).toContain("grantee IN ('anon', 'authenticated')");
  });

  it('constrains the stored number to E.164 at the database', () => {
    expect(migration).toContain("CHECK (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$')");
  });

  it('records a withdrawal rather than deleting the row', () => {
    // Consent history is append-only. A deleted record proves nothing later.
    expect(migration).toContain('revoked_at timestamptz');
  });
});

describe('CONSENT-009 broad CRWN SMS marketing is still gone', () => {
  it('this work restored none of the deleted product', () => {
    expect(existsSync(join(root, 'src/lib/twilio.ts'))).toBe(false);
    expect(existsSync(join(root, 'src/app/api/sms/send'))).toBe(false);
    const campaignSender = readFileSync(join(root, 'src/lib/campaignSender.ts'), 'utf-8');
    const audienceTab = readFileSync(join(root, 'src/components/artist/AudienceTab.tsx'), 'utf-8');
    expect(campaignSender.toLowerCase()).not.toContain('sms');
    expect(audienceTab.toLowerCase()).not.toContain('sms');
  });

  it('the page advertises no fan, artist, or campaign messaging', () => {
    for (const phrase of [
      'text your fans',
      'SMS campaign',
      'SMS marketing',
      'bulk SMS',
      'mass text',
      'subscribers',
    ]) {
      expect(page.toLowerCase(), `page advertises "${phrase}"`).not.toContain(phrase.toLowerCase());
    }
  });

  it('says out loud that this is not a customer signup', () => {
    expect(page).toContain('ALERT_CONSENT_PURPOSE');
    expect(
      readFileSync(join(root, 'src/lib/sms/alertConsent.ts'), 'utf-8'),
    ).toContain('It is not a signup for customers, artists, or fans');
  });
});

describe('CONSENT-010 house copy rules hold', () => {
  it('uses no em dash or en dash in anything a person reads', () => {
    const lib = readFileSync(join(root, 'src/lib/sms/alertConsent.ts'), 'utf-8');
    for (const [name, src] of [['page', page], ['form', form], ['lib', lib]] as const) {
      expect(src.includes('—'), `${name} contains an em dash`).toBe(false);
      expect(src.includes('–'), `${name} contains an en dash`).toBe(false);
    }
  });
});
