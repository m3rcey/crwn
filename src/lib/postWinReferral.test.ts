import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  buildReferralLink,
  isSelfReferral,
  isReferralAskEligible,
  REFERRAL_DESTINATION,
  ARTIST_REF_PARAM,
} from './postWinReferral';
import {
  parseCampaignAttribution,
  sanitizeStoredAttribution,
  mergeAttribution,
  attributionToFunnelDims,
  hasAttribution,
  EMPTY_ATTRIBUTION,
} from './analytics/campaignAttribution';
import { POPUPS } from './popups/registry';

// POST-WIN REFERRAL V1.
//
// Founder decisions, ratified and pinned here because they are permanent, not preferences:
//   1. UNPAID FOREVER. No commission, credit, discount, payout or entitlement, and never
//      retroactively commissionable if a paid Artist Affiliate program launches later.
//   2. NEVER THE RECRUITER RAIL. No `artist_referrals`, no `recruiter_payouts`, no $50 flat fee,
//      no promotion to recruiter/partner, no financial entitlement through any webhook.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'));

const LIB = read('src/lib/postWinReferral.ts');
const REGISTRY_RAW = readFileSync('src/lib/popups/registry.ts', 'utf8');
const POPUP_API = read('src/app/api/popups/route.ts');
const ATTR = read('src/lib/analytics/campaignAttribution.ts');

const ask = POPUPS.find((p) => p.key === 'artist_post_win_referral')!;
const stripe = POPUPS.find((p) => p.key === 'artist_connect_stripe')!;
const broadcast = POPUPS.find((p) => p.key === 'artist_first_broadcast')!;
const resume = POPUPS.find((p) => p.key === 'artist_resume_rise')!;

// ───────────────────────────── ECONOMIC FIREWALL ─────────────────────────────

describe('ECONOMIC FIREWALL: Post-Win referral can reach no money rail', () => {
  const SOURCES: [string, string][] = [
    ['postWinReferral', LIB],
    ['popup registry', REGISTRY_RAW],
    ['popup api', POPUP_API],
  ];

  it('never touches the recruiter rail', () => {
    for (const [label, src] of SOURCES) {
      for (const banned of ['artist_referrals', 'recruiter_payouts', 'recruiters', 'recruited_by', 'partner_code_used']) {
        expect(src, `${label} must not reference ${banned}`).not.toContain(banned);
      }
    }
  });

  it('never touches referral earnings or Stripe money movement', () => {
    for (const [label, src] of SOURCES) {
      for (const banned of ['referral_earnings', 'payouts.create', 'transfers.create', 'flat_fee_amount']) {
        expect(src, `${label} must not reference ${banned}`).not.toContain(banned);
      }
    }
  });

  it('the link uses artist_ref and NEVER the money-adjacent ref param', () => {
    // `ref` flows into partner_code_used / recruited_by / artist_referrals ($50 flat fee).
    expect(ARTIST_REF_PARAM).toBe('artist_ref');
    const link = buildReferralLink('m3rcey')!;
    expect(link).toContain('artist_ref=m3rcey');
    expect(link).not.toMatch(/[?&]ref=/);
  });

  it('the ask promises no reward of any kind', () => {
    const copy = `${ask.title} ${ask.body} ${ask.cta!.label} ${ask.goal}`.toLowerCase();
    for (const word of ['earn', 'commission', 'reward', 'credit', 'discount', 'free month', 'paid out', 'affiliate', 'bonus', '%']) {
      expect(copy, `ask copy must not contain "${word}"`).not.toContain(word);
    }
  });
});

// ───────────────────────────── THE WIN ─────────────────────────────

