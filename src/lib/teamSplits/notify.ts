// Team Splits — notification + email fan-out. In-app notifications via
// createNotification; emails via Resend. SMS is intentionally NOT used in v1.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications';
import { resend, FROM_EMAIL } from '@/lib/resend';
import {
  teamSplitInviteEmail,
  teamSplitResponseEmail,
  teamSplitPayoutReleasedEmail,
} from '@/lib/emails/teamSplitEmails';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';
const FOUNDER_EMAIL = 'joshn.wms@gmail.com';

async function emailUser(admin: SupabaseClient, userId: string, subject: string, html: string) {
  try {
    const { data } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
    if (data?.email) {
      await resend.emails.send({ from: FROM_EMAIL, to: data.email, subject, html });
    }
  } catch (e) {
    console.error('team-split email failed:', e);
  }
}

/** Collaborator invited (in-app if they have an account; email either way if provided). */
export async function notifyDealInvite(
  admin: SupabaseClient,
  opts: {
    collaboratorUserId: string | null;
    collaboratorEmail: string | null;
    artistName: string;
    dealTitle: string;
    roleLabel: string;
    summaryLine: string;
    dealId: string;
    inviteToken: string | null;
  },
) {
  const inAppLink = `/team/${opts.dealId}`;
  const emailLink = opts.collaboratorUserId
    ? `${APP_URL}/team/${opts.dealId}`
    : `${APP_URL}/team/invite/${opts.inviteToken}`;

  if (opts.collaboratorUserId) {
    await createNotification(
      admin,
      opts.collaboratorUserId,
      'team_split_invite',
      `${opts.artistName} sent you a Team Split`,
      opts.dealTitle,
      inAppLink,
    );
  }
  if (opts.collaboratorEmail) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: opts.collaboratorEmail,
        subject: `${opts.artistName} invited you to a Team Split on CRWN`,
        html: teamSplitInviteEmail(opts.artistName, opts.dealTitle, opts.roleLabel, opts.summaryLine, emailLink),
      });
    } catch (e) {
      console.error('team-split invite email failed:', e);
    }
  }
}

/** Collaborator responded -> tell the artist. */
export async function notifyArtistResponse(
  admin: SupabaseClient,
  opts: {
    artistUserId: string;
    collaboratorName: string;
    dealTitle: string;
    action: 'accepted' | 'rejected' | 'requested changes';
    dealId: string;
  },
) {
  await createNotification(
    admin,
    opts.artistUserId,
    'team_split_response',
    `${opts.collaboratorName} ${opts.action} your Team Split`,
    opts.dealTitle,
    `/profile/artist?tab=team`,
  );
  await emailUser(
    admin,
    opts.artistUserId,
    `${opts.collaboratorName} ${opts.action} your Team Split`,
    teamSplitResponseEmail(opts.collaboratorName, opts.dealTitle, opts.action, `${APP_URL}/profile/artist?tab=team`),
  );
}

export async function notifyDealViewed(admin: SupabaseClient, artistUserId: string, collaboratorName: string, dealTitle: string) {
  await createNotification(
    admin,
    artistUserId,
    'team_split_viewed',
    `${collaboratorName} viewed your Team Split`,
    dealTitle,
    `/profile/artist?tab=team`,
  );
}

/** Deliverable submitted -> tell the artist. */
export async function notifyDeliverableSubmitted(admin: SupabaseClient, artistUserId: string, dealTitle: string, deliverableTitle: string, dealId: string) {
  await createNotification(
    admin,
    artistUserId,
    'team_split_deliverable',
    `Deliverable submitted: ${deliverableTitle}`,
    `${dealTitle}: review before payouts begin`,
    `/profile/artist?tab=team`,
  );
}

/** Deliverable approved/rejected -> tell the collaborator. */
export async function notifyDeliverableDecision(admin: SupabaseClient, collaboratorUserId: string | null, dealId: string, deliverableTitle: string, approved: boolean) {
  if (!collaboratorUserId) return;
  await createNotification(
    admin,
    collaboratorUserId,
    'team_split_deliverable',
    approved ? `Deliverable approved: ${deliverableTitle}` : `Revision requested: ${deliverableTitle}`,
    approved ? 'Nice work.' : 'The artist requested changes.',
    `/team/${dealId}`,
  );
}

/** Payout released by the artist -> tell the collaborator. */
export async function notifyPayoutReleased(
  admin: SupabaseClient,
  opts: { collaboratorUserId: string; dealTitle: string; amountCents: number; needsPayoutSetup: boolean; dealId: string },
) {
  const amount = `$${(opts.amountCents / 100).toFixed(2)}`;
  await createNotification(
    admin,
    opts.collaboratorUserId,
    'team_split_payout',
    `Payout released: ${amount}`,
    opts.needsPayoutSetup ? 'Set up payouts to cash out.' : opts.dealTitle,
    `/team/${opts.dealId}`,
  );
  await emailUser(
    admin,
    opts.collaboratorUserId,
    `A Team Split payout was released (${amount})`,
    teamSplitPayoutReleasedEmail(opts.dealTitle, amount, opts.needsPayoutSetup, `${APP_URL}/team/${opts.dealId}`),
  );
}

/** Dispute opened / high-risk deal -> alert the founder inbox for admin review. */
export async function alertAdmin(subject: string, body: string) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: FOUNDER_EMAIL,
      subject: `[Team Splits] ${subject}`,
      html: `<div style="font-family:sans-serif"><p>${body}</p><p><a href="${APP_URL}/admin">Open admin</a></p></div>`,
    });
  } catch (e) {
    console.error('team-split admin alert failed:', e);
  }
}
