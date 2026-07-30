import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { getLeadMagnet, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';
import { continueCtaFor } from '@/lib/leadMagnets/continuationCta';
import { isEmailSuppressed, recordLmEvent } from '@/lib/leadMagnets/server';
import { PROSPECT_NURTURE_SEQUENCE } from '@/lib/prospectNurture/sequence';
import { moduleFor } from '@/lib/prospectNurture/calculatorModules';
import { buildNurtureTokens } from '@/lib/prospectNurture/tokens';
import { renderNurtureEmail } from '@/lib/prospectNurture/render';

// Daily runner for prospect (pre-signup) nurture. Bearer-protected like every other CRON route.
// Reuses the same Resend sender, the same suppression gate, and the same lead tables. Idempotent:
// a per-(enrollment, email_id) UNIQUE row makes a double-run physically unable to double-send.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

function resolveConfig(slug: string): { name: string; featureName: string; publicRoute: string } | null {
  const cfg = getLeadMagnet(slug);
  if (cfg) return { name: cfg.name, featureName: cfg.featureName, publicRoute: cfg.publicRoute };
  const ext = EXTERNAL_TOOLS.find((t) => t.key === slug);
  if (ext) return { name: ext.name, featureName: ext.featureName, publicRoute: ext.href };
  return null;
}

async function cancel(enrollmentId: string, reason: string): Promise<void> {
  await supabaseAdmin
    .from('prospect_nurture_enrollments')
    .update({ status: 'canceled', exit_reason: reason, next_send_at: null, updated_at: new Date().toISOString() })
    .eq('id', enrollmentId);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: due } = await supabaseAdmin
    .from('prospect_nurture_enrollments')
    .select('id, lead_id, email, tool_slug, result_id, current_step, created_at, unsub_token, sequence_version')
    .eq('status', 'active')
    .lte('next_send_at', nowIso)
    .order('next_send_at', { ascending: true })
    .limit(BATCH);

  if (!due || due.length === 0) return NextResponse.json({ processed: 0 });

  const emails = PROSPECT_NURTURE_SEQUENCE.emails;
  let sent = 0;
  let exited = 0;
  let errors = 0;

  for (const e of due) {
    try {
      const stepIndex = Number(e.current_step) || 0;

      // Sequence exhausted -> complete.
      if (stepIndex >= emails.length) {
        await supabaseAdmin
          .from('prospect_nurture_enrollments')
          // No completed_at column exists on this table; writing one fails the whole
          // UPDATE (PGRST204) and the enrollment then never leaves 'active'.
          .update({ status: 'completed', exit_reason: 'completed', next_send_at: null, updated_at: nowIso })
          .eq('id', e.id);
        continue;
      }

      // EXIT #1: they now have an account. Any lead with this email marked converted = stop.
      const { data: converted } = await supabaseAdmin
        .from('lead_magnet_leads')
        .select('id')
        .ilike('email', e.email)
        .not('converted_user_id', 'is', null)
        .limit(1);
      if (converted && converted.length > 0) {
        await cancel(String(e.id), 'account_created');
        exited++;
        continue;
      }

      // EXIT #2: global suppression (hard bounce, complaint, or unsubscribe) overrides every send.
      if (await isEmailSuppressed(supabaseAdmin, e.email)) {
        await cancel(String(e.id), 'suppressed');
        exited++;
        continue;
      }

      const email = emails[stepIndex];
      const cfg = resolveConfig(String(e.tool_slug));
      if (!cfg) {
        // Unknown tool (should not happen for stored leads). Skip forward safely.
        await cancel(String(e.id), 'unknown_tool');
        continue;
      }

      // IDEMPOTENCY: claim the (enrollment, email_id) slot first. A conflict means this step was
      // already sent (a retried/duplicate run), so we DO NOT send again; we just advance.
      const { data: sendRow, error: sendInsertErr } = await supabaseAdmin
        .from('prospect_nurture_sends')
        .insert({
          enrollment_id: e.id,
          email_id: email.id,
          sequence_version: e.sequence_version,
          status: 'sent',
        })
        .select('id')
        .single();

      const alreadySent = !!sendInsertErr; // UNIQUE violation = already sent this step.

      if (!alreadySent && sendRow) {
        // Load the personalization source: the lead's name and their stored result numbers.
        const [{ data: lead }, { data: result }] = await Promise.all([
          supabaseAdmin.from('lead_magnet_leads').select('artist_name').eq('id', e.lead_id).maybeSingle(),
          e.result_id
            ? supabaseAdmin.from('lead_magnet_results').select('result_data, public_token, public_token_expires_at').eq('id', e.result_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        const tokenLive =
          result?.public_token && (!result?.public_token_expires_at || new Date(result.public_token_expires_at).getTime() > now.getTime())
            ? (result.public_token as string)
            : null;

        const { tokens, hasNumber } = buildNurtureTokens({
          slug: String(e.tool_slug),
          toolName: cfg.name,
          featureName: cfg.featureName,
          artistName: (lead?.artist_name as string) ?? null,
          resultData: (result?.result_data as Record<string, unknown>) ?? null,
          publicToken: tokenLive,
          publicRoute: cfg.publicRoute,
          appUrl: APP_URL,
          unsubToken: String(e.unsub_token),
          ctaLabel: continueCtaFor(String(e.tool_slug)),
        });

        const rendered = renderNurtureEmail({ email, tokens, module: moduleFor(String(e.tool_slug)), hasNumber });

        const { data: sendResult, error: sendError } = await resend.emails.send({
          from: FROM_EMAIL,
          to: e.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          headers: {
            'X-Prospect-Send-Id': String(sendRow.id),
            'List-Unsubscribe': `<${tokens.unsubscribe_url}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });

        if (sendError) {
          // Roll the slot back so a later run can retry this exact step.
          await supabaseAdmin.from('prospect_nurture_sends').delete().eq('id', sendRow.id);
          errors++;
          continue;
        }

        if (sendResult?.id) {
          await supabaseAdmin.from('prospect_nurture_sends').update({ resend_message_id: sendResult.id }).eq('id', sendRow.id);
        }
        await recordLmEvent(supabaseAdmin, 'prospect_nurture_email_sent', { toolSlug: String(e.tool_slug), reasonCode: email.id });
        sent++;
      }

      // Advance. next email (if any) is scheduled at created_at + its dayOffset (absolute cadence,
      // resilient to a late cron run). Exhausted -> completed.
      const nextStep = stepIndex + 1;
      const nextEmail = emails[nextStep];
      if (nextEmail) {
        const base = new Date(e.created_at as string).getTime();
        const nextSendAt = new Date(base + nextEmail.dayOffset * DAY_MS).toISOString();
        await supabaseAdmin
          .from('prospect_nurture_enrollments')
          .update({ current_step: nextStep, phase: nextEmail.phase, next_send_at: nextSendAt, last_sent_at: nowIso, updated_at: nowIso })
          .eq('id', e.id);
      } else {
        await supabaseAdmin
          .from('prospect_nurture_enrollments')
          .update({ current_step: nextStep, status: 'completed', exit_reason: 'completed', next_send_at: null, last_sent_at: nowIso, updated_at: nowIso })
          .eq('id', e.id);
      }
    } catch (err) {
      console.error('prospect-nurture cron error:', err);
      errors++;
    }
  }

  return NextResponse.json({ processed: due.length, sent, exited, errors });
}
