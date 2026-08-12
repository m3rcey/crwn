// calendarReminders.ts — SERVER ONLY. Daily reminder dispatch for the Promise /
// My-CRWN Calendar. Runs inside the existing daily `sequences` cron.
//
// Model (constrained by Vercel Hobby daily crons): remind a user ONCE about an
// item when it first enters the "due soon" window. calendar_reminders is the dedup
// ledger — the in_app claim is what decides "is this new?", so a re-run or the next
// day never re-sends. One in-app notification + one email digest per user per run.
//
// SCOPE, and as of 2026-08-11 this file is FAN-ONLY:
//   • Fan: scheduled livestreams they are eligible for (subscribers by tier, plus paid ticket
//     holders, who are not necessarily subscribers).
//   • Fan: campaign / mission / bounty / proof-of-demand deadlines for artists they support.
//
// It no longer reminds ARTISTS about anything. Artist fan-promise reminders moved out entirely
// (see section A below) because `promiseReminders` was already sending them, and the two were
// double-emailing the same obligation from two dedupe ledgers that cannot see each other.
// Deferred: a reminder-prefs UI.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { calendarReminderEmail, type ReminderLine } from '@/lib/emails/calendarReminder';
import { relativeDueLabel } from '@/lib/calendar';
import { paidTicketBuyersBySession } from '@/lib/live/access';
import { createNotification } from '@/lib/notifications';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

const WINDOW_MS = 48 * 60 * 60 * 1000;

interface Candidate {
  userId: string;
  subjectType: string;
  subjectId: string;
  audience: 'artist' | 'fan';
  line: ReminderLine;
}

