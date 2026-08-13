// calendarProjection.ts — SERVER ONLY. Builds the Promise Calendar (artist) and
// My CRWN Calendar (fan) by PROJECTING existing deadline-bearing rows plus the
// net-new fulfillment_events. We do not mirror rows into a calendar table — the
// calendar is a read model over what already exists.
//
// Pass a service-role ("admin") Supabase client. Callers MUST scope by an
// artistId / fanId they derived from the authenticated session (same pattern as
// /api/road-campaigns). Fan eligibility is enforced HERE in the API layer — this
// codebase gates tiers in app code, not RLS.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CalendarItem,
  type CalendarItemStatus,
  statusForDue,
} from './calendar';
import { servesTierIdsOf } from './promisePlan';

type Admin = SupabaseClient;

// ---------- ARTIST: Promise Calendar ----------

export async function getArtistCalendar(
  supabase: Admin,
  artistId: string,
): Promise<CalendarItem[]> {
  const nowIso = new Date().toISOString();
  const items: CalendarItem[] = [];

  const [events, campaigns, missions, cities, bounties, demand, lives] =
    await Promise.all([
      supabase
        .from('fulfillment_events')
        .select('id, title, due_at, status, eligible_fan_count, obligation_id, metadata')
        .eq('artist_id', artistId)
        .in('status', ['pending', 'missed', 'completed'])
        .order('due_at', { ascending: true })
        .limit(200),
      deadlineRows(supabase, 'road_campaigns', artistId, 'title, deadline, status, cta_label', ['active']),
      deadlineRows(supabase, 'missions', artistId, 'title, deadline, status, cta, audience', ['active']),
      deadlineRows(supabase, 'city_unlocks', artistId, 'title, deadline, status, target_city', ['active']),
      deadlineRows(supabase, 'clip_bounties', artistId, 'title, deadline, status, reward_detail', ['active']),
      deadlineRows(supabase, 'proof_of_demand', artistId, 'title, deadline, status', ['active']),
      supabase
        .from('live_sessions')
        .select('id, title, scheduled_at, status, is_free')
        .eq('artist_id', artistId)
        .eq('status', 'scheduled')
        .not('scheduled_at', 'is', null)
        .order('scheduled_at', { ascending: true })
        .limit(100),
    ]);

  for (const e of events.data || []) {
    const st: CalendarItemStatus =
      e.status === 'completed'
        ? 'completed'
        : e.status === 'missed'
          ? 'missed'
          : statusForDue(e.due_at);
    // Revenue-ramp steps ride the same table as promises but are a different thing: work the
    // artist owes THEMSELVES on the way to their calculator number, not a benefit a supporter
    // paid for. Typed apart so the calendar can say which is which and deep-link the step to
    // the screen where it gets done. Marker is written by revenueRampSeed.
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    const rampStepKey = typeof meta.ramp_step_key === 'string' ? meta.ramp_step_key : null;
    items.push({
      id: `fulfillment_event:${e.id}`,
      sourceType: 'fulfillment_event',
      sourceId: e.id,
      type: rampStepKey ? 'roadmap' : 'promise',
      title: e.title,
      subtitle: rampStepKey
        ? (typeof meta.ramp_phase_name === 'string' ? meta.ramp_phase_name : 'Roadmap')
        : e.eligible_fan_count > 0
          ? `${e.eligible_fan_count} supporters eligible`
          : undefined,
      dueAt: e.due_at,
      status: st,
      cta: st === 'completed' ? undefined : rampStepKey ? 'Do this step' : 'Mark complete',
      href: rampStepKey && typeof meta.ramp_href === 'string' ? meta.ramp_href : undefined,
      meta: {
        obligationId: e.obligation_id,
        ...(rampStepKey ? { rampStepKey, rampAccelerator: meta.ramp_accelerator === true } : {}),
      },
    });
  }

  pushDeadlineItems(items, campaigns.data, 'road_campaign', 'campaign', (r) => ({
    title: r.title,
    dueAt: r.deadline,
    cta: r.cta_label || 'Open campaign',
    href: '/studio/manager',
  }));
  pushDeadlineItems(items, missions.data, 'mission', 'mission', (r) => ({
    title: r.title,
    dueAt: r.deadline,
    subtitle: r.audience ? `Audience: ${r.audience}` : undefined,
    cta: 'Open mission',
    href: '/missions',
  }));
  pushDeadlineItems(items, cities.data, 'city_unlock', 'city_unlock', (r) => ({
    title: r.title,
    dueAt: r.deadline,
    subtitle: r.target_city || undefined,
    cta: 'Open unlock',
  }));
  pushDeadlineItems(items, bounties.data, 'clip_bounty', 'bounty', (r) => ({
    title: r.title,
    dueAt: r.deadline,
    reward: r.reward_detail || undefined,
    cta: 'Review submissions',
  }));
  pushDeadlineItems(items, demand.data, 'proof_of_demand', 'proof_of_demand', (r) => ({
    title: r.title,
    dueAt: r.deadline,
    cta: 'Open test',
    href: '/proof-of-demand',
  }));
  for (const l of lives.data || []) {
    if (!l.scheduled_at) continue;
    items.push({
      id: `live_session:${l.id}`,
      sourceType: 'live_session',
      sourceId: l.id,
      type: 'livestream',
      title: l.title,
      subtitle: l.is_free ? 'Open to all' : 'Supporters only',
      dueAt: l.scheduled_at,
      status: statusForDue(l.scheduled_at),
      cta: 'Go live',
      href: '/studio/live',
    });
  }

  void nowIso;
  return items;
}

