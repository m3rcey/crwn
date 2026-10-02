// The shape of a founder-assisted launch (the ICP concierge onboarding): everything
// scripts/onboard-launch-partner.mjs writes for one artist, as reviewable data.
//
// One file per artist beside gb.ts (princeDre.ts is the first built this way), registered in
// LAUNCH_PARTNERS below. checkLaunchPartner is the single validation both the script (before
// any write) and launchPartner.test.ts (for every registered artist) run, so a config that
// would ship a forbidden promise fails `npm test` instead of reaching a fan.
//
// Content rules this enforces, each a ratified CRWN rule (see CLAUDE.md):
//   - the four stock rungs at the recommended prices (tierTemplate.ts is the source of truth),
//     unless the config carries a founder-approved `prices` override for a paid rung;
//   - every structured identity is a SUPPORTED registry key standing for an approved line;
//   - offers pass the Tier Offer Experience write contract (benefit CTA, declared truth);
//   - no merch, no scarcity, no priority, no cadence, no rights language; no em/en dashes.

import type { TierOfferExperience } from '../types';
import { normalizeOfferExperience } from '../normalize';
import { benefitDelivery } from '../../benefitRegistry';
import { RECOMMENDED_LADDER } from '../../tierTemplate';
import { normalizeOptions, normalizeOfferSlug, MIN_OPTIONS, MAX_OPTIONS } from '../../songLab/core';
import { SHARE_TITLE_MAX } from '../../shareMetadata';
import { slugify } from '../../slugify';

export const LADDER_RUNGS = ['Bronze', 'Silver', 'Gold', 'Platinum'] as const;
export type Rung = (typeof LADDER_RUNGS)[number];
export type PaidRung = Exclude<Rung, 'Bronze'>;

/** The vote lead magnet: fans hear 2-4 songs, tap one, and name + email cast the vote,
 *  which joins the free tier (and so the artist's Fan CRM). Rendered by Song Lab's public
 *  ballot at /{slug}/join/{offerSlug}. Songs are matched by TITLE among the artist's own
 *  FREE tracks at run time; until all exist the script builds everything else and waits. */
export interface VoteMagnetConfig {
  offerSlug: string;
  /** Internal label in the artist's Song Lab manager. */
  offerName: string;
  headline: string;
  description: string;
  question: string;
  /** Song Lab project the poll hangs off, e.g. "Next project vote". */
  projectTitle: string;
  stageLabel: string;
  /** Which rung the winning project drops on. Copy only: the artist makes the drop. */
  winnerRung: PaidRung;
  /** In ballot order. `file` / `artFile` are repo-relative local paths: when the track is
   *  not on the artist's page yet, the script uploads it (free forever, the Studio upload
   *  convention) and gives it a 128 kbps stream copy. Without them it waits for an upload. */
  options: { label: string; trackTitle: string; file?: string; artFile?: string }[];
  /** The vote no longer decides anything: the script closes the poll and takes the ballot page
   *  down instead of opening it. The option songs stay where they are (free tracks), and the
   *  config is kept so the songs stay known to the content and drop checks. */
  retired?: boolean;
}

/** Member drip (schema-phase2-tier-unlock-months.sql): each listed project opens to `rung`
 *  `months` after THAT MEMBER subscribed, while the rungs above keep it from day one. The
 *  script adds `rung` to the project's tracks and writes the delay in the SAME update, so the
 *  rung can never get the access without the delay. Only tracks gated ABOVE `rung` are
 *  touched: delaying a track the rung already has would take access away from paying members. */
export interface DripConfig {
  rung: PaidRung;
  /** In unlock order. `months` counts from the member's own start; whole months, 1 to 24. */
  projects: { title: string; months: number }[];
}

/** A track the launch uploads, gated from its LOWEST rung up. `placeholder` marks stand-in
 *  audio (a beat) uploaded under the title the real song will take, until the artist sends it. */
export interface ContentTrack {
  title: string;
  rung: Rung;
  file: string;
  artFile?: string;
  placeholder?: boolean;
}

/** A project (album) on the artist's page. `voteLabel` ties it to a vote option: when the
 *  artist records that option as the winner, `--unlock-winner` opens its Platinum-only
 *  tracks to Gold. */
export interface ContentProject {
  title: string;
  artFile?: string;
  voteLabel?: string;
  /** The day the project came out, `YYYY-MM-DD`. The Music tab orders by it and names the
   *  newest one, so a missing date reads as the oldest release. */
  releaseDate?: string;
  trackTitles: string[];
}