export async function dispatchCalendarReminders(
  admin: Admin,
  now: Date = new Date(),
): Promise<{ sent: number; users: number; skipped: number }> {
  const nowIso = now.toISOString();
  const windowEndIso = new Date(now.getTime() + WINDOW_MS).toISOString();

  const candidates: Candidate[] = [];

  // ── A) REMOVED 2026-08-11: artist promise reminders ────────────────────────
  //
  // Fan promises are `promiseReminders`' job, and they were BOTH doing it. This file read
  // `fulfillment_events` and emailed about them at 09:00 (via the `sequences` cron) while
  // `promiseReminders` emailed about the SAME event at 06:00 (via `scheduled-releases`). The two
  // dedupe against different ledgers and cannot see each other: this one claims rows in
  // `calendar_reminders`, that one stamps `metadata.reminded_offsets`. So one promise produced two
  // emails three hours apart, plus an in-app notification, every time.
  //
  // The earlier fix corrected only ELIGIBILITY (both now exclude Revenue Ramp steps). That made
  // the duplication worse in the sense that mattered: what remained doubled up was the real fan
  // obligations. Production had already claimed 16 `fulfillment_event` reminders on both channels.
  //
  // WHY THIS SIDE LOST. `promiseReminders` is the specialist: it honours each obligation's own
  // `reminder_offsets` (default [7,3,1]), so an artist gets a reminder at each configured lead
  // time. This file can only ever fire ONCE, when an item first enters the due-soon window, so
  // keeping it would mean discarding a real artist-facing setting. One owner per subject type.
  //
  // WHAT THIS FILE STILL OWNS, unchanged: every other thing on the calendar (missions, road
  // campaigns, clip bounties, proof-of-demand deadlines) and the fan-side livestream reminders.
  // Known tradeoff, stated rather than hidden: promises no longer produce an in-app notification
  // from here. They remain visible in the Promise Calendar, in Manager's fulfillment insights and
  // in the Constraint Engine's FULFILLMENT diagnosis, so the promise is not going unspoken.

  // ── B) Fan livestream reminders (scheduled within the window) ──────────────
  const { data: lives } = await admin
    .from('live_sessions')
    .select('id, title, artist_id, is_free, allowed_tier_ids, scheduled_at')
    .eq('status', 'scheduled')
    .gte('scheduled_at', nowIso)
    .lte('scheduled_at', windowEndIso)
    .limit(200);

  if ((lives || []).length) {
    const liveArtistIds = [...new Set(lives!.map((l) => l.artist_id))];
    // Artist display names for context.
    const nameByArtist = await artistNames(admin, liveArtistIds);
    // Active subscribers for those artists.
    const { data: subs } = await admin
      .from('subscriptions')
      .select('fan_id, artist_id, tier_id')
      .in('artist_id', liveArtistIds)
      .eq('status', 'active');
    const subsByArtist = new Map<string, { fan_id: string; tier_id: string | null }[]>();
    for (const s of subs || []) {
      const arr = subsByArtist.get(s.artist_id) || [];
      arr.push({ fan_id: s.fan_id, tier_id: s.tier_id ?? null });
      subsByArtist.set(s.artist_id, arr);
    }
    // Ticket holders are NOT necessarily subscribers, so they never appear in
    // subsByArtist. Without this they pay for a session and get no reminder.
    const ticketBuyers = await paidTicketBuyersBySession(admin, lives!.map((l) => l.id));
    for (const l of lives!) {
      const audienceSubs = subsByArtist.get(l.artist_id) || [];
      const reminded = new Set<string>();
      for (const s of audienceSubs) {
        if (!fanCanSeeLive(l, s.tier_id)) continue;
        reminded.add(s.fan_id);
      }
      for (const buyerId of ticketBuyers.get(l.id) || []) reminded.add(buyerId);
      for (const fanId of reminded) {
        candidates.push({
          userId: fanId,
          subjectType: 'live_session',
          subjectId: l.id,
          audience: 'fan',
          line: {
            title: l.title,
            whenLabel: relativeDueLabel(l.scheduled_at, now),
            context: nameByArtist.get(l.artist_id) || 'An artist',
          },
        });
      }
    }
  }

  // ── C) Fan deadline reminders (campaigns/missions/bounties/demand tests) ────
  const DEADLINE_SOURCES = [
    { table: 'road_campaigns', subjectType: 'road_campaign' },
    { table: 'missions', subjectType: 'mission' },
    { table: 'clip_bounties', subjectType: 'clip_bounty' },
    { table: 'proof_of_demand', subjectType: 'proof_of_demand' },
  ];
  const deadlineRows: { id: string; title: string; artist_id: string; deadline: string; subjectType: string }[] = [];
  for (const src of DEADLINE_SOURCES) {
    const { data } = await admin
      .from(src.table)
      .select('id, title, artist_id, deadline')
      .eq('status', 'active')
      .gte('deadline', nowIso)
      .lte('deadline', windowEndIso)
      .limit(200);
    for (const r of data || []) deadlineRows.push({ ...r, subjectType: src.subjectType });
  }
  if (deadlineRows.length) {
    const dArtistIds = [...new Set(deadlineRows.map((r) => r.artist_id))];
    const nameByArtist = await artistNames(admin, dArtistIds);
    const { data: dsubs } = await admin
      .from('subscriptions')
      .select('fan_id, artist_id')
      .in('artist_id', dArtistIds)
      .eq('status', 'active');
    const fansByArtist = new Map<string, string[]>();
    for (const s of dsubs || []) {
      const arr = fansByArtist.get(s.artist_id) || [];
      arr.push(s.fan_id);
      fansByArtist.set(s.artist_id, arr);
    }
    for (const r of deadlineRows) {
      for (const fanId of fansByArtist.get(r.artist_id) || []) {
        candidates.push({
          userId: fanId,
          subjectType: r.subjectType,
          subjectId: r.id,
          audience: 'fan',
          line: {
            title: r.title,
            whenLabel: relativeDueLabel(r.deadline, now),
            context: nameByArtist.get(r.artist_id) || 'An artist',
          },
        });
      }
    }
  }

  if (candidates.length === 0) return { sent: 0, users: 0, skipped: 0 };

  // ── Dedup: claim the in_app channel. Only NEWLY inserted rows are "new". ────
  const claimRows = candidates.map((c) => ({
    user_id: c.userId,
    subject_type: c.subjectType,
    subject_id: c.subjectId,
    channel: 'in_app',
    status: 'sent',
  }));
  const { data: claimed, error: claimErr } = await admin
    .from('calendar_reminders')
    .upsert(claimRows, {
      onConflict: 'user_id,subject_type,subject_id,channel',
      ignoreDuplicates: true,
    })
    .select('user_id, subject_type, subject_id');
  if (claimErr) return { sent: 0, users: 0, skipped: 0 };

  const claimedKeys = new Set((claimed || []).map((r) => `${r.user_id}:${r.subject_type}:${r.subject_id}`));
  const fresh = candidates.filter((c) =>
    claimedKeys.has(`${c.userId}:${c.subjectType}:${c.subjectId}`),
  );
  if (fresh.length === 0) return { sent: 0, users: 0, skipped: 0 };

  // ── Group per user, send one in-app notification + one email digest ────────
  const byUser = new Map<string, Candidate[]>();
  for (const c of fresh) {
    const arr = byUser.get(c.userId) || [];
    arr.push(c);
    byUser.set(c.userId, arr);
  }

  // Resolve names + emails for the recipients we're actually messaging.
  const userIds = [...byUser.keys()];
  const nameByUser = await displayNames(admin, userIds);
  const emailByUser = await userEmails(admin, userIds);
  const suppressed = await suppressedEmails(admin, [...emailByUser.values()].filter(Boolean) as string[]);

  let sent = 0;
  let skipped = 0;

  for (const [uid, list] of byUser) {
    const audience = list[0].audience;
    const name = nameByUser.get(uid) || 'there';
    const lines = list.map((c) => c.line);

    // In-app notification (one, summarizing).
    //
    // The artist branch is currently UNREACHABLE: after section A was removed, every candidate
    // this file produces is `audience: 'fan'`. It is kept as the guard for a future artist-side
    // source rather than deleted, but its copy no longer says "Promise", because a fan promise is
    // not something this file may ever speak about again.
    const title =
      audience === 'artist'
        ? (lines.length === 1 ? '⏰ Deadline coming up' : `⏰ ${lines.length} deadlines coming up`)
        : (lines.length === 1 ? '📅 Coming up for you' : `📅 ${lines.length} things coming up`);
    const message =
      lines.length === 1
        ? `${lines[0].title}: ${lines[0].whenLabel}`
        : lines.slice(0, 3).map((l) => l.title).join(', ') + (lines.length > 3 ? '…' : '');

    // Routed through `createNotification` rather than inserting directly. This path used to write
    // to `notifications` itself, which meant it bypassed the Communications Governor's G2
    // chokepoint entirely and its type never appeared in the taxonomy. A governor with a hole in it
    // governs nothing, and a direct insert is exactly how the next one gets added.
    await createNotification(
      admin,
      uid,
      'calendar_reminder',
      title,
      message,
      audience === 'artist' ? '/studio/promise' : '/my-calendar',
    );
    sent += 1;

    // Email digest (respect the suppression list). Record the email channel too so
    // it's not re-sent, marking skipped when suppressed / no address.
    const email = emailByUser.get(uid) || null;
    const emailRows = list.map((c) => ({
      user_id: c.userId,
      subject_type: c.subjectType,
      subject_id: c.subjectId,
      channel: 'email',
      status: !email || suppressed.has(email) ? 'skipped' : 'sent',
    }));
    await admin.from('calendar_reminders').upsert(emailRows, {
      onConflict: 'user_id,subject_type,subject_id,channel',
      ignoreDuplicates: true,
    });

    if (email && !suppressed.has(email)) {
      try {
        const { subject, html } = calendarReminderEmail({ recipientName: name, audience, items: lines });
        await resend.emails.send({ from: FROM_EMAIL, to: email, subject, html });
      } catch (err) {
        console.error('Calendar reminder email failed:', err);
      }
    } else {
      skipped += 1;
    }
  }

  return { sent, users: byUser.size, skipped };
}

