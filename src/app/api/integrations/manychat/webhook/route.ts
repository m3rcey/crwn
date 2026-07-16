// The ManyChat ingress. ONE route, one door, one place to get the security right.
//
// The brief specified seven endpoints. They share one auth path, one idempotency path, and
// one rate limiter, and they differ only in which schema validates the body. Seven copies of
// a security check is seven chances to omit one, and the omitted one is the one that gets
// exploited. So: one route, dispatching on `event_type`, with a distinct schema per type.
//
// Remember what this route is. Middleware EXCLUDES /api/, so nothing upstream has checked
// the caller. It runs with the service-role client, so nothing downstream will either. Its
// authorization is exactly what it does itself, and nothing more. This is the same shape as
// the /api/audience route that leaked every fan email in this codebase once already.
//
// Therefore, two invariants, enforced below:
//   1. It NEVER reads PII back out. Look at responseMapper: there is no field that could
//      carry an email, a phone, or another artist's data. A stolen webhook secret lets an
//      attacker WRITE junk leads. It does not let them READ anything.
//   2. It NEVER grants account access. Nothing here can set user_id on a lead identity.
//      Only a verified Supabase session can do that (see /api/lead-results/[token]/claim).

import { NextRequest, NextResponse } from 'next/server';
import { isAcquisitionEngineEnabled } from '@/lib/acquisition/db';
import { resolveOrCreate } from '@/lib/acquisition/identityResolution';
import { orchestrate } from '@/lib/acquisition/orchestration';
import { cacheResponse, claimEvent, recordEvent } from '@/lib/acquisition/eventOutbox';
import { buildError } from '@/lib/manychat/responseMapper';
import { deriveIdempotencyKey } from '@/lib/manychat/idempotency';
import { validateInbound } from '@/lib/manychat/schemas';
import { MAX_BODY_BYTES, verifyManyChatRequest } from '@/lib/manychat/verifyWebhook';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  // ---- 1. Verify. Fail closed. ----
  const raw = await req.text();

  if (raw.length > MAX_BODY_BYTES) {
    // A 32KB "Instagram DM" is not a DM. Reject before parsing, so a huge body cannot even
    // reach the JSON parser.
    return NextResponse.json(buildError('payload_too_large', false), { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(buildError('malformed_json', false), { status: 400 });
  }

  const sentAt = (body as { sent_at?: string } | null)?.sent_at ?? null;
  const verified = verifyManyChatRequest({
    presentedSecret: req.headers.get('x-webhook-secret'),
    sentAt,
  });

  if (!verified.ok) {
    // Deliberately vague. "not_configured" and "bad_secret" look identical from outside, so
    // an attacker cannot use the error to learn whether the endpoint is even wired up.
    console.warn('[manychat] rejected:', verified.reason);
    return NextResponse.json(buildError('unauthorized', false, 'Not authorized.'), { status: 401 });
  }

  // ---- 2. Validate. BEFORE the kill switch, deliberately. ----
  //
  // Being dark is a TESTING ASSET, not just a safety net. If the kill switch short-circuited
  // first, a dark engine would return 503 to a correct payload AND to a malformed one, so a
  // smoke test would prove the URL and the secret but say nothing about the body. You would
  // discover a broken payload only after going live, which is precisely when you cannot
  // afford to.
  //
  // Validating first means a dark engine still answers the question "is my body right?":
  //    400 -> your payload is wrong, and error_code names the field
  //    503 -> your payload is RIGHT, and only the flag is left
  //
  // This leaks nothing: the caller has already passed authentication to get here.
  const validation = validateInbound(body);
  if (!validation.ok) {
    return NextResponse.json(buildError(validation.code, false), { status: 400 });
  }
  const payload = validation.value;

  // ---- 3. Kill switch. The engine ships DARK. ----
  // Nothing below this line runs until admin_settings.acquisition_engine is flipped, so a
  // misconfigured ManyChat flow cannot write a single junk row. Retryable, so ManyChat backs
  // off rather than dropping the lead.
  if (!(await isAcquisitionEngineEnabled())) {
    return NextResponse.json(buildError('engine_disabled', true, 'One moment.'), { status: 503 });
  }

  // ---- 4. Rate limit, keyed to the CONTACT, not the IP. ----
  // ManyChat calls from its own servers, so every request shares a handful of IPs. An
  // IP-keyed limit would throttle all artists at once the moment one flow misbehaved. The
  // contact id is the real unit of abuse here.
  const allowed = await checkRateLimit(`mc:${payload.manychat_contact_id}`, 'manychat-webhook', 60, 20);
  if (!allowed) {
    return NextResponse.json(buildError('rate_limited', true, 'One moment.'), { status: 429 });
  }

  // ---- 5. Claim idempotency BEFORE any work. Insert-as-claim, not check-then-insert. ----
  //
  // ManyChat cannot supply a unique-per-delivery id (its field picker has no message id and
  // no timestamp), so CRWN derives one. See lib/manychat/idempotency.ts for why using the
  // Contact Id here would have frozen every conversation on question one.
  const idempotencyKey = deriveIdempotencyKey(payload);
  const claim = await claimEvent(idempotencyKey, `manychat.${payload.event_type}`);

  if (!claim.fresh) {
    // A replay. Return the ORIGINAL response so ManyChat's flow branches identically, and do
    // zero additional work. This is what makes a duplicate delivery a no-op rather than a
    // second result and a second DM.
    if (claim.cachedResponse) {
      return NextResponse.json(claim.cachedResponse, { status: 200 });
    }
    return NextResponse.json(buildError('duplicate_event', false, 'Already handled.'), { status: 200 });
  }

  // ---- 6. Orchestrate. ----
  try {
    const identity = await resolveOrCreate({
      manychatContactId: payload.manychat_contact_id,
      instagramUserId: payload.instagram_user_id ?? null,
      instagramUsername: payload.instagram_username ?? null,
      // NOTE what is absent: payload.email is NOT passed as verifiedEmail. An email typed
      // into an Instagram DM is a claim, not a verification, and treating it as one would let
      // anybody merge themselves into anybody else's lead by typing their address.
    });

    const response = await orchestrate(payload, identity);

    // Cache the answer so a retry of this exact event replays it byte for byte.
    await cacheResponse(claim.eventRowId, response);

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    // Log the shape, never the payload. The payload contains the artist's message.
    console.error('[manychat] orchestration failed:', err instanceof Error ? err.message : 'unknown');

    await recordEvent('lead_session_failed', {
      metadata: { eventType: payload.event_type },
    });

    // 500 + retryable: ManyChat will try again, our idempotency key will let it through
    // (we never cached a response), and the lead is not lost.
    return NextResponse.json(buildError('internal_error', true), { status: 500 });
  }
}

// GET exists solely so Josh can confirm the URL is live from a browser while wiring up
// ManyChat. It reveals nothing: no config, no secret, no data.
export async function GET() {
  // `rev` is a deploy marker: bump it with any orchestration change so a curl can confirm the
  // new code is actually live before anyone tests the flow.
  return NextResponse.json({ ok: true, service: 'manychat-webhook', rev: 'fresh-session-v1' });
}
