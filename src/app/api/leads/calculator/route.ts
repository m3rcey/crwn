import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { calculatorResultEmail } from '@/lib/emails/calculatorResult';
import { checkRateLimit } from '@/lib/rateLimit';
import { enrollProspect } from '@/lib/prospectNurture/enroll';
import { generatePublicToken } from '@/lib/leadMagnets/server';
import { CONSENT_TEXT_VERSION } from '@/lib/leadMagnets/disclaimers';

/** The external Streaming Loss tool's slug, as EXTERNAL_TOOLS and calculatorModules both know it. */
const WORTH_SLUG = 'worth';

// PUBLIC endpoint (no auth): captures leads from the /worth lead-magnet calculator
// into the existing crm_contacts table. Uses the service-role client because
// unauthenticated visitors can't satisfy RLS. Build-safe env fallbacks per CLAUDE.md.
//
// It sends mail to a body-supplied address, so it is rate limited twice (per IP and
// per recipient) and every stored free-text value is bounded. `name` lands in
// crm_contacts, which is read by the admin agent, so an unbounded name is an
// injection surface as well as a storage one.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const MAX_NAME = 120;
const MAX_EMAIL = 254;
// A yearly figure above this is not a calculator result, it is someone playing with
// the request body. Clamping keeps an absurd number out of the subject line.
const MAX_ANNUAL_CENTS = 10_000_000_000; // $100,000,000
const MAX_LISTENERS = 1_000_000_000;

