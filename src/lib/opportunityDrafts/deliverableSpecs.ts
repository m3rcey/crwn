// The pre-signup DELIVERABLE spec for every active public tool.
//
// One data registry drives one generic builder (DeliverableBuilder), so every calculator ends in an
// editable, previewable draft instead of a signup button. Nothing here creates a live record: a
// deliverable is a PLAN the artist edits and previews, saved only when they choose to (which is the
// signup boundary). Publishing, payments, uploads, contact import and fan data all stay behind the
// real authenticated builders.
//
// HONESTY RULES baked into these specs:
//  - A price/number is pre-filled ONLY when the tool actually modeled one (worth ladder, Vault price,
//    live/producer ticket price, mission/test generator payloads). Everywhere else the field starts
//    empty for the artist to set. We never invent a financial figure.
//  - Copy prefills come from the tool's own recommendation language, not from new claims.
//  - Team Splits is an explicitly NON-BINDING planning scenario. Royalty stays a diagnostic
//    checklist with no dollar figure. Clip-to-Earn plans a campaign but activates no reward.
//
// Client-safe DATA + pure functions only. No secrets, no React.

import { RECOMMENDED_LADDER, benefitLabels } from '@/lib/tierTemplate';
import { recalcUnified } from '@/lib/opportunity/recalcUnified';

export type DeliverableFieldType =
  | 'text'
  | 'textarea'
  | 'currency'
  | 'number'
  | 'option'
  | 'lines'
  /** A list of pre-checked benefit lines the artist unchecks to remove, plus add-your-own. */
  | 'checklist';

export interface DeliverableField {
  key: string;
  type: DeliverableFieldType;
  label: string;
  help?: string;
  placeholder?: string;
  /** maxLength for text/textarea/lines; max value for number/currency (dollars). */
  max?: number;
  options?: { value: string; label: string }[];
}

export interface DeliverableStep {
  id: string;
  group: string;
  label: string;
  fields: DeliverableField[];
}

export interface DeliverablePreview {
  /**
   * `system` is the coordinated whole: the ladder PLUS the growth systems, the experience and the
   * launch order, previewed as one business rather than a pile of separate drafts. It renders
   * `tiers` followed by `itemKeys`, so it is the ladder preview and the list preview together.
   */
  kind: 'offer' | 'page' | 'list' | 'ladder' | 'campaigns' | 'system';
  titleKey?: string;
  subtitleKey?: string;
  priceKey?: string;
  benefitsKey?: string;
  ctaKey?: string;
  secondaryCtaKey?: string;
  /** For 'list': the field keys rendered as the plan/schedule/checklist body, in order. */
  itemKeys?: string[];
  /** For 'ladder': the tiers to render as a membership ladder, in order. */
  tiers?: { nameKey: string; priceKey?: string; benefitsKey: string }[];
  /** Small print under the preview. Used to keep planning honest (non-binding, not published). */
  note?: string;
}

export type DraftValues = Record<string, string | number | string[]>;

export interface DeliverableSpec {
  toolSlug: string;
  /** Stable type for the stored draft, so restoration knows what it is. */
  deliverableType: string;
  title: string;
  subtitle: string;
  /** The save-boundary CTA. Must name the artifact, never "create account". */
  saveLabel: string;
  /**
   * Result-to-builder transition: one line that names what was discovered and what the tool
   * prepared. Shown immediately after the result, before the builder. Optional; a sane default is
   * derived from the deliverable.
   */
  transition?: string;
  /** The primary "advance the builder" CTA label, e.g. "Build my offer". Never routes to signup. */
  buildCta?: string;
  /**
   * Builder-specific reason shown at the signup boundary, so the account ask reads as "save what you
   * already built" rather than "create an account". Never generic.
   */
  signupContext?: string;
  /**
   * The compact action line on the signup screen, directly under the number. Says how the artist
   * actually claims it. Kept short so the signup form stays above the fold.
   */
  claimLine?: string;
  /**
   * One line at the signup boundary saying what the number deliberately did NOT add together. Only
   * meaningful for a tool that models several opportunities at once; a single-opportunity tool has
   * no overlap to disclose. Kept to one sentence so the form stays above the fold.
   */
  overlapNote?: string;
  steps: DeliverableStep[];
  preview: DeliverablePreview;
  /** Where the authenticated artist continues after claiming (a REAL, existing surface). */
  continueRoute: string;
  /**
   * Maps the artist's EDITED draft values onto the real builder's existing `lm_*` prefill params, so
   * continuing carries their edits rather than re-deriving from the calculator. Only defined for
   * tools whose production builder already reads those params.
   */
  continueParams?: (v: DraftValues) => Record<string, string>;
  /** Pure prefill from the tool's own modeled payload/result. Never invents numbers. */
  prefill: (cp: Record<string, unknown>, result?: Record<string, unknown>) => DraftValues;
  /**
   * Re-derive the financial estimate from the artist's EDITED draft.
   *
   * Only defined for a tool whose builder can materially change the money (turning off a growth
   * system, moving the Vault out of the ladder, making a session a tier benefit). Without this, a
   * builder would keep showing the headline the calculator produced from the original answers
   * after the artist changed those answers, which is the same dishonesty as double-counting, just
   * pointed at a stale number instead of an inflated one. Returns null when it cannot recompute.
   */
  recalc?: (v: DraftValues, cp: Record<string, unknown>) => RecalcSummary | null;
}

/** A recomputed headline the builder shows in place of the calculator's original figure. */
export interface RecalcSummary {
  /** The new figure, already formatted, e.g. "$4,120". */
  value: string;
  /** What the figure is, e.g. "a month, net". */
  label: string;
  /** What changed, in one line, when the artist's edits moved the number. */
  note?: string;
  /** True when the edits changed the number away from the original estimate. */
  changed: boolean;
}

// ---- helpers -------------------------------------------------------------
const dollars = (cents: unknown): number | '' =>
  typeof cents === 'number' && cents > 0 ? Math.round(cents / 100) : '';
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v ? v : fallback);

const CADENCE = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

// Options used by the unified system builder, where every recommendation must be removable.
const ON_OFF = [
  { value: 'on', label: 'Yes, run it' },
  { value: 'off', label: 'No, leave it out' },
];

const VAULT_PLACEMENT = [
  { value: 'tier', label: 'A tier inside my membership' },
  { value: 'standalone', label: 'Sold on its own' },
  { value: 'none', label: 'Skip the Vault for now' },
];

const SESSION_STRUCTURE = [
  { value: 'included', label: 'Free for my top tier' },
  { value: 'ticketed', label: 'Ticketed, anyone can buy a seat' },
  { value: 'hybrid', label: 'Top tier free, extra seats sold' },
  { value: 'none', label: 'No session for now' },
];

