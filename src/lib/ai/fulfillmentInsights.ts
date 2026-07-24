// fulfillmentInsights.ts — SERVER ONLY. Turns Promise Calendar state into AI
// Manager insight cards: overdue promises (urgent) or promises due soon (nudge).
// Rule-based, no LLM. Surfaces as an approval-gated action card linking to the
// Promise Calendar — never auto-fulfills anything.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { InsightInput } from '@/lib/ai/starterNudges';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const PROMISE_LINK = '/studio/promise';

export async function generateFulfillmentInsights(
  admin: Admin,
  artistId: string,
): Promise<InsightInput[]> {
  const now = new Date();
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + THREE_DAYS_MS).toISOString();

  try {
    const [overdueRes, soonRes] = await Promise.all([
      admin
        .from('fulfillment_events')
        .select('id, title')
        .eq('artist_id', artistId)
        .eq('status', 'pending')
        .lt('due_at', nowIso)
        .limit(50),
      admin
        .from('fulfillment_events')
        .select('id, title')
        .eq('artist_id', artistId)
        .eq('status', 'pending')
        .gte('due_at', nowIso)
        .lte('due_at', soonIso)
        .limit(50),
    ]);

    const overdue = overdueRes.data || [];
    const soon = soonRes.data || [];

    // Overdue takes precedence — it's the retention risk.
    if (overdue.length > 0) {
      const n = overdue.length;
      return [
        {
          type: 'fulfillment',
          priority: 'urgent',
          title: n === 1 ? 'A promise to supporters is overdue' : `${n} promises to supporters are overdue`,
          body:
            n === 1
              ? `"${overdue[0].title}" is past due. Fulfilling overdue promises is the fastest way to protect retention.`
              : `Including "${overdue[0].title}". Overdue supporter promises are a top churn driver. Clear these first.`,
          data: { overdue: n, sample: overdue.slice(0, 3).map((e) => e.title) },
          action_type: 'link',
          action_url: PROMISE_LINK,
        },
      ];
    }

    if (soon.length > 0) {
      const n = soon.length;
      return [
        {
          type: 'fulfillment',
          priority: 'normal',
          title: n === 1 ? 'A promise is due soon' : `${n} promises due in the next few days`,
          body:
            n === 1
              ? `"${soon[0].title}" is coming up. Schedule or prep it now so you deliver on time.`
              : `Including "${soon[0].title}". Get ahead of them so supporters get what they were promised.`,
          data: { soon: n, sample: soon.slice(0, 3).map((e) => e.title) },
          action_type: 'link',
          action_url: PROMISE_LINK,
        },
      ];
    }

    return [];
  } catch {
    // Table not applied / transient — no insight, never break the cron.
    return [];
  }
}
