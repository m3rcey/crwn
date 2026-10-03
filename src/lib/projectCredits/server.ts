// Project credits: the service-role reads and writes. Rules live in ./credits.ts.
// Every caller passes the ADMIN client: project_credits and product_offer_events are closed to the
// browser roles (supabase/schema-phase2-project-credits.sql), so these functions are the only way in.

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  isCreditLevel,
  publicCredits,
  resolveProject,
  seatsLeft,
  type CreditLevel,
  type CreditRow,
  type PublicCreditList,
} from './credits';
import { isPresentableArtistName } from '@/lib/publicName';
import { creditsVerdict, funnelLines, type CreditsFunnel, type CreditsVerdict } from './verdict';
import { creditsPath } from './credits';

type Db = any;

/**
 * Number the credit a completed purchase earned. Idempotent (a replayed webhook gets the same
 * number) and best-effort: a failure here must never block the money path that called it, so it
 * logs and returns null rather than throwing.
 */
export async function assignCreditForPurchase(admin: Db, purchaseId: string): Promise<number | null> {
  try {
    const { data, error } = await admin.rpc('assign_project_credit', { p_purchase: purchaseId });
    if (error) {
      // 42883 / PGRST202: the migration is not applied yet. The purchase stands; the credit is
      // assigned by re-running the assigner once it is (scripts/credits-scorecard.mjs --repair).
      console.error('assign_project_credit failed:', error.code, error.message);
      return null;
    }
    return typeof data === 'number' ? data : null;
  } catch (err) {
    console.error('assign_project_credit threw:', err);
    return null;
  }
}

function toRow(r: any): CreditRow | null {
  if (!r || !isCreditLevel(r.level)) return null;
  return {
    level: r.level,
    credit_number: r.credit_number,
    credit_name: r.credit_name ?? null,
    listed: !!r.listed,
    purchase_status: r.purchase?.status ?? null,
  };
}

/** Every credit on a project, joined to its purchase status. Feed it to publicCredits(). */
export async function loadProjectCredits(admin: Db, albumId: string): Promise<CreditRow[]> {
  const { data } = await admin
    .from('project_credits')
    .select('level, credit_number, credit_name, listed, purchase:purchases(status)')
    .eq('album_id', albumId)
    .order('credit_number', { ascending: true });
  return ((data as any[]) || []).map(toRow).filter((r): r is CreditRow => !!r);
}

export interface FanCredit extends CreditRow {
  id: string;
}

/** The fan's own standing and refunded credits on one project. */
export async function loadFanCredits(admin: Db, fanId: string, albumId: string): Promise<FanCredit[]> {
  const { data } = await admin
    .from('project_credits')
    .select('id, level, credit_number, credit_name, listed, purchase:purchases(status)')
    .eq('fan_id', fanId)
    .eq('album_id', albumId);
  return ((data as any[]) || [])
    .map((r) => {
      const row = toRow(r);
      return row ? { ...row, id: r.id as string } : null;
    })
    .filter((r): r is FanCredit => !!r);
}

/** Levels this fan currently holds on a project (refunded credits excluded). */
export async function heldCreditLevels(admin: Db, fanId: string, albumId: string): Promise<CreditLevel[]> {
  const rows = await loadFanCredits(admin, fanId, albumId);
  return rows.filter((r) => r.purchase_status === 'completed').map((r) => r.level);
}

/**
 * Fans holding a standing FOUNDING credit on `albumId` from `artistId`. The artist match is the
 * line that makes a session pointed at someone else's album seat nobody.
 */
export async function foundingHolders(admin: Db, artistId: string, albumId: string): Promise<string[]> {
  const { data } = await admin
    .from('project_credits')
    .select('fan_id, purchase:purchases(status)')
    .eq('artist_id', artistId)
    .eq('album_id', albumId)
    .eq('level', 'founding');
  return ((data as any[]) || [])
    .filter((r) => r.purchase?.status === 'completed')
    .map((r) => r.fan_id as string);
}

