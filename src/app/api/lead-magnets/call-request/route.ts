import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { getTool, type LeadProfileValues } from '@/lib/acquisition/toolAdapters';
import { generatePublicToken, recordLmEvent } from '@/lib/leadMagnets/server';
import { claimEvent, cacheResponse } from '@/lib/acquisition/eventOutbox';
import {
  CALL_CONSENT_TEXT,
  CALL_CONSENT_VERSION,
  CALL_HAND_RAISER_TOOLS,
  WORTH_CALL_INPUT_DEFS,
  buildFounderSmsBody,
  decideCallRequest,
  normalizeCallbackPhone,
  sanitizeCalculatorInputs,
} from '@/lib/acquisition/callRequest';
import { SCORE_VERSION } from '@/lib/acquisition/leadScoring';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';
import { attributionToFunnelDims, sanitizeStoredAttribution } from '@/lib/analytics/campaignAttribution';

// PUBLIC endpoint (middleware excludes /api). The hand-raiser at the opportunity calculator's
// save boundary: "Want help launching this? Get a call now."
//
// The response is deliberately UNIFORM: every accepted request returns { ok: true } whether or
// not it qualified for a founder alert. Qualification is recomputed server-side from the
// sanitized calculator answers and is never returned, so this endpoint cannot be used to probe
// the scoring model, and no internal lead data ever leaves it.
//
// Idempotency is insert-as-claim on acquisition_events (one request per phone per day); the
// founder alert therefore cannot storm. A failed alert NEVER erases the lead: the claim row and
// consent record are persisted before any send is attempted.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Server-only. NEVER expose these to the client or echo them in a response.
// Optional carrier email-to-SMS gateway address (e.g. 5551234567@vtext.com). CRWN carries no
// Twilio integration anymore (the SMS feature was removed for A2P compliance cost), so this
// gateway is how a hot-lead alert still lands as a text on the founder's phone: it rides the
// Resend email path. Internal operational alert only, never used for fan messaging.
const FOUNDER_ALERT_SMS_EMAIL = process.env.FOUNDER_ALERT_SMS_EMAIL || '';
const FOUNDER_EMAIL = 'joshn.wms@gmail.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';
const TOKEN_TTL_DAYS = 30;