// Single plausible address only: no commas, semicolons, angle brackets, quotes or
// whitespace (CR/LF included), so the recipient cannot become a list or a header.
const EMAIL_RE = /^[^\s@,;<>"'\\]{1,64}@[^\s@,;<>"'\\]{1,189}\.[A-Za-z]{2,24}$/;

/** Strip control characters and bound the length. */
function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const allowed = await checkRateLimit(`ip:${ip}`, 'calculator-lead', 3600, 20);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  }

  let body: {
    email?: string;
    name?: string;
    monthlyListeners?: number;
    netAnnualCents?: number;
    // MARKETING permission, explicit and separate from the transactional breakdown below. Absent or
    // false means the visitor gets their result and nothing else, exactly as before.
    emailConsent?: boolean;
    // The builder draft this visitor already produced, if any, so the nurture personalizes from the
    // result they actually saw instead of a second copy of it.
    resultToken?: string;
    netMrrCents?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const email = cleanText(body.email, MAX_EMAIL).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  // Second bucket keyed on the recipient, so rotating IPs cannot mail-bomb one
  // person with calculator results. A real visitor re-runs this a handful of times.
  const emailAllowed = await checkRateLimit(`email:${email}`, 'calculator-lead-email', 86400, 5);
  if (!emailAllowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  }

  const name = cleanText(body.name, MAX_NAME) || email.split('@')[0].slice(0, MAX_NAME);
  const listeners = Number.isFinite(body.monthlyListeners)
    ? Math.min(MAX_LISTENERS, Math.max(0, Math.round(body.monthlyListeners as number)))
    : 0;
  const annual = Number.isFinite(body.netAnnualCents)
    ? Math.min(MAX_ANNUAL_CENTS, Math.max(0, Math.round(body.netAnnualCents as number)))
    : 0;

  const note = `[calculator] monthly_listeners=${listeners}, est_annual_net=$${Math.round(annual / 100).toLocaleString('en-US')}`;

  // Upsert on the LOWER(email) unique index so a repeat visitor updates rather than 409s.
  // Only stamp 'lead' status / calculator source on first insert; never downgrade an
  // existing contact who may already be further along the pipeline.
  const { data: existing } = await supabaseAdmin
    .from('crm_contacts')
    .select('id, notes')
    .ilike('email', email)
    .maybeSingle();

  if (existing) {
    const prior = existing.notes ? `${existing.notes}\n` : '';
    const { error } = await supabaseAdmin
      .from('crm_contacts')
      .update({
        notes: `[${new Date().toISOString().split('T')[0]}] ${note}\n${prior}`.slice(0, 4000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabaseAdmin.from('crm_contacts').insert({
      name,
      email,
      source: 'calculator',
      status: 'lead',
      tags: ['calculator'],
      notes: `[${new Date().toISOString().split('T')[0]}] ${note}`,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deliver on the "we'll email your breakdown" promise. Non-blocking: a mail
  // failure must never fail the capture (the lead is already saved above).
  // Nothing the visitor typed is interpolated into this email: the template takes
  // only numbers this route formatted itself, so there is no HTML to escape. Keep it
  // that way. If a name or any free text is ever added here, escape it first.
  try {
    const dollars = (cents: number) => '$' + Math.round(cents / 100).toLocaleString('en-US');
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `You're leaving ${dollars(annual)} on the table 👑`,
      html: calculatorResultEmail({
        annualDisplay: dollars(annual),
        monthlyDisplay: dollars(Math.round(annual / 12)),
        listeners,
      }),
    });
  } catch (err) {
    console.error('Calculator lead email failed:', err);
  }

  // MARKETING, and only with explicit consent. Everything above this line is unchanged and happens
  // regardless: the breakdown is transactional (they asked for it) and is never permission to market.
  //
  // /worth predates the registry capture architecture: it is a promoted tool that writes
  // `crm_contacts`, so it produced results for months and could never enroll anybody. Rather than
  // build a second nurture, this reuses the canonical one. `enrollProspect` needs a
  // `lead_magnet_leads` row and a result to personalize from, so we create the lead and bind it to
  // the builder draft the visitor already made (or write a minimal result when there is none).
  //
  // `worth` is an EXTERNAL_TOOL, not a LEAD_MAGNETS entry, so it cannot post to
  // /api/lead-magnets/capture (that route 404s an unknown slug). The nurture side already knows the
  // slug: `calculatorModules.ts` has a bespoke `worth` module and the cron resolves its config from
  // EXTERNAL_TOOLS, so only the lead and result rows were missing.
  let enrolled = false;
  if (body.emailConsent === true) {
    try {
      const { data: lmLead } = await supabaseAdmin
        .from('lead_magnet_leads')
        .insert({
          email,
          artist_name: name || null,
          tool_slug: WORTH_SLUG,
          monthly_listeners: listeners || null,
          email_consent: true,
          sms_consent: false,
          consent_text_version: CONSENT_TEXT_VERSION,
          consented_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (lmLead?.id) {
        // Prefer the draft they already built: same numbers they read on screen.
        let resultId: string | null = null;
        const token = cleanText(body.resultToken, 128);
        if (token) {
          const { data: existing } = await supabaseAdmin
            .from('lead_magnet_results')
            .select('id, lead_id')
            .eq('public_token', token)
            .eq('tool_slug', WORTH_SLUG)
            .maybeSingle();
          if (existing?.id && !existing.lead_id) {
            await supabaseAdmin.from('lead_magnet_results').update({ lead_id: lmLead.id }).eq('id', existing.id);
            resultId = String(existing.id);
          } else if (existing?.id) {
            resultId = String(existing.id);
          }
        }

        if (!resultId) {
          // No draft to bind. Write the minimal result the nurture tokens read, in the SAME shape
          // `buildNurtureTokens` expects (heroValue / estimatedMonthlyCents / estimatedAnnualCents),
          // so {{monthly_value}} renders instead of silently falling back to the no-number line.
          const monthlyCents = Number.isFinite(body.netMrrCents)
            ? Math.max(0, Math.round(body.netMrrCents as number))
            : Math.round(annual / 12);
          const { data: made } = await supabaseAdmin
            .from('lead_magnet_results')
            .insert({
              tool_slug: WORTH_SLUG,
              lead_id: lmLead.id,
              status: 'completed',
              source: 'public',
              title: 'Streaming Loss result',
              input_data: { monthly_listeners: listeners },
              result_data: {
                heroValue: '$' + Math.round(monthlyCents / 100).toLocaleString('en-US'),
                estimatedMonthlyCents: monthlyCents,
                estimatedAnnualCents: annual,
              },
              public_token: generatePublicToken(),
              public_token_expires_at: new Date(Date.now() + 90 * 86400_000).toISOString(),
            })
            .select('id')
            .single();
          resultId = made?.id ? String(made.id) : null;
        }

        const outcome = await enrollProspect(supabaseAdmin, {
          leadId: String(lmLead.id),
          email,
          toolSlug: WORTH_SLUG,
          resultId,
          emailConsent: true,
        });
        enrolled = outcome.enrolled;
      }
    } catch (err) {
      // Nurture enrollment must never fail the capture the visitor actually asked for.
      console.error('Worth nurture enrollment failed:', err);
    }
  }

  return NextResponse.json({ success: true, enrolled });
}
