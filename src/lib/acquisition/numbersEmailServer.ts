// "Email their numbers": the server half. Josh presses the button on a lead in /admin
// (Acquisition, Leads); this resolves everything from the RESULT ROW and sends.
//
// SERVER ONLY (service role). The copy and layout live in numbersEmail.ts (pure, tested).
//
// Authority: the admin route establishes the admin from the session. The only thing the request
// supplies is a result id, a POINTER: the recipient is derived from that row's own session, never
// taken from the request, so the button cannot email an arbitrary address. A result that belongs
// to no DM lead (a web result, or a row with no session) is refused.
//
// Order matters, because rotating the token kills the lead's previous result link:
//   1. emailBlockedReason: every reason send() would refuse (opt-out, consent, caps, suppression).
//      A refusal here changes nothing for the lead.
//   2. rotateResultToken: the fresh link. Only now.
//   3. channels.send: re-checks everything, claims the dedupe key, adds the unsubscribe footer.
// Not transactional: the lead did not ask for this email at this moment, so the same 24h and
// lifetime caps as every other acquisition message apply, and this send counts toward them.

import { supabaseAdmin } from './db';
import { send, emailBlockedReason } from './channels';
import { loadIdentity, rotateResultToken } from './automationDispatcher';
import { firstNameOf } from './founderFollowUp';
import { leadToolName } from './founderFollowUpServer';
import { renderNumbersEmail } from './numbersEmail';
import { buildResultUrl } from '../leadResults/resultToken';
import { CALCULATOR_VSL, isVslLive } from '../vsl/catalog';
import { watchUrlFor } from '../vsl/continuation';
import { FOUNDER_FROM } from '../resend';
import { ADMIN_NOTIFY_EMAIL } from '../newArtistAlert';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app').replace(/\/+$/, '');

export type NumbersEmailOutcome =
  | { sent: true; to: string }
  | { sent: false; reason: string };

export async function sendNumbersEmail(resultId: string): Promise<NumbersEmailOutcome> {
  const { data: result } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('id, tool_slug, lead_session_id')
    .eq('id', resultId)
    .maybeSingle();
  if (!result?.lead_session_id || !result.tool_slug) return { sent: false, reason: 'no_dm_result' };

  const { data: session } = await supabaseAdmin
    .from('lead_sessions')
    .select('lead_identity_id')
    .eq('id', result.lead_session_id)
    .maybeSingle();
  const identityId = session?.lead_identity_id as string | null | undefined;
  if (!identityId) return { sent: false, reason: 'no_lead' };

  const identity = await loadIdentity(identityId);
  if (!identity) return { sent: false, reason: 'no_lead' };

  const blocked = await emailBlockedReason(identity);
  if (blocked) return { sent: false, reason: blocked };

  const { data: profile } = await supabaseAdmin
    .from('lead_profiles')
    .select('artist_name')
    .eq('lead_identity_id', identityId)
    .maybeSingle();

  const toolSlug = String(result.tool_slug);
  const raw = await rotateResultToken(String(result.id));
  if (!raw) return { sent: false, reason: 'link_mint_failed' };

  const msg = renderNumbersEmail({
    firstName: firstNameOf((profile?.artist_name as string | null) ?? null),
    toolName: leadToolName(toolSlug),
    resultUrl: buildResultUrl(toolSlug, raw),
    video: isVslLive(CALCULATOR_VSL)
      ? {
          watchUrl: `${APP_URL}${watchUrlFor(CALCULATOR_VSL.slug, { tool: toolSlug, resultToken: raw })}`,
          posterUrl: `${APP_URL}${CALCULATOR_VSL.poster}`,
          title: CALCULATOR_VSL.title,
          minutes: CALCULATOR_VSL.minutes,
        }
      : null,
  });

  const res = await send({
    identity,
    channel: 'email',
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    // One per result per minute: a double press cannot send twice, and the 24h cap above is what
    // stops a second send later the same day.
    idempotencyKey: `numbers_link:${result.id}:${new Date().toISOString().slice(0, 16)}`,
    from: FOUNDER_FROM,
    replyTo: ADMIN_NOTIFY_EMAIL,
  });
  return res.sent ? { sent: true, to: identity.email! } : { sent: false, reason: res.reason };
}
