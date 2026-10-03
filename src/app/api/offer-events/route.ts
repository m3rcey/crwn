// POST /api/offer-events: the project-credits offer beacon (views and "no thanks").
//
// Same trust model as /api/tier-events: the body names a PRODUCT and nothing that identifies
// anyone; the artist is read off the product row; visitor_hash comes from the request headers;
// fan_id comes from the session cookie; checkout starts are NOT accepted here (product-checkout
// records them server-side). Founder devices are never counted. Always answers { ok: true }.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hashVisitor } from '@/lib/analytics/visitorHash';
import { requestHasDnt } from '@/lib/analytics/doNotTrack';
import { isOfferPlacement, recordOfferEvent, type OfferEventType } from '@/lib/projectCredits/server';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const OK = () => NextResponse.json({ ok: true });
const CLIENT_EVENT_TYPES = new Set<OfferEventType>(['offer_viewed', 'offer_declined']);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const productId = typeof body?.productId === 'string' && /^[0-9a-f-]{36}$/i.test(body.productId) ? body.productId : null;
    const eventType = CLIENT_EVENT_TYPES.has(body?.eventType) ? (body.eventType as OfferEventType) : null;
    if (!productId || !eventType) return OK();
    if (requestHasDnt(req.headers)) return OK();

    const visitorHash = await hashVisitor(req.headers);
    if (!visitorHash) return OK();

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

    await recordOfferEvent(admin, {
      productId,
      eventType,
      placement: isOfferPlacement(body?.placement) ? body.placement : 'primary',
      visitorHash,
      fanId,
    });
    return OK();
  } catch {
    return OK();
  }
}
