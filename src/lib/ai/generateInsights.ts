import Anthropic from '@anthropic-ai/sdk';
import { ArtistDataForAI } from './collectArtistData';
import { InsightInput } from './starterNudges';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-build',
});

const INSIGHT_TOOL = {
  name: 'generate_insights' as const,
  description: 'Generate actionable insights for the artist based on their data',
  input_schema: {
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
              description: 'The category of insight',
            },
            priority: {
              type: 'string' as const,
              enum: ['urgent', 'high', 'normal', 'low'],
              description: 'Priority level. Use urgent for revenue drops >30% or multiple churn events. Use high for at-risk fans or expiring products. Normal for recommendations. Low for general tips.',
            },
            title: {
              type: 'string' as const,
              description: 'Short, actionable title (max 80 chars). Be specific with numbers.',
              maxLength: 80,
            },
            body: {
              type: 'string' as const,
              description: 'Detailed insight with specific recommendation (max 300 chars). Include dollar amounts, fan names, percentages where relevant.',
              maxLength: 300,
            },
            action_type: {
              type: 'string' as const,
              enum: ['link'],
              description: 'Set to "link" if there is a relevant page to navigate to',
            },
            action_url: {
              type: 'string' as const,
              description: 'App-relative URL for the action. Common values: /profile/artist?tab=analytics, /profile/artist?tab=tiers, /profile/artist?tab=shop, /community',
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

  lines.push(`Artist: ${data.artistName}`);
  lines.push(`Platform Tier: ${data.platformTier}`);
  lines.push('');

  // Revenue
  lines.push('=== REVENUE (all amounts in cents) ===');
  lines.push(`This week: ${data.revenue.thisWeek} | Last week: ${data.revenue.lastWeek}`);
  lines.push(`This month: ${data.revenue.thisMonth} | Last month: ${data.revenue.lastMonth}`);
  if (Object.keys(data.revenue.byType).length > 0) {
    lines.push(`By type: ${Object.entries(data.revenue.byType).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  }

  // Subscribers
  lines.push('');
  lines.push('=== SUBSCRIBERS ===');
  lines.push(`Active: ${data.subscribers.active} | New this week: ${data.subscribers.newThisWeek} | Churned this week: ${data.subscribers.churnedThisWeek}`);
  if (data.subscribers.atRiskFans.length > 0) {
    lines.push(`At-risk fans (no activity 14+ days):`);
    data.subscribers.atRiskFans.slice(0, 10).forEach(f => {
      lines.push(`  - ${f.name} (${f.daysSinceActive} days inactive)`);
    });
  }

  // Plays
  lines.push('');
  lines.push('=== PLAYS ===');
  lines.push(`Total all-time: ${data.plays.total} | This week: ${data.plays.thisWeek} | Last week: ${data.plays.lastWeek}`);
  if (data.plays.topTracks.length > 0) {
    lines.push('Top tracks:');
    data.plays.topTracks.forEach(t => lines.push(`  - "${t.title}": ${t.plays} plays`));
  }

  // Community
  lines.push('');
  lines.push('=== COMMUNITY ===');
  lines.push(`Posts this month: ${data.community.postsThisMonth} | Avg likes: ${data.community.avgLikes} | Avg comments: ${data.community.avgComments}`);
  lines.push(`Last post: ${data.community.lastPostDate || 'never'}`);

  // Products expiring
  if (data.products.expiringWithin7Days.length > 0) {
    lines.push('');
    lines.push('=== EXPIRING PRODUCTS ===');
    data.products.expiringWithin7Days.forEach(p => {
      lines.push(`  - "${p.title}" expires ${new Date(p.expiresAt).toLocaleDateString()}`);
    });
  }

  // Top fans
  if (data.topFans.length > 0) {
    lines.push('');
    lines.push('=== TOP FANS (by total spend in cents) ===');
    data.topFans.forEach(f => lines.push(`  - ${f.name}: ${f.totalSpent}`));
  }

  return lines.join('\n');
}

export async function generateInsights(data: ArtistDataForAI): Promise<InsightInput[]> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are an AI artist manager for CRWN, a music monetization platform for independent artists. Analyze the artist's data and generate 2-5 actionable insights.

Focus on:
- Revenue trends and anomalies (percentage changes, what's driving growth or decline)
- Churn risk (at-risk fans who haven't engaged, recent cancellations)
- VIP fan opportunities (top spenders who could upgrade tiers or be engaged more)
- Content gaps (posting cadence, what types of content perform best)
- Booking/product reminders (expiring products, upcoming sessions)

Be specific with numbers, names, and percentages. Convert cents to dollars in your output (divide by 100). Don't give generic advice — every insight should reference actual data points. Keep titles punchy and bodies actionable.`,
      messages: [
        {
          role: 'user',
          content: buildPrompt(data),
        },
      ],
      tools: [INSIGHT_TOOL],
      tool_choice: { type: 'tool', name: 'generate_insights' },
    });

    // Extract tool use from response
    const toolUse = response.content.find(block => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      console.error('AI Manager: No tool use in response');
      return [];
    }

    const input = toolUse.input as { insights: InsightInput[] };
    return (input.insights || []).map(insight => ({
      type: insight.type,
      priority: insight.priority,
      title: insight.title.slice(0, 80),
      body: insight.body.slice(0, 300),
      action_type: insight.action_type || null,
      action_url: insight.action_url || null,
    }));
  } catch (error) {
    console.error('AI Manager: Anthropic API error', error);
    return [];
  }
}
