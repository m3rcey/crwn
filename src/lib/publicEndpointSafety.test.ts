// Regression suite for the three unauthenticated endpoints fixed on 2026-08-12
// (audit findings SEC-008, SEC-013, SEC-019 in docs/CYBERSECURITY_AUDIT_2026-08-12.md).
//
// Each of these routes can be reached by anyone with curl, and each one either sends
// mail from CRWN's SPF/DKIM-aligned domain or writes into an artist's CRM. The three
// properties pinned here are the ones whose loss turns the endpoint back into an
// attack tool:
//
//   1. /api/support escapes every user value it puts into an email body.
//   2. /api/smart-links/capture never trusts a body-supplied artist id.
//   3. /api/leads/calculator is rate limited.
//
// The detectors below are pure functions run against the real source, and every one
// of them is also run against a fixture that CONTAINS the original bug, so the suite
// cannot pass vacuously if a detector stops detecting.

import { describe, it, expect } from 'vitest';
import { escapeHtml } from './prospectNurture/render';
import { readStripped, violation } from './architecture/sourceScan';

const SUPPORT = 'src/app/api/support/route.ts';
const CAPTURE = 'src/app/api/smart-links/capture/route.ts';
const CALCULATOR = 'src/app/api/leads/calculator/route.ts';

const DOCS = 'docs/CYBERSECURITY_AUDIT_2026-08-12.md';

// ---------------------------------------------------------------------------
// Detectors (pure: string in, findings out)
// ---------------------------------------------------------------------------

/** Every backtick literal in the source that carries HTML markup. */
function htmlTemplateLiterals(src: string): string[] {
  const literals = src.match(/`(?:[^`\\]|\\[\s\S])*`/g) || [];
  return literals.filter((l) => /<div|<p\s|<p>|<td|<h1|<h2/.test(l));
}

/**
 * Interpolations inside HTML template literals that are NOT passed through an
 * escaper. `allowed` names pre-escaped fragments the route builds itself.
 */
function unescapedHtmlInterpolations(src: string, allowed: string[] = []): string[] {
  const found: string[] = [];
  for (const literal of htmlTemplateLiterals(src)) {
    for (const m of literal.matchAll(/\$\{([^}]*)\}/g)) {
      const expr = m[1].trim();
      if (expr.startsWith('escapeHtml(') || expr.startsWith('escapeAttr(')) continue;
      if (allowed.includes(expr)) continue;
      found.push(expr);
    }
  }
  return found;
}

/**
 * Lines that mention an `artistId` in a way that is not the one sanctioned use:
 * a local derived from the smart_links row and written into the two tables.
 * A whole-line rule rather than a `body.artistId` match on purpose, because a cast
 * (`(body as { artistId?: string }).artistId`) reads from the body just the same.
 */
function suspectArtistIdLines(src: string): string[] {
  const sanctioned = [
    /^const\s+artistId\s*=\s*link\.artist_id/,
    /^artist_id:\s*artistId,?$/,
  ];
  return src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\bartistId\b/.test(l))
    .filter((l) => !sanctioned.some((re) => re.test(l)));
}

/** True when a route reads an artist id out of the request body. */
function usesBodySuppliedArtistId(src: string): boolean {
  return suspectArtistIdLines(src).length > 0;
}

/** True when the source calls the shared rate limiter. */
function callsRateLimiter(src: string): boolean {
  return /from\s+'@\/lib\/rateLimit'/.test(src) && /checkRateLimit\(/.test(src);
}

// ---------------------------------------------------------------------------
// The escaper itself (the primitive all three fixes lean on)
// ---------------------------------------------------------------------------

describe('escapeHtml (the shared escaper the public routes use)', () => {
  it('neutralizes a script tag', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes the characters that break out of an attribute or a tag', () => {
    expect(escapeHtml(`" ' & < >`)).toBe('&quot; &#39; &amp; &lt; &gt;');
  });

  it('leaves ordinary support-request prose untouched', () => {
    const text = 'My payout failed twice today. Order 1042, card ending 4242.';
    expect(escapeHtml(text)).toBe(text);
  });

  it('cannot smuggle an anchor into an email body', () => {
    const phish = '<a href="https://evil.example/reset">Reset your CRWN password</a>';
    const escaped = escapeHtml(phish);
    // No tag survives, and the attribute quotes are gone, so "href=" is inert text.
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).not.toContain('href="');
  });
});

