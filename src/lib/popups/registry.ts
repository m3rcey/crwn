// Pop-up catalog — the single source of truth for every governed interruption.
//
// A pop-up exists to move ONE user ONE step further down the journey, or to grow
// the platform. It is NOT a broadcast channel. The engine (./index.ts) enforces a
// hard governor on top of everything here: at most ONE pop-up per user per day,
// plus each pop-up's own frequency cap. When in doubt, add nothing — an empty
// screen beats an annoyed user who mutes the whole surface.
//
// Copy rule (CLAUDE.md): lead with the LOSS, never the gain. Name the money not
// earned / the fans not converted first, then the fix. No em dashes anywhere.

import { proBreakEvenGmvCents, scaleBreakEvenGmvCents } from '@/lib/planRecommendation';
import { TIER_LIMITS, TIER_PRICING } from '@/lib/platformTier';

export type PopupKind = 'modal' | 'banner' | 'survey';

export interface PopupContext {
  userId: string;
  role: 'fan' | 'artist' | 'admin';
  isArtist: boolean;
  platformTier: string | null; // 'starter' | 'pro' | 'scale' | null
  stripeConnected: boolean;
  /** Artists: their active subscriber count. Fans: their active subscription count. */
  supportCount: number;
  /** Artists only: have they ever sent a broadcast/DM to a fan? */
  hasSentBroadcast: boolean;
  /** Artists only: trailing 30-day GMV in cents (sum of earnings.gross_amount). */
  gmv30dCents: number;
  /** profiles.created_at, ISO. Null only if the read failed. */
  accountCreatedAt: string | null;
  /**
   * Dark-launch flags from admin_settings, keyed by flag name. An ANNOUNCEMENT
   * pop-up for a feature that ships dark MUST gate on its flag here, or flipping
   * popup_engine alone announces a feature the user cannot reach.
   */
  featureFlags: Record<string, boolean>;
  /**
   * Artists only: Rise Mode work that is genuinely PART DONE right now, or null.
   *
   * DERIVED, never stored. It reads the existing `quest_instances` rows the Quest Engine already
   * maintains (open status, progress strictly between 0 and 100), so there is no second progress
   * system and nothing to keep in sync. "Part done" is the whole test: a quest at 0% is not
   * something the artist left in the middle, it is just the next thing, and prompting about it
   * would be nagging rather than resuming.
   */
  resumable: { title: string; progressPercent: number } | null;
  /** Artists only: their public slug, which is also their Post-Win referral identity. */
  artistSlug: string | null;
  /**
   * Artists only: has the canonical `first_paid_conversion` funnel stage fired for them?
   *
   * Read from the existing win, never recomputed. The stage is deduped per artist across all six
   * paid rails, so this is idempotent by construction. It means "first paid member ON CRWN", not
   * "the first person who has ever paid this artist": the ICP may already have customers elsewhere.
   */
  hasFirstPaidConversion: boolean;
  /**
   * Fans (including artists who support other artists): does this user have an OPEN testimonial
   * request right now?
   *
   * DERIVED server-side from the `fan_testimonial_requests` row the daily generator created, in the
   * same shape as `resumable`: the registry stays a pure predicate over context and never queries.
   * A boolean rather than the request itself, because the pop-up is only the interrupt. The artist
   * name and the actual question live on the fan hub card, which is where the CTA goes, so no
   * per-user string has to be templated into this catalog.
   */
  hasPendingTestimonialRequest: boolean;
}

export interface PopupCta {
  label: string;
  href: string;
  /**
   * When set, the CTA COPIES this text instead of navigating.
   *
   * A generic capability, not a Post-Win special case: any pop-up whose action is "take this with
   * you" rather than "go here" can use it. Added because the alternative for the referral ask was
   * a dedicated referral page, and a whole surface for one copy button is a worse trade.
   *
   * `href` stays required and remains the fallback for anything that cannot use the clipboard.
   */
  copyText?: string;
}

export interface PopupSurveyConfig {
  question: string;
  lowLabel?: string;
  highLabel?: string;
  feedbackPrompt?: string;
}

export type PopupFrequency =
  | { type: 'once' }
  | { type: 'max'; max: number }
  | { type: 'everyN'; days: number; max?: number };

