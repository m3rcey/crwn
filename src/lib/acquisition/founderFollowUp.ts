// Founder follow-up: ONE deterministic answer to "where is this qualified lead in the CRWN
// journey, and what, if anything, should Josh say to them now?"
//
// Pure. No client, no clock of its own (the caller passes `now`), no network. The loader in
// founderFollowUpServer.ts reads the canonical owners and hands this module plain evidence; the
// daily runner, the admin Founder tab and the one-off preview all go through the SAME
// resolveFounderFollowUp + renderFounderFollowUp pair, so a draft Josh copies by hand and an
// email the automation sends can never describe two different journeys.
//
// What this module deliberately does NOT own (docs/crwn-brain/34-FOUNDER-FOLLOW-UP.md):
//   - qualification: `lead_profiles.score_band` from leadScoring.ts is the only authority.
//     This file compares the stored band to 'sales_priority' and computes nothing else.
//   - setup completion: setupProgress.ts (shared with the wizard).
//   - Stripe readiness: paymentReadiness.ts (the loader calls it).
//   - first paid: the `first_paid_conversion` funnel event (the loader reads it).
//   - consent and suppression: lead_identities.consent_email and email_suppressions, both
//     re-checked by channels.send() at the moment of sending.
//
// What the copy may say: only facts CRWN STORED from the artist's own actions (their name, the
// tool they ran, the result headline they saw, the tiers/product they created, what setup screen
// is next). It never quotes `monetization_status`: that is a scoring input normalized from free
// text, and a normalizer can be wrong (a DM reading "I have no paid program" was stored as "yes,
// a few times"). Telling an artist what they said, wrongly, is worse than not saying it.

import {
  firstIncompleteSetupScreen,
  setupGroupFor,
  type SetupFacts,
  type SetupScreenKey,
} from '../setupProgress';

/** Bump when a stage's meaning changes. It is part of the dedupe key, so a new version may
 *  follow up once more per stage; the same version never repeats. */
export const FOUNDER_FOLLOWUP_VERSION = 'v1';

/** Nobody hears from us while they are actively doing something (DM, setup, a call request). */
export const QUIET_HOURS = 48;
/** Founder follow-ups to one lead are at least this far apart, whatever stage they are in. */
export const FOUNDER_GAP_DAYS = 7;
/** Any OTHER CRWN email to this person (sequence, nurture) holds the founder note this long. */
export const OTHER_EMAIL_GAP_HOURS = 48;

export type FollowUpStage =
  | 'not_qualified'
  | 'no_result'
  | 'first_paid'
  | 'call_booked'
  | 'call_requested'
  | 'result_no_account'
  | 'builder_saved_no_account'
  | 'setup_incomplete'
  | 'offer_not_payable'
  | 'ready_no_first_paid';

/** Stages that never produce an email at all. */
const TERMINAL: ReadonlySet<FollowUpStage> = new Set(['not_qualified', 'no_result', 'first_paid', 'call_booked']);

export interface FollowUpEvidence {
  identityId: string;
  instagramUsername: string | null;
  /** lead_profiles.score_band, as stored by the canonical scorer. */
  scoreBand: string | null;
  leadScore: number | null;
  reasonCodes: string[];
  /** First name for the greeting: profiles.display_name, else lead_profiles.artist_name. */
  displayName: string | null;
  email: {
    address: string | null;
    consent: boolean;
    identityStatus: string;
    suppressed: boolean;
  };
  /** The newest calculator result tied to this lead. */
  result: {
    id: string;
    toolSlug: string;
    toolName: string | null;
    /** The headline they were shown, verbatim (result_data.title). */
    title: string | null;
    builderSaved: boolean;
  } | null;
  /** null = no CRWN account yet. */
  account: {
    userId: string;
    setupCompleted: boolean;
    setup: SetupFacts;
    /** Active tiers with price > 0, as stored. `purchasable` = tierPurchaseBlocker returned null. */
    paidTiers: { name: string; priceCents: number; purchasable: boolean }[];
    chargesReady: boolean;
    productTitle: string | null;
    firstPaid: boolean;
  } | null;
  call: { requested: boolean; booked: boolean };
  /** The most recent thing the lead DID, from any canonical event source. */
  lastActivity: { label: string; at: string } | null;
  /** A dispatcher nurture job is still queued for this lead (pre-signup only). */
  nurtureInFlight: boolean;
  lastOtherEmailAt: string | null;
  lastFounderFollowUpAt: string | null;
  /** Rows under the send:founder_followup:* keys, by stage. */
  sentStages: Partial<Record<FollowUpStage, { status: string; at: string; error: string | null; manual: boolean }>>;
}

