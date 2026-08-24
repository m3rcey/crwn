import { describe, it, expect } from 'vitest';

// The implementation lives in scripts/lib because it is Phase 0 proof code, not product code.
// The test lives here because vitest.config.ts only includes src/**/*.test.ts, and the whole
// point of testing it is that the function the script actually calls is the one under test.
// Duplicating the ordering logic into src/ to make the import tidier would defeat that.
import {
  discoverSlides,
  parseCaption,
  planImageTransform,
  classifyGraphError,
  interpretContainerStatus,
  redact,
  IG_LIMITS,
} from '../../../scripts/lib/instagramCarousel.mjs';

describe('discoverSlides', () => {
  // This is the assertion that matters most. Publishing the right images in the wrong order
  // produces a real, public, wrong post that no test downstream would ever catch.
  it('orders slides numerically, not lexicographically', () => {
    const files = ['slide-10.jpg', 'slide-2.jpg', 'slide-1.jpg', 'slide-9.jpg'];
    // A plain .sort() would give 1, 10, 2, 9.
    const r = discoverSlides([...files, 'slide-3.jpg', 'slide-4.jpg', 'slide-5.jpg', 'slide-6.jpg', 'slide-7.jpg', 'slide-8.jpg']);
    expect(r.ok).toBe(true);
    expect(r.slides).toEqual([
      'slide-1.jpg', 'slide-2.jpg', 'slide-3.jpg', 'slide-4.jpg', 'slide-5.jpg',
      'slide-6.jpg', 'slide-7.jpg', 'slide-8.jpg', 'slide-9.jpg', 'slide-10.jpg',
    ]);
  });

  it('returns the real CRWN four-slide carousel in generator order', () => {
    const r = discoverSlides(['caption.md', 'slide-3.jpg', 'slide-1.jpg', 'slide-4.jpg', 'slide-2.jpg']);
    expect(r.ok).toBe(true);
    expect(r.slides).toEqual(['slide-1.jpg', 'slide-2.jpg', 'slide-3.jpg', 'slide-4.jpg']);
  });

  it('ignores non-slide files', () => {
    const r = discoverSlides(['caption.md', '.crwn-published.json', 'slide-1.jpg', 'slide-2.jpg']);
    expect(r.slides).toEqual(['slide-1.jpg', 'slide-2.jpg']);
  });

  it('refuses a gap rather than silently publishing a short carousel', () => {
    const r = discoverSlides(['slide-1.jpg', 'slide-2.jpg', 'slide-4.jpg']);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/gap/i);
  });

  it('refuses when numbering does not start at 1', () => {
    const r = discoverSlides(['slide-2.jpg', 'slide-3.jpg']);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/start at slide-1/i);
  });

  it('refuses duplicates across extensions', () => {
    const r = discoverSlides(['slide-1.jpg', 'slide-1.jpeg', 'slide-2.jpg']);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/claim slide 1/i);
  });

  it('reports no slides for an empty folder', () => {
    const r = discoverSlides(['caption.md']);
    expect(r.ok).toBe(false);
    expect(r.slides).toEqual([]);
  });
});

describe('parseCaption', () => {
  it('takes the file verbatim and trims the generator newline', () => {
    const r = parseCaption('Comment "VAULT" for what yours is worth.\n\nBody.\n');
    expect(r.ok).toBe(true);
    expect(r.caption).toBe('Comment "VAULT" for what yours is worth.\n\nBody.');
  });

  it('rejects an empty caption', () => {
    expect(parseCaption('   ').ok).toBe(false);
  });

  it('rejects a caption over the Instagram limit', () => {
    const r = parseCaption('Comment "VAULT" ' + 'x'.repeat(IG_LIMITS.maxCaptionChars));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/2200/);
  });

  it('warns when the ManyChat call to action is missing', () => {
    const r = parseCaption('Just some copy with no trigger word.');
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/call to action/i);
  });
});

