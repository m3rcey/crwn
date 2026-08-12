import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { governCommunications, type CommsContext } from './governor';
// F-07: interruption arbitration is owned by the Pop-up Engine. The precedence invariants the
// retired selectSingleInterruption encoded are asserted against the registry that decides.
import { POPUPS } from '../popups/registry';
import {
  CLASS_ORDER,
  classRank,
  classifyNotification,
  isGovernable,
  NOTIFICATION_TAXONOMY,
  type CommunicationCandidate,
  type CommunicationClass,
} from './taxonomy';

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'));
const GOV = read('src/lib/comms/governor.ts');
const TAX = read('src/lib/comms/taxonomy.ts');
const NOTIF = read('src/lib/notifications.ts');
const GOV_RAW = readFileSync('src/lib/comms/governor.ts', 'utf8');

const FEED: CommsContext = { channel: 'feed' };

const cand = (cls: CommunicationClass, over: Partial<CommunicationCandidate> = {}): CommunicationCandidate => ({
  key: `k:${cls}`,
  audience: 'artist',
  origin: 'crwn',
  class: cls,
  owner: 'system',
  deferrable: cls !== 'critical',
  ...over,
});

const decide = (ctx: CommsContext, c: CommunicationCandidate) => governCommunications(ctx, [c])[0];

// ───────────────────────────── G1: the pure contract ─────────────────────────

describe('G1 — the governor is pure and governs attention, never diagnosis', () => {
  it('imports no engine, no database, no AI, no clock', () => {
    expect(GOV).not.toContain('readConstraint');
    expect(GOV).not.toContain('assembleConstraintEvidence');
    expect(GOV).not.toContain('supabase');
    expect(GOV).not.toContain('createClient');
    expect(GOV).not.toMatch(/\.from\(/);
    expect(GOV).not.toContain('fetch(');
    expect(GOV).not.toContain('deepseek');
    // Its only import is the taxonomy. Matched on the module SPECIFIER, because the import
    // statement is multi-line and `^import .*$` captures only its first line.
    const specifiers = GOV_RAW.match(/from\s+'([^']+)'/g) ?? [];
    expect(specifiers).toEqual(["from './taxonomy'"]);
  });

  it('does not decide launch readiness, obligations, or whether an event happened', () => {
    expect(GOV).not.toContain('fulfillment_events');
    expect(GOV).not.toContain('roadmap');
    expect(GOV).not.toMatch(/isFanPromiseEvent|onlyFanPromises/);
  });
});

describe('G1 — class ordering is deterministic and single-sourced', () => {
  it('orders exactly as the founder-approved precedence', () => {
    expect([...CLASS_ORDER]).toEqual([
      'critical', 'fan_obligation', 'launch_blocker', 'constraint',
      'event_deadline', 'continuation', 'growth', 'celebration',
    ]);
  });

  it('rank is read off CLASS_ORDER so there is no second ranking', () => {
    expect(classRank('critical')).toBeLessThan(classRank('fan_obligation'));
    expect(classRank('fan_obligation')).toBeLessThan(classRank('launch_blocker'));
    expect(classRank('launch_blocker')).toBeLessThan(classRank('constraint'));
    expect(classRank('constraint')).toBeLessThan(classRank('growth'));
    expect(classRank('growth')).toBeLessThan(classRank('celebration'));
    expect(TAX).toContain('CLASS_ORDER.indexOf');
  });
});

describe('G1 — critical is never withheld', () => {
  it('delivers in a feed regardless of context', () => {
    for (const ctx of [FEED, { ...FEED, launchBlocked: true, hasOpenFanObligation: true }]) {
      const r = decide(ctx, cand('critical'));
      expect(r.decision).toBe('deliver');
      expect(r.reason).toBe('critical:bypass');
    }
  });

  it('wins any single interruption — asserted against the Pop-up Engine, the channel owner (F-07)', () => {
    // The money-blocking pop-up (Stripe not connected) outranks every celebration and every
    // growth/announcement pop-up in the registry that owns interruption arbitration.
    const stripe = POPUPS.find((p) => p.key === 'artist_connect_stripe')!;
    for (const p of POPUPS) {
      if (p.key === 'artist_connect_stripe') continue;
      expect(stripe.priority, `${p.key} must not outrank connect-Stripe`).toBeGreaterThan(p.priority);
    }
  });

  it('no code path can return suppress for a critical candidate', () => {
    const all = CLASS_ORDER.map((c) => cand(c));
    const results = governCommunications({ ...FEED, launchBlocked: true, hasOpenFanObligation: true }, all);
    expect(results.find((r) => r.candidate.class === 'critical')!.decision).toBe('deliver');
    // V1 emits no `suppress` at all: deferral is always reversible, suppression is not.
    expect(results.every((r) => r.decision !== 'suppress')).toBe(true);
  });
});