export type FollowUpDecision = 'send' | 'wait' | 'manual_only' | 'none';

export type Continuation =
  | { kind: 'result'; resultId: string; toolSlug: string }
  | { kind: 'path'; path: string }
  | { kind: 'booking' };

export interface FollowUpContext {
  identityId: string;
  qualified: boolean;
  stage: FollowUpStage;
  /** What is actually in the way, in plain words. null when nothing is (terminal stages). */
  blocker: string | null;
  /** For setup_incomplete: the screen /setup resumes on (null = the launch review). */
  setupScreen: SetupScreenKey | null;
  lastActivity: { label: string; at: string } | null;
  continuation: Continuation | null;
  emailEligible: boolean;
  emailReason: string;
  /** The key channels.send() claims (it prefixes "send:"). null for terminal stages. */
  dedupeKey: string | null;
  alreadySent: { status: string; at: string; error: string | null; manual: boolean } | null;
  decision: FollowUpDecision;
  decisionReason: string;
  /** When a 'wait' becomes eligible (ISO), if a timer is what it waits on. */
  nextEligibleAt: string | null;
}

export function founderFollowUpKey(identityId: string, stage: FollowUpStage): string {
  return `founder_followup:${FOUNDER_FOLLOWUP_VERSION}:${identityId}:${stage}`;
}

/** Stage precedence: who owns this lead right now. First match wins. */
export function resolveStage(e: FollowUpEvidence): { stage: FollowUpStage; blocker: string | null; setupScreen: SetupScreenKey | null } {
  const none = { blocker: null, setupScreen: null };
  // Qualification is the canonical scorer's band, read, never recomputed.
  if (e.scoreBand !== 'sales_priority') return { stage: 'not_qualified', ...none };
  // Converted artists are in a different lifecycle. No acquisition email, ever.
  if (e.account?.firstPaid) return { stage: 'first_paid', ...none };
  // A booked call means a human owns the relationship.
  if (e.call.booked) return { stage: 'call_booked', ...none };
  // An explicit hand-raise outranks every product nudge.
  if (e.call.requested) return { stage: 'call_requested', blocker: 'Asked for a call with Josh', setupScreen: null };

  if (e.account) {
    const a = e.account;
    if (!a.setupCompleted) {
      const screen = firstIncompleteSetupScreen(a.setup);
      return { stage: 'setup_incomplete', blocker: setupBlocker(screen), setupScreen: screen };
    }
    if (a.paidTiers.length === 0) {
      return { stage: 'offer_not_payable', blocker: 'No paid tier yet', setupScreen: null };
    }
    if (!a.paidTiers.some((t) => t.purchasable)) {
      return {
        stage: 'offer_not_payable',
        blocker: a.chargesReady ? 'Paid tiers have no Stripe price yet' : 'Stripe is not accepting charges yet',
        setupScreen: null,
      };
    }
    return { stage: 'ready_no_first_paid', blocker: 'No paying member yet', setupScreen: null };
  }

  if (!e.result) return { stage: 'no_result', ...none };
  if (e.result.builderSaved) return { stage: 'builder_saved_no_account', blocker: 'Plan saved, no account', setupScreen: null };
  return { stage: 'result_no_account', blocker: 'Saw the result, no account', setupScreen: null };
}

function setupBlocker(screen: SetupScreenKey | null): string {
  if (!screen) return 'Everything is in, Launch not pressed';
  switch (setupGroupFor(screen)) {
    case 'profile':
      return screen === 'photo' ? 'No profile photo yet' : 'Has not named their page yet';
    case 'music':
      return 'No music uploaded';
    case 'monetize':
      return screen === 'stripe' ? 'Stripe not connected' : 'No tiers yet';
    default:
      return 'No product yet (optional), Launch not pressed';
  }
}

