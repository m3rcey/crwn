// benefitReadiness.ts — "is this promise ready?", answered from the delivery tables.
//
// PURE. The route (src/app/api/tier-benefits/readiness) counts rows for the signed-in
// artist and hands the facts in; this module turns facts into one state and one sentence per
// (tier, benefit). Nothing here reads a table, writes a table, or grants anything: readiness is
// a report ON the entitlement fields, never a second gate. The oracles (can_play_track,
// hasTierAccess, the member-files signer) are untouched and remain the only authority.
//
// States, in the order the panel sorts them (setup first):
//   needs_setup   a required configuration is missing (no Vault, Song Lab off, funnel not live)
//   nothing_yet   the benefit is selected but no consumable item exists for this rung
//   upcoming      a real future window or session exists
//   active        a vote, session or submission window is open right now
//   ready         something qualifying exists and members can receive it
//   manual        the artist delivers it; CRWN cannot verify it and does not pretend to
//   retired       a legacy key still on the tier; nothing delivers it
//
// Every fact is a COUNT or a DATE. No object key, filename, signed URL or fan identity is
// ever part of a fact, so the payload can never leak protected media.

import { classifyTrack } from '@/lib/membershipStrategy';
import { ladderOrder, type LadderTier } from '@/lib/tierLadder';
import {
  benefitDelivery,
  fastActionHref,
  type BenefitType,
  type ReadinessKey,
} from '@/lib/benefitRegistry';

export type ReadinessState =
  | 'needs_setup'
  | 'nothing_yet'
  | 'upcoming'
  | 'active'
  | 'ready'
  | 'manual'
  | 'retired';

export const STATE_ORDER: readonly ReadinessState[] = [
  'needs_setup',
  'nothing_yet',
  'upcoming',
  'active',
  'ready',
  'manual',
  'retired',
];

export const STATE_COPY: Record<ReadinessState, string> = {
  needs_setup: 'Needs setup',
  nothing_yet: 'Nothing published yet',
  upcoming: 'Upcoming',
  active: 'Active now',
  ready: 'Ready',
  manual: 'You deliver this',
  retired: 'No longer supported',
};

export interface Readiness {
  state: ReadinessState;
  /** One plain sentence. Counts and dates only. */
  fact: string;
}

/** Everything the resolvers may know. All rows belong to ONE artist; the route guarantees it. */
export interface DeliveryFacts {
  now: Date;
  tracks: { is_free: boolean | null; allowed_tier_ids: string[] | null; public_release_date: string | null; is_active: boolean | null }[];
  posts: { is_free: boolean | null; allowed_tier_ids: string[] | null; created_at: string | null }[];
  memberFiles: { allowed_tier_ids: string[] | null; is_active: boolean | null }[];
  playlists: { is_free: boolean | null; allowed_tier_ids: string[] | null; is_active: boolean | null; trackCount: number; gatedTrackCount: number }[];
  decisions: { status: string; is_free: boolean | null; allowed_tier_ids: string[] | null; opens_at: string | null; closes_at: string | null; closed_at: string | null; stage_label: string | null }[];
  sessions: {
    status: string;
    scheduled_at: string | null;
    is_free: boolean | null;
    allowed_tier_ids: string[] | null;
    is_active: boolean | null;
    accepts_submissions: boolean | null;
    submission_tier_ids: string[] | null;
    submission_deadline: string | null;
  }[];
  automations: { status: string }[];
  productCount: number;
  releaseCreditCount: number;
  platformAllowsDMs: boolean;
  songLabEnabled: boolean;
  producerSessionsEnabled: boolean;
}

export const EMPTY_FACTS: DeliveryFacts = {
  now: new Date(0),
  tracks: [],
  posts: [],
  memberFiles: [],
  playlists: [],
  decisions: [],
  sessions: [],
  automations: [],
  productCount: 0,
  releaseCreditCount: 0,
  platformAllowsDMs: false,
  songLabEnabled: false,
  producerSessionsEnabled: false,
};