// ---------- FAN: My CRWN Calendar ----------

export async function getFanCalendar(
  supabase: Admin,
  fanId: string,
): Promise<CalendarItem[]> {
  const now = new Date();
  const nowIso = now.toISOString();

  // The fan's active subscriptions define which artists' items they can see, and
  // (via tier_id) their eligibility for tier-gated livestreams.
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('id, artist_id, tier_id, current_period_end, status')
    .eq('fan_id', fanId)
    .eq('status', 'active');

  const activeSubs = subs || [];
  const artistIds = [...new Set(activeSubs.map((s) => s.artist_id).filter(Boolean))];
  if (artistIds.length === 0) return [];

  // tier per artist for eligibility checks
  const tierByArtist = new Map<string, string | null>();
  for (const s of activeSubs) tierByArtist.set(s.artist_id, s.tier_id ?? null);

  // Squad memberships → resolves squad-audience promised benefits.
  const { data: squadRows } = await supabase
    .from('artist_squad_members')
    .select('squad_id')
    .eq('fan_id', fanId);
  const fanSquadIds = new Set((squadRows || []).map((r: any) => r.squad_id).filter(Boolean));

  // Artist display names + slugs for labeling/links.
  const nameByArtist = await artistNameMap(supabase, artistIds);

  const items: CalendarItem[] = [];

  const [campaigns, missions, cities, bounties, demand, lives] = await Promise.all([
    upcomingByArtists(supabase, 'road_campaigns', artistIds, 'id, artist_id, title, deadline, cta_label', nowIso),
    upcomingByArtists(supabase, 'missions', artistIds, 'id, artist_id, title, deadline, cta, audience', nowIso),
    upcomingByArtists(supabase, 'city_unlocks', artistIds, 'id, artist_id, title, deadline, target_city', nowIso),
    upcomingByArtists(supabase, 'clip_bounties', artistIds, 'id, artist_id, title, deadline, reward_detail', nowIso),
    upcomingByArtists(supabase, 'proof_of_demand', artistIds, 'id, artist_id, title, deadline', nowIso),
    supabase
      .from('live_sessions')
      .select('id, artist_id, title, scheduled_at, is_free, allowed_tier_ids')
      .in('artist_id', artistIds)
      .eq('status', 'scheduled')
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(100),
  ]);

  const label = (artistId: string) => nameByArtist.get(artistId)?.name || 'An artist';

  for (const r of campaigns || []) {
    items.push(fanItem(r, 'road_campaign', 'campaign', label(r.artist_id), r.deadline, {
      cta: r.cta_label || 'Support',
      href: hrefFor(nameByArtist, r.artist_id),
    }));
  }
  for (const r of missions || []) {
    // audience 'free' benefits are not for paying-only; still show 'all'/'subscribers'.
    if (r.audience === 'free') continue;
    items.push(fanItem(r, 'mission', 'mission', label(r.artist_id), r.deadline, {
      cta: r.cta || 'Do mission',
      href: '/my-missions',
    }));
  }
  for (const r of cities || []) {
    items.push(fanItem(r, 'city_unlock', 'city_unlock', label(r.artist_id), r.deadline, {
      subtitle: r.target_city || undefined,
      cta: 'View unlock',
      href: hrefFor(nameByArtist, r.artist_id),
    }));
  }
  for (const r of bounties || []) {
    items.push(fanItem(r, 'clip_bounty', 'bounty', label(r.artist_id), r.deadline, {
      cta: 'Submit clip',
      reward: r.reward_detail || undefined,
      href: hrefFor(nameByArtist, r.artist_id),
    }));
  }
  for (const r of demand || []) {
    items.push(fanItem(r, 'proof_of_demand', 'proof_of_demand', label(r.artist_id), r.deadline, {
      cta: 'Respond',
      href: hrefFor(nameByArtist, r.artist_id),
    }));
  }
  for (const l of lives.data || []) {
    if (!l.scheduled_at) continue;
    if (!fanCanSeeLive(l, tierByArtist.get(l.artist_id) ?? null)) continue;
    items.push({
      id: `live_session:${l.id}`,
      sourceType: 'live_session',
      sourceId: l.id,
      type: 'livestream',
      title: l.title,
      subtitle: label(l.artist_id),
      dueAt: l.scheduled_at,
      status: statusForDue(l.scheduled_at),
      cta: 'Set reminder',
      href: hrefFor(nameByArtist, l.artist_id, '/live'),
    });
  }

  // Promised benefits the fan is eligible for. fulfillment_events are the artist's
  // private task list, but the ones flagged auto_create_fan_items and whose
  // obligation audience matches this fan's tier are things the fan GETS — surface
  // them as "what's coming". Only future/pending (gte now) so a fan never sees an
  // artist's overdue/missed promise.
  const { data: fEvents } = await supabase
    .from('fulfillment_events')
    .select('id, title, due_at, obligation_id, artist_id, metadata')
    .in('artist_id', artistIds)
    .eq('status', 'pending')
    .gte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(100);
  const obIds = [...new Set((fEvents || []).map((e) => e.obligation_id))];
  const { data: obs } = obIds.length
    ? await supabase
        .from('fulfillment_obligations')
        .select('id, artist_id, audience_kind, audience_id, auto_create_fan_items, status, metadata')
        .in('id', obIds)
    : { data: [] as any[] };
  const obById = new Map((obs || []).map((o: any) => [o.id, o]));
  for (const e of fEvents || []) {
    const ob = obById.get(e.obligation_id);
    if (!ob || ob.status !== 'active' || !ob.auto_create_fan_items) continue;
    // A revenue-ramp step is the artist's private growth plan ("message your 50 most engaged
    // fans"), never a promise a supporter bought. Seeding sets auto_create_fan_items false, so
    // the line above already excludes them; this is the second lock, because the column
    // DEFAULTS to true and one row created another way would leak the artist's roadmap.
    if (typeof (e.metadata as Record<string, unknown> | null)?.ramp_step_key === 'string') continue;
    if (!fanEligibleForObligation(ob, tierByArtist.get(e.artist_id) ?? null, fanSquadIds)) continue;
    items.push({
      id: `fulfillment_event:${e.id}`,
      sourceType: 'fulfillment_event',
      sourceId: e.id,
      type: 'promise',
      title: e.title,
      subtitle: label(e.artist_id),
      dueAt: e.due_at,
      status: statusForDue(e.due_at),
      cta: 'Notify me',
      href: hrefFor(nameByArtist, e.artist_id),
    });
  }

  // Fan's own subscription renewals.
  for (const s of activeSubs) {
    if (!s.current_period_end) continue;
    items.push({
      id: `subscription:${s.id}`,
      sourceType: 'subscription',
      sourceId: s.id,
      type: 'renewal',
      title: `${label(s.artist_id)} subscription renews`,
      subtitle: 'Billing',
      dueAt: s.current_period_end,
      status: statusForDue(s.current_period_end),
      href: '/library',
    });
  }

  return items;
}

