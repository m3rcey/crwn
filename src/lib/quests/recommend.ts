// Next-best-quest recommender. Rule-based (like src/lib/ai/starterNudges.ts) — it
// derives a specific reason from the user's real quest state, no LLM call. Surfaced
// as the "AI Recommended Quest" slot. Upgradeable to a DeepSeek ranking later by
// swapping the pick logic; the reason contract stays the same.

import type { QuestInstance } from './types';

export interface QuestRecommendation {
  questId: string;
  templateKey: string | null;
  title: string;
  reason: string;
}

const OPEN = ['available', 'active', 'in_progress', 'ready_to_complete'];

export function recommendNextQuest(quests: QuestInstance[]): QuestRecommendation | null {
  const open = quests.filter((q) => OPEN.includes(q.status));
  if (open.length === 0) return null;

  // 1. Something already underway → nudge to finish it (highest progress first).
  const inProgress = open
    .filter((q) => q.progress_percent > 0 && q.progress_percent < 100)
    .sort((a, b) => b.progress_percent - a.progress_percent)[0];
  if (inProgress) {
    return {
      questId: inProgress.id,
      templateKey: inProgress.template_key,
      title: inProgress.title,
      reason: `You're ${inProgress.progress_percent}% of the way through this — finishing it now keeps your momentum.`,
    };
  }

  // 2. Highest-priority headline quest (main/boss), else highest-priority anything.
  const byPriority = [...open].sort((a, b) => b.priority_score - a.priority_score);
  const headline =
    byPriority.find((q) => ['main_quest', 'boss_quest', 'onboarding_quest'].includes(q.quest_type)) || byPriority[0];

  return {
    questId: headline.id,
    templateKey: headline.template_key,
    title: headline.title,
    reason: headline.why_it_matters || headline.subtitle || 'This is your highest-impact next move right now.',
  };
}
