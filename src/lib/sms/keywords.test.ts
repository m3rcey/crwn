import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  normalizeInbound,
  classifyInbound,
  votingLinkReply,
  noActiveVoteReply,
  twimlMessage,
  formatSmsNumber,
  sameNumber,
  isConfiguredPhone,
  CARRIER_RESERVED,
} from './keywords';
import { verifyTwilioSignature } from '../webhookSignatures';

const KEYWORDS = ['jubo'];

describe('normalizeInbound', () => {
  it('handles the ways a person actually types a keyword', () => {
    expect(normalizeInbound('JUBO')).toBe('jubo');
    expect(normalizeInbound(' jubo ')).toBe('jubo');
    expect(normalizeInbound('Jubo!')).toBe('jubo');
    expect(normalizeInbound('"JUBO"')).toBe('jubo');
    expect(normalizeInbound('jubo.')).toBe('jubo');
  });
  it('never throws on non-strings or emptiness', () => {
    expect(normalizeInbound(undefined)).toBe('');
    expect(normalizeInbound(42)).toBe('');
    expect(normalizeInbound('   ')).toBe('');
  });
});

describe('classifyInbound', () => {
  it('matches the keyword case-insensitively with surrounding whitespace', () => {
    expect(classifyInbound('JUBO', KEYWORDS)).toEqual({ kind: 'keyword', keyword: 'jubo' });
    expect(classifyInbound('  jubo\n', KEYWORDS)).toEqual({ kind: 'keyword', keyword: 'jubo' });
  });

  it('does NOT fuzzy match, so ordinary conversation cannot trigger it', () => {
    for (const text of ['jumbo', 'jubox', 'i want jubo tickets', 'ju bo', 'jubo please']) {
      expect(classifyInbound(text, KEYWORDS).kind).toBe('ignore');
    }
  });

  it('never swallows a carrier-reserved word', () => {
    for (const word of CARRIER_RESERVED) {
      expect(classifyInbound(word.toUpperCase(), KEYWORDS)).toEqual({ kind: 'reserved', word });
    }
  });

  it('treats a reserved word as reserved even if an artist configured it as a keyword', () => {
    // Opt-out must never be capturable by configuration.
    expect(classifyInbound('STOP', ['stop', 'jubo'])).toEqual({ kind: 'reserved', word: 'stop' });
  });

  it('ignores anything unrecognized rather than replying', () => {
    expect(classifyInbound('hello there', KEYWORDS).kind).toBe('ignore');
    expect(classifyInbound('', KEYWORDS).kind).toBe('ignore');
  });
});

describe('replies', () => {
  it('names the artist and carries the exact link', () => {
    const reply = votingLinkReply('Julius Williams', 'https://thecrwn.app/julius-williams/join/x?utm_source=jubo');
    expect(reply).toContain('Julius Williams');
    expect(reply).toContain('https://thecrwn.app/julius-williams/join/x?utm_source=jubo');
    expect(reply).toContain('No app needed.');
    expect(reply.includes('—')).toBe(false); // no em dash
  });

  it('fits one SMS segment for a typical artist name and link', () => {
    const reply = votingLinkReply('Julius Williams', 'https://thecrwn.app/julius-williams/join/st-james-live-sept-26-song-vote?utm_source=jubo&utm_medium=sms');
    expect(reply.length).toBeLessThanOrEqual(320); // two segments worst case, never truncated
  });

  it('says so plainly when nothing is running, and offers no link', () => {
    const reply = noActiveVoteReply('Julius Williams');
    expect(reply).toContain('Julius Williams');
    expect(reply).not.toContain('http');
  });

  it('falls back to a neutral noun when the artist name is missing', () => {
    expect(votingLinkReply('', 'https://x.test')).toContain('This artist');
    expect(noActiveVoteReply('   ')).toContain('This artist');
  });
});

describe('twimlMessage', () => {
  it('wraps a reply and escapes XML so a link with & cannot break the document', () => {
    const xml = twimlMessage('Go to https://x.test/a?b=1&c=2');
    expect(xml).toContain('<Response><Message>');
    expect(xml).toContain('&amp;c=2');
    expect(xml).not.toContain('&c=2');
  });
  it('returns an empty Response for silence', () => {
    expect(twimlMessage(null)).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });
  it('escapes angle brackets and quotes', () => {
    expect(twimlMessage('<script>"x"</script>')).toContain('&lt;script&gt;');
    expect(twimlMessage('<script>"x"</script>')).not.toContain('<script>');
  });
});

describe('formatSmsNumber', () => {
  it('formats a US number for a flyer', () => {
    expect(formatSmsNumber('+14045551234')).toBe('(404) 555-1234');
    expect(formatSmsNumber('4045551234')).toBe('(404) 555-1234');
  });
  it('leaves anything else alone rather than mangling it', () => {
    expect(formatSmsNumber('+442071234567')).toBe('+442071234567');
    expect(formatSmsNumber('')).toBe('');
    expect(formatSmsNumber(null)).toBe('');
  });
});

