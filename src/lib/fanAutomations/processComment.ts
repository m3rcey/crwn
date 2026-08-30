// Comment-event orchestration for the Meta webhook. SERVER ONLY.
//
// Order is load-bearing:
//   1. CLAIM the receipt first (insert on UNIQUE(provider, comment_id); 23505 = already
//      handled). Meta redelivers for 36 hours, Meta permits ONE private reply per comment,
//      and the claim is what turns redelivery into a no-op instead of a duplicate DM.
//   2. Only after the claim: resolve the connection by the PROVIDER-owned account id (never
//      anything in the request body naming an artist), skip the connected account's own
//      comments (our public reply triggers a webhook of its own; without this check every
//      trigger would loop), match automations, send, and record what happened.
//
// A failed send is recorded on the receipt and NOT retried: the claim is already taken, and
// with a one-reply-per-comment platform rule a retry that races a slow success would be
// worse than an honest 'failed' the artist can see.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { getConnectionByAccount, type SocialConnection } from '@/lib/fanAutomations/connections';
import { igPublicReply, igPrivateReply, fbPublicReply, fbPrivateReply } from '@/lib/fanAutomations/metaGraph';
import { isOwnComment, pickAutomation, triggerFromRow } from '@/lib/fanAutomations/matching';
import { siteBase } from '@/lib/fanAutomations/config';
import type { MetaCommentEvent } from '@/lib/fanAutomations/webhookEvents';

export interface ProcessOutcome {
  handled: 'duplicate' | 'no_connection' | 'own_comment' | 'no_match' | 'sent' | 'send_failed';
}

interface AutomationRow {
  id: string;
  status: string;
  trigger_media_ids: unknown;
  trigger_keywords: unknown;
  created_at: string;
  public_reply: string;
  dm_message: string;
  public_token: string;
  magnet_title: string;
}

export function dropUrlFor(publicToken: string): string {
  return `${siteBase()}/drop/${publicToken}`;
}

/** The single DM Meta permits must carry the payoff link itself (it never opens the 24h window). */
export function buildDmText(dmMessage: string, publicToken: string): string {
  const msg = (dmMessage || '').trim();
  const link = dropUrlFor(publicToken);
  return msg ? `${msg}\n\n${link}` : link;
}

export async function processCommentEvent(admin: any, event: MetaCommentEvent): Promise<ProcessOutcome> {
  // 1. Claim. Everything about this comment hangs off winning this insert exactly once.
  const { data: receipt, error: claimError } = await admin
    .from('social_webhook_receipts')
    .insert({
      provider: event.provider,
      provider_account_id: event.providerAccountId,
      comment_id: event.commentId,
      media_id: event.mediaId || null,
      commenter_id: event.fromId || null,
      commenter_username: event.fromUsername || null,
      comment_text: (event.text || '').slice(0, 200),
    })
    .select('id')
    .single();

  if (claimError) {
    if (claimError.code === '23505') return { handled: 'duplicate' };
    // The receipts table is the idempotency ledger. If it cannot answer, sending would risk
    // a duplicate DM on the next redelivery, so the safe behavior is to do nothing.
    console.error('[fan-automations] receipt claim failed:', claimError.code, claimError.message);
    return { handled: 'duplicate' };
  }
  const receiptId = receipt.id as string;
  const finish = async (patch: Record<string, unknown>, outcome: ProcessOutcome): Promise<ProcessOutcome> => {
    await admin.from('social_webhook_receipts').update(patch).eq('id', receiptId);
    return outcome;
  };

  // 2. Resolve the artist through the provider-owned account id, never a body field.
  const connection = await getConnectionByAccount(admin, event.provider, event.providerAccountId);
  if (!connection?.accessToken) return finish({}, { handled: 'no_connection' });

  // 3. The loop guard: our own public reply is itself a comment event.
  if (isOwnComment({ fromId: event.fromId }, connection.providerAccountId)) {
    return finish({}, { handled: 'own_comment' });
  }

  // 4. Match.
  const { data: rows } = await admin
    .from('fan_automations')
    .select('id, status, trigger_media_ids, trigger_keywords, created_at, public_reply, dm_message, public_token, magnet_title')
    .eq('connection_id', connection.id)
    .eq('status', 'active');
  const automations = ((rows as AutomationRow[]) || []);
  const picked = pickAutomation(
    { commentId: event.commentId, mediaId: event.mediaId, fromId: event.fromId, text: event.text },
    automations.map(triggerFromRow),
  );
  if (!picked) return finish({}, { handled: 'no_match' });
  const automation = automations.find((a) => a.id === picked.id)!;

  // 5. Send. Public reply first (it is visible context for the DM), then the one DM.
  const errors: string[] = [];
  let publicStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
  const publicReply = (automation.public_reply || '').trim();
  if (publicReply) {
    const res = await sendPublicReply(connection, event.commentId, publicReply);
    publicStatus = res.ok ? 'sent' : 'failed';
    if (!res.ok && res.error) errors.push(`public: ${res.error}`);
  }

  const dmText = buildDmText(automation.dm_message, automation.public_token);
  const dm = await sendPrivateReply(connection, event.commentId, dmText);
  const dmStatus: 'sent' | 'failed' = dm.ok ? 'sent' : 'failed';
  if (!dm.ok && dm.error) errors.push(`dm: ${dm.error}`);

  return finish(
    {
      automation_id: automation.id,
      matched: true,
      public_reply_status: publicStatus,
      dm_status: dmStatus,
      error_detail: errors.length ? errors.join(' | ').slice(0, 600) : null,
    },
    { handled: dm.ok ? 'sent' : 'send_failed' },
  );
}

async function sendPublicReply(connection: SocialConnection, commentId: string, message: string) {
  const token = connection.accessToken!;
  return connection.provider === 'instagram'
    ? igPublicReply(token, commentId, message)
    : fbPublicReply(token, commentId, message);
}

async function sendPrivateReply(connection: SocialConnection, commentId: string, text: string) {
  const token = connection.accessToken!;
  return connection.provider === 'instagram'
    ? igPrivateReply(token, connection.providerAccountId, commentId, text)
    : fbPrivateReply(token, connection.providerAccountId, commentId, text);
}
