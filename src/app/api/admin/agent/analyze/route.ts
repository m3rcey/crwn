import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const kimi = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY || 'dummy-key-for-build',
  baseURL: 'https://api.moonshot.ai/v1',
  timeout: 45000, // 45s timeout
});

const SYSTEM_PROMPT = `You are CRWN's business intelligence agent. You analyze platform metrics and return structured, actionable insights AND suggested actions you can take.

RULES (Alex Hormozi framework — these are non-negotiable benchmarks):

1. LGP:CAC RATIO
   - Below 3:1 = CRITICAL. You are losing money on every artist acquired. Stop scaling immediately.
   - 3-5:1 = WARNING. Acceptable but fragile. One bad month kills profitability.
   - 5-10:1 = Good. Room to invest in growth.
   - 10+:1 = Great. Print money territory.

2. REFERRALS vs CHURN
   - Referrals MUST exceed churn on BOTH artist and fan sides.
   - Net negative on either side = the business is shrinking on that side.
   - Fan churn is a LEADING INDICATOR of artist churn (artists leave when fans leave).

3. 30-DAY PROFIT HEALTH CHECK
   - 30-day profit MUST be >= (CAC + COGs per artist) x 2.
   - Below 2x = you cannot self-fund acquisition. Growth stalls or requires outside capital.
   - Below 1x = you are losing money. Emergency.

4. CHURN RATE
   - <=2% monthly = Excellent retention.
   - 2-5% = Acceptable but needs attention.
   - >5% = Leaky bucket. Fix retention BEFORE scaling acquisition.

5. PAYBACK PERIOD
   - <1 month = Can scale aggressively with credit cards.
   - 1-3 months = Healthy.
   - 3-6 months = Concerning — cash tied up too long.
   - >6 months = Problem. Rethink pricing or reduce CAC.

6. GROSS MARGIN
   - >=80% = Healthy SaaS margin.
   - 60-80% = Warning. Costs eating into reinvestment capacity.
   - <60% = Critical. Cost structure is broken.

7. REVENUE PER VISITOR
   - Trending down = pricing or conversion problem.
   - Trending up = good sign, can afford more marketing spend.

8. SALES VELOCITY
   - Declining = top-of-funnel problem.
   - Increasing while churn is flat = business is growing.

9. COHORT RETENTION
   - M0→M1 drop >40% = onboarding problem, not product problem. Focus on first 30 days.
   - M3+ stabilizes = product-market fit exists, improve activation.
   - M3+ still dropping = product problem. Fix before scaling.

10. CANCELLATION REASONS
   - Top 1-2 reasons are the ONLY ones worth fixing. Ignore the long tail.
   - "Price" from ideal customers = add a lower tier. From non-ideal = price filter working correctly.
   - Look for patterns in freeform feedback — they reveal what surveys miss.

11. TIER UPGRADES
   - Low upgrade rate from Pro→Label/Empire = value gap between tiers isn't clear.
   - High upgrade rate = pricing may be too low on upper tiers.

12. PER-TIER HEALTH
   - If a specific tier fails the 2x health check, its pricing doesn't cover acquisition + serving costs.
   - Fix: raise price, lower CAC for that tier's artists, or reduce COGS.

13. RECRUITER PERFORMANCE
   - High qualification rate + low churn = great recruiter bringing ideal customers.
   - High referrals + low qualification = recruiter bringing bad leads. Cut them.
   - Negative ROI recruiter = losing money on every artist they bring. Immediate action needed.

CRWN CONTEXT:
- Two-sided marketplace: artists (supply) and fans (demand).
- Artists pay platform tier subscriptions (Starter free, Pro $69/mo, Label $175/mo, Empire $350/mo).
- Annual billing: Pro $52/mo, Label $131/mo, Empire $262/mo (25% off).
- Platform takes 3-8% fee on fan transactions depending on artist tier (Starter 8%, Pro 6%, Label 5%, Empire 3%).
- Prices are in CENTS in the data. Convert to dollars for display.
- Variable costs (SMS, MMS, email) are per-message and factored into COGS.

RESPONSE FORMAT:
Return a JSON object with two arrays: "insights" and "actions".

INSIGHTS array — each insight must have:
- priority: "critical" | "warning" | "info"
- category: "revenue" | "retention" | "acquisition" | "health" | "growth"
- title: concise headline (max 80 chars)
- body: specific recommendation with numbers (max 300 chars)
- metric: which metric this insight relates to

Order insights by priority (critical first). Maximum 8 insights.

ACTIONS array — concrete actions you recommend the admin approve. Each action must have:
- type: one of "toggle_sequence" | "update_pipeline_stages" | "send_briefing"
- label: short action name (max 60 chars)
- description: why this action should be taken (max 200 chars)
- risk: "low" | "medium" | "high"
- params: object with action-specific parameters:
  - toggle_sequence: { "sequence_trigger": "<trigger_name>", "enable": true|false }
  - update_pipeline_stages: { "from_stage": "<stage>", "to_stage": "<stage>", "criteria": "<description>" }
  - send_briefing: {}

ACTION RULES:
- Only suggest actions that are directly supported by the data. Do not guess.
- toggle_sequence: Only reference sequences by their exact trigger name from the SEQUENCES data provided. Only suggest enabling a disabled sequence or disabling an enabled one.
- update_pipeline_stages: Only suggest when the pipeline data clearly shows artists that should be moved. Valid stages: signed_up, onboarding, free, paid, at_risk, churned.
- send_briefing: Only suggest when there are critical-priority insights.
- Maximum 3 actions. Only suggest actions when metrics clearly warrant them. It's fine to return 0 actions.
- Be conservative. Each action will be reviewed by the admin before execution.

Be direct and specific with numbers. No fluff.`;

