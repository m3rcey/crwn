import OpenAI from 'openai';
import { ArtistDataForAI } from './collectArtistData';

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'dummy-key-for-build',
  baseURL: 'https://api.deepseek.com',
});

export interface AgentActionInput {
  type: string;
  label: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  params: Record<string, unknown>;
}

const ACTION_FUNCTION = {
  name: 'recommend_actions',
  description: 'Recommend concrete actions the AI manager should take to help the artist make more money',
  parameters: {
    type: 'object' as const,
    properties: {
      diagnosis: {
        type: 'string' as const,
        description: 'One sentence summary of the biggest opportunity or problem for this artist right now',
      },
      severity: {
        type: 'string' as const,
        enum: ['critical', 'warning', 'info'],
      },
      actions: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            type: {
              type: 'string' as const,
              enum: [
                'toggle_sequence',
                'create_discount_code',
                'gate_track',
                'ungate_track',
                'schedule_campaign',
                'create_community_post',
                'send_reengagement',
                'adjust_tier_price',
              ],
            },
            label: { type: 'string' as const, description: 'Short action name (max 60 chars)' },
            description: { type: 'string' as const, description: 'Why this should be done (max 200 chars)' },
            risk: { type: 'string' as const, enum: ['low', 'medium', 'high'] },
            params: {
              type: 'object' as const,
              description: 'Action-specific parameters. See ACTION PARAMS docs.',
            },
          },
          required: ['type', 'label', 'description', 'risk', 'params'],
        },
        maxItems: 4,
      },
    },
    required: ['diagnosis', 'severity', 'actions'],
  },
};

export interface PastOutcome {
  action_type: string;
  action_label: string;
  outcome_delta: Record<string, number>;
  outcome_score: number;
  executed_at: string;
}

