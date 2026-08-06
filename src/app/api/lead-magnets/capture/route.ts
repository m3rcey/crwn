import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { checkRateLimit } from '@/lib/rateLimit';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { generateResult } from '@/lib/leadMagnets/resultGenerators';
import { getTool, type LeadProfileValues } from '@/lib/acquisition/toolAdapters';
import { generatePublicToken, isValidEmail, normalizeEmail, isEmailSuppressed, recordLmEvent } from '@/lib/leadMagnets/server';
import { leadMagnetResultEmail } from '@/lib/emails/leadMagnetResult';
import { CONSENT_TEXT_VERSION } from '@/lib/leadMagnets/disclaimers';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';
import { continueCtaFor } from '@/lib/leadMagnets/continuationCta';
import { enrollProspect } from '@/lib/prospectNurture/enroll';
import { isSubAvatarId, ENTRY_CONTEXT_INPUT_KEY } from '@/lib/avatars/taxonomy';
import {
  ATTRIBUTION_INPUT_KEY,
  attributionToFunnelDims,
  hasAttribution,
  sanitizeStoredAttribution,
} from '@/lib/analytics/campaignAttribution';
import { sanitizeCalculatorInputs, decideCallRequest } from '@/lib/acquisition/callRequest';

// PUBLIC endpoint. No auth (middleware excludes /api). It authorizes/rate-limits itself.
// Recomputes the result SERVER-SIDE from the inputs (never trusts a client-sent result),
// stores the lead + result, and emails the result. Build-safe env fallbacks per CLAUDE.md.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';
const TOKEN_TTL_DAYS = 30;

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

  // IP-keyed limit for an unauthenticated endpoint (checkRateLimit is keyed on a string).
  const allowed = await checkRateLimit(`ip:${ip}`, 'lm-capture', 3600, 30);
  if (!allowed) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });

  let body: {
    toolSlug?: string;
    inputs?: Record<string, unknown>;
    lead?: {
      email?: string;
      artistName?: string;
      phone?: string;
      genre?: string;
      socialHandle?: string;
      monthlyListeners?: number;
      mainGoal?: string;
      emailConsent?: boolean;
    };
    utm?: { source?: string; medium?: string; campaign?: string; content?: string };
    /** The sub-avatar funnel `?from=` value, validated below against the real taxonomy. */
    entryContext?: string;
    /** The campaign tag from the link that brought them. Re-normalized below; never trusted raw. */
    attribution?: unknown;
    sourceUrl?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const config = getLeadMagnet(String(body.toolSlug || ''));
  if (!config) return NextResponse.json({ error: 'Unknown tool' }, { status: 404 });

  const email = normalizeEmail(body.lead?.email || '');
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  if (config.leadCapture.required && body.lead?.emailConsent !== true) {
    return NextResponse.json({ error: 'Email consent is required' }, { status: 400 });
  }

  const inputs = (body.inputs && typeof body.inputs === 'object' ? body.inputs : {}) as Record<
    string,
    string | number | boolean | string[] | null
  >;

  // The sub-avatar funnel this lead arrived through (docs/SUB_AVATARS.md). All four avatars share
  // one calculator, so `tool_slug` cannot separate their cohorts: this is what does. Stored under
  // a reserved, underscore-prefixed key alongside the answers so it survives signup as server-side
  // truth, and VALIDATED against the taxonomy so a hostile body cannot invent a cohort.
  const entryContext = isSubAvatarId(body.entryContext) ? body.entryContext : null;
  if (entryContext) inputs[ENTRY_CONTEXT_INPUT_KEY] = entryContext;

  // The campaign tag (which video, which angle, which ManyChat keyword) that brought them here.
  // RE-NORMALIZED server-side, then stored on the RESULT ROW under a reserved key. The result row
  // is the thing the existing claim path binds to the account at signup, so persisting it here is
  // what carries the video past the anonymous/authenticated boundary without a cookie, a new table,
  // or a second identity system.
  // Attached to input_data at INSERT time, never before the result is computed: a reporting tag
  // must not be able to reach a calculator's inputs.
  const attribution = sanitizeStoredAttribution(body.attribution);
  const attributionDims = attributionToFunnelDims(attribution);
  const storedInputs = (): Record<string, unknown> =>
    hasAttribution(attribution) ? { ...inputs, [ATTRIBUTION_INPUT_KEY]: attribution } : inputs;

  // SERVER-SIDE recompute. This is the source of truth we persist and email. Loss-engine tools
  // run their adapter (config.resultGeneratorKey is not a generateResult key for them); the four
  // legacy tools run their generator.
  let result;
  try {
    if (config.usesLossEngine) {
      const tool = getTool(config.slug);
      if (!tool) throw new Error('Unknown loss tool');
      const profile: Record<string, unknown> = { ...inputs };
      for (const inp of config.inputs) {
        if (inp.type === 'currency' && inp.key.endsWith('_cents') && typeof profile[inp.key] === 'number') {
          profile[inp.key] = Math.round((profile[inp.key] as number) * 100);
        }
      }
      result = tool.execute(profile as unknown as LeadProfileValues);
    } else {
      result = generateResult(config.resultGeneratorKey, inputs);
    }
  } catch {
    return NextResponse.json({ error: 'Could not generate result' }, { status: 400 });
  }

  const phone = (body.lead?.phone || '').trim() || null;

  // 1. Store the lead.
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from('lead_magnet_leads')
    .insert({
      email,
      phone,
      artist_name: (body.lead?.artistName || '').trim() || null,
      genre: (body.lead?.genre || '').trim() || null,
      social_handle: (body.lead?.socialHandle || '').trim() || null,
      monthly_listeners: Number.isFinite(body.lead?.monthlyListeners) ? Math.max(0, Math.round(body.lead!.monthlyListeners as number)) : null,
      main_goal: (body.lead?.mainGoal || '').trim() || null,
      tool_slug: config.slug,
      source_url: (body.sourceUrl || '').slice(0, 500) || null,
      utm_source: body.utm?.source || null,
      utm_medium: body.utm?.medium || null,
      utm_campaign: body.utm?.campaign || null,
      utm_content: body.utm?.content || null,
      email_consent: body.lead?.emailConsent === true,
      sms_consent: false,
      consent_text_version: CONSENT_TEXT_VERSION,
      consented_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (leadErr || !lead) return NextResponse.json({ error: leadErr?.message || 'Could not save lead' }, { status: 500 });

  // 2. Store the result with a high-entropy public resume token.
  const publicToken = generatePublicToken();
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000).toISOString();
  const { data: saved, error: resErr } = await supabaseAdmin
    .from('lead_magnet_results')
    .insert({
      tool_slug: config.slug,
      lead_id: lead.id,
      status: 'completed',
      title: result.headline.slice(0, 200),
      input_data: storedInputs(),
      result_data: result as unknown as Record<string, unknown>,
      generator_version: result.generatorVersion,
      source: 'public',
      public_token: publicToken,
      public_token_expires_at: expires,
    })
    .select('id')
    .single();

  if (resErr || !saved) return NextResponse.json({ error: resErr?.message || 'Could not save result' }, { status: 500 });

  // 3. Email the result (transactional: they asked for it). Respect global suppression.
  //    Non-blocking: a mail failure must never fail the capture.
  try {
    if (!(await isEmailSuppressed(supabaseAdmin, email))) {
      const recs = result.sections.find((s) => s.kind === 'nextSteps')?.items || result.sections.flatMap((s) => s.items || []).slice(0, 4);
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `${config.name}: your result is ready 👑`,
        html: leadMagnetResultEmail({
          toolName: config.name,
          headline: result.headline,
          summary: result.summary,
          topRecommendations: recs.length ? recs : ['Open your full result to see your plan'],
          insights: result.emailInsights,
          resultUrl: `${APP_URL}${config.publicRoute}?result=${publicToken}`,
          ctaUrl: `${APP_URL}/signup?tool=${config.slug}&result=${publicToken}&ref=lead-magnet`,
          ctaLabel: continueCtaFor(config.slug),
        }),
      });
      await supabaseAdmin.from('lead_magnet_results').update({ last_emailed_at: new Date().toISOString() }).eq('id', saved.id);
    }
  } catch (err) {
    console.error('Lead magnet result email failed:', err);
  }

  await recordLmEvent(supabaseAdmin, 'lead_magnet_lead_submitted', { toolSlug: config.slug, context: 'public', resultId: saved.id, source: body.utm?.source || 'direct' });

  // The ICP band for this lead, from the CANONICAL server-side scorer (the same one the call
  // request gate uses). Recomputed from the artist's own sanitized answers, never sent by the
  // client and never used for anything but reporting here: it is what lets the founder tell "this
  // video produced 40 leads" apart from "this video produced 4 sales-priority artists". A tool
  // whose inputs the scorer knows nothing about simply produces no band.
  let band: string | null = null;
  try {
    const scored = decideCallRequest(sanitizeCalculatorInputs(config.inputs, inputs));
    band = scored.band;
  } catch {
    /* unscored is fine; unrecorded is not */
  }

  // Funnel: Email Submitted. Server-side and deduped per result (one email per stored result).
  // Campaign/video/platform come from the normalized tag, with the raw UTM as the fallback so an
  // untagged link behaves exactly as before.
  await recordFunnelEvent(supabaseAdmin, {
    stage: 'email_submitted',
    calculator: config.slug,
    campaign: attributionDims.campaign ?? body.utm?.campaign ?? null,
    referrer: attributionDims.referrer ?? body.utm?.source ?? null,
    video: attributionDims.video ?? body.utm?.content ?? null,
    resultId: saved.id,
    dedupeKey: saved.id,
    metadata: {
      ...(attributionDims.metadata ?? {}),
      hasPhone: !!phone,
      ...(band ? { band } : {}),
      ...(entryContext ? { subAvatar: entryContext } : {}),
    },
  });

  // 4. Enroll into long-term prospect nurture. MARKETING, so it runs only with explicit email
  //    consent; the transactional result email above is separate and always sent. Best-effort:
  //    enrollment never fails the capture, and enrollProspect swallows its own errors.
  await enrollProspect(supabaseAdmin, {
    leadId: lead.id,
    email,
    toolSlug: config.slug,
    resultId: saved.id,
    emailConsent: body.lead?.emailConsent === true,
  });

  return NextResponse.json({ success: true, resultId: saved.id, publicToken, result });
}
