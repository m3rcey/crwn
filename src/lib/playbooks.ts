// AI Playbooks — rule-based (no LLM) multi-step campaign templates. Same spirit as
// the existing rule-based /action-plan: deterministic, data-aware, every generated
// asset requires artist approval before it exists. Executable steps create real
// rows via the systems already built (squads, bounties, city unlocks, missions);
// message/post steps are DRAFTS the artist sends from the existing tools (never
// auto-sent). Tables: supabase/schema-phase2-ai-playbooks.sql

export type PlaybookStepType =
  | 'create_squad' | 'create_bounty' | 'create_city_unlock' | 'create_mission'
  | 'draft_message' | 'draft_post';

export interface GeneratedStep {
  stepType: PlaybookStepType;
  title: string;
  description: string;
  payload: Record<string, any>;
}

export interface PlaybookDef {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  effort: string;
  impact: string;
}

// Data the generator/recommender reasons over (cheap counts).
export interface ArtistSnapshot {
  subscriberCount: number;
  freeCount: number;
  churnedCount: number;
  topCity: string | null;
  latestVodId: string | null;
  latestVodTitle: string | null;
}

export const PLAYBOOKS: PlaybookDef[] = [
  { id: 'first_100', name: 'First 100 Supporters', category: 'Grow', icon: '🔥', description: 'Turn free fans into your first 100 paying supporters.', effort: '~10 min', impact: 'Recurring revenue base' },
  { id: 'live_to_clip', name: 'Weekly Live-to-Clip Machine', category: 'Content', icon: '📡', description: 'Turn a live/VOD into a clip bounty + clipper squad.', effort: '~8 min', impact: 'More reach, more subs' },
  { id: 'city_takeover', name: 'City Takeover', category: 'Local', icon: '📍', description: 'Rally your strongest city to unlock a local moment.', effort: '~10 min', impact: 'Local demand proven' },
  { id: 'clip_push', name: 'Clip-to-Earn Push', category: 'Content', icon: '✂️', description: 'A short, urgent bounty to spike clipping.', effort: '~5 min', impact: 'Short-term sub spike' },
  { id: 'churn_winback', name: 'Churned Fan Winback', category: 'Retain', icon: '↩️', description: 'Re-engage supporters who canceled.', effort: '~7 min', impact: 'Recover lost revenue' },
  { id: 'founder_offer', name: 'Founder Offer Launch', category: 'Grow', icon: '👑', description: 'Launch a founding-supporter push with a squad + mission.', effort: '~8 min', impact: 'Convert high-intent fans' },
];

export const PLAYBOOK_MAP = Object.fromEntries(PLAYBOOKS.map(p => [p.id, p])) as Record<string, PlaybookDef>;

// Recommend a playbook based on the artist's current state. Returns ids best-first.
export function recommendPlaybooks(s: ArtistSnapshot): { id: string; reason: string }[] {
  const recs: { id: string; reason: string }[] = [];
  if (s.subscriberCount < 100) recs.push({ id: 'first_100', reason: `You have ${s.subscriberCount} supporters. Push toward your first 100.` });
  if (s.latestVodId) recs.push({ id: 'live_to_clip', reason: `Your last live "${s.latestVodTitle}" can become clips.` });
  if (s.topCity) recs.push({ id: 'city_takeover', reason: `${s.topCity} is your strongest city.` });
  if (s.churnedCount >= 1) recs.push({ id: 'churn_winback', reason: `${s.churnedCount} supporter${s.churnedCount !== 1 ? 's' : ''} canceled. Win them back.` });
  if (s.freeCount >= 5) recs.push({ id: 'founder_offer', reason: `${s.freeCount} free fans haven't paid yet.` });
  if (recs.length === 0) recs.push({ id: 'clip_push', reason: 'A quick clip bounty keeps momentum up.' });
  return recs;
}