export interface PopupDef {
  key: string;
  kind: PopupKind;
  /**
   * Path prefixes that arm this pop-up. '*' matches any (main) page. Otherwise a
   * pop-up fires when the current pathname startsWith any listed prefix.
   */
  pages: string[];
  /** Return true if this user qualifies right now. Keep predicates cheap. */
  audience: (ctx: PopupContext) => boolean;
  frequency: PopupFrequency;
  /** Higher wins when several are eligible on the same page. */
  priority: number;
  /**
   * ANNOUNCEMENTS ONLY: when the change being announced went live (ISO date).
   * A user whose account was created on/after this date experiences the change
   * as the normal product, so "we changed X" is noise to them: the engine skips
   * the pop-up for them centrally. Leave unset for evergreen pop-ups.
   */
  announcedAt?: string;
  /** Internal only: what forward motion this pop-up is trying to cause. */
  goal: string;
  title: string;
  body: string;
  cta?: PopupCta;
  dismissLabel?: string;
  survey?: PopupSurveyConfig;
}

// Break-even GMV thresholds derived from live pricing (never hardcoded): the exact
// monthly sales volume where the next plan's subscription costs less than the fee
// delta it removes. Repricing the platform moves every number below automatically.
const PRO_BREAK_EVEN = proBreakEvenGmvCents(); // $1,225/mo at current pricing
const SCALE_BREAK_EVEN = scaleBreakEvenGmvCents(); // $5,000/mo at current pricing
const PRO_APPROACH = Math.round(PRO_BREAK_EVEN * 0.6); // the quiet early nudge (~$750)
const usd = (cents: number) => Math.round(cents / 100).toLocaleString();

