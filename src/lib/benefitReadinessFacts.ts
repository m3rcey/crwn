// benefitReadinessFacts.ts: the SERVER-side reads behind src/lib/benefitReadiness.ts.
//
// Lifted verbatim from /api/tier-benefits/readiness on 2026-09-03 so a second reader (the
// roadmap's Deliver step, which names the sold tier's first unready promise) uses the same
// facts instead of a copy. Every query is scoped to the artist id the caller resolved from the
// SESSION. Counts and dates only leave here; no object key, file name, signed URL or fan
// identity is part of a fact.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { artistAllowsDMs } from '@/lib/messaging';
import { isProducerSessionsEnabled } from '@/lib/producer/access';
import { buildDeliveryRows, type DeliveryFacts, type DeliveryRow } from '@/lib/benefitReadiness';

/** A missing table (pre-migration) or a read error reads as "no rows", never as a crash. */
async function rows<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await q;
    return error ? [] : (data ?? []);
  } catch {
    return [];
  }
}

export interface DeliveryReport {
  tiers: { id: string; name: string; price: number }[];
  rows: DeliveryRow[];
}

export async function loadDeliveryReport(
  admin: any,
  artist: { id: string; slug: string | null; song_lab_enabled?: boolean | null },
): Promise<DeliveryReport> {
  const artistId = artist.id;

  const tiers = await rows<{ id: string; name: string; price: number | null }>(
    admin.from('subscription_tiers').select('id, name, price').eq('artist_id', artistId).eq('is_active', true),
  );
  const tierIds = tiers.map((t) => t.id);
  const benefits = tierIds.length
    ? await rows<{ tier_id: string; benefit_type: string; config: Record<string, unknown> | null }>(
        admin.from('tier_benefits').select('tier_id, benefit_type, config').in('tier_id', tierIds).eq('is_active', true),
      )
    : [];

  const [tracks, posts, memberFiles, playlists, decisions, sessions, automations, products, credits, allowsDMs, producerOn] =
    await Promise.all([
      rows<DeliveryFacts['tracks'][number]>(
        admin.from('tracks').select('is_free, allowed_tier_ids, public_release_date, is_active').eq('artist_id', artistId),
      ),
      rows<DeliveryFacts['posts'][number]>(
        admin.from('community_posts').select('is_free, allowed_tier_ids, created_at').eq('artist_id', artistId).eq('is_artist_post', true),
      ),
      rows<DeliveryFacts['memberFiles'][number]>(
        admin.from('member_files').select('allowed_tier_ids, is_active').eq('artist_id', artistId),
      ),
      rows<{ id: string; is_free: boolean | null; allowed_tier_ids: string[] | null; is_active: boolean | null }>(
        admin.from('playlists').select('id, is_free, allowed_tier_ids, is_active').eq('artist_id', artistId).eq('is_artist_playlist', true),
      ),
      rows<DeliveryFacts['decisions'][number]>(
        admin
          .from('song_lab_decisions')
          .select('status, is_free, allowed_tier_ids, opens_at, closes_at, closed_at, stage_label')
          .eq('artist_id', artistId),
      ),
      rows<DeliveryFacts['sessions'][number]>(
        admin
          .from('live_sessions')
          .select('status, scheduled_at, is_free, allowed_tier_ids, is_active, accepts_submissions, submission_tier_ids, submission_deadline')
          .eq('artist_id', artistId),
      ),
      rows<{ status: string }>(admin.from('fan_automations').select('status').eq('artist_id', artistId)),
      rows<{ id: string }>(admin.from('products').select('id').eq('artist_id', artistId).eq('is_active', true)),
      rows<{ id: string }>(admin.from('release_credits').select('id').eq('artist_id', artistId)),
      artistAllowsDMs(admin, artistId).catch(() => false),
      isProducerSessionsEnabled(admin),
    ]);

  // Vault collections: the playlist gate is cosmetic, so readiness counts the TRACKS'
  // own gates inside each gated playlist. Two small reads, keyed only by ids.
  const gatedPlaylists = playlists.filter((p) => p.is_free === false && p.is_active !== false);
  let playlistTracks: { playlist_id: string; track_id: string }[] = [];
  let trackGates = new Map<string, { is_free: boolean | null; allowed_tier_ids: string[] | null; public_release_date: string | null }>();
  if (gatedPlaylists.length) {
    playlistTracks = await rows<{ playlist_id: string; track_id: string }>(
      admin.from('playlist_tracks').select('playlist_id, track_id').in('playlist_id', gatedPlaylists.map((p) => p.id)),
    );
    const trackIds = [...new Set(playlistTracks.map((pt) => pt.track_id))];
    if (trackIds.length) {
      const gates = await rows<{ id: string; is_free: boolean | null; allowed_tier_ids: string[] | null; public_release_date: string | null }>(
        admin.from('tracks').select('id, is_free, allowed_tier_ids, public_release_date').in('id', trackIds).eq('artist_id', artistId),
      );
      trackGates = new Map(gates.map((g) => [g.id, g]));
    }
  }
  const playlistFacts: DeliveryFacts['playlists'] = gatedPlaylists.map((p) => {
    const members = playlistTracks.filter((pt) => pt.playlist_id === p.id);
    const gated = members.filter((pt) => {
      const g = trackGates.get(pt.track_id);
      return g && g.is_free === false && Array.isArray(g.allowed_tier_ids) && g.allowed_tier_ids.length > 0;
    });
    return {
      is_free: p.is_free,
      allowed_tier_ids: p.allowed_tier_ids,
      is_active: p.is_active,
      trackCount: members.length,
      gatedTrackCount: gated.length,
    };
  });

  const facts: DeliveryFacts = {
    now: new Date(),
    tracks,
    posts,
    memberFiles,
    playlists: playlistFacts,
    decisions,
    sessions,
    automations,
    productCount: products.length,
    releaseCreditCount: credits.length,
    platformAllowsDMs: !!allowsDMs,
    songLabEnabled: artist.song_lab_enabled === true,
    producerSessionsEnabled: !!producerOn,
  };

  const ladder = tiers.map((t) => ({ id: t.id, name: t.name, price: t.price ?? 0 }));
  const deliveryRows = buildDeliveryRows({ tiers: ladder, benefits, facts, artistSlug: artist.slug || null });
  return { tiers: ladder, rows: deliveryRows };
}