// Generate the concrete, approvable steps for a playbook, prefilled with the
// artist's data. Nothing here writes to the DB — the run/steps API persists them.
export function generatePlaybookSteps(playbookId: string, s: ArtistSnapshot): GeneratedStep[] {
  const city = s.topCity || 'your city';
  switch (playbookId) {
    case 'first_100':
      return [
        { stepType: 'create_squad', title: 'First 100 Supporters squad', description: 'A private squad recognizing your earliest paying believers.', payload: { type: 'first_100', name: 'First 100 Supporters', visibility: 'private' } },
        { stepType: 'create_mission', title: 'Get to 100 supporters', description: 'A visible subscribe mission toward 100.', payload: { type: 'subscribe', title: 'Help us hit 100 supporters', goalCount: 100, rewardType: 'badge', rewardDetail: 'First 100 badge', cta: 'Become a supporter' } },
        { stepType: 'draft_post', title: 'Announcement post', description: 'A community post announcing the push (you post it).', payload: { body: `We're building our first 100 supporters. Every one of you gets the First 100 badge. Let's get there together.` } },
      ];
    case 'live_to_clip':
      return [
        { stepType: 'create_bounty', title: 'Best clip bounty', description: s.latestVodId ? `A best-clip bounty on "${s.latestVodTitle}".` : 'A best-clip bounty (any clip).', payload: { title: s.latestVodTitle ? `Best clip: ${s.latestVodTitle}` : 'Best clip this week', bountyType: 'artist_pick', rewardType: 'badge', rewardDetail: 'Bounty Winner badge', liveSessionId: s.latestVodId } },
        { stepType: 'create_squad', title: 'Top Clippers squad', description: 'Organize your best clippers.', payload: { type: 'top_clippers', name: 'Top Clippers', visibility: 'invite_only' } },
        { stepType: 'create_mission', title: 'Clip-to-Earn mission', description: 'A clip mission tied to your promotion.', payload: { type: 'clip', title: 'Clip the live, earn on the subs you convert', goalCount: 50, rewardType: 'commission', rewardDetail: 'Clip-to-Earn commission', cta: 'Start clipping' } },
      ];
    case 'city_takeover':
      return [
        { stepType: 'create_city_unlock', title: `${city} unlock`, description: `A city unlock for ${city}.`, payload: { title: `${city} Listening Party`, targetCity: s.topCity || '', unlockType: 'event', goalType: 'supporters', goalValue: 50 } },
        { stepType: 'create_squad', title: 'City Captains squad', description: `Fans who lead the ${city} push.`, payload: { type: 'city_captains', name: `${city} Captains`, visibility: 'invite_only', linkedCity: s.topCity } },
        { stepType: 'draft_message', title: `Message to ${city}`, description: 'A draft DM/email to rally the city (you send it).', payload: { channel: 'dm', body: `${city}, this one's for you. Hit the goal and we unlock something special in your city.` } },
      ];
    case 'clip_push':
      return [
        { stepType: 'create_bounty', title: '48-hour clip bounty', description: 'A short, urgent clip bounty.', payload: { title: '48-hour clip sprint', bountyType: 'most_subscribers', rewardType: 'badge', rewardDetail: 'Bounty Winner badge' } },
        { stepType: 'create_mission', title: 'Clip sprint mission', description: 'A clip mission for the sprint.', payload: { type: 'clip', title: 'Clip sprint — 48 hours', goalCount: 25, rewardType: 'commission', rewardDetail: 'Clip-to-Earn commission', cta: 'Clip now' } },
      ];
    case 'churn_winback':
      return [
        { stepType: 'draft_message', title: 'Winback message', description: `A draft message to your ${s.churnedCount} churned supporters (you send it).`, payload: { channel: 'email', subject: 'We saved your spot', body: `We noticed you stepped away. Here's what you've missed. Come back and pick up where you left off.` } },
        { stepType: 'create_mission', title: 'Comeback mission', description: 'A subscribe mission framed as a comeback.', payload: { type: 'subscribe', title: 'Welcome back — resubscribe', goalCount: Math.max(5, s.churnedCount), rewardType: 'points', rewardDetail: 'Comeback perk', cta: 'Come back' } },
      ];
    case 'founder_offer':
      return [
        { stepType: 'create_squad', title: 'Founding supporters squad', description: 'Recognize your founding supporters.', payload: { type: 'first_100', name: 'Founding Supporters', visibility: 'private' } },
        { stepType: 'create_mission', title: 'Founder offer mission', description: 'A subscribe mission for the founder push.', payload: { type: 'subscribe', title: 'Become a founding supporter', goalCount: Math.max(25, s.freeCount), rewardType: 'badge', rewardDetail: 'Founding supporter badge', cta: 'Join as a founder' } },
        { stepType: 'draft_post', title: 'Founder announcement', description: 'A community post announcing the founder offer (you post it).', payload: { body: `Founding supporter spots are open. Get in early and lock in founder status.` } },
      ];
    default:
      return [];
  }
}
