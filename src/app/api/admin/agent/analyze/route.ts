import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const kimi = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY || 'dummy-key-for-build',
  baseURL: 'https://api.moonshot.ai/v1',
});

const SYSTEM_PROMPT = `You are CRWN's business intelligence agent. You analyze platform metrics and return structured, actionable insights.

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

CRWN CONTEXT:
- Two-sided marketplace: artists (supply) and fans (demand).
- Artists pay platform tier subscriptions (Starter free, Pro $50/mo, Label $150/mo, Empire $350/mo).
- Platform takes 4-8% fee on fan transactions depending on artist tier.
- Prices are in CENTS in the data. Convert to dollars for display.

RESPONSE FORMAT:
Return a JSON array of insights. Each insight must have:
- priority: "critical" | "warning" | "info"
- category: "revenue" | "retention" | "acquisition" | "health" | "growth"
- title: concise headline (max 80 chars)
- body: specific recommendation with numbers (max 300 chars)
- metric: which metric this insight relates to

Order by priority (critical first, then warning, then info). Maximum 8 insights — focus on what matters most. Be direct and specific with numbers. No fluff.`;

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

PROJECTIONS:
- Sales Velocity: ${metrics.salesVelocity} new paid artists/month
- Hypothetical Max Monthly Revenue: ${metrics.hypotheticalMaxMonthlyRevenue} cents
- Hypothetical Max Customers: ${metrics.hypotheticalMaxCustomers}

Return ONLY the JSON array of insights. No markdown, no code fences, no explanation.`;

    const response = await kimi.chat.completions.create({
      model: 'kimi-k2.5',
      max_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const rawText = response.choices[0]?.message?.content || '[]';

    // Parse JSON from response (handle potential markdown wrapping)
    let insights;
    try {
      const jsonStr = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      insights = JSON.parse(jsonStr);
    } catch {
      insights = [{ priority: 'warning', category: 'health', title: 'Agent response parsing failed', body: rawText.slice(0, 300), metric: 'system' }];
    }

    return NextResponse.json({ insights, analyzedAt: new Date().toISOString() });
  } catch (error: unknown) {
    console.error('Agent analyze error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
