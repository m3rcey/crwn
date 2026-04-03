import OpenAI from 'openai';
import { ArtistDataForAI } from './collectArtistData';
import { InsightInput } from './starterNudges';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-build',
});

const INSIGHT_FUNCTION = {
  name: 'generate_insights',
  description: 'Generate actionable insights for the artist based on their analytics data',
  parameters: {
    type: 'object' as const,
    properties: {
      insights: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            type: {
              type: 'string' as const,
              enum: ['revenue', 'churn', 'vip_fan', 'booking_reminder', 'content_nudge', 'weekly_digest'],
            },
            priority: {
              type: 'string' as const,
              enum: ['urgent', 'high', 'normal', 'low'],
            },
            title: {
              type: 'string' as const,
              description: 'Short, specific title with numbers (max 80 chars)',
            },
            body: {
              type: 'string' as const,
              description: 'Analysis + specific recommendation (max 300 chars). Reference the metric, explain what it means, and say what to do.',
            },
            action_type: {
              type: 'string' as const,
              enum: ['link'],
            },
            action_url: {
              type: 'string' as const,
            },
          },
          required: ['type', 'priority', 'title', 'body'],
        },
        minItems: 1,
        maxItems: 5,
      },
    },
    required: ['insights'],
  },
};

function buildPrompt(data: ArtistDataForAI): string {
  const lines: string[] = [];
  const $ = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const pct = (n: number) => `${n}%`;

  lines.push(`Artist: ${data.artistName} | Tier: ${data.platformTier}`);
  lines.push('');

  // Unit Economics — this is what matters
  lines.push('=== UNIT ECONOMICS ===');
  lines.push(`MRR: ${$(data.unitEconomics.mrr)} | ARPU: ${$(data.unitEconomics.arpu)}/mo | LTV: ${$(data.unitEconomics.ltv)}`);
  lines.push(`Churn Rate: ${pct(data.unitEconomics.churnRate)}/mo | Avg Lifespan: ${data.unitEconomics.avgLifespanMonths} months`);
  lines.push(`Revenue Per Visitor: ${$(data.unitEconomics.revenuePerVisitor)} (30d) | Unique Visitors: ${data.unitEconomics.uniqueVisitors30d}`);
  lines.push(`Revenue Per Play: ${$(data.unitEconomics.revenuePerPlay)} | Sales Velocity: ${data.unitEconomics.salesVelocity} new subs/mo`);

  // Revenue trends
  lines.push('');
  lines.push('=== REVENUE TRENDS (cents) ===');
  lines.push(`This week: ${$(data.revenue.thisWeek)} | Last week: ${$(data.revenue.lastWeek)} | Change: ${data.revenue.lastWeek > 0 ? Math.round(((data.revenue.thisWeek - data.revenue.lastWeek) / data.revenue.lastWeek) * 100) : 'N/A'}%`);
  lines.push(`This month: ${$(data.revenue.thisMonth)} | Last month: ${$(data.revenue.lastMonth)} | Change: ${data.revenue.lastMonth > 0 ? Math.round(((data.revenue.thisMonth - data.revenue.lastMonth) / data.revenue.lastMonth) * 100) : 'N/A'}%`);
  if (Object.keys(data.revenue.byType).length > 0) {
    lines.push(`By type: ${Object.entries(data.revenue.byType).map(([k, v]) => `${k}: ${$(v)}`).join(', ')}`);
  }

  // Subscribers
  lines.push('');
  lines.push('=== SUBSCRIBERS ===');
  lines.push(`Active: ${data.subscribers.active} | New this month: ${data.subscribers.newThisMonth} | Churned this month: ${data.subscribers.churnedThisMonth}`);
  if (data.subscribers.byTier.length > 0) {
    lines.push(`By tier: ${data.subscribers.byTier.map(t => `${t.name} (${$(t.price)}/mo): ${t.count} subs`).join(' | ')}`);
  }
  lines.push(`Fan health: ${data.subscribers.fanActivity.active} active (7d), ${data.subscribers.fanActivity.atRisk} at-risk (7-21d), ${data.subscribers.fanActivity.churning} churning (21d+)`);

  if (data.subscribers.atRiskFans.length > 0) {
    lines.push(`At-risk fans: ${data.subscribers.atRiskFans.slice(0, 5).map(f => `${f.name} (${f.daysSinceActive}d inactive)`).join(', ')}`);
  }

  // Retention & Churn Intel
  lines.push('');
  lines.push('=== RETENTION ===');
  if (data.retention.cohorts.length > 0) {
    lines.push('Cohort retention:');
    data.retention.cohorts.forEach(c => {
      lines.push(`  ${c.month} (${c.size} subs): M1=${c.m1 !== null ? pct(c.m1) : '?'} M2=${c.m2 !== null ? pct(c.m2) : '?'} M3=${c.m3 !== null ? pct(c.m3) : '?'}`);
    });
  }
  if (data.retention.cancelReasons.length > 0) {
    lines.push(`Why fans cancel: ${data.retention.cancelReasons.map(r => `"${r.reason}" (${r.count})`).join(', ')}`);
  }
  if (data.retention.recentCancelFeedback.length > 0) {
    lines.push(`Recent cancel feedback: ${data.retention.recentCancelFeedback.map(f => `"${f}"`).join('; ')}`);
  }
  if (data.retention.npsAvg !== null) {
    lines.push(`Fan NPS: ${data.retention.npsAvg}/10`);
  }
  if (data.retention.surveyWhyStayed.length > 0) {
    lines.push(`Why fans stay: ${data.retention.surveyWhyStayed.map(s => `"${s}"`).join('; ')}`);
  }

  // Plays
  lines.push('');
  lines.push('=== PLAYS ===');
  lines.push(`Total: ${data.plays.total} | This week: ${data.plays.thisWeek} | Last week: ${data.plays.lastWeek}`);
  if (data.plays.topTracks.length > 0) {
    lines.push(`Top tracks: ${data.plays.topTracks.map(t => `"${t.title}" (${t.plays})`).join(', ')}`);
  }

  // Community
  lines.push('');
  lines.push('=== COMMUNITY ===');
  lines.push(`Posts this month: ${data.community.postsThisMonth} | Avg likes: ${data.community.avgLikes} | Avg comments: ${data.community.avgComments}`);
  lines.push(`Last post: ${data.community.lastPostDate || 'never'}`);

  // Top fans
  if (data.topFans.length > 0) {
    lines.push('');
    lines.push('=== TOP FANS ===');
    data.topFans.forEach(f => lines.push(`  ${f.name}: ${$(f.totalSpent)} total`));
  }

  // Geography
  if (data.geography.topCities.length > 0) {
    lines.push('');
    lines.push('=== GEOGRAPHY ===');
    lines.push(`Top cities: ${data.geography.topCities.map(c => `${c.city} (${c.count} fans)`).join(', ')}`);
    if (data.geography.topCitiesByRevenue.length > 0) {
      lines.push(`Top by revenue: ${data.geography.topCitiesByRevenue.map(c => `${c.city} (${$(c.revenue)})`).join(', ')}`);
    }
  }

  // Referrals
  if (data.referrals.totalReferrals > 0) {
    lines.push('');
    lines.push('=== REFERRAL PROGRAM ===');
    lines.push(`Total: ${data.referrals.totalReferrals} | Active: ${data.referrals.activeReferrals} | Commission: ${$(data.referrals.totalCommission)} | % of subs from referrals: ${pct(data.referrals.conversionRate)}`);
  }

  // Products expiring
  if (data.products.expiringWithin7Days.length > 0) {
    lines.push('');
    lines.push('=== EXPIRING PRODUCTS ===');
    data.products.expiringWithin7Days.forEach(p => {
      lines.push(`  "${p.title}" expires ${new Date(p.expiresAt).toLocaleDateString()}`);
    });
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are an AI artist manager analyzing an independent artist's analytics dashboard on CRWN, a music monetization platform. Your job is to find the ONE OR TWO most important signals in the data and explain what they mean in plain language — like a smart manager would to their artist.

THINK LIKE A MANAGER, NOT A DASHBOARD:
- Don't just restate numbers ("revenue is up 39%"). Explain what's DRIVING the change and what to DO about it.
- Connect metrics to each other. If RPV is rising + churn is low, that means the audience is getting more valuable — time to raise prices or launch a premium tier.
- If churn is rising, look at WHY (cancel reasons, cohort retention, fan activity health) before suggesting anything.
- If a specific fan is at risk, name them and suggest a specific outreach.
- If community engagement is dropping but revenue is flat, explain why that's a leading indicator.

UNIT ECONOMICS REASONING:
- LTV > $50 with churn < 5% = healthy, can invest in growth
- LTV < $20 or churn > 10% = fix retention before anything else
- RPV rising = audience quality improving, consider price increases
- RPV falling = traffic quality declining, tighten targeting
- ARPU low relative to peers ($8-15/mo is typical) = tier pricing may be too low
- Sales velocity declining = acquisition problem, need more content or promotion

BENCHMARKS:
- Churn: <5% excellent, 5-8% okay, 8-15% concerning, >15% urgent
- M0→M1 retention drop >40% = onboarding problem (welcome sequence not working)
- M3+ still dropping = product/content problem (not enough new music)
- NPS < 7 = detractors outnumber promoters

TITLE FORMAT — CRITICAL:
Every title MUST lead with the ACTION, then the data justification. Format: "[Verb] [what] — [metric reason]"
- Good: "Raise Wave tier to $15 — RPV up 62%, fans can bear it"
- Good: "DM Aaliyah now — 18 days inactive, $200/mo at risk"
- Good: "Keep dropping gated tracks weekly — M1 retention at 92%"
- Bad: "Revenue up 39% this month" (no action)
- Bad: "Aaliyah James is your top supporter" (observation, not action)
- Bad: "Your sample pack is your best-selling product" (restating data)

Be specific. Use exact numbers and fan names from the data. Each insight should teach the artist something they can't see just by looking at the dashboard.`;

export async function generateInsights(data: ArtistDataForAI): Promise<InsightInput[]> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(data) },
      ],
      tools: [{ type: 'function', function: INSIGHT_FUNCTION }],
      tool_choice: { type: 'function', function: { name: 'generate_insights' } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== 'function') {
      console.error('AI Manager: No function call in response');
      return [];
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const insights: InsightInput[] = parsed.insights || [];

    return insights.map(insight => ({
      type: insight.type,
      priority: insight.priority,
      title: insight.title.slice(0, 80),
      body: insight.body.slice(0, 300),
      action_type: insight.action_type || null,
      action_url: insight.action_url || null,
    }));
  } catch (error) {
    console.error('AI Manager: OpenAI API error', error);
    return [];
  }
}