const includes = (list: string[] | null | undefined, id: string) => Array.isArray(list) && list.includes(id);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const when = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
const dateWord = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const latest = (dates: (Date | null)[]) => dates.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

type Resolver = (f: DeliveryFacts, tierId: string) => Readiness;

const RESOLVERS: Record<ReadinessKey, Resolver> = {
  gated_tracks(f, tierId) {
    const n = f.tracks.filter(
      (t) => t.is_active !== false && classifyTrack(t, f.now) === 'member_only' && includes(t.allowed_tier_ids, tierId),
    ).length;
    return n > 0
      ? { state: 'ready', fact: `${plural(n, 'track')} play for this rung and lock for everyone else.` }
      : { state: 'nothing_yet', fact: 'No track is gated to this rung yet.' };
  },

  early_window(f, tierId) {
    const inWindow = f.tracks.filter(
      (t) => t.is_active !== false && classifyTrack(t, f.now) === 'paid_first' && includes(t.allowed_tier_ids, tierId),
    );
    if (inWindow.length > 0) {
      const opens = latest(inWindow.map((t) => when(t.public_release_date)));
      return {
        state: 'active',
        fact: `${plural(inWindow.length, 'track')} in a members-first window${opens ? `, public on ${dateWord(opens)}` : ''}.`,
      };
    }
    const past = f.tracks
      .filter((t) => includes(t.allowed_tier_ids, tierId) && when(t.public_release_date) && when(t.public_release_date)!.getTime() <= f.now.getTime())
      .map((t) => when(t.public_release_date));
    const last = latest(past);
    if (last) return { state: 'ready', fact: `Last members-first release opened to the public on ${dateWord(last)}.` };
    return { state: 'nothing_yet', fact: 'No release is in a members-first window.' };
  },

  gated_posts(f, tierId) {
    const posts = f.posts.filter((p) => p.is_free === false && includes(p.allowed_tier_ids, tierId));
    if (posts.length === 0) return { state: 'nothing_yet', fact: 'No member-only post for this rung yet.' };
    const last = latest(posts.map((p) => when(p.created_at)));
    return { state: 'ready', fact: `${plural(posts.length, 'member post')}${last ? `, latest ${dateWord(last)}` : ''}.` };
  },

  member_files(f, tierId) {
    const n = f.memberFiles.filter((m) => m.is_active !== false && includes(m.allowed_tier_ids, tierId)).length;
    return n > 0
      ? { state: 'ready', fact: `${plural(n, 'file bundle')} download for this rung.` }
      : { state: 'nothing_yet', fact: 'No stems or files added for this rung yet.' };
  },

  vault_playlist(f, tierId) {
    const vaults = f.playlists.filter((p) => p.is_active !== false && p.is_free === false && includes(p.allowed_tier_ids, tierId));
    if (vaults.length === 0) return { state: 'needs_setup', fact: 'No Vault collection exists for this rung yet.' };
    const gated = vaults.reduce((s, p) => s + p.gatedTrackCount, 0);
    const total = vaults.reduce((s, p) => s + p.trackCount, 0);
    if (gated > 0) return { state: 'ready', fact: `The Vault holds ${plural(gated, 'members-only track')}.` };
    if (total > 0) return { state: 'nothing_yet', fact: `${plural(total, 'track')} in the Vault, none members-only yet.` };
    return { state: 'nothing_yet', fact: 'The Vault is empty.' };
  },

  decisions(f, tierId) {
    const eligible = f.decisions.filter((d) => d.is_free === true || includes(d.allowed_tier_ids, tierId));
    const now = f.now.getTime();
    const openNow = eligible.filter((d) => {
      if (d.status !== 'open') return false;
      const o = when(d.opens_at);
      const c = when(d.closes_at);
      return (!o || o.getTime() <= now) && (!c || c.getTime() > now);
    });
    if (openNow.length > 0) {
      const stage = openNow[0].stage_label?.trim();
      return { state: 'active', fact: `A decision is open now${stage ? `: ${stage}` : ''}.` };
    }
    const upcoming = eligible
      .filter((d) => d.status === 'open' && when(d.opens_at) && when(d.opens_at)!.getTime() > now)
      .map((d) => when(d.opens_at)!)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (upcoming) return { state: 'upcoming', fact: `Next decision opens ${dateWord(upcoming)}.` };
    const closed = latest(eligible.filter((d) => d.status === 'closed').map((d) => when(d.closed_at) ?? when(d.closes_at)));
    if (closed) return { state: 'ready', fact: `Last decision closed ${dateWord(closed)}. Nothing is open now.` };
    if (eligible.some((d) => d.status === 'closed')) return { state: 'ready', fact: 'Past decisions exist. Nothing is open now.' };
    if (!f.songLabEnabled) return { state: 'needs_setup', fact: 'Song Lab is not switched on for this account.' };
    return { state: 'nothing_yet', fact: 'No decision has been opened for this rung.' };
  },

  sessions(f, tierId) {
    const eligible = f.sessions.filter((s) => s.is_active !== false && (s.is_free === true || includes(s.allowed_tier_ids, tierId)));
    if (eligible.some((s) => s.status === 'live')) return { state: 'active', fact: 'A session is live right now.' };
    const next = eligible
      .filter((s) => s.status === 'scheduled' && when(s.scheduled_at) && when(s.scheduled_at)!.getTime() > f.now.getTime())
      .map((s) => when(s.scheduled_at)!)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (next) return { state: 'upcoming', fact: `Next session ${dateWord(next)}.` };
    const ended = eligible.filter((s) => s.status === 'ended').length;
    if (ended > 0) return { state: 'ready', fact: `${plural(ended, 'past session')}. Nothing scheduled.` };
    return { state: 'nothing_yet', fact: 'No session scheduled for this rung.' };
  },

  submissions(f, tierId) {
    const now = f.now.getTime();
    const open = f.sessions.filter((s) => {
      if (s.is_active === false || s.status === 'ended' || s.accepts_submissions !== true) return false;
      const canWatch = s.is_free === true || includes(s.allowed_tier_ids, tierId);
      const canSubmit = s.submission_tier_ids === null || s.submission_tier_ids === undefined || includes(s.submission_tier_ids, tierId);
      const deadline = when(s.submission_deadline);
      return canWatch && canSubmit && (!deadline || deadline.getTime() > now);
    });
    if (open.length > 0) {
      const deadline = open.map((s) => when(s.submission_deadline)).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
      return { state: 'active', fact: deadline ? `Submissions open until ${dateWord(deadline)}.` : 'Submissions are open until the session starts.' };
    }
    if (!f.producerSessionsEnabled) return { state: 'needs_setup', fact: 'Executive Producer Sessions are not switched on yet.' };
    return { state: 'nothing_yet', fact: 'No submission window is open for this rung.' };
  },

  recognition() {
    return { state: 'ready', fact: 'Every member sees their rung and member-since date on your page.' };
  },

  welcome_unlock(f) {
    if (f.automations.some((a) => a.status === 'active')) return { state: 'ready', fact: 'Your drop funnel is live and delivers the unlock on join.' };
    if (f.automations.length > 0) return { state: 'needs_setup', fact: 'Your drop funnel exists but is not live.' };
    return { state: 'needs_setup', fact: 'No drop funnel yet.' };
  },

  drop_alerts() {
    return { state: 'ready', fact: 'In-app alerts reach every member when you publish a track. Email is one tap.' };
  },

  messaging(f) {
    return f.platformAllowsDMs
      ? { state: 'ready', fact: 'The inbox is open for this rung.' }
      : { state: 'needs_setup', fact: 'Direct messages need the Pro plan.' };
  },

  products(f) {
    return f.productCount > 0
      ? { state: 'ready', fact: `${plural(f.productCount, 'product')} in the shop; the discount applies at checkout.` }
      : { state: 'nothing_yet', fact: 'No product to discount yet.' };
  },

  release_credits(f) {
    return f.releaseCreditCount > 0
      ? { state: 'ready', fact: `${plural(f.releaseCreditCount, 'credit')} recorded.` }
      : { state: 'nothing_yet', fact: 'No release credited yet.' };
  },
};

