import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { checkRateLimit } from '@/lib/rateLimit';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { isEmailSuppressed, isValidEmail, normalizeEmail, recordLmEvent } from '@/lib/leadMagnets/server';
import { leadMagnetResultEmail } from '@/lib/emails/leadMagnetResult';
import type { GeneratedResult } from '@/lib/leadMagnets/types';

// Emails a result. ABUSE GUARDS:
//  - Public (token): only ever sends to the verified lead email tied to THAT result.
//  - Authed (resultId): only ever sends to the signed-in owner's own account email.
// A caller can never choose an arbitrary recipient.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';

function topRecs(result: GeneratedResult): string[] {
  const next = result.sections.find((s) => s.kind === 'nextSteps')?.items;
  return (next && next.length ? next : result.sections.flatMap((s) => s.items || []).slice(0, 4)).slice(0, 5);
}

export async function POST(req: NextRequest) {
  let body: { resultId?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // ---- Public path: token identifies the result AND fixes the recipient ----
  if (body.token) {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const allowed = await checkRateLimit(`ip:${ip}`, 'lm-email', 3600, 10);
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const { data: row } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('id, tool_slug, result_data, public_token, public_token_expires_at, lead_id')
      .eq('public_token', body.token)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (row.public_token_expires_at && new Date(row.public_token_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
    }

    const { data: lead } = await supabaseAdmin.from('lead_magnet_leads').select('email').eq('id', row.lead_id as string).maybeSingle();
    const email = normalizeEmail(lead?.email || '');
    if (!isValidEmail(email)) return NextResponse.json({ error: 'No verified email on file' }, { status: 400 });

    return sendAndRespond(email, row.tool_slug, row.result_data as unknown as GeneratedResult, row.public_token as string, row.id, 'public');
  }

  // ---- Authed path: owner emails their own result to their account email ----
  if (!body.resultId) return NextResponse.json({ error: 'Missing resultId or token' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowed = await checkRateLimit(user.id, 'lm-email', 3600, 20);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { data: row } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('id, artist_id, tool_slug, result_data')
    .eq('id', body.resultId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: owned } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('id', row.artist_id as string)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const email = normalizeEmail(user.email || '');
  if (!isValidEmail(email)) return NextResponse.json({ error: 'No account email' }, { status: 400 });

  return sendAndRespond(email, row.tool_slug, row.result_data as unknown as GeneratedResult, null, row.id, 'artist');
}

async function sendAndRespond(
  email: string,
  toolSlug: string,
  result: GeneratedResult,
  publicToken: string | null,
  resultId: string,
  context: 'public' | 'artist',
) {
  const config = getLeadMagnet(toolSlug);
  if (!config) return NextResponse.json({ error: 'Unknown tool' }, { status: 404 });

  if (await isEmailSuppressed(supabaseAdmin, email)) {
    return NextResponse.json({ error: 'This email is unsubscribed' }, { status: 409 });
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `${config.name}: your result 👑`,
      html: leadMagnetResultEmail({
        toolName: config.name,
        headline: result.headline,
        summary: result.summary,
        topRecommendations: topRecs(result),
        insights: result.emailInsights,
        resultUrl: publicToken ? `${APP_URL}${config.publicRoute}?result=${publicToken}` : `${APP_URL}${config.artistRoute}`,
        ctaUrl: publicToken ? `${APP_URL}/signup?tool=${config.slug}&result=${publicToken}&ref=lead-magnet` : `${APP_URL}${config.artistRoute}`,
        ctaLabel: publicToken ? 'Build this inside CRWN' : 'Open in CRWN',
      }),
    });
  } catch (err) {
    console.error('Lead magnet email failed:', err);
    return NextResponse.json({ error: 'Could not send email' }, { status: 502 });
  }

  await supabaseAdmin.from('lead_magnet_results').update({ last_emailed_at: new Date().toISOString() }).eq('id', resultId);
  await recordLmEvent(supabaseAdmin, 'lead_magnet_result_emailed', { toolSlug, context, resultId });
  return NextResponse.json({ success: true });
}