export const maxDuration = 60; // Allow up to 60s for Kimi response

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Fetch metrics from cache (or compute fresh via internal call)
    const { data: cached } = await supabaseAdmin
      .from('admin_metrics_cache')
      .select('metrics, computed_at')
      .eq('period', '30d')
      .single();

    if (!cached?.metrics) {
      return NextResponse.json({ error: 'No metrics data available. Refresh the dashboard first.' }, { status: 400 });
    }

    const metrics = cached.metrics;

    // Fetch sequence states for action context
    const { data: sequences } = await supabaseAdmin
      .from('platform_sequences')
      .select('trigger, name, is_active');

    // Fetch pipeline stage distribution for action context
    const { data: pipelineRaw } = await supabaseAdmin
      .from('artist_profiles')
      .select('pipeline_stage');

    const stageCounts: Record<string, number> = {};
    (pipelineRaw || []).forEach((a: { pipeline_stage: string | null }) => {
      const stage = a.pipeline_stage || 'onboarding';
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    });

    // Build the user message with all metrics
    const userMessage = `Analyze these CRWN platform metrics (30-day trailing period, computed ${cached.computed_at}):

HERO METRIC:
- LGP:CAC Ratio: ${metrics.lgpCacRatio === null ? 'Infinity' : metrics.lgpCacRatio}:1
- LGP per Artist: ${metrics.lgp} cents ($${(metrics.lgp / 100).toFixed(2)})
- CAC: ${metrics.cac} cents ($${(metrics.cac / 100).toFixed(2)})

FINANCIAL HEALTH:
- MRR: ${metrics.totalMRR} cents ($${(metrics.totalMRR / 100).toFixed(2)})
- ARR: ${metrics.totalARR} cents ($${(metrics.totalARR / 100).toFixed(2)})
- Platform MRR: ${metrics.platformMRR} cents
- Transaction Fee MRR: ${metrics.transactionFeeMRR} cents
- Gross Margin: ${metrics.grossMarginPct}%
- 30-Day Profit: ${metrics.thirtyDayProfit} cents ($${(metrics.thirtyDayProfit / 100).toFixed(2)})
- 30-Day Health Check Ratio: ${metrics.healthCheckRatio}x (target: >=2x) — ${metrics.healthCheckPassing ? 'PASSING' : 'FAILING'}
- COGs per Artist: ${metrics.cogsPerArtist} cents
- Payback Period: ${metrics.paybackMonths} months
- Period Revenue: ${metrics.periodRevenue} cents
- Period Costs: ${metrics.periodCosts} cents
- Gross Profit: ${metrics.grossProfit} cents

FAN METRICS:
- Total Active Fans: ${metrics.totalActiveFans}
- New Fans (period): ${metrics.newFans}
- Churned Fans (period): ${metrics.churnedFans}
- Fan Churn Rate: ${metrics.fanChurnRate}%
- Fan LTV: ${metrics.fanLTV} cents ($${(metrics.fanLTV / 100).toFixed(2)})
- Revenue Per Fan: ${metrics.revenuePerFan} cents

REFERRAL VS CHURN SCOREBOARD:
- Artist Referrals (period): ${metrics.scoreboard?.artistReferrals ?? 0}
- Artist Churned (period): ${metrics.scoreboard?.artistChurned ?? 0}
- Artist Net Growth: ${metrics.scoreboard?.artistNetGrowth ?? 0}
- Fan Referrals: ${metrics.scoreboard?.fanReferralTracked ? metrics.scoreboard.fanReferrals : 'NOT YET TRACKED'}
- Fan Churned: ${metrics.scoreboard?.fanChurned ?? 0}
- Fan Net Growth: ${metrics.scoreboard?.fanReferralTracked ? metrics.scoreboard.fanNetGrowth : 'CANNOT COMPUTE — referrals not tracked'}

RETENTION:
- Artist Churn Rate: ${metrics.artistChurnRate}%/month
- Avg Artist Lifespan: ${metrics.avgLifespanMonths} months
- Total Artists: ${metrics.totalArtists} (${metrics.paidArtists} paid, ${metrics.starterArtists} free)
- Paid Conversion: ${metrics.totalArtists > 0 ? Math.round((metrics.paidArtists / metrics.totalArtists) * 100) : 0}%
- Churn Risk: ${metrics.churnRisk?.active ?? 0} active, ${metrics.churnRisk?.atRisk ?? 0} at-risk, ${metrics.churnRisk?.churning ?? 0} churning

ACQUISITION:
- Artists Acquired (period): ${metrics.totalArtistsAcquired}
- Total Recruiter Spend: ${metrics.totalRecruiterCost} cents
- Organic Artists: ${metrics.organicArtists ?? 0}
- Recruited Artists: ${metrics.recruitedArtists ?? 0}

VISITORS:
- Unique Visitors (period): ${metrics.uniqueVisitorsInPeriod}
- Revenue Per Visitor: ${metrics.revenuePerVisitor} cents
- Visitor Trend (last 7 days): ${(metrics.visitorTrend || []).slice(-7).map((d: any) => `${d.label}: ${d.visitors} visitors, RPV ${d.revenuePerVisitor}¢`).join('; ')}

REVENUE TREND (last 7 days):
${(metrics.revenueTrend || []).slice(-7).map((d: any) => `- ${d.label}: platform fees ${d.platformFees}¢, gross ${d.totalGross}¢`).join('\n')}

BILLING MIX:
${(metrics.billingMix || []).map((b: any) => `- ${b.name}: ${b.count} artists`).join('\n')}

VARIABLE COSTS (messaging COGS):
- Total Variable Costs (period): ${metrics.totalVariableCostsCents ?? 0} cents ($${((metrics.totalVariableCostsCents ?? 0) / 100).toFixed(2)})
- SMS sent: ${metrics.messagingVolume?.sms ?? 0}, MMS sent: ${metrics.messagingVolume?.mms ?? 0}, Emails sent: ${metrics.messagingVolume?.email ?? 0}
- Per-unit rates: SMS $${metrics.variableCosts?.sms_per_message ?? 0.0079}, MMS $${metrics.variableCosts?.mms_per_message ?? 0.02}, Email $${metrics.variableCosts?.email_per_message ?? 0.00023}

PER-TIER HORMOZI HEALTH CHECK:
${(metrics.tierHealthCheck || []).map((t: any) => `- ${t.tier}: price ${t.price}¢, COGS ${t.cogs}¢ (Stripe ${t.stripeFee}¢ + infra ${t.infraPerArtist}¢), amortized CAC ${t.cac}¢, profit ${t.profit}¢, ratio ${t.ratio}x — ${t.passing ? 'PASSING' : 'FAILING'}`).join('\n')}

TIER UPGRADES:
- Established paid artists (60d+): ${metrics.tierUpgradeMetrics?.establishedPaidCount ?? 0}
- On Label or higher: ${metrics.tierUpgradeMetrics?.onLabelPlus ?? 0}
- Upgrade rate: ${metrics.tierUpgradeMetrics?.upgradeRate ?? 0}%
- Distribution: Pro ${metrics.tierUpgradeMetrics?.proCount ?? 0}, Label ${metrics.tierUpgradeMetrics?.labelCount ?? 0}, Empire ${metrics.tierUpgradeMetrics?.empireCount ?? 0}

COHORT RETENTION (artist):
${(metrics.artistCohortRetention || []).slice(-6).map((c: any) => `- ${c.month} (n=${c.cohortSize}): ${(c.retention || []).map((r: number, i: number) => `M${i}:${r}%`).join(', ')}`).join('\n') || 'No data'}

COHORT RETENTION (fan):
${(metrics.fanCohortRetention || []).slice(-6).map((c: any) => `- ${c.month} (n=${c.cohortSize}): ${(c.retention || []).map((r: number, i: number) => `M${i}:${r}%`).join(', ')}`).join('\n') || 'No data'}

CANCELLATION REASONS (platform tier):
${(metrics.cancelReasonSummary?.platform || []).slice(0, 5).map((r: any) => `- "${r.reason}": ${r.count} cancellations`).join('\n') || 'No data'}

CANCELLATION REASONS (fan subscriptions):
${(metrics.cancelReasonSummary?.fan || []).slice(0, 5).map((r: any) => `- "${r.reason}": ${r.count} cancellations`).join('\n') || 'No data'}

RECENT FREEFORM FEEDBACK:
${(metrics.cancelReasonSummary?.recentFreeform || []).slice(0, 5).map((f: any) => `- "${f.text}" (${f.context}, ${f.date})`).join('\n') || 'No data'}

LOYALTY SURVEY SUMMARY:
${metrics.surveySummary ? `- NPS: ${metrics.surveySummary.nps ?? 'N/A'}, Responses: ${metrics.surveySummary.totalResponses ?? 0}
- Top loved: ${(metrics.surveySummary.topLoved || []).slice(0, 3).join(', ') || 'N/A'}
- Top requested: ${(metrics.surveySummary.topRequested || []).slice(0, 3).join(', ') || 'N/A'}` : 'No survey data'}

RECRUITER PERFORMANCE (top 5 by referred MRR):
${(metrics.recruiterPerformance || []).slice(0, 5).map((r: any) => `- ${r.code} (${r.tier}${r.isPartner ? ', partner' : ''}): ${r.totalReferred} referred, ${r.qualified} qualified, ${r.churned} churned, qual rate ${r.qualificationRate}%, paid $${(r.totalPaid / 100).toFixed(2)}, referred MRR $${(r.referredMRR / 100).toFixed(2)}, ROI ${r.roi}x`).join('\n') || 'No recruiters'}

PROJECTIONS:
- Sales Velocity: ${metrics.salesVelocity} new paid artists/month
- Hypothetical Max Monthly Revenue: ${metrics.hypotheticalMaxMonthlyRevenue} cents
- Hypothetical Max Customers: ${metrics.hypotheticalMaxCustomers}

SEQUENCES (email automations you can toggle):
${(sequences || []).map((s: { trigger: string; name: string; is_active: boolean }) => `- trigger: "${s.trigger}", name: "${s.name}", currently ${s.is_active ? 'ENABLED' : 'DISABLED'}`).join('\n')}

PIPELINE STAGE DISTRIBUTION:
${Object.entries(stageCounts).map(([stage, count]) => `- ${stage}: ${count} artists`).join('\n')}

Return ONLY the JSON object with "insights" and "actions" arrays. No markdown, no code fences, no explanation.`;

    const response = await kimi.chat.completions.create({
      model: 'kimi-k2.5',
      max_tokens: 4000,
      temperature: 0.6,
      top_p: 0.95,
      // @ts-expect-error — Kimi-specific param to disable slow thinking mode
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const rawText = response.choices[0]?.message?.content || '{}';

    // Parse JSON from response (handle potential markdown wrapping)
    let insights;
    let actions;
    try {
      const jsonStr = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);

      // Handle both old format (array) and new format (object with insights + actions)
      if (Array.isArray(parsed)) {
        insights = parsed;
        actions = [];
      } else {
        insights = parsed.insights || [];
        actions = parsed.actions || [];
      }
    } catch {
      insights = [{ priority: 'warning', category: 'health', title: 'Agent response parsing failed', body: rawText.slice(0, 300), metric: 'system' }];
      actions = [];
    }

    return NextResponse.json({ insights, actions, analyzedAt: new Date().toISOString() });
  } catch (error: unknown) {
    console.error('Agent analyze error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
