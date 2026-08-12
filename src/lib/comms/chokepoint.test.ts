import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NOTIFICATION_TAXONOMY, classifyNotification, isGovernable } from './taxonomy';

// F-06 (product consistency audit, 2026-08-12): the notification chokepoint, enforced.
//
// `createNotification` claims to be THE writer for CRWN-originated artist notifications, and
// until this remediation nine files quietly wrote around it, twelve of their types unknown to
// the governor. Nothing was lost (unknown types deliver), but the governor could not rank the
// money types it most existed to rank. This suite walks the source and pins the boundary:
//
//   A direct `from('notifications').insert` is allowed ONLY for types the taxonomy itself
//   marks ungovernable (a fan's own truth, or the artist's own voice reaching their fans).
//   Every CRWN-originated ARTIST notification goes through `createNotification`.
//
// This is deliberately narrow: it protects exactly the defect F-06 found. The full
// cross-product drift-prevention framework is the NEXT task, not this file.

const SRC = 'src';

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) acc.push(p);
  }
  return acc;
}

/** Files allowed to write `notifications` directly, and WHY. */
const DIRECT_WRITER_ALLOWLIST: Record<string, string> = {
  // The chokepoint itself.
  'src/lib/notifications.ts': 'the canonical writer',
  // Artist-authored communication: CRWN must never govern an artist speaking to their fans.
  'src/app/api/messages/broadcast/route.ts': 'artist-authored broadcast to fans',
  'src/app/api/notifications/notify-subscribers/route.ts': 'artist-authored fan notifications',
  // Fan-facing truths (every type they write is ungovernable, asserted below).
  'src/lib/webhookHandlers.ts': 'fan-facing sends only: referral_earning + buyer live_ticket_confirmed',
  'src/lib/referrals.ts': 'referral_earning to the referrer fan',
  'src/lib/bountyNotify.ts': 'bounty_available to clipper fans',
  'src/app/api/city-unlocks/[id]/contribute/route.ts': 'city_unlocked to contributor fans',
  'src/app/api/cron/clipper-rate-drops/route.ts': 'clipper_rate_change to clipper fans',
  'src/app/api/promise-calendar/events/[id]/route.ts': 'promise_fulfilled to eligible fans',
  'src/app/api/release-credits/route.ts': 'release_credit to credited fans',
};

const files = walk(SRC);
const directWriters = files.filter((f) => {
  const src = readFileSync(f, 'utf8');
  return /from\('notifications'\)\s*\.?\s*insert/.test(src.replace(/\n\s*/g, ''));
});

describe('the chokepoint boundary (F-06)', () => {
  it('every direct notifications writer is on the documented allowlist', () => {
    const normalized = directWriters.map((f) => f.replace(/\\/g, '/'));
    for (const f of normalized) {
      expect(
        DIRECT_WRITER_ALLOWLIST[f],
        `${f} writes notifications directly but is not allowlisted — route it through createNotification`,
      ).toBeTruthy();
    }
  });

  it('every allowlisted file still exists and still writes (no stale allowlist entries)', () => {
    const normalized = new Set(directWriters.map((f) => f.replace(/\\/g, '/')));
    for (const f of Object.keys(DIRECT_WRITER_ALLOWLIST)) {
      expect(normalized.has(f), `${f} is allowlisted but no longer writes directly — remove it`).toBe(true);
    }
  });

  it('every type a direct writer sends is classified UNGOVERNABLE (fan-facing or artist-authored)', () => {
    // The allowlist is not a names list, it is a semantics rule: a direct write is legitimate
    // only when governance could never apply to it. The two artist-authored routes accept the
    // artist's own type strings and are exempt from per-type assertion.
    const artistAuthored = new Set([
      'src/app/api/messages/broadcast/route.ts',
      'src/app/api/notifications/notify-subscribers/route.ts',
    ]);
    for (const f of directWriters) {
      const norm = f.replace(/\\/g, '/');
      if (norm === 'src/lib/notifications.ts' || artistAuthored.has(norm)) continue;
      const src = readFileSync(f, 'utf8');
      // Types written by direct inserts in this file.
      const types = [...src.matchAll(/from\('notifications'\)[\s\S]{0,400}?type:\s*'([a-z_]+)'/g)].map(
        (m) => m[1],
      );
      expect(types.length, `${norm}: could not extract any direct-insert type`).toBeGreaterThan(0);
      for (const t of types) {
        const c = classifyNotification(t);
        expect(c, `${norm}: direct-insert type '${t}' is unclassified — add it to the taxonomy`).toBeTruthy();
        expect(
          isGovernable(c!),
          `${norm}: direct-insert type '${t}' is GOVERNABLE artist communication — it must go through createNotification`,
        ).toBe(false);
      }
    }
  });
});

describe('the twelve types F-06 found unclassified are now classified', () => {
  it.each([
    ['refund', 'critical'],
    ['dispute', 'critical'],
    ['live_ticket', 'critical'],
    ['live_tip', 'critical'],
    ['new_booking', 'critical'],
    ['milestone', 'celebration'],
  ] as const)('artist money/celebration type %s is class %s', (type, cls) => {
    const c = NOTIFICATION_TAXONOMY[type];
    expect(c).toBeTruthy();
    expect(c.class).toBe(cls);
    expect(c.audience).toBe('artist');
  });

  it.each([
    'referral_earning',
    'clipper_rate_change',
    'city_unlocked',
    'release_credit',
    'bounty_available',
    'promise_fulfilled',
  ])('fan truth type %s is classified and ungoverned', (type) => {
    const c = classifyNotification(type);
    expect(c).toBeTruthy();
    expect(isGovernable(c!)).toBe(false);
  });

  it('money truth fails open: no critical type is deferrable', () => {
    for (const [type, c] of Object.entries(NOTIFICATION_TAXONOMY)) {
      if (c.class === 'critical') {
        expect(c.deferrable, `${type} is critical and must never be deferrable`).toBe(false);
      }
    }
  });
});

describe('the governed producers actually use the chokepoint now', () => {
  it.each([
    ['src/lib/webhookHandlers.ts', 13],
    ['src/lib/milestones.ts', 1],
    ['src/lib/promiseTasks.ts', 1],
  ])('%s calls createNotification at least %i times', (file, min) => {
    const src = readFileSync(file, 'utf8');
    expect((src.match(/createNotification\(/g) || []).length).toBeGreaterThanOrEqual(min);
  });

  it('webhookHandlers keeps exactly its two fan-facing direct sends, no more', () => {
    const src = readFileSync('src/lib/webhookHandlers.ts', 'utf8');
    const directs = [...src.matchAll(/from\('notifications'\)[\s\S]{0,400}?type:\s*'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(directs.sort()).toEqual(['live_ticket_confirmed', 'referral_earning']);
  });
});