export type OfferEventType = 'offer_viewed' | 'offer_checkout_started' | 'offer_declined';
export type OfferPlacement = 'primary' | 'downsell';

export function isOfferPlacement(v: unknown): v is OfferPlacement {
  return v === 'primary' || v === 'downsell';
}

/**
 * Record one offer event. The artist is read off the product row, never taken from a caller, and
 * only a credits product is recorded, so a forged body cannot fill the table with other products.
 * Duplicates inside the day grain are ignored. Analytics only: it never throws.
 */
export async function recordOfferEvent(
  admin: Db,
  input: { productId: string; eventType: OfferEventType; placement: OfferPlacement; visitorHash: string; fanId: string | null },
): Promise<void> {
  try {
    const { data: product } = await admin
      .from('products')
      .select('artist_id, credit_level')
      .eq('id', input.productId)
      .maybeSingle();
    if (!product?.artist_id || !product.credit_level) return;
    await admin.from('product_offer_events').upsert(
      {
        artist_id: product.artist_id,
        product_id: input.productId,
        event_type: input.eventType,
        placement: input.placement,
        visitor_hash: input.visitorHash,
        fan_id: input.fanId,
        event_date: new Date().toISOString().slice(0, 10),
      },
      { onConflict: 'product_id,event_type,placement,visitor_hash,event_date', ignoreDuplicates: true },
    );
  } catch {
    /* analytics never breaks a page or a checkout */
  }
}

export interface CreditOffer {
  id: string;
  level: CreditLevel;
  title: string;
  description: string | null;
  priceCents: number;
  seatsLeft: number | null;
  cap: number | null;
}

export interface CreditsProject {
  artist: { id: string; slug: string; name: string; avatarUrl: string | null };
  album: { id: string; title: string; artUrl: string | null };
  offers: Partial<Record<CreditLevel, CreditOffer>>;
  credits: PublicCreditList;
}

/**
 * Everything a public credits surface needs, read once: the artist, the project the URL names, its
 * credits products (active ones only) and the public projection of its credits. Null when the
 * artist, the project, or any credits product for it does not exist, so every surface 404s alike.
 */
export async function loadCreditsProject(admin: Db, slug: string, projectParam: string): Promise<CreditsProject | null> {
  const { data: artist } = await admin
    .from('artist_profiles')
    .select('id, slug, user_id')
    .eq('slug', slug)
    .maybeSingle();
  if (!artist) return null;

  const { data: albums } = await admin
    .from('albums')
    .select('id, title, album_art_url')
    .eq('artist_id', artist.id)
    .eq('is_active', true);
  const album = resolveProject(((albums as any[]) || []) as { id: string; title: string; album_art_url: string | null }[], projectParam);
  if (!album) return null;

  const { data: products, error } = await admin
    .from('products')
    .select('id, title, description, price, max_quantity, quantity_sold, credit_level')
    .eq('artist_id', artist.id)
    .eq('credit_album_id', album.id)
    .eq('is_active', true);
  if (error) return null; // the migration is not applied: there is no credits offer yet
  const offers: Partial<Record<CreditLevel, CreditOffer>> = {};
  for (const p of (products as any[]) || []) {
    if (!isCreditLevel(p.credit_level) || offers[p.credit_level as CreditLevel]) continue;
    offers[p.credit_level as CreditLevel] = {
      id: p.id,
      level: p.credit_level,
      title: p.title,
      description: p.description ?? null,
      priceCents: p.price,
      seatsLeft: seatsLeft(p.max_quantity, p.quantity_sold),
      cap: p.max_quantity ?? null,
    };
  }
  if (!offers.founding && !offers.supporter) return null;

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', artist.user_id)
    .maybeSingle();
  const name = isPresentableArtistName(profile?.display_name ?? null) ? (profile!.display_name as string) : artist.slug;

  return {
    artist: { id: artist.id, slug: artist.slug, name, avatarUrl: profile?.avatar_url ?? null },
    album: { id: album.id, title: album.title, artUrl: album.album_art_url ?? null },
    offers,
    credits: publicCredits(await loadProjectCredits(admin, album.id)),
  };
}