/** One drop funnel (/drop/<link>): one of the artist's tracks as the lead magnet, matched by
 *  title. The claim hands the fan a short-lived signed link to it and a free membership; the
 *  track keeps its rung gate on the artist page. An artist can run several, one per song. */
export interface DropConfig {
  magnetTrackTitle: string;
  magnetTitle: string;
  magnetDescription: string;
  live: boolean;
  linkSlug?: string;
}

/** The free-member follow-up (2026-10-02): what a fan who joined FREE hears after the welcome,
 *  until they buy. Written as the artist's ONE active `free_join` sequence, which every free join
 *  enters (artist page, share pages, votes, drops). Founder-approved copy in the artist's voice;
 *  `delay_days` is day N after the join. It stops the moment the fan holds `goalRung` or higher
 *  (sequences.goal_tier_id), so a fan who buys is never sold the thing they own. Shape, from
 *  docs/crwn-brain/35: two gives before the first ask, one concrete thing per ask, no deadline. */
export interface NurtureConfig {
  goalRung: PaidRung;
  steps: { delay_days: number; subject: string; body: string }[];
}

/** The only tokens the fan sequence cron resolves. Anything else would reach a fan raw. */
export const NURTURE_TOKENS = ['{{first_name}}', '{{artist_name}}'] as const;

export interface LaunchPartnerConfig {
  /** Registry key and the script argument. */
  key: string;
  email: string;
  /** The auth user id, pinned so a lookup can never land on the wrong account. */
  userId: string;
  slug: string;
  displayName: string;
  /** The artist's profile photo (repo-relative). Cropped to a centered square and uploaded as
   *  the setup wizard does; set only when the profile has none, or with --refresh-art. */
  photoFile?: string;
  promises: Record<Rung, string>;
  benefits: Record<Rung, string[]>;
  identities: Record<Rung, { key: string; line: string }[]>;
  offers: Record<PaidRung, TierOfferExperience>;
  /** The drop funnel leads with this rung and falls back to the one below it. */
  funnelPrimary: PaidRung;
  funnelDownsell: PaidRung;
  funnelPrimaryItem: { title: string; description: string };
  /** The drop funnel's lead magnet (/drop/<token>): one of the artist's own tracks, matched by
   *  title. The claim hands the fan a short-lived signed link to it and a free membership; the
   *  track itself keeps its rung gate on the artist page. `live` turns the funnel on. */
  drops?: DropConfig[];
  vote?: VoteMagnetConfig;
  content?: { tracks: ContentTrack[]; projects: ContentProject[] };
  drip?: DripConfig;
  /** A FOUNDER-APPROVED price for a paid rung, in cents, where this artist's audience calls for
   *  something other than the recommended ladder (Prince Dre's Platinum at $50, 2026-10-01).
   *  Rungs not named keep RECOMMENDED_LADDER's price. The script reprices only a tier with no
   *  active subscription, and moves the price and its Stripe price ids in one update. */
  prices?: Partial<Record<PaidRung, number>>;
  nurture?: NurtureConfig;
}

/** The drop funnel's public link segment, personalized (founder, 2026-09-29): never the random
 *  token, always `<artist slug>-<magnet song>` unless the config names one. /drop/<this>. It is
 *  a pointer to the funnel row, never authority (drafts still open only for their owner). */
export function dropLinkSlug(c: LaunchPartnerConfig, d: DropConfig): string {
  return d.linkSlug ?? `${c.slug}-${slugify(d.magnetTrackTitle)}`;
}
const DROP_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export const LADDER_PRICES_CENTS: Record<Rung, number> = Object.fromEntries(
  LADDER_RUNGS.map((r) => [r, RECOMMENDED_LADDER.find((l) => l.name === r)!.priceCents]),
) as Record<Rung, number>;

/** What each rung actually costs for this artist: the recommended ladder, overridden only where
 *  the config carries a founder-approved price. The script, the checks and the copy read this. */
export function ladderPricesFor(c: Pick<LaunchPartnerConfig, 'prices'>): Record<Rung, number> {
  return { ...LADDER_PRICES_CENTS, ...(c.prices ?? {}) };
}

const BANNED = ['merch', 'limited', 'priority', 'weekly', 'monthly', 'every month', 'royalt', 'ownership', 'guarantee', 'exclusive rights'];