// ---------- helpers ----------

function deadlineRows(
  supabase: Admin,
  table: string,
  artistId: string,
  cols: string,
  statuses: string[],
) {
  return supabase
    .from(table)
    .select(`id, ${cols}`)
    .eq('artist_id', artistId)
    .in('status', statuses)
    .not('deadline', 'is', null)
    .order('deadline', { ascending: true })
    .limit(100);
}

function upcomingByArtists(
  supabase: Admin,
  table: string,
  artistIds: string[],
  cols: string,
  nowIso: string,
) {
  return supabase
    .from(table)
    .select(cols)
    .in('artist_id', artistIds)
    .eq('status', 'active')
    .not('deadline', 'is', null)
    .gte('deadline', nowIso)
    .order('deadline', { ascending: true })
    .limit(100)
    .then((r) => r.data as any[] | null);
}

function pushDeadlineItems(
  items: CalendarItem[],
  rows: any[] | null,
  sourceType: CalendarItem['sourceType'],
  type: CalendarItem['type'],
  map: (r: any) => { title: string; dueAt: string | null; subtitle?: string; cta?: string; href?: string; reward?: string },
) {
  for (const r of rows || []) {
    const m = map(r);
    if (!m.dueAt) continue;
    items.push({
      id: `${sourceType}:${r.id}`,
      sourceType,
      sourceId: r.id,
      type,
      title: m.title,
      subtitle: m.subtitle,
      dueAt: m.dueAt,
      status: statusForDue(m.dueAt),
      cta: m.cta,
      href: m.href,
      reward: m.reward,
    });
  }
}