// ---- the specs -----------------------------------------------------------
const SPECS: DeliverableSpec[] = [
  // 1. Streaming Loss / Worth -> the FULL four-tier membership ladder the calculator revealed.
  // The calculator shows The Wave / Inner Circle / The Vault / Throne, so the builder builds all
  // four. Names, prices and benefits come from RECOMMENDED_LADDER (src/lib/tierTemplate.ts), the
  // same canonical ladder Rise Mode Level 3 and the Tier Manager apply, so nothing is invented and
  // the money the calculator promises is the ladder the artist actually keeps. One tier per step.
  {
    toolSlug: 'worth',
    deliverableType: 'membership_ladder',
    title: 'Build your membership',
    subtitle: 'All four tiers are already written from your numbers. Review each one and change anything.',
    saveLabel: 'Save my membership',
    transition: 'Turn this estimate into an offer your fans can join.',
    buildCta: 'Build my offer',
    signupContext: 'Create your account to save your membership system and publish it inside the CRWN app.',
    claimLine: 'Claim it by signing up, making your memberships live with your catalog, and sharing your link.',
    continueRoute: '/offers/new',
    // The entry PAID tier is what the offer builder drafts (plan-legal); the rest ride along as the
    // saved ladder the artist already reviewed.
    continueParams: (v) => ({
      lm_prefill: '1',
      lm_goal: 'grow-supporters',
      lm_tier_name: String(v.t1Name || ''),
      ...(v.t1Price ? { lm_price: String(v.t1Price) } : {}),
    }),
    steps: [
      {
        id: 'wave', group: 'Free', label: 'The Wave', fields: [
          { key: 't0Name', type: 'text', label: 'Free tier name', max: 40, help: 'Your front door. Free, so every new fan can join and stay close.' },
          { key: 't0Benefits', type: 'checklist', label: 'What free members get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[0]).map((b) => ({ value: b, label: b })), help: 'Everything is on by default. Uncheck anything you will not actually do.' },
        ],
      },
      {
        id: 'inner', group: 'Paid', label: 'Inner Circle', fields: [
          { key: 't1Name', type: 'text', label: 'Tier name', max: 40 },
          { key: 't1Price', type: 'currency', label: 'Monthly price', max: 500, help: 'The price the calculator modeled. You set the real number.' },
          { key: 't1Benefits', type: 'checklist', label: 'What they get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[1]).map((b) => ({ value: b, label: b })), help: 'Everything is on by default. Uncheck anything you will not actually do.' },
        ],
      },
      {
        id: 'vault', group: 'Paid', label: 'The Vault', fields: [
          { key: 't2Name', type: 'text', label: 'Tier name', max: 40 },
          { key: 't2Price', type: 'currency', label: 'Monthly price', max: 500 },
          { key: 't2Benefits', type: 'checklist', label: 'What they get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[2]).map((b) => ({ value: b, label: b })), help: 'The monthly unlock comes from your existing backlog, not something new each month.' },
        ],
      },
      {
        id: 'throne', group: 'Paid', label: 'Throne', fields: [
          { key: 't3Name', type: 'text', label: 'Tier name', max: 40 },
          { key: 't3Price', type: 'currency', label: 'Monthly price', max: 1000 },
          { key: 't3Benefits', type: 'checklist', label: 'What they get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[3]).map((b) => ({ value: b, label: b })), help: 'Your top supporters. Uncheck anything you cannot serve at this level.' },
        ],
      },
    ],
    preview: {
      kind: 'ladder',
      tiers: [
        { nameKey: 't0Name', benefitsKey: 't0Benefits' },
        { nameKey: 't1Name', priceKey: 't1Price', benefitsKey: 't1Benefits' },
        { nameKey: 't2Name', priceKey: 't2Price', benefitsKey: 't2Benefits' },
        { nameKey: 't3Name', priceKey: 't3Price', benefitsKey: 't3Benefits' },
      ],
      note: 'Preview only. Fans cannot join until you publish these tiers. Recognition perks are recognition only: no ownership, royalties, or revenue participation.',
    },
    prefill: (cp) => {
      // Prices: prefer the calculator's own modeled ladder, else the canonical template price.
      const modeled = Array.isArray(cp.ladder) ? (cp.ladder as { name?: string; priceCents?: number }[]) : [];
      const paidPrice = (i: number, fallbackCents: number) => dollars(modeled[i]?.priceCents ?? fallbackCents);
      const [wave, inner, vault, throne] = RECOMMENDED_LADDER;
      return {
        t0Name: wave.name,
        t0Benefits: benefitLabels(wave),
        t1Name: inner.name,
        t1Price: paidPrice(0, inner.priceCents),
        t1Benefits: benefitLabels(inner),
        t2Name: vault.name,
        t2Price: paidPrice(1, vault.priceCents),
        t2Benefits: benefitLabels(vault),
        t3Name: throne.name,
        t3Price: paidPrice(2, throne.priceCents),
        t3Benefits: benefitLabels(throne),
      };
    },
  },

  // 2. Vault Revenue Planner -> a Vault offer + 30-day drop plan.
  {
    toolSlug: 'vault-revenue-planner',
    deliverableType: 'vault_offer',
    title: 'Build your Vault',
    subtitle: 'Turn the unreleased material you already own into a paid tier. Edit anything before you save it.',
    saveLabel: 'Save my Vault',
    signupContext: 'Create your account to save your Vault and start releasing exclusive content.',
    claimLine: 'Claim it by signing up, filling your Vault from your catalog, and sharing your link.',
    transition: 'Turn your unreleased catalog into a Vault plan.',
    buildCta: 'Build my Vault',
    continueRoute: '/offers/new',
    continueParams: (v) => ({ lm_prefill: '1', lm_goal: 'vault-access', lm_tier_name: String(v.tierName || ''), ...(v.price ? { lm_price: String(v.price) } : {}) }),
    steps: [
      {
        id: 'offer', group: 'Vault', label: 'The offer', fields: [
          { key: 'tierName', type: 'text', label: 'Vault name', max: 40 },
          { key: 'price', type: 'currency', label: 'Monthly price', max: 500, help: 'The planner modeled this. You set the real number.' },
        ],
      },
      {
        id: 'content', group: 'Vault', label: 'What goes in', fields: [
          { key: 'categories', type: 'lines', label: 'Content you already have', max: 600, help: 'One per line. Demos, voice notes, alternate takes, session video, photos.' },
          { key: 'cadence', type: 'option', label: 'How often you drop', options: CADENCE, help: 'Pick what you can sustain. Release timing is set per track in Music; there is no auto-scheduler.' },
        ],
      },
      {
        id: 'plan', group: 'Plan', label: 'First 30 days', fields: [
          { key: 'dropPlan', type: 'lines', label: 'Your first 30-day drop plan', max: 600, help: 'One line per drop.' },
        ],
      },
    ],
    preview: { kind: 'offer', titleKey: 'tierName', priceKey: 'price', benefitsKey: 'categories', note: 'Preview only. Nothing is released and no fan is charged until you publish.' },
    prefill: (cp) => ({
      tierName: str(cp.tierName, 'The Vault'),
      price: dollars(cp.priceCents),
      categories: ['Unreleased demos', 'Voice notes and ideas', 'Alternate versions', 'Session photos'],
      cadence: 'biweekly',
      dropPlan: ['Week 1: a welcome voice note plus one unreleased track', 'Week 2: a demo or alternate version', 'Week 3: session photos or video', 'Week 4: one unreleased track'],
    }),
  },

  // 3. Founder Window -> a real limited founding offer (cap + dates are the artist's, never faked).
  {
    toolSlug: 'founder-window-builder',
    deliverableType: 'founder_window',
    title: 'Build your founding window',
    subtitle: 'A real limited window for your first supporters. You set the cap and the dates, and they are real.',
    saveLabel: 'Save my founding offer',
    signupContext: 'Create your account to save your founding window and open it to your first supporters.',
    transition: 'Turn your first supporters into founders with a real window.',
    buildCta: 'Build my founding offer',
    continueRoute: '/offers/new',
    continueParams: (v) => ({ lm_prefill: '1', lm_goal: 'grow-supporters', lm_tier_name: String(v.tierName || ''), ...(v.price ? { lm_price: String(v.price) } : {}) }),
    steps: [
      {
        id: 'offer', group: 'Offer', label: 'The offer', fields: [
          { key: 'tierName', type: 'text', label: 'Founding tier name', max: 40 },
          { key: 'price', type: 'currency', label: 'Monthly price', max: 500, help: 'Set the price you will honor for founders.' },
        ],
      },
      {
        id: 'window', group: 'Window', label: 'The window', fields: [
          { key: 'cap', type: 'number', label: 'How many founding spots', max: 10000, help: 'A real cap you will actually hold to. Leave it honest.' },
          { key: 'opensAt', type: 'text', label: 'Opens (date)', max: 40, placeholder: 'e.g. March 1' },
          { key: 'closesAt', type: 'text', label: 'Closes (date)', max: 40, placeholder: 'e.g. March 14' },
        ],
      },
      {
        id: 'benefits', group: 'Offer', label: 'Founder benefits', fields: [
          { key: 'benefits', type: 'lines', label: 'What founders get that later fans do not', max: 600 },
        ],
      },
    ],
    preview: { kind: 'offer', titleKey: 'tierName', priceKey: 'price', benefitsKey: 'benefits', note: 'Preview only. The cap and dates become real when you publish, so keep them honest.' },
    prefill: () => ({
      tierName: 'Founding Supporter',
      price: '',
      cap: '',
      opensAt: '',
      closesAt: '',
      benefits: ['Founding supporter status, permanently', 'First access to everything', 'A say in what comes next'],
    }),
  },

  // 4. Fan Journey -> an editable journey plan with the leak points named.
  {
    toolSlug: 'fan-journey-builder',
    deliverableType: 'fan_journey',
    title: 'Map your fan journey',
    subtitle: 'Name what happens at each step, and where fans currently fall out. Edit every line.',
    saveLabel: 'Save my journey',
    signupContext: 'Create your account to save your fan journey and start closing the leaks.',
    transition: 'Turn the leaks into a journey with a fix at every step.',
    buildCta: 'Build my journey',
    continueRoute: '/offers/new',
    steps: [
      {
        id: 'steps', group: 'Journey', label: 'The path', fields: [
          { key: 'discovery', type: 'text', label: 'Discovery: how they find you', max: 160 },
          { key: 'firstAction', type: 'text', label: 'First action you want them to take', max: 160 },
          { key: 'firstPurchase', type: 'text', label: 'First thing they can buy', max: 160 },
          { key: 'recurring', type: 'text', label: 'What makes them recurring', max: 160 },
        ],
      },
      {
        id: 'leaks', group: 'Leaks', label: 'Where they leak', fields: [
          { key: 'leaks', type: 'lines', label: 'Leak points', max: 600, help: 'One per line. Be specific about where you lose them.' },
          { key: 'fixes', type: 'lines', label: 'The fix for each', max: 600, help: 'One per line, matching the order above.' },
        ],
      },
    ],
    preview: { kind: 'list', titleKey: 'discovery', itemKeys: ['discovery', 'firstAction', 'firstPurchase', 'recurring', 'leaks', 'fixes'], note: 'A plan, not a published funnel.' },
    prefill: () => ({
      discovery: 'A clip or a song reaches someone new',
      firstAction: 'They join my list or follow the movement page',
      firstPurchase: 'A low-priced drop or a single track',
      recurring: 'A membership they renew every month',
      leaks: ['No reason to give me their contact', 'Nothing cheap to buy first', 'No reason to come back next month'],
      fixes: ['A fan page that asks for the email', 'One small paid offer', 'A monthly promise I actually keep'],
    }),
  },

  // 5. Supporter Promise Calendar -> a fulfillment schedule.
  {
    toolSlug: 'supporter-promise-calendar',
    deliverableType: 'promise_calendar',
    title: 'Schedule what you promised',
    subtitle: 'Membership benefits only work if they are on a calendar. Edit the schedule you can actually keep.',
    saveLabel: 'Save my calendar',
    signupContext: 'Create your account to save your supporter calendar and keep every promise on schedule.',
    transition: 'Turn your promises into a schedule you can keep.',
    buildCta: 'Build my calendar',
    continueRoute: '/studio/promise',
    steps: [
      {
        id: 'promises', group: 'Promises', label: 'What you promised', fields: [
          { key: 'benefits', type: 'lines', label: 'Promised benefits', max: 600, help: 'One per line.' },
          { key: 'frequency', type: 'option', label: 'How often each one lands', options: CADENCE },
        ],
      },
      {
        id: 'schedule', group: 'Schedule', label: 'The schedule', fields: [
          { key: 'schedule', type: 'lines', label: 'Delivery schedule', max: 600, help: 'One line per delivery, e.g. "Week 1: unreleased track".' },
          { key: 'prepDays', type: 'number', label: 'Days you need to prepare each one', max: 90 },
        ],
      },
    ],
    preview: { kind: 'list', titleKey: 'frequency', itemKeys: ['benefits', 'schedule'], note: 'A plan. Nothing is scheduled for supporters until you save it in the Promise Calendar.' },
    prefill: () => ({
      benefits: ['One unreleased track', 'A behind-the-scenes post', 'A members-only voice note'],
      frequency: 'monthly',
      schedule: ['Week 1: unreleased track', 'Week 2: behind the scenes', 'Week 4: voice note'],
      prepDays: 3,
    }),
  },

  // 6. Team Splits -> a NON-BINDING planning scenario. No agreement, no economics change.
  {
    toolSlug: 'team-split-deal-builder',
    deliverableType: 'split_scenario',
    title: 'Sketch a split scenario',
    subtitle: 'A planning sketch only. This is not an agreement, it creates no deal, and it changes nothing about money.',
    saveLabel: 'Save my scenario',
    signupContext: 'Create your account to save this planning scenario. It stays a draft and creates no agreement.',
    transition: 'Sketch the split before anyone signs anything.',
    buildCta: 'Sketch my scenario',
    continueRoute: '/studio/team',
    steps: [
      {
        id: 'who', group: 'Scenario', label: 'Who is involved', fields: [
          { key: 'collaborator', type: 'text', label: 'Collaborator role', max: 60, placeholder: 'e.g. producer, manager, videographer' },
          { key: 'contribution', type: 'textarea', label: 'What they contribute', max: 300 },
        ],
      },
      {
        id: 'terms', group: 'Scenario', label: 'The shape of it', fields: [
          { key: 'percent', type: 'number', label: 'Share of the fenced source (%)', max: 100, help: 'A planning number only. Real deals are set, reviewed and approved in Team Splits.' },
          { key: 'cap', type: 'currency', label: 'Cap (total they can earn)', max: 1000000, help: 'A cap turns an open-ended promise into a finite one.' },
        ],
      },
    ],
    preview: { kind: 'list', titleKey: 'collaborator', itemKeys: ['contribution', 'percent', 'cap'], note: 'NOT an agreement and NOT binding. No deal, payout or ownership is created here. Real Team Split deals are built, reviewed and approved inside CRWN.' },
    prefill: () => ({ collaborator: '', contribution: '', percent: '', cap: '' }),
  },

  // 7. Live Experience -> a ticketed event draft.
  {
    toolSlug: 'live-experience-calculator',
    deliverableType: 'live_event',
    title: 'Plan your ticketed live',
    subtitle: 'A real event concept you can run. Edit anything before you save it.',
    saveLabel: 'Save my experience',
    signupContext: 'Create your account to save your live experience and sell tickets to it.',
    transition: 'Turn this estimate into a ticketed event you can run.',
    buildCta: 'Build my event',
    continueRoute: '/studio/live',
    continueParams: (v) => ({ lm_prefill: '1', lm_title: String(v.title || ''), ...(v.price ? { lm_ticket_price: String(v.price) } : {}), ...(v.capacity ? { lm_max_slots: String(v.capacity) } : {}) }),
    steps: [
      {
        id: 'concept', group: 'Event', label: 'The event', fields: [
          { key: 'title', type: 'text', label: 'Event title', max: 80 },
          { key: 'concept', type: 'textarea', label: 'What actually happens', max: 300, help: 'A real reason to buy a ticket, not "hanging out".' },
        ],
      },
      {
        id: 'ticket', group: 'Ticket', label: 'Ticket and room', fields: [
          { key: 'price', type: 'currency', label: 'Ticket price', max: 1000, help: 'The calculator suggested this for your level. You set the final price.' },
          { key: 'capacity', type: 'number', label: 'Capacity (0 for unlimited)', max: 100000 },
          { key: 'replay', type: 'option', label: 'Replay', options: [
            { value: 'included', label: 'Ticket buyers keep the replay' },
            { value: 'none', label: 'Live only' },
          ], help: 'A paid ticket already keeps replay access to the recording.' },
        ],
      },
      {
        id: 'run', group: 'Plan', label: 'Run of show', fields: [
          { key: 'runOfShow', type: 'lines', label: 'Run of show', max: 600, help: 'One line per segment.' },
        ],
      },
    ],
    preview: { kind: 'offer', titleKey: 'title', subtitleKey: 'concept', priceKey: 'price', benefitsKey: 'runOfShow', note: 'Preview only. No event is scheduled and no ticket is sold until you create it in Live.' },
    prefill: (cp) => ({
      title: 'Live from the studio',
      concept: 'One hour, stripped-down performance plus the stories behind the songs, and questions answered live.',
      price: dollars(cp.ticketPriceCents),
      capacity: '',
      replay: 'included',
      runOfShow: ['Open: one song, no talking', 'The story behind the record', 'Two requests from the room', 'Questions', 'Close: the unreleased one'],
    }),
  },

  // 8. Executive Producer Session -> a seat-based session draft (submissions ARE real).
  {
    toolSlug: 'executive-producer-session',
    deliverableType: 'producer_session',
    title: 'Plan your producer session',
    subtitle: 'Sell a seat in the room where the record gets made. Edit anything before you save it.',
    saveLabel: 'Save my session',
    signupContext: 'Create your account to save your session offer and invite fans.',
    claimLine: 'Claim it by signing up, scheduling your session, and selling the seats.',
    transition: 'Turn this opportunity into a session offer.',
    buildCta: 'Build my session',
    continueRoute: '/studio/live',
    continueParams: (v) => ({ lm_prefill: '1', lm_title: String(v.title || ''), lm_submissions: '1', ...(v.price ? { lm_ticket_price: String(v.price) } : {}), ...(v.capacity ? { lm_max_slots: String(v.capacity) } : {}) }),
    steps: [
      {
        id: 'concept', group: 'Session', label: 'The session', fields: [
          { key: 'title', type: 'text', label: 'Session title', max: 80 },
          { key: 'concept', type: 'textarea', label: 'What the room actually watches you do', max: 300 },
        ],
      },
      {
        id: 'seat', group: 'Seats', label: 'Seats', fields: [
          { key: 'price', type: 'currency', label: 'Seat price', max: 5000, help: 'Suggested for your level. You set the final price.' },
          { key: 'capacity', type: 'number', label: 'How many seats', max: 500, help: 'A small room is the product. Keep it tight.' },
          { key: 'durationMins', type: 'number', label: 'Length (minutes)', max: 600 },
        ],
      },
      {
        id: 'access', group: 'Access', label: 'Access rules', fields: [
          { key: 'accessRules', type: 'lines', label: 'What a seat includes', max: 600, help: 'One per line. Only list what you will actually do.' },
        ],
      },
    ],
    preview: { kind: 'offer', titleKey: 'title', subtitleKey: 'concept', priceKey: 'price', benefitsKey: 'accessRules', note: 'Preview only. No session is scheduled and no seat is sold until you create it in Live.' },
    prefill: (cp) => ({
      title: 'Executive Producer Session',
      concept: 'A limited room watches the record get built in real time, and weighs in as it happens.',
      price: dollars(cp.ticketPriceCents),
      capacity: 20,
      durationMins: 90,
      accessRules: ['A seat in the live room', 'Vote in the advisory polls', 'Submit an idea for the session', 'The replay afterwards'],
    }),
  },

  // 9. Royalty Readiness -> a prioritized checklist. Diagnostic only, no dollar figure.
  {
    toolSlug: 'royalty-readiness-check',
    deliverableType: 'royalty_checklist',
    title: 'Your royalty action plan',
    subtitle: 'A checklist of the gaps your answers surfaced. This is a diagnostic, not a royalty statement and not legal or financial advice.',
    saveLabel: 'Save my action plan',
    signupContext: 'Create your account to save your royalty action plan and work through it.',
    transition: 'Turn these gaps into an action plan with an owner and a date.',
    buildCta: 'Review my action plan',
    continueRoute: '/royalty-readiness',
    steps: [
      {
        id: 'gaps', group: 'Gaps', label: 'What is missing', fields: [
          { key: 'gaps', type: 'lines', label: 'Gaps to close', max: 800, help: 'One per line, in the order you will do them.' },
        ],
      },
      {
        id: 'owner', group: 'Plan', label: 'Who and when', fields: [
          { key: 'owner', type: 'text', label: 'Who is doing this', max: 60, placeholder: 'e.g. me, my manager' },
          { key: 'targetDate', type: 'text', label: 'Target date', max: 40, placeholder: 'e.g. end of next month' },
          { key: 'firstAction', type: 'text', label: 'The first thing you will do', max: 160 },
        ],
      },
    ],
    preview: { kind: 'list', titleKey: 'firstAction', itemKeys: ['gaps', 'owner', 'targetDate'], note: 'CRWN diagnoses gaps. CRWN does not collect royalties and is not a publisher or administrator. Registration happens with the organizations named in your result.' },
    prefill: () => ({
      gaps: ['Register with a PRO as a writer', 'Register each song individually', 'Set up US mechanical collection', 'Register with SoundExchange', 'Check the back catalogue for unregistered releases'],
      owner: '',
      targetDate: '',
      firstAction: 'Register with a PRO this week',
    }),
  },

  // 10. Clip-to-Earn -> a campaign plan. No reward is activated anonymously.
  {
    toolSlug: 'clip-to-earn-campaign-planner',
    deliverableType: 'clip_campaign',
    title: 'Plan your clip campaign',
    subtitle: 'Decide what gets clipped and what the rules are. No reward is activated here.',
    saveLabel: 'Save my campaign',
    signupContext: 'Create your account to save your clip campaign and set it up inside the CRWN app.',
    transition: 'Turn your best moments into a campaign clippers can run.',
    buildCta: 'Build my campaign plan',
    continueRoute: '/bounties/new',
    steps: [
      {
        id: 'source', group: 'Source', label: 'What gets clipped', fields: [
          { key: 'sourceContent', type: 'text', label: 'Source content', max: 120, placeholder: 'e.g. the live session from last month' },
          { key: 'moments', type: 'lines', label: 'Moments worth clipping', max: 600, help: 'One per line. Be specific, clippers are not going to hunt.' },
        ],
      },
      {
        id: 'rules', group: 'Rules', label: 'The rules', fields: [
          { key: 'rules', type: 'lines', label: 'Campaign rules', max: 600 },
          { key: 'eligibility', type: 'text', label: 'Who can take part', max: 160 },
          { key: 'durationDays', type: 'number', label: 'How many days it runs', max: 365 },
        ],
      },
      {
        id: 'reward', group: 'Reward', label: 'Reward concept', fields: [
          { key: 'rewardConcept', type: 'textarea', label: 'What clippers get', max: 300, help: 'A concept only. Commission rates and payouts are set in CRWN, not here.' },
        ],
      },
    ],
    preview: { kind: 'list', titleKey: 'sourceContent', itemKeys: ['moments', 'rules', 'eligibility', 'rewardConcept'], note: 'A plan only. No campaign runs, no clipper is paid, and no commission is set until you create it in CRWN.' },
    // `rewardDetail` is the artist's own answer (their top-clip award, or the label for the reward
    // type they picked), so the reward step opens with what they already chose instead of blank.
    // sourceContent/moments/rules are still generic: the calculator HAS those answers, but they
    // only exist on the generated result's sections, and prefill is handed the conversionPayload
    // alone. Carrying them needs new payload keys, so it is filed rather than guessed at here.
    prefill: (cp) => ({
      sourceContent: '',
      moments: ['The hook everyone repeats', 'The story before the song', 'The unreleased snippet'],
      rules: ['Use the original audio', 'Tag me so it can be tracked', 'Keep it under 60 seconds'],
      eligibility: 'Any fan',
      durationDays: 30,
      rewardConcept: str(cp.rewardDetail, ''),
    }),
  },

  // 11. Movement Page -> an editable page draft with a real mobile preview.
  {
    toolSlug: 'movement-page-blueprint',
    deliverableType: 'movement_page',
    title: 'Draft your movement page',
    subtitle: 'The page a new fan lands on. Edit it and see exactly what they would see.',
    saveLabel: 'Save my page',
    signupContext: 'Create your account to save your movement page and publish it.',
    transition: 'Turn this into the page a new fan actually lands on.',
    buildCta: 'Build my page',
    continueRoute: '/studio/fans',
    steps: [
      {
        id: 'copy', group: 'Page', label: 'The words', fields: [
          { key: 'headline', type: 'text', label: 'Headline', max: 80 },
          { key: 'positioning', type: 'text', label: 'One line under it', max: 160 },
          { key: 'explanation', type: 'textarea', label: 'What this movement is', max: 400 },
        ],
      },
      {
        id: 'cta', group: 'Actions', label: 'What they can do', fields: [
          { key: 'primaryCta', type: 'text', label: 'Primary button', max: 40 },
          { key: 'secondaryCta', type: 'text', label: 'Secondary link', max: 40 },
          { key: 'featured', type: 'lines', label: 'Featured content', max: 400, help: 'One per line.' },
        ],
      },
    ],
    preview: { kind: 'page', titleKey: 'headline', subtitleKey: 'positioning', ctaKey: 'primaryCta', secondaryCtaKey: 'secondaryCta', benefitsKey: 'featured', note: 'Preview only. This page is not live until you publish it.' },
    prefill: () => ({
      headline: 'This is the movement, not a link tree',
      positioning: 'Where the people who actually care end up.',
      explanation: 'Everything I make lands here first. No algorithm decides who sees it.',
      primaryCta: 'Join the movement',
      secondaryCta: 'Hear the music',
      featured: ['The latest release', 'The story behind it', 'What is coming next'],
    }),
  },

  // 12. Top Fan Leaderboard -> recognition config. No real fan data anonymously.
  {
    toolSlug: 'top-fan-leaderboard-builder',
    deliverableType: 'leaderboard_config',
    title: 'Design your top fan recognition',
    subtitle: 'Decide what counts and what the top fans get. No real fan data is shown here.',
    saveLabel: 'Save my leaderboard',
    signupContext: 'Create your account to save your top fan leaderboard and turn it on.',
    transition: 'Turn recognition into a reason your top fans keep showing up.',
    buildCta: 'Build my leaderboard',
    continueRoute: '/studio/fans',
    steps: [
      {
        id: 'actions', group: 'Scoring', label: 'What counts', fields: [
          { key: 'actions', type: 'lines', label: 'Actions you recognize', max: 600, help: 'One per line.' },
          { key: 'scoring', type: 'textarea', label: 'How it is scored', max: 300 },
        ],
      },
      {
        id: 'rewards', group: 'Rewards', label: 'Levels and rewards', fields: [
          { key: 'levels', type: 'lines', label: 'Levels', max: 400, help: 'One per line.' },
          { key: 'rewards', type: 'lines', label: 'What each level gets', max: 400 },
          { key: 'reset', type: 'option', label: 'Reset cadence', options: [...CADENCE, { value: 'never', label: 'Never resets' }] },
        ],
      },
    ],
    preview: { kind: 'list', titleKey: 'scoring', itemKeys: ['actions', 'levels', 'rewards', 'reset'], note: 'A plan. No fan is ranked or notified until you turn this on in CRWN.' },
    prefill: () => ({
      actions: ['Buying anything', 'Bringing a new fan', 'Showing up live', 'Sharing a clip'],
      scoring: 'Money spent counts most, then fans brought in, then showing up.',
      levels: ['Top 10', 'Top 3', 'Number one'],
      rewards: ['Named on the page', 'A voice note from me', 'A call and something signed'],
      reset: 'monthly',
    }),
  },

  // 13. Artist Quest Path -> an honest GENERAL path (the current result is not answer-dependent).
  {
    toolSlug: 'artist-quest-path',
    deliverableType: 'path_plan',
    title: 'Your build order',
    subtitle: 'This is the general order that works for most artists, not a result computed from your answers. Edit it to fit you.',
    saveLabel: 'Save my plan',
    transition: 'Turn the right order into a plan you can actually follow.',
    signupContext: 'Create your account to save your build order and start working through it.',
    buildCta: 'Build my plan',
    continueRoute: '/profile/artist',
    steps: [
      {
        id: 'now', group: 'Now', label: 'Where you are', fields: [
          { key: 'bottleneck', type: 'text', label: 'Your actual bottleneck right now', max: 160 },
          { key: 'firstAction', type: 'text', label: 'The one thing you will do first', max: 160 },
        ],
      },
      {
        id: 'order', group: 'Order', label: 'The order', fields: [
          { key: 'checklist', type: 'lines', label: 'Build order', max: 800, help: 'One per line. Move things around to fit your situation.' },
        ],
      },
    ],
    preview: { kind: 'list', titleKey: 'firstAction', itemKeys: ['bottleneck', 'checklist'], note: 'A general recommended order, edited by you. Not a personalized diagnosis.' },
    prefill: () => ({
      bottleneck: '',
      firstAction: 'Put up a place fans can actually reach me',
      checklist: ['A destination that is mine', 'A way to capture fans directly', 'One thing worth paying for', 'A reason to stay every month', 'Ask fans to bring other fans'],
    }),
  },

  // 14. Share-to-Earn -> FOUR campaigns, one per tier of the canonical ladder, all written for the
  // artist. Tier names/prices/benefits come from RECOMMENDED_LADDER (never a second tier source), and
  // each step shows what that tier actually includes so an artist who did not just run Streaming Loss
  // still knows what they are asking fans to share.
  //
  // HONESTY: a personal share LINK cannot exist before signup. Referral links are /[slug]/r/[code]
  // and need an artist slug plus a referral code, neither of which an anonymous visitor has. So the
  // campaigns ship with copyable MESSAGES (real, usable now) and the link slot is labeled as
  // generated after signup. We do not fabricate a link. Referral economics are untouched.
  {
    toolSlug: 'share-to-earn-planner',
    deliverableType: 'referral_campaigns',
    title: 'Build your share-to-earn campaigns',
    subtitle: 'One campaign per tier, already written. Edit the words, then copy them when you launch.',
    saveLabel: 'Save my campaigns',
    transition: 'Turn this estimate into a campaign your fans can share.',
    buildCta: 'Build my campaign',
    signupContext: 'Create your account to save your referral campaigns, get your share links, and start earning from fan referrals.',
    claimLine: 'Claim it by signing up, turning on share-to-earn, and giving your fans their links.',
    continueRoute: '/offers/new',
    continueParams: () => ({ lm_prefill: '1', lm_goal: 'grow-supporters', lm_share_on: '1' }),
    steps: [
      {
        id: 'how', group: 'How it works', label: 'The deal', fields: [
          { key: 'incentive', type: 'text', label: 'What the sharer gets', max: 160, help: 'Your referral rate is configured in the CRWN app after signup. Say it in your own words here.' },
          { key: 'explanation', type: 'textarea', label: 'How you explain it to fans', max: 300, help: 'Plain words. If a fan cannot repeat it, they will not share it.' },
          { key: 'instructions', type: 'lines', label: 'Exactly how to share it', max: 600, help: 'One per line. Vague asks get nothing.' },
        ],
      },
      {
        id: 'c0', group: 'Campaigns', label: 'The Wave', fields: [
          { key: 'c0Name', type: 'text', label: 'Offer name', max: 40 },
          { key: 'c0Message', type: 'textarea', label: 'The message your fans send to their friends', max: 400, help: 'The Wave is your free front door: free tracks and posts, community access, public livestreams.' },
        ],
      },
      {
        id: 'c1', group: 'Campaigns', label: 'Inner Circle', fields: [
          { key: 'c1Name', type: 'text', label: 'Offer name', max: 40 },
          { key: 'c1Message', type: 'textarea', label: 'The message your fans send to their friends', max: 400, help: 'Inner Circle: exclusive tracks and demos, 7-day early access, private posts, a vote on drops.' },
        ],
      },
      {
        id: 'c2', group: 'Campaigns', label: 'The Vault', fields: [
          { key: 'c2Name', type: 'text', label: 'Offer name', max: 40 },
          { key: 'c2Message', type: 'textarea', label: 'The message your fans send to their friends', max: 400, help: 'The Vault: unreleased songs, the full private archive, and a monthly unlock from your backlog.' },
        ],
      },
      {
        id: 'c3', group: 'Campaigns', label: 'Throne', fields: [
          { key: 'c3Name', type: 'text', label: 'Offer name', max: 40 },
          { key: 'c3Message', type: 'textarea', label: 'The message your fans send to their friends', max: 400, help: 'Throne: limited memberships, first listen, supporter credits, and private group listening events.' },
        ],
      },
    ],
    preview: {
      kind: 'campaigns',
      tiers: [
        { nameKey: 'c0Name', benefitsKey: 'c0Message' },
        { nameKey: 'c1Name', benefitsKey: 'c1Message' },
        { nameKey: 'c2Name', benefitsKey: 'c2Message' },
        { nameKey: 'c3Name', benefitsKey: 'c3Message' },
      ],
      note: 'A plan. Your personal share links are generated inside the CRWN app after you create your account, and referral rates and payouts are set there, not here.',
    },
    prefill: () => {
      const [wave, inner, vault, throne] = RECOMMENDED_LADDER;
      // Written in the FAN's voice, because a fan is the one sending it to their friends. It says
      // what the friend gets, and is honest that the sharer earns something for the referral.
      const msg = (name: string, hook: string) =>
        `You need to hear this. Everything they make lives in one place now, and ${name} gets you ${hook} I get a small cut when you join through my link, which is the only reason I can keep putting people on.`;
      return {
        incentive: 'A cut of what the fans they bring pay, for as long as those fans stay',
        explanation: 'You get your own link. Anyone who joins through it counts as yours, and you earn a share of what they pay for as long as they stay.',
        instructions: [
          'Send your link to three people who already play the music',
          'Post the link with a clip, not on its own',
          'Tell them exactly what they get for joining',
        ],
        c0Name: wave.name,
        c0Message: msg(wave.name, 'the music, the posts, and the community for free.'),
        c1Name: inner.name,
        c1Message: msg(inner.name, 'exclusive tracks, demos, and everything a week before anyone else.'),
        c2Name: vault.name,
        c2Message: msg(vault.name, 'the unreleased stuff, the full archive, and something new unlocked every month.'),
        c3Name: throne.name,
        c3Message: msg(throne.name, 'limited spots, first listen, and your name in the credits.'),
      };
    },
  },

  // 15. Fan Mission -> one measurable mission.
  {
    toolSlug: 'fan-mission-generator',
    deliverableType: 'fan_mission',
    title: 'Build your fan mission',
    subtitle: 'One clear action, one number, one deadline. Edit it and see what fans would see.',
    saveLabel: 'Save my mission',
    signupContext: 'Create your account to save your mission and launch it to your fans.',
    transition: 'Turn this into one clear mission your fans can complete.',
    buildCta: 'Build my mission',
    continueRoute: '/missions/new',
    continueParams: (v) => ({ lm_prefill: '1', lm_title: String(v.title || ''), lm_description: String(v.description || ''), ...(v.goalCount ? { lm_goal: String(v.goalCount) } : {}) }),
    steps: [
      {
        id: 'mission', group: 'Mission', label: 'The mission', fields: [
          { key: 'title', type: 'text', label: 'Mission title', max: 80 },
          { key: 'description', type: 'textarea', label: 'The exact action', max: 400, help: 'One action. If it needs a paragraph to explain, it is too complicated.' },
        ],
      },
      {
        id: 'goal', group: 'Goal', label: 'The number', fields: [
          { key: 'goalCount', type: 'number', label: 'Goal', max: 1000000 },
          { key: 'deadline', type: 'text', label: 'Deadline', max: 40, placeholder: 'e.g. 14 days' },
          { key: 'completion', type: 'text', label: 'How a fan knows they did it', max: 160 },
        ],
      },
      {
        id: 'reward', group: 'Reward', label: 'The reward', fields: [
          { key: 'reward', type: 'text', label: 'What happens when the goal is hit', max: 160 },
        ],
      },
    ],
    preview: { kind: 'offer', titleKey: 'title', subtitleKey: 'description', itemKeys: ['goalCount', 'deadline', 'completion', 'reward'], note: 'Preview only. No mission is live and no fan is notified until you launch it.' },
    prefill: (cp) => ({
      title: str(cp.title, 'Bring one person who has never heard me'),
      description: str(cp.description, 'Send the song to one person who has never heard it, and tell them why.'),
      goalCount: typeof cp.goal_count === 'number' ? cp.goal_count : 100,
      deadline: '14 days',
      completion: 'They send the link and the person follows',
      reward: '',
    }),
  },

  // 16. Proof of Demand -> a money-free demand test.
  {
    toolSlug: 'proof-of-demand-test-builder',
    deliverableType: 'demand_test',
    title: 'Build your demand test',
    subtitle: 'Prove fans want it before you spend anything. No fan is charged by a demand test.',
    saveLabel: 'Save my test',
    signupContext: 'Create your account to save your demand test and put it in front of your fans.',
    transition: 'Turn this idea into a demand test.',
    buildCta: 'Build my test',
    continueRoute: '/proof-of-demand/new',
    continueParams: (v) => ({ lm_prefill: '1', lm_title: String(v.title || ''), lm_description: String(v.description || ''), lm_signal: String(v.signalType || 'rsvp'), ...(v.threshold ? { lm_goal: String(v.threshold) } : {}) }),
    steps: [
      {
        id: 'idea', group: 'Idea', label: 'The idea', fields: [
          { key: 'title', type: 'text', label: 'What you are testing', max: 80 },
          { key: 'description', type: 'textarea', label: 'Describe it to a fan', max: 400 },
        ],
      },
      {
        id: 'signal', group: 'Signal', label: 'The signal', fields: [
          { key: 'signalType', type: 'option', label: 'What fans do to signal', options: [
            { value: 'rsvp', label: 'RSVP' },
            { value: 'vote', label: 'Vote' },
            { value: 'waitlist', label: 'Join a waitlist' },
          ] },
          { key: 'threshold', type: 'number', label: 'How many signals mean yes', max: 1000000 },
          { key: 'deadline', type: 'text', label: 'Deadline', max: 40, placeholder: 'e.g. 14 days' },
        ],
      },
      {
        id: 'rules', group: 'Rules', label: 'Success and failure', fields: [
          { key: 'successRule', type: 'text', label: 'If it hits, you will', max: 160 },
          { key: 'failureRule', type: 'text', label: 'If it misses, you will', max: 160, help: 'Deciding this now is the whole point.' },
        ],
      },
    ],
    preview: { kind: 'offer', titleKey: 'title', subtitleKey: 'description', itemKeys: ['signalType', 'threshold', 'deadline', 'successRule', 'failureRule'], note: 'Preview only. No test runs and no fan is charged until you launch it. A demand test never takes money.' },
    prefill: (cp) => ({
      title: str(cp.title, ''),
      description: str(cp.description, ''),
      signalType: str(cp.signal_type, 'rsvp'),
      threshold: typeof cp.goal_count === 'number' ? cp.goal_count : '',
      deadline: '14 days',
      successRule: 'Make it',
      failureRule: 'Do not spend the money',
    }),
  },

  // 18. The unified Opportunity Calculator -> the whole COORDINATED system, not one artifact.
  //
  // Every other spec here builds one thing. This one builds the business: the four-tier ladder
  // (with the Vault as a tier inside it), the two acquisition systems wired to those tiers, the
  // premium experience placed where the artist said it belongs, and the order to launch it in.
  // That coordination is the point: the calculator's number is only honest because the pieces are
  // one system, so the builder must not hand back a pile of unrelated drafts.
  //
  // Nothing here is a new claim. Tier names, prices and benefits are RECOMMENDED_LADDER, the same
  // canonical ladder Rise Mode Level 3 and the Tier Manager apply. Session and ticket prices come
  // from the model's own payload. Where a number was not modeled, the field starts empty.
  {
    toolSlug: 'opportunity-calculator',
    deliverableType: 'crwn_business_system',
    title: 'Build your CRWN plan',
    subtitle:
      'Your whole system is already written from your answers: the ladder, where the Vault sits, how fans bring fans, and what to launch first. Change anything.',
    saveLabel: 'Save my CRWN plan',
    transition: 'Turn that number into the system that produces it.',
    buildCta: 'Build my CRWN plan',
    signupContext: 'Create your account to save the business system we already built for you, and launch it inside the CRWN app.',
    claimLine: 'Claim it by signing up, publishing the ladder first, then switching on the growth systems in order.',
    overlapNote:
      'Counted once: your Vault is a tier, sharing and clips bring supporters to that same ladder, and only non-members buy a ticket.',
    continueRoute: '/offers/new',
    // The entry PAID tier is what the offer builder drafts. The rest of the coordinated system
    // rides along in the saved draft the artist already reviewed.
    continueParams: (v) => ({
      lm_prefill: '1',
      lm_goal: 'grow-supporters',
      lm_tier_name: String(v.t1Name || ''),
      ...(v.t1Price ? { lm_price: String(v.t1Price) } : {}),
    }),
    steps: [
      {
        id: 'wave', group: 'Membership', label: 'Your free front door', fields: [
          { key: 't0Name', type: 'text', label: 'Free tier name', max: 40, help: 'Every fan starts here. It costs nothing and it is where the ladder begins.' },
          { key: 't0Benefits', type: 'checklist', label: 'What free members get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[0]).map((b) => ({ value: b, label: b })), help: 'On by default. Uncheck anything you will not actually do.' },
        ],
      },
      {
        id: 'inner', group: 'Membership', label: 'Your entry paid tier', fields: [
          { key: 't1Name', type: 'text', label: 'Tier name', max: 40 },
          { key: 't1Price', type: 'currency', label: 'Monthly price', max: 500, help: 'The price the model used. You set the real number.' },
          { key: 't1Benefits', type: 'checklist', label: 'What they get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[1]).map((b) => ({ value: b, label: b })) },
        ],
      },
      {
        id: 'vault', group: 'Membership', label: 'Where your Vault sits', fields: [
          { key: 'vaultPlacement', type: 'option', label: 'How the Vault works', options: VAULT_PLACEMENT, help: 'Inside a tier is the default. Selling it separately replaces a rung of the ladder rather than adding a second membership on top of it.' },
          { key: 't2Name', type: 'text', label: 'Tier name', max: 40 },
          { key: 't2Price', type: 'currency', label: 'Monthly price', max: 500 },
          { key: 't2Benefits', type: 'checklist', label: 'What they get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[2]).map((b) => ({ value: b, label: b })), help: 'The monthly unlock comes from the backlog you already own, not something new each month.' },
        ],
      },
      {
        id: 'throne', group: 'Membership', label: 'Your top tier', fields: [
          { key: 't3Name', type: 'text', label: 'Tier name', max: 40 },
          { key: 't3Price', type: 'currency', label: 'Monthly price', max: 1000 },
          { key: 't3Benefits', type: 'checklist', label: 'What they get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[3]).map((b) => ({ value: b, label: b })), help: 'Uncheck anything you cannot serve at this level. This is the tier a premium session belongs to.' },
        ],
      },
      {
        id: 'share', group: 'Growth', label: 'Fans who bring fans', fields: [
          { key: 'shareOn', type: 'option', label: 'Run Share-to-Earn', options: ON_OFF, help: 'This is how supporters arrive, not a second place they pay. Its revenue is already inside your membership number.' },
          { key: 'shareCommission', type: 'number', label: 'Commission you pay, in percent', max: 50, help: 'What a fan earns on a subscription they bring in. You fund this, so keep it worth sharing but sustainable.' },
          { key: 'shareMessage', type: 'textarea', label: 'The line you give your fans', max: 400 },
        ],
      },
      {
        id: 'clip', group: 'Growth', label: 'Fans who clip you', fields: [
          { key: 'clipOn', type: 'option', label: 'Run Clip-to-Earn', options: ON_OFF, help: 'Clips convert the fans you already reach. They raise how many people pay, they do not create a separate income stream.' },
          { key: 'clipBrief', type: 'lines', label: 'What you want clipped', max: 600, help: 'One per line. Give them the exact moments, or they will guess.' },
        ],
      },
      {
        id: 'sessions', group: 'Experiences', label: 'Your premium session', fields: [
          { key: 'sessionStructure', type: 'option', label: 'How the session works', options: SESSION_STRUCTURE, help: 'Included makes your top tier worth its price. Ticketed earns on its own. Hybrid does both without charging a member twice.' },
          { key: 'sessionPrice', type: 'currency', label: 'Seat price', max: 1000, help: 'Priced for your level. Leave it blank if the session is a tier benefit.' },
          { key: 'sessionCadence', type: 'option', label: 'How often', options: CADENCE },
        ],
      },
      {
        id: 'live', group: 'Experiences', label: 'Your live night', fields: [
          { key: 'liveTicketPrice', type: 'currency', label: 'Ticket price', max: 500, help: 'Only fans who are not members buy this. Members already have the live in their tier.' },
          { key: 'liveRunOfShow', type: 'lines', label: 'Run of show', max: 600, help: 'One segment per line. A run of show is the difference between a hangout and a ticket people buy twice.' },
        ],
      },
      {
        id: 'launch', group: 'Launch', label: 'What you launch first', fields: [
          { key: 'launchOrder', type: 'lines', label: 'Your launch order', max: 800, help: 'Built from your answers. Reorder it if you disagree, but the membership has to be first: everything else feeds it.' },
        ],
      },
    ],
    preview: {
      kind: 'system',
      tiers: [
        { nameKey: 't0Name', benefitsKey: 't0Benefits' },
        { nameKey: 't1Name', priceKey: 't1Price', benefitsKey: 't1Benefits' },
        { nameKey: 't2Name', priceKey: 't2Price', benefitsKey: 't2Benefits' },
        { nameKey: 't3Name', priceKey: 't3Price', benefitsKey: 't3Benefits' },
      ],
      itemKeys: ['shareOn', 'clipOn', 'sessionStructure', 'liveTicketPrice', 'launchOrder'],
      note: 'Preview only. Nothing is live and no fan is charged until you publish. Recognition perks are recognition only: no ownership, royalties, publishing, or revenue participation.',
    },
    prefill: (cp) => {
      const modeled = Array.isArray(cp.ladder) ? (cp.ladder as { name?: string; priceCents?: number }[]) : [];
      const byName = (name: string) => modeled.find((t) => t.name === name);
      const [wave, inner, vault, throne] = RECOMMENDED_LADDER;
      const recs = Array.isArray(cp.recommendations)
        ? (cp.recommendations as { key?: string; placement?: string }[])
        : [];
      const placementOf = (key: string) => recs.find((r) => r.key === key)?.placement;
      const sequence = Array.isArray(cp.launchSequence)
        ? (cp.launchSequence as { phase?: number; title?: string }[])
        : [];

      const sessionStructure = typeof cp.sessionStructure === 'string' ? cp.sessionStructure : 'none';
      const vaultPlacement =
        placementOf('vault') === 'sell_separately'
          ? 'standalone'
          : placementOf('vault') === 'not_yet'
            ? 'none'
            : 'tier';

      return {
        t0Name: wave.name,
        t0Benefits: benefitLabels(wave),
        t1Name: inner.name,
        t1Price: dollars(byName(inner.name)?.priceCents ?? inner.priceCents),
        t1Benefits: benefitLabels(inner),
        vaultPlacement,
        t2Name: vault.name,
        t2Price: dollars(byName(vault.name)?.priceCents ?? vault.priceCents),
        t2Benefits: benefitLabels(vault),
        t3Name: throne.name,
        t3Price: dollars(byName(throne.name)?.priceCents ?? throne.priceCents),
        t3Benefits: benefitLabels(throne),
        shareOn: placementOf('share_to_earn') === 'not_yet' ? 'off' : 'on',
        // The artist funds this out of their own margin, so the default is the low end of the
        // range the referral system already documents rather than a number we invented.
        shareCommission: 10,
        shareMessage:
          'I finally get paid when you put people onto me. Use my link, and if they subscribe we both eat.',
        clipOn: placementOf('clip_to_earn') === 'not_yet' ? 'off' : 'on',
        clipBrief: ['The hook', 'The hardest line in the verse', 'The beat drop', 'The story behind the song'],
        sessionStructure,
        // Only prefilled when the model actually priced a seat. A session that is a tier benefit
        // has no seat price, and we do not invent one.
        sessionPrice: sessionStructure === 'included' || sessionStructure === 'none' ? '' : dollars(cp.sessionSeatPriceCents),
        sessionCadence: 'monthly',
        liveTicketPrice: dollars(cp.liveTicketPriceCents),
        liveRunOfShow: [
          'Open with two songs',
          'The story behind one of them',
          'Questions from the room',
          'Something unreleased',
          'Close on whatever the room unlocked',
        ],
        launchOrder: sequence.length
          ? sequence.map((p) => `${p.phase}. ${p.title}`)
          : ['1. Launch the membership'],
      };
    },
    // Turning off a growth system, pulling the Vault out of the ladder, or making a session a tier
    // benefit all change the money. The model is re-run on the EDITED choices rather than the
    // original wizard answers, so the artist never carries a headline their own edits invalidated.
    recalc: (v, cp) => recalcUnified(v, cp),
  },

  // 19. Fan Stack Consolidation -> the four-tier ladder, opened with a mapping step so the artist
  // rebuilds what their members ALREADY pay for. Same ladder architecture as `worth`; the only
  // avatar-specific parts are the mapping step and the migration-honest preview note. Nothing here
  // migrates a member or touches an existing subscription.
  {
    toolSlug: 'fan-stack-calculator',
    deliverableType: 'consolidated_membership',
    title: 'Rebuild your membership in one place',
    subtitle: 'Map what your members get today, then review the four-tier home it all moves into. Change anything.',
    saveLabel: 'Save my consolidated membership',
    transition: 'Turn the fragmented stack into one membership your members will recognize.',
    buildCta: 'Build my consolidated membership',
    signupContext: 'Create your account to save your consolidated membership and open it beside your existing tools.',
    claimLine: 'Claim it by signing up, publishing the ladder, and personally inviting your existing members first.',
    continueRoute: '/offers/new',
    continueParams: (v) => ({
      lm_prefill: '1',
      lm_goal: 'grow-supporters',
      lm_tier_name: String(v.t1Name || ''),
      ...(v.t1Price ? { lm_price: String(v.t1Price) } : {}),
    }),
    steps: [
      {
        id: 'map', group: 'Your stack', label: 'What members get today', fields: [
          { key: 'existingTiers', type: 'lines', label: 'Your current tiers, one per line', max: 600, help: 'Name and price, e.g. "Backstage $5". This is the checklist the new ladder has to cover.' },
          { key: 'existingBenefits', type: 'lines', label: 'What those members are promised', max: 600, help: 'One per line. Anything you promise today must exist in the new home before anyone moves.' },
        ],
      },
      {
        id: 'wave', group: 'Ladder', label: 'Free front door', fields: [
          { key: 't0Name', type: 'text', label: 'Free tier name', max: 40, help: 'Free followers and list members land here first.' },
          { key: 't0Benefits', type: 'checklist', label: 'What free members get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[0]).map((b) => ({ value: b, label: b })) },
        ],
      },
      {
        id: 'inner', group: 'Ladder', label: 'Entry paid tier', fields: [
          { key: 't1Name', type: 'text', label: 'Tier name', max: 40 },
          { key: 't1Price', type: 'currency', label: 'Monthly price', max: 500, help: 'Match or beat your current entry price so moving is an upgrade, not a re-decision.' },
          { key: 't1Benefits', type: 'checklist', label: 'What they get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[1]).map((b) => ({ value: b, label: b })) },
        ],
      },
      {
        id: 'vault', group: 'Ladder', label: 'Mid tier', fields: [
          { key: 't2Name', type: 'text', label: 'Tier name', max: 40 },
          { key: 't2Price', type: 'currency', label: 'Monthly price', max: 500 },
          { key: 't2Benefits', type: 'checklist', label: 'What they get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[2]).map((b) => ({ value: b, label: b })) },
        ],
      },
      {
        id: 'throne', group: 'Ladder', label: 'Top tier', fields: [
          { key: 't3Name', type: 'text', label: 'Tier name', max: 40 },
          { key: 't3Price', type: 'currency', label: 'Monthly price', max: 1000 },
          { key: 't3Benefits', type: 'checklist', label: 'What they get', max: 800, options: benefitLabels(RECOMMENDED_LADDER[3]).map((b) => ({ value: b, label: b })) },
        ],
      },
    ],
    preview: {
      kind: 'ladder',
      tiers: [
        { nameKey: 't0Name', benefitsKey: 't0Benefits' },
        { nameKey: 't1Name', priceKey: 't1Price', benefitsKey: 't1Benefits' },
        { nameKey: 't2Name', priceKey: 't2Price', benefitsKey: 't2Benefits' },
        { nameKey: 't3Name', priceKey: 't3Price', benefitsKey: 't3Benefits' },
      ],
      note: 'Preview only. Nothing migrates automatically: your existing platforms and subscriptions are untouched until you invite members yourself.',
    },
    prefill: (cp) => {
      const modeled = Array.isArray(cp.ladder) ? (cp.ladder as { name?: string; priceCents?: number }[]) : [];
      const paidPrice = (i: number, fallbackCents: number) => dollars(modeled[i]?.priceCents ?? fallbackCents);
      const [wave, inner, vault, throne] = RECOMMENDED_LADDER;
      const platforms = Array.isArray(cp.platformsUsed) ? (cp.platformsUsed as unknown[]).map(String) : [];
      return {
        existingTiers: [],
        existingBenefits: platforms.length ? platforms.map((p) => `Whatever fans get on ${p} today`) : [],
        t0Name: wave.name,
        t0Benefits: benefitLabels(wave),
        t1Name: inner.name,
        t1Price: paidPrice(0, inner.priceCents),
        t1Benefits: benefitLabels(inner),
        t2Name: vault.name,
        t2Price: paidPrice(1, vault.priceCents),
        t2Benefits: benefitLabels(vault),
        t3Name: throne.name,
        t3Price: paidPrice(2, throne.priceCents),
        t3Benefits: benefitLabels(throne),
      };
    },
  },

  // 20. Between-Tour Revenue -> one recurring VIP membership. Benefits default to promises a
  // touring schedule can actually keep (the calculator's own honesty rule), and capacity is a
  // real editable field because limited experiences are the product.
  {
    toolSlug: 'between-tour-calculator',
    deliverableType: 'vip_membership',
    title: 'Build your VIP membership',
    subtitle: 'The year-round version of what your VIP buyers already paid for once. Edit anything before you save it.',
    saveLabel: 'Save my VIP membership',
    transition: 'Turn show-night buyers into members who pay every month.',
    buildCta: 'Build my VIP membership',
    signupContext: 'Create your account to save your VIP membership and invite your show audiences to it.',
    claimLine: 'Claim it by signing up, publishing the tier, and inviting your VIP buyers first.',
    continueRoute: '/offers/new',
    continueParams: (v) => ({
      lm_prefill: '1',
      lm_goal: 'grow-supporters',
      lm_tier_name: String(v.tierName || ''),
      ...(v.price ? { lm_price: String(v.price) } : {}),
    }),
    steps: [
      {
        id: 'offer', group: 'Offer', label: 'The membership', fields: [
          { key: 'tierName', type: 'text', label: 'Membership name', max: 40 },
          { key: 'price', type: 'currency', label: 'Monthly price', max: 500, help: 'The calculator modeled this. Your VIP buyers paid more for one night.' },
          { key: 'capacity', type: 'number', label: 'Member cap (0 for uncapped)', max: 100000, help: 'Limited access is the product. A real cap you will hold to.' },
        ],
      },
      {
        id: 'benefits', group: 'Offer', label: 'What members get', fields: [
          { key: 'benefits', type: 'lines', label: 'VIP benefits', max: 600, help: 'One per line. Only promise what a touring schedule can keep.' },
        ],
      },
      {
        id: 'cadence', group: 'Rhythm', label: 'The off-month rhythm', fields: [
          { key: 'streamCadence', type: 'option', label: 'Member livestreams', options: [
            { value: 'monthly', label: 'One per month' },
            { value: 'quarterly', label: 'One per quarter' },
            { value: 'none', label: 'None for now' },
          ], help: 'What keeps the membership alive between runs.' },
          { key: 'firstAction', type: 'text', label: 'The first thing members get', max: 160, help: 'e.g. presale codes for the next run, or the soundcheck stream.' },
        ],
      },
    ],
    preview: {
      kind: 'offer',
      titleKey: 'tierName',
      priceKey: 'price',
      benefitsKey: 'benefits',
      note: 'Preview only. No membership is live and no fan is charged until you publish it. Early access and presales apply to events you control.',
    },
    prefill: (cp) => ({
      tierName: str(cp.tierName, RECOMMENDED_LADDER[2].name),
      price: dollars(cp.priceCents ?? RECOMMENDED_LADDER[2].priceCents),
      capacity: '',
      benefits: [
        'Early ticket access and member presales',
        'Member-only tour updates first',
        'Backstage and soundcheck content',
        'Priority access to meet-and-greets and limited experiences',
        'A member livestream in the off months',
      ],
      streamCadence: 'monthly',
      firstAction: 'Presale access for the next run of shows',
    }),
  },
];

const BY_SLUG: Record<string, DeliverableSpec> = Object.fromEntries(SPECS.map((s) => [s.toolSlug, s]));

export const DELIVERABLE_SPECS = SPECS;
export function getDeliverableSpec(toolSlug: string): DeliverableSpec | null {
  return BY_SLUG[toolSlug] ?? null;
}
export function hasDeliverable(toolSlug: string): boolean {
  return !!BY_SLUG[toolSlug];
}
export const DELIVERABLE_TOOL_SLUGS = SPECS.map((s) => s.toolSlug);

/** Every field across a spec, flattened. */
export function specFields(spec: DeliverableSpec): DeliverableField[] {
  return spec.steps.flatMap((s) => s.fields);
}

/**
 * Coerce arbitrary input into bounded, allowlisted draft values for a spec. Unknown keys are
 * dropped, strings are stripped of markup and clamped, numbers are clamped to the field max.
 * This is the trust boundary for the public draft routes.
 */
export function sanitizeDeliverableValues(spec: DeliverableSpec, input: unknown): DraftValues {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: DraftValues = {};
  for (const f of specFields(spec)) {
    const v = o[f.key];
    if (v == null) continue;
    if (f.type === 'number' || f.type === 'currency') {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      out[f.key] = Math.min(Math.max(0, Math.round(n)), f.max ?? 1_000_000);
    } else if (f.type === 'lines' || f.type === 'checklist') {
      const arr = Array.isArray(v) ? v : String(v).split('\n');
      out[f.key] = arr
        .map((x) => clean(String(x), 200))
        .filter(Boolean)
        .slice(0, 20);
    } else if (f.type === 'option') {
      const allowed = (f.options || []).map((x) => x.value);
      if (typeof v === 'string' && allowed.includes(v)) out[f.key] = v;
    } else {
      out[f.key] = clean(String(v), f.max ?? 200);
    }
  }
  return out;
}

function clean(v: string, max: number): string {
  return v
    .replace(/[ -<>]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);
}

/** The transition line shown between the result and the builder. */
export function transitionFor(toolSlug: string): string {
  const spec = getDeliverableSpec(toolSlug);
  if (!spec) return 'Turn this result into something you can actually launch.';
  return spec.transition || `Turn this result into ${spec.title.toLowerCase().replace(/^build |^plan |^design |^draft |^sketch |^map |^schedule |^your /,'your ')}.`;
}

/** The primary advance-the-builder CTA. Derived from the save label when not set. NEVER signup. */
export function buildCtaFor(toolSlug: string): string {
  const spec = getDeliverableSpec(toolSlug);
  if (!spec) return 'Build it below';
  return spec.buildCta || spec.saveLabel.replace(/^Save/, 'Build');
}