describe('the JUBO number is its own line', () => {
  it('matches the number Twilio sends against the number an artist typed', () => {
    // Twilio always sends E.164; a human types anything.
    expect(sameNumber('+14045551234', '+14045551234')).toBe(true);
    expect(sameNumber('+14045551234', '(404) 555-1234')).toBe(true);
    expect(sameNumber('+14045551234', '404-555-1234')).toBe(true);
    expect(sameNumber('+14045551234', '14045551234')).toBe(true);
    expect(sameNumber('+14045551234', ' 4045551234 ')).toBe(true);
  });

  it('does NOT match a different number', () => {
    expect(sameNumber('+14045551234', '+14045551235')).toBe(false);
    expect(sameNumber('+14045551234', '+13145573549')).toBe(false);
  });

  it('never collides two international numbers on a last-10-digits shortcut', () => {
    // +44 20 7123 4567 and +1 202 712 34567 style tails must stay distinct.
    expect(sameNumber('+442071234567', '+12071234567')).toBe(false);
    expect(sameNumber('+61407123456', '+10407123456')).toBe(false);
  });

  it('fails closed on anything missing or empty', () => {
    expect(sameNumber('+14045551234', '')).toBe(false);
    expect(sameNumber('', '+14045551234')).toBe(false);
    expect(sameNumber(null, undefined)).toBe(false);
    expect(sameNumber('+14045551234', 'not a number')).toBe(false);
  });

  it('isConfiguredPhone rejects blanks, placeholders and truncated values', () => {
    expect(isConfiguredPhone('+14045551234')).toBe(true);
    expect(isConfiguredPhone('(404) 555-1234')).toBe(true);
    expect(isConfiguredPhone('')).toBe(false);
    expect(isConfiguredPhone(undefined)).toBe(false);
    expect(isConfiguredPhone('changeme')).toBe(false);
    expect(isConfiguredPhone('+1404555')).toBe(false);        // truncated
    expect(isConfiguredPhone('1234567890123456')).toBe(false); // longer than E.164
  });
});

describe('the inbound route never borrows the other Twilio number', () => {
  const routeSource = readFileSync(
    join(process.cwd(), 'src/app/api/sms/inbound/route.ts'),
    'utf8',
  );

  it('reads TWILIO_JUBO_PHONE_NUMBER and never TWILIO_PHONE_NUMBER', () => {
    expect(routeSource).toContain('TWILIO_JUBO_PHONE_NUMBER');
    // The other number serves a different purpose. Reading it here, even as a fallback,
    // would put CRWN replies on a line that is not meant to send them.
    const borrows = /process\.env\.TWILIO_PHONE_NUMBER/.test(routeSource);
    expect(borrows, 'the JUBO route must not read TWILIO_PHONE_NUMBER').toBe(false);
  });

  it('checks the receiving number before answering', () => {
    expect(routeSource).toContain('sameNumber(params.To');
    expect(routeSource).toContain('isConfiguredPhone(juboNumber)');
  });

  it('still verifies the Twilio signature before doing anything', () => {
    expect(routeSource).toContain('verifyTwilioSignature(');
    // The signature check must run BEFORE the number check, so an unsigned request is
    // rejected outright rather than being used to probe which numbers CRWN owns. Compare
    // the EXECUTABLE references: the header comment names the env var much earlier.
    expect(routeSource.indexOf('verifyTwilioSignature('))
      .toBeLessThan(routeSource.indexOf('process.env.TWILIO_JUBO_PHONE_NUMBER'));
  });

  it('still leaves STOP and HELP to the carrier', () => {
    expect(routeSource).toContain("intent.kind === 'reserved'");
  });

  it('logs neither number', () => {
    // Every console line in this route must be a constant string, never a number.
    const logs = routeSource.match(/console\.(log|warn|error)\([^)]*\)/g) || [];
    for (const line of logs) {
      expect(line, line).not.toMatch(/juboNumber|params\.To|params\.From|\bfrom\b/);
    }
  });
});

describe('verifyTwilioSignature', () => {
  // Twilio's own published example. If this ever fails, the algorithm is wrong and
  // every inbound request would be rejected (or worse, accepted).
  const URL_ = 'https://mycompany.com/myapp.php?foo=1&bar=2';
  const PARAMS = {
    CallSid: 'CA1234567890ABCDE',
    Caller: '+14158675309',
    Digits: '1234',
    From: '+14158675309',
    To: '+18005551212',
  };
  const TOKEN = '12345';
  const GOOD = 'RSOYDt4T1cUTdK1PDd93/VVr8B8=';

  it('accepts Twilio\'s documented test vector', () => {
    expect(verifyTwilioSignature(URL_, PARAMS, GOOD, TOKEN)).toBe(true);
  });

  it('rejects a tampered parameter', () => {
    expect(verifyTwilioSignature(URL_, { ...PARAMS, Digits: '9999' }, GOOD, TOKEN)).toBe(false);
  });

  it('rejects a different URL, including a changed query string', () => {
    expect(verifyTwilioSignature('https://mycompany.com/myapp.php?foo=1&bar=3', PARAMS, GOOD, TOKEN)).toBe(false);
    expect(verifyTwilioSignature('https://evil.example/myapp.php?foo=1&bar=2', PARAMS, GOOD, TOKEN)).toBe(false);
  });

  it('fails CLOSED with no token, no signature, or a junk signature', () => {
    expect(verifyTwilioSignature(URL_, PARAMS, GOOD, undefined)).toBe(false);
    expect(verifyTwilioSignature(URL_, PARAMS, null, TOKEN)).toBe(false);
    expect(verifyTwilioSignature(URL_, PARAMS, 'not-a-signature', TOKEN)).toBe(false);
    expect(verifyTwilioSignature('', PARAMS, GOOD, TOKEN)).toBe(false);
  });

  it('is insensitive to parameter ORDER but not to content', () => {
    const reordered = {
      To: PARAMS.To, From: PARAMS.From, Digits: PARAMS.Digits,
      Caller: PARAMS.Caller, CallSid: PARAMS.CallSid,
    };
    expect(verifyTwilioSignature(URL_, reordered, GOOD, TOKEN)).toBe(true);
  });
});