function fanItem(
  r: any,
  sourceType: CalendarItem['sourceType'],
  type: CalendarItem['type'],
  subtitle: string,
  dueAt: string,
  extra: { cta?: string; href?: string; reward?: string; subtitle?: string },
): CalendarItem {
  return {
    id: `${sourceType}:${r.id}`,
    sourceType,
    sourceId: r.id,
    type,
    title: r.title,
    subtitle: extra.subtitle ? `${subtitle} · ${extra.subtitle}` : subtitle,
    dueAt,
    status: statusForDue(dueAt),
    cta: extra.cta,
    href: extra.href,
    reward: extra.reward,
  };
}

/**
 * Is the fan eligible for a promised benefit, given the obligation's audience?
 *
 * EXPORTED because the testimonial request generator (src/lib/testimonials/server.ts) must answer
 * the identical question before asking a fan about a delivered promise, and a second copy of this
 * rule would let the calendar and the ask disagree about who was actually owed something.
 */
export function fanEligibleForObligation(
  ob: any,
  fanTierId: string | null,
  fanSquadIds: Set<string>,
): boolean {
  switch (ob.audience_kind) {
    case 'all_supporters':
      return true; // any active subscriber
    case 'tier':
      // The anchor tier, or any tier the obligation also serves (dedup merges and
      // "Everything in Gold" inheritance store those in metadata.serves_tier_ids —
      // see tierObligations.ts / promisePlan.ts).
      if (!fanTierId) return false;
      return ob.audience_id === fanTierId || servesTierIdsOf(ob.metadata).includes(fanTierId);
    case 'squad':
      return !!ob.audience_id && fanSquadIds.has(ob.audience_id);
    // campaign audience not yet resolved here — hide rather than over-expose.
    default:
      return false;
  }
}

/** live_sessions: free OR no gating list OR the fan's tier is in allowed_tier_ids. */
function fanCanSeeLive(live: any, fanTierId: string | null): boolean {
  if (live.is_free) return true;
  const allowed: string[] = Array.isArray(live.allowed_tier_ids) ? live.allowed_tier_ids : [];
  if (allowed.length === 0) return true; // supporters-only, any active sub qualifies
  return !!fanTierId && allowed.includes(fanTierId);
}

async function artistNameMap(
  supabase: Admin,
  artistIds: string[],
): Promise<Map<string, { name: string; slug: string | null }>> {
  const out = new Map<string, { name: string; slug: string | null }>();
  const { data: artists } = await supabase
    .from('artist_profiles')
    .select('id, user_id, slug')
    .in('id', artistIds);
  const userIds = (artists || []).map((a) => a.user_id).filter(Boolean);
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
    : { data: [] as any[] };
  const nameByUser = new Map<string, string>();
  for (const p of profiles || []) nameByUser.set(p.id, p.display_name || 'An artist');
  for (const a of artists || []) {
    out.set(a.id, { name: nameByUser.get(a.user_id) || 'An artist', slug: a.slug ?? null });
  }
  return out;
}

function hrefFor(
  nameByArtist: Map<string, { name: string; slug: string | null }>,
  artistId: string,
  suffix = '',
): string | undefined {
  const slug = nameByArtist.get(artistId)?.slug;
  return slug ? `/${slug}${suffix}` : undefined;
}