function buildActionPrompt(data: ArtistDataForAI, extraContext: {
  sequences: { id: string; name: string; trigger_type: string; is_active: boolean }[];
  tiers: { id: string; name: string; price: number }[];
  freeTracks: { id: string; title: string }[];
  gatedTracks: { id: string; title: string }[];
  pastOutcomes?: PastOutcome[];
  crossArtistContext?: string;
}): string {
  const lines: string[] = [];
  const $ = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  lines.push(`Artist: ${data.artistName} (tier: ${data.platformTier})`);
  lines.push('');

  // Unit Economics
  lines.push('=== UNIT ECONOMICS ===');
  lines.push(`MRR: ${$(data.unitEconomics.mrr)} | ARPU: ${$(data.unitEconomics.arpu)}/mo | LTV: ${$(data.unitEconomics.ltv)}`);
  lines.push(`Churn: ${data.unitEconomics.churnRate}%/mo | RPV: ${$(data.unitEconomics.revenuePerVisitor)} | Visitors (30d): ${data.unitEconomics.uniqueVisitors30d}`);
  lines.push(`Sales velocity: ${data.unitEconomics.salesVelocity} new subs/mo`);

  // Revenue
  lines.push('');
  lines.push('=== REVENUE ===');
  lines.push(`This week: ${$(data.revenue.thisWeek)} | Last week: ${$(data.revenue.lastWeek)}`);
  lines.push(`This month: ${$(data.revenue.thisMonth)} | Last month: ${$(data.revenue.lastMonth)}`);

  // Subscribers
  lines.push('');
  lines.push('=== SUBSCRIBERS ===');
  lines.push(`Active: ${data.subscribers.active} | New this month: ${data.subscribers.newThisMonth} | Churned: ${data.subscribers.churnedThisMonth}`);
  lines.push(`Fan health: ${data.subscribers.fanActivity.active} active, ${data.subscribers.fanActivity.atRisk} at-risk, ${data.subscribers.fanActivity.churning} churning`);
  if (data.subscribers.atRiskFans.length > 0) {
    lines.push(`At-risk: ${data.subscribers.atRiskFans.slice(0, 5).map(f => `${f.name} (${f.daysSinceActive}d)`).join(', ')}`);
  }

  // Retention
  if (data.retention.cancelReasons.length > 0) {
    lines.push('');
    lines.push('=== CHURN REASONS ===');
    lines.push(data.retention.cancelReasons.map(r => `"${r.reason}" (${r.count}x)`).join(', '));
  }

  // Community
  lines.push('');
  lines.push('=== COMMUNITY ===');
  lines.push(`Posts this month: ${data.community.postsThisMonth} | Last post: ${data.community.lastPostDate || 'never'}`);

  // Sequences
  lines.push('');
  lines.push('=== SEQUENCES ===');
  extraContext.sequences.forEach(s => {
    lines.push(`  - "${s.name}" (${s.trigger_type}) — ${s.is_active ? 'ACTIVE' : 'PAUSED'} [id: ${s.id}]`);
  });

  // Tiers
  lines.push('');
  lines.push('=== TIERS ===');
  extraContext.tiers.forEach(t => {
    lines.push(`  - "${t.name}" ${$(t.price)}/mo [id: ${t.id}]`);
  });

  // Tracks
  lines.push('');
  lines.push('=== TRACKS ===');
  lines.push(`Free: ${extraContext.freeTracks.length} | Gated: ${extraContext.gatedTracks.length}`);
  extraContext.freeTracks.slice(0, 5).forEach(t => lines.push(`  Free: "${t.title}" [id: ${t.id}]`));
  extraContext.gatedTracks.slice(0, 5).forEach(t => lines.push(`  Gated: "${t.title}" [id: ${t.id}]`));

  // Top fans
  if (data.topFans.length > 0) {
    lines.push('');
    lines.push('=== TOP FANS ===');
    data.topFans.forEach(f => lines.push(`  ${f.name}: ${$(f.totalSpent)} total`));
  }

  // Past action outcomes (learning from history)
  if (extraContext.pastOutcomes && extraContext.pastOutcomes.length > 0) {
    lines.push('');
    lines.push('=== PAST ACTION OUTCOMES (learn from these) ===');
    extraContext.pastOutcomes.forEach(o => {
      const delta = o.outcome_delta;
      const effects: string[] = [];
      if (delta.mrr !== 0) effects.push(`MRR ${delta.mrr > 0 ? '+' : ''}${$(delta.mrr)}`);
      if (delta.activeSubs !== 0) effects.push(`subs ${delta.activeSubs > 0 ? '+' : ''}${delta.activeSubs}`);
      if (delta.churnRate !== 0) effects.push(`churn ${delta.churnRate > 0 ? '+' : ''}${delta.churnRate}%`);
      if (delta.atRiskFans !== 0) effects.push(`at-risk ${delta.atRiskFans > 0 ? '+' : ''}${delta.atRiskFans}`);
      const verdict = o.outcome_score > 0 ? 'POSITIVE' : o.outcome_score < 0 ? 'NEGATIVE' : 'NEUTRAL';
      lines.push(`  ${o.action_type}: "${o.action_label}" → ${verdict} (${effects.join(', ') || 'no change'})`);
    });
    lines.push('Use these results to inform your recommendations. Repeat what worked. Avoid what failed.');
  }

  // Cross-artist intelligence (platform-wide patterns)
  if (extraContext.crossArtistContext) {
    lines.push(extraContext.crossArtistContext);
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are an AI artist manager analyzing unit economics to decide what actions to take. You think like a business manager, not a dashboard.

DECISION FRAMEWORK — reason through these in order:
1. Is churn the biggest problem? (>8% or rising) → Fix retention first. Send re-engagement, check if win-back sequence is active.
2. Is RPV rising with low churn? → Audience is getting more valuable. Consider price increase or new premium tier.
3. Is RPV falling? → Traffic quality declining. Gate more content to increase conversion, or ungate something to build top-of-funnel.
4. Are there churning fans (21d+ inactive)? → Send re-engagement NOW before they cancel.
5. Is community dead (no posts in 14+ days)? → Draft a community post to re-engage.
6. Is there a clear cancel reason pattern? → Address the #1 reason with a specific action.
7. Is ARPU low (<$10/mo) with active fans? → Tier pricing is too low. Suggest price adjustment.

ACTION TYPES:
- toggle_sequence: Activate/pause email sequence. Params: { sequence_id, enable: true/false }. Low risk.
- send_reengagement: Enroll inactive fans in re-engagement. Params: {}. Low risk.
- create_discount_code: Time-limited discount. Params: { code, discount_type: "percent"|"fixed", discount_value, max_uses?, expires_in_days? }. Medium risk.
- gate_track: Lock free track behind tiers. Params: { track_id, tier_ids: [...] }. Medium risk.
- ungate_track: Make gated track free. Params: { track_id }. Medium risk.
- schedule_campaign: Draft email campaign. Params: { name, subject, body, scheduled_in_hours? }. Medium risk.
- create_community_post: Publish post. Params: { content, tier_ids?: [...] }. Medium risk.
- adjust_tier_price: Change tier price. Params: { tier_id, new_price_cents }. High risk.

RULES:
- Only use exact IDs from the context. Never guess.
- Max 3 actions. Every action must be justified by a specific metric.
- In the description, explain the metric-based reasoning (e.g. "RPV up 45% with 0% churn — your audience can bear a higher price").
- Return 0 actions if everything is healthy and no intervention needed.
- All prices in CENTS. Convert to dollars in labels.

LEARNING FROM OUTCOMES:
If PAST ACTION OUTCOMES are provided, use them to calibrate your recommendations:
- If an action type had POSITIVE outcomes, prefer recommending it again in similar conditions.
- If an action type had NEGATIVE outcomes, avoid it unless conditions have changed significantly.
- Reference specific past results in your description when relevant (e.g. "Last re-engagement gained +2 subs").

LABEL FORMAT — CRITICAL:
Every label MUST lead with the ACTION VERB, then the justification. Format: "[Verb] [what] — [metric reason]"
- Good: "Activate win-back sequence — 3 churned fans this month"
- Good: "Re-engage 5 inactive fans — 21+ days silent"
- Good: "Gate 'Midnight Drive' behind Wave — RPV up 45%"
- Bad: "Churn rate is rising" (observation, not action)
- Bad: "Consider re-engaging fans" (wishy-washy)`;

export async function generateActions(
  data: ArtistDataForAI,
  extraContext: {
    sequences: { id: string; name: string; trigger_type: string; is_active: boolean }[];
    tiers: { id: string; name: string; price: number }[];
    freeTracks: { id: string; title: string }[];
    gatedTracks: { id: string; title: string }[];
    pastOutcomes?: PastOutcome[];
    crossArtistContext?: string;
  },
): Promise<{ diagnosis: string; severity: string; actions: AgentActionInput[] }> {
  try {
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildActionPrompt(data, extraContext) },
      ],
      tools: [{ type: 'function', function: ACTION_FUNCTION }],
      tool_choice: { type: 'function', function: { name: 'recommend_actions' } },
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== 'function') {
      return { diagnosis: 'No analysis available', severity: 'info', actions: [] };
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    return {
      diagnosis: parsed.diagnosis || '',
      severity: parsed.severity || 'info',
      actions: (parsed.actions || []).map((a: AgentActionInput) => ({
        type: a.type,
        label: (a.label || '').slice(0, 60),
        description: (a.description || '').slice(0, 200),
        risk: a.risk || 'medium',
        params: a.params || {},
      })),
    };
  } catch (error) {
    console.error('AI Manager action generation error:', error);
    return { diagnosis: 'Analysis failed', severity: 'info', actions: [] };
  }
}