function continuationFor(stage: FollowUpStage, e: FollowUpEvidence): Continuation | null {
  switch (stage) {
    case 'call_requested':
      return { kind: 'booking' };
    case 'result_no_account':
    case 'builder_saved_no_account':
      return e.result ? { kind: 'result', resultId: e.result.id, toolSlug: e.result.toolSlug } : null;
    case 'setup_incomplete':
      // /setup resumes on the first incomplete screen by itself (setupProgress.ts), which is
      // exactly the screen this email talks about.
      return { kind: 'path', path: '/setup' };
    case 'offer_not_payable':
    case 'ready_no_first_paid':
      // Rise Mode is the ONE next-move surface; it resolves the specific destination itself.
      return { kind: 'path', path: '/profile/artist' };
    default:
      return null;
  }
}

const hoursBetween = (a: string, b: Date) => (b.getTime() - Date.parse(a)) / 3_600_000;
const plusHours = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000).toISOString();

export function resolveFounderFollowUp(e: FollowUpEvidence, now: Date): FollowUpContext {
  const { stage, blocker, setupScreen } = resolveStage(e);
  const qualified = e.scoreBand === 'sales_priority';
  const terminal = TERMINAL.has(stage);
  const dedupeKey = terminal ? null : founderFollowUpKey(e.identityId, stage);
  const alreadySent = terminal ? null : e.sentStages[stage] ?? null;

  const emailReason = !e.email.address
    ? 'no_email'
    : e.email.identityStatus === 'opted_out' || e.email.identityStatus === 'disqualified'
    ? e.email.identityStatus
    : e.email.suppressed
    ? 'suppressed'
    : !e.email.consent
    ? 'no_email_consent'
    : 'eligible';
  const emailEligible = emailReason === 'eligible';

  const base = {
    identityId: e.identityId,
    qualified,
    stage,
    blocker,
    setupScreen,
    lastActivity: e.lastActivity,
    continuation: continuationFor(stage, e),
    emailEligible,
    emailReason,
    dedupeKey,
    alreadySent,
  };
  const out = (decision: FollowUpDecision, decisionReason: string, nextEligibleAt: string | null = null): FollowUpContext => ({
    ...base,
    decision,
    decisionReason,
    nextEligibleAt,
  });

  if (terminal) return out('none', stage);
  if (alreadySent) return out('none', alreadySent.manual ? 'sent_by_hand_for_stage' : `already_${alreadySent.status}_for_stage`);

  // A lead who unsubscribed, bounced, complained or was disqualified gets nothing, not even a
  // hand-sent note from the same product. No email or no email consent is different: the draft
  // is still Josh's to use through a channel they DID open (the DM).
  if (['opted_out', 'disqualified', 'suppressed'].includes(emailReason)) return out('none', emailReason);
  if (!emailEligible) return out('manual_only', emailReason);

  // Timing. Every hold names the moment it lifts, so the admin tab can say "eligible Thursday".
  const holds: { reason: string; until: string }[] = [];
  if (e.lastActivity && hoursBetween(e.lastActivity.at, now) < QUIET_HOURS) {
    holds.push({ reason: 'recent_activity', until: plusHours(e.lastActivity.at, QUIET_HOURS) });
  }
  if (e.lastFounderFollowUpAt && hoursBetween(e.lastFounderFollowUpAt, now) < FOUNDER_GAP_DAYS * 24) {
    holds.push({ reason: 'recent_founder_follow_up', until: plusHours(e.lastFounderFollowUpAt, FOUNDER_GAP_DAYS * 24) });
  }
  if (e.lastOtherEmailAt && hoursBetween(e.lastOtherEmailAt, now) < OTHER_EMAIL_GAP_HOURS) {
    holds.push({ reason: 'recent_crwn_email', until: plusHours(e.lastOtherEmailAt, OTHER_EMAIL_GAP_HOURS) });
  }
  if (holds.length > 0) {
    const latest = holds.reduce((m, h) => (h.until > m.until ? h : m));
    return out('wait', latest.reason, latest.until);
  }
  // The existing acquisition nurture is mid-sequence: let it finish rather than stack a second
  // voice on top. No timer to name; it clears when the queue does.
  if (!e.account && e.nurtureInFlight) return out('wait', 'acquisition_nurture_in_flight');

  return out('send', 'eligible');
}