// ── helpers ────────────────────────────────────────────────────────────────

function fanCanSeeLive(live: any, fanTierId: string | null): boolean {
  if (live.is_free) return true;
  const allowed: string[] = Array.isArray(live.allowed_tier_ids) ? live.allowed_tier_ids : [];
  if (allowed.length === 0) return true;
  return !!fanTierId && allowed.includes(fanTierId);
}

async function artistNames(admin: Admin, artistIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!artistIds.length) return out;
  const { data: arts } = await admin.from('artist_profiles').select('id, user_id').in('id', artistIds);
  const userIds = (arts || []).map((a) => a.user_id).filter(Boolean);
  const names = await displayNames(admin, userIds);
  for (const a of arts || []) out.set(a.id, names.get(a.user_id) || 'An artist');
  return out;
}

async function displayNames(admin: Admin, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!userIds.length) return out;
  const { data } = await admin.from('profiles').select('id, display_name').in('id', userIds);
  for (const p of data || []) out.set(p.id, p.display_name || 'there');
  return out;
}

async function userEmails(admin: Admin, userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  // auth.admin has no bulk-by-id fetch; do it per user (pre-PMF volumes are small).
  for (const id of userIds) {
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      out.set(id, data?.user?.email ?? null);
    } catch {
      out.set(id, null);
    }
  }
  return out;
}

async function suppressedEmails(admin: Admin, emails: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!emails.length) return out;
  const { data } = await admin.from('email_suppressions').select('email').in('email', emails);
  for (const r of data || []) out.add(r.email);
  return out;
}