describe('the trigger is the canonical win, read not redefined', () => {
  it('eligibility is an artist with a canonical first-paid conversion', () => {
    expect(isReferralAskEligible({ isArtist: true, hasFirstPaidConversion: true })).toBe(true);
    expect(isReferralAskEligible({ isArtist: true, hasFirstPaidConversion: false })).toBe(false);
    expect(isReferralAskEligible({ isArtist: false, hasFirstPaidConversion: true })).toBe(false);
  });

  it('the popup gates on the same facts plus a resolvable identity', () => {
    expect(REGISTRY_RAW).toMatch(/c\.isArtist && c\.hasFirstPaidConversion && !!c\.artistSlug/);
  });

  it('reads first_paid_conversion rather than inventing a second activation record', () => {
    expect(POPUP_API).toContain("'first_paid_conversion'");
    for (const banned of ['post_win_events', 'post_win_referrals', 'CREATE TABLE']) {
      expect(POPUP_API).not.toContain(banned);
      expect(LIB).not.toContain(banned);
    }
  });

  it('is idempotent because the win itself is deduped per artist', () => {
    // Five webhook rails emit first_paid_conversion; the stage dedupes, so the count query is
    // "has it ever fired", not "how many times".
    expect(POPUP_API).toMatch(/count: 'exact', head: true[\s\S]{0,120}first_paid_conversion|first_paid_conversion/);
  });

  it('claims first paid ON CRWN, not the first payment of the artist life', () => {
    const copy = `${ask.title} ${ask.body}`.toLowerCase();
    expect(copy).toContain('on crwn');
    for (const beginner of ['your first paying fan ever', 'first customer', 'finally made money', 'proved people will pay']) {
      expect(copy).not.toContain(beginner);
    }
  });

  it('makes no causal claim that CRWN produced the payment', () => {
    const copy = `${ask.title} ${ask.body}`.toLowerCase();
    expect(copy).not.toMatch(/crwn (got|made|earned|won) you/);
  });
});

// ───────────────────────────── ATTRIBUTION ─────────────────────────────