/** One benefit on one tier, resolved. Manual and retired keys never claim readiness. */
export function resolveReadiness(benefit: string, facts: DeliveryFacts, tierId: string): Readiness {
  const def = benefitDelivery(benefit);
  if (!def) return { state: 'retired', fact: 'This benefit key is unknown.' };
  if (def.support === 'manual') return { state: 'manual', fact: def.delivery };
  if (def.support === 'retired') return { state: 'retired', fact: def.delivery };
  if (!def.readiness) return { state: 'manual', fact: def.delivery };
  return RESOLVERS[def.readiness](facts, tierId);
}

// ---------------------------------------------------------------------------
// Row assembly for the Promise to Delivery panel
// ---------------------------------------------------------------------------

export interface BenefitRowInput {
  tier_id: string;
  benefit_type: string;
  config: Record<string, unknown> | null;
}

export interface DeliveryRow {
  tierId: string;
  tierName: string;
  benefit: BenefitType;
  label: string;
  support: 'recommended' | 'additional' | 'manual' | 'retired';
  state: ReadinessState;
  fact: string;
  /** Higher tiers this benefit also serves, by cumulative access. */
  servesTierNames: string[];
  /** Set when the same benefit (same config) is already carried by a cheaper tier. */
  includedFromTierName: string | null;
  fastAction: { label: string; href: string } | null;
  /** True when the artist chose a cadence for it. */
  scheduled: boolean;
}

