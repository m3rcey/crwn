// Fan-facing testimonial API.
//
// AUTHORITY MODEL, and the defect it exists not to repeat:
// POST /api/surveys reads `respondentId` out of a signed token and never checks the session, so a
// forwarded survey link lets one person submit as another. That is tolerable for private research
// and unacceptable for words that get published beside a "Verified supporter" badge. Here the
// author is ALWAYS `session.user.id`. The client sends a request id and text; it never sends a fan
// id, an artist id, a context, or a verification claim, and there is no parameter that would let it.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  consentScopeFrom,
  displayIdentityFrom,
  validateTestimonialBody,
} from '@/lib/testimonials/core';
import {
  declineRequest,
  fanTestimonials,
  pendingRequestForFan,
  submitTestimonial,
  withdrawTestimonial,
} from '@/lib/testimonials/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** GET /api/testimonials — this fan's one open ask (if any) plus what they have already said. */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [pending, mine] = await Promise.all([
    pendingRequestForFan(supabaseAdmin, user.id),
    fanTestimonials(supabaseAdmin, user.id),
  ]);

  return NextResponse.json({ pending, mine });
}

/**
 * POST /api/testimonials
 *   { action: 'submit',   requestId, body, displayIdentity, allowPublicDisplay }
 *   { action: 'decline',  requestId }
 *   { action: 'withdraw', testimonialId }
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const action = payload?.action;

  if (action === 'decline') {
    if (typeof payload?.requestId !== 'string') {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
    const ok = await declineRequest(supabaseAdmin, user.id, payload.requestId);
    return NextResponse.json({ ok });
  }

  if (action === 'withdraw') {
    if (typeof payload?.testimonialId !== 'string') {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
    // Ownership is the session's, enforced inside the update predicate. A fan may withdraw their
    // own statement at any time, with no artist approval and no effect on their subscription.
    const ok = await withdrawTestimonial(supabaseAdmin, user.id, payload.testimonialId);
    return NextResponse.json({ ok });
  }

  if (action !== 'submit') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  if (typeof payload?.requestId !== 'string') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const validated = validateTestimonialBody(payload?.body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await submitTestimonial(supabaseAdmin, {
    fanId: user.id,
    requestId: payload.requestId,
    body: validated.body,
    displayIdentity: displayIdentityFrom(payload?.displayIdentity),
    // The consent checkbox. Unchecked is a real answer: the response is stored as private feedback
    // for the artist and can never be published, which is also the negative-feedback path.
    consentScope: consentScopeFrom(payload?.allowPublicDisplay),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, id: result.testimonialId, linksRemoved: validated.linksRemoved });
}