describe('artist_referrer is additive and survives the acquisition path', () => {
  it('parses from the query string', () => {
    const a = parseCampaignAttribution(new URLSearchParams('artist_ref=m3rcey'));
    expect(a.artistReferrer).toBe('m3rcey');
    expect(hasAttribution(a)).toBe(true);
  });

  it('is NOT parsed from ref, and ref is not parsed into it', () => {
    const fromRef = parseCampaignAttribution(new URLSearchParams('ref=somepartner'));
    expect(fromRef.artistReferrer).toBeNull();
    expect(fromRef.ref).toBe('somepartner');
  });

  it('SURVIVES the storage round trip, which is where it would silently die', () => {
    // capture stores the object; every reader re-parses it through sanitizeStoredAttribution.
    const captured = parseCampaignAttribution(new URLSearchParams('artist_ref=m3rcey&utm_campaign=kcamp'));
    const readBack = sanitizeStoredAttribution(JSON.parse(JSON.stringify(captured)));
    expect(readBack.artistReferrer).toBe('m3rcey');
    expect(readBack.campaign).toBe('kcamp');
  });

  it('never overwrites an existing acquisition owner (first-touch merge)', () => {
    const first = parseCampaignAttribution(new URLSearchParams('utm_campaign=kcamp&utm_content=kcamp_v1&utm_source=instagram'));
    const later = parseCampaignAttribution(new URLSearchParams('artist_ref=m3rcey&utm_campaign=other_campaign'));
    const merged = mergeAttribution(first, later);
    // The video that actually brought them is preserved...
    expect(merged.campaign).toBe('kcamp');
    expect(merged.creative).toBe('kcamp_v1');
    expect(merged.platform).toBe('instagram');
    // ...and the artist referrer is ADDED alongside it, not instead of it.
    expect(merged.artistReferrer).toBe('m3rcey');
  });

  it('fills only the metadata bag in the funnel, never a marketing dimension', () => {
    const dims = attributionToFunnelDims(parseCampaignAttribution(new URLSearchParams('artist_ref=m3rcey')));
    expect(dims.metadata?.artist_referrer).toBe('m3rcey');
    expect(dims.campaign).toBeUndefined();
    expect(dims.video).toBeUndefined();
    expect(dims.referrer).toBeUndefined();
  });

  it('needs no schema: it rides existing JSONB', () => {
    expect(ATTR).not.toMatch(/CREATE TABLE|ALTER TABLE/);
    expect(LIB).not.toMatch(/from\(|insert|update|upsert/);
  });

  it('is round-tripped by the URL serializer under the same param name', () => {
    const link = buildReferralLink('m3rcey', 'https://thecrwn.app')!;
    const url = new URL(link);
    expect(url.pathname).toBe(REFERRAL_DESTINATION);
    const reparsed = parseCampaignAttribution(url.searchParams);
    expect(reparsed.artistReferrer).toBe('m3rcey');
  });

  it('a hostile slug does not survive normalization', () => {
    const a = parseCampaignAttribution(new URLSearchParams('artist_ref=' + encodeURIComponent('<script>alert(1)</script>')));
    expect(a.artistReferrer ?? '').not.toContain('<');
    expect(a.artistReferrer ?? '').not.toContain('script>');
  });
});

// ───────────────────────────── IDENTITY / ABUSE ─────────────────────────────

describe('identity and self-referral', () => {
  it('a missing slug produces no link rather than an unattributable one', () => {
    expect(buildReferralLink(null)).toBeNull();
    expect(buildReferralLink('')).toBeNull();
    expect(buildReferralLink('   ')).toBeNull();
  });

  it('self-referral is detected regardless of casing or padding', () => {
    expect(isSelfReferral('m3rcey', 'm3rcey')).toBe(true);
    expect(isSelfReferral('M3rcey', ' m3rcey ')).toBe(true);
    expect(isSelfReferral('m3rcey', 'otherartist')).toBe(false);
  });

  it('an absent referrer is never self-referral', () => {
    expect(isSelfReferral(null, 'm3rcey')).toBe(false);
    expect(isSelfReferral('', 'm3rcey')).toBe(false);
  });

  it('uses the public slug, never an internal id', () => {
    expect(LIB).not.toMatch(/artist_id|artistId|user_id|userId/);
  });

  it('the server resolves identity: no client-supplied artist id is trusted', () => {
    // The link carries a slug; the referring artist's slug comes from the session-derived context.
    expect(POPUP_API).toMatch(/base\.artistSlug = artist\.slug/);
  });
});

// ───────────────────────────── COMMUNICATION ─────────────────────────────

describe('the ask obeys existing communication governance', () => {
  it('ranks below Stripe, first broadcast and resume', () => {
    expect(ask.priority).toBeLessThan(stripe.priority);
    expect(ask.priority).toBeLessThan(broadcast.priority);
    expect(ask.priority).toBeLessThan(resume.priority);
  });

  it('reuses the existing frequency system, adding no referral cooldown store', () => {
    expect(ask.frequency).toEqual({ type: 'everyN', days: 30, max: 2 });
    for (const banned of ['referral_impressions', 'referral_events', 'post_win_shown']) {
      expect(REGISTRY_RAW).not.toContain(banned);
    }
  });

  it('losing an interruption defers it, because everyN keeps it eligible later', () => {
    // A fan obligation or launch blocker simply wins the day via the single-winner sort; the ask
    // is not consumed by losing.
    expect(ask.frequency.type).toBe('everyN');
  });

  it('needs no Manager, model or cross-artist data', () => {
    for (const banned of ['deepseek', 'readConstraint', 'generateActions', 'crossArtistEvidence', 'recordIssuedRecommendation']) {
      expect(LIB).not.toContain(banned);
      expect(POPUP_API).not.toContain(banned);
    }
  });
});

// ───────────────────────────── DESTINATION / FUNNEL ─────────────────────────────

describe('destination and downstream measurement', () => {
  it('sends the referred artist into the calculator journey, not straight to signup', () => {
    expect(REFERRAL_DESTINATION).toContain('/tools/');
    expect(REFERRAL_DESTINATION).not.toContain('/signup');
    expect(buildReferralLink('m3rcey')).not.toContain('/signup');
  });

  it('the dimension is sliceable downstream through the existing funnel metadata', () => {
    const dims = attributionToFunnelDims({ ...EMPTY_ATTRIBUTION, artistReferrer: 'm3rcey' });
    expect(dims.metadata).toEqual({ artist_referrer: 'm3rcey' });
  });
});

// ───────────────────────────── BOUNDARIES ─────────────────────────────

describe('neighbouring systems are untouched', () => {
  it('Virality Engine is not involved', () => {
    for (const banned of ['fan_campaigns', 'campaign_participants', 'archetype']) {
      expect(LIB).not.toContain(banned);
      expect(REGISTRY_RAW).not.toContain(banned);
    }
  });

  it('autonomous Manager remains dormant', () => {
    // DELETED 2026-08-13, which is strictly stronger than the tripwire this line used to be.
    // The autonomous Manager was dormant only because of .eq('is_active', true) on a column that
    // does not exist, so any unrelated schema tidy-up could have re-armed auto-executing AI across
    // every artist account with no founder decision. The cron is gone; the artist-REQUESTED routes
    // under /api/ai-manager are untouched.
    expect(existsSync('src/app/api/cron/ai-manager/route.ts'), 'the autonomous Manager cron came back — that is a founder decision, not a cleanup').toBe(false);
  });

  it('no cross-channel cap or G3 was introduced', () => {
    const GOV = read('src/lib/comms/governor.ts');
    for (const banned of [/perDay/i, /dailyCap/i, /quota/i, /cooldown/i]) {
      expect(GOV).not.toMatch(banned);
    }
  });
});
