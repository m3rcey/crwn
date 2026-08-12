import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { calculatorResultEmail } from '@/lib/emails/calculatorResult';
import { checkRateLimit } from '@/lib/rateLimit';

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

  return NextResponse.json({ success: true });
}