// ---------------------------------------------------------------------------
// Copy. Deterministic templates, verified merge fields only. No em dashes (CLAUDE.md).
// ---------------------------------------------------------------------------

export interface RenderedFollowUp {
  subject: string;
  text: string;
  html: string;
  ctaLabel: string;
}

/** Stand-in for a pre-signup result link: the raw token only exists at send time (it is minted
 *  then, and only its hash is stored), so a preview cannot hold a working one. */
export const RESULT_LINK_PLACEHOLDER = '[their saved result link, minted when sent]';

export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
  // An email-shaped or handle-shaped seed is not a name to greet someone by.
  if (!first || first.includes('@') || first.length > 30) return null;
  return first;
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function tierList(tiers: { name: string; priceCents: number }[]): string {
  return joinList([...tiers].sort((a, b) => a.priceCents - b.priceCents).map((t) => `${t.name} (${money(t.priceCents)})`));
}

/**
 * The email for a resolved context. `url` is the absolute continuation link (the caller builds
 * it: a freshly minted result link, the app URL plus a path, or the booking link).
 * Returns null for a stage that never emails.
 */
export function renderFounderFollowUp(ctx: FollowUpContext, e: FollowUpEvidence, url: string): RenderedFollowUp | null {
  const name = firstNameOf(e.displayName);
  const hi = name ? `${name},` : 'Hey,';
  const sub = (s: string) => (name ? `${name}, ${s}` : s.charAt(0).toUpperCase() + s.slice(1));
  const tool = e.result?.toolName ?? null;
  const intro = 'Josh here. I built CRWN.';
  const signoff = 'Josh';
  let subject: string;
  let paragraphs: string[];
  let ctaLabel: string;

  switch (ctx.stage) {
    case 'call_requested': {
      subject = sub('about the call you asked for');
      ctaLabel = 'Pick a time';
      paragraphs = [
        `You asked for a call${tool ? ` after running the ${tool}` : ''}, and I want to make sure it actually happens.`,
        `${ctaLabel}: ${url}`,
        'Or reply with a good time and number and I will call you.',
      ];
      break;
    }
    case 'result_no_account':
    case 'builder_saved_no_account': {
      const saved = ctx.stage === 'builder_saved_no_account';
      subject = sub(saved ? 'your plan is still saved' : 'your result is still saved');
      ctaLabel = saved ? 'Pick up your plan' : 'Open your saved result';
      const ran = tool ? `You ran the ${tool} on Instagram` : 'You ran your numbers with CRWN on Instagram';
      const saw = e.result?.title ? ` and it came back with "${e.result.title}"` : '';
      paragraphs = [
        `${ran}${saw}.`,
        saved
          ? 'You also started building the plan behind it, and that draft is saved with it. You do not have to answer anything again.'
          : 'That result is still saved, so you do not have to answer anything again.',
        'The number is the easy part. What matters is what sits behind it: which tiers, at what price, for which fans. That is what the next screen builds.',
        `${ctaLabel}: ${url}`,
        'If the number looked off for you, reply and tell me why. I read these myself.',
      ];
      break;
    }
    case 'setup_incomplete': {
      const a = e.account!;
      const done: string[] = [];
      if (a.paidTiers.length) done.push(`${tierList(a.paidTiers)} ${a.paidTiers.length === 1 ? 'is' : 'are'} priced`);
      if (a.chargesReady) done.push('Stripe is connected');
      if (a.productTitle) done.push(`"${a.productTitle}" is in your shop`);
      const group = ctx.setupScreen ? setupGroupFor(ctx.setupScreen) : null;
      ctaLabel = 'Pick up where you left off';
      if (ctx.setupScreen === null) {
        subject = sub('your CRWN page is one step from live');
      } else if (group === 'music') {
        subject = sub('your CRWN page is set up except for the music');
      } else if (ctx.setupScreen === 'photo') {
        subject = sub('your CRWN page needs a photo');
      } else if (group === 'monetize') {
        subject = sub(ctx.setupScreen === 'stripe' ? 'one step before fans can pay you' : 'your CRWN tiers are not set yet');
      } else if (group === 'profile') {
        subject = sub('your CRWN page is waiting for you');
      } else {
        subject = sub('your CRWN page is one step from live');
      }
      paragraphs = [
        done.length >= 2
          ? `You already did most of the setup: ${joinList(done)}.`
          : done.length === 1
          ? `You already started: ${done[0]}.`
          : 'You started setting up your CRWN page.',
        setupGapParagraph(ctx.setupScreen, group),
        `${ctaLabel}: ${url}`,
        'If something in setup got in your way, reply and tell me what it was. This comes straight to me.',
      ];
      break;
    }
    case 'offer_not_payable': {
      const a = e.account!;
      ctaLabel = 'See your next step';
      subject = sub('fans cannot pay you on CRWN yet');
      paragraphs = [
        a.paidTiers.length === 0
          ? 'Your page is live, but there is no paid tier on it yet, so a fan who wants to support you has nowhere to put the money.'
          : a.chargesReady
          ? `${tierList(a.paidTiers)} ${a.paidTiers.length === 1 ? 'is' : 'are'} set up, but checkout is not switched on for ${a.paidTiers.length === 1 ? 'it' : 'them'} yet.`
          : `${tierList(a.paidTiers)} ${a.paidTiers.length === 1 ? 'is' : 'are'} set up, but Stripe is not accepting charges for your account yet, so checkout stays off until it does.`,
        'Rise Mode shows the one thing to fix first.',
        `${ctaLabel}: ${url}`,
        'If you are stuck on it, reply and tell me where. This comes straight to me.',
      ];
      break;
    }
    case 'ready_no_first_paid': {
      const a = e.account!;
      const buyable = a.paidTiers.filter((t) => t.purchasable);
      ctaLabel = 'See this week’s move';
      subject = sub('your page is ready for member number one');
      paragraphs = [
        `Your page is live and fans can pay you: ${tierList(buyable)} ${buyable.length === 1 ? 'is' : 'are'} set up and checkout works.`,
        'What is left is the ask. The first paying member rarely comes from a stranger, so it starts with the fans who already show up for you.',
        `Rise Mode has the next move for this: ${url}`,
        'If you want a second pair of eyes on how to ask, reply and I will help.',
      ];
      break;
    }
    default:
      return null;
  }

  const text = [hi, intro, ...paragraphs, signoff].join('\n\n');
  return { subject, text, html: toHtml([hi, intro, ...paragraphs, signoff], url), ctaLabel };
}

