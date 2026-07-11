// Next-best-quest recommender. Rule-based (like src/lib/ai/starterNudges.ts) — it
// derives a specific reason from the user's real quest state, no LLM call. Surfaced
// as the "AI Recommended Quest" slot. Upgradeable to a DeepSeek ranking later by
// swapping the pick logic; the reason contract stays the same.

import type { QuestInstance } from './types';
import { getArtistBuild } from './builds';

export interface QuestRecommendation {
  questId: string;
  templateKey: string | null;
  title: string;
  reason: string;
}

const OPEN = ['available', 'active', 'in_progress', 'ready_to_complete'];

// The main-quest spine is build-AGNOSTIC (every artist walks the same path). Builds
// only re-weight OPTIONAL side quests, using the canonical ArtistBuild.priorityCategories
// (src/lib/quests/builds.ts). A build never hides a quest — it only boosts emphasis.
export function recommendNextQuest(
  quests: QuestInstance[],
  buildPrimary?: string | null,
): QuestRecommendation | null {
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
      reason: `You're ${inProgress.progress_percent}% of the way through this. Finishing it now keeps your momentum.`,
    };
  }

  // 2. Headline main/boss quest always wins (shared spine). Never branch the spine.
  const byPriority = [...open].sort((a, b) => b.priority_score - a.priority_score);
  const headline = byPriority.find((q) => ['main_quest', 'boss_quest', 'onboarding_quest'].includes(q.quest_type));
  if (headline) {
    return {
      questId: headline.id,
      templateKey: headline.template_key,
      title: headline.title,
      reason: headline.why_it_matters || headline.subtitle || 'This is your highest-impact next move right now.',
    };
  }

  // 3. No main/boss open → recommend a SIDE quest, biased to the artist's build.
  const build = getArtistBuild(buildPrimary);
  const priorityCats = new Set(build?.priorityCategories ?? []);
  const pick =
    (priorityCats.size ? byPriority.find((q) => priorityCats.has(q.category)) : undefined) || byPriority[0];

  return {
    questId: pick.id,
    templateKey: pick.template_key,
    title: pick.title,
    reason:
      build && priorityCats.has(pick.category)
        ? `A strong fit for your ${build.title} path. ${pick.why_it_matters || pick.subtitle || ''}`.trim()
        : pick.why_it_matters || pick.subtitle || 'A good optional move to keep building momentum.',
  };
}
