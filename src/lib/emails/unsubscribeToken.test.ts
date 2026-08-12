// Contract tests for the signed unsubscribe link, plus source-scan drift assertions that the four
// unsubscribe routes actually verify a token and that producer/polls actually gates its GET.
//
// Every source-scan assertion is paired with a POSITIVE CONTROL: the same predicate is run over a
// synthetic source string that contains the flaw, and must flag it. A scanner that silently stops
// matching (a rename, a moved file, a regex that no longer fits) would otherwise pass forever
// while examining nothing.

import { describe, expect, it } from 'vitest';
import { readStripped, violation } from '@/lib/architecture/sourceScan';
import {
  ALL_ARTISTS,
  CRWN_PLATFORM,
  appendUnsubscribeToken,
  contactRecipient,
  emailRecipient,
  fanRecipient,
  signUnsubscribeScope,
  verifyUnsubscribeScope,
  type UnsubscribeScope,
} from './unsubscribeToken';

const FAN_A = '11111111-1111-4111-8111-111111111111';
const FAN_B = '22222222-2222-4222-8222-222222222222';
const ARTIST_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ARTIST_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SEND_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SEND_2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const artistScope: UnsubscribeScope = {
  kind: 'campaign-artist',
  id: SEND_1,
  artistId: ARTIST_A,
  recipient: fanRecipient(FAN_A),
};

describe('unsubscribe token', () => {
  it('a token minted for a scope verifies for that exact scope', () => {
    const token = signUnsubscribeScope(artistScope);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyUnsubscribeScope(artistScope, token)).toBe(true);
  });

  it('rejects a tampered RECIPIENT', () => {
    const token = signUnsubscribeScope(artistScope);
    expect(verifyUnsubscribeScope({ ...artistScope, recipient: fanRecipient(FAN_B) }, token)).toBe(false);
    // A contact and a fan carrying the same uuid are different recipients.
    expect(verifyUnsubscribeScope({ ...artistScope, recipient: contactRecipient(FAN_A) }, token)).toBe(false);
  });

  it('rejects a tampered SCOPE KIND (the per-artist token cannot opt out of every artist)', () => {
    const token = signUnsubscribeScope(artistScope);
    expect(verifyUnsubscribeScope({ ...artistScope, kind: 'campaign-all' }, token)).toBe(false);
    expect(verifyUnsubscribeScope({ ...artistScope, kind: 'sequence-artist' }, token)).toBe(false);
    expect(verifyUnsubscribeScope({ ...artistScope, kind: 'crm-outreach' }, token)).toBe(false);
  });

  it('rejects a token for artist A presented on artist B', () => {
    const token = signUnsubscribeScope(artistScope);
    expect(verifyUnsubscribeScope({ ...artistScope, artistId: ARTIST_B }, token)).toBe(false);
  });

  it('rejects a token for one list presented for "all artists"', () => {
    const token = signUnsubscribeScope(artistScope);
    const allScope: UnsubscribeScope = { ...artistScope, kind: 'campaign-all', artistId: ALL_ARTISTS };
    expect(verifyUnsubscribeScope(allScope, token)).toBe(false);
    // ...and the reverse, so neither direction is portable.
    expect(verifyUnsubscribeScope(artistScope, signUnsubscribeScope(allScope))).toBe(false);
  });

  it('rejects a guessed or incremented row id', () => {
    const token = signUnsubscribeScope(artistScope);
    expect(verifyUnsubscribeScope({ ...artistScope, id: SEND_2 }, token)).toBe(false);
  });

  it('rejects empty, garbage, wrong-length and truncated signatures', () => {
    const good = signUnsubscribeScope(artistScope);
    for (const bad of [
      '',
      null,
      undefined,
      'not-a-signature',
      'zzzz',
      good.slice(0, 63),
      good.slice(0, 32),
      `${good}00`,
      good.replace(/^./, good[0] === 'a' ? 'b' : 'a'),
    ]) {
      expect(verifyUnsubscribeScope(artistScope, bad as string), `signature ${String(bad)} must not verify`).toBe(false);
    }
  });

  it('field boundaries cannot be shifted (a pipe-joined canonical form, not a concatenation)', () => {
    // If the canonical form were a plain concatenation, moving a character from one field to the
    // next would produce the same bytes and the same signature.
    const a = signUnsubscribeScope({ kind: 'campaign-artist', id: 'ab', artistId: 'c', recipient: 'fan:d' });
    const b = signUnsubscribeScope({ kind: 'campaign-artist', id: 'a', artistId: 'bc', recipient: 'fan:d' });
    expect(a).not.toEqual(b);
  });

  it('normalizes case so a mail client that mangles the URL still verifies', () => {
    const token = signUnsubscribeScope({ ...artistScope, recipient: emailRecipient('Fan@Example.COM') });
    expect(verifyUnsubscribeScope({ ...artistScope, recipient: emailRecipient('fan@example.com') }, token)).toBe(true);
  });

  it('appendUnsubscribeToken produces a link the same scope verifies', () => {
    const scope: UnsubscribeScope = {
      kind: 'crm-outreach',
      id: SEND_1,
      artistId: CRWN_PLATFORM,
      recipient: emailRecipient('lead@example.com'),
    };
    const url = appendUnsubscribeToken(`https://thecrwn.app/api/admin/crm/outreach/unsubscribe/${SEND_1}`, scope);
    const token = new URL(url).searchParams.get('t');
    expect(verifyUnsubscribeScope(scope, token)).toBe(true);
    // and preserves an existing query string
    expect(appendUnsubscribeToken('https://thecrwn.app/x?a=1', scope)).toContain('?a=1&t=');
  });

  it('comparison is constant-time (timingSafeEqual), never a string ===', () => {
    const src = readStripped('src/lib/emails/unsubscribeToken.ts');
    expect(src).toContain('timingSafeEqual(');
    // A `===` on the hex string leaks the matching prefix length and lets a signature be forged
    // one character at a time.
    expect(/signUnsubscribeScope\([^)]*\)\s*===/.test(src)).toBe(false);
    expect(/token\s*===\s*/.test(src)).toBe(false);
  });
});

