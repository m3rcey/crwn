import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// The public legal pages are HAND-KEPT React source, never rendered from data, so nothing
// else in the repository can notice when a required disclosure disappears from them.
//
// These assertions exist for one concrete reason: from 2026-08-24 the A2P 10DLC campaign for
// JNW Creative Enterprises, Inc. depends on https://thecrwn.app/privacy and
// https://thecrwn.app/terms carrying specific language. A carrier vetting failure is not a bug
// report that arrives in an inbox. The campaign simply stops being approved, and the
// speed-to-lead alert stops arriving, silently.
//
// Twilio rejects a campaign (error 30908) when the privacy policy is missing the statement that
// mobile numbers and messaging consent are not shared with third parties or affiliates for
// marketing or promotional purposes, and when a website opt-in exists without message frequency
// and message-and-data-rates disclosures.

const root = process.cwd();
const privacy = readFileSync(join(root, 'src/app/(public)/privacy/page.tsx'), 'utf-8');
const terms = readFileSync(join(root, 'src/app/(public)/terms/page.tsx'), 'utf-8');
const callCard = readFileSync(join(root, 'src/components/lead-magnets/CallRequestCard.tsx'), 'utf-8');

describe('LEGAL-SMS-001 the privacy policy carries the A2P 10DLC mobile disclosures', () => {
  it('states the non-sharing rule in the exact form Twilio vets for', () => {
    // Verbatim from Twilio error 30908. Substantively equivalent paraphrases have been rejected
    // in vetting, so this one is pinned character for character.
    expect(privacy).toContain(
      'We do not share, sell, or provide your mobile phone number or messaging consent data to third parties or affiliates for marketing or promotional purposes.',
    );
  });

  it('carries the carrier-standard mobile-information and opt-in-data wording too', () => {
    // The second half of the requirement: the exclusion has to reach the opt-in and consent
    // DATA, not only the number itself.
    expect(privacy).toContain(
      'No mobile information is shared with third parties or affiliates for marketing or promotional purposes.',
    );
    expect(privacy.toLowerCase()).toContain(
      'opt-in data and consent are excluded from every category of information we share',
    );
  });

  it('discloses message frequency and carrier charges', () => {
    expect(privacy.toLowerCase()).toContain('message frequency varies');
    expect(privacy.toLowerCase()).toContain('message and data rates may apply');
  });

  it('discloses STOP and HELP', () => {
    expect(privacy).toContain('Reply STOP');
    expect(privacy).toContain('Reply HELP');
  });

  it('names the operating entity and describes the program as internal, not marketing', () => {
    expect(privacy).toContain('JNW Creative Enterprises, Inc.');
    expect(privacy.toLowerCase()).toContain('authorized jnw creative enterprises, inc. representative');
    expect(privacy.toLowerCase()).toContain('not sent to artists, fans, prospects, or customers');
  });

  it('does not claim numbers are never disclosed, because processors exist', () => {
    // Truthfulness gate. Twilio, Supabase and Resend all touch the number. A policy claiming
    // otherwise would be both false and, when a reviewer compares it to the campaign,
    // "conflicting information", which is its own rejection reason.
    expect(privacy).toContain('Twilio');
    expect(privacy.toLowerCase()).toContain('that is disclosure to a processor');
  });
});

describe('LEGAL-SMS-002 the terms carry the SMS program terms', () => {
  it('has an SMS Messaging section', () => {
    expect(terms).toContain('13. SMS Messaging');
  });

  it('identifies the sender, the recipients and the purpose', () => {
    expect(terms).toContain('JNW Creative Enterprises, Inc., the company that operates CRWN');
    expect(terms.toLowerCase()).toContain('only authorized jnw creative enterprises, inc. personnel');
    expect(terms.toLowerCase()).toContain('are not recipients of this program');
  });

  it('discloses frequency, charges, STOP, HELP and that consent is not a condition of purchase', () => {
    expect(terms.toLowerCase()).toContain('message frequency varies');
    expect(terms.toLowerCase()).toContain('message and data rates may apply');
    expect(terms).toContain('reply STOP');
    expect(terms).toContain('Reply HELP');
    expect(terms.toLowerCase()).toContain('consent is never a condition of using crwn or of any purchase');
  });

  it('points at the privacy policy', () => {
    expect(terms).toContain('href="/privacy"');
  });
});