export const POPUPS: PopupDef[] = [
  // ---- Artist: get paid (highest stakes, blocks money flow) ----
  {
    key: 'artist_connect_stripe',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && !c.stripeConnected,
    frequency: { type: 'everyN', days: 3, max: 4 },
    priority: 100,
    goal: 'Artist connects Stripe so fans can actually pay them.',
    title: 'Fans want to pay you. Right now they cannot.',
    body: 'Until your payouts are connected, every subscribe and every sale hits a dead end. The fan gives up, and that money never reaches you. Connecting takes about two minutes.',
    cta: { label: 'Connect payouts', href: '/account/payouts' },
    dismissLabel: 'Later',
  },

  // ---- Artist: resume Rise Mode work already part done ----
  //
  // The founder-requested "continue where you left off" prompt, deferred through several phases and
  // implemented here because both prerequisites are now live in production (`quest_engine` and
  // `popup_engine` are both on, and there is real quest state to resume).
  //
  // FOUR THINGS THAT KEEP IT FROM BECOMING NAGGING, and each is deliberate:
  //  1. `c.resumable` is null unless a quest is strictly between 0% and 100%, and it picks the
  //     HIGHEST progress first. That is the same rule as `recommendNextQuest`'s "finish what is
  //     underway" branch, on purpose: the prompt and Rise Mode must never disagree about which
  //     piece of work is meant, and this prompt is not allowed its own ranking.
  //  2. `pages` excludes `/profile/artist`. Rise Mode IS the destination, so prompting someone who
  //     is already looking at it would be absurd.
  //  3. Priority 40 puts it BELOW connecting Stripe (100), the first broadcast (80) and the upgrade
  //     nudges. Unfinished progress must never outrank money that cannot reach the artist, and the
  //     engine's one-pop-up-per-user-per-day cap applies on top.
  //  4. `everyN` 4 days, max 3. If someone has ignored it three times, they have answered.
  //
  // It stores nothing. The resumable state is derived from the rows the Quest Engine already keeps.
  //
  // WHAT THIS PROMPT MAY NOT SAY, corrected 2026-08-11.
  // -------------------------------------------------
  // It used to open with "You left something half done" and "Work you already started is sitting
  // there unfinished". **CRWN cannot support that claim.** Quest progress is not a record of
  // artist engagement: `syncQuest` sets `in_progress` automatically whenever an evaluated
  // condition rises above 0 (`nextStatus = result.progressPercent > 0 ? 'in_progress' : ...`), and
  // those conditions are DomainChecks over live database state. Progress climbs because the
  // account changed, not because anyone opened a quest. There is no `started_at`, no accept step
  // and no quest event log, so nothing anywhere proves the artist began this.
  //
  // Measured in production when this was corrected: all 16 eligible quests were `domain`-kind, and
  // they included "Reach $1,000 per month in recurring support" at **4%** and "Reach 25
  // supporters" at 40%. Those are outcome TARGETS that advance as the business grows. Telling an
  // artist they "left them half done" is false, and "pick it back up" is meaningless for a goal
  // there is no position to return to.
  //
  // The copy below therefore claims only what the row proves: a goal is genuinely partway. It is
  // still loss-framed, because partial progress really does earn nothing until it is finished.
  // Narrowing ELIGIBILITY instead would be the better fix, but it needs an engagement signal CRWN
  // does not record, and changing this predicate alone would desync it from `recommendNextQuest`
  // (see 1). That gap is documented rather than papered over.
  {
    key: 'artist_resume_rise',
    kind: 'modal',
    pages: ['/home', '/studio', '/library', '/explore'],
    audience: (c) => c.isArtist && !!c.featureFlags.quest_engine && !!c.resumable,
    frequency: { type: 'everyN', days: 4, max: 3 },
    priority: 40,
    goal: 'Artist finishes the Rise Mode goal that is closest to done instead of leaving it short.',
    title: 'You are closer to a goal than you think.',
    body: 'One of your Rise Mode goals is already partway there. Progress that stops short pays you nothing, and finishing the closest one costs less than starting something new.',
    cta: { label: 'See how close', href: '/profile/artist' },
    dismissLabel: 'Not now',
  },

  // ---- Artist: Post-Win referral ask (organic artist-to-artist acquisition) ----
  //
  // Fires after the CANONICAL win: `first_paid_conversion`, which is deduped per artist across all
  // six paid rails. It reads that win, it does not redefine it, and there is no `post_win_events`
  // table.
  //
  // WHAT THE COPY MAY CLAIM. "First paid member on CRWN", never "your first paying fan ever". The
  // ICP is the Independent Empire Builder, who may already have customers elsewhere; beginner
  // framing would be both wrong and insulting. It also may not claim CRWN CAUSED the payment.
  //
  // NO REWARD LANGUAGE, EVER. Founder decision: Post-Win referrals are unpaid, permanently, and
  // never retroactively commissionable. Nothing here may mention earning, commission, credit,
  // discount or a reward, because a hint of one is a promise CRWN has not made.
  //
  // Priority 30 puts it below Stripe (100), the first broadcast (80) and resume (40). A celebration
  // never outranks money that cannot reach the artist, and the engine's one-per-day cap and
  // single-winner sort mean a fan obligation or a launch blocker simply takes the moment instead.
  // Losing that contest defers it: `everyN` keeps it eligible later rather than cancelling it.
  {
    key: 'artist_post_win_referral',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.hasFirstPaidConversion && !!c.artistSlug,
    frequency: { type: 'everyN', days: 30, max: 2 },
    priority: 30,
    goal: 'A trusted artist introduces CRWN to another artist right after CRWN visibly worked.',
    title: 'Someone just paid you on CRWN.',
    body: 'That is the part most artists never get to. If you know another independent artist still handing their fan relationships to a platform, send them the link and let them see their own numbers.',
    cta: { label: 'Copy a link to share', href: '/tools/opportunity-calculator' },
    dismissLabel: 'Not now',
  },

  // ---- Artist: first broadcast (activation, protects retention) ----
  {
    key: 'artist_first_broadcast',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.stripeConnected && c.supportCount > 0 && !c.hasSentBroadcast,
    frequency: { type: 'everyN', days: 5, max: 3 },
    priority: 80,
    goal: 'Artist sends their first broadcast so new supporters do not drift.',
    title: 'Your supporters are already drifting.',
    body: 'People backed you and have not heard a word since. Silence is why they forget to renew. One short message keeps the ones you already earned.',
    cta: { label: 'Message your supporters', href: '/messages' },
    dismissLabel: 'Not yet',
  },

  // ---- Artist: upgrade to Pro (platform growth + lower fee for them) ----
  // The quiet early nudge: an activated artist (3+ supporters) or one whose real
  // trailing 30-day GMV is approaching Pro break-even. The hard one-time modals
  // below take over at the actual break-even lines.
  {
    key: 'artist_upgrade_pro',
    kind: 'banner',
    pages: ['/studio', '/profile/artist'],
    audience: (c) =>
      c.isArtist && c.platformTier === 'starter' && (c.supportCount >= 3 || c.gmv30dCents >= PRO_APPROACH),
    frequency: { type: 'everyN', days: 7, max: 4 },
    priority: 50,
    goal: 'Convert an activated Launch artist to Pro (8% fee, full operating features).',
    title: `You are giving away ${TIER_LIMITS.starter.platformFeePercent}% of every sale.`,
    body: `On the Launch plan CRWN keeps ${TIER_LIMITS.starter.platformFeePercent} percent. Pro drops that to ${TIER_LIMITS.pro.platformFeePercent} and unlocks live, DMs, scheduling and sequences. Above about $${usd(PRO_BREAK_EVEN)} a month in sales, staying on Launch costs you more than Pro does.`,
    cta: { label: 'See Pro', href: '/account/billing' },
    dismissLabel: 'Dismiss',
  },

  // ---- Artist: Pro break-even crossed (one-time, computed from REAL earnings) ----
  // Fires only when the artist's actual trailing 30-day GMV makes Launch the more
  // expensive plan. This is arithmetic, not marketing: the fee delta now exceeds
  // Pro's subscription every month they stay.
  {
    key: 'artist_pro_break_even',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.platformTier === 'starter' && c.gmv30dCents >= PRO_BREAK_EVEN,
    frequency: { type: 'once' },
    priority: 75,
    goal: 'Move a Launch artist past break-even onto Pro, where their fee bill drops.',
    title: 'Staying free is now costing you money.',
    body: `Your last 30 days of sales crossed $${usd(PRO_BREAK_EVEN)}. At that volume, Launch's ${TIER_LIMITS.starter.platformFeePercent}% fee costs more every month than Pro's $${TIER_PRICING.pro.monthlyDisplay} plus ${TIER_LIMITS.pro.platformFeePercent}%. Every month you wait, the difference comes out of your pocket.`,
    cta: { label: 'Switch to Pro', href: '/account/billing' },
    dismissLabel: 'Not now',
  },

  // ---- Artist: Scale break-even crossed (one-time, Pro artists only) ----
  {
    key: 'artist_scale_break_even',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.platformTier === 'pro' && c.gmv30dCents >= SCALE_BREAK_EVEN,
    frequency: { type: 'once' },
    priority: 75,
    goal: 'Move a Pro artist past break-even onto Scale, where their fee bill drops.',
    title: 'Pro is now your expensive plan.',
    body: `Your last 30 days of sales crossed $${usd(SCALE_BREAK_EVEN)}. At that volume, Scale's ${TIER_LIMITS.scale.platformFeePercent}% fee plus $${TIER_PRICING.scale.monthlyDisplay} costs less than what Pro's ${TIER_LIMITS.pro.platformFeePercent}% keeps taking. Every month on Pro past this line is money handed back.`,
    cta: { label: 'See Scale', href: '/account/billing' },
    dismissLabel: 'Not now',
  },

  // ---- Announcement: Launch plan limits raised (50 tracks, unlimited members) ----
  // Loss-framed on what the old caps were costing them. Announce-once; skipped for
  // accounts created after the change shipped (announcedAt), who met these limits as normal.
  {
    key: 'announce_launch_limits',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.platformTier === 'starter',
    frequency: { type: 'once' },
    priority: 45,
    announcedAt: '2026-07-31',
    goal: 'Free artists upload the catalog and import the fans the old caps made them leave out.',
    title: 'Your full catalog was locked out. It is not anymore.',
    body: 'The free plan (now called Launch) held you to 20 tracks and 100 members, which meant most of your catalog and your fan list stayed off CRWN earning nothing. Launch now holds 50 tracks and an unlimited number of members and contacts. The music and fans you left out are still making you $0 until you bring them in.',
    cta: { label: 'Upload your catalog', href: '/studio/music' },
    dismissLabel: 'Later',
  },

  // ---- Announcement: preview your page as a fan (artists only) ----
  // Not feature-flagged: the preview ships to everyone at once and is owner-only
  // by construction. Loss-framed on what a mis-configured ladder costs, because
  // that is the actual failure this fixes.
  {
    key: 'announce_fan_preview',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist,
    frequency: { type: 'once' },
    priority: 58,
    announcedAt: '2026-07-31',
    goal: 'Artist previews their page as a visitor and each tier, and finds the locks they set wrong before a fan does.',
    title: 'You have never seen your own page the way a fan does.',
    body: 'Everything looks unlocked to you because you own it. So the two ways a ladder breaks stay invisible: a free visitor hits a wall where your best song should be, or your paid catalog is sitting there free and nobody needs to subscribe. Either way you only find out from the money that never arrives. Open your page and switch between a visitor and each tier to see the real locks.',
    // /preview resolves the artist's own slug and opens the visitor lens. It used to point at
    // /profile/artist and lean on a "View as fan" pill that lived there; the pill moved to the
    // AccountHub identity header on 2026-08-13, which would have left this CTA landing nowhere.
    cta: { label: 'View my page as a fan', href: '/preview' },
    dismissLabel: 'Later',
  },

  // ---- Announcement: membership strategy + content classes (artists only) ----
  // Not feature-flagged: the strategy card and the class dropdown ship to
  // everyone at once. Loss-framed on the real failure it fixes: charging fans
  // only for music they can already stream is why memberships stall.
  {
    key: 'announce_membership_strategy',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist,
    frequency: { type: 'once' },
    priority: 58,
    announcedAt: '2026-08-01',
    goal: 'Artist opens their strategy card, classifies their catalog, and gives fans a reason to join beyond songs they can already stream.',
    title: 'Fans will not pay for music they can already stream.',
    body: 'If your membership only offers the same songs Spotify has, joining buys nothing and your tiers stall. Your tiers screen now carries your membership strategy: what each tier promises, your monthly promise, and a new way to mark every track as free forever, members first, or members only. The archive and the early window are what fans pay for.',
    // Was /profile/artist. The strategy card moved to the tiers screen on 2026-08-13, so this
    // CTA now opens the screen that actually carries it.
    cta: { label: 'See my strategy', href: '/account/tiers' },
    dismissLabel: 'Later',
  },

  // ---- Announcement: Rise Mode is one next move (artists only) ----
  // Not feature-flagged: the surface changed for everyone at once. Loss-framed on the real cost
  // of the screen it replaces, which is that four competing instructions produce zero actions.
  // Skipped for accounts created on or after announcedAt: they met the one-move screen at signup.
  {
    key: 'announce_rise_one_move',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist,
    frequency: { type: 'once' },
    priority: 56,
    announcedAt: '2026-08-13',
    goal: 'Artist opens Rise Mode, sees a single action, and does it instead of choosing between four.',
    title: 'Four things to do next is the same as none.',
    body: 'Rise Mode was showing you a roadmap milestone, a diagnosis, a strategy and a quest board at the same time, each pointing somewhere different, so the screen you opened to stop deciding made you decide again. It now names ONE move, why it matters, and what comes after it. A promise your paying supporters are still owed always beats a setup step. Your levels and quests moved to the quest board and are still counting.',
    cta: { label: 'See my next move', href: '/profile/artist' },
    dismissLabel: 'Later',
  },

  // ---- Fan: back an artist (activation, starts money flow) ----
  {
    key: 'fan_first_support',
    kind: 'modal',
    pages: ['/home', '/explore', '/library'],
    audience: (c) => c.role === 'fan' && c.supportCount === 0,
    frequency: { type: 'everyN', days: 5, max: 3 },
    priority: 60,
    goal: 'Fan converts a passive follow into a paid subscription.',
    title: 'A follow pays your favorite artist nothing.',
    body: 'The artists you listen to make almost nothing from streams and follows. Backing one directly is what actually keeps them making music, and it puts you on the inside.',
    cta: { label: 'Find an artist to back', href: '/explore' },
    dismissLabel: 'Maybe later',
  },

  // ---- Fan: share what supporting this artist has been like ----
  //
  // The interrupt half of the testimonial ask. The row was created by the daily generator only
  // after the fan EXPERIENCED value (a promise delivered to them, or thirty days paid and still
  // active), so this never fires at checkout.
  //
  // PRIORITY 10, the lowest in the catalog, and deliberately so. This is CRWN asking the fan for a
  // favour; it is not their money, their access, or their obligation. It must lose to Stripe (100),
  // the first broadcast (80), backing an artist (60), a live-tips announcement (55), resuming Rise
  // (40), the post-win ask (30) and the artist survey (20). Losing only DEFERS it: `everyN` keeps
  // it eligible tomorrow, and the fan hub card carries the same request in the meantime, so a fan
  // who never wins the daily slot can still answer.
  //
  // No reward language, ever. A testimonial adjacent to an incentive is discounted by everyone who
  // reads it, including the venue or brand the artist is trying to convince.
  {
    key: 'fan_share_experience',
    kind: 'modal',
    pages: ['/home', '/command', '/library'],
    audience: (c) => c.hasPendingTestimonialRequest,
    frequency: { type: 'everyN', days: 7, max: 3 },
    priority: 10,
    goal: 'Fan turns an experience they already had into proof the artist can actually use.',
    title: 'What you think stays in your head. It could be the reason someone else joins.',
    body: 'An artist you support asked one question about what this has been like. Nobody sees your answer unless you say they can, and they can never change your words.',
    cta: { label: 'Answer it', href: '/command' },
    dismissLabel: 'Not now',
  },

  // ---- Pop-up survey: artist satisfaction (feeds the improvement loop) ----
  {
    key: 'survey_artist_experience',
    kind: 'survey',
    pages: ['/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.supportCount >= 1,
    frequency: { type: 'everyN', days: 45, max: 4 },
    priority: 20,
    goal: 'Capture artist sentiment + a low-score alert so we know what to fix.',
    title: 'How is CRWN working for you?',
    body: 'Thirty seconds. Your answer goes straight to the founder.',
    survey: {
      question: 'How well is CRWN helping you grow and get paid?',
      lowLabel: 'Not working',
      highLabel: 'Working great',
      feedbackPrompt: 'What is the one thing we should fix first?',
    },
    dismissLabel: 'Not now',
  },

  // ---- Announcement: Live Tips + Tip Goals (artists only) ----
  // Gated on featureFlags.live_tips: before that flag is on there is no tip bar
  // and no Goals button, so announcing it would send artists looking for nothing.
  {
    key: 'announce_live_tips',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.featureFlags.live_tips === true,
    frequency: { type: 'once' },
    priority: 55,
    announcedAt: '2026-07-24',
    goal: 'Artist sets a tip goal on their next live session so the show earns instead of just entertaining.',
    title: 'Your last live show earned you nothing.',
    body: 'Fans who show up live are the ones most willing to pay, and until now there was no way for them to. Tips and tip goals are on: set a goal, and the room can see it fill in real time.',
    cta: { label: 'Set up my next live', href: '/studio/live' },
    dismissLabel: 'Later',
  },

  // ---- Announcement: Royalty Readiness Check (new surface, artists only) ----
  // Gated on featureFlags.royalty_readiness so this cannot fire while the feature
  // is still dark. Announce-once: a feature launch is news exactly one time.
  {
    key: 'announce_royalty_readiness',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.featureFlags.royalty_readiness === true,
    frequency: { type: 'once' },
    priority: 55,
    announcedAt: '2026-07-27',
    goal: 'Artist runs the Royalty Readiness Check and finds the streams nobody is collecting.',
    title: 'Your distributor is not collecting most of what your songs earn.',
    body: 'Performance royalties, mechanicals, digital radio, and everything outside the US are all paid by different organizations, and none of them pay you unless you are registered. Twelve questions will show you which ones currently have nobody assigned to them.',
    cta: { label: 'Check what I am missing', href: '/royalty-readiness' },
    dismissLabel: 'Later',
  },

  // ---- Announcement: Executive Producer Sessions (artists only) ----
  // Gated on featureFlags.producer_sessions: before that flag is on there is no
  // "let fans submit" toggle on the live form, so announcing it would send artists
  // looking for a control that isn't there. Loss-framed per the copy rule.
  {
    key: 'announce_producer_sessions',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist && c.featureFlags.producer_sessions === true,
    frequency: { type: 'once' },
    priority: 55,
    announcedAt: '2026-07-24',
    goal: 'Artist opens their next live session for fan submissions so the room pays to be in the process, not just to watch it.',
    title: 'You give your process away for free in vlogs.',
    body: 'The thing your fans crave most, being in the room while the music gets made, earns you nothing right now. Open your next live session for submissions: fans send beats, vocals, and ideas beforehand, you review and play the best on stream, and you keep full creative control.',
    cta: { label: 'Open my next session', href: '/studio/live' },
    dismissLabel: 'Later',
  },

  // ---- Announcement: the dashboard tabs became real screens (artists only) ----
  // Not feature-flagged: this shipped to everyone at once, and an artist who
  // opens the app to a rearranged menu without being told has to go hunting for
  // their own payouts. No audience gate beyond isArtist, because every existing
  // artist learned the old 16-tab strip and every one of them is affected.
  {
    key: 'announce_hub_navigation',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist'],
    audience: (c) => c.isArtist,
    frequency: { type: 'once' },
    priority: 60,
    announcedAt: '2026-07-26',
    goal: 'Artist opens the menu once and finds payouts, tiers, and billing where they now live.',
    title: 'Half your dashboard was hiding off the side of the screen.',
    body: 'Sixteen tabs in one scrolling row meant payouts, tiers, billing and referrals sat past the edge of your phone, and several links to them were landing on the wrong screen entirely. They are all full screens now: tap the menu (top left) for your money and your account, tap Studio for your tools.',
    cta: { label: 'Show me the menu', href: '/account/payouts?from=hub' },
    dismissLabel: 'Got it',
  },

  // ---- Announcement: live support chat + guide search on /support ----
  // Not feature-flagged: the /support page ships to everyone at once, and the chat
  // itself degrades to the contact form until its migration runs. Everyone sees it,
  // because fans get stuck too. Loss-framed per the copy rule.
  {
    key: 'announce_support_chat',
    kind: 'modal',
    pages: ['/home', '/studio', '/profile/artist', '/library'],
    audience: () => true,
    frequency: { type: 'once' },
    priority: 45,
    announcedAt: '2026-07-31',
    goal: 'User learns help now lives one tap away, so a stuck moment becomes a chat instead of a silent churn.',
    title: 'Getting stuck used to cost you two days.',
    body: 'Every question you sat on was momentum lost: a page not published, a payout not checked, a fan not converted. The Support page now answers instantly. Search every guide, chat and get an answer in seconds, and if the answer needs a human, a real person from CRWN steps into the same chat. Spot a bug anywhere? The flag in the corner reports it from the exact screen it happened on.',
    cta: { label: 'Open Support', href: '/support' },
    dismissLabel: 'Got it',
  },

  // ---- Notice: Terms updated 2026-07-24 (live-ticket refund clause) ----
  // Not marketing, so not loss-framed: Terms §1 promises notice of material changes,
  // and this banner is that notice. Buyer-favorable change (a seat is refundable when
  // the artist cancels or reschedules). Lowest priority: a legal notice must never
  // outcompete a money pop-up, and once ever is exactly what "notice" means.
  {
    key: 'notice_terms_2026_07_24',
    kind: 'banner',
    pages: ['/home', '/explore', '/library', '/studio', '/profile/artist'],
    audience: () => true,
    frequency: { type: 'once' },
    priority: 10,
    // Accounts created after the update accepted the CURRENT Terms at signup,
    // so the change notice is only owed to accounts that predate it.
    announcedAt: '2026-07-24',
    goal: 'Satisfy the Terms own notice promise for the live-ticket refund clause.',
    title: 'Our Terms were updated on July 24, 2026.',
    body: 'One addition: a live session or producer session seat is final once the session happens, and fully refundable if the artist cancels or reschedules to a time you cannot make.',
    cta: { label: 'Read the Terms', href: '/terms' },
    dismissLabel: 'Got it',
  },
];

/** Does this pop-up's page list arm it for the given pathname? */
export function popupArmedForPage(def: PopupDef, pathname: string): boolean {
  return def.pages.some((p) => p === '*' || pathname.startsWith(p));
}

export function getPopup(key: string): PopupDef | undefined {
  return POPUPS.find((p) => p.key === key);
}