/** Every reason this config may not be written. Empty means it is safe to apply. */
export function checkLaunchPartner(c: LaunchPartnerConfig): string[] {
  const errors: string[] = [];
  for (const rung of LADDER_RUNGS) {
    if (!c.promises[rung]) errors.push(`${rung}: no promise`);
    if (!c.benefits[rung]?.length) errors.push(`${rung}: no benefit lines`);
    for (const id of c.identities[rung] || []) {
      const def = benefitDelivery(id.key);
      if (!def || (def.support !== 'recommended' && def.support !== 'additional')) errors.push(`${rung}: ${id.key} is not a supported key`);
      if (!c.benefits[rung]?.includes(id.line)) errors.push(`${rung}: identity line "${id.line}" is not an approved line`);
    }
  }
  for (const rung of ['Silver', 'Gold', 'Platinum'] as PaidRung[]) {
    if (!normalizeOfferExperience(c.offers[rung], rung)) errors.push(`${rung}: offer fails the write contract`);
  }
  const prices = ladderPricesFor(c);
  for (const [rung, cents] of Object.entries(c.prices ?? {})) {
    if (rung === 'Bronze' || !LADDER_RUNGS.includes(rung as Rung)) errors.push(`prices: ${rung} is not a paid rung`);
    if (!Number.isInteger(cents) || cents < 100 || cents % 100 !== 0) errors.push(`prices: ${rung} must be whole dollars, at least $1 (in cents)`);
  }
  // The ladder must climb: the release waterfall staggers on PRICE order, and an inverted ladder
  // sells less for more.
  for (let i = 1; i < LADDER_RUNGS.length; i++) {
    if (prices[LADDER_RUNGS[i]] <= prices[LADDER_RUNGS[i - 1]]) errors.push(`prices: ${LADDER_RUNGS[i]} must cost more than ${LADDER_RUNGS[i - 1]}`);
  }
  if (prices[c.funnelDownsell] >= prices[c.funnelPrimary]) errors.push('funnel downsell must be cheaper than the primary');
  if (c.vote) {
    const v = c.vote;
    if (normalizeOfferSlug(v.offerSlug) !== v.offerSlug) errors.push(`vote: offer slug "${v.offerSlug}" is not a legal link`);
    // The headline IS the link preview's title (DMs, texts), which cuts at SHARE_TITLE_MAX.
    if (v.headline.length > SHARE_TITLE_MAX) errors.push(`vote: headline is ${v.headline.length} characters; a link preview cuts it at ${SHARE_TITLE_MAX}`);
    // An EMPTY options list is the pending state: the copy is approved, the songs are not
    // uploaded yet, and the script builds everything else and skips the poll.
    if (v.options.length > 0) {
      if (v.options.length < MIN_OPTIONS || v.options.length > MAX_OPTIONS) errors.push('vote: needs 2 to 4 songs');
      if (!normalizeOptions(v.options.map((o) => o.label))) errors.push('vote: option labels are not a legal ballot');
    }
    if (new Set(v.options.map((o) => o.trackTitle.toLowerCase())).size !== v.options.length) errors.push('vote: two options name the same song');
  }
  if (c.content) {
    const titles = c.content.tracks.map((t) => t.title.toLowerCase());
    if (new Set(titles).size !== titles.length) errors.push('content: two tracks share a title');
    const known = new Set([...titles, ...(c.vote?.options ?? []).map((o) => o.trackTitle.toLowerCase())]);
    for (const t of c.content.tracks) if (!LADDER_RUNGS.includes(t.rung)) errors.push(`content: ${t.title} has no valid rung`);
    for (const p of c.content.projects) {
      for (const tt of p.trackTitles) if (!known.has(tt.toLowerCase())) errors.push(`content: project ${p.title} lists unknown track "${tt}"`);
      if (p.voteLabel && !(c.vote?.options ?? []).some((o) => o.label === p.voteLabel)) errors.push(`content: project ${p.title} names a vote option that does not exist`);
    }
  }
  if (c.drip) {
    const d = c.drip;
    const above = LADDER_RUNGS.slice(LADDER_RUNGS.indexOf(d.rung) + 1);
    if (!above.length) errors.push(`drip: ${d.rung} is the top rung, so no rung keeps the projects from day one`);
    if (!c.content) errors.push('drip: needs content to drip');
    const seen = new Set<string>();
    let last = 0;
    for (const p of d.projects) {
      if (!Number.isInteger(p.months) || p.months < 1 || p.months > 24) errors.push(`drip: ${p.title} needs whole months from 1 to 24`);
      if (p.months <= last) errors.push(`drip: ${p.title} must open after the project before it`);
      last = p.months;
      if (seen.has(p.title)) errors.push(`drip: ${p.title} is listed twice`);
      seen.add(p.title);
      const project = c.content?.projects.find((x) => x.title === p.title);
      if (!project) { errors.push(`drip: ${p.title} is not a project this launch uploads`); continue; }
      // At least one of its tracks must sit above the drip rung, or the drip delays nothing.
      const gated = project.trackTitles.filter((tt) => {
        const t = c.content!.tracks.find((x) => x.title.toLowerCase() === tt.toLowerCase());
        return t && above.includes(t.rung as Rung);
      });
      if (!gated.length) errors.push(`drip: ${p.title} has no track above ${d.rung}, so there is nothing to delay`);
    }
    if (c.vote && !c.vote.retired && (c.content?.projects ?? []).some((p) => p.voteLabel && seen.has(p.title))) {
      errors.push('drip: a project cannot both drip on a clock and wait on a live vote');
    }
  }
  if (c.nurture) {
    const n = c.nurture;
    if (!LADDER_RUNGS.includes(n.goalRung) || n.goalRung === ('Bronze' as Rung)) errors.push('nurture: goalRung must be a paid rung');
    if (n.steps.length < 2 || n.steps.length > 8) errors.push('nurture: needs 2 to 8 messages');
    let last = -1;
    n.steps.forEach((s, i) => {
      const at = `nurture message ${i + 1}`;
      if (!Number.isInteger(s.delay_days) || s.delay_days < 0 || s.delay_days > 60) errors.push(`${at}: day must be a whole number from 0 to 60`);
      if (s.delay_days <= last) errors.push(`${at}: must come after the message before it`);
      last = s.delay_days;
      if (!s.subject.trim() || s.subject.length > 70) errors.push(`${at}: subject must be 1 to 70 characters`);
      for (const tok of `${s.subject} ${s.body}`.match(/\{\{[^}]*\}\}/g) ?? []) {
        if (!(NURTURE_TOKENS as readonly string[]).includes(tok)) errors.push(`${at}: ${tok} is not a token the sender resolves`);
      }
      // Replies to a fan sequence land in CRWN's inbox, not the artist's: never ask for one.
      if (/\breply\b/i.test(s.body)) errors.push(`${at}: asks the fan to reply, and replies never reach the artist`);
      if (!s.body.includes(`thecrwn.app/${c.slug}`)) errors.push(`${at}: needs a link to the artist's page`);
    });
    // The first message must GIVE, not ask: the welcome already said what the paid rungs are.
    if (n.steps[0] && /\$\d/.test(n.steps[0].body)) errors.push('nurture message 1: names a price; the first message gives');
  }
  // Copy is checked, not file paths: a beat's filename is not a promise to a fan.
  for (const p of c.content?.projects ?? []) {
    if (p.releaseDate === undefined) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.releaseDate) || Number.isNaN(Date.parse(p.releaseDate))) {
      errors.push(`content: project ${p.title} has an unreadable release date "${p.releaseDate}"`);
    } else if (p.releaseDate > new Date().toISOString().slice(0, 10)) {
      errors.push(`content: project ${p.title} is dated in the future, so his page would call it released before it is`);
    }
  }
  // A drop names a song the launch actually uploads, or it would wait forever with no error.
  const songs = new Set([...(c.content?.tracks ?? []).map((t) => t.title.toLowerCase()), ...(c.vote?.options ?? []).map((o) => o.trackTitle.toLowerCase())]);
  for (const d of c.drops ?? []) if (!songs.has(d.magnetTrackTitle.toLowerCase())) errors.push(`drop: "${d.magnetTrackTitle}" is not a song this launch uploads`);
  const links = (c.drops ?? []).map((d) => dropLinkSlug(c, d));
  for (const link of links) if (!DROP_SLUG_RE.test(link)) errors.push(`drop: link "${link}" is not a clean lowercase slug`);
  if (new Set(links).size !== links.length) errors.push('drop: two funnels share a link');
  // A retired vote's copy is never published, so it is not checked as a promise.
  const text = JSON.stringify({ ...c, content: undefined, vote: c.vote && !c.vote.retired ? { ...c.vote, options: c.vote.options.map((o) => o.label) } : undefined });
  if (/[—–]/.test(text)) errors.push('an em or en dash is in the copy');
  if (/Join (Platinum|Gold|Silver|Bronze)/.test(text)) errors.push('a Join-tier button is in the copy');
  for (const b of BANNED) if (text.toLowerCase().includes(b)) errors.push(`forbidden promise language: "${b}"`);
  return errors;
}
