// promiseReminders.ts — SERVER ONLY. Deliver the Promise Calendar's reminders.
//
// Obligations have always CARRIED reminder_offsets (days-before, default
// [7,3,1]); nothing ever sent them. This delivers: one DIGEST email per artist
// per run listing every promise crossing a reminder offset today, deduped per
// (event, offset) via metadata.reminded_offsets so a daily cron never repeats
// itself. Runs piggybacked on an existing daily cron (Vercel Hobby allows no
// new schedules). Best-effort: a reminder failure must never break its host.

import { resend, FROM_EMAIL } from '@/lib/resend';
import { onlyFanPromises } from '@/lib/fulfillment';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

interface DueEvent {
  id: string;
  artist_id: string;
  obligation_id: string;
  title: string;
  due_at: string;
  metadata: Record<string, unknown> | null;
}

const remindedOffsetsOf = (metadata: unknown): number[] => {
  const v = (metadata as Record<string, unknown> | null)?.reminded_offsets;
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
};

export async function sendPromiseReminders(admin: Admin): Promise<{ artistsEmailed: number; reminders: number }> {
  try {
    const now = Date.now();
    const horizon = new Date(now + 8 * 86_400_000).toISOString();

    const { data: events } = await admin
      .from('fulfillment_events')
      .select('id, artist_id, obligation_id, title, due_at, metadata')
      .eq('status', 'pending')
      .gte('due_at', new Date(now).toISOString())
      .lte('due_at', horizon)
      .order('due_at', { ascending: true })
      .limit(300);
    if (!events?.length) return { artistsEmailed: 0, reminders: 0 };

    // FAN PROMISES ONLY. `fulfillment_events` holds two different kinds of row and this email
    // speaks in the language of one of them: "Promise due in N days" is a claim that someone who
    // PAID is waiting. A Revenue Ramp step is the artist's own private plan, owed to nobody.
    //
    // Z12 applied this boundary to the three readers that DECIDE (Constraint evidence, Manager
    // insights, Roadmap) and missed both readers that COMMUNICATE, which is how a live daily cron
    // came to be preparing "Promise due in 3 days: Connect Stripe". Production at the time of the
    // fix: 97 fulfillment_events, 93 of them ramp steps, 11 of those inside this 8-day window.
    //
    // Same predicate as every other reader, imported rather than re-expressed, because a fourth
    // interpretation of "is this owed to a fan" is exactly how the first three drifted.
    const fanEvents = onlyFanPromises(events as DueEvent[]);
    if (!fanEvents.length) return { artistsEmailed: 0, reminders: 0 };

    // Offsets + status come from the obligations; paused/archived never remind.
    const obIds = [...new Set(fanEvents.map((e) => e.obligation_id))];
    const { data: obs } = await admin
      .from('fulfillment_obligations')
      .select('id, status, reminder_offsets')
      .in('id', obIds);
    const obById = new Map<string, { status: string; reminder_offsets: number[] | null }>(
      (obs ?? []).map((o: { id: string; status: string; reminder_offsets: number[] | null }) => [o.id, o]),
    );

    // Which events cross an offset today, grouped per artist.
    const dueByArtist = new Map<string, { event: DueEvent; offset: number; daysLeft: number }[]>();
    for (const e of fanEvents) {
      const ob = obById.get(e.obligation_id);
      if (!ob || ob.status !== 'active') continue;
      const offsets = Array.isArray(ob.reminder_offsets) && ob.reminder_offsets.length ? ob.reminder_offsets : [7, 3, 1];
      const daysLeft = Math.ceil((new Date(e.due_at).getTime() - now) / 86_400_000);
      const crossing = offsets.filter((o) => o === daysLeft && !remindedOffsetsOf(e.metadata).includes(o));
      if (!crossing.length) continue;
      const list = dueByArtist.get(e.artist_id) ?? [];
      list.push({ event: e, offset: crossing[0], daysLeft });
      dueByArtist.set(e.artist_id, list);
    }
    if (dueByArtist.size === 0) return { artistsEmailed: 0, reminders: 0 };

    let artistsEmailed = 0;
    let reminders = 0;

    for (const [artistId, items] of dueByArtist) {
      try {
        const { data: ap } = await admin
          .from('artist_profiles')
          .select('user_id')
          .eq('id', artistId)
          .maybeSingle();
        if (!ap?.user_id) continue;
        const { data: au } = await admin.auth.admin.getUserById(ap.user_id);
        const email = au?.user?.email;
        if (!email) continue;

        const soonest = items[0];
        const lines = items.map(
          (i) =>
            `- ${i.event.title}: due ${new Date(i.event.due_at).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })} (${i.daysLeft} day${i.daysLeft === 1 ? '' : 's'} away)`,
        );

        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: `Promise due in ${soonest.daysLeft} day${soonest.daysLeft === 1 ? '' : 's'}: ${soonest.event.title}`,
          text: [
            `You promised your fans, and the date is coming up:`,
            ``,
            ...lines,
            ``,
            `A kept promise is a renewed subscription. A missed one costs more than a late one earns.`,
            `Your calendar: https://thecrwn.app/studio/promise`,
          ].join('\n'),
        });
        artistsEmailed += 1;

        // Mark each event so tomorrow's run never repeats this offset.
        for (const i of items) {
          reminders += 1;
          await admin
            .from('fulfillment_events')
            .update({
              metadata: { ...(i.event.metadata ?? {}), reminded_offsets: [...remindedOffsetsOf(i.event.metadata), i.offset] },
              updated_at: new Date().toISOString(),
            })
            .eq('id', i.event.id);
        }
      } catch (err) {
        console.error('[promiseReminders] artist batch failed:', artistId, err);
      }
    }

    return { artistsEmailed, reminders };
  } catch (err) {
    console.error('[promiseReminders] failed:', err);
    return { artistsEmailed: 0, reminders: 0 };
  }
}
