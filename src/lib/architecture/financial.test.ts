// Money-boundary walks that close CLASSES the per-file suites cannot:
// MONEY-004  no new earnings writer appears anywhere in src
// MONEY-005  Post-Win referral code can never reach the recruiter money rail
// MEASURE-001/002  no admin logic re-derives "activated" off-canon
import { describe, it, expect } from 'vitest';
import { listSourceFiles, readStripped, violation } from './sourceScan';
import { ADMIN_ACTIVATED_EXCEPTIONS, EARNINGS_WRITER_EXCEPTIONS } from './exceptions';

// The registry and exception modules quote banned tokens by design; the drift
// system never scans itself.
const files = listSourceFiles('src').filter(f => !f.startsWith('src/lib/architecture/'));
const collapsed = (f: string) => readStripped(f).replace(/\n\s*/g, '');

describe('MONEY-004 — earnings writer containment', () => {
  const CANONICAL_WRITER = 'src/lib/webhookHandlers.ts';
  const allowed = new Set([CANONICAL_WRITER, ...EARNINGS_WRITER_EXCEPTIONS.map(e => e.subject)]);

  it('files inserting into the earnings table are exactly the canonical handler + registered exceptions', () => {
    const writers = files.filter(f => /from\(['"]earnings['"]\)\.?(insert|upsert)\(/.test(collapsed(f)));
    const rogue = writers.filter(f => !allowed.has(f));
    expect(
      rogue,
      violation(
        'MONEY-004',
        `new earnings writer(s): ${rogue.join(', ')}. Every earning row's net derivation is audited in webhookHandlers.ts; a second writer is a second formula. Add the rail there, or register an exception in src/lib/architecture/exceptions.ts with a reason.`,
        { owner: CANONICAL_WRITER, docs: 'docs/crwn-brain/07-BUSINESS-RULES.md' },
      ),
    ).toEqual([]);
    // Positive control: the canonical writer is still detected by this exact pattern.
    expect(writers, 'the scan no longer detects webhookHandlers.ts inserting earnings — the pattern is examining the wrong thing').toContain(CANONICAL_WRITER);
  });

  it('registered earnings-writer exceptions are still real (stale allowlist detection)', () => {
    for (const e of EARNINGS_WRITER_EXCEPTIONS) {
      expect(
        /from\(['"]earnings['"]\)\.?(insert|upsert)\(/.test(collapsed(e.subject)),
        `${e.subject} is excepted from MONEY-004 but no longer writes earnings — remove the exception`,
      ).toBe(true);
    }
  });
});

describe('MONEY-005 — Post-Win economic firewall (architecture level)', () => {
  const RECRUITER_TOKENS = /artist_referrals|recruiter_payouts|recruited_by|partner_code_used|flat_fee_amount|payouts\s*\.\s*create|transfers\s*\.\s*create/;

  it('every consumer of the Post-Win module stays off the recruiter money rail', () => {
    const consumers = files.filter(f => {
      if (f === 'src/lib/postWinReferral.ts') return true;
      const src = readStripped(f);
      return /from\s+['"]@\/lib\/postWinReferral['"]/.test(src) || src.includes('buildReferralLink');
    });
    expect(consumers.length, 'the Post-Win module has no consumers at all — its delivery surface was removed (see REACH-001)').toBeGreaterThan(1);
    for (const f of consumers) {
      const m = readStripped(f).match(RECRUITER_TOKENS);
      expect(
        m,
        violation(
          'MONEY-005',
          `${f} touches Post-Win referral AND the recruiter money rail (${m?.[0]}). Post-Win artist referrals are unpaid forever (ratified founder policy); a paid Artist Affiliate program must be a separate program.`,
          { file: f, docs: 'docs/crwn-brain/25-POST-WIN-REFERRAL.md' },
        ),
      ).toBeNull();
    }
  });

  it('files handling the artist_ref param never handle recruiter identifiers', () => {
    const artistRefFiles = files.filter(f => readStripped(f).includes("'artist_ref'"));
    expect(artistRefFiles.length, 'no file references artist_ref — the Post-Win attribution rail was removed').toBeGreaterThan(0);
    for (const f of artistRefFiles) {
      const m = readStripped(f).match(/recruited_by|partner_code_used|artist_referrals|recruiter_payouts/);
      expect(
        m,
        violation('MONEY-005', `${f} mixes artist_ref (reporting-only) with recruiter rail token ${m?.[0]}. artist_ref must never flow into recruiter economics.`, {
          file: f,
          docs: 'docs/crwn-brain/25-POST-WIN-REFERRAL.md',
        }),
      ).toBeNull();
    }
  });
});

describe('MEASURE-001/002 — admin activation stays on the canonical definition', () => {
  it('any admin API file that computes an "activated" value sources first_paid_conversion', () => {
    const excepted = new Set(ADMIN_ACTIVATED_EXCEPTIONS.map(e => e.subject));
    const adminFiles = files.filter(f => f.startsWith('src/app/api/admin/') && !excepted.has(f));
    const defining = adminFiles.filter(f => /\bactivated\b\s*[:=]/.test(readStripped(f)));
    expect(defining.length, 'no admin file defines activated at all — the funnel route lost its activation series').toBeGreaterThan(0);
    for (const f of defining) {
      expect(
        readStripped(f).includes('first_paid_conversion'),
        violation(
          'MEASURE-002',
          `${f} defines an "activated" value without sourcing funnel_events first_paid_conversion. Activation = first paid conversion across all six rails; setup milestones are setup_progress, a different concept. If this "activated" is a different, honestly-named concept, register it in ADMIN_ACTIVATED_EXCEPTIONS.`,
          { file: f, owner: 'src/lib/analytics/paidConversion.ts', docs: 'docs/crwn-brain/13-CURRENT-STATE.md' },
        ),
      ).toBe(true);
    }
    // Stale-exception detection.
    for (const e of ADMIN_ACTIVATED_EXCEPTIONS) {
      expect(
        /\bactivated\b\s*[:=]/.test(readStripped(e.subject)),
        `${e.subject} is excepted from MEASURE-002 but no longer defines an activated value — remove the exception`,
      ).toBe(true);
    }
  });

  it('the funnel_events table has exactly one writer (recordFunnelEvent in funnelEvents.ts)', () => {
    const writers = files.filter(f => /from\(['"]funnel_events['"]\)\.?(insert|upsert)\(/.test(collapsed(f)));
    expect(
      writers,
      violation(
        'MEASURE-001',
        `funnel_events gained a writer outside the canonical module: ${writers.filter(f => f !== 'src/lib/analytics/funnelEvents.ts').join(', ')}. Every stage row (including first_paid_conversion) must flow through recordFunnelEvent so dedupe keys and stage names stay canonical.`,
        { owner: 'src/lib/analytics/funnelEvents.ts (recordFunnelEvent)' },
      ),
    ).toEqual(['src/lib/analytics/funnelEvents.ts']);
  });
});