/** One listed, standing credit, for its card. Null when it is unlisted, refunded or absent. */
export async function loadListedCredit(
  admin: Db,
  albumId: string,
  level: CreditLevel,
  n: number,
): Promise<{ name: string; number: number; level: CreditLevel } | null> {
  if (!Number.isInteger(n) || n < 1) return null;
  const { data } = await admin
    .from('project_credits')
    .select('level, credit_number, credit_name, listed, purchase:purchases(status)')
    .eq('album_id', albumId)
    .eq('level', level)
    .eq('credit_number', n)
    .maybeSingle();
  const row = toRow(data);
  if (!row) return null;
  const list = publicCredits([row]);
  return list[level][0] ?? null;
}

export interface CreditsScorecard {
  artistSlug: string;
  albumTitle: string;
  path: string;
  funnel: CreditsFunnel;
  verdict: CreditsVerdict;
  lines: string[];
}

/**
 * The pre-committed verdict for every project that sells credits, read on the service role. ONE
 * computation shared by the admin Money Model tab and scripts/project-credits.mjs, so the screen
 * and the script can never disagree. `applied: false` means the migration has not run.
 */
export async function loadCreditsScorecards(admin: Db): Promise<{ applied: boolean; scorecards: CreditsScorecard[] }> {
  const { data: products, error } = await admin
    .from('products')
    .select('id, artist_id, credit_album_id, credit_level, max_quantity')
    .not('credit_level', 'is', null);
  if (error) return { applied: false, scorecards: [] };

  const byAlbum = new Map<string, any[]>();
  for (const p of (products as any[]) || []) {
    if (!p.credit_album_id || !isCreditLevel(p.credit_level)) continue;
    byAlbum.set(p.credit_album_id, [...(byAlbum.get(p.credit_album_id) || []), p]);
  }

  async function distinct(productId: string | undefined, eventType: OfferEventType, placement?: OfferPlacement) {
    if (!productId) return 0;
    let q = admin.from('product_offer_events').select('visitor_hash').eq('product_id', productId).eq('event_type', eventType);
    if (placement) q = q.eq('placement', placement);
    const { data } = await q;
    return new Set(((data as any[]) || []).map((r) => r.visitor_hash)).size;
  }

  const scorecards: CreditsScorecard[] = [];
  for (const [albumId, group] of byAlbum) {
    const f = group.find((p) => p.credit_level === 'founding');
    const s = group.find((p) => p.credit_level === 'supporter');
    const [{ data: album }, { data: artist }] = await Promise.all([
      admin.from('albums').select('title').eq('id', albumId).maybeSingle(),
      admin.from('artist_profiles').select('slug').eq('id', group[0].artist_id).maybeSingle(),
    ]);
    if (!album || !artist) continue;
    const credits = await loadProjectCredits(admin, albumId);
    const standing = (level: CreditLevel) => credits.filter((c) => c.level === level && c.purchase_status === 'completed').length;
    const funnel: CreditsFunnel = {
      primaryViewers: await distinct(f?.id, 'offer_viewed', 'primary'),
      primaryCheckouts: await distinct(f?.id, 'offer_checkout_started'),
      declines: await distinct(f?.id, 'offer_declined', 'primary'),
      downsellViewers: await distinct(s?.id, 'offer_viewed', 'downsell'),
      downsellCheckouts: await distinct(s?.id, 'offer_checkout_started'),
      foundingSold: standing('founding'),
      foundingCap: f?.max_quantity ?? null,
      supporterSold: standing('supporter'),
      supporterCap: s?.max_quantity ?? null,
    };
    scorecards.push({
      artistSlug: artist.slug,
      albumTitle: album.title,
      path: creditsPath(artist.slug, album.title),
      funnel,
      verdict: creditsVerdict(funnel),
      lines: funnelLines(funnel),
    });
  }
  return { applied: true, scorecards };
}