// ── Source-scan drift assertions ────────────────────────────────────────────────────────────────

const UNSUBSCRIBE_ROUTES = [
  'src/app/api/campaigns/unsubscribe/[sendId]/route.ts',
  'src/app/api/campaigns/unsubscribe-all/[sendId]/route.ts',
  'src/app/api/sequences/unsubscribe/[enrollmentId]/route.ts',
  'src/app/api/admin/crm/outreach/unsubscribe/[sendId]/route.ts',
];

/** One handler's body, from its signature to the next top-level export. */
function handlerBody(src: string, method: 'GET' | 'POST'): string {
  const start = src.indexOf(`export async function ${method}`);
  if (start < 0) return '';
  const rest = src.slice(start + 1);
  // Tolerate indentation so the same function can slice a synthetic control string.
  const end = rest.search(/\n[ \t]*export /);
  return end < 0 ? rest : rest.slice(0, end);
}
const getHandlerBody = (src: string) => handlerBody(src, 'GET');

const MUTATION = /\.(upsert|update|insert|delete)\s*\(/;

// Predicates are pure functions of source text so the SAME predicate can be run over a synthetic
// flawed file. That is what proves the assertion is not vacuous.
const rateLimits = (src: string) => src.includes('checkRateLimit(');
/** The GET must check a presented token, so an edited signed link dies before the confirm page. */
const getChecksPresentedToken = (src: string) => getHandlerBody(src).includes('verifyUnsubscribeScope(');
/** GET may never mutate: that is what a mail prefetcher and a URL scanner fire. */
const mutatesOnlyOnPost = (src: string) =>
  src.includes('export async function POST') && !MUTATION.test(getHandlerBody(src));
/**
 * The POST must verify BEFORE it mutates, and must have a refusal to fall into. Presence alone is
 * not enough: an early version of this test passed while the POST's `if (!verify...)` had been
 * replaced by `if (false)`, because the GET still mentioned the function.
 */
const postVerifiesBeforeMutating = (src: string) => {
  const body = handlerBody(src, 'POST');
  const verifyAt = body.indexOf('verifyUnsubscribeScope(');
  const mutateAt = body.search(MUTATION);
  return verifyAt >= 0 && body.includes('status: 403') && (mutateAt < 0 || verifyAt < mutateAt);
};
/**
 * The poll read must require a session AND resolve entitlement. `ownsSession` alone is not enough
 * (fans legitimately read polls) and 401 alone is not enough (any signed-in stranger could then
 * read a paid session's polls by id), so both marks are required.
 */
const gatesPollsGet = (src: string) => {
  const body = getHandlerBody(src);
  return /status:\s*401/.test(body) && body.includes('canReadSessionPolls(') && body.includes('ownsSession(');
};

describe('unsubscribe routes verify the signature (SEC-016 family)', () => {
  it('every unsubscribe route verifies a token, rate limits, and never mutates in GET', () => {
    const offenders = UNSUBSCRIBE_ROUTES.filter((f) => {
      const src = readStripped(f);
      return !getChecksPresentedToken(src) || !postVerifiesBeforeMutating(src) || !rateLimits(src) || !mutatesOnlyOnPost(src);
    });
    expect(
      offenders,
      violation(
        'SEC-016',
        `unsubscribe route(s) no longer verify an HMAC, no longer rate limit, or mutate a communication preference from a GET: ${offenders.join(', ')}. A GET that mutates is fired by mail prefetchers and URL scanners with no human involved, and the all-artists variant opts a fan out of every artist on CRWN. GET renders a confirm page; the POST carries a token bound to the row's recipient and list.`,
        { owner: 'src/lib/emails/unsubscribeToken.ts', docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12.md' },
      ),
    ).toEqual([]);
  });

  it('POSITIVE CONTROL: the predicates flag a route shaped like the pre-fix code', () => {
    const preFix = `
      export async function GET(_req, { params }) {
        const { sendId } = await params;
        const { data: send } = await supabaseAdmin.from('campaign_sends').select('fan_id').eq('id', sendId).single();
        await supabaseAdmin.from('fan_communication_prefs').upsert({ email_marketing: false });
        return new NextResponse(page('done', true));
      }
    `;
    expect(getChecksPresentedToken(preFix)).toBe(false);
    expect(rateLimits(preFix)).toBe(false);
    expect(mutatesOnlyOnPost(preFix)).toBe(false);
    expect(postVerifiesBeforeMutating(preFix)).toBe(false);

    // ...and a route that has a POST but still mutates inside GET is caught too.
    const mutatingGet = `
      export async function GET() { await db.from('x').update({ a: 1 }); }
      export async function POST() { verifyUnsubscribeScope(s, t); }
    `;
    expect(mutatesOnlyOnPost(mutatingGet)).toBe(false);

    // A POST that mentions the verifier only AFTER mutating (or not at all) is caught. This is the
    // exact shape a real mutation run produced: the POST's guard replaced by `if (false)`.
    const verifyStrippedFromPost = `
export async function GET() { checkRateLimit('ip:x'); verifyUnsubscribeScope(s, t); return page(); }
export async function POST() { if (false) { return refuse(403); } await db.from('x').update({ a: 1 }); }
`;
    expect(postVerifiesBeforeMutating(verifyStrippedFromPost)).toBe(false);

    const verifyAfterMutation = `
export async function POST() { await db.from('x').update({ a: 1 }); if (!verifyUnsubscribeScope(s, t)) return r({ status: 403 }); }
`;
    expect(postVerifiesBeforeMutating(verifyAfterMutation)).toBe(false);

    // Sanity: a compliant shape passes, so the predicates are not simply always-false.
    const fixed = `
export async function GET() { checkRateLimit('ip:x', 'unsubscribe-view'); verifyUnsubscribeScope(s, t); return page(); }
export async function POST() { if (!verifyUnsubscribeScope(s, t)) return r({ status: 403 }); await db.from('x').update({ a: 1 }); }
`;
    expect(
      getChecksPresentedToken(fixed) && rateLimits(fixed) && mutatesOnlyOnPost(fixed) && postVerifiesBeforeMutating(fixed),
    ).toBe(true);
  });

  it('each scanned route file is non-empty and really contains a GET handler', () => {
    // Guards against the whole suite passing because a path moved and readStripped returned
    // something unexpected. readStripped throws on a missing file, this catches an empty one.
    for (const f of [...UNSUBSCRIBE_ROUTES, 'src/app/api/producer/polls/route.ts']) {
      const src = readStripped(f);
      expect(src.length, `${f} scanned as empty`).toBeGreaterThan(200);
      expect(getHandlerBody(src).length, `${f} has no GET handler to scan`).toBeGreaterThan(50);
    }
  });
});

describe('producer/polls gates its GET', () => {
  it('the poll read requires a session and clears the session access resolver', () => {
    const src = readStripped('src/app/api/producer/polls/route.ts');
    expect(
      gatesPollsGet(src),
      violation(
        'SEC-PRODUCER-POLLS',
        'GET /api/producer/polls no longer answers 401 to an anonymous caller, or no longer routes through ownsSession + canReadSessionPolls. The poll question, options, artist_id and full tallies of a PAID or tier-restricted Executive Producer Session would then be readable by anyone holding the session id.',
        { owner: 'src/lib/live/access.ts', docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12.md' },
      ),
    ).toBe(true);
  });

  it('POSITIVE CONTROL: the predicate flags the pre-fix handler', () => {
    const preFix = `
      export async function GET(req) {
        const { data: { user } } = await supabase.auth.getUser();
        const sessionId = req.nextUrl.searchParams.get('sessionId');
        const { data: polls } = await supabaseAdmin.from('session_polls').select('*').eq('session_id', sessionId);
        return NextResponse.json({ enabled: true, polls });
      }
    `;
    expect(gatesPollsGet(preFix)).toBe(false);

    // 401 alone is not enough: reading ANY session's polls once signed in is still an IDOR.
    const authOnly = `
      export async function GET(req) {
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        return NextResponse.json({ polls });
      }
    `;
    expect(gatesPollsGet(authOnly)).toBe(false);

    // Ownership alone is not enough either: fans legitimately read polls, so the entitlement
    // resolver has to be there too.
    const ownerOnly = `
      export async function GET(req) {
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const owner = await ownsSession(admin, sessionId, user.id);
        return NextResponse.json({ polls });
      }
    `;
    expect(gatesPollsGet(ownerOnly)).toBe(false);

    // Sanity: the compliant shape passes, so the predicate is not always-false.
    const fixed = `
      export async function GET(req) {
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const owner = await ownsSession(admin, sessionId, user.id);
        if (!owner) { const access = await canReadSessionPolls(sessionId, user.id); }
        return NextResponse.json({ polls });
      }
    `;
    expect(gatesPollsGet(fixed)).toBe(true);
  });
});