function setupGapParagraph(screen: SetupScreenKey | null, group: string | null): string {
  if (screen === null) {
    return 'Everything is in. The last step is pressing Launch on the review screen, which takes your page out of setup and turns it on.';
  }
  switch (group) {
    case 'music':
      return 'The one thing missing is music. Right now a fan who opens your page has nothing to play. If you have a project ready, setup takes a whole album in one pass: one cover, the tracks in order, done. Then press Launch and your page is live.';
    case 'profile':
      return screen === 'photo'
        ? 'The next step is a profile photo. It is the first thing a fan sees, and it takes a minute.'
        : 'The next step is naming your page and claiming your link.';
    case 'monetize':
      return screen === 'stripe'
        ? 'The next step is connecting Stripe, so the money from your tiers goes straight to your account.'
        : 'The next step is your membership tiers. CRWN starts you with a recommended ladder, so it is mostly a matter of checking the prices.';
    default:
      return 'The rest is optional. You can add a product now or later, then press Launch and your page is live.';
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A plain, personal-looking email: no banner, no button, one linked URL. */
function toHtml(paragraphs: string[], url: string): string {
  const linkable = /^https?:\/\//.test(url);
  const body = paragraphs
    .map((p) => {
      let h = esc(p);
      if (linkable) h = h.split(esc(url)).join(`<a href="${esc(url)}" style="color:#1a73e8;">${esc(url)}</a>`);
      return `<p style="margin:0 0 16px;">${h}</p>`;
    })
    .join('');
  return `<div style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;">${body}</div>`;
}
