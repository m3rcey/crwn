import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyMetaSignature } from './webhookSignatures';

const SECRET = 'app-secret-1';
const BODY = '{"object":"instagram","entry":[{"id":"1789","time":1}]}';
const sig = (body: string, secret: string) =>
  'sha256=' + createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex');

describe('verifyMetaSignature', () => {
  it('accepts a correctly signed raw body', () => {
    expect(verifyMetaSignature(BODY, sig(BODY, SECRET), [SECRET])).toBe(true);
  });

  it('accepts a match against ANY configured secret (IG app + FB app)', () => {
    expect(verifyMetaSignature(BODY, sig(BODY, 'fb-secret'), [SECRET, 'fb-secret'])).toBe(true);
  });

  it('rejects the wrong secret', () => {
    expect(verifyMetaSignature(BODY, sig(BODY, 'wrong'), [SECRET])).toBe(false);
  });

  it('rejects a body that changed after signing (raw-body property)', () => {
    expect(verifyMetaSignature(BODY + ' ', sig(BODY, SECRET), [SECRET])).toBe(false);
  });

  it('fails CLOSED: no header, malformed header, no configured secret', () => {
    expect(verifyMetaSignature(BODY, null, [SECRET])).toBe(false);
    expect(verifyMetaSignature(BODY, 'sha1=abc', [SECRET])).toBe(false);
    expect(verifyMetaSignature(BODY, sig(BODY, SECRET), [])).toBe(false);
    expect(verifyMetaSignature(BODY, sig(BODY, SECRET), [undefined, ''])).toBe(false);
  });
});
