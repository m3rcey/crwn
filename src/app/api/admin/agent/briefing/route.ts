import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { adminDailyBriefingEmail } from '@/lib/emails/adminDailyBriefing';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const kimi = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY || 'dummy-key-for-build',
  baseURL: 'https://api.moonshot.ai/v1',
});

const SYSTEM_PROMPT = `You are CRWN's daily business health monitor. Analyze the platform metrics and identify the most important items the owner needs to know TODAY.

RULES (Alex Hormozi framework):
- LGP:CAC below 3:1 = CRITICAL
- Referrals must exceed churn on both artist and fan sides
- 30-day profit must be >= (CAC + COGs) x 2
- Churn <=2% excellent, 2-5% okay, >5% leaky bucket
- Payback period <1mo healthy, <3mo acceptable, >6mo problem
- Gross margin >=80% for SaaS

CRWN: Two-sided marketplace. Artists pay platform tiers ($0-$350/mo). Platform takes 3-8% on fan transactions (Starter 8%, Pro 6%, Label 5%, Empire 3%). All prices in CENTS.

Return ONLY a JSON array of insights, each with: priority ("critical"|"warning"|"info"), category, title (max 80 chars), body (max 300 chars), metric. Max 6 insights. Be concise. Critical items first.`;

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get cached 30d metrics
    const { data: cached } = await supabaseAdmin
      .from('admin_metrics_cache')
      .select('metrics, computed_at')
      .eq('period', '30d')
      .single();

    if (!cached?.metrics) {
      return NextResponse.json({ error: 'No metrics data available' }, { status: 400 });
    }

    const metrics = cached.metrics;

    // Build concise metrics summary for Haiku
    const userMessage = `Daily health check for CRWN (${new Date().toISOString().split('T')[0]}):

LGP:CAC: ${metrics.lgpCacRatio}:1 | MRR: $${(metrics.totalMRR / 100).toFixed(2)} | Gross Margin: ${metrics.grossMarginPct}%
30-Day Health: ${metrics.healthCheckRatio}x (need >=2x) — ${metrics.healthCheckPassing ? 'PASS' : 'FAIL'}
Artist Churn: ${metrics.artistChurnRate}%/mo | Avg Lifespan: ${metrics.avgLifespanMonths}mo
Fan Churn: ${metrics.fanChurnRate ?? 0}% | Active Fans: ${metrics.totalActiveFans ?? 0} | New Fans: ${metrics.newFans ?? 0} | Churned Fans: ${metrics.churnedFans ?? 0}
Artist Scoreboard: +${metrics.scoreboard?.artistReferrals ?? 0} referrals, -${metrics.scoreboard?.artistChurned ?? 0} churned = net ${metrics.scoreboard?.artistNetGrowth ?? 0}
Fan Referrals: not yet tracked | Fan Churned: ${metrics.scoreboard?.fanChurned ?? 0}
Payback: ${metrics.paybackMonths}mo | CAC: $${(metrics.cac / 100).toFixed(2)} | COGs/artist: $${((metrics.cogsPerArtist ?? 0) / 100).toFixed(2)}
Artists: ${metrics.totalArtists} total (${metrics.paidArtists} paid, ${metrics.starterArtists} free)
Organic: ${metrics.organicArtists ?? 0} | Recruited: ${metrics.recruitedArtists ?? 0}
Churn Risk: ${metrics.churnRisk?.active ?? 0} active, ${metrics.churnRisk?.atRisk ?? 0} at-risk, ${metrics.churnRisk?.churning ?? 0} churning
Sales Velocity: ${metrics.salesVelocity}/mo | Rev/Visitor: $${(metrics.revenuePerVisitor / 100).toFixed(2)}
Revenue (period): $${(metrics.periodRevenue / 100).toFixed(2)} | Costs: $${(metrics.periodCosts / 100).toFixed(2)} | Profit: $${(metrics.grossProfit / 100).toFixed(2)}

Return ONLY the JSON array.`;

    const response = await kimi.chat.completions.create({
      model: 'kimi-k2.5',
      max_tokens: 1500,
      temperature: 0.6,
      top_p: 0.95,
      // @ts-expect-error — Kimi-specific param to disable slow thinking mode
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const rawText = response.choices[0]?.message?.content || '[]';

    let insights;
    try {
      const jsonStr = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      insights = JSON.parse(jsonStr);
    } catch {
      insights = [{ priority: 'warning', category: 'health', title: 'Briefing parse failed', body: rawText.slice(0, 300), metric: 'system' }];
    }

    // Get admin email
    const { data: adminProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('role', 'admin');

    if (!adminProfiles || adminProfiles.length === 0) {
      return NextResponse.json({ error: 'No admin users found' }, { status: 400 });
    }

    // Get admin emails from auth.users
    const adminIds = adminProfiles.map(p => p.id);
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
    const adminEmails = authUsers.users
      .filter(u => adminIds.includes(u.id))
      .map(u => u.email)
      .filter(Boolean) as string[];

    if (adminEmails.length === 0) {
      return NextResponse.json({ error: 'No admin emails found' }, { status: 400 });
    }

    const analyzedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

    const html = adminDailyBriefingEmail({
      insights,
      metricsSnapshot: {
        lgpCacRatio: metrics.lgpCacRatio,
        totalMRR: metrics.totalMRR,
        artistChurnRate: metrics.artistChurnRate,
        healthCheckRatio: metrics.healthCheckRatio,
        healthCheckPassing: metrics.healthCheckPassing,
        totalActiveFans: metrics.totalActiveFans ?? 0,
        artistNetGrowth: metrics.scoreboard?.artistNetGrowth ?? 0,
        fanChurned: metrics.scoreboard?.fanChurned ?? 0,
      },
      analyzedAt,
    });

    // Send to all admin emails
    for (const email of adminEmails) {
      const hasCritical = insights.some((i: { priority: string }) => i.priority === 'critical');
      const subject = hasCritical
        ? `⚠️ CRWN Daily Briefing — Critical items need attention`
        : `CRWN Daily Briefing — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      });
    }

    return NextResponse.json({
      success: true,
      insightsCount: insights.length,
      emailsSent: adminEmails.length,
    });
  } catch (error: unknown) {
    console.error('Briefing error:', error);
    return NextResponse.json({ error: 'Briefing failed' }, { status: 500 });
  }
}