describe('G1 — founder decision 2: celebrations coexist but never displace', () => {
  it('a celebration coexists with a fan obligation in a FEED', () => {
    const results = governCommunications({ ...FEED, hasOpenFanObligation: true }, [
      cand('fan_obligation'), cand('celebration'),
    ]);
    expect(results.map((r) => r.decision)).toEqual(['coexist', 'coexist']);
    // Neither is withheld; ordering is what expresses the difference.
    expect(results.every((r) => r.decision !== 'defer' && r.decision !== 'suppress')).toBe(true);
  });

  it('the Post-Win celebration is outranked by every operating pop-up (F-07)', () => {
    // A celebration never displaces money truth or activation work in the interruption
    // channel. Post-Win (priority 30) sits below Stripe (100), the first broadcast (80),
    // both break-even modals (75) and resume (40) in the owning registry.
    const postWin = POPUPS.find((p) => p.key === 'artist_post_win_referral')!;
    for (const key of ['artist_connect_stripe', 'artist_first_broadcast', 'artist_pro_break_even', 'artist_scale_break_even', 'artist_resume_rise']) {
      const p = POPUPS.find((x) => x.key === key)!;
      expect(p.priority, `${key} must outrank the Post-Win celebration`).toBeGreaterThan(postWin.priority);
    }
  });

  it('losing an interruption defers, never deletes: recurring pop-ups stay eligible later', () => {
    // The engine has no suppress: a pop-up that loses today is re-eligible tomorrow under its
    // own frequency. Every non-announcement recurring pop-up therefore uses everyN, and the
    // celebration specifically is everyN, not once.
    const postWin = POPUPS.find((p) => p.key === 'artist_post_win_referral')!;
    expect(postWin.frequency.type).toBe('everyN');
  });
});

describe('G1 — the interruption channel has exactly ONE owner (F-07)', () => {
  it('the retired second owner stays retired', () => {
    expect(GOV_RAW).not.toContain('export function selectSingleInterruption');
  });

  it('the Pop-up Engine still enforces one interruption per user per day', () => {
    const engine = readFileSync('src/lib/popups/index.ts', 'utf8');
    expect(engine).toMatch(/one (shown )?pop-?up per (user per )?(calendar )?day/i);
  });

  it('the ownership split is documented where the retired function lived', () => {
    expect(GOV_RAW).toContain('INTERRUPTION ARBITRATION LIVES IN THE POP-UP ENGINE');
  });

  it('growth defers in a feed only when the caller POSITIVELY knows a blocking state', () => {
    expect(decide({ ...FEED, launchBlocked: true }, cand('growth')).decision).toBe('defer');
    expect(decide({ ...FEED, hasOpenFanObligation: true }, cand('growth')).decision).toBe('defer');
  });

  it('event and deadline notifications are never deferred for being strategically lower', () => {
    // Factual truth. Governance shapes urgency, it does not erase that something happened.
    const r = decide({ ...FEED, launchBlocked: true, hasOpenFanObligation: true }, cand('event_deadline'));
    expect(r.decision).toBe('coexist');
  });
});

describe('G1 — unknown is unknown, never false', () => {
  it('an absent context defers nothing', () => {
    expect(decide(FEED, cand('growth')).decision).toBe('coexist');
  });

  it('an explicitly false context defers nothing', () => {
    const ctx = { ...FEED, launchBlocked: false, hasOpenFanObligation: false };
    expect(decide(ctx, cand('growth')).decision).toBe('coexist');
  });

  it('deferral requires === true, so undefined can never be read as a blocking state', () => {
    expect(GOV).toContain('context.launchBlocked === true');
    expect(GOV).toContain('context.hasOpenFanObligation === true');
  });

  it('the governor does not pretend to know cross-channel history', () => {
    // There is no shared send log in CRWN, so there is nothing here that reads or claims one.
    expect(GOV).not.toMatch(/lastSent|sentAt|history|alreadySent|sendLog/i);
  });
});

