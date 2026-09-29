import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveFounderFollowUp,
  renderFounderFollowUp,
  founderFollowUpKey,
  RESULT_LINK_PLACEHOLDER,
  QUIET_HOURS,
  type FollowUpEvidence,
} from './founderFollowUp';
import { SETUP_SCREEN_ORDER, firstIncompleteSetupScreen } from '../setupProgress';

const NOW = new Date('2026-10-01T05:00:00Z');
const DAYS_AGO = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

type Account = NonNullable<FollowUpEvidence['account']>;
const fullSetup = { artistId: 'a1', hasAvatar: true, hasMusic: true, hasTier: true, stripeConnected: true, hasProduct: true };

function lead(over: Partial<FollowUpEvidence> = {}): FollowUpEvidence {
  return {
    identityId: 'lead-1',
    instagramUsername: 'someartist',
    scoreBand: 'sales_priority',
    leadScore: 70,
    reasonCodes: ['direct_monetization_proven', 'tier1_audience'],
    displayName: 'Nia Rivers',
    email: { address: 'nia@example.com', consent: true, identityStatus: 'active', suppressed: false },
    result: {
      id: 'r1',
      toolSlug: 'worth',
      toolName: 'fanbase worth calculator',
      title: 'About $12,000 a month is sitting on the table',
      builderSaved: false,
    },
    account: null,
    call: { requested: false, booked: false },
    lastActivity: { label: 'Opened their result', at: DAYS_AGO(3) },
    nurtureInFlight: false,
    lastOtherEmailAt: null,
    lastFounderFollowUpAt: null,
    sentStages: {},
    ...over,
  };
}

function account(over: Partial<Account> = {}): Account {
  return {
    userId: 'u1',
    setupCompleted: true,
    setup: fullSetup,
    paidTiers: [
      { name: 'Silver', priceCents: 1000, purchasable: true },
      { name: 'Gold', priceCents: 2500, purchasable: true },
    ],
    chargesReady: true,
    productTitle: null,
    firstPaid: false,
    ...over,
  };
}

const resolve = (e: FollowUpEvidence) => resolveFounderFollowUp(e, NOW);
const render = (e: FollowUpEvidence, url = 'https://thecrwn.app/x') => renderFounderFollowUp(resolve(e), e, url);

describe('founder follow-up: journey stages', () => {
  it('1. sales_priority + result + no account -> continue the saved result, never restart', () => {
    const e = lead();
    const c = resolve(e);
    expect(c.stage).toBe('result_no_account');
    expect(c.continuation).toEqual({ kind: 'result', resultId: 'r1', toolSlug: 'worth' });
    expect(c.decision).toBe('send');
    const m = render(e)!;
    expect(m.text).toContain('About $12,000 a month is sitting on the table');
    expect(m.text).toContain('do not have to answer anything again');
  });

  it('2. result + builder opened -> resumes the saved plan', () => {
    const e = lead({ result: { ...lead().result!, builderSaved: true } });
    expect(resolve(e).stage).toBe('builder_saved_no_account');
    expect(render(e)!.text).toContain('started building the plan');
  });

  it('3. account + setup incomplete -> /setup, naming the screen it resumes on', () => {
    const e = lead({
      account: account({
        setupCompleted: false,
        setup: { ...fullSetup, hasMusic: false },
        productTitle: 'World of love',
      }),
    });
    const c = resolve(e);
    expect(c.stage).toBe('setup_incomplete');
    expect(c.setupScreen).toBe('content-plan');
    expect(c.blocker).toBe('No music uploaded');
    expect(c.continuation).toEqual({ kind: 'path', path: '/setup' });
    const m = render(e)!;
    expect(m.subject).toBe('Nia, your CRWN page is set up except for the music');
    expect(m.text).toContain('Silver ($10) and Gold ($25) are priced');
    expect(m.text).toContain('"World of love" is in your shop');
    // It continues setup; it does not re-sell CRWN or restate the calculator.
    expect(m.text).not.toContain('sitting on the table');
  });

  it('4. setup complete but cannot take money -> the payment blocker, via Rise Mode', () => {
    const noStripe = lead({
      account: account({ chargesReady: false, paidTiers: [{ name: 'Gold', priceCents: 2500, purchasable: false }] }),
    });
    const c = resolve(noStripe);
    expect(c.stage).toBe('offer_not_payable');
    expect(c.blocker).toBe('Stripe is not accepting charges yet');
    expect(c.continuation).toEqual({ kind: 'path', path: '/profile/artist' });
    expect(resolve(lead({ account: account({ paidTiers: [] }) })).blocker).toBe('No paid tier yet');
  });

  it('5. payable, no first paid member -> member number one', () => {
    const e = lead({ account: account() });
    expect(resolve(e).stage).toBe('ready_no_first_paid');
    expect(render(e)!.subject).toContain('member number one');
  });

  it('6. first paid member exists -> no acquisition email, ever', () => {
    const c = resolve(lead({ account: account({ firstPaid: true }) }));
    expect(c.stage).toBe('first_paid');
    expect(c.decision).toBe('none');
    expect(c.dedupeKey).toBeNull();
    expect(render(lead({ account: account({ firstPaid: true }) }))).toBeNull();
  });

  it('7. a founder-call request outranks every product nudge; a booked call hands over to a human', () => {
    const requested = lead({ call: { requested: true, booked: false }, account: account({ setupCompleted: false }) });
    const c = resolve(requested);
    expect(c.stage).toBe('call_requested');
    expect(c.continuation).toEqual({ kind: 'booking' });
    expect(render(requested)!.subject).toContain('the call you asked for');
    const booked = resolve(lead({ call: { requested: true, booked: true } }));
    expect(booked.stage).toBe('call_booked');
    expect(booked.decision).toBe('none');
  });
});