describe('planImageTransform', () => {
  it('flags the real CRWN sheet as out of range and plans white side padding', () => {
    // The actual generated asset: 3584x4800, aspect 0.7467, below Instagram's 4:5 minimum.
    const t = planImageTransform({ width: 3584, height: 4800, bytes: 3_522_937 });
    expect(t.needsTransform).toBe(true);
    expect(t.reasons.join(' ')).toMatch(/below Instagram's minimum/);
    expect(t.plan.targetWidth).toBe(1080);
    expect(t.plan.targetHeight).toBe(1350);
    expect(t.plan.targetAspect).toBe(0.8);
    // 3584 * (1350/4800) = 1008, leaving 36px of white each side.
    expect(t.plan.innerWidth).toBe(1008);
    expect(t.plan.innerHeight).toBe(1350);
    expect(t.plan.padLeftRight).toBe(36);
    expect(t.plan.padTopBottom).toBe(0);
  });

  it('leaves an already-compliant 4:5 image alone', () => {
    const t = planImageTransform({ width: 1080, height: 1350, bytes: 500_000 });
    expect(t.needsTransform).toBe(false);
    expect(t.reasons).toEqual([]);
  });

  it('flags an over-wide panorama for top and bottom padding', () => {
    const t = planImageTransform({ width: 3000, height: 1000, bytes: 100 });
    expect(t.needsTransform).toBe(true);
    expect(t.reasons.join(' ')).toMatch(/above Instagram's maximum/);
  });

  it('flags width over 1440 even when the aspect is fine', () => {
    const t = planImageTransform({ width: 2160, height: 2160, bytes: 100 });
    expect(t.needsTransform).toBe(true);
    expect(t.reasons.join(' ')).toMatch(/1440/);
  });

  it('flags a file over 8MB', () => {
    const t = planImageTransform({ width: 1080, height: 1350, bytes: 9 * 1024 * 1024 });
    expect(t.needsTransform).toBe(true);
    expect(t.reasons.join(' ')).toMatch(/8MB/);
  });
});

describe('classifyGraphError', () => {
  it('treats rate limiting as retryable', () => {
    expect(classifyGraphError(400, { error: { code: 4, message: 'limit' } })).toMatchObject({
      retryable: true,
      kind: 'rate_limit',
    });
    expect(classifyGraphError(429, {}).retryable).toBe(true);
  });

  it('treats server errors as retryable', () => {
    expect(classifyGraphError(503, {}).retryable).toBe(true);
  });

  it('treats an invalid token as permanent, because a retry loop cannot fix it', () => {
    const c = classifyGraphError(400, { error: { code: 190, message: 'expired' } });
    expect(c.retryable).toBe(false);
    expect(c.kind).toBe('auth');
  });

  it('treats a media fetch failure as permanent', () => {
    const c = classifyGraphError(400, { error: { code: 9004, message: 'cannot fetch' } });
    expect(c.retryable).toBe(false);
    expect(c.kind).toBe('media_fetch');
  });

  it('defaults to permanent when it does not recognise the error', () => {
    expect(classifyGraphError(400, { error: { code: 999999 } }).retryable).toBe(false);
  });
});

describe('interpretContainerStatus', () => {
  it('only allows publishing on FINISHED', () => {
    expect(interpretContainerStatus('FINISHED')).toMatchObject({ done: true, ok: true });
    expect(interpretContainerStatus('IN_PROGRESS')).toMatchObject({ done: false });
    expect(interpretContainerStatus('ERROR')).toMatchObject({ done: true, ok: false });
    expect(interpretContainerStatus('EXPIRED')).toMatchObject({ done: true, ok: false });
    // Already published must never be published a second time.
    expect(interpretContainerStatus('PUBLISHED')).toMatchObject({ done: true, ok: false });
  });
});

describe('redact', () => {
  it('removes a known secret from any string', () => {
    const token = 'EAAG_this_is_a_long_fake_token_value';
    expect(redact(`url?access_token=${token}&x=1`, [token])).not.toContain(token);
  });

  it('removes an access_token query parameter even for an unknown secret', () => {
    const out = redact('https://graph.facebook.com/v26.0/me?access_token=UNKNOWNSECRET123&fields=id', []);
    expect(out).not.toContain('UNKNOWNSECRET123');
    expect(out).toContain('[REDACTED]');
  });

  it('does not redact short strings that would blank out ordinary output', () => {
    expect(redact('hello world', ['abc'])).toBe('hello world');
  });
});