// The allowlist lives in the pure lib (CALL_HAND_RAISER_TOOLS), shared with every surface
// that renders the card, so a surface cannot offer a call this route will refuse.

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const allowed = await checkRateLimit(`ip:${ip}`, 'call-request', 3600, 5);
  if (!allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  let body: {
    toolSlug?: string;
    inputs?: unknown;
    phone?: string;
    consent?: boolean;
    artistName?: string;
    planSummary?: string;
    publicToken?: string;
    utm?: { source?: string; campaign?: string; content?: string };
    /** The campaign tag from the link that brought them. Re-normalized below; never trusted raw,
     *  and never read by the qualification gate. */
    attribution?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // /worth is the one hand-raiser tool outside the registry; its input defs live beside the
  // scorer. Everything else reads its own registry definitions.
  const slug = String(body.toolSlug || '');
  const inputDefs = slug === 'worth' ? WORTH_CALL_INPUT_DEFS : getLeadMagnet(slug)?.inputs;
  if (!CALL_HAND_RAISER_TOOLS.has(slug) || !inputDefs) {
    return NextResponse.json({ error: 'Unknown tool' }, { status: 404 });
  }

  // Explicit consent to a call and text, actively given. Inferred interest never counts.
  if (body.consent !== true) {
    return NextResponse.json({ error: 'Consent is required to request a call' }, { status: 400 });
  }
  const phone = normalizeCallbackPhone(body.phone);
  if (!phone) {
    return NextResponse.json({ error: 'Enter a valid callback number' }, { status: 400 });
  }

  // Allowlist + bound the calculator answers against the tool's own input definitions, then
  // recompute qualification server-side. A client-sent band or score is never read.
  const inputs = sanitizeCalculatorInputs(inputDefs, body.inputs);
  if (!Object.keys(inputs).length) {
    return NextResponse.json({ error: 'Complete the calculator first' }, { status: 400 });
  }
  const decision = decideCallRequest(inputs);

  // One request per phone per day, claimed at the DB. A retry (double tap, refresh, resend)
  // replays the same acknowledgement and does exactly zero additional work.
  const day = new Date().toISOString().slice(0, 10);
  const claim = await claimEvent(`call_request:${phone}:${day}`, 'hot_lead_call_requested');
  if (!claim.fresh) {
    return NextResponse.json({ ok: true, alreadyRequested: true });
  }

  // Anchor the request to a stored result row so the admin record shows the calculator answers
  // and the generated recommendation. Reuse the caller's saved result when a valid token is
  // offered; otherwise recompute and store one server-side (never trusting a client result).
  let resultId: string | null = null;
  const offeredToken = typeof body.publicToken === 'string' && body.publicToken ? body.publicToken : null;
  if (offeredToken) {
    const { data: existing } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('id')
      .eq('public_token', offeredToken)
      .eq('tool_slug', slug)
      .maybeSingle();
    resultId = existing?.id ?? null;
  }
  if (!resultId) {
    try {
      const tool = getTool(slug);
      const profile: Record<string, unknown> = { ...inputs };
      const result = tool ? tool.execute(profile as unknown as LeadProfileValues) : null;
      if (result) {
        const { data: saved } = await supabaseAdmin
          .from('lead_magnet_results')
          .insert({
            tool_slug: slug,
            status: 'draft',
            source: 'public',
            title: result.headline.slice(0, 200),
            input_data: { calculatorInputs: inputs },
            result_data: result as unknown as Record<string, unknown>,
            generator_version: result.generatorVersion,
            public_token: generatePublicToken(),
            public_token_expires_at: new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000).toISOString(),
          })
          .select('id')
          .single();
        resultId = saved?.id ?? null;
      }
    } catch {
      // A result row is context, not a requirement. The claim row already holds the request.
    }
  }

  const requestedAt = new Date().toISOString();
  const snapshot: Record<string, unknown> = {
    kind: 'call_request',
    phone,
    artist_name: (body.artistName || '').trim().slice(0, 120) || null,
    tool_slug: slug,
    result_id: resultId,
    calculator_inputs: inputs,
    plan_summary: (body.planSummary || '').trim().slice(0, 200) || null,
    utm: {
      source: body.utm?.source || null,
      campaign: body.utm?.campaign || null,
      content: body.utm?.content || null,
    },
    consent: {
      text: CALL_CONSENT_TEXT,
      version: CALL_CONSENT_VERSION,
      consented_at: requestedAt,
      source: `${slug}-call-request`,
      phone,
    },
    qualification: {
      qualified: decision.qualified,
      band: decision.band,
      score: decision.score,
      reasons: decision.reasons,
      score_version: SCORE_VERSION,
    },
    contact_status: 'new',
    requested_at: requestedAt,
    alert: { channel: null as string | null, status: 'not_attempted', at: null as string | null, error: null as string | null },
  };

  // The founder alert. Qualified requests only; everything else stays an admin-visible record.
  if (decision.qualified) {
    const adminUrl = `${APP_URL}/admin?tab=acquisition`;
    const smsBody = buildFounderSmsBody({
      phone,
      artistName: (body.artistName || '').trim() || null,
      followers: typeof inputs.social_followers === 'number' ? inputs.social_followers : null,
      listeners: typeof inputs.monthly_listeners === 'number' ? inputs.monthly_listeners : null,
      directRevenueCents: typeof inputs.direct_fan_revenue_cents === 'number' ? inputs.direct_fan_revenue_cents : null,
      planSummary: (body.planSummary || '').trim().slice(0, 120) || 'membership-first CRWN system',
      band: decision.band,
      score: decision.score,
      adminUrl,
    });

    // Primary alert: founder email. Twilio SMS was removed (A2P compliance cost), so email
    // is the channel of record for hot leads.
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: FOUNDER_EMAIL,
        subject: 'CRWN hot lead: call requested now',
        html: `<pre style="font-family:inherit;white-space:pre-wrap">${smsBody
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')}</pre>`,
      });
      snapshot.alert = { channel: 'email', status: 'sent', at: new Date().toISOString(), error: null };
    } catch (err) {
      snapshot.alert = {
        channel: 'email',
        status: 'failed',
        at: new Date().toISOString(),
        error: (err instanceof Error ? err.message : 'unknown').slice(0, 200),
      };
    }

    // Carrier email-to-SMS gateway: puts a real text on the founder's phone with no Twilio and
    // no compliance surface. Short body: gateways truncate around 160 characters.
    if (FOUNDER_ALERT_SMS_EMAIL) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: FOUNDER_ALERT_SMS_EMAIL,
          subject: 'CRWN hot lead',
          text: `${(body.artistName || 'Artist').trim().slice(0, 40)} wants a call. ${phone}. Band ${decision.band}.`,
        });
        snapshot.alert = { ...(snapshot.alert as Record<string, unknown>), gateway: 'sent' };
      } catch {
        snapshot.alert = { ...(snapshot.alert as Record<string, unknown>), gateway: 'failed' };
      }
    }
    snapshot.contact_status = 'alerted';
  }

  // Persist the full record onto the claim row (status 'processed'). This is the admin CRM row.
  await cacheResponse(claim.eventRowId, snapshot);

  // Analytics. Server-side, deduped per phone per day; never blocks the response.
  await recordLmEvent(supabaseAdmin, 'lead_magnet_call_requested', {
    toolSlug: slug,
    context: 'public',
    resultId: resultId || undefined,
    source: body.utm?.source || 'direct',
  });
  // Reporting only. The normalized tag fills the campaign/video/platform dimensions, with the raw
  // UTM as the fallback so an untagged link behaves exactly as before. Qualification above is
  // untouched by any of it.
  const callAttributionDims = attributionToFunnelDims(sanitizeStoredAttribution(body.attribution));
  await recordFunnelEvent(supabaseAdmin, {
    stage: 'call_requested',
    calculator: slug,
    campaign: callAttributionDims.campaign ?? body.utm?.campaign ?? null,
    referrer: callAttributionDims.referrer ?? body.utm?.source ?? null,
    video: callAttributionDims.video ?? body.utm?.content ?? null,
    resultId,
    dedupeKey: `${phone}:${day}`,
    metadata: { ...(callAttributionDims.metadata ?? {}), qualified: decision.qualified, band: decision.band },
  });

  return NextResponse.json({ ok: true });
}