describe('founder follow-up: who never gets one', () => {
  it('8. a lead the scorer did not band sales_priority is never followed up', () => {
    for (const band of ['self_serve', 'nurture', 'unqualified', null]) {
      const c = resolve(lead({ scoreBand: band }));
      expect(c.stage).toBe('not_qualified');
      expect(c.decision).toBe('none');
    }
  });

  it('9. an unsubscribed / opted-out lead gets nothing, not even a hand-send draft decision', () => {
    expect(resolve(lead({ email: { ...lead().email, identityStatus: 'opted_out' } })).decision).toBe('none');
    // The unsubscribe route writes BOTH a suppression row and consent_email=false.
    const unsub = resolve(lead({ email: { ...lead().email, suppressed: true, consent: false } }));
    expect(unsub.decision).toBe('none');
    expect(unsub.decisionReason).toBe('suppressed');
  });

  it('10. a hard bounce or complaint (global suppression) stops it', () => {
    const c = resolve(lead({ email: { ...lead().email, suppressed: true } }));
    expect(c.decision).toBe('none');
    expect(c.emailEligible).toBe(false);
  });

  it('no email address or no email consent -> hand-send only, never automated', () => {
    expect(resolve(lead({ email: { ...lead().email, address: null } })).decision).toBe('manual_only');
    expect(resolve(lead({ email: { ...lead().email, consent: false } })).decision).toBe('manual_only');
  });
});

describe('founder follow-up: dedupe and timing', () => {
  it('11. a stage already sent (by the cron, a retry, or by hand) is never sent again', () => {
    const e = lead();
    const key = resolve(e).dedupeKey;
    // Same lead, same stage: same key on every run (a rescore or reload cannot mint a new one).
    expect(resolve(lead({ leadScore: 90, reasonCodes: ['engaged_with_result'] })).dedupeKey).toBe(key);
    expect(key).toBe(founderFollowUpKey('lead-1', 'result_no_account'));
    for (const sent of [
      { status: 'processed', at: DAYS_AGO(9), error: null, manual: false },
      { status: 'processing', at: DAYS_AGO(9), error: null, manual: false },
      { status: 'skipped', at: DAYS_AGO(9), error: 'resend_error', manual: false },
      { status: 'processed', at: DAYS_AGO(9), error: null, manual: true },
    ]) {
      expect(resolve(lead({ sentStages: { result_no_account: sent } })).decision).toBe('none');
    }
  });

  it('12. a lead who progressed gets the NEW stage (new key); the old stage is never sent', () => {
    const before = resolve(lead());
    const after = resolve(
      lead({
        account: account({ setupCompleted: false, setup: { ...fullSetup, hasMusic: false } }),
        sentStages: {},
        lastActivity: { label: 'Started setup', at: DAYS_AGO(3) },
      }),
    );
    expect(after.stage).toBe('setup_incomplete');
    expect(after.dedupeKey).not.toBe(before.dedupeKey);
    expect(render(lead({ account: account({ setupCompleted: false }) }))!.text).not.toContain('saved result');
  });

  it('holds while the lead is active, after a recent email, and while the nurture queue runs', () => {
    const active = resolve(lead({ lastActivity: { label: 'Started setup', at: new Date(NOW.getTime() - 3_600_000).toISOString() } }));
    expect(active.decision).toBe('wait');
    expect(active.decisionReason).toBe('recent_activity');
    expect(Date.parse(active.nextEligibleAt!)).toBe(NOW.getTime() - 3_600_000 + QUIET_HOURS * 3_600_000);
    expect(resolve(lead({ lastOtherEmailAt: DAYS_AGO(1) })).decisionReason).toBe('recent_crwn_email');
    expect(resolve(lead({ lastFounderFollowUpAt: DAYS_AGO(3) })).decisionReason).toBe('recent_founder_follow_up');
    expect(resolve(lead({ nurtureInFlight: true })).decisionReason).toBe('acquisition_nurture_in_flight');
    // The acquisition nurture stops at signup, so it cannot hold an account holder.
    expect(resolve(lead({ nurtureInFlight: true, account: account() })).decision).toBe('send');
  });
});

