import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { collectArtistData } from '@/lib/ai/collectArtistData';
import { generateStarterNudges, InsightInput } from '@/lib/ai/starterNudges';
import { generateInsights } from '@/lib/ai/generateInsights';
import { generateSyncInsights } from '@/lib/ai/syncInsights';
import { generateActions, AgentActionInput, PastOutcome } from '@/lib/ai/generateActions';
import { getCrossArtistPatterns, formatPatternsForPrompt } from '@/lib/ai/crossArtistPatterns';
import { SAFE_ACTION_TYPES } from '@/app/api/ai-manager/execute/route';
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

// ─── Autonomous Agent: generate + execute actions per artist ────────────────

async function runAutonomousAgent(artistId: string, artistUserId: string, effectiveTier: string, crossArtistContext: string) {
  // Only Pro+ artists get autonomous actions
  if (effectiveTier === 'starter') return { actionsExecuted: 0, actionsEscalated: 0, diagnosis: '' };

  try {
    const data = await collectArtistData(supabaseAdmin, artistId);
    if (!data.hasActivity) return { actionsExecuted: 0, actionsEscalated: 0, diagnosis: '' };

    // Collect extra context needed for action generation
    const { data: sequences } = await supabaseAdmin
      .from('sequences')
      .select('id, name, trigger_type, is_active')
      .eq('artist_id', artistId);

    const { data: tiers } = await supabaseAdmin
      .from('subscription_tiers')
      .select('id, name, price')
      .eq('artist_id', artistId)
      .eq('is_active', true);

    const { data: tracks } = await supabaseAdmin
      .from('tracks')
      .select('id, title, is_free, allowed_tier_ids')
      .eq('artist_id', artistId)
      .eq('is_active', true);

    const allTracks = tracks || [];
    const freeTracks = allTracks.filter(t => t.is_free !== false).map(t => ({ id: t.id, title: t.title }));
    const gatedTracks = allTracks.filter(t => t.is_free === false).map(t => ({ id: t.id, title: t.title }));

    // Fetch past action outcomes for learning (last 90 days, measured only)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: pastOutcomeData } = await supabaseAdmin
      .from('artist_agent_actions')
      .select('action_type, action_label, outcome_delta, executed_at')
      .eq('artist_id', artistId)
      .in('status', ['auto_executed', 'executed'])
      .not('outcome_measured_at', 'is', null)
      .not('outcome_delta', 'is', null)
      .gte('executed_at', ninetyDaysAgo)
      .order('executed_at', { ascending: false })
      .limit(10);

    const pastOutcomes: PastOutcome[] = (pastOutcomeData || []).map(o => {
      const delta = (o.outcome_delta || {}) as Record<string, number>;
      const score = (delta.mrr || 0) + (delta.activeSubs || 0) * 100 - (delta.churnRate || 0) * 500;
      return {
        action_type: o.action_type,
        action_label: o.action_label,
        outcome_delta: delta,
        outcome_score: score,
        executed_at: o.executed_at,
      };
    });

    const result = await generateActions(data, {
      sequences: (sequences || []).map(s => ({ id: s.id, name: s.name, trigger_type: s.trigger_type, is_active: s.is_active })),
      tiers: (tiers || []).map(t => ({ id: t.id, name: t.name, price: t.price })),
      freeTracks,
      gatedTracks,
      pastOutcomes,
      crossArtistContext,
    });

    let actionsExecuted = 0;
    let actionsEscalated = 0;

    // Dedup: skip actions of types already executed/pending in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentActions } = await supabaseAdmin
      .from('artist_agent_actions')
      .select('action_type')
      .eq('artist_id', artistId)
      .in('status', ['pending', 'auto_executed', 'executed'])
      .gte('created_at', sevenDaysAgo);

    const recentTypes = new Set((recentActions || []).map(a => a.action_type));
    const dedupedActions = result.actions.filter(a => !recentTypes.has(a.type));

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    for (const action of dedupedActions) {
      if (action.risk === 'low' && SAFE_ACTION_TYPES.includes(action.type)) {
        // Auto-execute low-risk safe actions
        try {
          const execRes = await fetch(`${baseUrl}/api/ai-manager/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.CRON_SECRET}`,
            },
            body: JSON.stringify({ artistId, action }),
          });

          if (execRes.ok) {
            actionsExecuted++;
          } else {
            actionsEscalated++;
            await storePendingAction(artistId, action);
          }
        } catch {
          actionsEscalated++;
          await storePendingAction(artistId, action);
        }
      } else {
        // Medium/high risk — store as pending for artist approval
        actionsEscalated++;
        await storePendingAction(artistId, action);

        // Notify artist of pending action
        await createNotification(
          supabaseAdmin,
          artistUserId,
          'ai_insight',
          `AI Manager wants to: ${action.label}`,
          action.description,
          '/profile/artist?tab=ai-manager'
        );
      }
    }

    // Log the autonomous run
    const skipped = result.actions.length - dedupedActions.length;
    await supabaseAdmin.from('artist_agent_runs').insert({
      artist_id: artistId,
      diagnosis_summary: result.diagnosis + (skipped > 0 ? ` (${skipped} deduped)` : ''),
      severity: result.severity,
      actions_recommended: result.actions.length,
      actions_auto_executed: actionsExecuted,
      actions_escalated: actionsEscalated,
      outcome: actionsExecuted > 0
        ? `Auto-executed ${actionsExecuted} action(s)`
        : actionsEscalated > 0
          ? `${actionsEscalated} action(s) awaiting approval`
          : 'No actions needed',
    });

    return { actionsExecuted, actionsEscalated, diagnosis: result.diagnosis };
  } catch (err) {
    console.error(`Autonomous agent error for ${artistId}:`, err);
    return { actionsExecuted: 0, actionsEscalated: 0, diagnosis: '' };
  }
}