describe('G1 — founder decision 1: NO global cross-channel cap exists', () => {
  it('the governor contains no counter, budget, quota or cooldown', () => {
    for (const banned of [/perDay/i, /dailyCap/i, /maxPerDay/i, /quota/i, /budget/i, /cooldown/i, /rateLimit/i]) {
      expect(GOV, `governor must not implement ${banned}`).not.toMatch(banned);
    }
  });

  it('adds no persistence of any kind', () => {
    expect(GOV).not.toMatch(/insert|update|upsert|delete/i);
    expect(TAX).not.toMatch(/\.from\(|insert|upsert/i);
  });
});

// ───────────────────────────── G2: notifications ─────────────────────────────

describe('G2 — the taxonomy classifies from the type string producers already pass', () => {
  it('classifies artist money and account facts as critical', () => {
    for (const t of ['earning', 'cashout', 'new_purchase', 'new_subscriber', 'subscription_canceled', 'team_split_payout', 'system']) {
      const c = classifyNotification(t)!;
      expect(c, `${t} must classify`).toBeTruthy();
      expect(c.class, `${t} must be critical`).toBe('critical');
      expect(c.deferrable).toBe(false);
    }
  });

  it('classifies quest celebrations as celebration', () => {
    for (const t of ['quest_completed', 'quest_milestone', 'level_up']) {
      expect(classifyNotification(t)!.class).toBe('celebration');
    }
  });

  it('Manager coaching is owned by the CONSTRAINT, not by Manager', () => {
    // Manager is the voice, never the owner of the priority. This is Z4/Z5 surviving into comms.
    const c = classifyNotification('ai_insight')!;
    expect(c.class).toBe('constraint');
    expect(c.owner).toBe('constraint');
    expect(c.owner).not.toBe('manager');
  });

  it('fan-facing and artist-authored notifications are NOT governable', () => {
    for (const t of ['new_track', 'new_post', 'new_shop_item', 'direct_message', 'live_session', 'new_comment']) {
      const c = classifyNotification(t)!;
      expect(isGovernable(c), `${t} must bypass artist governance`).toBe(false);
    }
    // The artist's own voice to their fans must never be governed by CRWN priority.
    for (const t of ['new_track', 'new_post', 'new_shop_item', 'direct_message']) {
      expect(classifyNotification(t)!.origin).toBe('artist_authored');
    }
  });

  it('an unknown type is ungoverned, not withheld', () => {
    expect(classifyNotification('a_brand_new_type_nobody_classified')).toBeNull();
    // And the chokepoint delivers it.
    expect(NOTIF).toContain("reason: 'ungoverned:unknown_type'");
  });

  it('every classified fan-facing entry really is non-governable', () => {
    for (const [type, c] of Object.entries(NOTIFICATION_TAXONOMY)) {
      if (c.audience === 'fan' || c.origin === 'artist_authored') {
        expect(isGovernable(c), `${type} leaked into artist governance`).toBe(false);
      }
    }
  });
});

describe('G2 — the chokepoint integration', () => {
  it('governs inside createNotification rather than in twelve producers', () => {
    expect(NOTIF).toContain('classifyNotification');
    expect(NOTIF).toContain('governCommunications');
    expect(NOTIF).toMatch(/channel: 'feed'/);
  });

  it('adds no query: classification is a lookup and the governor is pure', () => {
    // The only DB call in the chokepoint remains the notification insert itself.
    expect((NOTIF.match(/from\('notifications'\)/g) || []).length).toBeGreaterThan(0);
    expect(NOTIF).not.toContain('assembleConstraintEvidence');
    expect(NOTIF).not.toContain('readConstraint');
    expect(NOTIF).not.toContain('fulfillment_events');
  });

  it('writes nothing but notifications, and adds no schema', () => {
    const inserts = NOTIF.match(/\.from\('([a-z_]+)'\)/g) || [];
    expect([...new Set(inserts)]).toEqual([".from('notifications')"]);
    expect(NOTIF).not.toMatch(/comms_|communication_log|CREATE TABLE/);
  });

  it('only a deferrable growth message can fail to write, and only on positive context', () => {
    expect(NOTIF).toMatch(/if \(result\.decision === 'defer'\)/);
    expect(NOTIF).toContain('written: false');
  });

  it('reports a structured decision and reason for debuggability', () => {
    // "Why didn't this artist get this notification?" must be answerable without a new event table.
    expect(NOTIF).toMatch(/decision: CommunicationDecision; reason: string; written: boolean/);
  });
});

describe('G2 — boundaries this task must not cross', () => {
  it('does not touch email, popups or artist broadcasts', () => {
    for (const banned of ['resend', 'popup', 'notify-subscribers', 'campaignSender']) {
      expect(NOTIF.toLowerCase(), `chokepoint must not reach ${banned}`).not.toContain(banned.toLowerCase());
    }
  });

  it('leaves the popup engine untouched', () => {
    const POPUP = read('src/lib/popups/index.ts');
    expect(POPUP).not.toContain('governCommunications');
    expect(POPUP).not.toContain('comms/taxonomy');
  });

  it('autonomous Manager remains dormant', () => {
    const CRON = read('src/app/api/cron/ai-manager/route.ts');
    expect(CRON).toMatch(/from\('artist_profiles'\)[\s\S]{0,200}\.eq\('is_active',\s*true\)/);
  });

  it('no Z3/Z9/Z10 surface is imported by comms', () => {
    for (const [label, src] of [['governor', GOV], ['taxonomy', TAX]] as const) {
      expect(src, `${label}`).not.toContain('recommendationOutcome');
      expect(src, `${label}`).not.toContain('artistObserved');
      expect(src, `${label}`).not.toContain('crossArtistEvidence');
    }
  });
});
