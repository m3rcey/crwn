import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { collectArtistData } from '@/lib/ai/collectArtistData';
import { generateStarterNudges, InsightInput } from '@/lib/ai/starterNudges';
import { generateInsights } from '@/lib/ai/generateInsights';
import { generateSyncInsights } from '@/lib/ai/syncInsights';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { artistId } = await req.json();
    if (!artistId) {
      return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
    }

    const data = await collectArtistData(supabaseAdmin, artistId);

    if (!data.hasActivity) {
      return NextResponse.json({ message: 'No activity', insightsCreated: 0 });
    }

    // Check existing unread insights for dedup
    const { data: existing } = await supabaseAdmin
      .from('ai_insights')
      .select('type')
      .eq('artist_id', artistId)
      .eq('is_dismissed', false)
      .eq('is_read', false)
      .gt('expires_at', new Date().toISOString());

    const existingTypes = new Set((existing || []).map(d => d.type));

    // Determine effective tier
    const effectiveTier = (data.platformTier === 'starter' && data.isFoundingArtist)
      ? 'pro'
      : data.platformTier;

    let insights: InsightInput[];
    if (effectiveTier === 'starter') {
      insights = generateStarterNudges(data);
    } else {
      insights = await generateInsights(data);
      const syncInsights = generateSyncInsights(data);
      insights = [...insights, ...syncInsights];
    }

    // Insert with dedup
    const now = new Date();
    let inserted = 0;
    const insertedInsights: InsightInput[] = [];

    for (const insight of insights) {
      if (insight.type !== 'churn' && existingTypes.has(insight.type)) {
        continue;
      }

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

      inserted++;
      insertedInsights.push(insight);
    }

    return NextResponse.json({
      insightsCreated: inserted,
      insights: insertedInsights,
    });
  } catch (error) {
    console.error('AI Manager generate error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
