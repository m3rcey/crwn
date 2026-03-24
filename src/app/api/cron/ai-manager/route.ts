import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { collectArtistData } from '@/lib/ai/collectArtistData';
import { generateStarterNudges, InsightInput } from '@/lib/ai/starterNudges';
import { generateInsights } from '@/lib/ai/generateInsights';
import { generateSyncInsights } from '@/lib/ai/syncInsights';
import { createNotification } from '@/lib/notifications';

// Insight types that warrant a push notification
const NOTIFY_TYPES = new Set(['churn', 'booking_reminder', 'sync_match', 'revenue']);
const NOTIFY_PRIORITIES = new Set(['urgent', 'high']);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

async function getExistingInsightTypes(artistId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('ai_insights')
    .select('type')
    .eq('artist_id', artistId)
    .eq('is_dismissed', false)
    .eq('is_read', false)
    .gt('expires_at', new Date().toISOString());

  return new Set((data || []).map(d => d.type));
}

async function insertInsights(artistId: string, artistUserId: string, insights: InsightInput[], existingTypes: Set<string>) {
  const now = new Date();
  let inserted = 0;

  for (const insight of insights) {
    // Dedup: skip if unread insight of same type exists (except churn, which is per-fan)
    if (insight.type !== 'churn' && existingTypes.has(insight.type)) {
      continue;
    }

    // Calculate expiry: booking reminders expire on event date, everything else 14 days
    let expiresAt: string;
    if (insight.type === 'booking_reminder' && insight.data?.expiresAt) {
      expiresAt = insight.data.expiresAt as string;
    } else {
      expiresAt = new Date(now.getTime() + FOURTEEN_DAYS_MS).toISOString();
    }

    await supabaseAdmin.from('ai_insights').insert({
      artist_id: artistId,
      type: insight.type,
      priority: insight.priority,
      title: insight.title,
      body: insight.body,
      data: insight.data || {},
      action_type: insight.action_type || null,
      action_url: insight.action_url || null,
      expires_at: expiresAt,
    });

    // Push notification for urgent/high priority insights of notifiable types
    if (NOTIFY_PRIORITIES.has(insight.priority) && NOTIFY_TYPES.has(insight.type)) {
      await createNotification(
        supabaseAdmin,
        artistUserId,
        'ai_insight',
        insight.title,
        insight.body,
        '/profile/artist?tab=ai-manager'
      );
    }

    inserted++;
  }

  return inserted;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all active artists
    const { data: artists } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, user_id, platform_tier, is_founding_artist')
      .eq('is_active', true);

    if (!artists || artists.length === 0) {
      return NextResponse.json({ message: 'No active artists' });
    }

    const results: { artistId: string; status: string; insightsCreated?: number; error?: string }[] = [];

    // Process artists in batches of 5 for parallelism
    for (let i = 0; i < artists.length; i += 5) {
      const batch = artists.slice(i, i + 5);

      await Promise.allSettled(batch.map(async (artist) => {
        try {
          const data = await collectArtistData(supabaseAdmin, artist.id);

          // Skip artists with no activity
          if (!data.hasActivity) {
            results.push({ artistId: artist.id, status: 'skipped', insightsCreated: 0 });
            return;
          }

          const existingTypes = await getExistingInsightTypes(artist.id);

          // Determine tier: founding artists on starter get Pro-level access
          const effectiveTier = (artist.platform_tier === 'starter' && artist.is_founding_artist)
            ? 'pro'
            : (artist.platform_tier || 'starter');

          let insights: InsightInput[];
          if (effectiveTier === 'starter') {
            insights = generateStarterNudges(data);
          } else {
            insights = await generateInsights(data);
            // Add rule-based sync match insights for Pro+
            const syncInsights = generateSyncInsights(data);
            insights = [...insights, ...syncInsights];
          }

          const inserted = await insertInsights(artist.id, artist.user_id, insights, existingTypes);
          results.push({ artistId: artist.id, status: 'success', insightsCreated: inserted });
        } catch (err) {
          results.push({ artistId: artist.id, status: 'failed', error: String(err) });
        }
      }));
    }

    const totalCreated = results.reduce((s, r) => s + (r.insightsCreated || 0), 0);

    return NextResponse.json({
      processed: results.length,
      insightsCreated: totalCreated,
      results,
    });
  } catch (error) {
    console.error('AI Manager cron error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