const configKey = (c: Record<string, unknown> | null) => JSON.stringify(c ?? {}, Object.keys(c ?? {}).sort());

/**
 * Turn the artist's tiers and benefit rows into panel rows: one per (tier, benefit), lowest
 * tier first, setup-first within a tier, inherited duplicates collapsed onto the tier that owns
 * them. Pure; the route supplies the facts.
 */
export function buildDeliveryRows(args: {
  tiers: LadderTier[];
  benefits: BenefitRowInput[];
  facts: DeliveryFacts;
  artistSlug: string | null;
}): DeliveryRow[] {
  const ordered = ladderOrder(args.tiers);
  const rows: DeliveryRow[] = [];
  /** benefit key + config -> the cheapest tier carrying it. */
  const owners = new Map<string, LadderTier>();

  for (const tier of ordered) {
    const above = ordered.filter((t) => t.price > tier.price).map((t) => t.name);
    const mine = args.benefits.filter((b) => b.tier_id === tier.id);
    const seen = new Set<string>();
    for (const b of mine) {
      const def = benefitDelivery(b.benefit_type);
      if (!def || seen.has(b.benefit_type)) continue;
      seen.add(b.benefit_type);
      const identity = `${b.benefit_type}|${configKey(b.config)}`;
      const owner = owners.get(identity);
      if (!owner) owners.set(identity, tier);
      const r = resolveReadiness(b.benefit_type, args.facts, tier.id);
      const href = fastActionHref(def.key, { tierId: tier.id, artistSlug: args.artistSlug });
      rows.push({
        tierId: tier.id,
        tierName: tier.name,
        benefit: def.key,
        label: def.label,
        support: def.support,
        state: r.state,
        fact: r.fact,
        servesTierNames: above,
        includedFromTierName: owner && owner.id !== tier.id ? owner.name : null,
        fastAction: def.fastAction && href ? { label: def.fastAction.label, href } : null,
        scheduled: typeof b.config?.frequency === 'string' && b.config.frequency !== '',
      });
    }
  }

  // Inherited duplicates are noise on the higher tier: the owner's row already names it.
  const visible = rows.filter((r) => !r.includedFromTierName);
  const tierIndex = new Map(ordered.map((t, i) => [t.id, i]));
  return visible.sort((a, b) => {
    const t = (tierIndex.get(a.tierId) ?? 0) - (tierIndex.get(b.tierId) ?? 0);
    if (t !== 0) return t;
    return STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state);
  });
}
