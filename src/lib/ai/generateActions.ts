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
  description: 'Recommend concrete actions the manager should take to help the artist make more money',
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

// RETIRED 2026-08-11: `PastOutcome` and the "PAST ACTION OUTCOMES" prompt block.
//
// Manager used to read its own last 10 measured actions, score each one
// (`mrr + activeSubs*100 - churnRate*500`), label it POSITIVE/NEGATIVE/NEUTRAL and be told to
// "repeat what worked, avoid what failed". That was a causal claim built on a snapshot that
// derives its own MRR, cannot tell missing from zero, measures a window of unrecorded length
// between 7 and 30 days, and attributes one artist-wide movement to every action pending
// measurement at once. `constraint/recommendationOutcome.ts` (Z3) states that no field may be
// named `caused`, `impact`, `attributed` or `score`, and this was all four in one line.
//
// It also never once fired: production held 0 measured outcomes, so `pastOutcomes` was never
// non-empty. Retiring it changes no observed behavior and loses no history.
//
// Manager's learning need is met by canonical readers instead: Z4 gives it the priority, Z9 gives
// it this artist's own eligible measured rates, and Z3 records whether the constraint later
// cleared. There is deliberately NO replacement scoring system here.

export function buildActionPrompt(data: ArtistDataForAI, extraContext: {
  sequences: { id: string; name: string; trigger_type: string; is_active: boolean }[];
  tiers: { id: string; name: string; price: number }[];
  freeTracks: { id: string; title: string }[];
  gatedTracks: { id: string; title: string }[];
  /** Z4: the Constraint Engine's canonical diagnosis, already rendered. Null = it declined to say. */
  canonicalBrief?: string | null;
}): string {
  const lines: string[] = [];
  const $ = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  lines.push(`Artist: ${data.artistName} (tier: ${data.platformTier})`);
  lines.push('');

  // Z4: FIRST, before any metric, because it outranks everything below it. The manager used to pick
  // its own priority from the numbers, and its decision framework has no notion of a broken promise
  // at all, so it could cheerfully recommend a campaign or a price change to an artist the engine
  // had diagnosed as failing the supporters they already have. When the engine declines to diagnose
  // this is absent and the manager reasons exactly as it did before: no fabricated priority.
  if (extraContext.canonicalBrief) {
    lines.push(extraContext.canonicalBrief);
    lines.push('');
  }

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

  // No past-outcome block, and no cross-artist block. Both were injection points for claims CRWN
  // cannot support (see the note above the signature, and Z10). `crossArtistContext` was already
  // hardcoded to '' when the Z10 injection was removed; the parameter is gone too, so there is no
  // longer a live channel that would put a benchmark into this prompt if someone set it.

  return lines.join('\n');
}

export const SYSTEM_PROMPT = `You are an artist manager analyzing unit economics to decide what actions to take. You think like a business manager, not a dashboard.

STYLE, CRITICAL:
- Never use em dashes. Use a period, a comma, a colon, or parentheses instead.
- Never call yourself an AI, an assistant, a model, or a bot. You are the artist's manager.

CANONICAL DIAGNOSIS, READ THIS FIRST:
CRWN has a deterministic Constraint Engine that already decided what is limiting this artist, and
the artist has already been shown its answer. If a CRWN CANONICAL DIAGNOSIS block appears in the
context, it OUTRANKS the decision framework below. Your job there is to explain and advance that
constraint, not to pick a different one. Recommending a growth action while CRWN has diagnosed a
fulfillment or retention problem contradicts what the artist was already told, and two managers
disagreeing is worse than either one of them being wrong.
If no canonical diagnosis block is present, CRWN did not have enough evidence to name one. Reason
from the framework below as usual, and do not claim a confidence CRWN itself refused to claim.

DECISION FRAMEWORK (used when there is no canonical diagnosis, and as supporting detail when there is):
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
- In the description, explain the metric-based reasoning (e.g. "RPV up 45% with 0% churn, your audience can bear a higher price").
- Return 0 actions if everything is healthy and no intervention needed.
- All prices in CENTS. Convert to dollars in labels.

EVIDENCE RULES, NON NEGOTIABLE:
- Never claim that a past action produced a result. CRWN does not measure the effect of an action
  and has no control group, so "this worked" is a claim you cannot support.
- You have data about THIS ARTIST ONLY. Never compare them to other artists, to "typical" artists,
  to peers, to averages or to benchmarks you were not given.
- If a MEASURED RATES block is present, quote those figures as given. Do not calculate a rate
  yourself and do not estimate one that is not listed.

LABEL FORMAT, CRITICAL:
Every label MUST lead with the ACTION VERB, then the justification. Format: "[Verb] [what]: [metric reason]"
- Good: "Activate win-back sequence: 3 churned fans this month"
- Good: "Re-engage 5 inactive fans: 21+ days silent"
- Good: "Gate 'Midnight Drive' behind Silver: RPV up 45%"
- Bad: "Churn rate is rising" (observation, not action)
- Bad: "Consider re-engaging fans" (wishy-washy)`;

export async function generateActions(
  data: ArtistDataForAI,
  extraContext: {
    sequences: { id: string; name: string; trigger_type: string; is_active: boolean }[];
    tiers: { id: string; name: string; price: number }[];
    freeTracks: { id: string; title: string }[];
    gatedTracks: { id: string; title: string }[];
    /** Z4: canonical diagnosis context. Read-only: the manager never ISSUES a recommendation. */
    canonicalBrief?: string | null;
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