describe('LEGAL-SMS-003 the point of opt-in carries its own disclosure', () => {
  // Twilio requires frequency, rates and opt-out AT THE POINT a mobile number is collected on a
  // website, not only in the linked policies. The reviewer opens the page a person actually sees
  // before consenting.
  it('the call-request consent box discloses frequency, rates, STOP, HELP and links the policies', () => {
    expect(callCard).toContain('Message frequency varies.');
    expect(callCard).toContain('Message and data rates may apply.');
    expect(callCard).toContain('Reply STOP to opt out');
    expect(callCard).toContain('HELP for help');
    expect(callCard).toContain('href="/privacy"');
    expect(callCard).toContain('href="/terms"');
  });

  it('the consent checkbox is never pre-checked', () => {
    // A pre-selected box is not consent, and Twilio names it as a rejection cause.
    expect(callCard).toContain('useState(false)');
    expect(callCard).not.toMatch(/checked=\{true\}|defaultChecked/);
  });
});

describe('LEGAL-SMS-004 broad CRWN SMS marketing stays removed', () => {
  it('the legal pages state the negative explicitly', () => {
    expect(privacy.toLowerCase()).toContain('crwn does not run sms marketing');
    expect(terms.toLowerCase()).toContain('crwn does not operate a marketing or promotional sms program');
  });

  it('no legal page advertises an artist-to-fan texting product', () => {
    // Phrases that could only describe the removed marketing product. Deliberately chosen so
    // they cannot match the NEGATIONS above: a policy has to be able to say what it does not do.
    const banned = [
      'SMS marketing campaign',
      'text blast',
      'bulk SMS',
      'SMS credits',
      'SMS subscribers',
      'texts per month',
      'SMS per month',
    ];
    for (const phrase of banned) {
      expect(privacy.toLowerCase(), `privacy policy advertises "${phrase}"`).not.toContain(phrase.toLowerCase());
      expect(terms.toLowerCase(), `terms advertise "${phrase}"`).not.toContain(phrase.toLowerCase());
    }
  });

  it('the deleted outbound SMS product has not come back', () => {
    // The exact artifacts deleted on 2026-07-31. The 2026-08-24 founder decision authorized ONE
    // narrow internal alert, not this. If a legitimate internal sender is ever built, follow
    // docs/crwn-brain/26-PRODUCT-DRIFT-PREVENTION.md: change the Brain rule and this test
    // together, never this test alone.
    expect(existsSync(join(root, 'src/lib/twilio.ts'))).toBe(false);
    expect(existsSync(join(root, 'src/app/api/sms/send'))).toBe(false);
    // The Fan CRM and the campaign sender own artist-to-fan messaging. Neither may grow an SMS
    // channel: that is the removed product, and the legal pages now promise it is gone.
    const campaignSender = readFileSync(join(root, 'src/lib/campaignSender.ts'), 'utf-8');
    const audienceTab = readFileSync(join(root, 'src/components/artist/AudienceTab.tsx'), 'utf-8');
    expect(campaignSender.toLowerCase()).not.toContain('sms');
    expect(audienceTab.toLowerCase()).not.toContain('sms');
  });
});

describe('LEGAL-SMS-005 the rest of the legal pages survived the edit', () => {
  it('the privacy policy still numbers every section once, in order', () => {
    const headings = [...privacy.matchAll(/>(\d+)\.\s[^<]+</g)].map((m) => Number(m[1]));
    expect(headings).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('the terms still number every section once, in order', () => {
    const headings = [...terms.matchAll(/text-xl font-semibold text-crwn-text">(\d+)\./g)].map((m) => Number(m[1]));
    expect(headings).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('keeps the plan fee percentages the pricing strategy ratified', () => {
    expect(terms).toContain('12% on Launch');
    expect(terms).toContain('8% on Pro ($49/month)');
    expect(terms).toContain('5% on Scale ($199/month)');
  });

  it('keeps the pre-existing privacy commitments', () => {
    expect(privacy).toContain('privacy@thecrwn.app');
    expect(privacy).toContain('We do not sell your personal information.');
    expect(privacy.toLowerCase()).toContain('california residents');
    expect(privacy.toLowerCase()).toContain('gdpr');
  });

  it('uses no em dash or en dash anywhere in the legal copy', () => {
    const sources: [string, string][] = [
      ['privacy', privacy],
      ['terms', terms],
      ['CallRequestCard', callCard],
    ];
    for (const [name, src] of sources) {
      expect(src.includes('—'), `${name} contains an em dash`).toBe(false);
      expect(src.includes('–'), `${name} contains an en dash`).toBe(false);
    }
  });
});
