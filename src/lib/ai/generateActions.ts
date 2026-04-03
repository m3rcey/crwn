import OpenAI from 'openai';
import { ArtistDataForAI } from './collectArtistData';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-build',
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

function buildActionPrompt(data: ArtistDataForAI, extraContext: {
  sequences: { id: string; name: string; trigger_type: string; is_active: boolean }[];
  tiers: { id: string; name: string; price: number }[];
  freeTracks: { id: string; title: string }[];
  gatedTracks: { id: string; title: string }[];
}): string {
  const lines: string[] = [];

  lines.push(`Artist: ${data.artistName} (tier: ${data.platformTier})`);
  lines.push('');

  // Revenue
  lines.push('=== REVENUE (cents) ===');
  lines.push(`This week: ${data.revenue.thisWeek} | Last week: ${data.revenue.lastWeek}`);
  lines.push(`This month: ${data.revenue.thisMonth} | Last month: ${data.revenue.lastMonth}`);

  // Subscribers
  lines.push('');
  lines.push('=== SUBSCRIBERS ===');
  lines.push(`Active: ${data.subscribers.active} | New this week: ${data.subscribers.newThisWeek} | Churned: ${data.subscribers.churnedThisWeek}`);
  if (data.subscribers.atRiskFans.length > 0) {
    lines.push(`At-risk fans (inactive 14+ days): ${data.subscribers.atRiskFans.map(f => `${f.name} (${f.daysSinceActive}d)`).join(', ')}`);
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
    lines.push(`  - "${t.name}" $${(t.price / 100).toFixed(2)}/mo [id: ${t.id}]`);
  });

  // Tracks
  lines.push('');
  lines.push('=== TRACKS ===');
  lines.push(`Free tracks: ${extraContext.freeTracks.length} | Gated tracks: ${extraContext.gatedTracks.length}`);
  extraContext.freeTracks.slice(0, 5).forEach(t => lines.push(`  Free: "${t.title}" [id: ${t.id}]`));
  extraContext.gatedTracks.slice(0, 5).forEach(t => lines.push(`  Gated: "${t.title}" [id: ${t.id}]`));

  // Top fans
  if (data.topFans.length > 0) {
    lines.push('');
    lines.push('=== TOP FANS ===');
    data.topFans.forEach(f => lines.push(`  - ${f.name}: $${(f.totalSpent / 100).toFixed(2)} total`));
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are an AI artist manager for CRWN, a music monetization platform. You analyze artist data and recommend CONCRETE ACTIONS to help them make more money.

You can recommend these action types:
- toggle_sequence: Activate or pause an email sequence. Params: { sequence_id, enable: true/false }. ONLY use sequence IDs from the SEQUENCES data. Low risk.
- send_reengagement: Enroll inactive fans in re-engagement emails. Params: {} (auto-detects inactive fans). Low risk.
- create_discount_code: Create a limited-time discount. Params: { code, discount_type: "percent"|"fixed", discount_value, max_uses?, expires_in_days? }. Medium risk.
- gate_track: Lock a free track behind tiers. Params: { track_id, tier_ids: [...] }. Use real IDs from TRACKS/TIERS. Medium risk.
- ungate_track: Make a gated track free. Params: { track_id }. Medium risk.
- schedule_campaign: Draft an email campaign. Params: { name, subject, body, scheduled_in_hours? }. Medium risk.
- create_community_post: Publish a post. Params: { content, tier_ids?: [...] }. Medium risk.
- adjust_tier_price: Change a tier's monthly price. Params: { tier_id, new_price_cents }. High risk.

RULES:
- Only suggest actions backed by data. Never guess IDs — use exact IDs from the context.
- Max 4 actions. Prefer high-impact revenue actions.
- Be conservative with high-risk actions.
- If everything looks healthy and there's nothing urgent, return 0 actions.
- Risk levels: low = safe to auto-execute, medium = needs artist approval, high = needs artist approval + carries financial impact.
- All prices are in CENTS in the data. Convert to dollars when writing labels/descriptions.`;

export async function generateActions(
  data: ArtistDataForAI,
  extraContext: {
    sequences: { id: string; name: string; trigger_type: string; is_active: boolean }[];
    tiers: { id: string; name: string; price: number }[];
    freeTracks: { id: string; title: string }[];
    gatedTracks: { id: string; title: string }[];
  },
): Promise<{ diagnosis: string; severity: string; actions: AgentActionInput[] }> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
