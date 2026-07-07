// "Road To ___" campaign shared types + goal catalog. Multi-goal by design.
// Tables: supabase/schema-phase2-road-campaigns.sql

export type CampaignGoalType = 'money' | 'supporters' | 'rsvps' | 'referrals' | 'shares' | 'votes' | 'custom';
export type CampaignStatus = 'draft' | 'active' | 'reached' | 'archived';
export type CampaignContribution = 'support' | 'rsvp' | 'referral' | 'share' | 'vote' | 'custom';

export interface GoalDef {
  value: CampaignGoalType;
  label: string;
  icon: string;
  isMoney: boolean;
  contribution: CampaignContribution; // the fan action that advances a non-money goal
  cta: string;                        // default CTA label
  unit: string;                       // for the progress line ("supporters", "RSVPs")
  hint: string;
}

export const CAMPAIGN_GOALS: GoalDef[] = [
  { value: 'money', label: 'Money raised', icon: '💰', isMoney: true, contribution: 'support', cta: 'Support', unit: 'raised', hint: 'Fans chip in real money toward a $ goal (funds a video, a release, gear).' },
  { value: 'supporters', label: 'Supporters', icon: '👑', isMoney: false, contribution: 'support', cta: 'Join', unit: 'supporters', hint: 'Rally a number of supporters (e.g. Road to 100 Supporters).' },
  { value: 'rsvps', label: 'RSVPs', icon: '🎟️', isMoney: false, contribution: 'rsvp', cta: 'RSVP', unit: 'RSVPs', hint: 'Gauge who shows up for a show, session, or drop.' },
  { value: 'referrals', label: 'Referrals', icon: '🤝', isMoney: false, contribution: 'referral', cta: 'Invite', unit: 'referrals', hint: 'Fans bring friends toward a goal.' },
  { value: 'shares', label: 'Shares', icon: '📣', isMoney: false, contribution: 'share', cta: 'Share', unit: 'shares', hint: 'Spread the campaign far and wide.' },
  { value: 'votes', label: 'Votes', icon: '🗳️', isMoney: false, contribution: 'vote', cta: 'Vote', unit: 'votes', hint: 'Fans back an idea or make a pick.' },
  { value: 'custom', label: 'Custom', icon: '➕', isMoney: false, contribution: 'custom', cta: 'Support', unit: 'toward goal', hint: 'Your own goal and action.' },
];

export const CAMPAIGN_GOAL_MAP = Object.fromEntries(CAMPAIGN_GOALS.map(g => [g.value, g])) as Record<CampaignGoalType, GoalDef>;

// Format a progress value for display (money -> dollars, else raw count).
export function formatCampaignValue(goalType: CampaignGoalType, value: number): string {
  if (goalType === 'money') return `$${Math.round(value / 100).toLocaleString()}`;
  return value.toLocaleString();
}