// ---------------------------------------------------------------------------
// Positive controls: the detectors must fire on the ORIGINAL vulnerable code
// ---------------------------------------------------------------------------

describe('positive controls (the detectors are not vacuous)', () => {
  it('flags the pre-fix support template that interpolated raw name and message', () => {
    const vulnerable = `
      await resend.emails.send({
        html: \`
          <div>
            <td>\${name}</td>
            <p>\${message}</p>
          </div>
        \`,
      });
    `;
    expect(unescapedHtmlInterpolations(vulnerable).sort()).toEqual(['message', 'name']);
  });

  it('does not flag the same template once every value is escaped', () => {
    const fixed = `
      await resend.emails.send({
        html: \`
          <div>
            <td>\${escapeHtml(safeName)}</td>
            <p>\${escapeHtml(safeMessage)}</p>
            \${contextHtml}
          </div>
        \`,
      });
    `;
    expect(unescapedHtmlInterpolations(fixed, ['contextHtml'])).toEqual([]);
  });

  it('flags the pre-fix capture route that destructured artistId from the body', () => {
    expect(usesBodySuppliedArtistId('const { linkId, artistId, name, email, phone } = body;')).toBe(true);
    expect(usesBodySuppliedArtistId('const artistId = body.artistId;')).toBe(true);
    // A cast reads from the body just the same, so it must be flagged too.
    expect(usesBodySuppliedArtistId('const artistId = (body as { artistId?: string }).artistId as string;')).toBe(true);
    expect(
      usesBodySuppliedArtistId('const artistId = link.artist_id as string;\nartist_id: artistId,'),
    ).toBe(false);
  });

  it('flags a route with no rate limiter', () => {
    expect(callsRateLimiter("import { NextResponse } from 'next/server';")).toBe(false);
    expect(
      callsRateLimiter("import { checkRateLimit } from '@/lib/rateLimit';\nawait checkRateLimit('ip:1', 'x', 60, 5);"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-008: /api/support
// ---------------------------------------------------------------------------

describe('SEC-008: /api/support cannot mail attacker-authored HTML', () => {
  const src = readStripped(SUPPORT);

  it('escapes every user value interpolated into an email body', () => {
    const unescaped = unescapedHtmlInterpolations(src, ['contextHtml']);
    expect(
      unescaped,
      violation('SEC-008', `unescaped interpolation(s) in a support email body: ${unescaped.join(', ')}`, {
        file: SUPPORT,
        docs: DOCS,
      }),
    ).toEqual([]);
  });

  it('imports the shared escaper rather than hand-rolling one', () => {
    expect(src).toMatch(/import\s*\{\s*escapeHtml\s*\}\s*from\s*'@\/lib\/prospectNurture\/render'/);
  });

  it('never interpolates the raw request fields into a template', () => {
    for (const raw of ['${name}', '${message}', '${category}', '${email}']) {
      expect(
        src.includes(raw),
        violation('SEC-008', `raw request field ${raw} is interpolated into a template`, {
          file: SUPPORT,
          docs: DOCS,
        }),
      ).toBe(false);
    }
  });

  it('does not echo the submitter message into the confirmation sent to an unverified address', () => {
    const bodies = htmlTemplateLiterals(src);
    // Two emails go out: the internal one (which must carry the message) and the
    // confirmation to the body-supplied address (which must not).
    const confirmation = bodies.find((b) => b.includes('We received your support request') || b.includes("We've received your support request"));
    expect(confirmation, 'confirmation email body not found').toBeTruthy();
    expect(
      /safeMessage|\$\{message\}/.test(confirmation as string),
      violation('SEC-008', 'the confirmation email echoes submitter-authored text to an unverified address', {
        file: SUPPORT,
        docs: DOCS,
      }),
    ).toBe(false);
  });

  it('validates the recipient as a single address and limits per address', () => {
    expect(callsRateLimiter(src)).toBe(true);
    expect(
      /checkRateLimit\(`email:/.test(src),
      violation('SEC-008', 'no per-recipient rate limit, so rotating IPs can mail-bomb one address', {
        file: SUPPORT,
        docs: DOCS,
      }),
    ).toBe(true);
    // The recipient regex must refuse the list/header separators.
    expect(src).toMatch(/SINGLE_EMAIL_RE\s*=\s*\/\^\[\^\\s@,;<>/);
  });

  it('files the category from a fixed allowlist', () => {
    expect(src).toMatch(/CATEGORIES\s*=\s*\['General',\s*'Billing',\s*'Artist Account',\s*'Bug Report'\]/);
  });
});

// ---------------------------------------------------------------------------
// SEC-013: /api/smart-links/capture
// ---------------------------------------------------------------------------

describe('SEC-013: smart-link capture writes to the link owner, not a body-supplied artist', () => {
  const src = readStripped(CAPTURE);

  it('never reads an artist id from the request body', () => {
    expect(
      usesBodySuppliedArtistId(src),
      violation('SEC-013', 'the capture route trusts a body-supplied artistId, which injects PII into any artist CRM', {
        file: CAPTURE,
        owner: 'smart_links.artist_id',
        docs: DOCS,
      }),
    ).toBe(false);
  });

  it('selects artist_id from the smart_links row and uses it for both writes', () => {
    expect(src).toMatch(/\.select\('id,\s*artist_id[^']*'\)/);
    expect(src).toMatch(/const\s+artistId\s*=\s*link\.artist_id/);
    // Both the capture insert and the fan_contacts upsert use that derived value.
    const artistIdWrites = src.match(/artist_id:\s*artistId/g) || [];
    expect(artistIdWrites.length).toBeGreaterThanOrEqual(2);
  });

  it('rate limits an unauthenticated write path', () => {
    expect(
      callsRateLimiter(src),
      violation('SEC-013', 'the capture route has no rate limit', { file: CAPTURE, docs: DOCS }),
    ).toBe(true);
  });

  it('validates the email and phone it stores', () => {
    expect(src).toMatch(/EMAIL_RE\.test\(email\)/);
    expect(src).toMatch(/PHONE_RE\.test\(phone\)/);
  });
});

// ---------------------------------------------------------------------------
// SEC-019: /api/leads/calculator
// ---------------------------------------------------------------------------

describe('SEC-019: the calculator lead route is not an open mail relay', () => {
  const src = readStripped(CALCULATOR);

  it('calls the shared rate limiter', () => {
    expect(
      callsRateLimiter(src),
      violation('SEC-019', 'the calculator lead route sends mail to a body-supplied address with no rate limit', {
        file: CALCULATOR,
        owner: 'src/lib/rateLimit.ts',
        docs: DOCS,
      }),
    ).toBe(true);
  });

  it('limits per IP and per recipient', () => {
    expect(/checkRateLimit\(`ip:/.test(src)).toBe(true);
    expect(/checkRateLimit\(`email:/.test(src)).toBe(true);
  });

  it('bounds the free text it stores into crm_contacts', () => {
    expect(src).toMatch(/MAX_NAME\s*=\s*(\d{1,3})\b/);
    const max = Number((src.match(/MAX_NAME\s*=\s*(\d+)/) || [])[1]);
    expect(max).toBeGreaterThan(0);
    expect(
      max,
      violation('SEC-019', 'the stored contact name is unbounded, which is the admin-agent injection surface (SEC-010)', {
        file: CALCULATOR,
        docs: DOCS,
      }),
    ).toBeLessThanOrEqual(120);
    expect(src).toMatch(/const\s+name\s*=\s*cleanText\(body\.name,\s*MAX_NAME\)/);
  });

  it('refuses a recipient that is a list or carries a header separator', () => {
    expect(src).toMatch(/EMAIL_RE\s*=\s*\/\^\[\^\\s@,;<>/);
    expect(src).toMatch(/EMAIL_RE\.test\(email\)/);
  });

  it('puts no user-authored text into the outbound email body', () => {
    expect(unescapedHtmlInterpolations(src)).toEqual([]);
  });
});