describe('founder follow-up: copy', () => {
  it('13. missing optional personalization never invents a fact', () => {
    const bare = lead({
      displayName: null,
      result: { id: 'r1', toolSlug: 'worth', toolName: null, title: null, builderSaved: false },
    });
    const m = render(bare)!;
    expect(m.text.startsWith('Hey,')).toBe(true);
    expect(m.text).not.toMatch(/undefined|null|\$\{|NaN/);
    expect(m.text).not.toContain('came back with');
    const noDone = render(lead({ displayName: 'user@example.com', account: account({ setupCompleted: false, setup: { ...fullSetup, hasMusic: false }, paidTiers: [], chargesReady: false }) }))!;
    expect(noDone.text.startsWith('Hey,')).toBe(true);
    expect(noDone.text).toContain('You started setting up your CRWN page.');
  });

  it('never quotes the monetization answer (a normalizer can be wrong)', () => {
    for (const e of [lead(), lead({ account: account() }), lead({ account: account({ setupCompleted: false }) })]) {
      const m = render(e)!;
      expect(m.text).not.toMatch(/already (sell|sold)|paid you directly|merch|monetiz/i);
    }
  });

  it('every template is free of em and en dashes and has exactly one link', () => {
    const url = 'https://thecrwn.app/setup';
    const cases = [
      lead(),
      lead({ result: { ...lead().result!, builderSaved: true } }),
      lead({ call: { requested: true, booked: false } }),
      lead({ account: account({ setupCompleted: false, setup: { ...fullSetup, hasMusic: false } }) }),
      lead({ account: account({ setupCompleted: false, setup: { ...fullSetup, hasAvatar: false } }) }),
      lead({ account: account({ setupCompleted: false, setup: { ...fullSetup, stripeConnected: false } }) }),
      lead({ account: account({ setupCompleted: false }) }),
      lead({ account: account({ paidTiers: [] }) }),
      lead({ account: account() }),
    ];
    for (const e of cases) {
      const m = renderFounderFollowUp(resolve(e), e, url)!;
      expect(`${m.subject}\n${m.text}\n${m.html}`).not.toMatch(/[–—]/);
      expect(m.text.split(url).length - 1).toBe(1);
      expect(m.text.endsWith('\n\nJosh')).toBe(true);
    }
  });

  it('14. the continuation link is the artist’s own saved journey', () => {
    // Pre-signup: the result link is minted at send time; a preview never fakes one.
    const pre = resolve(lead());
    expect(pre.continuation).toEqual({ kind: 'result', resultId: 'r1', toolSlug: 'worth' });
    expect(render(lead(), RESULT_LINK_PLACEHOLDER)!.text).toContain(RESULT_LINK_PLACEHOLDER);
    // In setup: /setup, which resumes on the same screen the resolver named.
    const facts = { ...fullSetup, hasMusic: false };
    expect(firstIncompleteSetupScreen(facts)).toBe(resolve(lead({ account: account({ setupCompleted: false, setup: facts }) })).setupScreen);
  });
});

describe('founder follow-up: boundaries', () => {
  const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

  it('15. introduces no parallel ICP scoring: the stored band is the only qualification input', () => {
    for (const f of ['founderFollowUp.ts', 'founderFollowUpServer.ts']) {
      // Code only: the files' comments explain what they refuse to read, by name.
      const src = read(f)
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l))
        .join('\n');
      expect(src).not.toMatch(/from '\.\/leadScoring'|scoreLead\(|bandFor\(|recomputeScore/);
      // Any numeric cut on a score ("leadScore >= 67", "(e.leadScore ?? 0) < 67", "lead_score > 60").
      expect(src).not.toMatch(/[sS]core\b[^\n;]{0,24}(>=|<=|>|<)\s*\d/);
      expect(src).not.toMatch(/monthly_listeners|social_followers|monetization_status/);
    }
    expect(read('founderFollowUp.ts')).toMatch(/scoreBand !== 'sales_priority'/);
  });

  it('sends only through the channels.send choke point, as the founder, keyed by stage', () => {
    const src = read('founderFollowUpServer.ts');
    expect(src).not.toMatch(/resend\.emails\.send/);
    expect(src).toMatch(/await send\(\{/);
    expect(src).toMatch(/idempotencyKey: f\.context\.dedupeKey/);
    expect(src).toMatch(/from: FOUNDER_FROM/);
    expect(src).toMatch(/replyTo: ADMIN_NOTIFY_EMAIL/);
    // Nothing is queued: the runner resolves the live state right before it sends.
    expect(src).not.toMatch(/enqueue\(/);
  });

  it('the wizard and the resolver share one setup-screen rule, in the same order', () => {
    const page = readFileSync(join(__dirname, '../../app/setup/page.tsx'), 'utf8');
    expect(page).toMatch(/return setupScreenDone\(s\.key, setup\)/);
    const block = page.slice(page.indexOf('const SCREENS: ScreenDef[] = ['), page.indexOf('];', page.indexOf('const SCREENS')));
    const keys = [...block.matchAll(/\{ key: '([a-z-]+)'/g)].map((m) => m[1]);
    expect(keys).toEqual([...SETUP_SCREEN_ORDER]);
  });
});
