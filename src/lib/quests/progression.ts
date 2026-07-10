// Quest Engine — progression rules (XP → level, streaks). Pure functions, no I/O.
// Rule-based, mirroring the hardcoded thresholds in src/lib/milestones.ts and the
// starter-nudge approach in src/lib/ai/starterNudges.ts.

import type { QuestRole } from './types';

// Cumulative XP required to REACH each level/stage (index 0 = level 1 = 0 XP).
// Artist has 10 levels; fan has 8 stages. The curve is deliberately gentle early
// (a new artist/fan should feel motion fast) and steeper later.
const ARTIST_LEVEL_XP = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6200, 8500];
const FAN_STAGE_XP = [0, 100, 300, 650, 1100, 1700, 2500, 3600];

export const ARTIST_LEVEL_KEYS = [
  'setup',
  'first_supporters',
  'campaign_starter',
  'fan_activation',
  'promotion_engine',
  'live_movement',
  'team_builder',
  'city_builder',
  'movement_os',
  'full_movement',
] as const;

export const ARTIST_LEVEL_TITLES: Record<string, string> = {
  setup: 'Setup',
  first_supporters: 'First Supporters',
  campaign_starter: 'Campaign Starter',
  fan_activation: 'Fan Activation',
  promotion_engine: 'Promotion Engine',
  live_movement: 'Live Movement',
  team_builder: 'Team Builder',
  city_builder: 'City Builder',
  movement_os: 'Movement OS',
  full_movement: 'Full Movement',
};

export const FAN_STAGE_KEYS = [
  'discover',
  'support',
  'participate',
  'promote',
  'clip',
  'influence',
  'lead',
  'legacy',
] as const;

export const FAN_STAGE_TITLES: Record<string, string> = {
  discover: 'Discover',
  support: 'Support',
  participate: 'Participate',
  promote: 'Promote',
  clip: 'Clip',
  influence: 'Influence',
  lead: 'Lead',
  legacy: 'Legacy',
};

function thresholds(role: QuestRole): number[] {
  return role === 'artist' ? ARTIST_LEVEL_XP : FAN_STAGE_XP;
}

function levelKeys(role: QuestRole): readonly string[] {
  return role === 'artist' ? ARTIST_LEVEL_KEYS : FAN_STAGE_KEYS;
}

export interface LevelState {
  level: number; // 1-based
  levelKey: string;
  levelTitle: string;
  xpIntoLevel: number;
  xpForNextLevel: number | null; // null at max level
  percentToNext: number; // 0-100 (100 at max)
  isMax: boolean;
}

/** Resolve total XP into a level/stage for the given role. */
export function levelFromXp(role: QuestRole, xp: number): LevelState {
  const t = thresholds(role);
  const keys = levelKeys(role);
  const titles = role === 'artist' ? ARTIST_LEVEL_TITLES : FAN_STAGE_TITLES;

  let level = 1;
  for (let i = 0; i < t.length; i++) {
    if (xp >= t[i]) level = i + 1;
    else break;
  }
  const idx = level - 1;
  const isMax = level >= t.length;
  const floor = t[idx];
  const ceil = isMax ? null : t[idx + 1];
  const xpIntoLevel = xp - floor;
  const xpForNextLevel = ceil === null ? null : ceil - floor;
  const percentToNext =
    xpForNextLevel === null || xpForNextLevel === 0
      ? 100
      : Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100));

  const levelKey = keys[idx];
  return {
    level,
    levelKey,
    levelTitle: titles[levelKey] ?? levelKey,
    xpIntoLevel,
    xpForNextLevel,
    percentToNext,
    isMax,
  };
}

/** Did adding `delta` XP cross a level boundary? */
export function didLevelUp(role: QuestRole, oldXp: number, newXp: number): boolean {
  return levelFromXp(role, newXp).level > levelFromXp(role, oldXp).level;
}

// ---- Streaks ----

const DAY_MS = 24 * 60 * 60 * 1000;

function toUTCDate(d: string): number {
  // 'YYYY-MM-DD' → UTC-midnight ms. Avoids timezone drift in day math.
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

export interface StreakUpdate {
  streakCount: number;
  longestStreak: number;
  lastActiveDate: string;
  advanced: boolean; // true if this activity extended (or started) a streak today
}

/**
 * Compute the new streak given the previous streak state and today's date
 * ('YYYY-MM-DD', caller-supplied to stay pure — Date.now() is banned in some contexts).
 * Same-day activity is a no-op; consecutive day extends; a gap resets to 1.
 */
export function updateStreak(
  prev: { streakCount: number; longestStreak: number; lastActiveDate: string | null },
  today: string,
): StreakUpdate {
  const longest = prev.longestStreak ?? 0;
  if (!prev.lastActiveDate) {
    return { streakCount: 1, longestStreak: Math.max(1, longest), lastActiveDate: today, advanced: true };
  }
  const gapDays = Math.round((toUTCDate(today) - toUTCDate(prev.lastActiveDate)) / DAY_MS);
  if (gapDays <= 0) {
    // same day (or clock skew) — no change
    return {
      streakCount: prev.streakCount,
      longestStreak: longest,
      lastActiveDate: prev.lastActiveDate,
      advanced: false,
    };
  }
  if (gapDays === 1) {
    const streak = prev.streakCount + 1;
    return { streakCount: streak, longestStreak: Math.max(longest, streak), lastActiveDate: today, advanced: true };
  }
  // gap > 1 day → reset
  return { streakCount: 1, longestStreak: Math.max(longest, 1), lastActiveDate: today, advanced: true };
}
