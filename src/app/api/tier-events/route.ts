// POST /api/tier-events — the tier-card view beacon.
//
// Views are the ONE tier signal only the browser knows: the server cannot tell which rungs a
// visitor actually scrolled to. Checkout starts are NOT accepted here. They are recorded
// server-side in /api/stripe/checkout at the authoritative moment a Stripe session is created,
// where a client cannot forge them and where a session that fails to create records nothing.
//
// Trust model, in the order it matters:
//   1. The body carries a TIER id and nothing else that identifies anyone. artist_id is read
//      off the tier row by the recorder, so a forged body cannot attribute a view to another
//      artist. There is no client-controlled artist id anywhere in this path.
//   2. visitor_hash is derived from the REQUEST headers with the same hash middleware uses for
//      page visits, so the caller cannot choose its own identity, and bots resolve to null and
//      are dropped before any write.
//   3. fan_id comes from the session cookie when there is one. It is never read from the body.
//   4. The write uses the service-role client. tier_events has no client INSERT grant, so this
//      route is the only way a row can be created.
//
// Always answers { ok: true }. A beacon that reports why it rejected something is a beacon
// that can be used to enumerate tier ids, and analytics must never break the page anyway.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hashVisitor } from '@/lib/analytics/visitorHash';
import { requestHasDnt } from '@/lib/analytics/doNotTrack';
import { recordTierEvent } from '@/lib/analytics/tierEvents';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const OK = NextResponse.json({ ok: true });

/** Attribution vocabulary the page can pass. Anything else is dropped, never stored raw. */
const ALLOWED_SOURCES = new Set(['clipper', 'referral', 'campaign', 'sequence', 'smart_link', 'direct']);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return OK;

    const tierIds: unknown = (body as { tierIds?: unknown }).tierIds;
    const single: unknown = (body as { tierId?: unknown }).tierId;

    // A page reveals several rungs at once, so the beacon batches. Bounded at the ladder's
    // realistic width plus headroom: an unbounded array would be a free amplification vector.
    const ids = (Array.isArray(tierIds) ? tierIds : single ? [single] : [])
      .filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64)
      .slice(0, 12);
    if (ids.length === 0) return OK;

    // Founder devices are never counted (src/lib/analytics/doNotTrack.ts).
    if (requestHasDnt(req.headers)) return OK;

    const visitorHash = await hashVisitor(req.headers);
    if (!visitorHash) return OK; // bot, or no usable identity: never counted

    // Session is optional. Most tier views are anonymous, and that is the normal case.
    let fanId: string | null = null;
    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      fanId = user?.id ?? null;
    } catch {
      /* anonymous */
    }

    const rawSource = (body as { source?: unknown }).source;
    const source = typeof rawSource === 'string' && ALLOWED_SOURCES.has(rawSource) ? rawSource : null;

    // Sequential rather than parallel: a handful of rows on a fire-and-forget beacon, and a
    // burst of concurrent upserts against one unique index buys nothing.
    for (const tierId of ids) {
      await recordTierEvent(supabaseAdmin, {
        tierId,
        eventType: 'tier_card_viewed',
        visitorHash,
        fanId,
        source,
      });
    }

    return OK;
  } catch {
    return OK;
  }
}
