// Live Tips + Tip Goals — shared server/client surface.
// Schema: supabase/schema-phase2-live-tips.sql
//
// A tip is a one-time Stripe Connect charge against the artist's account, the
// same shape as a live ticket. Goals are funded by the running total of PAID
// tips on the session, so nothing here ever counts a pending row.

import type { LiveGoal } from '@/types/live';

/** Quick-pick amounts (cents) shown on the tip control. */
export const TIP_PRESETS_CENTS = [500, 1000, 2500, 5000, 10000] as const;

/** Below $1 the Stripe fee eats the whole tip. */
export const MIN_TIP_CENTS = 100;
/** A fat-finger guard, not a policy limit. Raise deliberately. */
export const MAX_TIP_CENTS = 50000;
/** Tip messages render on stream, so they stay short. */
export const MAX_TIP_MESSAGE_LEN = 140;

/** Is the Live Tips dark-launch flag on? Reads admin_settings.live_tips. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isLiveTipsEnabled(admin: any): Promise<boolean> {
  try {
    const { data } = await admin
      .from('admin_settings')
      .select('value')
      .eq('key', 'live_tips')
      .maybeSingle();
    return !!data?.value?.enabled;
  } catch {
    return false;
  }
}

/**
 * Normalize a client-supplied tip amount to whole cents, or return null if it is
 * not a usable amount. Never trust the browser for money.
 */
export function normalizeTipAmount(input: unknown): number | null {
  const cents = typeof input === 'number' ? Math.round(input) : Number.NaN;
  if (!Number.isFinite(cents)) return null;
  if (cents < MIN_TIP_CENTS || cents > MAX_TIP_CENTS) return null;
  return cents;
}

/** Trim a tip message to what will actually fit on screen. Empty becomes null. */
export function normalizeTipMessage(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().slice(0, MAX_TIP_MESSAGE_LEN);
  return trimmed.length ? trimmed : null;
}

/**
 * The goal the room is currently pushing toward: the cheapest unreached goal.
 * Returns null once every goal is funded (the bar then shows "all unlocked").
 */
export function activeGoal(goals: LiveGoal[], totalCents: number): LiveGoal | null {
  const pending = goals
    .filter((g) => g.is_active && g.metric === 'tips' && totalCents < g.target_amount)
    .sort((a, b) => a.target_amount - b.target_amount || a.sort_order - b.sort_order);
  return pending[0] ?? null;
}

/** 0-100, clamped. Used for the progress bar width. */
export function goalPercent(totalCents: number, targetCents: number): number {
  if (targetCents <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((totalCents / targetCents) * 100)));
}

/** Cents to a compact display string: 2500 -> "$25", 2550 -> "$25.50". */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