async function storePendingAction(artistId: string, action: AgentActionInput) {
  await supabaseAdmin.from('artist_agent_actions').insert({
    artist_id: artistId,
    action_type: action.type,
    action_label: action.label,
    action_description: action.description,
    action_params: action.params,
    risk: action.risk,
    status: 'pending',
  });
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

    const results: { artistId: string; status: string; insightsCreated?: number; actionsExecuted?: number; actionsEscalated?: number; error?: string }[] = [];

    // Fetch cross-artist patterns once (shared across all artists in this run)
    let crossArtistContext = '';
    try {
      const patterns = await getCrossArtistPatterns(supabaseAdmin);
      crossArtistContext = formatPatternsForPrompt(patterns);
    } catch (err) {
      console.error('Cross-artist pattern fetch failed (non-fatal):', err);
    }

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

          // Run autonomous agent (generates + executes/escalates actions)
          const agentResult = await runAutonomousAgent(artist.id, artist.user_id, effectiveTier, crossArtistContext);

          results.push({
            artistId: artist.id,
            status: 'success',
            insightsCreated: inserted,
            actionsExecuted: agentResult.actionsExecuted,
            actionsEscalated: agentResult.actionsEscalated,
          });
        } catch (err) {
          results.push({ artistId: artist.id, status: 'failed', error: String(err) });
        }
      }));
    }

    const totalCreated = results.reduce((s, r) => s + (r.insightsCreated || 0), 0);
    const totalExecuted = results.reduce((s, r) => s + (r.actionsExecuted || 0), 0);
    const totalEscalated = results.reduce((s, r) => s + (r.actionsEscalated || 0), 0);

    return NextResponse.json({
      processed: results.length,
      insightsCreated: totalCreated,
      actionsExecuted: totalExecuted,
      actionsEscalated: totalEscalated,
      results,
    });
  } catch (error) {
    console.error('AI Manager cron error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
